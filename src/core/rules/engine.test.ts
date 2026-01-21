import assert from 'node:assert';
import { describe, it } from 'node:test';
import { evaluateAccount } from './engine.js';
import type { Account } from './types.js';

function createAccount(overrides: Partial<Account> = {}): Account {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

  return {
    _id: 'test-account-1',
    founder_id: 'test-founder-1',
    email: 'customer@example.com',
    name: 'Test Customer',
    mrr: 99,
    last_active_at: twoDaysAgo.toISOString(),
    activated: true,
    core_used: true,
    usage_freq: 'WEEKLY',
    billing_status: 'ACTIVE',
    cancel_at_period_end: false,
    stripe_customer_id: 'cus_test',
    stripe_subscription_id: 'sub_test',
    created_at: thirtyDaysAgo.toISOString(),
    updated_at: now.toISOString(),
    ...overrides,
  };
}

describe('Rules Engine', () => {
  describe('H4 — Pre-Cancel', () => {
    it('should trigger when cancel_at_period_end is true', () => {
      const account = createAccount({ cancel_at_period_end: true });
      const result = evaluateAccount(account);

      assert.strictEqual(result.ruleId, 'H4');
      assert.strictEqual(result.riskLevel, 'HIGH');
      assert.strictEqual(result.suggestedAction, 'SEND_MESSAGE');
    });
  });

  describe('H3 — Payment Failure', () => {
    it('should trigger when billing_status is PAYMENT_FAILED', () => {
      const account = createAccount({ billing_status: 'PAYMENT_FAILED' });
      const result = evaluateAccount(account);

      assert.strictEqual(result.ruleId, 'H3');
      assert.strictEqual(result.riskLevel, 'HIGH');
    });
  });

  describe('H2 — Never Activated', () => {
    it('should trigger when not activated and account age > 7 days', () => {
      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      const account = createAccount({
        activated: false,
        created_at: tenDaysAgo.toISOString(),
      });
      const result = evaluateAccount(account);

      assert.strictEqual(result.ruleId, 'H2');
      assert.strictEqual(result.riskLevel, 'HIGH');
    });

    it('should NOT trigger when account age <= 7 days', () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      const account = createAccount({
        activated: false,
        created_at: threeDaysAgo.toISOString(),
      });
      const result = evaluateAccount(account);

      assert.notStrictEqual(result.ruleId, 'H2');
    });
  });

  describe('H1 — Silent Drop-off', () => {
    it('should trigger for DAILY users inactive > 7 days', () => {
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
      const account = createAccount({
        usage_freq: 'DAILY',
        activated: true,
        last_active_at: eightDaysAgo.toISOString(),
      });
      const result = evaluateAccount(account);

      assert.strictEqual(result.ruleId, 'H1');
      assert.strictEqual(result.riskLevel, 'HIGH');
    });

    it('should trigger for WEEKLY users inactive > 14 days', () => {
      const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
      const account = createAccount({
        usage_freq: 'WEEKLY',
        activated: true,
        last_active_at: fifteenDaysAgo.toISOString(),
      });
      const result = evaluateAccount(account);

      assert.strictEqual(result.ruleId, 'H1');
      assert.strictEqual(result.riskLevel, 'HIGH');
    });

    it('should NOT trigger for WEEKLY users inactive <= 14 days', () => {
      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      const account = createAccount({
        usage_freq: 'WEEKLY',
        activated: true,
        last_active_at: tenDaysAgo.toISOString(),
      });
      const result = evaluateAccount(account);

      assert.notStrictEqual(result.ruleId, 'H1');
    });
  });

  describe('M1 — Low Engagement', () => {
    it('should trigger when inactive > 4 days and core_used is false', () => {
      const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
      const account = createAccount({
        core_used: false,
        last_active_at: fiveDaysAgo.toISOString(),
      });
      const result = evaluateAccount(account);

      assert.strictEqual(result.ruleId, 'M1');
      assert.strictEqual(result.riskLevel, 'MEDIUM');
    });
  });

  describe('Healthy (Default)', () => {
    it('should return HEALTHY for active users with core usage', () => {
      const account = createAccount(); // Defaults are healthy
      const result = evaluateAccount(account);

      assert.strictEqual(result.ruleId, 'G1');
      assert.strictEqual(result.riskLevel, 'HEALTHY');
      assert.strictEqual(result.suggestedAction, 'DO_NOTHING');
    });
  });

  describe('Priority Order', () => {
    it('should return H4 (Pre-Cancel) over H3 (Payment Failure)', () => {
      const account = createAccount({
        cancel_at_period_end: true,
        billing_status: 'PAYMENT_FAILED',
      });
      const result = evaluateAccount(account);

      assert.strictEqual(result.ruleId, 'H4', 'H4 should take priority over H3');
    });

    it('should return H3 (Payment Failure) over H1 (Silent Drop-off)', () => {
      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      const account = createAccount({
        billing_status: 'PAYMENT_FAILED',
        usage_freq: 'DAILY',
        last_active_at: tenDaysAgo.toISOString(),
      });
      const result = evaluateAccount(account);

      assert.strictEqual(result.ruleId, 'H3', 'H3 should take priority over H1');
    });
  });
});
