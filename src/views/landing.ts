// Landing Page (/)
export function renderLandingPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>InvoiceDesk — GST Invoicing & Collections Desk for Indian Freelancers</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #fafaf9;
      --surface: #ffffff;
      --border: #e7e5e4;
      --text: #1c1917;
      --muted: #78716c;
      --accent: #2563eb;
      --accent-hover: #1d4ed8;
      --success: #16a34a;
      --radius: 10px;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
    }
    .container { max-width: 960px; margin: 0 auto; padding: 0 24px; }
    header {
      padding: 24px 0;
      border-bottom: 1px solid var(--border);
      background: var(--surface);
    }
    .header-inner { display: flex; align-items: center; justify-content: space-between; }
    .logo { font-size: 1.25rem; font-weight: 700; color: var(--text); text-decoration: none; display: flex; align-items: center; gap: 8px; }
    .hero { padding: 80px 0 60px; text-align: center; }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 12px;
      background: #eff6ff;
      color: var(--accent);
      border-radius: 999px;
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 24px;
      border: 1px solid #bfdbfe;
    }
    h1 {
      font-size: 3rem;
      font-weight: 800;
      letter-spacing: -0.03em;
      line-height: 1.15;
      margin-bottom: 20px;
      color: #0c0a09;
    }
    .subtitle {
      font-size: 1.25rem;
      color: var(--muted);
      max-width: 680px;
      margin: 0 auto 36px;
    }
    .cta-group { display: flex; justify-content: center; gap: 14px; margin-bottom: 48px; }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 12px 26px;
      font-size: 15px;
      font-weight: 600;
      border-radius: var(--radius);
      text-decoration: none;
      transition: all 0.15s ease;
      cursor: pointer;
    }
    .btn-primary { background: var(--accent); color: #fff; border: 1px solid var(--accent); }
    .btn-primary:hover { background: var(--accent-hover); }
    .btn-secondary { background: var(--surface); color: var(--text); border: 1px solid var(--border); }
    .btn-secondary:hover { background: #f5f5f4; }
    .prompt-box {
      max-width: 720px;
      margin: 0 auto 80px;
      background: #18181b;
      color: #f4f4f5;
      border-radius: 12px;
      padding: 24px 28px;
      text-align: left;
      box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1);
      position: relative;
    }
    .prompt-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12px;
      color: #a1a1aa;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 12px;
    }
    .prompt-content {
      font-family: 'JetBrains Mono', monospace;
      font-size: 15px;
      line-height: 1.5;
      color: #e4e4e7;
    }
    .copy-btn {
      background: #27272a;
      border: 1px solid #3f3f46;
      color: #fafafa;
      padding: 6px 14px;
      font-size: 12px;
      border-radius: 6px;
      cursor: pointer;
      font-family: inherit;
    }
    .copy-btn:hover { background: #3f3f46; }
    .steps-section { padding: 60px 0; border-top: 1px solid var(--border); }
    .section-heading { text-align: center; margin-bottom: 48px; }
    .section-heading h2 { font-size: 2rem; font-weight: 700; }
    .steps-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 28px; }
    .step-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 28px;
    }
    .step-num {
      width: 36px;
      height: 36px;
      background: #f5f5f4;
      color: var(--text);
      font-weight: 700;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 18px;
    }
    .step-card h3 { font-size: 1.15rem; margin-bottom: 10px; font-weight: 600; }
    .step-card p { font-size: 14px; color: var(--muted); }
    .feature-strip {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 36px;
      margin: 60px 0;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 32px;
      text-align: center;
    }
    .feature-strip h4 { font-size: 1.1rem; margin-bottom: 6px; }
    .feature-strip p { font-size: 13px; color: var(--muted); }
    footer {
      border-top: 1px solid var(--border);
      padding: 36px 0;
      text-align: center;
      color: var(--muted);
      font-size: 14px;
      background: var(--surface);
    }
    @media (max-width: 768px) {
      h1 { font-size: 2.2rem; }
      .steps-grid, .feature-strip { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <header>
    <div class="container header-inner">
      <a href="/" class="logo">⚡ InvoiceDesk</a>
      <div>
        <a href="/login" class="btn btn-secondary" style="padding: 8px 16px; font-size: 14px; margin-right: 8px;">Sign In</a>
        <a href="/signup" class="btn btn-primary" style="padding: 8px 18px; font-size: 14px;">Get Started</a>
      </div>
    </div>
  </header>

  <main class="container">
    <section class="hero">
      <div class="badge">Designed for Claude &bull; Built for Indian Freelancers</div>
      <h1>Invoice your clients by talking to Claude.</h1>
      <p class="subtitle">
        Claude can write an invoice, but it can't host it, track payment, or chase the client. <strong>InvoiceDesk does.</strong>
      </p>

      <div class="cta-group">
        <a href="/signup" class="btn btn-primary">Connect Claude & Create Invoice</a>
        <a href="#how-it-works" class="btn btn-secondary">See How It Works</a>
      </div>

      <div class="prompt-box">
        <div class="prompt-header">
          <span>Try this prompt in Claude</span>
          <button class="copy-btn" onclick="navigator.clipboard.writeText('Create an invoice for Acme Design Pvt Ltd (Karnataka) for ₹45,000 for March brand design work, 18% GST, due in 15 days.').then(() => alert('Copied prompt!'))">Copy</button>
        </div>
        <div class="prompt-content">
          "Create an invoice for Acme Design Pvt Ltd (Karnataka) for ₹45,000 for March brand design work, 18% GST, due in 15 days."
        </div>
      </div>
    </section>

    <section id="how-it-works" class="steps-section">
      <div class="section-heading">
        <h2>How It Works in 3 Steps</h2>
      </div>
      <div class="steps-grid">
        <div class="step-card">
          <div class="step-num">1</div>
          <h3>Connect Claude</h3>
          <p>Add your personalized InvoiceDesk MCP link to Claude Custom Connectors in under 2 minutes.</p>
        </div>
        <div class="step-card">
          <div class="step-num">2</div>
          <h3>Say the Invoice</h3>
          <p>Tell Claude who you are billing and for what. Our deterministic engine computes CGST/SGST/IGST in paise.</p>
        </div>
        <div class="step-card">
          <div class="step-num">3</div>
          <h3>Share Public Link & Track</h3>
          <p>Your client gets a clean invoice with UPI QR code. You get real-time tracking and overdue reminders.</p>
        </div>
      </div>

      <div class="feature-strip">
        <div>
          <h4>Deterministic GST Engine</h4>
          <p>Integer paise math, place-of-supply auto-detection, round-off, and Indian amount in words.</p>
        </div>
        <div>
          <h4>Instant UPI QR Code</h4>
          <p>Generated server-side with deeplink. Clients scan on phone or click Pay with UPI.</p>
        </div>
        <div>
          <h4>Smart Reminders (No AI)</h4>
          <p>Overdue queue with pre-drafted WhatsApp & Email messages. You click send when you're ready.</p>
        </div>
      </div>
    </section>
  </main>

  <footer>
    <div class="container">
      <p><strong>InvoiceDesk</strong> — GST invoice and collections desk for Indian freelancers.</p>
      <p style="margin-top: 6px; font-size: 13px;">No AI inside the app. Your own Claude does the thinking. Built for the Volopay Founder's Office assignment.</p>
    </div>
  </footer>
</body>
</html>`;
}

