import { layout, badge, escHtml } from './layout.js';

export interface UserSessionView {
  id: number;
  email: string;
  name: string;
  business_name?: string;
  gstin?: string;
  state?: string;
  upi_id?: string;
  invoice_prefix?: string;
  default_rate?: number;
  default_pay_days?: number;
  mcp_token?: string | null;
}

export function invoicesView(opts: {
  user: UserSessionView;
  invoices: any[];
  filter: string;
  stats: { total: number; overdue: number; paid_month: number };
  search?: string;
  overdueList?: any[];
}): string {
  const { user, invoices, filter, stats, search, overdueList } = opts;
  const host = process.env.HOST ?? 'http://localhost:3000';

  const body = `
  <div class="container" style="padding-top: 32px; padding-bottom: 60px;">

    <!-- Top header with actions -->
    <div class="flex items-center justify-between mb-4">
      <div>
        <h1>Invoices</h1>
        <p class="text-muted">Manage invoices created via Claude or the dashboard</p>
      </div>
      <div class="flex gap-2">
        <a href="/invoices/new" class="btn btn-primary">+ New Invoice</a>
      </div>
    </div>

    <!-- Stats row -->
    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 28px;">
      <div class="card card-pad">
        <div class="section-title">Outstanding</div>
        <div style="font-size: 1.5rem; font-weight: 700; color: var(--accent);">
          ₹${(stats.total / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
        </div>
      </div>
      <div class="card card-pad">
        <div class="section-title">Overdue</div>
        <div style="font-size: 1.5rem; font-weight: 700; color: var(--danger);">
          ₹${(stats.overdue / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
        </div>
      </div>
      <div class="card card-pad">
        <div class="section-title">Paid This Month</div>
        <div style="font-size: 1.5rem; font-weight: 700; color: var(--success);">
          ₹${(stats.paid_month / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
        </div>
      </div>
    </div>

    <!-- Filters + Search -->
    <div class="flex items-center justify-between" style="margin-bottom: 16px; flex-wrap: wrap; gap: 12px;">
      <div class="tabs" style="margin-bottom: 0;">
        <a href="/invoices" class="tab ${filter === 'all' ? 'active' : ''}">All</a>
        <a href="/invoices?status=unpaid" class="tab ${filter === 'unpaid' ? 'active' : ''}">Unpaid</a>
        <a href="/invoices?status=overdue" class="tab ${filter === 'overdue' ? 'active' : ''}">Overdue</a>
        <a href="/invoices?status=paid" class="tab ${filter === 'paid' ? 'active' : ''}">Paid</a>
        <a href="/invoices?tab=reminders" class="tab ${filter === 'reminders' ? 'active' : ''}">
          Reminders Queue ${overdueList && overdueList.length > 0 ? `<span class="badge badge-overdue" style="font-size:10px; margin-left:4px;">${overdueList.length}</span>` : ''}
        </a>
      </div>

      <form method="GET" action="/invoices" style="display: flex; gap: 8px; margin: 0;">
        <input type="text" name="search" value="${escHtml(search ?? '')}" placeholder="Search client..." style="width: 200px;">
        <button type="submit" class="btn btn-secondary btn-sm">Search</button>
      </form>
    </div>

    ${filter === 'reminders' ? `
      <!-- Reminders Queue -->
      <div class="card">
        <div class="card-pad" style="border-bottom: 1px solid var(--border);">
          <h2>Overdue Invoices — Ready to Remind</h2>
          <p class="text-muted" style="margin-top: 4px;">Click to copy or open in WhatsApp. The app never sends messages automatically in v1.</p>
        </div>
        ${(!overdueList || overdueList.length === 0) ? `
          <div class="empty-state">
            <h3>No overdue invoices</h3>
            <p>All client payments are currently up to date.</p>
          </div>
        ` : `
          <div style="padding: 16px 24px;">
            ${overdueList.map(inv => {
              const daysOverdue = Math.floor((Date.now() - new Date(inv.due_date).getTime()) / (1000 * 60 * 60 * 24));
              const amount = (inv.total_paise / 100).toFixed(2);
              const invoiceLink = `${host}/i/${inv.public_id}`;
              const defaultMsg = `Hi ${inv.client_name}, a gentle reminder that invoice ${user.invoice_prefix}/${inv.fy_label}/${inv.seq_number} for ₹${amount} was due on ${inv.due_date} (${daysOverdue} days ago). You can view and pay here: ${invoiceLink}. Thank you!`;
              const msg = inv.reminder_message ?? defaultMsg;
              const waUrl = inv.client_phone ? `https://wa.me/${inv.client_phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(msg)}` : null;
              const mailto = inv.client_email ? `mailto:${inv.client_email}?subject=${encodeURIComponent('Payment Reminder: Invoice ' + user.invoice_prefix + '/' + inv.fy_label + '/' + inv.seq_number)}&body=${encodeURIComponent(msg)}` : null;

              return `
                <div style="border: 1px solid var(--border); border-radius: 6px; padding: 16px; margin-bottom: 16px;">
                  <div class="flex items-center justify-between mb-4">
                    <div>
                      <strong>${escHtml(inv.client_name)}</strong> &bull;
                      <span class="font-mono text-muted">${user.invoice_prefix}/${inv.fy_label}/${inv.seq_number}</span>
                      <span class="badge badge-overdue" style="margin-left: 8px;">${daysOverdue}d overdue</span>
                    </div>
                    <div style="font-weight: 700; color: var(--danger);">₹${amount}</div>
                  </div>
                  <div style="background: var(--bg); border: 1px solid var(--border); border-radius: 4px; padding: 10px 14px; font-size: 13px; font-family: monospace; white-space: pre-wrap; margin-bottom: 12px;">${escHtml(msg)}</div>
                  <div class="flex gap-2">
                    <button class="btn btn-secondary btn-sm" onclick="navigator.clipboard.writeText('${escHtml(msg).replace(/'/g, "\\'")}').then(() => alert('Copied to clipboard!'))">
                      📋 Copy Message
                    </button>
                    ${waUrl ? `<a href="${waUrl}" target="_blank" class="btn btn-success btn-sm">💬 WhatsApp</a>` : ''}
                    ${mailto ? `<a href="${mailto}" class="btn btn-secondary btn-sm">✉️ Email</a>` : ''}
                    <a href="/invoices/${inv.id}" class="btn btn-secondary btn-sm">View Invoice</a>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>
    ` : `
      <!-- Invoices Table -->
      <div class="card">
        ${invoices.length === 0 ? `
          <div class="empty-state">
            <h3>No invoices found</h3>
            <p>Tell Claude to create one, or click "+ New Invoice" above.</p>
            <div style="background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 12px 16px; display: inline-block; margin-top: 16px; text-align: left; font-size: 13px;">
              <strong>Try saying to Claude:</strong><br>
              <code>"Invoice Acme ₹45,000 for March design work, 18% GST, due in 15 days."</code>
            </div>
          </div>
        ` : `
          <table>
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Client</th>
                <th>Issue Date</th>
                <th>Due Date</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Via</th>
                <th class="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${invoices.map(inv => `
                <tr>
                  <td class="font-mono">
                    <a href="/invoices/${inv.id}">${user.invoice_prefix}/${inv.fy_label}/${inv.seq_number}</a>
                  </td>
                  <td>${escHtml(inv.client_name ?? '—')}</td>
                  <td class="text-muted">${inv.issue_date}</td>
                  <td class="text-muted">${inv.due_date ?? '—'}</td>
                  <td style="font-weight: 600;">₹${((inv.total_paise ?? 0) / 100).toFixed(2)}</td>
                  <td>${badge(inv.status, inv.due_date)}</td>
                  <td class="text-muted" style="font-size: 12px;">${inv.created_via === 'claude' ? '🤖 Claude' : 'Web'}</td>
                  <td class="text-right">
                    <a href="/i/${inv.public_id}" target="_blank" class="btn btn-secondary btn-sm" style="margin-right: 4px;">Public Link</a>
                    <a href="/invoices/${inv.id}" class="btn btn-secondary btn-sm">Edit</a>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `}
      </div>
    `}
  </div>
  `;
  return layout({ title: 'Invoices', user, body });
}

