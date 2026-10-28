import assert from "node:assert/strict";
import test from "node:test";

import { convertToUsd, SAMPLE_USD_RATES } from "../src/lib/currency.ts";

test("convertToUsd converts every workbench currency to USD", () => {
  assert.equal(convertToUsd(100, "USD"), 100);
  assert.equal(convertToUsd(100, "EUR"), 100 * SAMPLE_USD_RATES.EUR);
  assert.equal(convertToUsd(100, "GBP"), 100 * SAMPLE_USD_RATES.GBP);
  assert.equal(convertToUsd(-50, "EUR"), -50 * SAMPLE_USD_RATES.EUR);
  assert.equal(convertToUsd(100, "usd"), 100);
});

test("convertToUsd returns null for an unknown currency instead of guessing", () => {
  assert.equal(convertToUsd(100, "XYZ"), null);
  assert.equal(convertToUsd(100, ""), null);
});
