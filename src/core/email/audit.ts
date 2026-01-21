import { Resend } from 'resend';
import Stripe from 'stripe';
import { config } from '../../config.js';
import { api, convex } from '../../lib/convex.js';
import { generateRecommendations } from '../ai/generate.js';
import { evaluateAccounts } from '../rules/engine.js';
import type { Account } from '../rules/types.js';
import {
  type AuditCustomer,
  type AuditData,
  generateAuditHtml,
  generateAuditSubject,
  generateAuditText,
} from './audit-template.js';

const resend = new Resend(config.RESEND_API_KEY);

interface AuditAccount {
  _id: string;
  founder_id: string;
  email: string;
  name: string | null;
  mrr: number;
  last_active_at: string | null;
  activated: boolean;
  core_used: boolean;
  usage_freq: 'DAILY' | 'WEEKLY';
  billing_status: 'ACTIVE' | 'PAYMENT_FAILED' | 'CANCELING' | 'CANCELED';
  cancel_at_period_end: boolean;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Normalize Stripe subscription status to billing_status enum
 */
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

/**
 * Fetch accounts from Stripe using provided API key.
 * Returns in-memory Account objects (not persisted to DB).
 */
async function fetchAccountsFromStripe(stripeApiKey: string): Promise<AuditAccount[]> {
  const stripe = new Stripe(stripeApiKey);

  const subscriptions = await stripe.subscriptions.list({
    status: 'all',
    limit: 100,
    expand: ['data.customer', 'data.latest_invoice'],
  });

  const accounts: AuditAccount[] = [];
  const now = new Date().toISOString();

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

    // Create in-memory account
    accounts.push({
      _id: subscription.id,
      founder_id: 'audit',
      email: customer.email || 'unknown@example.com',
      name: customer.name || customer.email || 'Unknown',
      mrr,
      billing_status: normalizeBillingStatus(subscription),
      cancel_at_period_end: subscription.cancel_at_period_end,
      stripe_customer_id: customer.id,
      stripe_subscription_id: subscription.id,
      last_active_at: null,
      activated: false,
      core_used: false,
      usage_freq: 'WEEKLY',
      created_at: new Date(subscription.created * 1000).toISOString(),
      updated_at: now,
    });
  }

  return accounts;
}

export interface AuditResult {
  success: boolean;
  error?: string;
  atRiskCount: number;
  totalMrrAtRisk: number;
  emailId?: string;
}

/**
 * Run one-time risk audit and send email.
 *
 * Flow:
 * 1. Fetch subscriptions from Stripe (in-memory, no DB write)
 * 2. Run rules engine
 * 3. Generate AI recommendations
 * 4. Send audit email
 * 5. Log lead to audit_leads table
 */
export async function runAudit(
  email: string,
  stripeApiKey: string,
  company?: string,
): Promise<AuditResult> {
  try {
    // 1. Fetch accounts from Stripe
    const accounts = await fetchAccountsFromStripe(stripeApiKey);

    if (accounts.length === 0) {
      return {
        success: false,
        error: 'No active subscriptions found in Stripe.',
        atRiskCount: 0,
        totalMrrAtRisk: 0,
      };
    }

    // 2. Run rules engine
    const evaluatedAccounts = evaluateAccounts(accounts as Account[]);

    // 3. Generate AI recommendations
    const withRecommendations = await generateRecommendations(evaluatedAccounts);

    // 4. Calculate stats
    const atRiskAccounts = withRecommendations.filter((c) => c.result.riskLevel !== 'HEALTHY');
    const atRiskCount = atRiskAccounts.length;
    const totalMrrAtRisk = atRiskAccounts.reduce((sum, c) => sum + c.account.mrr, 0);

    // Sort by risk level (HIGH first)
    const sortedCustomers: AuditCustomer[] = withRecommendations.sort((a, b) => {
      const riskOrder = { HIGH: 0, MEDIUM: 1, HEALTHY: 2 };
      return riskOrder[a.result.riskLevel] - riskOrder[b.result.riskLevel];
    });

    // 5. Generate email content
    const auditData: AuditData = {
      email,
      company,
      customers: sortedCustomers,
      totalMrrAtRisk,
      atRiskCount,
      generatedAt: new Date(),
    };

    const html = generateAuditHtml(auditData);
    const text = generateAuditText(auditData);
    const subject = generateAuditSubject(Math.round(totalMrrAtRisk));

    // 6. Send email via Resend
    const { data: emailData, error: emailError } = await resend.emails.send({
      from: 'ChurnPilot <hello@churnpilot.com>',
      to: email,
      subject,
      html,
      text,
    });

    if (emailError) {
      console.error('Resend error:', emailError);
      return {
        success: false,
        error: 'Failed to send audit email.',
        atRiskCount,
        totalMrrAtRisk,
      };
    }

    // 7. Log lead to audit_leads table
    try {
      await convex.mutation(api.audit.insertAuditLead, {
        email,
        company: company || undefined,
        mrrAtRisk: totalMrrAtRisk,
        atRiskCount,
      });
    } catch (insertErr) {
      // Non-blocking: log error but don't fail the audit
      console.warn('Could not log audit lead:', insertErr);
    }

    return {
      success: true,
      atRiskCount,
      totalMrrAtRisk,
      emailId: emailData?.id,
    };
  } catch (error) {
    console.error('Audit failed:', error);

    // Handle specific Stripe errors
    if (error instanceof Stripe.errors.StripeAuthenticationError) {
      return {
        success: false,
        error: 'Invalid Stripe API key. Please check your key and try again.',
        atRiskCount: 0,
        totalMrrAtRisk: 0,
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred.',
      atRiskCount: 0,
      totalMrrAtRisk: 0,
    };
  }
}
