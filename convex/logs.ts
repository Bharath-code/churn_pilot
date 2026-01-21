import { v } from 'convex/values';
import { mutation } from './_generated/server';

export const insertDecisionLog = mutation({
  args: {
    accountId: v.id('accounts'),
    ruleId: v.string(),
    riskLevel: v.union(v.literal('HIGH'), v.literal('MEDIUM'), v.literal('HEALTHY')),
    action: v.union(v.literal('SEND_MESSAGE'), v.literal('DO_NOTHING')),
    explanation: v.optional(v.string()),
    message: v.optional(v.string()),
    fallbackUsed: v.boolean(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('decision_logs', {
      account_id: args.accountId,
      rule_id: args.ruleId,
      risk_level: args.riskLevel,
      action: args.action,
      explanation: args.explanation ?? null,
      message: args.message ?? null,
      fallback_used: args.fallbackUsed,
      created_at: new Date().toISOString(),
    });
  },
});

export const insertDigestLog = mutation({
  args: {
    founderId: v.id('founders'),
    accountCount: v.number(),
    riskCount: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('digest_logs', {
      founder_id: args.founderId,
      account_count: args.accountCount,
      risk_count: args.riskCount,
      sent_at: new Date().toISOString(),
    });
  },
});

export const getDecisionLogsByAccount = query({
  args: { accountId: v.id('accounts') },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('decision_logs')
      .withIndex('by_account', (q) => q.eq('account_id', args.accountId))
      .collect();
  },
});

export const getDigestLogsByFounder = query({
  args: { founderId: v.id('founders') },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('digest_logs')
      .withIndex('by_founder', (q) => q.eq('founder_id', args.founderId))
      .collect();
  },
});
