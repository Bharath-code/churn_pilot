import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';
import { config } from '../../config.js';
import type { Account } from '../../lib/supabase.js';
import type { RuleResult } from '../rules/types.js';
import { getFallback } from './fallback.js';
import { SYSTEM_PROMPT, buildUserPrompt, containsBannedWords } from './prompt.js';

/**
 * AI output schema with Zod validation
 */
const AiOutputSchema = z.object({
  explanation: z.string().min(1).max(200),
  action: z.enum(['SEND_MESSAGE', 'DO_NOTHING']),
  message: z.string().max(300).nullable(),
});

export type AiOutput = z.infer<typeof AiOutputSchema>;

/**
 * Result of AI generation
 */
export interface GenerationResult {
  explanation: string;
  action: 'SEND_MESSAGE' | 'DO_NOTHING';
  message: string | null;
  fallbackUsed: boolean;
}

// Initialize Gemini client (free tier: 1,500 requests/day)
const genAI = config.GEMINI_API_KEY ? new GoogleGenerativeAI(config.GEMINI_API_KEY) : null;

/**
 * Generate AI response for a customer at risk.
 *
 * Per PRD:
 * - AI never decides, only communicates
 * - Falls back to templates if AI fails
 * - Validates output against banned words
 */
export async function generateRecommendation(
  _account: Account,
  ruleResult: RuleResult,
  options: { skipAi?: boolean } = {},
): Promise<GenerationResult> {
  // Skip AI if requested, not configured, or for healthy accounts
  if (options.skipAi || !genAI || ruleResult.riskLevel === 'HEALTHY') {
    const fallback = getFallback(ruleResult.ruleId);
    return {
      explanation: fallback.explanation,
      action: fallback.action,
      message: fallback.message,
      fallbackUsed: true,
    };
  }

  try {
    const userPrompt = buildUserPrompt({
      riskReason: ruleResult.reason,
    });

    // Use Gemini Flash (fast & free)
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 300,
        responseMimeType: 'application/json',
      },
    });

    const result = await model.generateContent([{ text: `${SYSTEM_PROMPT}\n\n${userPrompt}` }]);

    const content = result.response.text();
    if (!content) {
      throw new Error('No content in AI response');
    }

    // Parse and validate
    const parsed = JSON.parse(content);
    const validated = AiOutputSchema.parse(parsed);

    // Check for banned words
    const allText = `${validated.explanation} ${validated.message || ''}`;
    if (containsBannedWords(allText)) {
      console.warn('AI output contained banned words, using fallback');
      const fallback = getFallback(ruleResult.ruleId);
      return {
        explanation: fallback.explanation,
        action: fallback.action,
        message: fallback.message,
        fallbackUsed: true,
      };
    }

    return {
      explanation: validated.explanation,
      action: validated.action,
      message: validated.message,
      fallbackUsed: false,
    };
  } catch (error) {
    console.error('AI generation failed, using fallback:', error);
    const fallback = getFallback(ruleResult.ruleId);
    return {
      explanation: fallback.explanation,
      action: fallback.action,
      message: fallback.message,
      fallbackUsed: true,
    };
  }
}

/**
 * Generate recommendations for multiple accounts
 */
export async function generateRecommendations(
  accountsWithRules: Array<{ account: Account; result: RuleResult }>,
  options: { skipAi?: boolean } = {},
): Promise<Array<{ account: Account; result: RuleResult; recommendation: GenerationResult }>> {
  const results = await Promise.all(
    accountsWithRules.map(async ({ account, result }) => ({
      account,
      result,
      recommendation: await generateRecommendation(account, result, options),
    })),
  );

  return results;
}
