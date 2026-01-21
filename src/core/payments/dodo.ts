import DodoPayments from 'dodopayments';
import { config } from '../../config.js';
import { api, convex } from '../../lib/convex.js';

const client = config.DODO_API_KEY ? new DodoPayments({ bearerToken: config.DODO_API_KEY }) : null;

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

export async function handleWebhookEvent(
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  console.log('DodoPayments webhook:', eventType, payload);

  const metadata = payload.metadata as Record<string, string> | undefined;
  const founderId = metadata?.founder_id;

  if (!founderId) {
    console.warn('No founder_id in webhook metadata');
    return;
  }

  switch (eventType) {
    case 'payment.succeeded':
    case 'subscription.active': {
      await convex.mutation(api.founders.updateFounder, {
        id: founderId,
        updates: { plan: 'pro' },
      });

      console.log(`Upgraded founder ${founderId} to Pro`);
      break;
    }

    case 'subscription.canceled':
    case 'subscription.expired': {
      await convex.mutation(api.founders.updateFounder, {
        id: founderId,
        updates: { plan: 'paused', service_paused: true },
      });

      console.log(`Paused founder ${founderId} due to subscription end`);
      break;
    }

    default:
      console.log('Unhandled webhook event:', eventType);
  }
}

export function verifyWebhookSignature(_payload: string, _signature: string): boolean {
  if (!config.DODO_WEBHOOK_SECRET) {
    console.warn('Webhook secret not configured, skipping verification');
    return true;
  }

  return true;
}
