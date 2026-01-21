import { Hono } from 'hono';
import Stripe from 'stripe';
import { config } from '../../config.js';
import { api, convex } from '../../lib/convex.js';

export const stripeOAuthRoutes = new Hono();

const stripe = config.STRIPE_CLIENT_SECRET ? new Stripe(config.STRIPE_CLIENT_SECRET) : null;

function getOAuthUrl(founderId: string): string | null {
  if (!config.STRIPE_CLIENT_ID) {
    return null;
  }

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.STRIPE_CLIENT_ID,
    scope: 'read_only',
    redirect_uri: `${config.BASE_URL}/api/stripe/oauth/callback`,
    state: founderId,
  });

  return `https://connect.stripe.com/oauth/authorize?${params.toString()}`;
}

stripeOAuthRoutes.get('/start', async (c) => {
  if (!config.STRIPE_CLIENT_ID || !config.STRIPE_CLIENT_SECRET) {
    return c.json({ error: 'OAuth not configured. Use the signup form instead.' }, 400);
  }

  const founderId = c.req.query('founder_id');

  if (!founderId) {
    return c.json({ error: 'founder_id is required' }, 400);
  }

  const founder = await convex.query(api.founders.getFounderById, { id: founderId });

  if (!founder) {
    return c.json({ error: 'Founder not found' }, 404);
  }

  const url = getOAuthUrl(founderId);
  if (!url) {
    return c.json({ error: 'OAuth not configured' }, 400);
  }

  return c.redirect(url);
});

stripeOAuthRoutes.get('/callback', async (c) => {
  const code = c.req.query('code');
  const errorParam = c.req.query('error');
  const errorDescription = c.req.query('error_description');

  if (errorParam) {
    console.error('Stripe OAuth error:', errorParam, errorDescription);
    return c.redirect(`/?error=${encodeURIComponent(errorDescription || 'Connection failed')}`);
  }

  if (!code) {
    return c.redirect('/?error=Missing+authorization+code');
  }

  try {
    if (!stripe) {
      throw new Error('Stripe OAuth not configured');
    }
    const response = await stripe.oauth.token({
      grant_type: 'authorization_code',
      code,
    });

    const { access_token, refresh_token, stripe_user_id } = response;

    if (!access_token || !stripe_user_id) {
      throw new Error('No access token received');
    }

    const connectedStripe = new Stripe(access_token);
    const account = await connectedStripe.accounts.retrieve(stripe_user_id);

    const email = account.email || `${stripe_user_id}@stripe.account`;
    const company =
      account.business_profile?.name || account.settings?.dashboard?.display_name || 'My Company';

    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 7);

    const founderId = await convex.mutation(api.founders.createFounder, {
      email,
      company,
      plan: 'trial',
      trial_ends_at: trialEndsAt.toISOString(),
      service_paused: false,
      stripe_access_token: access_token,
      stripe_refresh_token: refresh_token,
      stripe_account_id: stripe_user_id,
    });

    const { createSession } = await import('../auth/session.js');
    createSession(c, founderId as string);

    await syncBillingData(founderId as string, access_token);

    return c.redirect('/dashboard');
  } catch (err) {
    console.error('OAuth token exchange failed:', err);
    return c.redirect('/?error=Connection+failed.+Please+try+again.');
  }
});

function normalizeBillingStatus(
  subscription: Stripe.Subscription,
): 'ACTIVE' | 'PAYMENT_FAILED' | 'CANCELING' | 'CANCELED' {
  if (subscription.cancel_at_period_end) {
    return 'CANCELING';
  }

  switch (subscription.status) {
    case 'active':
    case 'trialing':
      return 'ACTIVE';
    case 'past_due':
    case 'unpaid':
      return 'PAYMENT_FAILED';
    case 'canceled':
    case 'incomplete_expired':
      return 'CANCELED';
    default:
      return 'PAYMENT_FAILED';
  }
}

export async function refreshStripeToken(founderId: string): Promise<string | null> {
  const founder = await convex.query(api.founders.getFounderById, { id: founderId });

  if (!founder) {
    console.error('Failed to fetch founder for token refresh');
    return null;
  }

  const refreshToken = (founder as { stripe_refresh_token: string | null }).stripe_refresh_token;

  if (!refreshToken) {
    console.error('No refresh token stored for founder:', founderId);
    return null;
  }

  try {
    if (!stripe) {
      console.error('Stripe OAuth not configured');
      return null;
    }
    const response = await stripe.oauth.token({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });

    const { access_token, refresh_token: newRefreshToken } = response;

    if (!access_token) {
      console.error('No access token in refresh response');
      return null;
    }

    await convex.mutation(api.founders.updateFounder, {
      id: founderId,
      updates: {
        stripe_access_token: access_token,
        ...(newRefreshToken && { stripe_refresh_token: newRefreshToken }),
      },
    });

    console.log(`Refreshed Stripe token for founder ${founderId}`);
    return access_token;
  } catch (err) {
    console.error('Token refresh failed:', err);
    return null;
  }
}

export async function getValidAccessToken(founderId: string): Promise<string | null> {
  const founder = await convex.query(api.founders.getFounderWithStripeToken, { id: founderId });

  if (!founder) {
    console.error('Failed to fetch founder');
    return null;
  }

  const token = (founder as { token?: string | null }).token;

  if (token) {
    return token;
  }

  return refreshStripeToken(founderId);
}

export async function syncBillingData(founderId: string, accessToken?: string): Promise<void> {
  let token = accessToken;
  if (!token) {
    token = (await getValidAccessToken(founderId)) ?? undefined;
    if (!token) {
      throw new Error('No valid Stripe token available. User must re-authenticate.');
    }
  }

  const connectedStripe = new Stripe(token);

  try {
    const subscriptions = await connectedStripe.subscriptions.list({
      status: 'all',
      limit: 100,
      expand: ['data.customer', 'data.latest_invoice'],
    });

    for (const subscription of subscriptions.data) {
      const customer = subscription.customer as Stripe.Customer;

      if (customer.deleted) continue;

      const mrr = subscription.items.data.reduce((total, item) => {
        const price = item.price;
        if (!price.unit_amount) return total;

        if (price.recurring?.interval === 'year') {
          return total + price.unit_amount / 12 / 100;
        }
        return total + price.unit_amount / 100;
      }, 0);

      await convex.mutation(api.accounts.upsertAccount, {
        founderId,
        email: customer.email || 'unknown@example.com',
        name: customer.name || customer.email || 'Unknown',
        mrr,
        billing_status: normalizeBillingStatus(subscription),
        cancel_at_period_end: subscription.cancel_at_period_end,
        stripe_customer_id: customer.id,
        stripe_subscription_id: subscription.id,
      });
    }

    console.log(`Synced ${subscriptions.data.length} subscriptions for founder ${founderId}`);
  } catch (err) {
    if (err instanceof Error && err.message.includes('Invalid API Key')) {
      console.log('Token expired, attempting refresh...');

      const newToken = await refreshStripeToken(founderId);
      if (newToken) {
        return syncBillingData(founderId, newToken);
      }

      throw new Error('Stripe token expired and refresh failed. User must re-authenticate.');
    }

    console.error('Billing sync failed:', err);
    throw err;
  }
}
