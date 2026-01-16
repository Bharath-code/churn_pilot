import DodoPayments from 'dodopayments';
import { config } from '../../config.js';
import { supabase } from '../../lib/supabase.js';

/**
 * DodoPayments client for subscription management
 */
const client = config.DODO_API_KEY ? new DodoPayments({ bearerToken: config.DODO_API_KEY }) : null;

/**
 * Create a checkout session for upgrading to Pro
 */
export async function createCheckoutSession(
  founderId: string,
  email: string,
): Promise<{ checkoutUrl: string } | { error: string }> {
  if (!client || !config.DODO_PRODUCT_ID) {
    return { error: 'Payment system not configured' };
  }

  try {
    const payment = await client.payments.create({
      billing: {
        city: '',
        country: 'US',
        state: '',
        street: '',
        zipcode: '',
      },
      customer: {
        email,
        name: email,
      },
      product_cart: [
        {
          product_id: config.DODO_PRODUCT_ID,
          quantity: 1,
        },
      ],
      payment_link: true,
      return_url: `${config.BASE_URL}/dashboard?payment=success`,
      metadata: {
        founder_id: founderId,
      },
    });

    return { checkoutUrl: payment.payment_link || '' };
  } catch (error) {
    console.error('Failed to create checkout session:', error);
    return { error: 'Failed to create checkout session' };
  }
}

/**
 * Handle DodoPayments webhook events
 */
export async function handleWebhookEvent(
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  console.log('DodoPayments webhook:', eventType, payload);

  switch (eventType) {
    case 'payment.succeeded':
    case 'subscription.active': {
      // Extract founder ID from metadata
      const metadata = payload.metadata as Record<string, string> | undefined;
      const founderId = metadata?.founder_id;

      if (founderId) {
        // Upgrade founder to Pro
        await supabase.from('founders').update({ plan: 'pro' }).eq('id', founderId);

        console.log(`Upgraded founder ${founderId} to Pro`);
      }
      break;
    }

    case 'subscription.canceled':
    case 'subscription.expired': {
      const metadata = payload.metadata as Record<string, string> | undefined;
      const founderId = metadata?.founder_id;

      if (founderId) {
        // Downgrade to paused
        await supabase
          .from('founders')
          .update({ plan: 'paused', service_paused: true })
          .eq('id', founderId);

        console.log(`Paused founder ${founderId} due to subscription end`);
      }
      break;
    }

    default:
      console.log('Unhandled webhook event:', eventType);
  }
}

/**
 * Verify webhook signature (simplified - use proper HMAC in production)
 */
export function verifyWebhookSignature(_payload: string, _signature: string): boolean {
  // For now, just check if secret is configured
  // In production, implement proper HMAC verification
  if (!config.DODO_WEBHOOK_SECRET) {
    console.warn('Webhook secret not configured, skipping verification');
    return true;
  }

  // TODO: Implement proper signature verification
  return true;
}
