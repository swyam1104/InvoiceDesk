// Seed script for Reviewer Account
// Run with: npm run seed:reviewer
import { runMigrations, db } from '../db.js';
import { hashPassword, hashMcpToken } from '../auth.js';

export const REVIEWER_EMAIL = 'reviewer@invoicedesk.dev';
export const REVIEWER_PASSWORD = 'ReviewerPassword2026!';
export const REVIEWER_RAW_TOKEN = 'reviewer-mcp-token-test-2026-volopay';

export async function seedReviewer() {
  console.log('Seeding reviewer account...');
  await runMigrations();

  const tokenHash = hashMcpToken(REVIEWER_RAW_TOKEN);
  const passwordHash = await hashPassword(REVIEWER_PASSWORD);

  // Check if exists
  const existing = await db.queryOne<{ id: number }>(
    `SELECT id FROM users WHERE email = $1`,
    [REVIEWER_EMAIL]
  );

  let userId: number;
  if (existing) {
    userId = existing.id;
    await db.execute(
      `UPDATE users SET password_hash = $1, mcp_token_hash = $2 WHERE id = $3`,
      [passwordHash, tokenHash, userId]
    );
    // Delete any previous invoices for reviewer account so it starts with ZERO invoices
    await db.execute(`DELETE FROM invoices WHERE user_id = $1`, [userId]);
    await db.execute(`DELETE FROM clients WHERE user_id = $1`, [userId]);
  } else {
    const res = await db.execute(
      `INSERT INTO users (email, password_hash, mcp_token_hash) VALUES ($1, $2, $3)`,
      [REVIEWER_EMAIL, passwordHash, tokenHash]
    );
    userId = res.lastInsertId || (await db.queryOne<{ id: number }>(`SELECT id FROM users WHERE email = $1`, [REVIEWER_EMAIL]))!.id;
  }

  // Pre-fill profile: state, UPI ID, GST registered, zero invoices
  const existingProfile = await db.queryOne(
    `SELECT user_id FROM profiles WHERE user_id = $1`,
    [userId]
  );

  if (existingProfile) {
    await db.execute(
      `UPDATE profiles SET
        business_name = 'Reviewer Freelance Studio',
        address = '100 Feet Road, Indiranagar, Bengaluru, Karnataka 560038',
        state_code = '29',
        gstin = '29AABCI1234F1Z5',
        pan = 'AABCI1234F',
        upi_id = 'reviewer@okaxis',
        default_gst_rate = 18,
        default_terms_days = 15,
        invoice_prefix = 'INV',
        gst_registered = TRUE,
        plan = 'free'
       WHERE user_id = $1`,
      [userId]
    );
  } else {
    await db.execute(
      `INSERT INTO profiles (
        user_id, business_name, address, state_code, gstin, pan,
        upi_id, default_gst_rate, default_terms_days, invoice_prefix, gst_registered, plan
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        userId,
        'Reviewer Freelance Studio',
        '100 Feet Road, Indiranagar, Bengaluru, Karnataka 560038',
        '29', // Karnataka
        '29AABCI1234F1Z5',
        'AABCI1234F',
        'reviewer@okaxis',
        18,
        15,
        'INV',
        true,
        'free',
      ]
    );
  }

  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  console.log('✅ Reviewer account seeded successfully!');
  console.log('--------------------------------------------------');
  console.log(`Email:      ${REVIEWER_EMAIL}`);
  console.log(`Password:   ${REVIEWER_PASSWORD}`);
  console.log(`MCP URL:    ${baseUrl}/mcp/${REVIEWER_RAW_TOKEN}`);
  console.log(`Invoices:   0 (Starts clean as required by PRD)`);
  console.log('--------------------------------------------------');
}

if (process.argv[1]?.endsWith('reviewer.ts') || process.argv[1]?.endsWith('reviewer.js')) {
  seedReviewer().catch(console.error);
}
