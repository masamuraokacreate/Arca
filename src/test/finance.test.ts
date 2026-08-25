/**
 * src/test/finance.test.ts
 * Arca — Finance（家計・支出管理）集計 ＆ ストレージ単体テスト
 */

import { describe, it, expect } from "vitest";
import {
  calculateMonthlySummary,
  formatCurrency,
  getPrevMonth,
  getNextMonth,
  formatMonthLabel,
  getDaysInMonth,
} from "../utils/financeSummary";
import {
  createEmptyExpenseItem,
  createDefaultTransaction,
  createExpenseTransaction,
  updateExpenseTransaction,
  deleteExpenseTransaction,
  restoreExpenseTransaction,
  setTransactionReconciled,
} from "../lib/financeStorage";
import type { ExpenseTransaction } from "../types/finance";
import * as firestore from "firebase/firestore";

describe("financeSummary - 月次支出集計ロジック", () => {
  const dummyTransactions: ExpenseTransaction[] = [
    {
      id: "t1",
      date: "2026-08-01",
      title: "スーパーA",
      totalAmount: 3000,
      category: "食費",
      paymentMethod: "Oliveカード",
      items: [
        { id: "i1", name: "牛乳", amount: 200, category: "食費" },
        { id: "i2", name: "肉", amount: 2800, category: "食費" },
      ],
      isReconciled: true,
      createdAt: "2026-08-01T00:00:00Z",
      updatedAt: "2026-08-01T00:00:00Z",
    },
    {
      id: "t2",
      date: "2026-08-05",
      title: "ドラッグストアB",
      totalAmount: 1500,
      category: "日用品",
      paymentMethod: "dカード",
      items: [],
      isReconciled: false,
      createdAt: "2026-08-05T00:00:00Z",
      updatedAt: "2026-08-05T00:00:00Z",
    },
    {
      id: "t3",
      date: "2026-08-15",
      title: "レストランC",
      totalAmount: 5500,
      category: "食費",
      paymentMethod: "Oliveカード",
      items: [],
      isReconciled: false,
      createdAt: "2026-08-15T00:00:00Z",
      updatedAt: "2026-08-15T00:00:00Z",
    },
    {
      id: "t4_deleted",
      date: "2026-08-20",
      title: "削除された支出",
      totalAmount: 10000,
      category: "娯楽費",
      paymentMethod: "現金",
      items: [],
      isReconciled: false,
      isDeleted: true,
      createdAt: "2026-08-20T00:00:00Z",
      updatedAt: "2026-08-20T00:00:00Z",
    },
    {
      id: "t5_other_month",
      date: "2026-07-30",
      title: "7月の支出",
      totalAmount: 4000,
      category: "交通費",
      paymentMethod: "交通系IC",
      items: [],
      isReconciled: true,
      createdAt: "2026-07-30T00:00:00Z",
      updatedAt: "2026-07-30T00:00:00Z",
    },
  ];

  it("対象月（2026-08）の支出のみを正確に集約・集計する", () => {
    const summary = calculateMonthlySummary(dummyTransactions, "2026-08");

    // t1 (3000) + t2 (1500) + t3 (5500) = 10000 (t4_deleted, t5_other_month 除外)
    expect(summary.totalExpense).toBe(10000);
    expect(summary.transactionCount).toBe(3);
    expect(summary.maxExpense.amount).toBe(5500);
    expect(summary.maxExpense.title).toBe("レストランC");
    expect(summary.maxExpense.date).toBe("2026-08-15");
  });

  it("カテゴリ別金額および比率（%）が正確に算出される", () => {
    const summary = calculateMonthlySummary(dummyTransactions, "2026-08");

    // 食費: t1 (3000) + t3 (5500) = 8500 (85%)
    expect(summary.categoryBreakdown["食費"].amount).toBe(8500);
    expect(summary.categoryBreakdown["食費"].percentage).toBe(85);

    // 日用品: t2 (1500) = 1500 (15%)
    expect(summary.categoryBreakdown["日用品"].amount).toBe(1500);
    expect(summary.categoryBreakdown["日用品"].percentage).toBe(15);

    // 交通費: 0円 (0%)
    expect(summary.categoryBreakdown["交通費"].amount).toBe(0);
    expect(summary.categoryBreakdown["交通費"].percentage).toBe(0);
  });

  it("日別支出マップが正確に構築される", () => {
    const summary = calculateMonthlySummary(dummyTransactions, "2026-08");
    expect(summary.dailyExpenses[1]).toBe(3000);
    expect(summary.dailyExpenses[5]).toBe(1500);
    expect(summary.dailyExpenses[15]).toBe(5500);
    expect(summary.dailyExpenses[2]).toBe(0);
  });

  it("日付・通貨ヘルパー関数が期待通り動作する", () => {
    expect(formatCurrency(1234)).toBe("￥1,234");
    expect(getPrevMonth("2026-01")).toBe("2025-12");
    expect(getNextMonth("2026-12")).toBe("2027-01");
    expect(formatMonthLabel("2026-08")).toBe("2026年8月");
    expect(getDaysInMonth(2026, 2)).toBe(28);
  });
});

describe("financeStorage - CRUD 永続化操作", () => {
  it("createEmptyExpenseItem で有効な初期品目が生成される", () => {
    const item = createEmptyExpenseItem("食費");
    expect(item.id).toBeDefined();
    expect(item.category).toBe("食費");
    expect(item.amount).toBe(0);
  });

  it("createDefaultTransaction で有効な初期支出が生成される", () => {
    const tx = createDefaultTransaction("2026-08-25");
    expect(tx.date).toBe("2026-08-25");
    expect(tx.isReconciled).toBe(false);
    expect(tx.isDeleted).toBe(false);
  });

  it("createExpenseTransaction が Firestore addDoc を呼び出す", async () => {
    const tx = createDefaultTransaction("2026-08-25");
    const id = await createExpenseTransaction(tx);
    expect(id).toBe("mock-doc-id");
    expect(firestore.addDoc).toHaveBeenCalled();
  });

  it("updateExpenseTransaction が Firestore updateDoc を呼び出す", async () => {
    await updateExpenseTransaction("tx-123", { title: "更新店名", totalAmount: 2000 });
    expect(firestore.updateDoc).toHaveBeenCalled();
  });

  it("deleteExpenseTransaction が論理削除フラグ isDeleted: true を設定する", async () => {
    await deleteExpenseTransaction("tx-123");
    expect(firestore.updateDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ isDeleted: true })
    );
  });

  it("restoreExpenseTransaction が論理削除を復元する", async () => {
    await restoreExpenseTransaction("tx-123");
    expect(firestore.updateDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ isDeleted: false })
    );
  });

  it("setTransactionReconciled が突合フラグを更新する", async () => {
    await setTransactionReconciled("tx-123", true, "csv-row-999");
    expect(firestore.updateDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        isReconciled: true,
        matchedCsvRowId: "csv-row-999",
      })
    );
  });
});
