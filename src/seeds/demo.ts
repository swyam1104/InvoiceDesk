// Seed script for Demo Account
// Run with: npm run seed:demo
// Creates 3 sample invoices (one paid, one overdue, one sent) for demo recordings
import { runMigrations, db } from '../db.js';
import { hashPassword, hashMcpToken } from '../auth.js';
import { InvoiceService } from '../invoices.js';

export const DEMO_EMAIL = 'demo@invoicedesk.dev';
export const DEMO_PASSWORD = 'DemoPassword2026!';
export const DEMO_RAW_TOKEN = 'demo-mcp-token-freelancer-2026';

export async function seedDemo() {
  console.log('Seeding demo account with 3 sample invoices...');
  await runMigrations();

  const tokenHash = hashMcpToken(DEMO_RAW_TOKEN);
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const existing = await db.queryOne<{ id: number }>(
    `SELECT id FROM users WHERE email = $1`,
    [DEMO_EMAIL]
  );

  let userId: number;
  if (existing) {
    userId = existing.id;
    await db.execute(`DELETE FROM invoices WHERE user_id = $1`, [userId]);
    await db.execute(`DELETE FROM clients WHERE user_id = $1`, [userId]);
  } else {
    const res = await db.execute(
      `INSERT INTO users (email, password_hash, mcp_token_hash) VALUES ($1, $2, $3)`,
      [DEMO_EMAIL, passwordHash, tokenHash]
    );
    userId = res.lastInsertId || (await db.queryOne<{ id: number }>(`SELECT id FROM users WHERE email = $1`, [DEMO_EMAIL]))!.id;
  }

  // Set Profile
  const existingProfile = await db.queryOne(`SELECT user_id FROM profiles WHERE user_id = $1`, [userId]);
  if (!existingProfile) {
    await db.execute(
      `INSERT INTO profiles (
        user_id, business_name, address, state_code, gstin, pan,
        upi_id, default_gst_rate, default_terms_days, invoice_prefix, gst_registered, plan
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        userId,
        'Riya Creative Works',
        '42 Koramangala 4th Block, Bengaluru, Karnataka 560034',
        '29',
        '29AABCR9876K1Z1',
        'AABCR9876K',
        'riya.design@upi',
        18,
        15,
        'INV',
        true,
        'free',
      ]
    );
  }

  // 1. Invoice 1: Paid invoice
  const { invoice: inv1 } = await InvoiceService.createInvoice(userId, {
    client_name: 'Nexus Digital Technologies',
    client_email: 'accounts@nexusdigital.in',
    client_gstin: '29AABCN1234F1Z8',
    client_state: 'Karnataka',
    items: [
      { description: 'UI/UX Redesign - Mobile App', quantity: 1, rate: 65000 },
      { description: 'Design System Documentation', quantity: 1, rate: 15000 },
    ],
    gst_rate: 18,
    due_in_days: 15,
    send: true,
    created_via: 'claude',
  });
  await InvoiceService.markPaid(userId, inv1.number, '2026-11-05', 'UPI', 'UPI/Axis/43219876');

  // 2. Invoice 2: Overdue invoice (due date in the past)
  const pastDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!;
  const { invoice: inv2 } = await InvoiceService.createInvoice(userId, {
    client_name: 'Acme Design Pvt Ltd',
    client_email: 'finance@acmedesign.com',
    client_gstin: '29ABCDE1234F1Z5',
    client_state: 'Karnataka',
    items: [
      { description: 'March brand design work', quantity: 1, rate: 45000 },
    ],
    gst_rate: 18,
    due_date: pastDate,
    send: true,
    created_via: 'claude',
  });
  // Update status directly to overdue
  await db.execute(`UPDATE invoices SET status = 'overdue' WHERE id = $1`, [inv2.id]);
  // Queue a reminder draft
  await InvoiceService.saveReminderDraft(
    userId,
    inv2.number,
    `Hi Acme Design Pvt Ltd, following up on invoice ${inv2.number} for ₹53,100.00, which is now 10 days overdue. Please arrange payment at your earliest convenience.`,
    'whatsapp'
  );

  // 3. Invoice 3: Sent invoice (active, due in future)
  const futureDate = new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!;
  await InvoiceService.createInvoice(userId, {
    client_name: 'FinScale Ventures (Delhi)',
    client_email: 'invoicing@finscale.io',
    client_gstin: '07AAACF5432G1Z2',
    client_state: 'Delhi',
    items: [
      { description: 'Full-Stack Web Development - Sprint 1', quantity: 1, rate: 80000 },
      { description: 'API Integration & Webhooks', quantity: 1, rate: 20000 },
    ],
    gst_rate: 18,
    due_date: futureDate,
    send: true,
    created_via: 'claude',
  });

  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  console.log('✅ Demo account seeded successfully with 3 invoices!');
  console.log('--------------------------------------------------');
  console.log(`Email:      ${DEMO_EMAIL}`);
  console.log(`Password:   ${DEMO_PASSWORD}`);
  console.log(`MCP URL:    ${baseUrl}/mcp/${DEMO_RAW_TOKEN}`);
  console.log(`Invoices:   1 Paid, 1 Overdue (with ready reminder), 1 Sent`);
  console.log('--------------------------------------------------');
}

if (process.argv[1]?.endsWith('demo.ts') || process.argv[1]?.endsWith('demo.js')) {
  seedDemo().catch(console.error);
}
