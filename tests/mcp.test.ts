import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { runMigrations, db } from '../src/db.js';
import { hashPassword, generateMcpToken, hashMcpToken, authenticateMcpToken } from '../src/auth.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerMcpTools } from '../src/mcp.js';

let rawToken: string;
let authenticatedUser: any;
let mcpServer: McpServer;

before(async () => {
  await runMigrations();

  rawToken = generateMcpToken();
  const tokenHash = hashMcpToken(rawToken);
  const passwordHash = await hashPassword('password123');

  const res = await db.execute(
    `INSERT INTO users (email, password_hash, mcp_token_hash) VALUES ($1, $2, $3)`,
    ['mcp_tester@example.com', passwordHash, tokenHash]
  );
  const userId = res.lastInsertId || 1;

  await db.execute(
    `INSERT INTO profiles (user_id, business_name, state_code, gstin, upi_id, invoice_prefix, default_gst_rate)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [userId, 'Test Agency', '29', '29ABCDE1234F1Z5', 'agency@upi', 'INV', 18]
  );

  authenticatedUser = await authenticateMcpToken(rawToken);
  assert.ok(authenticatedUser, 'User must authenticate with token');

  mcpServer = new McpServer({ name: 'InvoiceDeskTest', version: '1.0.0' });
  registerMcpTools(mcpServer, authenticatedUser);
});

test('MCP Tool 1: create_invoice creates invoice with correct tax split & links', async () => {
  const tools = (mcpServer as any)._registeredTools;
  assert.ok(tools['create_invoice'], 'create_invoice tool must be registered');

  const handler = tools['create_invoice'].handler;
  const result = await handler({
    client_name: 'Acme Design Pvt Ltd',
    client_state: 'Karnataka',
    items: [{ description: 'March brand design work', quantity: 1, rate: 45000 }],
    gst_rate: 18,
    due_in_days: 15,
  });

  assert.equal(result.isError, undefined);
  const text = result.content[0].text;
  assert.match(text, /Invoice created successfully/);
  assert.match(text, /Invoice Number: INV\/\d{4}-\d{2}\/001/);
  assert.match(text, /Total: ₹53,100\.00/);
  assert.match(text, /CGST \(9%\): ₹4,050\.00/);
  assert.match(text, /SGST \(9%\): ₹4,050\.00/);
  assert.match(text, /Public Link:/);
  assert.match(text, /Dashboard Link:/);
});

test('MCP Tool 2: list_invoices lists compact items and outstanding total', async () => {
  const tools = (mcpServer as any)._registeredTools;
  const handler = tools['list_invoices'].handler;

  const result = await handler({});
  assert.equal(result.isError, undefined);
  const text = result.content[0].text;
  assert.match(text, /Found 1 invoice\(s\)/);
  assert.match(text, /Acme Design Pvt Ltd/);
});

test('MCP Tool 3: get_invoice retrieves full details', async () => {
  const tools = (mcpServer as any)._registeredTools;
  const handler = tools['get_invoice'].handler;

  const result = await handler({ invoice_ref: '1' });
  assert.equal(result.isError, undefined);
  const text = result.content[0].text;
  assert.match(text, /Acme Design Pvt Ltd/);
  assert.match(text, /March brand design work/);
});

test('MCP Tool 4: update_invoice modifies fields', async () => {
  const tools = (mcpServer as any)._registeredTools;
  const handler = tools['update_invoice'].handler;

  const result = await handler({
    invoice_ref: '1',
    notes: 'Updated payment notes',
  });
  assert.equal(result.isError, undefined);
  assert.match(result.content[0].text, /updated successfully/);
});

test('MCP Tool 5: save_reminder_draft queues reminder', async () => {
  const tools = (mcpServer as any)._registeredTools;
  const handler = tools['save_reminder_draft'].handler;

  const result = await handler({
    invoice_ref: '1',
    message: 'Please pay invoice soon.',
    channel: 'whatsapp',
  });
  assert.equal(result.isError, undefined);
  assert.match(result.content[0].text, /Reminder draft saved/);
});

test('MCP Tool 6: mark_paid marks invoice as paid', async () => {
  const tools = (mcpServer as any)._registeredTools;
  const handler = tools['mark_paid'].handler;

  const result = await handler({
    invoice_ref: '1',
    paid_on: '2026-11-10',
    method: 'UPI',
  });
  assert.equal(result.isError, undefined);
  assert.match(result.content[0].text, /marked as PAID/);
});

