import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { runMigrations, db } from '../src/db.js';
import { InvoiceService } from '../src/invoices.js';
import { hashPassword, generateMcpToken, hashMcpToken } from '../src/auth.js';

let testUserId: number;

before(async () => {
  await runMigrations();

  const token = generateMcpToken();
  const tokenHash = hashMcpToken(token);
  const passwordHash = await hashPassword('password123');

  const res = await db.execute(
    `INSERT INTO users (email, password_hash, mcp_token_hash) VALUES ($1, $2, $3)`,
    ['freelancer@example.com', passwordHash, tokenHash]
  );
  testUserId = res.lastInsertId || 1;

  await db.execute(
    `INSERT INTO profiles (user_id, business_name, state_code, gstin, upi_id, invoice_prefix, default_gst_rate)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [testUserId, 'Creative Studio', '29', '29ABCDE1234F1Z5', 'freelancer@upi', 'INV', 18]
  );
});

test('1. Sequential invoice numbering: INV/YYYY-YY/001', async () => {
  const { invoice: inv1 } = await InvoiceService.createInvoice(testUserId, {
    client_name: 'Acme Corp',
    client_state: 'Karnataka',
    items: [{ description: 'Logo design', quantity: 1, rate: 20000 }],
  });

  const { invoice: inv2 } = await InvoiceService.createInvoice(testUserId, {
    client_name: 'Beta Ltd',
    client_state: 'Karnataka',
    items: [{ description: 'Web design', quantity: 1, rate: 30000 }],
  });

  assert.match(inv1.number, /^INV\/\d{4}-\d{2}\/001$/);
  assert.match(inv2.number, /^INV\/\d{4}-\d{2}\/002$/);
  assert.notEqual(inv1.public_id, inv2.public_id);
});

test('2. Concurrent creation produces unique sequence numbers', async () => {
  const promises = [
    InvoiceService.createInvoice(testUserId, {
      client_name: 'Client Alpha',
      items: [{ description: 'Task A', quantity: 1, rate: 5000 }],
    }),
    InvoiceService.createInvoice(testUserId, {
      client_name: 'Client Beta',
      items: [{ description: 'Task B', quantity: 1, rate: 6000 }],
    }),
    InvoiceService.createInvoice(testUserId, {
      client_name: 'Client Gamma',
      items: [{ description: 'Task C', quantity: 1, rate: 7000 }],
    }),
  ];

  const results = await Promise.all(promises);
  const numbers = results.map(r => r.invoice.number);
  const uniqueNumbers = new Set(numbers);

  assert.equal(uniqueNumbers.size, 3, 'All 3 concurrent invoices must have distinct numbers');
});

test('3. Updating line items updates totals and tax breakdown', async () => {
  const { invoice: created } = await InvoiceService.createInvoice(testUserId, {
    client_name: 'Update Test Client',
    client_state: 'Karnataka',
    items: [{ description: 'Initial item', quantity: 1, rate: 10000 }],
    gst_rate: 18,
  });

  assert.equal(created.total_paise, 1180000); // ₹11,800.00

  const updated = await InvoiceService.updateInvoice(testUserId, created.number, {
    items: [
      { description: 'Item 1', quantity: 1, rate: 10000 },
      { description: 'Item 2', quantity: 1, rate: 5000 },
    ],
  });

  assert.equal(updated.subtotal_paise, 1500000); // ₹15,000.00
  assert.equal(updated.total_paise, 1770000);    // ₹17,700.00 (15,000 + 18%)
});

test('4. Mark paid updates status and stores paid details', async () => {
  const { invoice: created } = await InvoiceService.createInvoice(testUserId, {
    client_name: 'Payment Client',
    items: [{ description: 'Service', quantity: 1, rate: 8000 }],
  });

  const paid = await InvoiceService.markPaid(testUserId, created.number, '2026-11-10', 'UPI', 'Txn #12345');
  assert.equal(paid.status, 'paid');
  assert.equal(paid.paid_on, '2026-11-10');
  assert.equal(paid.paid_method, 'UPI');
});

test('5. List invoices filter and outstanding total calculation', async () => {
  const res = await InvoiceService.listInvoices(testUserId, { limit: 10 });
  assert.ok(res.invoices.length > 0);
  assert.ok(res.outstandingTotalPaise >= 0);
});

