/**
 * Sample USD conversion rates for display in the Invoice Workbench.
 * These are static indicative rates, NOT live foreign-exchange rates.
 * Original-currency amounts remain the records of truth.
 */
export const SAMPLE_USD_RATES: Record<string, number> = {
  USD: 1,
  EUR: 1.08,
  GBP: 1.27,
};

export const SAMPLE_RATES_LABEL = "Sample rates (not live FX): EUR 1.08, GBP 1.27 per USD";

export function convertToUsd(amount: number, currency: string): number | null {
  const rate = SAMPLE_USD_RATES[currency.trim().toUpperCase()];
  return rate === undefined ? null : amount * rate;
}
