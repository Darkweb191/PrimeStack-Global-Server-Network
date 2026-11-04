import Decimal from "decimal.js";

/**
 * Configure Decimal.js for financial calculations.
 * High precision is critical for a payment switch.
 *
 * Precision: 28 significant digits (enough for crypto + fiat)
 * Rounding: ROUND_HALF_EVEN (banker's rounding — standard in finance)
 */
Decimal.set({
  precision: 28,
  rounding: Decimal.ROUND_HALF_EVEN,
});

export { Decimal };

/**
 * Helper: safely create a Decimal from a number, string, or Decimal.
 * Throws on invalid input to prevent silent financial errors.
 */
export function toDecimal(value: Decimal | number | string): Decimal {
  const d = new Decimal(value);
  if (d.isNaN()) {
    throw new Error(`Invalid decimal value: ${value}`);
  }
  return d;
}

/**
 * Format a Decimal to a fixed string with given decimal places.
 * Used for ledger entries where consistency matters.
 */
export function formatAmount(value: Decimal | number | string, places = 4): string {
  return toDecimal(value).toFixed(places);
}
