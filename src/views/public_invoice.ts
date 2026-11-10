// Public Invoice View (/i/:public_id)
// Client-facing, print-ready, UPI QR & Pay button, diagonal PAID stamp
import { generateUpiDeeplink } from '../upi.js';
import { amountToWords } from '../gst.js';

function esc(s?: string | null): string {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmt(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function renderPublicInvoice(invoice: any, qrSvg: string): string {
  const seller = invoice.seller || {};
  const client = invoice.client || {};
  const isPaid = invoice.status === 'paid';
  const isVoid = invoice.status === 'void';
  const showPayment = !isPaid && !isVoid && Boolean(seller.upi_id);
  const upiLink = showPayment ? generateUpiDeeplink({
    upiId: seller.upi_id,
    payeeName: seller.business_name || 'Freelancer',
    amountPaise: invoice.total_paise,
    invoiceNumber: invoice.number,
  }) : '';

  const words = amountToWords(invoice.total_paise);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice ${esc(invoice.number)} — ${esc(seller.business_name || 'InvoiceDesk')}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #f5f5f4;
      --card-bg: #ffffff;
      --border: #e7e5e4;
      --text: #1c1917;
      --muted: #78716c;
      --accent: #2563eb;
      --success: #15803d;
      --danger: #b91c1c;
      --warning: #b45309;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding: 40px 16px;
      -webkit-font-smoothing: antialiased;
    }
    .invoice-card {
      max-width: 800px;
      margin: 0 auto;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      box-shadow: 0 4px 20px -2px rgba(0,0,0,0.06);
      padding: 48px;
      position: relative;
      overflow: hidden;
    }
    /* PAID Stamp */
    .paid-stamp {
      position: absolute;
      top: 50px;
      right: 48px;
      border: 4px solid var(--success);
      color: var(--success);
      font-size: 2rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.15em;
      padding: 8px 24px;
      border-radius: 8px;
      transform: rotate(-12deg);
      opacity: 0.85;
      pointer-events: none;
    }
    .header-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 40px;
      padding-bottom: 24px;
      border-bottom: 1px solid var(--border);
    }
    .seller-title { font-size: 1.5rem; font-weight: 700; color: #0c0a09; }
    .seller-meta { font-size: 13px; color: var(--muted); margin-top: 4px; line-height: 1.6; }
    .invoice-meta-block { text-align: right; }
    .invoice-num { font-family: 'JetBrains Mono', monospace; font-size: 1.25rem; font-weight: 700; }
    .badge {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-top: 8px;
    }
    .badge-paid { background: #dcfce7; color: var(--success); }
    .badge-overdue { background: #fee2e2; color: var(--danger); }
    .badge-sent { background: #dbeafe; color: var(--accent); }
    .badge-draft { background: #f5f5f4; color: var(--muted); }
    .badge-void { background: #f5f5f4; color: #a8a29e; }
    .addresses {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 32px;
      margin-bottom: 36px;
    }
    .addr-label { font-size: 11px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
    .addr-name { font-size: 1.05rem; font-weight: 600; color: var(--text); }
    .addr-text { font-size: 13px; color: var(--muted); line-height: 1.6; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 28px; }
    th {
      text-align: left;
      font-size: 11px;
      font-weight: 700;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 12px 10px;
      border-bottom: 2px solid var(--border);
    }
    td { padding: 14px 10px; border-bottom: 1px solid var(--border); font-size: 14px; }
    .num-col { text-align: right; }
    .totals-area {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 32px;
    }
    .totals-table { width: 340px; }
    .totals-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; color: var(--muted); }
    .totals-row.grand-total {
      border-top: 2px solid var(--border);
      padding-top: 12px;
      margin-top: 6px;
      font-size: 1.25rem;
      font-weight: 700;
      color: #0c0a09;
    }
    .amount-words-block {
      background: #fafaf9;
      border-left: 3px solid var(--accent);
      padding: 12px 16px;
      border-radius: 4px;
      font-size: 13px;
      color: var(--muted);
      margin-bottom: 36px;
    }
    .amount-words-block strong { color: var(--text); }
    /* Payment block */
    .payment-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 24px;
      display: flex;
      gap: 28px;
      align-items: center;
      margin-bottom: 36px;
    }
    .qr-container {
      width: 140px;
      height: 140px;
      background: #ffffff;
      padding: 8px;
      border-radius: 8px;
      border: 1px solid #cbd5e1;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .qr-container svg { width: 100%; height: 100%; }
    .payment-info h4 { font-size: 1.1rem; font-weight: 600; margin-bottom: 6px; }
    .payment-info p { font-size: 13px; color: var(--muted); margin-bottom: 14px; }
    .upi-pill {
      display: inline-block;
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      padding: 6px 12px;
      border-radius: 6px;
      margin-bottom: 12px;
    }
    .pay-btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: var(--accent);
      color: #fff;
      font-weight: 600;
      padding: 10px 20px;
      border-radius: 8px;
      text-decoration: none;
      font-size: 14px;
    }
    .pay-btn:hover { background: #1d4ed8; }
    .print-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 40px;
      padding-top: 24px;
      border-top: 1px solid var(--border);
    }
    .print-btn {
      background: #ffffff;
      border: 1px solid var(--border);
      color: var(--text);
      font-weight: 600;
      padding: 8px 18px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
    }
    .footer-brand {
      text-align: center;
      margin-top: 32px;
      font-size: 13px;
      color: var(--muted);
    }
    .footer-brand a { color: var(--accent); text-decoration: none; font-weight: 500; }
    /* Print stylesheet for standard A4 */
    @media print {
      body { background: #ffffff; padding: 0; }
      .invoice-card { box-shadow: none; border: none; padding: 0; max-width: 100%; }
      .print-actions, .footer-brand, .pay-btn { display: none !important; }
      @page { size: A4; margin: 15mm; }
    }
    @media (max-width: 640px) {
      .invoice-card { padding: 24px; }
      .header-row, .addresses { flex-direction: column; gap: 20px; }
      .invoice-meta-block { text-align: left; }
      .payment-card { flex-direction: column; text-align: center; }
      .totals-table { width: 100%; }
    }
  </style>
</head>
<body>
  <div class="invoice-card">
    ${isPaid ? '<div class="paid-stamp">PAID</div>' : ''}

    <div class="header-row">
      <div>
        <div class="seller-title">${esc(seller.business_name || 'Freelancer')}</div>
        <div class="seller-meta">
          ${seller.address ? `<div>${esc(seller.address)}</div>` : ''}
          ${seller.gstin ? `<div><strong>GSTIN:</strong> ${esc(seller.gstin)}</div>` : ''}
          ${seller.pan ? `<div><strong>PAN:</strong> ${esc(seller.pan)}</div>` : ''}
        </div>
      </div>

      <div class="invoice-meta-block">
        <div class="invoice-num">${esc(invoice.number)}</div>
        <div class="seller-meta" style="margin-top: 6px;">
          <div><strong>Issue Date:</strong> ${esc(invoice.issue_date)}</div>
          ${invoice.due_date ? `<div><strong>Due Date:</strong> ${esc(invoice.due_date)}</div>` : ''}
        </div>
        <div>
          <span class="badge badge-${invoice.status}">${invoice.status}</span>
        </div>
      </div>
    </div>

    <div class="addresses">
      <div>
        <div class="addr-label">Billed To</div>
        <div class="addr-name">${esc(client.name || 'Client')}</div>
        <div class="addr-text">
          ${client.address ? `<div>${esc(client.address)}</div>` : ''}
          ${client.state_code ? `<div><strong>State Code:</strong> ${esc(client.state_code)}</div>` : ''}
          ${client.gstin ? `<div><strong>GSTIN:</strong> ${esc(client.gstin)}</div>` : ''}
          ${client.email ? `<div><strong>Email:</strong> ${esc(client.email)}</div>` : ''}
        </div>
      </div>

      <div>
        <div class="addr-label">Place of Supply</div>
        <div class="addr-name">${esc(client.state_code || seller.state_code || 'Karnataka')}</div>
        <div class="addr-text">
          <div><strong>Supply Type:</strong> ${invoice.supply_type === 'intra' ? 'Intra-State (CGST + SGST)' : invoice.supply_type === 'inter' ? 'Inter-State (IGST)' : 'Non-GST'}</div>
        </div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Description</th>
          ${invoice.items?.some((it: any) => it.hsn_sac) ? '<th>HSN/SAC</th>' : ''}
          <th class="num-col">Qty</th>
          <th class="num-col">Rate</th>
          <th class="num-col">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${(invoice.items || []).map((it: any, idx: number) => `
          <tr>
            <td style="color: var(--muted);">${idx + 1}</td>
            <td><strong>${esc(it.description)}</strong></td>
            ${invoice.items?.some((x: any) => x.hsn_sac) ? `<td style="font-family: monospace; font-size:12px;">${esc(it.hsn_sac)}</td>` : ''}
            <td class="num-col">${it.qty}</td>
            <td class="num-col">${fmt(it.rate_paise)}</td>
            <td class="num-col" style="font-weight:600;">${fmt(it.amount_paise)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div class="totals-area">
      <div class="totals-table">
        <div class="totals-row">
          <span>Subtotal</span>
          <span>${fmt(invoice.subtotal_paise)}</span>
        </div>
        ${invoice.supply_type === 'intra' ? `
          <div class="totals-row">
            <span>CGST (${invoice.gst_rate / 2}%)</span>
            <span>${fmt(invoice.cgst_paise)}</span>
          </div>
          <div class="totals-row">
            <span>SGST (${invoice.gst_rate / 2}%)</span>
            <span>${fmt(invoice.sgst_paise)}</span>
          </div>
        ` : ''}
        ${invoice.supply_type === 'inter' ? `
          <div class="totals-row">
            <span>IGST (${invoice.gst_rate}%)</span>
            <span>${fmt(invoice.igst_paise)}</span>
          </div>
        ` : ''}
        ${invoice.roundoff_paise !== 0 ? `
          <div class="totals-row">
            <span>Round-off</span>
            <span>${fmt(invoice.roundoff_paise)}</span>
          </div>
        ` : ''}
        <div class="totals-row grand-total">
          <span>Total Payable</span>
          <span>${fmt(invoice.total_paise)}</span>
        </div>
      </div>
    </div>

    <div class="amount-words-block">
      Amount in Words: <strong>${esc(words)}</strong>
    </div>

    ${showPayment ? `
      <div class="payment-card">
        <div class="qr-container">
          ${qrSvg}
        </div>
        <div class="payment-info">
          <h4>Scan to Pay with Any UPI App</h4>
          <p>Scan using Google Pay, PhonePe, Paytm, or BHIM.</p>
          <div class="upi-pill">UPI ID: <strong>${esc(seller.upi_id)}</strong></div><br>
          <a href="${upiLink}" class="pay-btn">
            📱 Pay with UPI App (₹${(invoice.total_paise / 100).toFixed(2)})
          </a>
        </div>
      </div>
    ` : ''}

    ${invoice.notes ? `
      <div style="font-size: 13px; color: var(--muted); border-top: 1px solid var(--border); padding-top: 16px;">
        <strong>Notes:</strong> ${esc(invoice.notes)}
      </div>
    ` : ''}

    <div class="print-actions">
      <span style="font-size: 12px; color: var(--muted);">Thank you for your business!</span>
      <button class="print-btn" onclick="window.print()">🖨️ Print / Save PDF</button>
    </div>
  </div>

  <div class="footer-brand">
    Powered by <a href="/">InvoiceDesk</a> — GST invoicing for Indian freelancers
  </div>
</body>
</html>`;
}
