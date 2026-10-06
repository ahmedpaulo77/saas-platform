// src/utils/revenue.test.js
// تشغيل: npx vitest run src/utils/revenue.test.js

import { describe, it, expect } from "vitest";
import {
  computePeriod,
  cogsFor,
  returnedCogsFor,
  restaurantCogsFor,
  saleReturnsTotal,
  round2,
} from "./revenue.js";

// ── بيانات الاختبار ──────────────────────────────────────────────
const PRODUCT_ID = "prod-001";

// فاتورة بيع: قطعتان × سعر 500 = 1000
const invoice = {
  id: "inv-001",
  approval: "validated",
  status: "paid",
  paidAmount: 1000,
  date: "2024-06-15T10:00:00.000Z",
  products: [{ productId: PRODUCT_ID, quantity: 2, amount: 1000 }],
};

// مرتجع: قطعة واحدة × 500
const returnDoc = {
  id: "ret-001",
  kind: "sale",
  refId: "inv-001",
  amount: 500,
  date: "2024-06-16T10:00:00.000Z",
  items: [{ productId: PRODUCT_ID, quantity: 1, amount: 500 }],
};

// تكلفة الصنف: 200 ج.م / قطعة
const costByProduct = new Map([[PRODUCT_ID, { avgCost: 200, lastUnitCost: 200 }]]);

// ── 1. grossProfit لا يعطي NaN ──────────────────────────────────
describe("grossProfit – لا NaN مع مرتجعات", () => {
  it("grossProfit رقم صحيح مش NaN", () => {
    const { grossProfit } = computePeriod({
      invoices: [invoice],
      returns: [returnDoc],
      costByProduct,
    });
    expect(typeof grossProfit).toBe("number");
    expect(Number.isNaN(grossProfit)).toBe(false);
  });
});

// ── 2. المثال الأساسي: netProfit = 300 ──────────────────────────
// فاتورة 1000 (قطعتان)، مرتجع 500 (قطعة)، تكلفة كل قطعة 200
//
// الإيراد المحقق     = 1000
// مرتجعات بيع       =  500
// COGS خام          = 2 × 200 = 400
// تكلفة المرتجع     = 1 × 200 = 200
// COGS صافي         = 400 − 200 = 200
//
// grossProfit = 1000 − 500 − 200 = 300
// netProfit   = 1000 − 500 − 200 + 0 − 0 = 300 ✅
describe("المثال الأساسي — netProfit = 300", () => {
  it("netProfit صحيح", () => {
    const { netProfit, grossProfit, cogs, returns: retAmt } = computePeriod({
      invoices: [invoice],
      returns: [returnDoc],
      costByProduct,
    });

    expect(retAmt).toBe(500);       // مرتجعات بيع
    expect(cogs).toBe(200);          // COGS صافي بعد طرح تكلفة المرتجع
    expect(grossProfit).toBe(300);   // 1000 − 500 − 200
    expect(netProfit).toBe(300);     // بدون مصروفات
  });

  it("netProfit كان خطأ 100 بالمنطق القديم (COGS مش بيطرح تكلفة المرتجع)", () => {
    // الحساب القديم: netProfit = 1000 − 500 − 400 = 100
    // الحساب الجديد: netProfit = 1000 − 500 − 200 = 300
    // الاختبار يثبت إن الجديد أحسن بـ 200 جنيه (تكلفة القطعة المرتجعة)
    const oldCogs = cogsFor([invoice], costByProduct);          // 400
    const retCogs = returnedCogsFor([returnDoc], costByProduct); // 200
    expect(oldCogs).toBe(400);
    expect(retCogs).toBe(200);
    expect(round2(oldCogs - retCogs)).toBe(200); // COGS الصحيح
  });
});

// ── 3. مرتجع شراء لا يؤثر على COGS المبيعات ──────────────────
describe("مرتجع الشراء لا يؤثر على returnedCogsFor", () => {
  it("returnedCogsFor يتجاهل kind=purchase", () => {
    const purchaseReturn = { ...returnDoc, kind: "purchase" };
    const val = returnedCogsFor([purchaseReturn], costByProduct);
    expect(val).toBe(0);
  });
});

// ── 4. بدون مرتجعات — سلوك مطابق للقديم ─────────────────────
describe("بدون مرتجعات — سلوك طبيعي", () => {
  it("netProfit = revenue − COGS", () => {
    const { netProfit, cogs, returns: retAmt } = computePeriod({
      invoices: [invoice],
      returns: [],
      costByProduct,
    });
    expect(retAmt).toBe(0);
    expect(cogs).toBe(400);        // COGS كامل: 2 × 200
    expect(netProfit).toBe(600);   // 1000 − 0 − 400
  });
});

// ── 5. مرتجع خارج نطاق الفترة لا يُحتسب ─────────────────────
describe("inRange — مرتجع خارج الفترة لا يُطرح", () => {
  it("مرتجع في يوليو لا يؤثر على حساب يونيو", () => {
    const laterReturn = { ...returnDoc, date: "2024-07-01T10:00:00.000Z" };
    const juneStart = new Date("2024-06-01");
    const juneEnd   = new Date("2024-06-30T23:59:59.999Z");
    const inRange   = (d) => { const dt = new Date(d); return dt >= juneStart && dt <= juneEnd; };

    const { netProfit, returns: retAmt } = computePeriod({
      invoices: [invoice],
      returns: [laterReturn],
      costByProduct,
      inRange,
    });

    expect(retAmt).toBe(0);       // المرتجع خارج الفترة
    expect(netProfit).toBe(600);  // مفيش مرتجعات → 1000 − 0 − 400
  });
});

// ── 6. معامل المقاس في تكلفة المطعم ────────────────────────────
// بيتزا وسط (×1.5) تستهلك مرة ونصف الوصفة الأساسية
describe("معامل المقاس — مطعم", () => {
  const dishMap = new Map([
    ["dish-1", { name: "بيتزا", recipe: [{ materialId: "m1", qty: 0.2, unit: "kg" }] }],
  ]);
  const rawMap = new Map([["m1", { costPerUnit: 100 }]]);
  // سطر بمقاس وسط ×1.5: 0.2 × 1 × 1.5 × 100 = 30
  const inv = {
    id: "inv-x", approval: "validated", status: "paid", paidAmount: 120,
    date: "2024-06-15T10:00:00.000Z",
    products: [{ productId: "dish-1", quantity: 1, amount: 120, mult: 1.5 }],
  };

  it("restaurantCogsFor يضرب في المعامل", () => {
    const { cogs, missingRecipes } = restaurantCogsFor([inv], dishMap, rawMap);
    expect(cogs).toBe(30);
    expect(missingRecipes.size).toBe(0);
  });

  it("بدون معامل (فواتير قديمة) = السلوك القديم", () => {
    const invOld = {
      ...inv,
      products: [{ productId: "dish-1", quantity: 1, amount: 120 }],
    };
    const { cogs } = restaurantCogsFor([invOld], dishMap, rawMap);
    expect(cogs).toBe(20); // 0.2 × 1 × 100
  });

  it("returnedCogsFor يعكس تكلفة الوصفة بالمعامل", () => {
    const ret = {
      id: "ret-x", kind: "sale", amount: 120, date: "2024-06-15T12:00:00.000Z",
      items: [{ productId: "dish-1", quantity: 1, amount: 120, mult: 1.5 }],
    };
    expect(returnedCogsFor([ret], new Map(), null, { dishMap, rawMatsMap: rawMap })).toBe(30);
  });
});
