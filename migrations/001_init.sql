-- InvoiceDesk Database Schema
-- Compatible with PostgreSQL and SQLite

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  mcp_token_hash TEXT NOT NULL,
  last_mcp_call_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  business_name TEXT DEFAULT '',
  address TEXT DEFAULT '',
  state_code TEXT DEFAULT '',
  gstin TEXT DEFAULT '',
  pan TEXT DEFAULT '',
  upi_id TEXT DEFAULT '',
  default_gst_rate INTEGER DEFAULT 18,
  default_terms_days INTEGER DEFAULT 15,
  invoice_prefix TEXT DEFAULT 'INV',
  gst_registered BOOLEAN DEFAULT TRUE,
  plan TEXT DEFAULT 'free'
);

CREATE TABLE IF NOT EXISTS clients (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  gstin TEXT DEFAULT '',
  state_code TEXT DEFAULT '',
  address TEXT DEFAULT '',
  created_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS invoices (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  public_id TEXT NOT NULL UNIQUE,
  fy TEXT NOT NULL,
  seq INTEGER NOT NULL,
  number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  issue_date DATE NOT NULL,
  due_date DATE,
  gst_rate INTEGER DEFAULT 18,
  supply_type TEXT NOT NULL DEFAULT 'none',
  subtotal_paise BIGINT NOT NULL DEFAULT 0,
  cgst_paise BIGINT NOT NULL DEFAULT 0,
  sgst_paise BIGINT NOT NULL DEFAULT 0,
  igst_paise BIGINT NOT NULL DEFAULT 0,
  roundoff_paise INTEGER NOT NULL DEFAULT 0,
  total_paise BIGINT NOT NULL DEFAULT 0,
  notes TEXT DEFAULT '',
  paid_on DATE,
  paid_method TEXT DEFAULT '',
  created_via TEXT NOT NULL DEFAULT 'dashboard',
  viewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  UNIQUE(user_id, fy, seq)
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id SERIAL PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL,
  hsn_sac TEXT DEFAULT '',
  qty NUMERIC NOT NULL DEFAULT 1,
  rate_paise BIGINT NOT NULL DEFAULT 0,
  amount_paise BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS reminders (
  id SERIAL PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_by TEXT NOT NULL DEFAULT 'cron',
  created_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_invoices_user ON invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_public ON invoices(public_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(user_id, status);
CREATE INDEX IF NOT EXISTS idx_clients_user ON clients(user_id);
CREATE INDEX IF NOT EXISTS idx_events_invoice ON events(invoice_id);
CREATE INDEX IF NOT EXISTS idx_reminders_invoice ON reminders(invoice_id);
