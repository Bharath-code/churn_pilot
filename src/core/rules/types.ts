import type { Account } from '../../lib/supabase.js';

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
