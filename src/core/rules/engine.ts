import { differenceInDays } from 'date-fns';
import type { Account } from '../../lib/supabase.js';
import { RULES_IN_ORDER } from './rules.js';
import type { RuleResult } from './types.js';

/**
 * Calculate days since a date, or null if date is null
 */
function daysSince(date: string | null): number | null {
  if (!date) return null;
  return differenceInDays(new Date(), new Date(date));
}

/**
 * Evaluate a single account against all rules.
 * Returns the first matching rule (exclusive by contract).
 *
 * Per mvp.md:
 * - Exactly ONE rule may win
 * - Rules evaluated in priority order
 * - First match wins
 * - No stacking, no scores
 */
export function evaluateAccount(account: Account): RuleResult {
  const accountAgeDays = daysSince(account.created_at) ?? 0;
  const daysSinceActive = daysSince(account.last_active_at);

  for (const rule of RULES_IN_ORDER) {
    const matches = rule.evaluate(account, accountAgeDays, daysSinceActive);

    if (matches) {
      return {
        ruleId: rule.id,
        ruleName: rule.name,
        riskLevel: rule.riskLevel,
        reason: rule.getReason(account),
        suggestedAction: rule.suggestedAction,
      };
    }
  }

  // Should never reach here since Healthy always matches
  return {
    ruleId: 'G1',
    ruleName: 'Healthy',
    riskLevel: 'HEALTHY',
    reason: 'Healthy usage patterns.',
    suggestedAction: 'DO_NOTHING',
  };
}

/**
 * Evaluate multiple accounts and return results.
 * Optionally filter to only return at-risk accounts.
 */
export function evaluateAccounts(
  accounts: Account[],
  options: { riskOnly?: boolean } = {},
): Array<{ account: Account; result: RuleResult }> {
  const results = accounts.map((account) => ({
    account,
    result: evaluateAccount(account),
  }));

  if (options.riskOnly) {
    return results.filter((r) => r.result.riskLevel !== 'HEALTHY');
  }

  return results;
}

/**
 * Group accounts by risk level
 */
export function groupByRisk(
  accounts: Account[],
): Record<'HIGH' | 'MEDIUM' | 'HEALTHY', Array<{ account: Account; result: RuleResult }>> {
  const results = evaluateAccounts(accounts);

  return {
    HIGH: results.filter((r) => r.result.riskLevel === 'HIGH'),
    MEDIUM: results.filter((r) => r.result.riskLevel === 'MEDIUM'),
    HEALTHY: results.filter((r) => r.result.riskLevel === 'HEALTHY'),
  };
}
