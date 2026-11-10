# InvoiceDesk ⚡

> **GST invoice and collections desk for Indian freelancers.**  
> Runs on the customer's own Claude via Model Context Protocol (MCP).  
> **No AI inside the app.**

Prepared for the Volopay Founder's Office assignment.

---

## 1. Why Not Just Claude?

> *"Claude can write an invoice, but it cannot host it, track whether it got paid, or chase the client next week."*

Tell Claude:
```text
"Invoice Acme ₹45,000 for March design work, 18% GST, due in 15 days."
```
InvoiceDesk turns it into a real GST invoice with an unguessable public link and UPI QR, tracks payment status (`draft`, `sent`, `paid`, `overdue`), and queues reminders. Claude does the thinking and writing. The app does the saving, editing, hosting, and chasing.

---

## 2. No AI Inside Statement & Disclosure

**Built with AI coding tools. The running app contains no AI and no AI keys.**

- There are **no AI SDKs** in `package.json` (no `openai`, no `@anthropic-ai/sdk`, no `@google/genai`).
- There are **no AI API keys** in environment variables.
- All reminder templates are deterministic cron + string interpolation.
- Claude runs entirely on the user's own Claude client via the remote MCP server.

---

## 3. Architecture

```text
User's Claude Client
     │  (MCP over HTTPS / Streamable HTTP)
     ▼
POST /mcp/:token ──┐
                   ▼
       [ Express MCP Router ]
                   │
                   ▼
    ┌──────────────────────────────┐
    │  Shared InvoiceService Layer │ ◄── [ Express Web Routes ] ◄── Owner Browser
    │        (src/invoices.ts)     │                                (/login, /invoices, /settings)
    └──────────────┬───────────────┘
                   │
         ┌─────────┴─────────┐
         ▼                   ▼
  [ Deterministic      [ PostgreSQL / ]
    GST Engine ]         In-Memory DB
   (src/gst.ts)
         │
         ▼
  [ Public Invoice Page (/i/:public_id) ] ◄── Client Browser (View & UPI QR)
         ▲
  [ Daily Scheduled Cron (09:00 IST) ] ── Overdue flips + reminder drafts
```

---

## 4. MCP Tools Contract (6 Tools)

| Tool | When Claude Uses It | Key Inputs | Returns |
| :--- | :--- | :--- | :--- |
| `create_invoice` | User asks to bill / invoice a client | `client_name`, `items[]`, `gst_rate?`, `client_state?`, `client_gstin?`, `due_in_days?`, `due_date?`, `notes?`, `send?` | Invoice number, totals, tax split, dashboard URL + public URL |
| `update_invoice` | User wants to change an existing invoice | `invoice_ref` + fields to change | Updated summary, new total & links |
| `list_invoices` | "Who owes me?", "show Acme's invoices" | `status?`, `client?`, `from_date?`, `to_date?`, `limit?` | Compact list + total outstanding |
| `get_invoice` | Check one invoice's details or status | `invoice_ref` | Full invoice details, items & reminder history |
| `mark_paid` | User says a client paid | `invoice_ref`, `paid_on?`, `method?`, `note?` | Confirmation + updated PAID status |
| `save_reminder_draft`| After Claude writes a polite/firm reminder | `invoice_ref`, `message`, `channel` | Confirmation + dashboard review link |

---

## 5. Quickstart & Setup

### Prerequisites
- Node.js 20+

### Installation
```bash
# Clone and install dependencies
git clone https://github.com/your-username/invoicedesk.git
cd invoicedesk
npm install
```

### Environment Variables
Copy `.env.example` to `.env`:
```env
PORT=3000
BASE_URL=http://localhost:3000
DATABASE_URL=postgres://user:pass@host:5432/dbname   # Optional: defaults to in-memory PostgreSQL if omitted
SESSION_SECRET=your_32_character_session_secret
```

### Running the App
```bash
# Start development server
npm run dev

# Or build and start production server
npm run build
npm start
```

### Database Seeds
```bash
# Seed the Reviewer Account (Starts with a filled profile and ZERO invoices)
npm run seed:reviewer

# Seed Demo Account (3 sample invoices: 1 paid, 1 overdue with reminder, 1 sent)
npm run seed:demo
```

### Running Tests
```bash
# Run all unit and integration tests
npm test

# Run GST engine test suite (all cases from PRD Part B, Section 7)
npm run test:gst

# Run Invoices service layer tests
npm run test:invoices
```

---

## 6. Connecting to Claude (5-Step Guide)

1. Open **Claude** ([claude.ai](https://claude.ai)) and navigate to **Settings &rarr; Connectors**.
2. Click **Add custom connector**.
3. Name it **InvoiceDesk**, paste your personal MCP URL (e.g. `https://your-domain.com/mcp/<your-token>`), and save.
4. Start a fresh chat in Claude, enable the **InvoiceDesk** connector, and allow tools when prompted.
5. Paste any of the sample prompts below.

---

## 7. Sample Demo Prompts

### Main Prompt
```text
Create an invoice for Acme Design Pvt Ltd (Karnataka) for ₹45,000 for March brand design work, 18% GST, due in 15 days.
```

### Follow-up Prompts
```text
1. Change the due date to 30 days from today and add a line "Logo files, ₹5,000".
2. Who owes me money right now?
3. Write a polite reminder for the Acme invoice and save it.
4. Acme paid via UPI today. Mark it paid.
```

---

## 8. Reviewer Package Credentials

- **Live URL**: `https://<your-app>.onrender.com`
- **Reviewer Login**:
  - Email: `reviewer@invoicedesk.dev`
  - Password: `ReviewerPassword2026!`
  - State: Karnataka (`29`), GST Registered: Yes, UPI ID: `reviewer@okaxis`
  - Invoices: **0** (starts clean for reviewer testing)
- **Reviewer MCP Token URL**:
  - `https://<your-app>.onrender.com/mcp/reviewer-mcp-token-test-2026-volopay`

---

## 9. Product Roadmap (Say it, don't build it)

- **Week 2**: Direct Email and WhatsApp sending via Twilio/Meta API, custom logo upload, automated PDF download via headless Chrome.
- **Month 2**: Razorpay / Cashfree payment links with automated webhook reconciliation, recurring retainer invoices.
- **Month 3**: Full OAuth 2.0 flow for Claude connector and Anthropic Connector Directory listing.
- **Later**: Tally & Zoho Books bidirectional sync, e-invoicing (IRN / e-way bill generation), multi-seat team workspaces for creative studios.

