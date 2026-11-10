// Settings and Claude Connect Page
import { layout, flash, escHtml } from './layout.js';

export function renderSettingsView(opts: {
  user: any;
  mcpUrl: string;
  rawMcpToken?: string;
  success?: string;
  error?: string;
}): string {
  const { user, mcpUrl, rawMcpToken, success, error } = opts;
  const profile = user.profile || {};

  const body = `
  <div class="container" style="padding-top: 32px; padding-bottom: 60px;">
    <div style="margin-bottom: 28px;">
      <h1>Settings & Claude Connection</h1>
      <p class="text-muted">Manage your business profile and connect Claude Custom Connector</p>
    </div>

    ${success ? flash(success, 'success') : ''}
    ${error ? flash(error, 'error') : ''}

    ${rawMcpToken ? `
      <div style="background: #f0fdf4; border: 2px solid #86efac; border-radius: 8px; padding: 20px; margin-bottom: 28px;">
        <h3 style="color: #15803d; margin-bottom: 8px;">🎉 New MCP Connection Link Generated!</h3>
        <p style="font-size: 14px; margin-bottom: 12px; color: #166534;">
          Copy this private URL now and add it to Claude. For security, the raw token will not be displayed again.
        </p>
        <div style="display: flex; gap: 8px; align-items: center;">
          <input type="text" id="rawTokenUrl" value="${escHtml(mcpUrl)}" readonly style="font-family: monospace; font-size: 13px; background: #ffffff;">
          <button class="btn btn-primary" onclick="navigator.clipboard.writeText(document.getElementById('rawTokenUrl').value).then(() => alert('MCP Link copied!'))">
            📋 Copy MCP Link
          </button>
        </div>
      </div>
    ` : ''}

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 28px;">

      <!-- Left Column: Business Profile -->
      <div class="card card-pad">
        <h2 style="margin-bottom: 6px;">Business Profile</h2>
        <p class="text-muted" style="margin-bottom: 20px; font-size: 13px;">Used on all your invoices and for GST calculation.</p>

        <form method="POST" action="/settings">
          <div class="form-row">
            <div class="form-group">
              <label>Business / Freelancer Name</label>
              <input type="text" name="business_name" value="${escHtml(profile.business_name || '')}" placeholder="Riya Design Studio" required>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Full Address</label>
              <textarea name="address" placeholder="Indiranagar, Bengaluru, Karnataka 560038">${escHtml(profile.address || '')}</textarea>
            </div>
          </div>

          <div class="form-row form-row-2">
            <div class="form-group">
              <label>State Code / Name</label>
              <input type="text" name="state_code" value="${escHtml(profile.state_code || 'Karnataka')}" placeholder="e.g. Karnataka or 29">
            </div>
            <div class="form-group">
              <label>Default GST Rate (%)</label>
              <select name="default_gst_rate">
                <option value="18" ${profile.default_gst_rate === 18 ? 'selected' : ''}>18% (Standard Services)</option>
                <option value="5" ${profile.default_gst_rate === 5 ? 'selected' : ''}>5%</option>
                <option value="12" ${profile.default_gst_rate === 12 ? 'selected' : ''}>12%</option>
                <option value="28" ${profile.default_gst_rate === 28 ? 'selected' : ''}>28%</option>
                <option value="0" ${profile.default_gst_rate === 0 ? 'selected' : ''}>0% (Exempt)</option>
              </select>
            </div>
          </div>

          <div class="form-row form-row-2">
            <div class="form-group">
              <label>GSTIN (Optional)</label>
              <input type="text" name="gstin" value="${escHtml(profile.gstin || '')}" placeholder="29ABCDE1234F1Z5">
            </div>
            <div class="form-group">
              <label>PAN (Optional)</label>
              <input type="text" name="pan" value="${escHtml(profile.pan || '')}" placeholder="ABCDE1234F">
            </div>
          </div>

          <div class="form-row form-row-2">
            <div class="form-group">
              <label>UPI ID (For Client Payments)</label>
              <input type="text" name="upi_id" value="${escHtml(profile.upi_id || '')}" placeholder="username@okhdfcbank">
            </div>
            <div class="form-group">
              <label>Invoice Prefix</label>
              <input type="text" name="invoice_prefix" value="${escHtml(profile.invoice_prefix || 'INV')}" placeholder="INV">
            </div>
          </div>

          <div class="form-row form-row-2">
            <div class="form-group">
              <label>Default Payment Terms (Days)</label>
              <input type="number" name="default_terms_days" value="${profile.default_terms_days ?? 15}" min="0" max="365">
            </div>
            <div class="form-group" style="justify-content: center; padding-top: 20px;">
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                <input type="checkbox" name="gst_registered" value="true" ${profile.gst_registered !== false ? 'checked' : ''} style="width: auto;">
                <span>GST Registered Seller</span>
              </label>
            </div>
          </div>

          <button type="submit" class="btn btn-primary" style="margin-top: 10px;">
            Save Profile
          </button>
        </form>
      </div>

      <!-- Right Column: Claude Connector -->
      <div>
        <div class="card card-pad" style="margin-bottom: 24px;">
          <h2 style="margin-bottom: 6px;">Connect to Claude</h2>
          <p class="text-muted" style="margin-bottom: 16px; font-size: 13px;">
            InvoiceDesk provides an official Model Context Protocol (MCP) endpoint that connects directly to your Claude account.
          </p>

          <div style="background: #fafaf9; border: 1px solid var(--border); border-radius: 8px; padding: 14px; margin-bottom: 16px;">
            <div style="font-size: 12px; font-weight: 600; color: var(--muted); text-transform: uppercase; margin-bottom: 6px;">
              Your MCP Connector URL
            </div>
            <div style="display: flex; gap: 8px;">
              <input type="text" id="mcpUrlInput" value="${escHtml(mcpUrl)}" readonly style="font-family: monospace; font-size: 12px; background: #ffffff;">
              <button class="btn btn-secondary btn-sm" onclick="navigator.clipboard.writeText(document.getElementById('mcpUrlInput').value).then(() => alert('Copied MCP URL!'))">
                Copy
              </button>
            </div>
            <div style="margin-top: 12px; font-size: 12px; color: var(--muted); display: flex; align-items: center; gap: 6px;">
              <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${user.last_mcp_call_at ? '#16a34a' : '#d97706'};"></span>
              <span><strong>Last Claude call:</strong> ${user.last_mcp_call_at ? new Date(user.last_mcp_call_at).toLocaleString('en-IN') : 'No requests yet'}</span>
            </div>
          </div>

          <form method="POST" action="/settings/token" style="margin-bottom: 20px;">
            <button type="submit" class="btn btn-secondary btn-sm" onclick="return confirm('Regenerating your token will invalidate the previous Claude connector. Continue?')">
              🔄 Regenerate MCP Token
            </button>
          </form>

          <h3 style="font-size: 14px; margin-bottom: 10px;">5-Step Setup Guide:</h3>
          <ol style="font-size: 13px; color: var(--muted); padding-left: 20px; line-height: 1.8;">
            <li>Open Claude (<strong>claude.ai</strong>) and go to <strong>Settings &rarr; Connectors</strong>.</li>
            <li>Click <strong>Add custom connector</strong>.</li>
            <li>Name it <strong>InvoiceDesk</strong>, paste the MCP URL, and click save.</li>
            <li>Start a new chat, enable the InvoiceDesk connector, and allow tools.</li>
            <li>Paste any sample prompt below!</li>
          </ol>
        </div>

        <!-- Sample Prompts -->
        <div class="card card-pad">
          <h3 style="margin-bottom: 12px;">Sample Prompts for Claude</h3>

          <div style="background: #fafaf9; border: 1px solid var(--border); border-radius: 6px; padding: 12px; margin-bottom: 12px; font-size: 13px;">
            <div class="flex items-center justify-between mb-4">
              <strong>1. Create GST Invoice</strong>
              <button class="btn btn-secondary btn-sm" onclick="navigator.clipboard.writeText('Create an invoice for Acme Design Pvt Ltd (Karnataka) for ₹45,000 for March brand design work, 18% GST, due in 15 days.').then(() => alert('Copied prompt!'))">Copy</button>
            </div>
            <code style="display: block; color: #374151; font-family: monospace;">"Create an invoice for Acme Design Pvt Ltd (Karnataka) for ₹45,000 for March brand design work, 18% GST, due in 15 days."</code>
          </div>

          <div style="background: #fafaf9; border: 1px solid var(--border); border-radius: 6px; padding: 12px; margin-bottom: 12px; font-size: 13px;">
            <div class="flex items-center justify-between mb-4">
              <strong>2. Outstanding Query</strong>
              <button class="btn btn-secondary btn-sm" onclick="navigator.clipboard.writeText('Who owes me money right now? Show overdue invoices.').then(() => alert('Copied prompt!'))">Copy</button>
            </div>
            <code style="display: block; color: #374151; font-family: monospace;">"Who owes me money right now? Show overdue invoices."</code>
          </div>

          <div style="background: #fafaf9; border: 1px solid var(--border); border-radius: 6px; padding: 12px; font-size: 13px;">
            <div class="flex items-center justify-between mb-4">
              <strong>3. Mark as Paid</strong>
              <button class="btn btn-secondary btn-sm" onclick="navigator.clipboard.writeText('Acme paid via UPI today. Mark the invoice paid.').then(() => alert('Copied prompt!'))">Copy</button>
            </div>
            <code style="display: block; color: #374151; font-family: monospace;">"Acme paid via UPI today. Mark the invoice paid."</code>
          </div>
        </div>
      </div>
    </div>
  </div>
  `;

  return layout({ title: 'Settings', user, body });
}

