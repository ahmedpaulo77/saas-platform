// src/utils/stock.test.js — تحويل الوحدات
// تشغيل: npx vitest run src/utils/stock.test.js

import { describe, it, expect } from "vitest";
import { convertQty } from "./stock.js";

describe("تحويل الوحدات", () => {
  it("نصف كيلو = 500 جرام", () => {
    expect(convertQty(0.5, "kg", "g").qty).toBe(500);
  });

  it("500 جرام = 0.5 كيلو", () => {
    expect(convertQty(500, "g", "kg").qty).toBe(0.5);
  });

  it("لتر = 1000 مل", () => {
    expect(convertQty(1, "liter", "ml").qty).toBe(1000);
  });

  it("نفس الوحدة = نفس الرقم", () => {
    expect(convertQty(3, "kg", "kg").qty).toBe(3);
  });

  it("عبر العائلات (كيلو لقطعة) = الرقم كما هو بدون تخمين", () => {
    const r = convertQty(5, "kg", "piece");
    expect(r.qty).toBe(5);
    expect(r.converted).toBe(false);
  });

  it("أسماء عربية: كيلو لجرام", () => {
    expect(convertQty(2, "كيلو", "جرام").qty).toBe(2000);
  });

  it("وحدة مجهولة = الرقم كما هو", () => {
    expect(convertQty(7, "كرتونة-x", "kg").qty).toBe(7);
  });

  it("كوب = 250 مل", () => {
    expect(convertQty(2, "cup", "ml").qty).toBe(500);
  });
});
