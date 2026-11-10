// MCP Endpoint & Tools for Claude Integration
// Stateless Streamable HTTP over POST /mcp/:token
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import type { Request, Response } from 'express';
import { authenticateMcpToken, type AuthenticatedUser } from './auth.js';
import { InvoiceService } from './invoices.js';

// Format currency in Indian Rupees
function formatRupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Format successful invoice creation output as required by PRD A8:
// "Success text starts with one plain sentence, then compact lines:
// number, client, subtotal, tax lines, total, due date, status, public link, dashboard link."
function formatInvoiceSuccessText(inv: any, publicUrl: string, dashboardUrl: string, stateFlag?: string): string {
  const taxLines: string[] = [];
  if (inv.supply_type === 'intra') {
    taxLines.push(`CGST (${inv.gst_rate / 2}%): ${formatRupees(inv.cgst_paise)}`);
    taxLines.push(`SGST (${inv.gst_rate / 2}%): ${formatRupees(inv.sgst_paise)}`);
  } else if (inv.supply_type === 'inter') {
    taxLines.push(`IGST (${inv.gst_rate}%): ${formatRupees(inv.igst_paise)}`);
  } else {
    taxLines.push(`GST: None (non-registered seller)`);
  }

  if (inv.roundoff_paise !== 0) {
    taxLines.push(`Round-off: ${formatRupees(inv.roundoff_paise)}`);
  }

  let text = `Invoice created successfully.\n`;
  if (stateFlag) {
    text += `Note: ${stateFlag}\n`;
  }
  text += `Invoice Number: ${inv.number}\n`;
  text += `Client: ${inv.client?.name || 'Client'}\n`;
  text += `Subtotal: ${formatRupees(inv.subtotal_paise)}\n`;
  text += `${taxLines.join('\n')}\n`;
  text += `Total: ${formatRupees(inv.total_paise)}\n`;
  text += `Due Date: ${inv.due_date || 'N/A'}\n`;
  text += `Status: ${inv.status}\n`;
  text += `Public Link: ${publicUrl}\n`;
  text += `Dashboard Link: ${dashboardUrl}`;

  return text;
}

export function registerMcpTools(server: McpServer, user: AuthenticatedUser): void {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

  // 1. create_invoice
  server.tool(
    'create_invoice',
    "Create a new customer invoice in InvoiceDesk for the user's freelance or business work. Use whenever the user asks to bill, invoice or charge a client. Provide client_name and at least one item with description, quantity and rate in rupees (excluding GST). GST is calculated by the server: pass gst_rate (e.g. 18) only if the user mentions it, otherwise omit. Pass client_state (e.g. \"Karnataka\") or client_gstin if known so the app picks CGST+SGST vs IGST correctly. Set due_in_days (e.g. 15) or due_date (YYYY-MM-DD). Do not compute totals yourself. Returns the invoice number, totals and links; always show the user both the dashboard link and the public link.",
    {
      client_name: z.string().min(1).describe("Client or business name"),
      client_email: z.string().email().optional().describe("Client email address"),
      client_gstin: z.string().length(15).optional().describe("15-character GSTIN of the client"),
      client_state: z.string().optional().describe("Client state name or 2-digit code (e.g. 'Karnataka', '29')"),
      items: z.array(z.object({
        description: z.string().min(1).describe("Description of goods or service"),
        quantity: z.number().positive().default(1).describe("Quantity"),
        rate: z.number().nonnegative().describe("Rate in rupees, excluding GST"),
        hsn_sac: z.string().optional().describe("Optional HSN or SAC code"),
      })).min(1).describe("List of line items"),
      gst_rate: z.number().min(0).max(40).optional().describe("GST percentage rate (e.g. 18, 5, 0). Omit if not specified."),
      due_in_days: z.number().int().min(0).max(365).optional().describe("Payment terms in days from today"),
      due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Specific due date in YYYY-MM-DD format"),
      notes: z.string().optional().describe("Payment notes or bank/UPI instructions"),
      send: z.boolean().optional().describe("Set to true if user wants to mark invoice sent immediately"),
    },
    async (args) => {
      try {
        const { invoice, publicUrl, dashboardUrl, stateFlag } = await InvoiceService.createInvoice(user.id, {
          client_name: args.client_name,
          client_email: args.client_email,
          client_gstin: args.client_gstin,
          client_state: args.client_state,
          items: args.items,
          gst_rate: args.gst_rate,
          due_in_days: args.due_in_days,
          due_date: args.due_date,
          notes: args.notes,
          send: args.send,
          created_via: 'claude',
        });

        // Check if seller has UPI ID set
        let warning = '';
        if (!user.profile.upi_id) {
          warning = `\nSeller profile has no UPI ID. Ask the user to add it at ${baseUrl}/settings; the invoice was still created.`;
        }

        const formatted = formatInvoiceSuccessText(invoice, publicUrl, dashboardUrl, stateFlag) + warning;

        return {
          content: [{ type: 'text', text: formatted }],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text', text: `Failed to create invoice: ${err.message || 'Unknown error'}. Please verify client details and line items.` }],
          isError: true,
        };
      }
    }
  );

  // 2. update_invoice
  server.tool(
    'update_invoice',
    'Change an existing invoice (items, due date, GST rate, client details, notes, status draft/sent/void). Identify it with invoice_ref (invoice number like INV/2026-27/003, or the id from list_invoices). Send only the fields that change. If items are provided they replace the whole item list.',
    {
      invoice_ref: z.string().min(1).describe("Invoice number (e.g. INV/2026-27/001) or internal ID"),
      client_name: z.string().optional(),
      client_email: z.string().email().optional(),
      client_gstin: z.string().length(15).optional(),
      client_state: z.string().optional(),
      items: z.array(z.object({
        description: z.string().min(1),
        quantity: z.number().positive().default(1),
        rate: z.number().nonnegative(),
        hsn_sac: z.string().optional(),
      })).optional(),
      gst_rate: z.number().min(0).max(40).optional(),
      due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      notes: z.string().optional(),
      status: z.enum(['draft', 'sent', 'void']).optional(),
    },
    async (args) => {
      try {
        const updated = await InvoiceService.updateInvoice(user.id, args.invoice_ref, {
          client_name: args.client_name,
          client_email: args.client_email,
          client_gstin: args.client_gstin,
          client_state: args.client_state,
          items: args.items,
          gst_rate: args.gst_rate,
          due_date: args.due_date,
          notes: args.notes,
          status: args.status,
        });

        const publicUrl = `${baseUrl}/i/${updated.public_id}`;
        const dashboardUrl = `${baseUrl}/invoices/${updated.id}`;

        let text = `Invoice ${updated.number} updated successfully.\n`;
        text += `Client: ${updated.client?.name || 'Client'}\n`;
        text += `New Total: ${formatRupees(updated.total_paise)}\n`;
        text += `Due Date: ${updated.due_date || 'N/A'}\n`;
        text += `Status: ${updated.status}\n`;
        text += `Public Link: ${publicUrl}\n`;
        text += `Dashboard Link: ${dashboardUrl}`;

        return { content: [{ type: 'text', text }] };
      } catch (err: any) {
        return {
          content: [{ type: 'text', text: `Failed to update invoice: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  // 3. list_invoices
  server.tool(
    'list_invoices',
    'List the user\'s invoices. Use for questions like "who owes me money", "what\'s overdue", "show Acme\'s invoices". Optional filters: status (draft, sent, paid, overdue, void, unpaid), client, from_date, to_date, limit (default 20). Returns a compact list and the total outstanding amount.',
    {
      status: z.enum(['draft', 'sent', 'paid', 'overdue', 'void', 'unpaid']).optional().describe("Filter by status"),
      client: z.string().optional().describe("Filter by client name"),
      from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("From issue date (YYYY-MM-DD)"),
      to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("To issue date (YYYY-MM-DD)"),
      limit: z.number().int().min(1).max(100).optional().default(20),
    },
    async (args) => {
      try {
        const { invoices, outstandingTotalPaise, count } = await InvoiceService.listInvoices(user.id, args);

        if (invoices.length === 0) {
          return {
            content: [{ type: 'text', text: 'No invoices found matching the specified filters.' }],
          };
        }

        let text = `Found ${count} invoice(s). Total outstanding: ${formatRupees(outstandingTotalPaise)}\n\n`;
        for (const inv of invoices) {
          const publicUrl = `${baseUrl}/i/${inv.public_id}`;
          const clientDisplay = (inv as any).client_name || inv.client?.name || 'Client';
          text += `• ${inv.number} | ${clientDisplay} | ${formatRupees(inv.total_paise)} | Status: ${inv.status} | Due: ${inv.due_date || 'N/A'} | Link: ${publicUrl}\n`;
        }

        return { content: [{ type: 'text', text: text.trim() }] };
      } catch (err: any) {
        return {
          content: [{ type: 'text', text: `Failed to list invoices: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  // 4. get_invoice
  server.tool(
    'get_invoice',
    'Get full details and status of one invoice by invoice_ref, including payment status and reminder history.',
    {
      invoice_ref: z.string().min(1).describe("Invoice number (e.g. INV/2026-27/001) or internal ID"),
    },
    async (args) => {
      try {
        const invoiceId = await InvoiceService.resolveInvoiceId(user.id, args.invoice_ref);
        if (!invoiceId) {
          return {
            content: [{ type: 'text', text: `No invoice found for "${args.invoice_ref}". Call list_invoices to see valid numbers.` }],
            isError: true,
          };
        }

        const inv = await InvoiceService.getInvoiceById(invoiceId, user.id);
        if (!inv) {
          return {
            content: [{ type: 'text', text: `Invoice not found.` }],
            isError: true,
          };
        }

        const publicUrl = `${baseUrl}/i/${inv.public_id}`;
        const dashboardUrl = `${baseUrl}/invoices/${inv.id}`;

        let text = `Invoice Details: ${inv.number}\n`;
        text += `Client: ${inv.client?.name || 'N/A'}${inv.client?.email ? ` (${inv.client.email})` : ''}\n`;
        text += `Issue Date: ${inv.issue_date} | Due Date: ${inv.due_date || 'N/A'}\n`;
        text += `Status: ${inv.status.toUpperCase()}\n`;
        if (inv.paid_on) {
          text += `Paid On: ${inv.paid_on} via ${inv.paid_method || 'UPI'}\n`;
        }
        text += `Subtotal: ${formatRupees(inv.subtotal_paise)}\n`;
        if (inv.cgst_paise > 0) text += `CGST: ${formatRupees(inv.cgst_paise)} | SGST: ${formatRupees(inv.sgst_paise)}\n`;
        if (inv.igst_paise > 0) text += `IGST: ${formatRupees(inv.igst_paise)}\n`;
        text += `Total: ${formatRupees(inv.total_paise)}\n\n`;

        text += `Items:\n`;
        for (const item of (inv.items || [])) {
          text += `  - ${item.description}: ${item.qty} × ${formatRupees(item.rate_paise)} = ${formatRupees(item.amount_paise)}\n`;
        }

        if (inv.reminders && inv.reminders.length > 0) {
          text += `\nReminder History:\n`;
          for (const rem of inv.reminders) {
            text += `  [${rem.created_at}] (${rem.channel}, by ${rem.created_by}): "${rem.message}"\n`;
          }
        }

        text += `\nPublic Link: ${publicUrl}\nDashboard Link: ${dashboardUrl}`;

        return { content: [{ type: 'text', text }] };
      } catch (err: any) {
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  // 5. mark_paid
  server.tool(
    'mark_paid',
    'Record that a client has paid an invoice in full. Use only when the user says payment was received. Optional paid_on (YYYY-MM-DD, default today), method (UPI, bank, cash, other) and note.',
    {
      invoice_ref: z.string().min(1).describe("Invoice number (e.g. INV/2026-27/001) or internal ID"),
      paid_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Payment date in YYYY-MM-DD format (defaults to today)"),
      method: z.string().optional().default('UPI').describe("Payment method: UPI, Bank, Cash, or Other"),
      note: z.string().optional().describe("Optional note or transaction reference ID"),
    },
    async (args) => {
      try {
        const inv = await InvoiceService.markPaid(user.id, args.invoice_ref, args.paid_on, args.method, args.note);
        const publicUrl = `${baseUrl}/i/${inv.public_id}`;

        let text = `Invoice ${inv.number} has been marked as PAID.\n`;
        text += `Amount: ${formatRupees(inv.total_paise)}\n`;
        text += `Paid On: ${inv.paid_on}\n`;
        text += `Method: ${inv.paid_method}\n`;
        text += `Public Link (now shows PAID stamp): ${publicUrl}`;

        return { content: [{ type: 'text', text }] };
      } catch (err: any) {
        return {
          content: [{ type: 'text', text: `Failed to mark invoice as paid: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  // 6. save_reminder_draft
  server.tool(
    'save_reminder_draft',
    'After you have written a payment reminder for an overdue or due invoice, save it so the user can send it from the dashboard. Provide invoice_ref, the message text, and channel (whatsapp or email). This does not send anything.',
    {
      invoice_ref: z.string().min(1).describe("Invoice number (e.g. INV/2026-27/001) or internal ID"),
      message: z.string().min(1).describe("The reminder message text"),
      channel: z.enum(['whatsapp', 'email']).optional().default('whatsapp').describe("Delivery channel"),
    },
    async (args) => {
      try {
        const { reminderId, invoice } = await InvoiceService.saveReminderDraft(
          user.id,
          args.invoice_ref,
          args.message,
          args.channel
        );

        const dashboardUrl = `${baseUrl}/invoices/${invoice.id}`;

        let text = `Reminder draft saved for invoice ${invoice.number}.\n`;
        text += `Channel: ${args.channel}\n`;
        text += `Message: "${args.message}"\n`;
        text += `The user can review and send it from the dashboard: ${dashboardUrl}`;

        return { content: [{ type: 'text', text }] };
      } catch (err: any) {
        return {
          content: [{ type: 'text', text: `Failed to save reminder draft: ${err.message}` }],
          isError: true,
        };
      }
    }
  );
}

// Stateless Streamable HTTP Request Handler for POST /mcp/:token
export async function handleMcpRequest(req: Request, res: Response): Promise<void> {
  const token = req.params.token;

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
    return;
  }

  // Look up user by hashed token
  const user = await authenticateMcpToken(token);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized: Invalid or unknown MCP token.' });
    return;
  }

  // Create fresh stateless McpServer instance bound to this user
  const server = new McpServer({
    name: 'InvoiceDesk',
    version: '1.0.0',
  });

  registerMcpTools(server, user);

  // Stateless Streamable HTTP transport
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err: any) {
    console.error('Error handling MCP request:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal MCP Error' });
    }
  } finally {
    res.on('close', () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });
  }
}
