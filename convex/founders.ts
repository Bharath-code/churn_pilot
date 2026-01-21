import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

export const getFounderById = query({
  args: { id: v.id('founders') },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getFounderByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const founders = await ctx.db
      .query('founders')
      .withIndex('by_email', (q) => q.eq('email', args.email))
      .collect();
    return founders[0];
  },
});

export const createFounder = mutation({
  args: {
    email: v.string(),
    company: v.string(),
    plan: v.optional(v.union(v.literal('trial'), v.literal('pro'), v.literal('paused'))),
    trial_ends_at: v.optional(v.string()),
    service_paused: v.optional(v.boolean()),
    stripe_api_key: v.optional(v.string()),
    stripe_access_token: v.optional(v.string()),
    stripe_refresh_token: v.optional(v.string()),
    stripe_account_id: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();

    const existing = await ctx.db
      .query('founders')
      .withIndex('by_email', (q) => q.eq('email', args.email))
      .collect();

    if (existing.length > 0) {
      await ctx.db.patch(existing[0]._id, {
        ...args,
        updated_at: now,
      });
      return existing[0]._id;
    }

    return await ctx.db.insert('founders', {
      email: args.email,
      company: args.company,
      plan: args.plan ?? 'trial',
      trial_ends_at: args.trial_ends_at ?? null,
      service_paused: args.service_paused ?? false,
      stripe_api_key: args.stripe_api_key ?? null,
      stripe_access_token: args.stripe_access_token ?? null,
      stripe_refresh_token: args.stripe_refresh_token ?? null,
      stripe_account_id: args.stripe_account_id ?? null,
      created_at: now,
      updated_at: now,
    });
  },
});

export const updateFounder = mutation({
  args: {
    id: v.id('founders'),
    updates: v.object({
      company: v.optional(v.string()),
      plan: v.optional(v.union(v.literal('trial'), v.literal('pro'), v.literal('paused'))),
      trial_ends_at: v.optional(v.string()),
      service_paused: v.optional(v.boolean()),
      stripe_api_key: v.optional(v.string()),
      stripe_access_token: v.optional(v.string()),
      stripe_refresh_token: v.optional(v.string()),
      stripe_account_id: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      ...args.updates,
      updated_at: new Date().toISOString(),
    });
  },
});

export const getFounderWithStripeToken = query({
  args: { id: v.id('founders') },
  handler: async (ctx, args) => {
    const founder = await ctx.db.get(args.id);
    if (!founder) return null;

    const token = founder.stripe_api_key ?? founder.stripe_access_token ?? null;
    return { ...founder, token };
  },
});

export const getAllActiveFounders = query({
  handler: async (ctx) => {
    const founders = await ctx.db.query('founders').collect();
    return founders.filter((f) => f.stripe_access_token !== null || f.stripe_api_key !== null);
  },
});

export const disconnectStripe = mutation({
  args: { id: v.id('founders') },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      stripe_access_token: null,
      stripe_refresh_token: null,
      stripe_account_id: null,
      updated_at: new Date().toISOString(),
    });
  },
});
