import { layout, flash, escHtml } from './layout.js';

export function loginView(opts: { error?: string; registered?: boolean }): string {
  const body = `
  <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px;">
    <div style="width: 100%; max-width: 400px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="font-size: 2rem;">⚡ InvoiceDesk</h1>
        <p class="text-muted" style="margin-top: 6px;">Say your invoice to Claude. We handle the rest.</p>
      </div>

      <div class="card card-pad">
        ${opts.registered ? '<div class="flash flash-success">Account created! Please sign in.</div>' : ''}
        ${opts.error ? flash(opts.error) : ''}

        <form method="POST" action="/login">
          <div class="form-row">
            <div class="form-group">
              <label>Email Address</label>
              <input type="email" name="email" required autocomplete="email" autofocus>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Password</label>
              <input type="password" name="password" required autocomplete="current-password">
            </div>
          </div>
          <button type="submit" class="btn btn-primary" style="width: 100%; justify-content: center; margin-top: 8px;">
            Sign In
          </button>
        </form>

        <p class="text-muted" style="text-align: center; margin-top: 20px; font-size: 13px;">
          Don't have an account? <a href="/signup">Sign up</a>
        </p>
      </div>
    </div>
  </div>
  `;
  return layout({ title: 'Sign In', body });
}

export function signupView(opts: { error?: string }): string {
  const body = `
  <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px;">
    <div style="width: 100%; max-width: 480px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="font-size: 2rem;">⚡ InvoiceDesk</h1>
        <p class="text-muted" style="margin-top: 6px;">GST invoice & collections desk for Indian freelancers</p>
      </div>

      <div class="card card-pad">
        ${opts.error ? flash(opts.error) : ''}

        <form method="POST" action="/signup">
          <div class="form-row">
            <div class="form-group">
              <label>Your Name</label>
              <input type="text" name="name" required placeholder="Riya Sharma">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Email Address</label>
              <input type="email" name="email" required placeholder="riya@example.com">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Password</label>
              <input type="password" name="password" required minlength="6">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Your State (for GST place of supply)</label>
              <input type="text" name="state" placeholder="e.g. Karnataka, Maharashtra">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>GSTIN (optional — leave blank if not registered)</label>
              <input type="text" name="gstin" placeholder="29ABCDE1234F1Z5">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>UPI ID (for payments on public link)</label>
              <input type="text" name="upi_id" placeholder="riya@upi">
            </div>
          </div>
          <button type="submit" class="btn btn-primary" style="width: 100%; justify-content: center; margin-top: 8px;">
            Create Account & Get MCP URL
          </button>
        </form>

        <p class="text-muted" style="text-align: center; margin-top: 20px; font-size: 13px;">
          Already have an account? <a href="/login">Sign in</a>
        </p>
      </div>
    </div>
  </div>
  `;
  return layout({ title: 'Sign Up', body });
}

