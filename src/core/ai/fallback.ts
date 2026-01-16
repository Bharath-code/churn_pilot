import type { Action } from '../rules/types.js';

/**
 * Fallback messages when AI is unavailable or fails.
 * Per PRD Section 7: Failure-Safe Mode
 *
 * The product must NEVER break if AI is unavailable.
 */

export interface FallbackOutput {
  explanation: string;
  action: Action;
  message: string | null;
}

/**
 * Fallback templates per rule type
 */
export const FALLBACK_TEMPLATES: Record<
  string,
  (context?: { feature?: string }) => FallbackOutput
> = {
  // Re-engagement (Silent Drop-off, Never Activated)
  SEND_MESSAGE: (context) => ({
    explanation: 'User has become inactive after initial engagement.',
    action: 'SEND_MESSAGE',
    message: `Hey — noticed you haven't used ${context?.feature || 'the product'} in a bit. Most teams find it useful once they do. Happy to help if useful.`,
  }),

  // Payment issue
  PAYMENT_ISSUE: () => ({
    explanation: 'Payment failed on last invoice.',
    action: 'SEND_MESSAGE',
    message:
      "Hey — looks like your last payment didn't go through. Just wanted to flag it before access is affected.",
  }),

  // Pre-cancel
  PRE_CANCEL: () => ({
    explanation: 'User has scheduled cancellation.',
    action: 'SEND_MESSAGE',
    message:
      "Hey — noticed you're planning to cancel. Totally understand if timing isn't right. Let me know if there's anything I can help with before then.",
  }),

  // Low engagement
  LOW_ENGAGEMENT: () => ({
    explanation: 'Low engagement, has not used core feature.',
    action: 'SEND_MESSAGE',
    message:
      "Hey — noticed you haven't dug into the main features yet. Happy to walk you through it if useful.",
  }),

  // Do nothing (healthy)
  DO_NOTHING: () => ({
    explanation: 'User is active and showing healthy usage.',
    action: 'DO_NOTHING',
    message: null,
  }),
};

/**
 * Get fallback response based on rule ID
 */
export function getFallback(ruleId: string, context?: { feature?: string }): FallbackOutput {
  switch (ruleId) {
    case 'H4':
      return FALLBACK_TEMPLATES.PRE_CANCEL();
    case 'H3':
      return FALLBACK_TEMPLATES.PAYMENT_ISSUE();
    case 'H2':
    case 'H1':
      return FALLBACK_TEMPLATES.SEND_MESSAGE(context);
    case 'M1':
      return FALLBACK_TEMPLATES.LOW_ENGAGEMENT();
    default:
      return FALLBACK_TEMPLATES.DO_NOTHING();
  }
}
