import { v } from 'convex/values';
import { mutation } from './_generated/server';

export const insertAuditLead = mutation({
  args: {
    email: v.string(),
    company: v.optional(v.string()),
    mrrAtRisk: v.number(),
    atRiskCount: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('audit_leads', {
      email: args.email,
      company: args.company ?? null,
      mrr_at_risk: args.mrrAtRisk,
      at_risk_count: args.atRiskCount,
      created_at: new Date().toISOString(),
    });
  },
});

export const getAuditLeadsByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('audit_leads')
      .withIndex('by_email', (q) => q.eq('email', args.email))
      .collect();
  },
});

export const getAllAuditLeads = query({
  handler: async (ctx) => {
    return await ctx.db.query('audit_leads').collect();
  },
});
