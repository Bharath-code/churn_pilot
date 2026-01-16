import { z } from 'zod';

const envSchema = z.object({
  // Supabase
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // Stripe OAuth (optional - only needed for legacy OAuth flow)
  STRIPE_CLIENT_ID: z.string().startsWith('ca_').optional(),
  STRIPE_CLIENT_SECRET: z.string().startsWith('sk_').optional(),

  // Google Gemini (free tier)
  GEMINI_API_KEY: z.string().optional(),

  // Resend
  RESEND_API_KEY: z.string().startsWith('re_'),

  // App
  PORT: z.coerce.number().default(3000),
  BASE_URL: z.string().url().default('http://localhost:3000'),
  SESSION_SECRET: z.string().min(32).default('churnpilot-dev-secret-32-chars!!'),

  // DodoPayments
  DODO_API_KEY: z.string().optional(),
  DODO_WEBHOOK_SECRET: z.string().optional(),
  DODO_PRODUCT_ID: z.string().optional(), // Pro subscription product ID
});

export type Env = z.infer<typeof envSchema>;

function loadConfig(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    console.error(result.error.format());
    process.exit(1);
  }

  return result.data;
}

export const config = loadConfig();
