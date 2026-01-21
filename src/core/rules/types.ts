/**
 * Account type for rule evaluation (Convex format with _id)
 */
export interface Account {
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
 * Risk levels for accounts
 */
export type RiskLevel = 'HIGH' | 'MEDIUM' | 'HEALTHY';

/**
 * Actions that can be recommended
 */
export type Action = 'SEND_MESSAGE' | 'DO_NOTHING';

/**
 * Result of rule evaluation
 */
export interface RuleResult {
  ruleId: string;
  ruleName: string;
  riskLevel: RiskLevel;
  reason: string;
  suggestedAction: Action;
}

/**
 * Churn rule interface
 */
export interface ChurnRule {
  id: string;
  name: string;
  riskLevel: RiskLevel;
  suggestedAction: Action;
  evaluate(account: Account, accountAgeDays?: number, daysSinceActive?: number | null): boolean;
  getReason(account: Account): string;
}

/**
 * Account with computed fields for rule evaluation
 */
export interface EvaluationContext {
  account: Account;
  accountAgeDays: number;
  daysSinceActive: number | null;
}
