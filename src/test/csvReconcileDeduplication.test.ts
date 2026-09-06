/**
 * src/test/csvReconcileDeduplication.test.ts
 * Arca — Finance CSV照合結果の一括登録 & 複数回同額決済保護・二重取込防止テスト (Sprint 10.12)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  parseCreditCardCsv,
  buildReconcilePreview,
} from "../utils/csvReconcile";
import { commitBatchReconcile } from "../services/csvReconcileService";
import * as financeStorage from "../lib/financeStorage";
import type { ExpenseTransaction } from "../types/finance";

describe("CSV 照合 1対1ペアリング消費モデル ＆ 二重取込防止 (Sprint 10.12)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. 同一CSVファイルを2回連続で読み込んだ場合、2回目は全件スキップ（新規作成0件）となる（二重取込防止）", async () => {
    const csvText = `
利用日,利用店名,利用金額
2026/08/10,セブンイレブン,1250
2026/08/11,マツモトキヨシ,2840
    `;
    const parsed = parseCreditCardCsv(csvText, "Oliveカード");

    // 初回読み込み（既存取引なし） -> 2件とも新規作成
    const initialPreview = buildReconcilePreview(parsed.rows, []);
    expect(initialPreview.createdCount).toBe(2);
    expect(initialPreview.matchedCount).toBe(0);
    expect(initialPreview.skippedCount).toBe(0);

    // 初回の確定コミットをシミュレート（2件が確定済みレコードとして Arca に保存される）
    const committedTransactions: ExpenseTransaction[] = parsed.rows.map((row, idx) => ({
      id: `tx-committed-${idx}`,
      date: row.date,
      title: row.title,
      totalAmount: row.amount,
      category: "食料品",
      paymentMethod: "Oliveカード",
      items: [],
      isReconciled: true,
      matchedCsvRowId: row.fingerprint,
      csvRowFingerprint: row.fingerprint,
      source: "csv",
      createdAt: "2026-08-10T10:00:00Z",
      updatedAt: "2026-08-10T10:00:00Z",
      isDeleted: false,
    }));

    // 2回目の読み込み -> 同一の CSV 行フィンガープリントが検出され、全件スキップとなる
    const secondPreview = buildReconcilePreview(parsed.rows, committedTransactions);
    expect(secondPreview.createdCount).toBe(0);
    expect(secondPreview.matchedCount).toBe(0);
    expect(secondPreview.skippedCount).toBe(2);
    expect(secondPreview.items.every((item) => item.action === "skip")).toBe(true);
  });

  it("2. 同日・同店名・同金額の決済が複数回ある場合、重複排除で消えず正確に2件のレコードとして反映される", async () => {
    // 例: 同じセブンイレブンで同日1,250円の買い物を2回した
    const csvText = `
利用日,利用店名,利用金額
2026/08/10,セブンイレブン,1250
2026/08/10,セブンイレブン,1250
    `;
    const parsed = parseCreditCardCsv(csvText, "Oliveカード");
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0].fingerprint).not.toBe(parsed.rows[1].fingerprint);

    // 既存取引なし -> 2件とも新規作成（独立したフィンガープリントを保持）
    const preview = buildReconcilePreview(parsed.rows, []);
    expect(preview.createdCount).toBe(2);
    expect(preview.matchedCount).toBe(0);
    expect(preview.skippedCount).toBe(0);
    expect(preview.items[0].action).toBe("create");
    expect(preview.items[1].action).toBe("create");

    // バッチコミットで createExpenseTransaction が正確に2回呼ばれることを検証
    const createSpy = vi.spyOn(financeStorage, "createExpenseTransaction").mockResolvedValue("new-id");
    await commitBatchReconcile(preview);

    expect(createSpy).toHaveBeenCalledTimes(2);
    expect(createSpy).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        title: "セブンイレブン",
        totalAmount: 1250,
        csvRowFingerprint: parsed.rows[0].fingerprint,
      })
    );
    expect(createSpy).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        title: "セブンイレブン",
        totalAmount: 1250,
        csvRowFingerprint: parsed.rows[1].fingerprint,
      })
    );
  });

  it("3. 既存の未突合レコードが1件だけある状態で、CSVに同額決済が2件あった場合、1件が突合・1件が新規追加となる (1対1ペアリング消費)", async () => {
    const existingTransactions: ExpenseTransaction[] = [
      {
        id: "tx-existing-1",
        date: "2026-08-10",
        title: "セブンイレブン",
        totalAmount: 1250,
        category: "食料品",
        paymentMethod: "Oliveカード",
        items: [],
        isReconciled: false, // 未突合
        createdAt: "2026-08-10T10:00:00Z",
        updatedAt: "2026-08-10T10:00:00Z",
        isDeleted: false,
      },
    ];

    const csvText = `
利用日,利用店名,利用金額
2026/08/10,セブンイレブン,1250
2026/08/10,セブンイレブン,1250
    `;
    const parsed = parseCreditCardCsv(csvText, "Oliveカード");

    const preview = buildReconcilePreview(parsed.rows, existingTransactions);

    // 1件目が既存レコードと突合され、プールから消費されるため、2件目は新規追加となる
    expect(preview.matchedCount).toBe(1);
    expect(preview.createdCount).toBe(1);
    expect(preview.skippedCount).toBe(0);

    expect(preview.items[0].action).toBe("match");
    expect(preview.items[0].matchedTransaction?.id).toBe("tx-existing-1");
    expect(preview.items[1].action).toBe("create");

    // バッチコミットの検証
    const updateSpy = vi.spyOn(financeStorage, "updateExpenseTransaction").mockResolvedValue(undefined as any);
    const createSpy = vi.spyOn(financeStorage, "createExpenseTransaction").mockResolvedValue("new-id");

    await commitBatchReconcile(preview);

    expect(updateSpy).toHaveBeenCalledWith(
      "tx-existing-1",
      expect.objectContaining({
        isReconciled: true,
        matchedCsvRowId: parsed.rows[0].fingerprint,
      })
    );
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "セブンイレブン",
        totalAmount: 1250,
        csvRowFingerprint: parsed.rows[1].fingerprint,
      })
    );
  });
});
