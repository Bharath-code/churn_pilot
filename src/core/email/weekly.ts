import { Resend } from 'resend';
import { config } from '../../config.js';
import { type Account, type Founder, supabase } from '../../lib/supabase.js';
import { generateRecommendations } from '../ai/generate.js';
import { evaluateAccounts } from '../rules/engine.js';
import {
  type DigestCustomer,
  generateDigestHtml,
  generateDigestText,
  generateSubject,
} from './template.js';

// Initialize Resend client
const resend = new Resend(config.RESEND_API_KEY);

/**
 * Generate and send weekly digest for a single founder
 */
export async function sendWeeklyDigest(founderId: string): Promise<{
  success: boolean;
  emailId?: string;
  error?: string;
  riskCount: number;
  accountCount: number;
}> {
  try {
    // Fetch founder
    const { data: founderData, error: founderError } = await supabase
      .from('founders')
      .select('*')
      .eq('id', founderId)
      .single();

    if (founderError || !founderData) {
      return { success: false, error: 'Founder not found', riskCount: 0, accountCount: 0 };
    }

    const founder = founderData as Founder;

    // Fetch all accounts for this founder
    const { data: accounts, error: accountsError } = await supabase
      .from('accounts')
      .select('*')
      .eq('founder_id', founderId)
      .neq('billing_status', 'CANCELED');

    if (accountsError) {
      return { success: false, error: accountsError.message, riskCount: 0, accountCount: 0 };
    }

    if (!accounts || accounts.length === 0) {
      return {
        success: true,
        riskCount: 0,
        accountCount: 0,
      };
    }

    // Evaluate all accounts
    const evaluatedAccounts = evaluateAccounts(accounts as Account[]);

    // Generate AI recommendations
    const withRecommendations = await generateRecommendations(evaluatedAccounts);

    // Sort by risk level (HIGH first, then MEDIUM, then HEALTHY)
    const sortedCustomers: DigestCustomer[] = withRecommendations.sort((a, b) => {
      const riskOrder = { HIGH: 0, MEDIUM: 1, HEALTHY: 2 };
      return riskOrder[a.result.riskLevel] - riskOrder[b.result.riskLevel];
    });

    // Count at-risk accounts
    const riskCount = sortedCustomers.filter((c) => c.result.riskLevel !== 'HEALTHY').length;

    // Generate email content
    const digestData = {
      founderName: founder.company,
      founderEmail: founder.email,
      customers: sortedCustomers,
      generatedAt: new Date(),
    };

    const html = generateDigestHtml(digestData);
    const text = generateDigestText(digestData);
    const subject = generateSubject(riskCount);

    // Send email via Resend
    const { data: emailData, error: emailError } = await resend.emails.send({
      from: 'ChurnPilot <hello@churnpilot.com>',
      to: founder.email,
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

    // Log digest
    await supabase.from('digest_logs').insert({
      founder_id: founderId,
      account_count: accounts.length,
      risk_count: riskCount,
    });

    // Log decision for each at-risk account
    for (const customer of sortedCustomers.filter((c) => c.result.riskLevel !== 'HEALTHY')) {
      await supabase.from('decision_logs').insert({
        account_id: customer.account.id,
        rule_id: customer.result.ruleId,
        risk_level: customer.result.riskLevel,
        action: customer.recommendation.action,
        explanation: customer.recommendation.explanation,
        message: customer.recommendation.message,
        fallback_used: customer.recommendation.fallbackUsed,
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

/**
 * Send weekly digests for all active founders
 */
export async function sendAllWeeklyDigests(): Promise<{
  total: number;
  successful: number;
  failed: number;
  results: Array<{ founderId: string; success: boolean; error?: string }>;
}> {
  // Fetch all founders with active subscriptions
  const { data: founders, error } = await supabase
    .from('founders')
    .select('id, email')
    .not('stripe_access_token', 'is', null);

  if (error || !founders) {
    console.error('Failed to fetch founders:', error);
    return { total: 0, successful: 0, failed: 0, results: [] };
  }

  const results: Array<{ founderId: string; success: boolean; error?: string }> = [];

  for (const founder of founders) {
    const result = await sendWeeklyDigest(founder.id);
    results.push({
      founderId: founder.id,
      success: result.success,
      error: result.error,
    });

    // Small delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return {
    total: founders.length,
    successful: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  };
}

/**
 * Get a preview of the weekly digest without sending
 * Returns data that would be included in the email
 */
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
  // Fetch all accounts for this founder
  const { data: accounts, error: accountsError } = await supabase
    .from('accounts')
    .select('*')
    .eq('founder_id', founderId)
    .neq('billing_status', 'CANCELED');

  if (accountsError || !accounts || accounts.length === 0) {
    return {
      accountCount: 0,
      atRiskAccounts: [],
      subject: 'No accounts to analyze',
    };
  }

  // Evaluate all accounts
  const evaluatedAccounts = evaluateAccounts(accounts as Account[]);

  // Filter for at-risk accounts
  const atRiskAccounts = evaluatedAccounts.filter((e) => e.result.riskLevel !== 'HEALTHY');

  // Generate recommendations for at-risk accounts
  const withRecommendations = await generateRecommendations(atRiskAccounts);

  // Format for preview
  const formattedAccounts = withRecommendations.map(({ account, result, recommendation }) => ({
    name: account.name || 'Unknown',
    email: account.email,
    mrr: account.mrr,
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
