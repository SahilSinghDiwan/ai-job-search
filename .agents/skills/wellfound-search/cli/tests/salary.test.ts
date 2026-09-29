import { describe, expect, test } from "bun:test";
import { parseAmount, parseCompensation } from "../src/helpers.ts";
import { formatMoney } from "../src/table.ts";

describe("parseAmount", () => {
  test("Indian and Western magnitude suffixes", () => {
    expect(parseAmount("30L")).toBe(3_000_000);
    expect(parseAmount("1.5Cr")).toBe(15_000_000);
    expect(parseAmount("50k")).toBe(50_000);
    expect(parseAmount("1.2M")).toBe(1_200_000);
    expect(parseAmount("10,000")).toBe(10_000);
    expect(parseAmount("200")).toBe(200);
  });
});

describe("parseCompensation — every shape seen live on 2026-08-25", () => {
  test("INR lakh range with an equity band", () => {
    const s = parseCompensation("₹30L – ₹47L • 0.02% – 0.05%");
    expect(s.currency).toBe("INR");
    expect(s.min).toBe(3_000_000);
    expect(s.max).toBe(4_700_000);
    expect(s.equity.mentioned).toBe(true);
    expect(s.equity.offered).toBe(true);
    expect(s.equity.minPercent).toBe(0.02);
    expect(s.equity.maxPercent).toBe(0.05);
  });

  test('"No equity" is recorded as mentioned-but-not-offered, not as unknown', () => {
    const s = parseCompensation("₹15L – ₹25L • No equity");
    expect(s.min).toBe(1_500_000);
    expect(s.max).toBe(2_500_000);
    expect(s.equity.mentioned).toBe(true);
    expect(s.equity.offered).toBe(false);
    expect(s.equity.raw).toBe("No equity");
  });

  test("comma-grouped amounts (the intern/monthly shape) are not mistaken for lakhs", () => {
    const s = parseCompensation("₹10,000 – ₹20,000 • No equity");
    expect(s.min).toBe(10_000);
    expect(s.max).toBe(20_000);
    // Critically: period is null. This card is monthly in reality; guessing
    // "per year" here would misreport it by 12x.
    expect(s.period).toBeNull();
  });

  test("USD range with no equity clause at all", () => {
    const s = parseCompensation("$112k – $140k");
    expect(s.currency).toBe("USD");
    expect(s.currencySource).toBe("symbol");
    expect(s.min).toBe(112_000);
    expect(s.max).toBe(140_000);
    expect(s.equity.mentioned).toBe(false);
    expect(s.equity.offered).toBeNull();
  });

  test("a flat single-value range", () => {
    const s = parseCompensation("$200k – $200k • 0.1% – 0.2%");
    expect(s.min).toBe(200_000);
    expect(s.max).toBe(200_000);
  });

  test("an empty compensation string yields a fully null salary, never a zero", () => {
    const s = parseCompensation("");
    expect(s.raw).toBeNull();
    expect(s.min).toBeNull();
    expect(s.max).toBeNull();
    expect(s.currency).toBeNull();
    expect(s.equity.mentioned).toBe(false);
  });

  test("null and undefined are handled the same as empty", () => {
    expect(parseCompensation(null).raw).toBeNull();
    expect(parseCompensation(undefined).min).toBeNull();
  });
});

describe("formatMoney", () => {
  test("uses lakh/crore for INR and k/M elsewhere", () => {
    expect(formatMoney(3_000_000, "INR")).toBe("₹30L");
    expect(formatMoney(15_000_000, "INR")).toBe("₹1.5Cr");
    expect(formatMoney(112_000, "USD")).toBe("$112k");
    expect(formatMoney(1_200_000, "USD")).toBe("$1.2M");
  });
});
