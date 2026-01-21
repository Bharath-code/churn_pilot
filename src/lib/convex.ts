import { ConvexHttpClient } from 'convex/browser';
import { anyApi } from 'convex/server';

const CONVEX_URL = process.env.CONVEX_URL || 'http://localhost:3210';

export const convex = new ConvexHttpClient(CONVEX_URL);
export const api = anyApi;

export type Founder = {
  _id: Id<'founders'>;
  email: string;
  company: string;
  plan: 'trial' | 'pro' | 'paused';
  trial_ends_at: string | null;
  service_paused: boolean;
  stripe_api_key: string | null;
  stripe_access_token: string | null;
  stripe_refresh_token: string | null;
  stripe_account_id: string | null;
  created_at: string;
  updated_at: string;
};

export type Account = {
  _id: Id<'accounts'>;
  founder_id: Id<'founders'>;
  email: string;
  name: string | null;
  mrr: number;
  last_active_at: string | null;
  activated: boolean;
  core_used: boolean;
  usage_freq: 'DAILY' | 'WEEKLY';
  billing_status: 'ACTIVE' | 'PAYMENT_FAILED' | 'CANCELING' | 'CANCELED';
  cancel_at_period_end: boolean;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  created_at: string;
  updated_at: string;
};

export type DecisionLog = {
  _id: Id<'decision_logs'>;
  account_id: Id<'accounts'>;
  rule_id: string;
  risk_level: 'HIGH' | 'MEDIUM' | 'HEALTHY';
  action: 'SEND_MESSAGE' | 'DO_NOTHING';
  explanation: string | null;
  message: string | null;
  fallback_used: boolean;
  created_at: string;
};

export type DigestLog = {
  _id: Id<'digest_logs'>;
  founder_id: Id<'founders'>;
  account_count: number;
  risk_count: number;
  sent_at: string;
};

export type AuditLead = {
  _id: Id<'audit_leads'>;
  email: string;
  company: string | null;
  mrr_at_risk: number;
  at_risk_count: number;
  created_at: string;
};

type Id<_TableName extends string> = string;
