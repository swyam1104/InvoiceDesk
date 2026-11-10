// GST Engine for InvoiceDesk
// Deterministic server-side tax calculations in integer paise.
// Claude never does the math.

export interface LineItemInput {
  description: string;
  quantity: number;
  rate: number; // in rupees (can be decimal, e.g. 333.33)
  hsn_sac?: string;
}

export interface ComputedLineItem {
  position: number;
  description: string;
  hsn_sac: string;
  qty: number;
  rate_paise: number;
  amount_paise: number;
}

export interface GstEngineInput {
  items: LineItemInput[];
  gst_rate?: number; // 0, 5, 12, 18, 28, etc. Default 18.
  seller_gst_registered: boolean;
  seller_state_code?: string; // 2-digit code or state name
  seller_gstin?: string;
  client_state?: string; // name or 2-digit code
  client_gstin?: string;
}

export interface GstEngineResult {
  items: ComputedLineItem[];
  subtotal_paise: number;
  supply_type: 'intra' | 'inter' | 'none';
  cgst_paise: number;
  sgst_paise: number;
  igst_paise: number;
  roundoff_paise: number;
  total_paise: number;
  gst_rate: number;
  state_flag?: string; // Flag if client state was defaulted
  amount_in_words: string;
}

// 2-digit GST state code to canonical state name
export const GST_STATE_CODES: Record<string, string> = {
  '01': 'Jammu and Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '26': 'Dadra and Nagar Haveli and Daman and Diu',
  '27': 'Maharashtra',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
};

// Normalize any state string or GSTIN to a 2-digit state code
export function normalizeStateCode(stateOrGstin?: string): string | null {
  if (!stateOrGstin) return null;
  const trimmed = stateOrGstin.trim();
  if (!trimmed) return null;

  // If 15-char GSTIN, first 2 digits are the state code
  if (/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/i.test(trimmed)) {
    const code = trimmed.substring(0, 2);
    if (GST_STATE_CODES[code]) return code;
  }

  // If already 2 digits
  if (/^[0-9]{2}$/.test(trimmed)) {
    if (GST_STATE_CODES[trimmed]) return trimmed;
  }

  // By state name lookup
  const lower = trimmed.toLowerCase();
  for (const [code, name] of Object.entries(GST_STATE_CODES)) {
    if (name.toLowerCase() === lower) return code;
  }

  // Common aliases
  const aliases: Record<string, string> = {
    karnataka: '29',
    kar: '29',
    ka: '29',
    bangalore: '29',
    bengaluru: '29',
    maharashtra: '27',
    mh: '27',
    mumbai: '27',
    pune: '27',
    delhi: '07',
    dl: '07',
    'new delhi': '07',
    haryana: '06',
    hr: '06',
    gurgaon: '06',
    gurugram: '06',
    tamilnadu: '33',
    'tamil nadu': '33',
    tn: '33',
    chennai: '33',
    telangana: '36',
    ts: '36',
    tg: '36',
    hyderabad: '36',
    'uttar pradesh': '09',
    up: '09',
    noida: '09',
    rajasthan: '08',
    rj: '08',
    jaipur: '08',
    gujarat: '24',
    gj: '24',
    ahmedabad: '24',
    'west bengal': '19',
    wb: '19',
    kolkata: '19',
    kerala: '32',
    kl: '32',
    kochi: '32',
    punjab: '03',
    pb: '03',
    chandigarh: '04',
    ch: '04',
    bihar: '10',
    br: '10',
    patna: '10',
    odisha: '21',
    orissa: '21',
    or: '21',
    od: '21',
    bhubaneswar: '21',
    goa: '30',
    ga: '30',
    'madhya pradesh': '23',
    mp: '23',
    bhopal: '23',
    indore: '23',
    'andhra pradesh': '37',
    ap: '37',
    vizag: '37',
    visakhapatnam: '37',
    jharkhand: '20',
    jh: '20',
    ranchi: '20',
    chhattisgarh: '22',
    cg: '22',
    raipur: '22',
    uttarakhand: '05',
    uk: '05',
    dehradun: '05',
    assam: '18',
    as: '18',
    guwahati: '18',
  };

  return aliases[lower] ?? null;
}

// Compute GST, subtotal, roundoff, and amount in words
export function computeGst(input: GstEngineInput): GstEngineResult {
  const gstRate = input.gst_rate !== undefined ? input.gst_rate : 18;

  // 1. subtotal = sum(qty x rate) in integer paise
  const computedItems: ComputedLineItem[] = input.items.map((item, idx) => {
    // Convert rate in rupees to integer paise
    const ratePaise = Math.round(item.rate * 100);
    // Amount for line item: qty * rate in paise, rounded to integer paise
    const amountPaise = Math.round(item.quantity * ratePaise);
    return {
      position: idx + 1,
      description: item.description,
      hsn_sac: item.hsn_sac || '',
      qty: item.quantity,
      rate_paise: ratePaise,
      amount_paise: amountPaise,
    };
  });

  const subtotalPaise = computedItems.reduce((acc, it) => acc + it.amount_paise, 0);

  // 2. Seller not GST-registered: supply_type none, tax = 0
  if (!input.seller_gst_registered) {
    const totalRaw = subtotalPaise;
    const totalPaise = Math.round(totalRaw / 100) * 100;
    const roundoffPaise = totalPaise - totalRaw;
    return {
      items: computedItems,
      subtotal_paise: subtotalPaise,
      supply_type: 'none',
      cgst_paise: 0,
      sgst_paise: 0,
      igst_paise: 0,
      roundoff_paise: roundoffPaise,
      total_paise: totalPaise,
      gst_rate: 0,
      amount_in_words: amountToWords(totalPaise),
    };
  }

  // If GST rate is 0
  if (gstRate === 0) {
    const totalRaw = subtotalPaise;
    const totalPaise = Math.round(totalRaw / 100) * 100;
    const roundoffPaise = totalPaise - totalRaw;
    return {
      items: computedItems,
      subtotal_paise: subtotalPaise,
      supply_type: 'intra',
      cgst_paise: 0,
      sgst_paise: 0,
      igst_paise: 0,
      roundoff_paise: roundoffPaise,
      total_paise: totalPaise,
      gst_rate: 0,
      amount_in_words: amountToWords(totalPaise),
    };
  }

  // 3. Place of supply determination
  const sellerCode = normalizeStateCode(input.seller_state_code) || normalizeStateCode(input.seller_gstin) || '29'; // Default KA if not specified
  let clientCode = normalizeStateCode(input.client_gstin) || normalizeStateCode(input.client_state);
  let stateFlag: string | undefined;

  if (!clientCode) {
    // If unknown, default to seller state and flag it in the response
    clientCode = sellerCode;
    stateFlag = "Client state not provided, so CGST+SGST was applied. Ask the user for the client's state to confirm.";
  }

  // 4. Same state: CGST = SGST = subtotal x rate / 200. Different state: IGST = subtotal x rate / 100.
  let cgstPaise = 0;
  let sgstPaise = 0;
  let igstPaise = 0;
  let supplyType: 'intra' | 'inter' = 'intra';

  if (sellerCode === clientCode) {
    supplyType = 'intra';
    // CGST = subtotal * rate / 200, rounded to integer paise
    cgstPaise = Math.round((subtotalPaise * gstRate) / 200);
    sgstPaise = Math.round((subtotalPaise * gstRate) / 200);
  } else {
    supplyType = 'inter';
    // IGST = subtotal * rate / 100, rounded to integer paise
    igstPaise = Math.round((subtotalPaise * gstRate) / 100);
  }

  // 5. total_raw = subtotal + taxes; total rounded to nearest rupee; roundoff = total - total_raw
  const taxesPaise = cgstPaise + sgstPaise + igstPaise;
  const totalRawPaise = subtotalPaise + taxesPaise;
  const totalPaise = Math.round(totalRawPaise / 100) * 100;
  const roundoffPaise = totalPaise - totalRawPaise;

  return {
    items: computedItems,
    subtotal_paise: subtotalPaise,
    supply_type: supplyType,
    cgst_paise: cgstPaise,
    sgst_paise: sgstPaise,
    igst_paise: igstPaise,
    roundoff_paise: roundoffPaise,
    total_paise: totalPaise,
    gst_rate: gstRate,
    state_flag: stateFlag,
    amount_in_words: amountToWords(totalPaise),
  };
}

// 6. FY label runs April to March (e.g. 2026-27)
export function getFinancialYear(dateInput: Date | string = new Date()): string {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const year = d.getFullYear();
  const month = d.getMonth() + 1; // 1-12

  if (month >= 4) {
    // April to December
    const nextYearShort = String((year + 1) % 100).padStart(2, '0');
    return `${year}-${nextYearShort}`;
  } else {
    // January to March
    const currentYearShort = String(year % 100).padStart(2, '0');
    return `${year - 1}-${currentYearShort}`;
  }
}

// 7. Amount in words in the Indian numbering system
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen',
  'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function convertBelowThousand(n: number): string {
  if (n === 0) return '';
  if (n < 20) return ONES[n]!;
  if (n < 100) {
    const unit = n % 10;
    return unit ? `${TENS[Math.floor(n / 10)]}-${ONES[unit]}` : TENS[Math.floor(n / 10)]!;
  }
  const rem = n % 100;
  const hundreds = `${ONES[Math.floor(n / 100)]} Hundred`;
  return rem ? `${hundreds} ${convertBelowThousand(rem)}` : hundreds;
}

export function numberToIndianWords(n: number): string {
  if (n === 0) return 'Zero';
  if (n < 0) return `Minus ${numberToIndianWords(-n)}`;

  let rem = Math.floor(n);
  const parts: string[] = [];

  // Crores (10^7)
  const crores = Math.floor(rem / 10000000);
  if (crores > 0) {
    parts.push(`${convertBelowThousand(crores)} Crore`);
    rem %= 10000000;
  }

  // Lakhs (10^5)
  const lakhs = Math.floor(rem / 100000);
  if (lakhs > 0) {
    parts.push(`${convertBelowThousand(lakhs)} Lakh`);
    rem %= 100000;
  }

  // Thousands (10^3)
  const thousands = Math.floor(rem / 1000);
  if (thousands > 0) {
    parts.push(`${convertBelowThousand(thousands)} Thousand`);
    rem %= 1000;
  }

  // Hundreds & below
  if (rem > 0) {
    parts.push(convertBelowThousand(rem));
  }

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

export function amountToWords(paise: number): string {
  const rupees = Math.floor(paise / 100);
  const paiseRemainder = paise % 100;

  let words = `${numberToIndianWords(rupees)} Rupees`;
  if (paiseRemainder > 0) {
    words += ` and ${numberToIndianWords(paiseRemainder)} Paise`;
  }
  words += ' Only';
  return words;
}
