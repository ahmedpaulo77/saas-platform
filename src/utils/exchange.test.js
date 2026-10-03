// src/utils/exchange.test.js
// تشغيل: npx vitest run src/utils/exchange.test.js

import { describe, it, expect } from "vitest";
import {
  EXCHANGE_WINDOW_DAYS,
  isWithinExchangeWindow,
  discountRatioOf,
  buildExchangeReturnLines,
  buildExchangeSaleLines,
  computeExchangeSummary,
} from "./exchange.js";

// ── 1. نافذة الاستبدال (14 يوم) ──────────────────────────────────
describe("نافذة الاستبدال", () => {
  it("مدة النافذة 14 يوم", () => {
    expect(EXCHANGE_WINDOW_DAYS).toBe(14);
  });

  it("فاتورة من 5 أيام → مقبولة", () => {
    const now = new Date("2024-06-20T12:00:00.000Z");
    expect(isWithinExchangeWindow("2024-06-15T12:00:00.000Z", now)).toBe(true);
  });

  it("فاتورة من اليوم 14 نفسه → مقبولة (الرفض من 15)", () => {
    const now = new Date("2024-06-20T12:00:00.000Z");
    expect(isWithinExchangeWindow("2024-06-06T12:00:00.000Z", now)).toBe(true);
  });

  it("فاتورة من 15 يوم → مرفوضة", () => {
    const now = new Date("2024-06-20T12:00:00.000Z");
    expect(isWithinExchangeWindow("2024-06-05T12:00:00.000Z", now)).toBe(false);
  });

  it("تاريخ فاضي أو مستقبلي → مرفوض", () => {
    const now = new Date("2024-06-20T12:00:00.000Z");
    expect(isWithinExchangeWindow(null, now)).toBe(false);
    expect(isWithinExchangeWindow("2024-07-01T00:00:00.000Z", now)).toBe(false);
  });
});

// ── 2. نسبة الخصم ────────────────────────────────────────────────
describe("نسبة الخصم", () => {
  it("فاتورة StorePOS بخصم 100 من 1000 → النسبة 0.9", () => {
    expect(discountRatioOf({ subtotal: 1000, discount: 100 })).toBe(0.9);
  });

  it("من غير خصم → 1 (لا تغيير)", () => {
    expect(discountRatioOf({})).toBe(1);
    expect(discountRatioOf({ subtotal: 1000, discount: 0 })).toBe(1);
    expect(discountRatioOf(null)).toBe(1);
  });
});

// ── 3. سطور المرتجع: مكبوحة + نسبة الخصم ─────────────────────────
describe("سطور مرتجع الاستبدال", () => {
  const source = [
    { productId: "A", productName: "تيشيرت", quantity: 2, amount: 1000 },
  ];

  it("مرتجع قطعة من قطعتين بخصم 10% → الكمية 1 والمبلغ 450", () => {
    const lines = buildExchangeReturnLines(source, { 0: 1 }, {}, 0.9);
    expect(lines).toHaveLength(1);
    expect(lines[0].quantity).toBe(1);
    expect(lines[0].amount).toBe(450); // 1000 × (1/2) × 0.9
  });

  it("لا يتجاوز المتبقي بعد مرتجع سابق", () => {
    const lines = buildExchangeReturnLines(source, { 0: 5 }, { A: 1 }, 1);
    expect(lines[0].quantity).toBe(1); // المتبقي = 2 − 1
    expect(lines[0].amount).toBe(500);
  });

  it("كمية صفر → لا سطور", () => {
    expect(buildExchangeReturnLines(source, {}, {}, 1)).toEqual([]);
  });
});

// ── 4. سطور البديل + ملخص الفرق ──────────────────────────────────
describe("ملخص الاستبدال", () => {
  const products = [
    { id: "B", name: "بنطلون", price: 700, size: "L", color: "أسود" },
  ];

  it("بديل أغلى: يسترد 500 ويدفع 700 → الفرق +200 (يدفع)", () => {
    const ret = [{ productId: "A", quantity: 1, amount: 500 }];
    const sale = buildExchangeSaleLines([{ productId: "B", qty: 1 }], products);
    expect(sale[0].amount).toBe(700);
    const s = computeExchangeSummary(ret, sale);
    expect(s.refundTotal).toBe(500);
    expect(s.newTotal).toBe(700);
    expect(s.diff).toBe(200);
  });

  it("بديل أرخص: يسترد 500 ويدفع 300 → الفرق −200 (خارج من الدرج)", () => {
    const ret = [{ productId: "A", quantity: 1, amount: 500 }];
    const sale = buildExchangeSaleLines(
      [{ productId: "B", qty: 1 }],
      [{ id: "B", name: "تشيرت", price: 300 }]
    );
    const s = computeExchangeSummary(ret, sale);
    expect(s.diff).toBe(-200);
  });

  it("متساوي القيمة → الفرق صفر", () => {
    const s = computeExchangeSummary(
      [{ amount: 500 }],
      [{ amount: 500 }]
    );
    expect(s.diff).toBe(0);
  });

  it("صنف غير موجود أو كمية صفر → يتجاهل", () => {
    const sale = buildExchangeSaleLines(
      [{ productId: "X", qty: 1 }, { productId: "B", qty: 0 }],
      products
    );
    expect(sale).toEqual([]);
  });
});
