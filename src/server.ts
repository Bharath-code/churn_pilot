import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { config } from './config.js';
import { destroySession, getSession } from './core/auth/session.js';
import { stripeOAuthRoutes } from './core/ingest/billing.js';
import { type Founder, supabase } from './lib/supabase.js';

const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', cors());

// Health check
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ============================================
// Public Routes
// ============================================

// Landing page
app.get('/', serveStatic({ path: './public/index.html' }));

// Audit page (Lead Magnet)
app.get('/audit', serveStatic({ path: './public/audit.html' }));

// Signup with Stripe API key (TrustMRR style)
app.post('/api/signup', async (c) => {
  try {
    const body = await c.req.json();
    const { email, company, stripe_api_key } = body;

    // Validate required fields
    if (!email || !company || !stripe_api_key) {
      return c.json({ error: 'Email, company, and Stripe API key are required' }, 400);
    }

    // Validate API key format
    if (!stripe_api_key.match(/^(rk_live_|rk_test_|sk_live_|sk_test_)/)) {
      return c.json({ error: 'Invalid Stripe API key format' }, 400);
    }

    // Test the API key by making a simple Stripe request
    const Stripe = (await import('stripe')).default;
    const testStripe = new Stripe(stripe_api_key);

    try {
      await testStripe.customers.list({ limit: 1 });
    } catch (stripeErr) {
      return c.json({ error: 'Invalid Stripe API key. Please check and try again.' }, 400);
    }

    // Calculate trial end date (7 days from now)
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 7);

    // Upsert founder by email
    const { data: founder, error: upsertError } = await supabase
      .from('founders')
      .upsert(
        {
          email,
          company,
          plan: 'trial',
          trial_ends_at: trialEndsAt.toISOString(),
          service_paused: false,
          stripe_api_key,
        },
        { onConflict: 'email' },
      )
      .select('id')
      .single();

    if (upsertError || !founder) {
      console.error('Failed to create founder:', upsertError);
      return c.json({ error: 'Failed to create account' }, 500);
    }

    const founderId = (founder as { id: string }).id;

    // Create session
    const { createSession } = await import('./core/auth/session.js');
    createSession(c, founderId);

    // Trigger initial sync
    const { syncBillingData } = await import('./core/ingest/billing.js');
    await syncBillingData(founderId, stripe_api_key);

    return c.json({ success: true, founderId });
  } catch (err) {
    console.error('Signup error:', err);
    return c.json({ error: 'Failed to create account' }, 500);
  }
});

// ============================================
// One-Time Risk Audit (Lead Magnet - Public)
// ============================================
app.post('/api/audit', async (c) => {
  try {
    const body = await c.req.json();
    const { email, stripe_api_key, company } = body;

    // Validate required fields
    if (!email || !stripe_api_key) {
      return c.json({ error: 'Email and Stripe API key are required' }, 400);
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return c.json({ error: 'Invalid email format' }, 400);
    }

    // Validate API key format
    if (!stripe_api_key.match(/^(rk_live_|rk_test_|sk_live_|sk_test_)/)) {
      return c.json({ error: 'Invalid Stripe API key format' }, 400);
    }

    // Run audit
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

// Stripe OAuth routes (legacy, kept for backward compat)
app.route('/api/stripe/oauth', stripeOAuthRoutes);

// ============================================
// Protected Routes
// ============================================

// Dashboard page (protected via client-side redirect)
app.get('/dashboard', serveStatic({ path: './public/dashboard.html' }));

// Get account data (protected)
app.get('/api/account', async (c) => {
  const founderId = getSession(c);

  if (!founderId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const { data: founder, error } = await supabase
    .from('founders')
    .select(
      'email, company, plan, trial_ends_at, service_paused, stripe_api_key, stripe_account_id',
    )
    .eq('id', founderId)
    .single();

  if (error || !founder) {
    return c.json({ error: 'Account not found' }, 404);
  }

  return c.json(founder as Founder);
});

// Toggle pause service
app.post('/api/account/toggle-pause', async (c) => {
  const founderId = getSession(c);

  if (!founderId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // Get current state
  const { data: founder, error: fetchError } = await supabase
    .from('founders')
    .select('service_paused')
    .eq('id', founderId)
    .single();

  if (fetchError || !founder) {
    return c.json({ error: 'Account not found' }, 404);
  }

  const currentState = (founder as { service_paused: boolean }).service_paused;

  // Toggle state
  const { error: updateError } = await supabase
    .from('founders')
    .update({ service_paused: !currentState })
    .eq('id', founderId);

  if (updateError) {
    return c.json({ error: 'Failed to update' }, 500);
  }

  return c.json({ service_paused: !currentState });
});

// Disconnect Stripe
app.post('/api/stripe/disconnect', async (c) => {
  const founderId = getSession(c);

  if (!founderId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const { error } = await supabase
    .from('founders')
    .update({
      stripe_access_token: null,
      stripe_refresh_token: null,
      stripe_account_id: null,
    })
    .eq('id', founderId);

  if (error) {
    return c.json({ error: 'Failed to disconnect' }, 500);
  }

  return c.json({ success: true });
});

// ============================================
// Payment Routes (DodoPayments)
// ============================================

// Create checkout session for Pro upgrade
app.post('/api/payments/checkout', async (c) => {
  const founderId = getSession(c);

  if (!founderId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // Get founder email
  const { data: founder, error: fetchError } = await supabase
    .from('founders')
    .select('email')
    .eq('id', founderId)
    .single();

  if (fetchError || !founder) {
    return c.json({ error: 'Account not found' }, 404);
  }

  const email = (founder as { email: string }).email;

  // Import dynamically to avoid issues if DODO_API_KEY not set
  const { createCheckoutSession } = await import('./core/payments/dodo.js');
  const result = await createCheckoutSession(founderId, email);

  if ('error' in result) {
    return c.json({ error: result.error }, 500);
  }

  return c.json({ checkoutUrl: result.checkoutUrl });
});

// DodoPayments webhook handler
app.post('/api/payments/webhook', async (c) => {
  try {
    const body = await c.req.text();
    const signature = c.req.header('x-dodo-signature') || '';

    // Verify signature
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

// ============================================
// Email Trigger Routes
// ============================================

// Send weekly digest (manual trigger)
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

// Get email preview (for testing without sending)
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

// Logout
app.post('/api/auth/logout', (c) => {
  destroySession(c);
  return c.json({ success: true });
});

// ============================================
// Static files
// ============================================
app.use('/public/*', serveStatic({ root: './' }));

// 404 handler
app.notFound((c) => c.json({ error: 'Not Found' }, 404));

// Error handler
app.onError((err, c) => {
  console.error('Server error:', err);
  return c.json({ error: 'Internal Server Error' }, 500);
});

// Start server
console.log(`🚀 ChurnPilot server starting on port ${config.PORT}`);
serve({
  fetch: app.fetch,
  port: config.PORT,
});
