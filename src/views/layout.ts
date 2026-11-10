// Shared HTML layout and components
export const CSS = `
:root {
  --bg: #f9f9f7;
  --surface: #ffffff;
  --border: #e5e3df;
  --text: #1f1e1c;
  --muted: #6b6966;
  --accent: #2563eb;
  --accent-light: #eff6ff;
  --danger: #dc2626;
  --success: #16a34a;
  --warning: #d97706;
  --radius: 8px;
  --shadow: 0 1px 3px rgba(0,0,0,0.08);
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); font-size: 15px; line-height: 1.6; }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
.container { max-width: 900px; margin: 0 auto; padding: 0 20px; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); }
.card-pad { padding: 24px; }
h1 { font-size: 1.6rem; font-weight: 700; }
h2 { font-size: 1.25rem; font-weight: 600; }
h3 { font-size: 1rem; font-weight: 600; }
label { display: block; font-size: 13px; font-weight: 500; color: var(--muted); margin-bottom: 4px; }
input, select, textarea { width: 100%; padding: 9px 12px; border: 1px solid var(--border); border-radius: 6px; font-size: 14px; background: var(--surface); color: var(--text); outline: none; transition: border-color 0.15s; }
input:focus, select:focus, textarea:focus { border-color: var(--accent); }
textarea { resize: vertical; min-height: 80px; }
.btn { display: inline-flex; align-items: center; gap: 6px; padding: 9px 18px; border-radius: 6px; font-size: 14px; font-weight: 500; cursor: pointer; border: none; transition: opacity 0.15s; text-decoration: none !important; }
.btn:hover { opacity: 0.85; }
.btn-primary { background: var(--accent); color: #fff; }
.btn-secondary { background: var(--surface); color: var(--text); border: 1px solid var(--border); }
.btn-danger { background: var(--danger); color: #fff; }
.btn-success { background: var(--success); color: #fff; }
.btn-sm { padding: 5px 12px; font-size: 13px; }
.badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; text-transform: uppercase; }
.badge-draft { background: #f3f4f6; color: #374151; }
.badge-sent { background: #eff6ff; color: #1d4ed8; }
.badge-paid { background: #f0fdf4; color: #15803d; }
.badge-overdue { background: #fef2f2; color: #b91c1c; }
.badge-void { background: #fafafa; color: #9ca3af; }
table { width: 100%; border-collapse: collapse; }
th { text-align: left; font-size: 12px; font-weight: 600; color: var(--muted); padding: 8px 12px; border-bottom: 1px solid var(--border); text-transform: uppercase; letter-spacing: 0.05em; }
td { padding: 10px 12px; border-bottom: 1px solid var(--border); font-size: 14px; }
tr:last-child td { border-bottom: none; }
tr:hover td { background: var(--bg); }
.nav { background: var(--surface); border-bottom: 1px solid var(--border); padding: 12px 0; }
.nav-inner { display: flex; align-items: center; justify-content: space-between; }
.nav-brand { font-weight: 700; font-size: 1.1rem; color: var(--text); }
.nav-links { display: flex; align-items: center; gap: 20px; font-size: 14px; }
.form-row { display: grid; gap: 16px; margin-bottom: 16px; }
.form-row-2 { grid-template-columns: 1fr 1fr; }
.form-row-3 { grid-template-columns: 1fr 1fr 1fr; }
.form-group { display: flex; flex-direction: column; }
.flash { padding: 12px 16px; border-radius: 6px; margin-bottom: 20px; font-size: 14px; }
.flash-error { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }
.flash-success { background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; }
.empty-state { text-align: center; padding: 60px 20px; color: var(--muted); }
.empty-state h3 { margin-bottom: 8px; color: var(--text); }
.mt-4 { margin-top: 16px; }
.mt-6 { margin-top: 24px; }
.mt-8 { margin-top: 32px; }
.mb-4 { margin-bottom: 16px; }
.flex { display: flex; }
.items-center { align-items: center; }
.justify-between { justify-content: space-between; }
.gap-2 { gap: 8px; }
.gap-4 { gap: 16px; }
.text-right { text-align: right; }
.text-muted { color: var(--muted); font-size: 13px; }
.font-mono { font-family: 'Courier New', monospace; }
.section-title { font-size: 12px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; }
.total-row { font-weight: 700; font-size: 1.05rem; }
.tabs { display: flex; gap: 0; border-bottom: 2px solid var(--border); margin-bottom: 24px; }
.tab { padding: 10px 20px; font-size: 14px; font-weight: 500; color: var(--muted); cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -2px; text-decoration: none !important; }
.tab.active { color: var(--accent); border-bottom-color: var(--accent); }
.tab:hover { color: var(--text); }
@media (max-width: 600px) {
  .form-row-2, .form-row-3 { grid-template-columns: 1fr; }
  .nav-links { gap: 12px; }
  h1 { font-size: 1.3rem; }
}
`;

export function layout(opts: {
  title: string;
  user?: { name: string; email: string } | null;
  body: string;
  head?: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${opts.title} — InvoiceDesk</title>
  <style>${CSS}</style>
  ${opts.head ?? ''}
</head>
<body>
${opts.user ? `
<nav class="nav">
  <div class="container nav-inner">
    <a class="nav-brand" href="/invoices">⚡ InvoiceDesk</a>
    <div class="nav-links">
      <a href="/invoices">Dashboard</a>
      <a href="/settings">Settings</a>
      <span class="text-muted">${opts.user.name}</span>
      <form method="POST" action="/logout" style="margin:0"><button class="btn btn-secondary btn-sm" type="submit">Logout</button></form>
    </div>
  </div>
</nav>
` : ''}
${opts.body}
</body>
</html>`;
}

export function flash(msg: string | null, type: 'error' | 'success' = 'error'): string {
  if (!msg) return '';
  return `<div class="flash flash-${type}">${escHtml(msg)}</div>`;
}

export function escHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function badge(status: string, dueDate?: string): string {
  const today = new Date().toISOString().split('T')[0]!;
  let effective = status;
  if (status === 'sent' && dueDate && dueDate < today) effective = 'overdue';
  return `<span class="badge badge-${effective}">${effective}</span>`;
}

