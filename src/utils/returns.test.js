// src/utils/returns.test.js
// تشغيل: npx vitest run src/utils/returns.test.js
//
// ⚠️ createReturn يعتمد على Firebase — هنعمل mock للـ Firestore
// عشان الاختبار يشتغل بدون اتصال حقيقي.

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── mock Firebase ──────────────────────────────────────────────
// نخلي runTransaction يستدعي الـ callback مباشرة مع كائن tx مزيّف
vi.mock("firebase/firestore", () => {
  const snapWith = (qty, name = "صنف") => ({
    exists: () => true,
    data: () => ({ quantity: qty, name }),
  });

  const snapMissing = () => ({ exists: () => false, data: () => ({}) });

  // نحفظ الكتابات المطلوبة عشان نتحقق منها في الاختبار
  const writes = [];
  let snapOverrides = {}; // productId → snap

  const tx = {
    get: vi.fn(async (ref) => {
      const id = ref.__id;
      return snapOverrides[id] ?? snapWith(100, id);
    }),
    update: vi.fn((ref, data) => writes.push({ op: "update", id: ref.__id, data })),
    set: vi.fn((ref, data) => writes.push({ op: "set", id: ref.__id, data })),
  };

  return {
    collection: vi.fn(() => ({})),
    doc: vi.fn((db, col, id) => ({ __id: id || `${col}-doc` })),
    runTransaction: vi.fn(async (db, fn) => {
      writes.length = 0; // reset
      await fn(tx);
    }),
    writeBatch: vi.fn(() => tx),
    __writes: writes,
    __tx: tx,
    __setSnap: (id, qty, name) => { snapOverrides[id] = snapWith(qty, name); },
    __setMissing: (id) => { snapOverrides[id] = snapMissing(); },
    __resetSnaps: () => { snapOverrides = {}; },
  };
});

vi.mock("../firebase/config.js", () => ({ db: {} }));
vi.mock("./auditLogger.js", () => ({ logActivity: vi.fn(async () => {}) }));
vi.mock("./offline.js", () => ({ isOffline: vi.fn(() => false) }));
vi.mock("./stock.js", () => ({ readStockCache: vi.fn(async () => ({ refs: [], snaps: [] })) }));
vi.mock("./traderUnits.js", () => ({
  stockDelta: vi.fn((unit, qty) => parseFloat(qty) || 0),
  getProductUnit: vi.fn(() => "piece"),
  roundQty: vi.fn((n) => Math.round(n * 100) / 100),
}));

import * as firestoreMock from "firebase/firestore";
import { createReturn } from "./returns.js";

const USER = { uid: "u1", email: "a@b.com", role: "admin", companyId: "c1" };

// ── 1. مرتجع شراء: رصيد كافٍ → يشتغل ──────────────────────────
describe("مرتجع الشراء — رصيد كافٍ", () => {
  beforeEach(() => {
    firestoreMock.__resetSnaps();
    // المنتج رصيده 50
    firestoreMock.__setSnap("prod-A", 50, "تيشيرت أبيض");
  });

  it("يُنقص المخزون ويسجل المرتجع", async () => {
    await expect(
      createReturn({
        kind: "purchase",
        refId: "pur-001",
        entityId: "sup-001",
        entityName: "مورد A",
        lines: [{ productId: "prod-A", productName: "تيشيرت أبيض", quantity: 10, amount: 200 }],
        user: USER,
      })
    ).resolves.not.toThrow();

    const writes = firestoreMock.__writes;
    const stockWrite = writes.find((w) => w.op === "update" && w.id === "prod-A");
    expect(stockWrite).toBeDefined();
    // 50 − 10 = 40
    expect(stockWrite.data.quantity).toBe(40);
    // مستند المرتجع اتكتب
    const retWrite = writes.find((w) => w.op === "set");
    expect(retWrite).toBeDefined();
    expect(retWrite.data.kind).toBe("purchase");
    expect(retWrite.data.amount).toBe(200);
  });
});

// ── 2. مرتجع شراء: رصيد غير كافٍ → يُرمى خطأ ──────────────────
describe("مرتجع الشراء — رصيد غير كافٍ", () => {
  beforeEach(() => {
    firestoreMock.__resetSnaps();
    // المنتج رصيده 5 بس، والمرتجع عايز 10
    firestoreMock.__setSnap("prod-B", 5, "بنطلون أسود");
  });

  it("يرمي خطأ عربي ولا يسجل مرتجع ولا يُعدِّل مخزون", async () => {
    await expect(
      createReturn({
        kind: "purchase",
        refId: "pur-002",
        entityId: "sup-001",
        entityName: "مورد A",
        lines: [{ productId: "prod-B", productName: "بنطلون أسود", quantity: 10, amount: 300 }],
        user: USER,
      })
    ).rejects.toThrow("الرصيد لا يكفي لمرتجع الصنف: بنطلون أسود، المتاح 5");

    // لا يوجد أي كتابة — الـ transaction اتلغت كلها
    const writes = firestoreMock.__writes;
    expect(writes.filter((w) => w.op === "update")).toHaveLength(0);
    expect(writes.filter((w) => w.op === "set")).toHaveLength(0);
  });

  it("رسالة الخطأ تبدأ بـ 'الرصيد لا يكفي'", async () => {
    let caught = null;
    try {
      await createReturn({
        kind: "purchase",
        refId: "pur-002",
        entityId: "sup-001",
        entityName: "مورد A",
        lines: [{ productId: "prod-B", productName: "بنطلون أسود", quantity: 10, amount: 300 }],
        user: USER,
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).not.toBeNull();
    expect(caught.message).toMatch(/^الرصيد لا يكفي/);
  });
});

// ── 3. مرتجع البيع غير متأثر (kind=sale يزيد المخزون دايماً) ─────
describe("مرتجع البيع — لا يتأثر بالتعديل", () => {
  beforeEach(() => {
    firestoreMock.__resetSnaps();
    firestoreMock.__setSnap("prod-C", 0, "قميص أحمر"); // رصيد صفر مقصود
  });

  it("مرتجع بيع يُضيف للمخزون حتى لو الرصيد صفر", async () => {
    await expect(
      createReturn({
        kind: "sale",
        refId: "inv-001",
        entityId: "cli-001",
        entityName: "عميل A",
        lines: [{ productId: "prod-C", productName: "قميص أحمر", quantity: 2, amount: 100 }],
        user: USER,
      })
    ).resolves.not.toThrow();

    const writes = firestoreMock.__writes;
    const stockWrite = writes.find((w) => w.op === "update" && w.id === "prod-C");
    expect(stockWrite).toBeDefined();
    expect(stockWrite.data.quantity).toBe(2); // 0 + 2
  });
});
