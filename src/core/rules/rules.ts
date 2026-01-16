import type { Account } from '../../lib/supabase.js';
import type { ChurnRule } from './types.js';

/**
 * H4 — Pre-Cancel
 * Highest priority. User has explicitly requested cancellation.
 */
export const H4_PreCancel: ChurnRule = {
  id: 'H4',
  name: 'Pre-Cancel',
  riskLevel: 'HIGH',
  suggestedAction: 'SEND_MESSAGE',
  evaluate: (account: Account) => account.cancel_at_period_end === true,
  getReason: () => 'User has requested to cancel at period end.',
};

/**
 * H3 — Payment Failure
 * Billing friction is a strong churn predictor.
 */
export const H3_PaymentFailure: ChurnRule = {
  id: 'H3',
  name: 'Payment Failure',
  riskLevel: 'HIGH',
  suggestedAction: 'SEND_MESSAGE',
  evaluate: (account: Account) => account.billing_status === 'PAYMENT_FAILED',
  getReason: () => 'Payment failed on last invoice.',
};

/**
 * H2 — Never Activated
 * User signed up but never reached first value.
 */
export const H2_NeverActivated: ChurnRule = {
  id: 'H2',
  name: 'Never Activated',
  riskLevel: 'HIGH',
  suggestedAction: 'SEND_MESSAGE',
  evaluate: (account: Account, accountAgeDays: number) =>
    account.activated === false && accountAgeDays > 7,
  getReason: () => 'Never reached first value after signup.',
};

/**
 * H1 — Silent Drop-off
 * User was active but stopped using the product.
 * Threshold depends on usage frequency.
 */
export const H1_SilentDropoff: ChurnRule = {
  id: 'H1',
  name: 'Silent Drop-off',
  riskLevel: 'HIGH',
  suggestedAction: 'SEND_MESSAGE',
  evaluate: (account: Account, _accountAgeDays: number, daysSinceActive: number | null) => {
    if (!account.activated || daysSinceActive === null) return false;

    const threshold = account.usage_freq === 'DAILY' ? 7 : 14;
    return daysSinceActive > threshold;
  },
  getReason: (account: Account) => {
    const freq = account.usage_freq === 'DAILY' ? 'daily' : 'weekly';
    return `Stopped using product after activation (expected ${freq} usage).`;
  },
};

/**
 * M1 — Low Engagement
 * User is somewhat active but not using core features.
 */
export const M1_LowEngagement: ChurnRule = {
  id: 'M1',
  name: 'Low Engagement',
  riskLevel: 'MEDIUM',
  suggestedAction: 'SEND_MESSAGE',
  evaluate: (account: Account, _accountAgeDays: number, daysSinceActive: number | null) => {
    if (daysSinceActive === null) return false;
    return daysSinceActive > 4 && account.core_used === false;
  },
  getReason: () => 'Low engagement, has not used core feature.',
};

/**
 * Healthy — Default
 * Account is showing healthy usage patterns.
 */
export const Healthy: ChurnRule = {
  id: 'G1',
  name: 'Healthy',
  riskLevel: 'HEALTHY',
  suggestedAction: 'DO_NOTHING',
  evaluate: () => true, // Always matches as fallback
  getReason: () => 'Healthy usage patterns.',
};

/**
 * All rules in priority order.
 * First match wins (exclusive by contract).
 */
export const RULES_IN_ORDER: ChurnRule[] = [
  H4_PreCancel,
  H3_PaymentFailure,
  H2_NeverActivated,
  H1_SilentDropoff,
  M1_LowEngagement,
  Healthy, // Always last
];
