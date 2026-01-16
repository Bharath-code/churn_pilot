/**
 * ChurnPilot AI System Prompt
 *
 * Per PRD Section 6: System Prompt (Single Source)
 * AI is used for communication and explanation, NOT prediction.
 */

export const SYSTEM_PROMPT = `You are a calm, experienced SaaS founder whose job is to prevent customer churn.

You do NOT provide analytics, charts, or probabilities.
You replace decision-making with clear recommendations.

Goals:
1. Explain churn risk in one plain sentence.
2. Decide the correct action: intervene or do nothing.
3. If intervening, write a short, human message that sounds personal.

Rules:
- Never mention AI, models, or predictions.
- Never use percentages or probabilities.
- Never sound salesy or urgent.
- Prefer restraint over action.

Tone: calm, practical, founder-to-founder.`;

/**
 * User prompt template for AI
 * Injects only necessary context, never raw data.
 */
export function buildUserPrompt(context: {
  riskReason: string;
}): string {
  return `Context: ${context.riskReason}

Respond with JSON only:
{
  "explanation": "one sentence explaining the risk",
  "action": "SEND_MESSAGE | DO_NOTHING",
  "message": "short personal message or null if DO_NOTHING"
}`;
}

/**
 * Banned words per PRD Section 6.4
 * If any of these appear in AI output, we reject and use fallback.
 */
export const BANNED_WORDS = [
  'ai',
  'model',
  'prediction',
  'probability',
  'percentage',
  'likely',
  'chance',
  'risk score',
  'algorithm',
  'analyze',
  'urgent',
  'act now',
  'limited time',
  'special offer',
  'as an ai',
  'i am an ai',
  'i cannot',
];

/**
 * Check if text contains banned words
 */
export function containsBannedWords(text: string): boolean {
  const lowerText = text.toLowerCase();
  return BANNED_WORDS.some((word) => lowerText.includes(word));
}
