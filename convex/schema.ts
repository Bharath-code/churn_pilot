import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  founders: defineTable({
    email: v.string(),
    company: v.string(),
    plan: v.union(v.literal('trial'), v.literal('pro'), v.literal('paused')),
    trial_ends_at: v.optional(v.string()),
    service_paused: v.boolean(),
    stripe_api_key: v.optional(v.string()),
    stripe_access_token: v.optional(v.string()),
    stripe_refresh_token: v.optional(v.string()),
    stripe_account_id: v.optional(v.string()),
    created_at: v.string(),
    updated_at: v.string(),
  })
    .index('by_email', ['email'])
    .index('by_stripe_account', ['stripe_account_id']),

  accounts: defineTable({
    founder_id: v.id('founders'),
    email: v.string(),
    name: v.optional(v.string()),
    mrr: v.number(),
    last_active_at: v.optional(v.string()),
    activated: v.boolean(),
    core_used: v.boolean(),
    usage_freq: v.union(v.literal('DAILY'), v.literal('WEEKLY')),
    billing_status: v.union(
      v.literal('ACTIVE'),
      v.literal('PAYMENT_FAILED'),
      v.literal('CANCELING'),
      v.literal('CANCELED'),
    ),
    cancel_at_period_end: v.boolean(),
    stripe_customer_id: v.optional(v.string()),
    stripe_subscription_id: v.optional(v.string()),
    created_at: v.string(),
    updated_at: v.string(),
  })
    .index('by_founder', ['founder_id'])
    .index('by_stripe_subscription', ['stripe_subscription_id'])
    .index('by_billing_status', ['billing_status']),

  decision_logs: defineTable({
    account_id: v.id('accounts'),
    rule_id: v.string(),
    risk_level: v.union(v.literal('HIGH'), v.literal('MEDIUM'), v.literal('HEALTHY')),
    action: v.union(v.literal('SEND_MESSAGE'), v.literal('DO_NOTHING')),
    explanation: v.optional(v.string()),
    message: v.optional(v.string()),
    fallback_used: v.boolean(),
    created_at: v.string(),
  })
    .index('by_account', ['account_id'])
    .index('by_created', ['created_at']),

  digest_logs: defineTable({
    founder_id: v.id('founders'),
    account_count: v.number(),
    risk_count: v.number(),
    sent_at: v.string(),
  })
    .index('by_founder', ['founder_id'])
    .index('by_sent_at', ['sent_at']),

  audit_leads: defineTable({
    email: v.string(),
    company: v.optional(v.string()),
    mrr_at_risk: v.number(),
    at_risk_count: v.number(),
    created_at: v.string(),
  }).index('by_email', ['email']),
});
