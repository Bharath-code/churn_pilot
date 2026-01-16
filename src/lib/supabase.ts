import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';
import type { Database } from './database.types.js';

// Service role client for server-side operations
export const supabase = createClient<Database>(
  config.SUPABASE_URL,
  config.SUPABASE_SERVICE_ROLE_KEY,
);

// Types for database operations
export type Founder = Database['public']['Tables']['founders']['Row'];
export type FounderInsert = Database['public']['Tables']['founders']['Insert'];
export type Account = Database['public']['Tables']['accounts']['Row'];
export type AccountInsert = Database['public']['Tables']['accounts']['Insert'];
export type DecisionLog = Database['public']['Tables']['decision_logs']['Row'];
export type DecisionLogInsert = Database['public']['Tables']['decision_logs']['Insert'];
