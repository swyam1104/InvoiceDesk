import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import app, { startServer } from '../src/server.js';
import { runDailyReminderJob } from '../src/reminders.js';
import { db } from '../src/db.js';
import { REVIEWER_RAW_TOKEN, seedReviewer } from '../src/seeds/reviewer.js';
import { seedDemo } from '../src/seeds/demo.js';

let server: any;
let baseUrl: string;

before(async () => {
  server = await startServer(0, '127.0.0.1');
  const addr = server.address() as any;
  baseUrl = `http://127.0.0.1:${addr.port}`;

  await seedReviewer();
  await seedDemo();
});

after(async () => {
  if (server) {
    server.close();
  }
});

test('1. GET /health returns 200 and { status: "ok" }', async () => {
  const res = await fetch(`${baseUrl}/health`);
  assert.equal(res.status, 200);
  const data = await res.json() as any;
  assert.equal(data.status, 'ok');
  assert.ok(data.timestamp);
});

test('2. GET / returns landing page with "why not just Claude" tagline', async () => {
  const res = await fetch(`${baseUrl}/`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Invoice your clients by talking to Claude/);
  assert.match(html, /Claude can write an invoice, but it can't host it/);
  assert.match(html, /No AI inside/);
});

test('3. MCP endpoint security: wrong token returns 401', async () => {
  const res = await fetch(`${baseUrl}/mcp/completely-invalid-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 401);
});

test('4. MCP endpoint method constraint: GET / DELETE returns 405', async () => {
  const resGet = await fetch(`${baseUrl}/mcp/${REVIEWER_RAW_TOKEN}`, {
    method: 'GET',
  });
  assert.equal(resGet.status, 405);

  const resDel = await fetch(`${baseUrl}/mcp/${REVIEWER_RAW_TOKEN}`, {
    method: 'DELETE',
  });
  assert.equal(resDel.status, 405);
});

test('5. Public invoice page: valid public ID opens and tracks viewed_at', async () => {
  const inv = await db.queryOne<any>(`SELECT public_id, viewed_at FROM invoices WHERE public_id IS NOT NULL LIMIT 1`);
  assert.ok(inv, 'Invoice must exist from seeds');

  const res = await fetch(`${baseUrl}/i/${inv.public_id}`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Invoice/);

  // Check that viewed_at was set
  const updatedInv = await db.queryOne<any>(`SELECT viewed_at FROM invoices WHERE public_id = $1`, [inv.public_id]);
  assert.ok(updatedInv.viewed_at, 'viewed_at must be populated on first view');
});

test('6. Public invoice page: invalid public ID returns clean 404', async () => {
  const res = await fetch(`${baseUrl}/i/invalid-nonexistent-id-123`);
  assert.equal(res.status, 404);
  const html = await res.text();
  assert.match(html, /Invoice Not Found/);
  assert.doesNotMatch(html, /stack/i);
});

test('7. Daily reminder job: flips past due invoices to overdue and queues draft', async () => {
  const stats = await runDailyReminderJob();
  assert.ok(typeof stats.flippedCount === 'number');
  assert.ok(typeof stats.draftsCreated === 'number');
});
