// Generated database types for Supabase
// Run: npx supabase gen types typescript --project-id oivtkueqhjewonebjhdo > src/lib/database.types.ts

export interface Database {
  public: {
    Tables: {
      founders: {
        Row: {
          id: string;
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
        Insert: {
          id?: string;
          email: string;
          company: string;
          plan?: 'trial' | 'pro' | 'paused';
          trial_ends_at?: string | null;
          service_paused?: boolean;
          stripe_api_key?: string | null;
          stripe_access_token?: string | null;
          stripe_refresh_token?: string | null;
          stripe_account_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          company?: string;
          plan?: 'trial' | 'pro' | 'paused';
          trial_ends_at?: string | null;
          service_paused?: boolean;
          stripe_api_key?: string | null;
          stripe_access_token?: string | null;
          stripe_refresh_token?: string | null;
          stripe_account_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      accounts: {
        Row: {
          id: string;
          founder_id: string;
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
        Insert: {
          id?: string;
          founder_id: string;
          email: string;
          name?: string | null;
          mrr?: number;
          last_active_at?: string | null;
          activated?: boolean;
          core_used?: boolean;
          usage_freq?: 'DAILY' | 'WEEKLY';
          billing_status?: 'ACTIVE' | 'PAYMENT_FAILED' | 'CANCELING' | 'CANCELED';
          cancel_at_period_end?: boolean;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          founder_id?: string;
          email?: string;
          name?: string | null;
          mrr?: number;
          last_active_at?: string | null;
          activated?: boolean;
          core_used?: boolean;
          usage_freq?: 'DAILY' | 'WEEKLY';
          billing_status?: 'ACTIVE' | 'PAYMENT_FAILED' | 'CANCELING' | 'CANCELED';
          cancel_at_period_end?: boolean;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      decision_logs: {
        Row: {
          id: string;
          account_id: string;
          rule_id: string;
          risk_level: 'HIGH' | 'MEDIUM' | 'HEALTHY';
          action: 'SEND_MESSAGE' | 'DO_NOTHING';
          explanation: string | null;
          message: string | null;
          fallback_used: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          rule_id: string;
          risk_level: 'HIGH' | 'MEDIUM' | 'HEALTHY';
          action: 'SEND_MESSAGE' | 'DO_NOTHING';
          explanation?: string | null;
          message?: string | null;
          fallback_used?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          account_id?: string;
          rule_id?: string;
          risk_level?: 'HIGH' | 'MEDIUM' | 'HEALTHY';
          action?: 'SEND_MESSAGE' | 'DO_NOTHING';
          explanation?: string | null;
          message?: string | null;
          fallback_used?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      digest_logs: {
        Row: {
          id: string;
          founder_id: string;
          sent_at: string;
          account_count: number;
          risk_count: number;
        };
        Insert: {
          id?: string;
          founder_id: string;
          sent_at?: string;
          account_count?: number;
          risk_count?: number;
        };
        Update: {
          id?: string;
          founder_id?: string;
          sent_at?: string;
          account_count?: number;
          risk_count?: number;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
