// Reminder templates and scheduled cron job
import cron from 'node-cron';
import { db } from './db.js';

export interface OverdueReminderItem {
  invoiceId: number;
  userId: number;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  invoiceNumber: string;
  amountRupees: string;
  dueDate: string;
  daysLate: number;
  publicLink: string;
  templateMessage: string;
}

export function generateReminderTemplate(params: {
  clientName: string;
  invoiceNumber: string;
  amountRupees: string;
  dueDate: string;
  daysLate: number;
  publicLink: string;
}): string {
  const { clientName, invoiceNumber, amountRupees, dueDate, daysLate, publicLink } = params;

  if (daysLate <= 7) {
    // 1 to 7: friendly
    return `Hi ${clientName}, a gentle reminder that invoice ${invoiceNumber} for ₹${amountRupees} was due on ${dueDate} (${daysLate} days ago). You can view and pay here: ${publicLink}. Thank you!`;
  } else if (daysLate <= 21) {
    // 8 to 21: firm but polite
    return `Hi ${clientName}, following up on invoice ${invoiceNumber} for ₹${amountRupees}, which is now ${daysLate} days overdue (due ${dueDate}). Please arrange the payment at your earliest convenience: ${publicLink}. Thanks!`;
  } else {
    // 22+: final notice
    return `Urgent: Invoice ${invoiceNumber} for ₹${amountRupees} is now ${daysLate} days past due (${dueDate}). Please settle this immediately to avoid service interruption: ${publicLink}.`;
  }
}

// Run the daily overdue flip and draft creation logic
export async function runDailyReminderJob(): Promise<{ flippedCount: number; draftsCreated: number }> {
  const today = new Date().toISOString().split('T')[0]!;
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

  // 1. UPDATE invoices SET status='overdue' WHERE status='sent' AND due_date < today
  const flipRes = await db.execute(
    `UPDATE invoices SET status = 'overdue', updated_at = CURRENT_TIMESTAMP
     WHERE status = 'sent' AND due_date < $1`,
    [today]
  );
  const flippedCount = flipRes.rowCount || 0;

  // 2. Find overdue invoices without a reminder in the last 3 days
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

  const overdueInvoices = await db.query<any>(
    `SELECT i.id, i.user_id, i.number, i.public_id, i.due_date, i.total_paise,
            c.name as client_name, c.phone as client_phone, c.email as client_email
     FROM invoices i
     LEFT JOIN clients c ON i.client_id = c.id
     WHERE i.status = 'overdue'
       AND i.id NOT IN (
         SELECT invoice_id FROM reminders
         WHERE created_at > $1
       )`,
    [threeDaysAgo]
  );

  let draftsCreated = 0;
  for (const inv of overdueInvoices) {
    const dueTime = new Date(inv.due_date).getTime();
    const nowTime = Date.now();
    const daysLate = Math.max(1, Math.floor((nowTime - dueTime) / (1000 * 60 * 60 * 24)));
    const amountRupees = (Number(inv.total_paise) / 100).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const publicLink = `${baseUrl}/i/${inv.public_id}`;

    const msg = generateReminderTemplate({
      clientName: inv.client_name || 'Client',
      invoiceNumber: inv.number,
      amountRupees,
      dueDate: inv.due_date,
      daysLate,
      publicLink,
    });

    await db.execute(
      `INSERT INTO reminders (invoice_id, channel, message, status, created_by)
       VALUES ($1, 'whatsapp', $2, 'draft', 'cron')`,
      [inv.id, msg]
    );

    draftsCreated++;
  }

  return { flippedCount, draftsCreated };
}

// Start daily cron at 09:00 IST (03:30 UTC)
export function startCronJob(): void {
  // '30 3 * * *' = 03:30 UTC = 09:00 IST
  cron.schedule('30 3 * * *', async () => {
    console.log('[Cron] Running daily overdue check & reminder drafts...');
    try {
      const stats = await runDailyReminderJob();
      console.log(`[Cron] Complete. Flipped: ${stats.flippedCount}, Drafts: ${stats.draftsCreated}`);
    } catch (err) {
      console.error('[Cron] Error running reminder job:', err);
    }
  });
}

