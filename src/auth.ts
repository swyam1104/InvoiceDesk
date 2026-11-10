// Authentication and User Security for InvoiceDesk
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db } from './db.js';
import type { Request, Response, NextFunction } from 'express';

export interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  mcp_token_hash: string;
  last_mcp_call_at?: string;
  created_at: string;
}

export interface ProfileRow {
  user_id: number;
  business_name: string;
  address: string;
  state_code: string;
  gstin: string;
  pan: string;
  upi_id: string;
  default_gst_rate: number;
  default_terms_days: number;
  invoice_prefix: string;
  gst_registered: boolean;
  plan: string;
}

export interface AuthenticatedUser {
  id: number;
  email: string;
  profile: ProfileRow;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Generate raw 32+ byte base64url MCP token
export function generateMcpToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

// Hash token for database storage
export function hashMcpToken(token: string): string {
  return crypto.createHash('sha256').update(token.trim()).digest('hex');
}

// Generate unguessable 14-char public ID for public invoice links
export function generatePublicId(): string {
  // Nanoid / unguessable 14 chars
  return crypto.randomBytes(11).toString('base64url').substring(0, 14);
}

// Look up user by raw MCP token (hashes it first and checks database)
export async function authenticateMcpToken(rawToken: string): Promise<AuthenticatedUser | null> {
  if (!rawToken || rawToken.trim() === '') return null;
  const tokenHash = hashMcpToken(rawToken);

  const user = await db.queryOne<UserRow>(
    `SELECT * FROM users WHERE mcp_token_hash = $1`,
    [tokenHash]
  );

  if (!user) return null;

  // Update last_mcp_call_at
  const now = new Date().toISOString();
  await db.execute(
    `UPDATE users SET last_mcp_call_at = $1 WHERE id = $2`,
    [now, user.id]
  );

  const profile = await db.queryOne<ProfileRow>(
    `SELECT * FROM profiles WHERE user_id = $1`,
    [user.id]
  );

  const defaultProfile: ProfileRow = {
    user_id: user.id,
    business_name: '',
    address: '',
    state_code: '29',
    gstin: '',
    pan: '',
    upi_id: '',
    default_gst_rate: 18,
    default_terms_days: 15,
    invoice_prefix: 'INV',
    gst_registered: true,
    plan: 'free',
  };

  return {
    id: user.id,
    email: user.email,
    profile: profile || defaultProfile,
  };
}

// Middleware to ensure user is logged in
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const userId = (req.session as any)?.userId;
  if (!userId) {
    res.redirect('/login');
    return;
  }

  const user = await db.queryOne<UserRow>(`SELECT * FROM users WHERE id = $1`, [userId]);
  if (!user) {
    delete (req.session as any).userId;
    res.redirect('/login');
    return;
  }

  const profile = await db.queryOne<ProfileRow>(`SELECT * FROM profiles WHERE user_id = $1`, [userId]);
  (req as any).user = {
    id: user.id,
    email: user.email,
    last_mcp_call_at: user.last_mcp_call_at,
    profile: profile || {
      user_id: user.id,
      business_name: '',
      address: '',
      state_code: '29',
      gstin: '',
      pan: '',
      upi_id: '',
      default_gst_rate: 18,
      default_terms_days: 15,
      invoice_prefix: 'INV',
      gst_registered: true,
      plan: 'free',
    },
  };

  next();
}

