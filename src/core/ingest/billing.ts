import { Hono } from 'hono';
import Stripe from 'stripe';
import { config } from '../../config.js';
import { supabase } from '../../lib/supabase.js';

export const stripeOAuthRoutes = new Hono();

// Initialize Stripe client (for OAuth token exchange) - only if credentials are configured
const stripe = config.STRIPE_CLIENT_SECRET ? new Stripe(config.STRIPE_CLIENT_SECRET) : null;

/**
 * Generate Stripe OAuth authorization URL
 */
function getOAuthUrl(founderId: string): string | null {
  if (!config.STRIPE_CLIENT_ID) {
    return null;
  }

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.STRIPE_CLIENT_ID,
    scope: 'read_only',
    redirect_uri: `${config.BASE_URL}/api/stripe/oauth/callback`,
    state: founderId, // Pass founder ID to identify user on callback
  });

  return `https://connect.stripe.com/oauth/authorize?${params.toString()}`;
}

/**
 * OAuth Start - Redirect to Stripe Connect authorization
 */
stripeOAuthRoutes.get('/start', async (c) => {
  // Check if OAuth is configured
  if (!config.STRIPE_CLIENT_ID || !config.STRIPE_CLIENT_SECRET) {
    return c.json({ error: 'OAuth not configured. Use the signup form instead.' }, 400);
  }

  const founderId = c.req.query('founder_id');

  if (!founderId) {
    return c.json({ error: 'founder_id is required' }, 400);
  }

  // Verify founder exists
  const { data: founder, error } = await supabase
    .from('founders')
    .select('id')
    .eq('id', founderId)
    .single();

  if (error || !founder) {
    return c.json({ error: 'Founder not found' }, 404);
  }

  const url = getOAuthUrl(founderId);
  if (!url) {
    return c.json({ error: 'OAuth not configured' }, 400);
  }

  return c.redirect(url);
});

/**
 * OAuth Callback - Exchange code for access token and auto-create founder
 */
stripeOAuthRoutes.get('/callback', async (c) => {
  const code = c.req.query('code');
  const errorParam = c.req.query('error');
  const errorDescription = c.req.query('error_description');

  // Handle OAuth errors
  if (errorParam) {
    console.error('Stripe OAuth error:', errorParam, errorDescription);
    return c.redirect(`/?error=${encodeURIComponent(errorDescription || 'Connection failed')}`);
  }

  if (!code) {
    return c.redirect('/?error=Missing+authorization+code');
  }

  try {
    // Exchange authorization code for access token
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

    // Fetch the Stripe account to get email and business name
    const connectedStripe = new Stripe(access_token);
    const account = await connectedStripe.accounts.retrieve(stripe_user_id);

    const email = account.email || `${stripe_user_id}@stripe.account`;
    const company =
      account.business_profile?.name || account.settings?.dashboard?.display_name || 'My Company';

    // Calculate trial end date (7 days from now)
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 7);

    // Upsert founder by email (creates new or updates existing)
    const { data: founder, error: upsertError } = await supabase
      .from('founders')
      .upsert(
        {
          email,
          company,
          plan: 'trial',
          trial_ends_at: trialEndsAt.toISOString(),
          service_paused: false,
          stripe_access_token: access_token,
          stripe_refresh_token: refresh_token,
          stripe_account_id: stripe_user_id,
        },
        {
          onConflict: 'email',
        },
      )
      .select('id')
      .single();

    if (upsertError || !founder) {
      console.error('Failed to upsert founder:', upsertError);
      throw new Error('Failed to create account');
    }

    const founderId = (founder as { id: string }).id;

    // Create session
    const { createSession } = await import('../auth/session.js');
    createSession(c, founderId);

    // Trigger initial sync
    await syncBillingData(founderId, access_token);

    // Redirect to dashboard
    return c.redirect('/dashboard');
  } catch (err) {
    console.error('OAuth token exchange failed:', err);
    return c.redirect('/?error=Connection+failed.+Please+try+again.');
  }
});

/**
 * Normalize Stripe subscription status to our billing_status enum
 */
function normalizeBillingStatus(
  subscription: Stripe.Subscription,
): 'ACTIVE' | 'PAYMENT_FAILED' | 'CANCELING' | 'CANCELED' {
  // Check for pending cancellation first
  if (subscription.cancel_at_period_end) {
    return 'CANCELING';
  }

  // Check subscription status
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

/**
 * Refresh Stripe access token using the stored refresh token.
 * Returns the new access token, or null if refresh failed (user must re-authenticate).
 */
export async function refreshStripeToken(founderId: string): Promise<string | null> {
  // Fetch the founder's refresh token
  const { data: founder, error: fetchError } = await supabase
    .from('founders')
    .select('stripe_refresh_token')
    .eq('id', founderId)
    .single();

  if (fetchError || !founder) {
    console.error('Failed to fetch founder for token refresh:', fetchError);
    return null;
  }

  const refreshToken = (founder as { stripe_refresh_token: string | null }).stripe_refresh_token;

  if (!refreshToken) {
    console.error('No refresh token stored for founder:', founderId);
    return null;
  }

  try {
    // Use Stripe OAuth to refresh the token
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

    // Update tokens in database
    const { error: updateError } = await supabase
      .from('founders')
      .update({
        stripe_access_token: access_token,
        // Stripe may or may not return a new refresh token
        ...(newRefreshToken && { stripe_refresh_token: newRefreshToken }),
      })
      .eq('id', founderId);

    if (updateError) {
      console.error('Failed to update tokens after refresh:', updateError);
      // Still return the token since it's valid
    }

    console.log(`Refreshed Stripe token for founder ${founderId}`);
    return access_token;
  } catch (err) {
    console.error('Token refresh failed:', err);
    // Refresh token may be revoked - user needs to re-authenticate
    return null;
  }
}

/**
 * Get a valid access token for a founder.
 * Supports both direct API key (stripe_api_key) and OAuth tokens (stripe_access_token).
 */
export async function getValidAccessToken(founderId: string): Promise<string | null> {
  // Fetch current tokens
  const { data: founder, error } = await supabase
    .from('founders')
    .select('stripe_api_key, stripe_access_token')
    .eq('id', founderId)
    .single();

  if (error || !founder) {
    console.error('Failed to fetch founder:', error);
    return null;
  }

  const founderData = founder as {
    stripe_api_key: string | null;
    stripe_access_token: string | null;
  };

  // Prefer direct API key (new TrustMRR-style flow)
  if (founderData.stripe_api_key) {
    return founderData.stripe_api_key;
  }

  // Fall back to OAuth token (legacy flow)
  if (founderData.stripe_access_token) {
    return founderData.stripe_access_token;
  }

  // No token stored, try to refresh OAuth token
  return refreshStripeToken(founderId);
}

/**
 * Sync billing data from Stripe to accounts table.
 * Automatically refreshes token if expired.
 */
export async function syncBillingData(founderId: string, accessToken?: string): Promise<void> {
  // Get token if not provided
  let token = accessToken;
  if (!token) {
    token = (await getValidAccessToken(founderId)) ?? undefined;
    if (!token) {
      throw new Error('No valid Stripe token available. User must re-authenticate.');
    }
  }

  // Create Stripe client with connected account's token
  const connectedStripe = new Stripe(token);

  try {
    // Fetch all active subscriptions
    const subscriptions = await connectedStripe.subscriptions.list({
      status: 'all',
      limit: 100,
      expand: ['data.customer', 'data.latest_invoice'],
    });

    for (const subscription of subscriptions.data) {
      const customer = subscription.customer as Stripe.Customer;

      // Skip deleted customers
      if (customer.deleted) continue;

      // Calculate MRR from subscription items
      const mrr = subscription.items.data.reduce((total, item) => {
        const price = item.price;
        if (!price.unit_amount) return total;

        // Normalize to monthly
        if (price.recurring?.interval === 'year') {
          return total + price.unit_amount / 12 / 100;
        }
        return total + price.unit_amount / 100;
      }, 0);

      // Upsert account
      const { error } = await supabase.from('accounts').upsert(
        {
          founder_id: founderId,
          email: customer.email || 'unknown@example.com',
          name: customer.name || customer.email || 'Unknown',
          mrr,
          billing_status: normalizeBillingStatus(subscription),
          cancel_at_period_end: subscription.cancel_at_period_end,
          stripe_customer_id: customer.id,
          stripe_subscription_id: subscription.id,
        },
        {
          onConflict: 'stripe_subscription_id',
        },
      );

      if (error) {
        console.error('Failed to upsert account:', error);
      }
    }

    console.log(`Synced ${subscriptions.data.length} subscriptions for founder ${founderId}`);
  } catch (err) {
    // Check if it's an authentication error (token expired)
    if (err instanceof Error && err.message.includes('Invalid API Key')) {
      console.log('Token expired, attempting refresh...');

      // Try to refresh the token
      const newToken = await refreshStripeToken(founderId);
      if (newToken) {
        // Retry with new token (only once to avoid infinite loops)
        return syncBillingData(founderId, newToken);
      }

      throw new Error('Stripe token expired and refresh failed. User must re-authenticate.');
    }

    console.error('Billing sync failed:', err);
    throw err;
  }
}
