import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

export const getAccountsByFounder = query({
  args: { founderId: v.id('founders') },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('accounts')
      .withIndex('by_founder', (q) => q.eq('founder_id', args.founderId))
      .collect();
  },
});

export const getActiveAccountsByFounder = query({
  args: { founderId: v.id('founders') },
  handler: async (ctx, args) => {
    const accounts = await ctx.db
      .query('accounts')
      .withIndex('by_founder', (q) => q.eq('founder_id', args.founderId))
      .collect();
    return accounts.filter((a) => a.billing_status !== 'CANCELED');
  },
});

export const getAccountById = query({
  args: { id: v.id('accounts') },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const upsertAccount = mutation({
  args: {
    founderId: v.id('founders'),
    email: v.string(),
    name: v.optional(v.string()),
    mrr: v.number(),
    billing_status: v.union(
      v.literal('ACTIVE'),
      v.literal('PAYMENT_FAILED'),
      v.literal('CANCELING'),
      v.literal('CANCELED'),
    ),
    cancel_at_period_end: v.boolean(),
    stripe_customer_id: v.optional(v.string()),
    stripe_subscription_id: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();

    if (!args.stripe_subscription_id) {
      return await ctx.db.insert('accounts', {
        founder_id: args.founderId,
        email: args.email,
        name: args.name ?? null,
        mrr: args.mrr,
        billing_status: args.billing_status,
        cancel_at_period_end: args.cancel_at_period_end,
        stripe_customer_id: args.stripe_customer_id ?? null,
        stripe_subscription_id: args.stripe_subscription_id ?? null,
        last_active_at: null,
        activated: false,
        core_used: false,
        usage_freq: 'WEEKLY',
        created_at: now,
        updated_at: now,
      });
    }

    const existing = await ctx.db
      .query('accounts')
      .withIndex('by_stripe_subscription', (q) =>
        q.eq('stripe_subscription_id', args.stripe_subscription_id),
      )
      .collect();

    if (existing.length > 0) {
      await ctx.db.patch(existing[0]._id, {
        email: args.email,
        name: args.name ?? null,
        mrr: args.mrr,
        billing_status: args.billing_status,
        cancel_at_period_end: args.cancel_at_period_end,
        stripe_customer_id: args.stripe_customer_id ?? null,
        updated_at: now,
      });
      return existing[0]._id;
    }

    return await ctx.db.insert('accounts', {
      founder_id: args.founderId,
      email: args.email,
      name: args.name ?? null,
      mrr: args.mrr,
      billing_status: args.billing_status,
      cancel_at_period_end: args.cancel_at_period_end,
      stripe_customer_id: args.stripe_customer_id ?? null,
      stripe_subscription_id: args.stripe_subscription_id,
      last_active_at: null,
      activated: false,
      core_used: false,
      usage_freq: 'WEEKLY',
      created_at: now,
      updated_at: now,
    });
  },
});

export const deleteAccountsByFounder = mutation({
  args: { founderId: v.id('founders') },
  handler: async (ctx, args) => {
    const accounts = await ctx.db
      .query('accounts')
      .withIndex('by_founder', (q) => q.eq('founder_id', args.founderId))
      .collect();

    for (const account of accounts) {
      await ctx.db.delete(account._id);
    }
  },
});
