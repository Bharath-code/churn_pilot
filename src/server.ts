import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { config } from './config.js';
import { destroySession, getSession } from './core/auth/session.js';
import { stripeOAuthRoutes } from './core/ingest/billing.js';
import { api, convex } from './lib/convex.js';

const app = new Hono();

app.use('*', logger());
app.use('*', cors());

app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.get('/', serveStatic({ path: './public/index.html' }));
app.get('/audit', serveStatic({ path: './public/audit.html' }));

app.post('/api/signup', async (c) => {
  try {
    const body = await c.req.json();
    const { email, company, stripe_api_key } = body;

    if (!email || !company || !stripe_api_key) {
      return c.json({ error: 'Email, company, and Stripe API key are required' }, 400);
    }

    if (!stripe_api_key.match(/^(rk_live_|rk_test_|sk_live_|sk_test_)/)) {
      return c.json({ error: 'Invalid Stripe API key format' }, 400);
    }

    const Stripe = (await import('stripe')).default;
    const testStripe = new Stripe(stripe_api_key);

    try {
      await testStripe.customers.list({ limit: 1 });
    } catch {
      return c.json({ error: 'Invalid Stripe API key. Please check and try again.' }, 400);
    }

    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 7);

    const founderId = await convex.mutation(api.founders.createFounder, {
      email,
      company,
      plan: 'trial',
      trial_ends_at: trialEndsAt.toISOString(),
      service_paused: false,
      stripe_api_key,
    });

    const { createSession } = await import('./core/auth/session.js');
    createSession(c, founderId as string);

    const { syncBillingData } = await import('./core/ingest/billing.js');
    await syncBillingData(founderId as string, stripe_api_key);

    return c.json({ success: true, founderId });
  } catch (err) {
    console.error('Signup error:', err);
    return c.json({ error: 'Failed to create account' }, 500);
  }
});

app.post('/api/audit', async (c) => {
  try {
    const body = await c.req.json();
    const { email, stripe_api_key, company } = body;

    if (!email || !stripe_api_key) {
      return c.json({ error: 'Email and Stripe API key are required' }, 400);
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return c.json({ error: 'Invalid email format' }, 400);
    }

    if (!stripe_api_key.match(/^(rk_live_|rk_test_|sk_live_|sk_test_)/)) {
      return c.json({ error: 'Invalid Stripe API key format' }, 400);
    }

    const { runAudit } = await import('./core/email/audit.js');
    const result = await runAudit(email, stripe_api_key, company);

    if (!result.success) {
      return c.json({ error: result.error }, 400);
    }

    return c.json({
      success: true,
      atRiskCount: result.atRiskCount,
      mrrAtRisk: result.totalMrrAtRisk,
      message: `Audit sent! Check ${email} for your report.`,
    });
  } catch (err) {
    console.error('Audit error:', err);
    return c.json({ error: 'Failed to run audit' }, 500);
  }
});

app.route('/api/stripe/oauth', stripeOAuthRoutes);

app.get('/dashboard', serveStatic({ path: './public/dashboard.html' }));

app.get('/api/account', async (c) => {
  const founderId = getSession(c);

  if (!founderId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const founder = await convex.query(api.founders.getFounderById, { id: founderId });

  if (!founder) {
    return c.json({ error: 'Account not found' }, 404);
  }

  const { _id, token, ...rest } = founder as { _id: string; token?: string | null } & Record<
    string,
    unknown
  >;
  return c.json(rest);
});

app.post('/api/account/toggle-pause', async (c) => {
  const founderId = getSession(c);

  if (!founderId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const founder = await convex.query(api.founders.getFounderById, { id: founderId });

  if (!founder) {
    return c.json({ error: 'Account not found' }, 404);
  }

  const currentState = (founder as { service_paused: boolean }).service_paused;

  await convex.mutation(api.founders.updateFounder, {
    id: founderId,
    updates: { service_paused: !currentState },
  });

  return c.json({ service_paused: !currentState });
});

app.post('/api/stripe/disconnect', async (c) => {
  const founderId = getSession(c);

  if (!founderId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  await convex.mutation(api.founders.disconnectStripe, { id: founderId });

  return c.json({ success: true });
});

app.post('/api/payments/checkout', async (c) => {
  const founderId = getSession(c);

  if (!founderId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const founder = await convex.query(api.founders.getFounderById, { id: founderId });

  if (!founder) {
    return c.json({ error: 'Account not found' }, 404);
  }

  const email = (founder as { email: string }).email;

  const { createCheckoutSession } = await import('./core/payments/dodo.js');
  const result = await createCheckoutSession(founderId, email);

  if ('error' in result) {
    return c.json({ error: result.error }, 500);
  }

  return c.json({ checkoutUrl: result.checkoutUrl });
});

app.post('/api/payments/webhook', async (c) => {
  try {
    const body = await c.req.text();
    const signature = c.req.header('x-dodo-signature') || '';

    const { verifyWebhookSignature, handleWebhookEvent } = await import('./core/payments/dodo.js');

    if (!verifyWebhookSignature(body, signature)) {
      return c.json({ error: 'Invalid signature' }, 401);
    }

    const payload = JSON.parse(body);
    const eventType = payload.type || payload.event_type;

    await handleWebhookEvent(eventType, payload);

    return c.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return c.json({ error: 'Webhook processing failed' }, 500);
  }
});

app.post('/api/trigger/weekly-email', async (c) => {
  const founderId = getSession(c);

  if (!founderId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const { sendWeeklyDigest } = await import('./core/email/weekly.js');
    const result = await sendWeeklyDigest(founderId);

    if (!result.success) {
      return c.json({ error: result.error || 'Failed to send email' }, 500);
    }

    return c.json({
      success: true,
      emailId: result.emailId,
      riskCount: result.riskCount,
      accountCount: result.accountCount,
      message:
        result.riskCount > 0
          ? `Report sent with ${result.riskCount} at-risk accounts`
          : 'No at-risk accounts found, no email sent',
    });
  } catch (error) {
    console.error('Email trigger error:', error);
    return c.json({ error: 'Failed to trigger email' }, 500);
  }
});

app.get('/api/preview/weekly-email', async (c) => {
  const founderId = getSession(c);

  if (!founderId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const { getDigestPreview } = await import('./core/email/weekly.js');
    const preview = await getDigestPreview(founderId);

    return c.json(preview);
  } catch (error) {
    console.error('Preview error:', error);
    return c.json({ error: 'Failed to generate preview' }, 500);
  }
});

app.post('/api/auth/logout', (c) => {
  destroySession(c);
  return c.json({ success: true });
});

app.use('/public/*', serveStatic({ root: './' }));

app.notFound((c) => c.json({ error: 'Not Found' }, 404));

app.onError((err, c) => {
  console.error('Server error:', err);
  return c.json({ error: 'Internal Server Error' }, 500);
});

console.log(`🚀 ChurnPilot server starting on port ${config.PORT}`);
serve({
  fetch: app.fetch,
  port: config.PORT,
});
