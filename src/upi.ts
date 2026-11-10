// UPI deep link and QR code generation for InvoiceDesk
import QRCode from 'qrcode';

export interface UpiPaymentDetails {
  upiId: string;
  payeeName: string;
  amountPaise: number;
  invoiceNumber: string;
}

// Generate standard UPI deeplink:
// upi://pay?pa=<vpa>&pn=<url-encoded name>&am=<amount, 2 decimals>&cu=INR&tn=<invoice number>
export function generateUpiDeeplink(details: UpiPaymentDetails): string {
  const { upiId, payeeName, amountPaise, invoiceNumber } = details;
  const amountRupees = (amountPaise / 100).toFixed(2);
  const vpa = upiId.trim();
  const pn = encodeURIComponent(payeeName.trim());
  const tn = encodeURIComponent(invoiceNumber.trim());

  return `upi://pay?pa=${vpa}&pn=${pn}&am=${amountRupees}&cu=INR&tn=${tn}`;
}

// Generate inline SVG string for the QR code server-side
export async function generateUpiQrSvg(details: UpiPaymentDetails): Promise<string> {
  const deeplink = generateUpiDeeplink(details);
  try {
    const svg = await QRCode.toString(deeplink, {
      type: 'svg',
      margin: 1,
      width: 200,
      color: {
        dark: '#1f1e1c',
        light: '#ffffff',
      },
    });
    return svg;
  } catch (err) {
    console.error('Error generating UPI QR SVG:', err);
    return '';
  }
}

