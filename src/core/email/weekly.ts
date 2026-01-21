import { Resend } from 'resend';
import { config } from '../../config.js';
import { type Account, api, convex } from '../../lib/convex.js';
import { generateRecommendations } from '../ai/generate.js';
import { evaluateAccounts } from '../rules/engine.js';
import {
  type DigestCustomer,
  generateDigestHtml,
  generateDigestText,
  generateSubject,
} from './template.js';

const resend = new Resend(config.RESEND_API_KEY);

export async function sendWeeklyDigest(founderId: string): Promise<{
  success: boolean;
  emailId?: string;
  error?: string;
  riskCount: number;
  accountCount: number;
}> {
  try {
    const founder = await convex.query(api.founders.getFounderById, { id: founderId });

    if (!founder) {
      return { success: false, error: 'Founder not found', riskCount: 0, accountCount: 0 };
    }

    const accounts = await convex.query(api.accounts.getActiveAccountsByFounder, { founderId });

    if (!accounts || accounts.length === 0) {
      return {
        success: true,
        riskCount: 0,
        accountCount: 0,
      };
    }

    const evaluatedAccounts = evaluateAccounts(accounts as Account[]);

    const withRecommendations = await generateRecommendations(evaluatedAccounts);

    const sortedCustomers: DigestCustomer[] = withRecommendations.sort((a, b) => {
      const riskOrder = { HIGH: 0, MEDIUM: 1, HEALTHY: 2 };
      return riskOrder[a.result.riskLevel] - riskOrder[b.result.riskLevel];
    });

    const riskCount = sortedCustomers.filter((c) => c.result.riskLevel !== 'HEALTHY').length;

    const digestData = {
      founderName: (founder as { company: string }).company,
      founderEmail: (founder as { email: string }).email,
      customers: sortedCustomers,
      generatedAt: new Date(),
    };

    const html = generateDigestHtml(digestData);
    const text = generateDigestText(digestData);
    const subject = generateSubject(riskCount);

    const { data: emailData, error: emailError } = await resend.emails.send({
      from: 'ChurnPilot <hello@churnpilot.com>',
      to: (founder as { email: string }).email,
      subject,
      html,
      text,
    });

    if (emailError) {
      console.error('Resend error:', emailError);
      return {
        success: false,
        error: emailError.message,
        riskCount,
        accountCount: accounts.length,
      };
    }

    await convex.mutation(api.logs.insertDigestLog, {
      founderId,
      accountCount: accounts.length,
      riskCount,
    });

    for (const customer of sortedCustomers.filter((c) => c.result.riskLevel !== 'HEALTHY')) {
      await convex.mutation(api.logs.insertDecisionLog, {
        accountId: customer.account._id,
        ruleId: customer.result.ruleId,
        riskLevel: customer.result.riskLevel,
        action: customer.recommendation.action,
        explanation: customer.recommendation.explanation,
        message: customer.recommendation.message,
        fallbackUsed: customer.recommendation.fallbackUsed,
      });
    }

    return {
      success: true,
      emailId: emailData?.id,
      riskCount,
      accountCount: accounts.length,
    };
  } catch (error) {
    console.error('Failed to send weekly digest:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      riskCount: 0,
      accountCount: 0,
    };
  }
}

export async function sendAllWeeklyDigests(): Promise<{
  total: number;
  successful: number;
  failed: number;
  results: Array<{ founderId: string; success: boolean; error?: string }>;
}> {
  const founders = await convex.query(api.founders.getAllActiveFounders);

  if (!founders) {
    console.error('Failed to fetch founders');
    return { total: 0, successful: 0, failed: 0, results: [] };
  }

  const results: Array<{ founderId: string; success: boolean; error?: string }> = [];

  for (const founder of founders) {
    const result = await sendWeeklyDigest(founder._id);
    results.push({
      founderId: founder._id,
      success: result.success,
      error: result.error,
    });

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return {
    total: founders.length,
    successful: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  };
}

export async function getDigestPreview(founderId: string): Promise<{
  accountCount: number;
  atRiskAccounts: Array<{
    name: string;
    email: string;
    mrr: number;
    riskLevel: string;
    reason: string;
    action: string;
    message: string | null;
  }>;
  subject: string;
}> {
  const accounts = await convex.query(api.accounts.getActiveAccountsByFounder, { founderId });

  if (!accounts || accounts.length === 0) {
    return {
      accountCount: 0,
      atRiskAccounts: [],
      subject: 'No accounts to analyze',
    };
  }

  const evaluatedAccounts = evaluateAccounts(accounts as Account[]);

  const atRiskAccounts = evaluatedAccounts.filter((e) => e.result.riskLevel !== 'HEALTHY');

  const withRecommendations = await generateRecommendations(atRiskAccounts);

  const formattedAccounts = withRecommendations.map(({ account, result, recommendation }) => ({
    name: (account as { name?: string | null }).name || 'Unknown',
    email: (account as { email: string }).email,
    mrr: (account as { mrr: number }).mrr,
    riskLevel: result.riskLevel,
    reason: result.reason,
    action: recommendation.action,
    message: recommendation.message,
  }));

  return {
    accountCount: accounts.length,
    atRiskAccounts: formattedAccounts,
    subject: generateSubject(formattedAccounts.length),
  };
}
