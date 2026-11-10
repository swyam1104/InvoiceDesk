// InvoiceDesk Express Server
import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { runMigrations, db, isLivePostgres } from './db.js';
import { seedReviewer } from './seeds/reviewer.js';
import { seedDemo } from './seeds/demo.js';
import {
  hashPassword,
  verifyPassword,
  generateMcpToken,
  hashMcpToken,
  requireAuth,
  type UserRow,
  type ProfileRow,
} from './auth.js';
import { InvoiceService } from './invoices.js';
import { handleMcpRequest } from './mcp.js';
import { generateUpiQrSvg } from './upi.js';
import { startCronJob } from './reminders.js';

// Views
import { renderLandingPage } from './views/landing.js';
import { loginView, signupView } from './views/auth.js';
import { invoicesView } from './views/invoices.js';
import { renderEditInvoiceView } from './views/edit_invoice.js';
import { renderPublicInvoice } from './views/public_invoice.js';
import { renderSettingsView } from './views/settings.js';

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'invoicedesk_secret_key_development_only';
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// ─── Security & Rate Limiting ───────────────────────────────────────────────
const loginRateLimit = new Map<string, { count: number; resetAt: number }>();
const mcpRateLimit = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(map: Map<string, { count: number; resetAt: number }>, key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = map.get(key);
  if (!entry || now > entry.resetAt) {
    map.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= max) return false;
  entry.count++;
  return true;
}

// Token Masking in Request Logging (PRD Part B Section 5 & Part C)
app.use((req: Request, _res: Response, next: NextFunction) => {
  const maskedUrl = req.originalUrl.replace(/\/mcp\/[a-zA-Z0-9_-]+/, '/mcp/****');
  console.log(`[${new Date().toISOString()}] ${req.method} ${maskedUrl}`);
  next();
});

// Middleware
app.use(cors());
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  })
);

// ─── Health & Uptime Ping ───────────────────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Landing Page ───────────────────────────────────────────────────────────
app.get('/', (req: Request, res: Response) => {
  if ((req.session as any)?.userId) {
    res.redirect('/invoices');
    return;
  }
  res.send(renderLandingPage());
});

// ─── Auth Routes ────────────────────────────────────────────────────────────
app.get('/login', (req: Request, res: Response) => {
  if ((req.session as any)?.userId) {
    res.redirect('/invoices');
    return;
  }
  res.send(loginView({}));
});

app.post('/login', async (req: Request, res: Response) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  // Rate limit: 10 per min per IP
  if (!checkRateLimit(loginRateLimit, ip, 10, 60 * 1000)) {
    res.status(429).send(loginView({ error: 'Too many login attempts. Please wait 1 minute.' }));
    return;
  }

  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).send(loginView({ error: 'Email and password are required.' }));
    return;
  }

  const user = await db.queryOne<UserRow>(
    `SELECT * FROM users WHERE LOWER(email) = LOWER($1)`,
    [email.trim()]
  );

  if (!user || !(await verifyPassword(password, user.password_hash))) {
    res.status(401).send(loginView({ error: 'Invalid email or password.' }));
    return;
  }

  (req.session as any).userId = user.id;
  res.redirect('/invoices');
});

app.get('/signup', (req: Request, res: Response) => {
  if ((req.session as any)?.userId) {
    res.redirect('/invoices');
    return;
  }
  res.send(signupView({}));
});

app.post('/signup', async (req: Request, res: Response) => {
  const { name, email, password, state, gstin, upi_id } = req.body;

  if (!name || !email || !password) {
    res.status(400).send(signupView({ error: 'Name, email, and password are required.' }));
    return;
  }

  const existing = await db.queryOne<{ id: number }>(
    `SELECT id FROM users WHERE LOWER(email) = LOWER($1)`,
    [email.trim()]
  );

  if (existing) {
    res.status(400).send(signupView({ error: 'An account with that email already exists.' }));
    return;
  }

  const passwordHash = await hashPassword(password);
  const rawToken = generateMcpToken();
  const tokenHash = hashMcpToken(rawToken);

  const insertUser = await db.execute(
    `INSERT INTO users (email, password_hash, mcp_token_hash) VALUES ($1, $2, $3)`,
    [email.trim().toLowerCase(), passwordHash, tokenHash]
  );

  const userId = insertUser.lastInsertId || (await db.queryOne<{ id: number }>(
    `SELECT id FROM users WHERE email = $1`,
    [email.trim().toLowerCase()]
  ))!.id;

  // Insert profile
  await db.execute(
    `INSERT INTO profiles (
      user_id, business_name, address, state_code, gstin, pan,
      upi_id, default_gst_rate, default_terms_days, invoice_prefix, gst_registered, plan
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      userId,
      name.trim(),
      '',
      state ? state.trim() : '29',
      gstin ? gstin.trim().toUpperCase() : '',
      '',
      upi_id ? upi_id.trim() : '',
      18,
      15,
      'INV',
      Boolean(gstin && gstin.trim()),
      'free',
    ]
  );

  (req.session as any).userId = userId;
  (req.session as any).newMcpToken = rawToken;

  res.redirect('/settings?new_token=true');
});

app.post('/logout', (req: Request, res: Response) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// ─── Dashboard & Invoices ───────────────────────────────────────────────────
app.get('/invoices', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const statusFilter = (req.query.status as string) || (req.query.tab === 'reminders' ? 'reminders' : 'all');
  const search = req.query.search as string;

  const filters: any = {};
  if (statusFilter && statusFilter !== 'all' && statusFilter !== 'reminders') {
    filters.status = statusFilter;
  }
  if (search) {
    filters.client = search;
  }

  const { invoices } = await InvoiceService.listInvoices(user.id, filters);
  const stats = await InvoiceService.getSummaryStats(user.id);

  // Fetch overdue invoices for reminders tab
  let overdueList: any[] = [];
  if (statusFilter === 'reminders' || true) {
    const overdueRes = await InvoiceService.listInvoices(user.id, { status: 'overdue' });
    overdueList = overdueRes.invoices;
  }

  res.send(
    invoicesView({
      user: {
        id: user.id,
        email: user.email,
        name: user.profile.business_name || user.email.split('@')[0],
        business_name: user.profile.business_name,
        gstin: user.profile.gstin,
        state: user.profile.state_code,
        upi_id: user.profile.upi_id,
        invoice_prefix: user.profile.invoice_prefix,
        default_rate: user.profile.default_gst_rate,
        default_pay_days: user.profile.default_terms_days,
        mcp_token: null,
      },
      invoices,
      filter: statusFilter,
      stats: {
        total: stats.outstandingPaise,
        overdue: stats.overduePaise,
        paid_month: stats.paidMonthPaise,
      },
      search,
      overdueList,
    })
  );
});

// ─── Invoice Create (Web UI) ────────────────────────────────────────────────
app.get('/invoices/new', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const profile = user.profile;

  // Render a clean new invoice form using the edit invoice template layout
  const dummyInvoice = {
    id: 'new',
    number: `${profile.invoice_prefix || 'INV'}/DRAFT`,
    issue_date: new Date().toISOString().split('T')[0],
    due_date: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    status: 'draft',
    gst_rate: profile.default_gst_rate || 18,
    subtotal_paise: 0,
    cgst_paise: 0,
    sgst_paise: 0,
    igst_paise: 0,
    roundoff_paise: 0,
    total_paise: 0,
    items: [{ description: '', qty: 1, rate_paise: 0, hsn_sac: '' }],
    client: {},
    events: [],
  };

  res.send(renderEditInvoiceView({ user, invoice: dummyInvoice }));
});

app.post('/invoices/new', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  try {
    const { client_name, client_email, client_gstin, client_state, client_address, due_date, gst_rate, notes, items } = req.body;

    const parsedItems: any[] = [];
    if (Array.isArray(items)) {
      for (const it of items) {
        if (it && it.description) {
          parsedItems.push({
            description: it.description,
            quantity: Number(it.quantity) || 1,
            rate: Number(it.rate) || 0,
            hsn_sac: it.hsn_sac,
          });
        }
      }
    } else if (typeof items === 'object') {
      for (const key of Object.keys(items)) {
        const it = items[key];
        if (it && it.description) {
          parsedItems.push({
            description: it.description,
            quantity: Number(it.quantity) || 1,
            rate: Number(it.rate) || 0,
            hsn_sac: it.hsn_sac,
          });
        }
      }
    }

    if (parsedItems.length === 0) {
      parsedItems.push({ description: 'Service / Work', quantity: 1, rate: 0 });
    }

    const { invoice } = await InvoiceService.createInvoice(user.id, {
      client_name: client_name || 'Client',
      client_email,
      client_gstin,
      client_state,
      client_address,
      due_date,
      gst_rate: Number(gst_rate) || 18,
      notes,
      items: parsedItems,
      created_via: 'dashboard',
    });

    res.redirect(`/invoices/${invoice.id}`);
  } catch (err: any) {
    res.status(400).send(`Error creating invoice: ${err.message}`);
  }
});

// ─── Invoice Edit & Actions ─────────────────────────────────────────────────
app.get('/invoices/:id', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const invoiceId = Number(req.params.id);

  if (isNaN(invoiceId)) {
    res.status(404).send('Invoice not found');
    return;
  }

  const invoice = await InvoiceService.getInvoiceById(invoiceId, user.id);
  if (!invoice) {
    res.status(404).send('Invoice not found');
    return;
  }

  res.send(renderEditInvoiceView({ user, invoice }));
});

app.post('/invoices/:id', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const invoiceId = Number(req.params.id);

  try {
    const { client_name, client_email, client_gstin, client_state, client_address, due_date, gst_rate, notes, items } = req.body;

    const parsedItems: any[] = [];
    if (Array.isArray(items)) {
      for (const it of items) {
        if (it && it.description) {
          parsedItems.push({
            description: it.description,
            quantity: Number(it.quantity) || 1,
            rate: Number(it.rate) || 0,
            hsn_sac: it.hsn_sac,
          });
        }
      }
    } else if (typeof items === 'object') {
      for (const key of Object.keys(items)) {
        const it = items[key];
        if (it && it.description) {
          parsedItems.push({
            description: it.description,
            quantity: Number(it.quantity) || 1,
            rate: Number(it.rate) || 0,
            hsn_sac: it.hsn_sac,
          });
        }
      }
    }

    await InvoiceService.updateInvoice(user.id, invoiceId, {
      client_name,
      client_email,
      client_gstin,
      client_state,
      client_address,
      due_date,
      gst_rate: gst_rate !== undefined ? Number(gst_rate) : undefined,
      notes,
      items: parsedItems.length > 0 ? parsedItems : undefined,
    });

    res.redirect(`/invoices/${invoiceId}`);
  } catch (err: any) {
    const invoice = await InvoiceService.getInvoiceById(invoiceId, user.id);
    res.status(400).send(renderEditInvoiceView({ user, invoice, error: err.message }));
  }
});

app.post('/invoices/:id/paid', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const invoiceId = Number(req.params.id);
  try {
    await InvoiceService.markPaid(user.id, invoiceId);
    res.redirect(`/invoices/${invoiceId}`);
  } catch (err: any) {
    res.redirect(`/invoices/${invoiceId}?error=${encodeURIComponent(err.message)}`);
  }
});

app.post('/invoices/:id/sent', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const invoiceId = Number(req.params.id);
  try {
    await InvoiceService.updateInvoice(user.id, invoiceId, { status: 'sent' });
    res.redirect(`/invoices/${invoiceId}`);
  } catch (err: any) {
    res.redirect(`/invoices/${invoiceId}`);
  }
});

app.post('/invoices/:id/void', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const invoiceId = Number(req.params.id);
  try {
    await InvoiceService.updateInvoice(user.id, invoiceId, { status: 'void' });
    res.redirect(`/invoices/${invoiceId}`);
  } catch (err: any) {
    res.redirect(`/invoices/${invoiceId}`);
  }
});

app.post('/invoices/:id/reminder', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const invoiceId = Number(req.params.id);
  const { message, channel } = req.body;
  try {
    await InvoiceService.saveReminderDraft(user.id, invoiceId, message || '', channel || 'whatsapp');
    res.redirect(`/invoices/${invoiceId}`);
  } catch (err: any) {
    res.redirect(`/invoices/${invoiceId}`);
  }
});

// ─── Settings & Claude Connect ──────────────────────────────────────────────
app.get('/settings', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const newMcpToken = (req.session as any).newMcpToken;
  if (newMcpToken) {
    delete (req.session as any).newMcpToken;
  }

  const mcpUrl = newMcpToken
    ? `${BASE_URL}/mcp/${newMcpToken}`
    : `${BASE_URL}/mcp/<your-secret-token>`;

  res.send(
    renderSettingsView({
      user,
      mcpUrl,
      rawMcpToken: newMcpToken,
      success: req.query.success as string,
    })
  );
});

app.post('/settings', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { business_name, address, state_code, gstin, pan, upi_id, default_gst_rate, default_terms_days, invoice_prefix, gst_registered } = req.body;

  await db.execute(
    `UPDATE profiles SET
      business_name = $1,
      address = $2,
      state_code = $3,
      gstin = $4,
      pan = $5,
      upi_id = $6,
      default_gst_rate = $7,
      default_terms_days = $8,
      invoice_prefix = $9,
      gst_registered = $10
     WHERE user_id = $11`,
    [
      business_name || '',
      address || '',
      state_code || '29',
      gstin ? gstin.trim().toUpperCase() : '',
      pan ? pan.trim().toUpperCase() : '',
      upi_id ? upi_id.trim() : '',
      Number(default_gst_rate) || 18,
      Number(default_terms_days) || 15,
      invoice_prefix ? invoice_prefix.trim().toUpperCase() : 'INV',
      Boolean(gst_registered),
      user.id,
    ]
  );

  res.redirect('/settings?success=Profile+updated+successfully');
});

app.post('/settings/token', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const newToken = generateMcpToken();
  const tokenHash = hashMcpToken(newToken);

  await db.execute(`UPDATE users SET mcp_token_hash = $1 WHERE id = $2`, [tokenHash, user.id]);
  (req.session as any).newMcpToken = newToken;

  res.redirect('/settings');
});

// ─── Public Invoice Page (/i/:public_id) ────────────────────────────────────
app.get('/i/:public_id', async (req: Request, res: Response) => {
  const publicId = req.params.public_id;
  const viewerUserId = (req.session as any)?.userId;

  const invoice = await InvoiceService.getInvoiceByPublicId(publicId, viewerUserId);
  if (!invoice) {
    // Clean 404 that reveals nothing (PRD A9)
    res.status(404).send(`
      <!DOCTYPE html>
      <html><head><title>Invoice Not Found</title>
      <style>body{font-family:sans-serif;background:#fafaf9;color:#1c1917;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}</style>
      </head><body><div style="text-align:center;"><h2>Invoice Not Found</h2><p style="color:#78716c;">This invoice link is invalid or may have expired.</p></div></body></html>
    `);
    return;
  }

  const seller = (invoice.seller || {}) as any;
  let qrSvg = '';
  if (seller.upi_id && invoice.status !== 'paid' && invoice.status !== 'void') {
    qrSvg = await generateUpiQrSvg({
      upiId: seller.upi_id,
      payeeName: seller.business_name || 'Freelancer',
      amountPaise: invoice.total_paise,
      invoiceNumber: invoice.number,
    });
  }

  res.send(renderPublicInvoice(invoice, qrSvg));
});

// ─── MCP Endpoint (Stateless Streamable HTTP) ───────────────────────────────
app.all('/mcp/:token', async (req: Request, res: Response) => {
  // Method check: answer GET / DELETE with 405 (PRD Part B Section 5)
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
    return;
  }

  const token = req.params.token;
  // Rate limit: 60 per min per token
  if (!checkRateLimit(mcpRateLimit, token, 60, 60 * 1000)) {
    res.status(429).json({ error: 'Too many requests. Rate limit is 60 requests per minute.' });
    return;
  }

  await handleMcpRequest(req, res);
});

// ─── Clean 404 Handler ──────────────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).send(`
    <!DOCTYPE html>
    <html><head><title>404 — Page Not Found</title>
    <style>body{font-family:sans-serif;background:#fafaf9;color:#1c1917;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}</style>
    </head><body><div style="text-align:center;"><h2>404 — Page Not Found</h2><p style="color:#78716c;">The requested page does not exist. <a href="/">Return Home</a></p></div></body></html>
  `);
});

// ─── Server Startup ─────────────────────────────────────────────────────────
export async function startServer(port: number = Number(PORT), host: string = process.env.HOST || '0.0.0.0'): Promise<any> {
  await runMigrations();
  if (!isLivePostgres) {
    try {
      await seedReviewer();
      await seedDemo();
    } catch (err) {
      console.warn('Auto-seed in-memory notice:', err);
    }
  }
  startCronJob();

  return new Promise((resolve) => {
    const server = app.listen(port, host, () => {
      const addr = server.address() as any;
      console.log(`⚡ InvoiceDesk running on http://${host}:${addr.port}`);
      resolve(server);
    });
  });
}

// Auto-start if run directly
if (process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js')) {
  startServer().catch(console.error);
}

export default app;
