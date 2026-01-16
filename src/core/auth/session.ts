import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { config } from '../../config.js';

/**
 * Simple session management using signed cookies.
 * Session contains the founder ID.
 */

const COOKIE_NAME = 'churnpilot_session';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

/**
 * Simple signature using HMAC-like approach without crypto dependency
 * For production, use proper HMAC
 */
function sign(value: string, secret: string): string {
  // Simple hash for dev - in production use crypto.createHmac
  let hash = 0;
  const str = value + secret;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return `${value}.${Math.abs(hash).toString(36)}`;
}

function verify(signedValue: string, secret: string): string | null {
  const lastDot = signedValue.lastIndexOf('.');
  if (lastDot === -1) return null;

  const value = signedValue.substring(0, lastDot);
  const expectedSigned = sign(value, secret);

  if (signedValue === expectedSigned) {
    return value;
  }
  return null;
}

/**
 * Create a session for a founder
 */
export function createSession(c: Context, founderId: string): void {
  const signedValue = sign(founderId, config.SESSION_SECRET);

  setCookie(c, COOKIE_NAME, signedValue, {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    maxAge: COOKIE_MAX_AGE,
  });
}

/**
 * Get the founder ID from session, or null if not logged in
 */
export function getSession(c: Context): string | null {
  const cookie = getCookie(c, COOKIE_NAME);
  if (!cookie) return null;

  return verify(cookie, config.SESSION_SECRET);
}

/**
 * Destroy the session (logout)
 */
export function destroySession(c: Context): void {
  deleteCookie(c, COOKIE_NAME, {
    path: '/',
  });
}

/**
 * Require authentication middleware
 * Redirects to landing page if not authenticated
 */
export async function requireAuth(
  c: Context,
  next: () => Promise<void>,
): Promise<Response | undefined> {
  const founderId = getSession(c);

  if (!founderId) {
    return c.redirect('/');
  }

  // Add founder ID to context for handlers
  c.set('founderId', founderId);

  await next();
  return undefined;
}
