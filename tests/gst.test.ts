import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeGst, getFinancialYear, amountToWords, normalizeStateCode } from '../src/gst.js';

test('1. Intra-state 18% GST: ₹45,000 gives CGST 4,050 + SGST 4,050 = ₹53,100', () => {
  const result = computeGst({
    items: [{ description: 'March brand design work', quantity: 1, rate: 45000 }],
    gst_rate: 18,
    seller_gst_registered: true,
    seller_state_code: 'Karnataka',
    client_state: 'Karnataka',
  });

  assert.equal(result.subtotal_paise, 4500000); // ₹45,000.00
  assert.equal(result.supply_type, 'intra');
  assert.equal(result.cgst_paise, 405000); // ₹4,050.00
  assert.equal(result.sgst_paise, 405000); // ₹4,050.00
  assert.equal(result.igst_paise, 0);
  assert.equal(result.roundoff_paise, 0);
  assert.equal(result.total_paise, 5310000); // ₹53,100.00
  assert.match(result.amount_in_words, /Fifty[- ]Three Thousand One Hundred Rupees Only/i);
});

test('2. Inter-state 18% GST: ₹45,000 gives IGST 8,100 = ₹53,100', () => {
  const result = computeGst({
    items: [{ description: 'March brand design work', quantity: 1, rate: 45000 }],
    gst_rate: 18,
    seller_gst_registered: true,
    seller_state_code: 'Haryana', // '06'
    client_state: 'Karnataka',    // '29'
  });

  assert.equal(result.subtotal_paise, 4500000);
  assert.equal(result.supply_type, 'inter');
  assert.equal(result.cgst_paise, 0);
  assert.equal(result.sgst_paise, 0);
  assert.equal(result.igst_paise, 810000); // ₹8,100.00
  assert.equal(result.total_paise, 5310000); // ₹53,100.00
});

test('3. 0% GST rate', () => {
  const result = computeGst({
    items: [{ description: 'Exempt consulting', quantity: 2, rate: 10000 }],
    gst_rate: 0,
    seller_gst_registered: true,
    seller_state_code: 'Karnataka',
    client_state: 'Karnataka',
  });

  assert.equal(result.subtotal_paise, 2000000);
  assert.equal(result.cgst_paise, 0);
  assert.equal(result.sgst_paise, 0);
  assert.equal(result.igst_paise, 0);
  assert.equal(result.total_paise, 2000000);
});

test('4. Decimal quantity: 2.5 x ₹333.33 with rounding', () => {
  const result = computeGst({
    items: [{ description: 'Hourly work', quantity: 2.5, rate: 333.33 }],
    gst_rate: 18,
    seller_gst_registered: true,
    seller_state_code: 'Maharashtra',
    client_state: 'Maharashtra',
  });

  // 2.5 * 33333 paise = 83332.5 -> 83333 paise (₹833.33)
  assert.equal(result.subtotal_paise, 83333);
  // CGST = 83333 * 18 / 200 = 7499.97 -> 7500 paise (₹75.00)
  assert.equal(result.cgst_paise, 7500);
  assert.equal(result.sgst_paise, 7500);
  // total_raw = 83333 + 7500 + 7500 = 98333 paise (₹983.33)
  // total rounded to nearest rupee = 98300 paise (₹983.00)
  // roundoff = 98300 - 98333 = -33 paise (-₹0.33)
  assert.equal(result.roundoff_paise, -33);
  assert.equal(result.total_paise, 98300);
});

test('5. Non-registered seller: no tax lines', () => {
  const result = computeGst({
    items: [{ description: 'Writing article', quantity: 1, rate: 15000 }],
    seller_gst_registered: false,
    seller_state_code: 'Delhi',
    client_state: 'Karnataka',
  });

  assert.equal(result.supply_type, 'none');
  assert.equal(result.cgst_paise, 0);
  assert.equal(result.sgst_paise, 0);
  assert.equal(result.igst_paise, 0);
  assert.equal(result.total_paise, 1500000);
});

test('6. FY boundary test: 31 Mar vs 1 Apr', () => {
  const fy31Mar = getFinancialYear('2026-03-31');
  const fy1Apr = getFinancialYear('2026-04-01');

  assert.equal(fy31Mar, '2025-26');
  assert.equal(fy1Apr, '2026-27');
});

test('7. State code derivation from GSTIN and aliases', () => {
  assert.equal(normalizeStateCode('29ABCDE1234F1Z5'), '29'); // Karnataka
  assert.equal(normalizeStateCode('06ABCDE1234F1Z5'), '06'); // Haryana
  assert.equal(normalizeStateCode('karnataka'), '29');
  assert.equal(normalizeStateCode('delhi'), '07');
  assert.equal(normalizeStateCode('DL'), '07');
});
