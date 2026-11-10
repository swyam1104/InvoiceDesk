// Invoice Edit Screen
import { layout, badge, escHtml } from './layout.js';

function fmt(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function renderEditInvoiceView(opts: {
  user: any;
  invoice: any;
  success?: string;
  error?: string;
}): string {
  const { user, invoice, success, error } = opts;
  const client = invoice.client || {};
  const items = invoice.items || [];
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  const publicUrl = `${baseUrl}/i/${invoice.public_id}`;

  const body = `
  <div class="container" style="padding-top: 32px; padding-bottom: 60px;">
    <!-- Top Action Bar -->
    <div class="flex items-center justify-between mb-4" style="flex-wrap: wrap; gap: 12px;">
      <div>
        <div style="display: flex; align-items: center; gap: 10px;">
          <h1>${escHtml(invoice.number)}</h1>
          ${badge(invoice.status, invoice.due_date)}
          ${invoice.created_via === 'claude' ? `<span class="badge" style="background:#f3e8ff; color:#7e22ce;">🤖 Created by Claude via MCP</span>` : ''}
          ${invoice.viewed_at ? `<span class="badge" style="background:#e0f2fe; color:#0369a1;">👁️ Viewed by Client</span>` : ''}
        </div>
        <p class="text-muted" style="margin-top: 4px;">Issued: ${invoice.issue_date} &bull; Due: ${invoice.due_date || 'N/A'}</p>
      </div>

      <div class="flex gap-2">
        <a href="${publicUrl}" target="_blank" class="btn btn-secondary btn-sm">🔗 Open Public Page</a>
        <button class="btn btn-secondary btn-sm" onclick="navigator.clipboard.writeText('${publicUrl}').then(() => alert('Public Link copied to clipboard!'))">
          📋 Copy Link
        </button>

        ${invoice.status !== 'paid' ? `
          <form method="POST" action="/invoices/${invoice.id}/paid" style="margin:0;">
            <button type="submit" class="btn btn-success btn-sm">✓ Mark as Paid</button>
          </form>
        ` : ''}

        ${invoice.status === 'draft' ? `
          <form method="POST" action="/invoices/${invoice.id}/sent" style="margin:0;">
            <button type="submit" class="btn btn-primary btn-sm">Mark Sent</button>
          </form>
        ` : ''}

        ${invoice.status !== 'void' && invoice.status !== 'paid' ? `
          <form method="POST" action="/invoices/${invoice.id}/void" style="margin:0;" onsubmit="return confirm('Cancel this invoice?')">
            <button type="submit" class="btn btn-danger btn-sm">Void</button>
          </form>
        ` : ''}
      </div>
    </div>

    ${success ? `<div class="flash flash-success">${escHtml(success)}</div>` : ''}
    ${error ? `<div class="flash flash-error">${escHtml(error)}</div>` : ''}

    <form method="POST" action="/invoices/${invoice.id}" id="invoiceForm">
      <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 24px;">

        <!-- Left: Client and Line Items -->
        <div>
          <!-- Client Block -->
          <div class="card card-pad" style="margin-bottom: 24px;">
            <h3 style="margin-bottom: 14px;">Client Details</h3>
            <div class="form-row form-row-2">
              <div class="form-group">
                <label>Client / Business Name</label>
                <input type="text" name="client_name" value="${escHtml(client.name || '')}" required>
              </div>
              <div class="form-group">
                <label>Client Email</label>
                <input type="email" name="client_email" value="${escHtml(client.email || '')}">
              </div>
            </div>

            <div class="form-row form-row-2">
              <div class="form-group">
                <label>Client GSTIN (15 characters)</label>
                <input type="text" name="client_gstin" value="${escHtml(client.gstin || '')}" placeholder="29ABCDE1234F1Z5">
              </div>
              <div class="form-group">
                <label>Client State / State Code</label>
                <input type="text" name="client_state" value="${escHtml(client.state_code || '')}" placeholder="e.g. Karnataka or 29">
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>Client Address</label>
                <textarea name="client_address" rows="2">${escHtml(client.address || '')}</textarea>
              </div>
            </div>
          </div>

          <!-- Line Items Table -->
          <div class="card card-pad" style="margin-bottom: 24px;">
            <div class="flex items-center justify-between mb-4">
              <h3>Line Items</h3>
              <button type="button" class="btn btn-secondary btn-sm" onclick="addItemRow()">+ Add Item</button>
            </div>

            <table id="itemsTable">
              <thead>
                <tr>
                  <th style="width: 45%;">Description</th>
                  <th style="width: 15%;">HSN/SAC</th>
                  <th style="width: 15%; text-align: right;">Qty</th>
                  <th style="width: 20%; text-align: right;">Rate (₹)</th>
                  <th style="width: 5%;"></th>
                </tr>
              </thead>
              <tbody id="itemsBody">
                ${items.map((it: any, idx: number) => `
                  <tr>
                    <td><input type="text" name="items[${idx}][description]" value="${escHtml(it.description)}" required></td>
                    <td><input type="text" name="items[${idx}][hsn_sac]" value="${escHtml(it.hsn_sac || '')}"></td>
                    <td><input type="number" step="any" name="items[${idx}][quantity]" value="${it.qty}" required style="text-align: right;"></td>
                    <td><input type="number" step="any" name="items[${idx}][rate]" value="${(it.rate_paise / 100).toFixed(2)}" required style="text-align: right;"></td>
                    <td><button type="button" class="btn btn-secondary btn-sm" onclick="this.closest('tr').remove()" style="color:var(--danger); padding: 4px 8px;">✕</button></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

          <!-- Notes -->
          <div class="card card-pad">
            <h3 style="margin-bottom: 12px;">Payment Notes / Terms</h3>
            <textarea name="notes" placeholder="UPI or bank transfer details...">${escHtml(invoice.notes || '')}</textarea>
          </div>
        </div>

        <!-- Right: Summary & Timeline -->
        <div>
          <!-- Live Summary Card -->
          <div class="card card-pad" style="margin-bottom: 24px;">
            <h3 style="margin-bottom: 16px;">Invoice Summary</h3>

            <div class="form-row" style="margin-bottom: 14px;">
              <div class="form-group">
                <label>Due Date</label>
                <input type="date" name="due_date" value="${invoice.due_date || ''}">
              </div>
            </div>

            <div class="form-row" style="margin-bottom: 14px;">
              <div class="form-group">
                <label>GST Rate (%)</label>
                <select name="gst_rate">
                  <option value="18" ${invoice.gst_rate === 18 ? 'selected' : ''}>18% (Standard)</option>
                  <option value="5" ${invoice.gst_rate === 5 ? 'selected' : ''}>5%</option>
                  <option value="12" ${invoice.gst_rate === 12 ? 'selected' : ''}>12%</option>
                  <option value="28" ${invoice.gst_rate === 28 ? 'selected' : ''}>28%</option>
                  <option value="0" ${invoice.gst_rate === 0 ? 'selected' : ''}>0%</option>
                </select>
              </div>
            </div>

            <div style="border-top: 1px solid var(--border); padding-top: 14px; margin-top: 14px;">
              <div class="flex justify-between" style="font-size: 14px; margin-bottom: 6px;">
                <span class="text-muted">Subtotal</span>
                <span>${fmt(invoice.subtotal_paise)}</span>
              </div>

              ${invoice.supply_type === 'intra' ? `
                <div class="flex justify-between" style="font-size: 14px; margin-bottom: 6px;">
                  <span class="text-muted">CGST (${invoice.gst_rate / 2}%)</span>
                  <span>${fmt(invoice.cgst_paise)}</span>
                </div>
                <div class="flex justify-between" style="font-size: 14px; margin-bottom: 6px;">
                  <span class="text-muted">SGST (${invoice.gst_rate / 2}%)</span>
                  <span>${fmt(invoice.sgst_paise)}</span>
                </div>
              ` : ''}

              ${invoice.supply_type === 'inter' ? `
                <div class="flex justify-between" style="font-size: 14px; margin-bottom: 6px;">
                  <span class="text-muted">IGST (${invoice.gst_rate}%)</span>
                  <span>${fmt(invoice.igst_paise)}</span>
                </div>
              ` : ''}

              ${invoice.roundoff_paise !== 0 ? `
                <div class="flex justify-between" style="font-size: 14px; margin-bottom: 6px;">
                  <span class="text-muted">Round-off</span>
                  <span>${fmt(invoice.roundoff_paise)}</span>
                </div>
              ` : ''}

              <div class="flex justify-between total-row" style="margin-top: 12px; padding-top: 10px; border-top: 2px solid var(--border);">
                <span>Total</span>
                <span>${fmt(invoice.total_paise)}</span>
              </div>
            </div>

            <button type="submit" class="btn btn-primary" style="width: 100%; justify-content: center; margin-top: 20px;">
              Save Changes
            </button>
          </div>

          <!-- Activity Log -->
          <div class="card card-pad">
            <h3 style="margin-bottom: 14px;">Activity Log</h3>
            <div style="font-size: 13px;">
              ${(invoice.events || []).length === 0 ? '<p class="text-muted">No events recorded.</p>' : `
                <ul style="padding-left: 18px; line-height: 1.8; color: var(--muted);">
                  ${(invoice.events || []).map((ev: any) => `
                    <li>
                      <strong>${ev.type.replace(/_/g, ' ')}</strong>
                      <span style="font-size: 11px;">(${new Date(ev.created_at).toLocaleString('en-IN')})</span>
                    </li>
                  `).join('')}
                </ul>
              `}
            </div>
          </div>
        </div>
      </div>
    </form>
  </div>

  <script>
    let itemIndex = ${items.length};
    function addItemRow() {
      const tbody = document.getElementById('itemsBody');
      const tr = document.createElement('tr');
      tr.innerHTML = \`
        <td><input type="text" name="items[\${itemIndex}][description]" placeholder="Item description" required></td>
        <td><input type="text" name="items[\${itemIndex}][hsn_sac]" placeholder="HSN/SAC"></td>
        <td><input type="number" step="any" name="items[\${itemIndex}][quantity]" value="1" required style="text-align: right;"></td>
        <td><input type="number" step="any" name="items[\${itemIndex}][rate]" value="0" required style="text-align: right;"></td>
        <td><button type="button" class="btn btn-secondary btn-sm" onclick="this.closest('tr').remove()" style="color:var(--danger); padding: 4px 8px;">✕</button></td>
      \`;
      tbody.appendChild(tr);
      itemIndex++;
    }
  </script>
  `;

  return layout({ title: `Edit ${invoice.number}`, user, body });
}

