import type { Account } from '../../lib/supabase.js';
import type { GenerationResult } from '../ai/generate.js';
import type { RuleResult } from '../rules/types.js';

/**
 * Risk level badge
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

export interface AuditCustomer {
    account: Account;
    result: RuleResult;
    recommendation: GenerationResult;
}

export interface AuditData {
    email: string;
    company?: string;
    customers: AuditCustomer[];
    totalMrrAtRisk: number;
    atRiskCount: number;
    generatedAt: Date;
}

/**
 * Generate subject line for audit email
 */
export function generateAuditSubject(mrrAtRisk: number): string {
    return `Your ChurnPilot Audit: $${mrrAtRisk.toLocaleString()} MRR at Risk`;
}

/**
 * Generate HTML email content for one-time audit
 */
export function generateAuditHtml(data: AuditData): string {
    const subscribeUrl = 'https://churnpilot.com/#signup';

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your ChurnPilot Audit</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 15px; line-height: 1.6; color: #1a1a1a; background: #f5f5f5;">
  <div style="max-width: 600px; margin: 0 auto; padding: 24px;">
    <div style="background: #fff; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
      
      <!-- Header -->
      <div style="margin-bottom: 24px; text-align: center;">
        <p style="margin: 0 0 8px 0; font-size: 13px; color: #6366f1; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
          Your Free Audit
        </p>
        <h1 style="margin: 0 0 8px 0; font-size: 28px; font-weight: 700; color: #1a1a1a;">
          $${data.totalMrrAtRisk.toLocaleString()} MRR at Risk
        </h1>
        <p style="margin: 0; color: #666; font-size: 15px;">
          ${data.atRiskCount} ${data.atRiskCount === 1 ? 'account needs' : 'accounts need'} your attention right now.
        </p>
      </div>

      <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">

      <!-- At-Risk Accounts (top 3) -->
      <h2 style="margin: 0 0 16px 0; font-size: 16px; font-weight: 600; color: #1a1a1a;">
        Here's who to reach out to:
      </h2>

      ${data.customers
            .filter((c) => c.result.riskLevel !== 'HEALTHY')
            .slice(0, 3)
            .map(
                (c, _i) => `
        <div style="margin-bottom: 20px; padding: 20px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid ${c.result.riskLevel === 'HIGH' ? '#ef4444' : '#eab308'};">
          <h3 style="margin: 0 0 8px 0; font-size: 15px; font-weight: 600; color: #1a1a1a;">
            ${riskBadge(c.result.riskLevel)} ${c.account.name || c.account.email} — $${c.account.mrr}/mo
          </h3>
          
          <p style="margin: 0 0 8px 0; color: #444; font-size: 14px;">
            <strong>Why:</strong> ${c.recommendation.explanation}
          </p>
          
          ${c.recommendation.message
                        ? `
            <div style="background: #fff; border-left: 3px solid #6366f1; padding: 10px 14px; margin-top: 10px; border-radius: 0 4px 4px 0;">
              <p style="margin: 0 0 4px 0; font-size: 12px; color: #666; font-weight: 500;">Copy-paste this:</p>
              <p style="margin: 0; color: #1a1a1a; font-size: 14px;">"${c.recommendation.message}"</p>
            </div>
          `
                        : ''
                    }
        </div>
      `,
            )
            .join('')}

      ${data.atRiskCount > 3
            ? `
        <p style="margin: 0 0 24px 0; color: #666; font-size: 14px; text-align: center;">
          + ${data.atRiskCount - 3} more accounts at risk...
        </p>
      `
            : ''
        }

      <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">

      <!-- CTA -->
      <div style="text-align: center; padding: 16px 0;">
        <p style="margin: 0 0 16px 0; color: #1a1a1a; font-size: 16px; font-weight: 500;">
          Get this report every week.
        </p>
        <a href="${subscribeUrl}" style="display: inline-block; background: #6366f1; color: #fff; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px;">
          Subscribe — $79/mo
        </a>
        <p style="margin: 16px 0 0 0; color: #999; font-size: 13px;">
          Cancel anytime. No questions asked.
        </p>
      </div>

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
 * Generate plain text version of audit email
 */
export function generateAuditText(data: AuditData): string {
    let text = `YOUR CHURNPILOT AUDIT\n\n`;
    text += `$${data.totalMrrAtRisk.toLocaleString()} MRR at Risk\n`;
    text += `${data.atRiskCount} ${data.atRiskCount === 1 ? 'account needs' : 'accounts need'} your attention.\n\n`;
    text += `---\n\n`;
    text += `HERE'S WHO TO REACH OUT TO:\n\n`;

    data.customers
        .filter((c) => c.result.riskLevel !== 'HEALTHY')
        .slice(0, 3)
        .forEach((c, i) => {
            text += `${i + 1}) ${c.account.name || c.account.email} — $${c.account.mrr}/mo\n`;
            text += `Why: ${c.recommendation.explanation}\n`;
            if (c.recommendation.message) {
                text += `Message: "${c.recommendation.message}"\n`;
            }
            text += '\n';
        });

    if (data.atRiskCount > 3) {
        text += `+ ${data.atRiskCount - 3} more accounts at risk...\n\n`;
    }

    text += `---\n\n`;
    text += `GET THIS REPORT EVERY WEEK\n`;
    text += `Subscribe at https://churnpilot.com — $79/mo\n`;

    return text;
}
