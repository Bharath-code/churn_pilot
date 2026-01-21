import { differenceInDays } from 'date-fns';
import { RULES_IN_ORDER } from './rules.js';
import type { Account } from './types.js';
import type { RuleResult } from './types.js';

function daysSince(date: string | null): number | null {
  if (!date) return null;
  return differenceInDays(new Date(), new Date(date));
}

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

  return {
    ruleId: 'G1',
    ruleName: 'Healthy',
    riskLevel: 'HEALTHY',
    reason: 'Healthy usage patterns.',
    suggestedAction: 'DO_NOTHING',
  };
}

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
