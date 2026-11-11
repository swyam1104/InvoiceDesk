// Invoices Service Layer
// Shared by both MCP tools and Web routes so they never disagree.
import { db } from './db.js';
import { computeGst, getFinancialYear, type LineItemInput } from './gst.js';
import { generatePublicId } from './auth.js';

export interface CreateInvoiceParams {
  client_name: string;
  client_email?: string;
  client_gstin?: string;
  client_state?: string;
  client_address?: string;
  items: LineItemInput[];
  gst_rate?: number;
  due_in_days?: number;
  due_date?: string; // YYYY-MM-DD
  notes?: string;
  send?: boolean; // if true, status = 'sent', else 'draft'
  created_via?: 'claude' | 'dashboard';
}

export interface UpdateInvoiceParams {
  items?: LineItemInput[];
  gst_rate?: number;
  due_date?: string;
  notes?: string;
  status?: 'draft' | 'sent' | 'void';
  client_name?: string;
  client_email?: string;
  client_gstin?: string;
  client_state?: string;
  client_address?: string;
}

export interface ListInvoicesParams {
  status?: string; // 'draft' | 'sent' | 'paid' | 'overdue' | 'void' | 'unpaid'
  client?: string;
  from_date?: string;
  to_date?: string;
  limit?: number;
}

export interface InvoiceDetail {
  id: number;
  public_id: string;
  fy: string;
  seq: number;
  number: string;
  status: string;
  issue_date: string;
  due_date: string | null;
  gst_rate: number;
  supply_type: string;
  subtotal_paise: number;
  cgst_paise: number;
  sgst_paise: number;
  igst_paise: number;
  roundoff_paise: number;
  total_paise: number;
  notes: string;
  paid_on: string | null;
  paid_method: string | null;
  created_via: string;
  viewed_at: string | null;
  created_at: string;
  updated_at: string;
  client?: {
    id: number;
    name: string;
    email: string;
    phone: string;
    gstin: string;
    state_code: string;
    address: string;
  };
  seller?: {
    business_name: string;
    address: string;
    state_code: string;
    gstin: string;
    pan: string;
    upi_id: string;
  };
  items?: any[];
  reminders?: any[];
  events?: any[];
}

// In-memory per-(userId, FY) lock to ensure strict sequential numbering concurrency
const numberingLocks = new Map<string, Promise<any>>();

async function withNumberingLock<T>(userId: number, fy: string, fn: () => Promise<T>): Promise<T> {
  const key = `${userId}:${fy}`;
  const prev = numberingLocks.get(key) || Promise.resolve();
  let release: () => void;
  const next = new Promise<void>((r) => { release = r; });
  numberingLocks.set(key, next);
  await prev;
  try {
    return await fn();
  } finally {
    release!();
    if (numberingLocks.get(key) === next) {
      numberingLocks.delete(key);
    }
  }
}

export class InvoiceService {
  // Find or create client for a user
  static async findOrCreateClient(
    userId: number,
    name: string,
    email?: string,
    gstin?: string,
    stateCode?: string,
    address?: string
  ): Promise<number> {
    const existing = await db.queryOne<{ id: number }>(
      `SELECT id FROM clients WHERE user_id = $1 AND LOWER(name) = LOWER($2)`,
      [userId, name.trim()]
    );

    if (existing) {
      if (email || gstin || stateCode || address) {
        await db.execute(
          `UPDATE clients SET 
            email = COALESCE(NULLIF($1, ''), email),
            gstin = COALESCE(NULLIF($2, ''), gstin),
            state_code = COALESCE(NULLIF($3, ''), state_code),
            address = COALESCE(NULLIF($4, ''), address)
           WHERE id = $5`,
          [email || '', gstin || '', stateCode || '', address || '', existing.id]
        );
      }
      return existing.id;
    }

    const res = await db.execute(
      `INSERT INTO clients (user_id, name, email, gstin, state_code, address)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, name.trim(), email || '', gstin || '', stateCode || '', address || '']
    );

    if (res.lastInsertId) return res.lastInsertId;
    const inserted = await db.queryOne<{ id: number }>(
      `SELECT id FROM clients WHERE user_id = $1 ORDER BY id DESC LIMIT 1`,
      [userId]
    );
    return inserted!.id;
  }

  // Allocate next sequential number per user per financial year safely
  static async getNextSeqNumber(userId: number, fy: string): Promise<number> {
    const row = await db.queryOne<{ max_seq: number | null }>(
      `SELECT MAX(seq) as max_seq FROM invoices WHERE user_id = $1 AND fy = $2`,
      [userId, fy]
    );
    return (row?.max_seq ?? 0) + 1;
  }

  // Find invoice ID by various reference forms (e.g. "INV/2026-27/001", "1", public_id)
  static async resolveInvoiceId(userId: number, ref: string | number): Promise<number | null> {
    if (typeof ref === 'number' || /^\d+$/.test(String(ref))) {
      const inv = await db.queryOne<{ id: number }>(
        `SELECT id FROM invoices WHERE id = $1 AND user_id = $2`,
        [Number(ref), userId]
      );
      if (inv) return inv.id;
    }

    const strRef = String(ref).trim();

    // Try full number matching e.g. "INV/2026-27/001"
    const byNumber = await db.queryOne<{ id: number }>(
      `SELECT id FROM invoices WHERE number = $1 AND user_id = $2`,
      [strRef, userId]
    );
    if (byNumber) return byNumber.id;

    // Try public_id matching
    const byPublicId = await db.queryOne<{ id: number }>(
      `SELECT id FROM invoices WHERE public_id = $1 AND user_id = $2`,
      [strRef, userId]
    );
    if (byPublicId) return byPublicId.id;

    return null;
  }

  // Create an invoice
  static async createInvoice(userId: number, params: CreateInvoiceParams): Promise<{
    invoice: InvoiceDetail;
    publicUrl: string;
    dashboardUrl: string;
    stateFlag?: string;
  }> {
    const profile = await db.queryOne<any>(`SELECT * FROM profiles WHERE user_id = $1`, [userId]);
    const sellerPrefix = profile?.invoice_prefix || 'INV';
    const sellerGstin = profile?.gstin || '';
    const sellerState = profile?.state_code || '29';
    const sellerGstRegistered = profile?.gst_registered !== false && Boolean(sellerGstin);

    // Compute GST server-side
    const gstResult = computeGst({
      items: params.items,
      gst_rate: params.gst_rate !== undefined ? params.gst_rate : (profile?.default_gst_rate ?? 18),
      seller_gst_registered: sellerGstRegistered,
      seller_state_code: sellerState,
      seller_gstin: sellerGstin,
      client_state: params.client_state,
      client_gstin: params.client_gstin,
    });

    // Client
    const clientId = await this.findOrCreateClient(
      userId,
      params.client_name,
      params.client_email,
      params.client_gstin,
      params.client_state,
      params.client_address
    );

    // Date & FY
    const today = new Date().toISOString().split('T')[0]!;
    const issueDate = today;
    const fy = getFinancialYear(issueDate);

    let dueDate = params.due_date;
    if (!dueDate) {
      const termsDays = params.due_in_days !== undefined ? params.due_in_days : (profile?.default_terms_days ?? 15);
      const d = new Date();
      d.setDate(d.getDate() + termsDays);
      dueDate = d.toISOString().split('T')[0]!;
    }

    return withNumberingLock(userId, fy, async () => {
      // Numbering: PREFIX/2026-27/001
      const seq = await this.getNextSeqNumber(userId, fy);
      const seqPadded = String(seq).padStart(3, '0');
      const invoiceNumber = `${sellerPrefix}/${fy}/${seqPadded}`;
      const publicId = generatePublicId();
      const status = params.send ? 'sent' : 'draft';
      const createdVia = params.created_via || 'claude';

      // Insert Invoice
      const insertRes = await db.execute(
        `INSERT INTO invoices (
          user_id, client_id, public_id, fy, seq, number, status,
          issue_date, due_date, gst_rate, supply_type,
          subtotal_paise, cgst_paise, sgst_paise, igst_paise,
          roundoff_paise, total_paise, notes, created_via
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
        [
          userId, clientId, publicId, fy, seq, invoiceNumber, status,
          issueDate, dueDate, gstResult.gst_rate, gstResult.supply_type,
          gstResult.subtotal_paise, gstResult.cgst_paise, gstResult.sgst_paise, gstResult.igst_paise,
          gstResult.roundoff_paise, gstResult.total_paise, params.notes || '', createdVia,
        ]
      );

      const invoiceId = insertRes.lastInsertId || (await db.queryOne<{ id: number }>(
        `SELECT id FROM invoices WHERE public_id = $1`,
        [publicId]
      ))!.id;

      // Insert Line Items
      for (const item of gstResult.items) {
        await db.execute(
          `INSERT INTO invoice_items (invoice_id, position, description, hsn_sac, qty, rate_paise, amount_paise)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [invoiceId, item.position, item.description, item.hsn_sac, item.qty, item.rate_paise, item.amount_paise]
        );
      }

      // Event Log
      const eventDetail = JSON.stringify({
        by: createdVia,
        total_paise: gstResult.total_paise,
        items_count: gstResult.items.length,
      });
      await db.execute(
        `INSERT INTO events (invoice_id, type, detail) VALUES ($1, $2, $3)`,
        [invoiceId, createdVia === 'claude' ? 'created_via_claude' : 'created', eventDetail]
      );

      const invoice = (await this.getInvoiceById(invoiceId, userId))!;
      const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

      return {
        invoice,
        publicUrl: `${baseUrl}/i/${publicId}`,
        dashboardUrl: `${baseUrl}/invoices/${invoiceId}`,
        stateFlag: gstResult.state_flag,
      };
    });
  }

  // Update an existing invoice
  static async updateInvoice(userId: number, ref: string | number, params: UpdateInvoiceParams): Promise<InvoiceDetail> {
    const invoiceId = await this.resolveInvoiceId(userId, ref);
    if (!invoiceId) {
      throw new Error(`Invoice not found for reference "${ref}". Call list_invoices to see valid numbers.`);
    }

    const existing = await this.getInvoiceById(invoiceId, userId);
    if (!existing) throw new Error('Invoice not found.');
    if (existing.status === 'paid') {
      throw new Error('Paid invoices cannot be modified.');
    }

    const profile = await db.queryOne<any>(`SELECT * FROM profiles WHERE user_id = $1`, [userId]);
    const sellerGstin = profile?.gstin || '';
    const sellerState = profile?.state_code || '29';
    const sellerGstRegistered = profile?.gst_registered !== false && Boolean(sellerGstin);

    // Update client if details provided
    if (params.client_name || params.client_email || params.client_gstin || params.client_state || params.client_address) {
      if (existing.client?.id) {
        await db.execute(
          `UPDATE clients SET
            name = COALESCE(NULLIF($1, ''), name),
            email = COALESCE(NULLIF($2, ''), email),
            gstin = COALESCE(NULLIF($3, ''), gstin),
            state_code = COALESCE(NULLIF($4, ''), state_code),
            address = COALESCE(NULLIF($5, ''), address)
           WHERE id = $6`,
          [
            params.client_name || '',
            params.client_email || '',
            params.client_gstin || '',
            params.client_state || '',
            params.client_address || '',
            existing.client.id,
          ]
        );
      }
    }

    // Recompute GST if items or gst_rate changed
    if (params.items && params.items.length > 0) {
      const clientRow = await db.queryOne<any>(`SELECT * FROM clients WHERE id = $1`, [existing.client?.id]);
      const gstRate = params.gst_rate !== undefined ? params.gst_rate : existing.gst_rate;

      const gstResult = computeGst({
        items: params.items,
        gst_rate: gstRate,
        seller_gst_registered: sellerGstRegistered,
        seller_state_code: sellerState,
        seller_gstin: sellerGstin,
        client_state: clientRow?.state_code,
        client_gstin: clientRow?.gstin,
      });

      // Replace items
      await db.execute(`DELETE FROM invoice_items WHERE invoice_id = $1`, [invoiceId]);
      for (const item of gstResult.items) {
        await db.execute(
          `INSERT INTO invoice_items (invoice_id, position, description, hsn_sac, qty, rate_paise, amount_paise)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [invoiceId, item.position, item.description, item.hsn_sac, item.qty, item.rate_paise, item.amount_paise]
        );
      }

      await db.execute(
        `UPDATE invoices SET
          gst_rate = $1, supply_type = $2, subtotal_paise = $3,
          cgst_paise = $4, sgst_paise = $5, igst_paise = $6,
          roundoff_paise = $7, total_paise = $8, updated_at = CURRENT_TIMESTAMP
         WHERE id = $9`,
        [
          gstResult.gst_rate, gstResult.supply_type, gstResult.subtotal_paise,
          gstResult.cgst_paise, gstResult.sgst_paise, gstResult.igst_paise,
          gstResult.roundoff_paise, gstResult.total_paise, invoiceId,
        ]
      );
    }

    // Update dates, notes, status
    if (params.due_date) {
      await db.execute(`UPDATE invoices SET due_date = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [params.due_date, invoiceId]);
    }
    if (params.notes !== undefined) {
      await db.execute(`UPDATE invoices SET notes = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [params.notes, invoiceId]);
    }
    if (params.status) {
      await db.execute(`UPDATE invoices SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [params.status, invoiceId]);
    }

    // Log update event
    await db.execute(
      `INSERT INTO events (invoice_id, type, detail) VALUES ($1, $2, $3)`,
      [invoiceId, 'edited', JSON.stringify({ fields: Object.keys(params) })]
    );

    return (await this.getInvoiceById(invoiceId, userId))!;
  }

  // Get invoice by ID
  static async getInvoiceById(invoiceId: number, userId?: number): Promise<InvoiceDetail | null> {
    let sql = `SELECT * FROM invoices WHERE id = $1`;
    const params: any[] = [invoiceId];
    if (userId) {
      sql += ` AND user_id = $2`;
      params.push(userId);
    }

    const inv = await db.queryOne<any>(sql, params);
    if (!inv) return null;

    const client = inv.client_id
      ? await db.queryOne<any>(`SELECT * FROM clients WHERE id = $1`, [inv.client_id])
      : undefined;

    const seller = await db.queryOne<any>(`SELECT * FROM profiles WHERE user_id = $1`, [inv.user_id]);

    const items = await db.query<any>(
      `SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY position ASC`,
      [inv.id]
    );

    const reminders = await db.query<any>(
      `SELECT * FROM reminders WHERE invoice_id = $1 ORDER BY created_at DESC`,
      [inv.id]
    );

    const events = await db.query<any>(
      `SELECT * FROM events WHERE invoice_id = $1 ORDER BY created_at DESC`,
      [inv.id]
    );

    // Compute effective status if past due date
    const today = new Date().toISOString().split('T')[0]!;
    let effectiveStatus = inv.status;
    if (inv.status === 'sent' && inv.due_date && inv.due_date < today) {
      effectiveStatus = 'overdue';
    }

    const formatDate = (val: any) => {
      if (!val) return null;
      if (typeof val === 'string') return val.split('T')[0];
      if (val instanceof Date) return val.toISOString().split('T')[0];
      return String(val);
    };

    return {
      ...inv,
      issue_date: formatDate(inv.issue_date) || inv.issue_date,
      due_date: formatDate(inv.due_date),
      paid_on: formatDate(inv.paid_on),
      status: effectiveStatus,
      client,
      seller,
      items,
      reminders,
      events,
    };
  }

  // Get invoice by public_id (for client-facing public page)
  static async getInvoiceByPublicId(publicId: string, viewerUserId?: number): Promise<InvoiceDetail | null> {
    const inv = await db.queryOne<any>(`SELECT * FROM invoices WHERE public_id = $1`, [publicId]);
    if (!inv) return null;

    // Track "viewed by client" if viewer is not the invoice owner
    if (!viewerUserId || viewerUserId !== inv.user_id) {
      if (!inv.viewed_at) {
        const now = new Date().toISOString();
        await db.execute(`UPDATE invoices SET viewed_at = $1 WHERE id = $2`, [now, inv.id]);
        await db.execute(
          `INSERT INTO events (invoice_id, type, detail) VALUES ($1, $2, $3)`,
          [inv.id, 'viewed', JSON.stringify({ viewed_at: now })]
        );
      }
    }

    return this.getInvoiceById(inv.id);
  }

  // List invoices with filters
  static async listInvoices(userId: number, filters: ListInvoicesParams = {}): Promise<{
    invoices: InvoiceDetail[];
    outstandingTotalPaise: number;
    count: number;
  }> {
    const today = new Date().toISOString().split('T')[0]!;
    let sql = `
      SELECT i.*, c.name as client_name,
        CASE
          WHEN i.status = 'sent' AND i.due_date < $1 THEN 'overdue'
          ELSE i.status
        END as effective_status
      FROM invoices i
      LEFT JOIN clients c ON i.client_id = c.id
      WHERE i.user_id = $2
    `;
    const params: any[] = [today, userId];
    let pIdx = 3;

    if (filters.status) {
      if (filters.status === 'overdue') {
        sql += ` AND i.status = 'sent' AND i.due_date < $1`;
      } else if (filters.status === 'unpaid') {
        sql += ` AND i.status IN ('draft', 'sent')`;
      } else {
        sql += ` AND i.status = $${pIdx++}`;
        params.push(filters.status);
      }
    }

    if (filters.client) {
      sql += ` AND LOWER(c.name) LIKE $${pIdx++}`;
      params.push(`%${filters.client.trim().toLowerCase()}%`);
    }

    if (filters.from_date) {
      sql += ` AND i.issue_date >= $${pIdx++}`;
      params.push(filters.from_date);
    }

    if (filters.to_date) {
      sql += ` AND i.issue_date <= $${pIdx++}`;
      params.push(filters.to_date);
    }

    sql += ` ORDER BY i.id DESC`;

    if (filters.limit) {
      sql += ` LIMIT $${pIdx++}`;
      params.push(filters.limit);
    }

    const rows = await db.query<any>(sql, params);

    // Compute outstanding total (draft, sent, overdue)
    const allUserInvoices = await db.query<any>(
      `SELECT total_paise, status, due_date FROM invoices WHERE user_id = $1`,
      [userId]
    );

    const outstandingTotalPaise = allUserInvoices
      .filter(i => i.status === 'sent' || i.status === 'draft')
      .reduce((sum, i) => sum + Number(i.total_paise), 0);

    return {
      invoices: rows.map(r => ({
        ...r,
        status: r.effective_status,
      })),
      outstandingTotalPaise,
      count: rows.length,
    };
  }

  // Mark invoice as paid
  static async markPaid(
    userId: number,
    ref: string | number,
    paidOn?: string,
    paidMethod?: string,
    note?: string
  ): Promise<InvoiceDetail> {
    const invoiceId = await this.resolveInvoiceId(userId, ref);
    if (!invoiceId) {
      throw new Error(`Invoice not found for reference "${ref}". Call list_invoices to see valid numbers.`);
    }

    const invoice = await this.getInvoiceById(invoiceId, userId);
    if (!invoice) throw new Error('Invoice not found.');
    if (invoice.status === 'paid') {
      throw new Error(`Invoice ${invoice.number} is already marked as paid.`);
    }

    const today = new Date().toISOString().split('T')[0]!;
    const paymentDate = paidOn || today;
    const method = paidMethod || 'UPI';

    await db.execute(
      `UPDATE invoices SET
        status = 'paid', paid_on = $1, paid_method = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [paymentDate, method, invoiceId]
    );

    await db.execute(
      `INSERT INTO events (invoice_id, type, detail) VALUES ($1, $2, $3)`,
      [
        invoiceId,
        'paid',
        JSON.stringify({ paid_on: paymentDate, method, note: note || '' }),
      ]
    );

    return (await this.getInvoiceById(invoiceId, userId))!;
  }

  // Save reminder draft
  static async saveReminderDraft(
    userId: number,
    ref: string | number,
    message: string,
    channel: string = 'whatsapp'
  ): Promise<{ reminderId: number; invoice: InvoiceDetail }> {
    const invoiceId = await this.resolveInvoiceId(userId, ref);
    if (!invoiceId) {
      throw new Error(`Invoice not found for reference "${ref}". Call list_invoices to see valid numbers.`);
    }

    const invoice = await this.getInvoiceById(invoiceId, userId);
    if (!invoice) throw new Error('Invoice not found.');

    const res = await db.execute(
      `INSERT INTO reminders (invoice_id, channel, message, status, created_by)
       VALUES ($1, $2, $3, 'draft', 'claude')`,
      [invoiceId, channel, message]
    );

    await db.execute(
      `INSERT INTO events (invoice_id, type, detail) VALUES ($1, $2, $3)`,
      [invoiceId, 'reminder_drafted', JSON.stringify({ channel, by: 'claude' })]
    );

    const reminderId = res.lastInsertId || (await db.queryOne<{ id: number }>(
      `SELECT id FROM reminders WHERE invoice_id = $1 ORDER BY id DESC LIMIT 1`,
      [invoiceId]
    ))!.id;

    return { reminderId, invoice };
  }

  // Dashboard summary stats
  static async getSummaryStats(userId: number): Promise<{
    outstandingPaise: number;
    overduePaise: number;
    paidMonthPaise: number;
  }> {
    const today = new Date().toISOString().split('T')[0]!;
    const currentYearMonth = today.substring(0, 7); // 'YYYY-MM'

    const rows = await db.query<any>(
      `SELECT total_paise, status, due_date, paid_on FROM invoices WHERE user_id = $1`,
      [userId]
    );

    let outstandingPaise = 0;
    let overduePaise = 0;
    let paidMonthPaise = 0;

    for (const row of rows) {
      const amount = Number(row.total_paise || 0);
      const paidOnStr = row.paid_on instanceof Date
        ? row.paid_on.toISOString().slice(0, 10)
        : String(row.paid_on || '');
      const dueDateStr = row.due_date instanceof Date
        ? row.due_date.toISOString().slice(0, 10)
        : String(row.due_date || '');

      if (row.status === 'sent' || row.status === 'viewed' || row.status === 'draft') {
        outstandingPaise += amount;
        if (dueDateStr && dueDateStr < today) {
          overduePaise += amount;
        }
      } else if (row.status === 'overdue') {
        outstandingPaise += amount;
        overduePaise += amount;
      } else if (row.status === 'paid') {
        if (paidOnStr && paidOnStr.startsWith(currentYearMonth)) {
          paidMonthPaise += amount;
        }
      }
    }

    return {
      outstandingPaise,
      overduePaise,
      paidMonthPaise,
    };
  }
}
