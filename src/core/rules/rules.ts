import type { Account, ChurnRule } from './types.js';

export const H4_PreCancel: ChurnRule = {
  id: 'H4',
  name: 'Pre-Cancel',
  riskLevel: 'HIGH',
  suggestedAction: 'SEND_MESSAGE',
  evaluate: (account: Account) => account.cancel_at_period_end === true,
  getReason: () => 'User has requested to cancel at period end.',
};

export const H3_PaymentFailure: ChurnRule = {
  id: 'H3',
  name: 'Payment Failure',
  riskLevel: 'HIGH',
  suggestedAction: 'SEND_MESSAGE',
  evaluate: (account: Account) => account.billing_status === 'PAYMENT_FAILED',
  getReason: () => 'Payment failed on last invoice.',
};

export const H2_NeverActivated: ChurnRule = {
  id: 'H2',
  name: 'Never Activated',
  riskLevel: 'HIGH',
  suggestedAction: 'SEND_MESSAGE',
  evaluate: (account: Account, accountAgeDays: number) =>
    account.activated === false && accountAgeDays > 7,
  getReason: () => 'Never reached first value after signup.',
};

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

export const Healthy: ChurnRule = {
  id: 'G1',
  name: 'Healthy',
  riskLevel: 'HEALTHY',
  suggestedAction: 'DO_NOTHING',
  evaluate: () => true,
  getReason: () => 'Healthy usage patterns.',
};

export const RULES_IN_ORDER: ChurnRule[] = [
  H4_PreCancel,
  H3_PaymentFailure,
  H2_NeverActivated,
  H1_SilentDropoff,
  M1_LowEngagement,
  Healthy,
];
