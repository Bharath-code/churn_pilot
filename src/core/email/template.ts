import type { GenerationResult } from '../ai/generate.js';
import type { Account } from '../rules/types.js';
import type { RuleResult } from '../rules/types.js';

/**
 * Format action for display
 */
function formatAction(action: string): string {
  switch (action) {
    case 'SEND_MESSAGE':
      return 'Send a re-engagement message.';
    case 'DO_NOTHING':
      return 'Do nothing.';
    default:
      return action;
  }
}

/**
 * Risk level badge for visual hierarchy
 */
function riskBadge(level: string): string {
  switch (level) {
    case 'HIGH':
      return '🔴';
    case 'MEDIUM':
      return '🟡';
    default:
      return '🟢';
  }
}

export interface DigestCustomer {
  account: Account;
  result: RuleResult;
  recommendation: GenerationResult;
}

export interface DigestData {
  founderName: string;
  founderEmail: string;
  customers: DigestCustomer[];
  generatedAt: Date;
}

/**
 * Generate HTML email content for weekly digest
 * Per PRD Section 8: Weekly Churn Email (The Product)
 */
export function generateDigestHtml(data: DigestData): string {
  const riskCount = data.customers.filter((c) => c.result.riskLevel !== 'HEALTHY').length;
  const totalMrrAtRisk = data.customers
    .filter((c) => c.result.riskLevel !== 'HEALTHY')
    .reduce((sum, c) => sum + c.account.mrr, 0);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Weekly Churn Report</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 15px; line-height: 1.6; color: #1a1a1a; background: #f5f5f5;">
  <div style="max-width: 600px; margin: 0 auto; padding: 24px;">
    <div style="background: #fff; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
      
      <!-- Header -->
      <div style="margin-bottom: 24px;">
        <h1 style="margin: 0 0 8px 0; font-size: 22px; font-weight: 600; color: #1a1a1a;">
          ${riskCount} ${riskCount === 1 ? 'account' : 'accounts'} to review this week
        </h1>
        <p style="margin: 0; color: #666; font-size: 14px;">
          $${totalMrrAtRisk.toFixed(0)} MRR at risk
        </p>
      </div>

      <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">

      <!-- Customers -->
      ${data.customers
        .map(
          (c, i) => `
        <div style="margin-bottom: 24px; padding: 20px; background: #f8f9fa; border-radius: 8px;">
          <h3 style="margin: 0 0 12px 0; font-size: 16px; font-weight: 600;">
            ${riskBadge(c.result.riskLevel)} ${i + 1}) ${c.account.name || c.account.email} — $${c.account.mrr}/month
          </h3>
          
          <p style="margin: 0 0 12px 0; color: #444;">
            <strong>Why this matters:</strong><br>
            ${c.recommendation.explanation}
          </p>
          
          <p style="margin: 0 0 ${c.recommendation.message ? '12px' : '0'}; color: #444;">
            <strong>Recommended action:</strong><br>
            ${formatAction(c.recommendation.action)}
          </p>
          
          ${
            c.recommendation.message
              ? `
            <div style="background: #fff; border-left: 3px solid #0066cc; padding: 12px 16px; margin-top: 12px; border-radius: 0 4px 4px 0;">
              <p style="margin: 0 0 4px 0; font-size: 13px; color: #666; font-weight: 500;">Suggested message:</p>
              <p style="margin: 0; color: #1a1a1a; font-style: italic;">"${c.recommendation.message}"</p>
            </div>
          `
              : ''
          }
        </div>
      `,
        )
        .join('')}

      <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">

      <!-- Footer -->
      <p style="margin: 0; color: #666; font-size: 14px; text-align: center;">
        If you save even one of these, ChurnPilot paid for itself this month.
      </p>
    </div>

    <p style="margin: 24px 0 0 0; text-align: center; font-size: 12px; color: #999;">
      ChurnPilot · Calm churn prevention for founders
    </p>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Generate plain text version of weekly digest
 */
export function generateDigestText(data: DigestData): string {
  const riskCount = data.customers.filter((c) => c.result.riskLevel !== 'HEALTHY').length;

  let text = `${riskCount} ${riskCount === 1 ? 'account' : 'accounts'} to review this week\n\n`;

  data.customers.forEach((c, i) => {
    text += `${i + 1}) ${c.account.name || c.account.email} — $${c.account.mrr}/month\n`;
    text += `Why this matters: ${c.recommendation.explanation}\n`;
    text += `Recommended action: ${formatAction(c.recommendation.action)}\n`;
    if (c.recommendation.message) {
      text += `Suggested message: "${c.recommendation.message}"\n`;
    }
    text += '\n';
  });

  text += '---\nIf you save even one of these, ChurnPilot paid for itself this month.\n';

  return text;
}

/**
 * Generate email subject line
 */
export function generateSubject(riskCount: number): string {
  if (riskCount === 0) {
    return 'All clear this week — no at-risk accounts';
  }
  return `${riskCount} ${riskCount === 1 ? 'account' : 'accounts'} to review this week`;
}
