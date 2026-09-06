/**
 * src/test/csvReconcile.test.ts
 * Arca — クレジットカード明細CSVパース ＆ 突合エンジン単体テスト
 */

import { describe, it, expect } from "vitest";
import {
  normalizeJapaneseText,
  calculateTitleSimilarity,
  normalizeDateString,
  normalizeAmountNumber,
  parseCsvToGrid,
  parseCreditCardCsv,
  evaluateMatchCandidate,
  runAutoReconcile,
} from "../utils/csvReconcile";
import type { CreditCardCsvRow, ExpenseTransaction } from "../types/finance";

describe("csvReconcile - テキスト・日付・金額の正規化", () => {
  it("全角英数・半角カナ・法人プレフィックスを正しく正規化する", () => {
    expect(normalizeJapaneseText("株式会社 ｾﾌﾞﾝ-ｲﾚﾌﾞﾝ")).toBe("セブン-イレブン");
    expect(normalizeJapaneseText("（株）イオン　リテール")).toBe("イオンリテール");
    expect(normalizeJapaneseText("ｶﾌﾞｼｷｶﾞｲｼｬ ＡＭＡＺＯＮ")).toBe("amazon");
  });

  it("文字列類似度を適切に算出する", () => {
    expect(calculateTitleSimilarity("イオン〇〇店", "イオン〇〇店")).toBe(1);
    expect(calculateTitleSimilarity("イオン〇〇店", "イオン")).toBeGreaterThanOrEqual(0.8);
    expect(calculateTitleSimilarity("セブンイレブン", "ファミリーマート")).toBeLessThan(0.3);
  });

  it("様々な日付フォーマットを YYYY-MM-DD に正規化する", () => {
    expect(normalizeDateString("2026/08/25")).toBe("2026-08-25");
    expect(normalizeDateString("2026.08.05")).toBe("2026-08-05");
    expect(normalizeDateString("2026-8-5")).toBe("2026-08-05");
    expect(normalizeDateString("20260825")).toBe("2026-08-25");
  });

  it("カンマや円記号付きの金額文字列を整数に正規化する", () => {
    expect(normalizeAmountNumber("¥5,400")).toBe(5400);
    expect(normalizeAmountNumber("12,345 円")).toBe(12345);
    expect(normalizeAmountNumber("-1500")).toBe(1500);
    expect(normalizeAmountNumber(3000)).toBe(3000);
  });

  it("CSVテキストを二次元配列に正しくパースする（クォート内カンマ考慮）", () => {
    const csv = `利用日,利用店名,金額\n2026/08/01,"スーパー, 本店",3000\n2026/08/02,コンビニ,500`;
    const grid = parseCsvToGrid(csv);
    expect(grid.length).toBe(3);
    expect(grid[1][1]).toBe("スーパー, 本店");
    expect(grid[1][2]).toBe("3000");
  });
});

describe("csvReconcile - 各社カードCSVパース", () => {
  it("三井住友 / Oliveカード形式のCSVを正しくパースする", () => {
    const csv = `利用日,利用店名・商品名,利用金額,支払区分\n2026/08/10,セブンイレブン,1080,1回払い\n2026/08/12,イオンモール,5400,1回払い`;
    const result = parseCreditCardCsv(csv);
    expect(result.detectedMethod).toBe("Oliveカード");
    expect(result.rows.length).toBe(2);
    expect(result.rows[0].title).toBe("セブンイレブン");
    expect(result.rows[0].amount).toBe(1080);
    expect(result.rows[0].date).toBe("2026-08-10");
  });

  it("dカード形式のCSVを正しくパースする", () => {
    const csv = `ご利用年月日,ご利用先など,ご利用金額,お支払方法\n2026/08/15,マツモトキヨシ,2300,1回\n2026/08/18,ローソン,650,1回`;
    const result = parseCreditCardCsv(csv);
    expect(result.detectedMethod).toBe("dカード");
    expect(result.rows.length).toBe(2);
    expect(result.rows[0].title).toBe("マツモトキヨシ");
    expect(result.rows[0].amount).toBe(2300);
  });

  it("イオンカード形式のCSVを正しくパースする", () => {
    const csv = `利用日,利用先,金額\n2026/08/20,イオンスタイル,4800`;
    const result = parseCreditCardCsv(csv);
    expect(result.detectedMethod).toBe("イオンカード");
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].amount).toBe(4800);
  });

  it("Viewカード / 交通系IC形式のCSVを正しくパースする", () => {
    const csv = `利用年月日,ご利用箇所,ご利用金額\n2026/08/22,ＪＲ東日本　オートチャージ,3000`;
    const result = parseCreditCardCsv(csv);
    expect(result.detectedMethod).toBe("交通系IC");
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].amount).toBe(3000);
  });
});

describe("csvReconcile - 突合照合評価 (evaluateMatchCandidate & runAutoReconcile)", () => {
  const baseTx: ExpenseTransaction = {
    id: "tx-1",
    date: "2026-08-10",
    title: "セブンイレブン",
    totalAmount: 1080,
    category: "食料品",
    paymentMethod: "Oliveカード",
    items: [],
    isReconciled: false,
    createdAt: "2026-08-10T10:00:00Z",
    updatedAt: "2026-08-10T10:00:00Z",
  };

  it("同日・同額・店名類似の場合 exact と判定される", () => {
    const csvRow: CreditCardCsvRow = {
      rowId: "csv-1",
      date: "2026-08-10",
      title: "ｾﾌﾞﾝｲﾚﾌﾞﾝ",
      amount: 1080,
      paymentMethod: "Oliveカード",
    };
    const res = evaluateMatchCandidate(csvRow, baseTx);
    expect(res.confidence).toBe("exact");
    expect(res.score).toBe(100);
  });

  it("同額で日付が1日ズレていても high または medium と判定される", () => {
    const csvRow: CreditCardCsvRow = {
      rowId: "csv-2",
      date: "2026-08-11",
      title: "セブンイレブン〇〇店",
      amount: 1080,
      paymentMethod: "Oliveカード",
    };
    const res = evaluateMatchCandidate(csvRow, baseTx);
    expect(res.confidence).toBe("high");
  });

  it("金額が異なる場合は none または low と判定される", () => {
    const csvRow: CreditCardCsvRow = {
      rowId: "csv-3",
      date: "2026-08-10",
      title: "ガソリンスタンド",
      amount: 5000,
      paymentMethod: "Oliveカード",
    };
    const res = evaluateMatchCandidate(csvRow, baseTx);
    expect(res.confidence).toBe("none");
  });

  it("runAutoReconcile で複数明細が一括で正確にマッチングされる", () => {
    const txs: ExpenseTransaction[] = [
      baseTx,
      {
        id: "tx-2",
        date: "2026-08-15",
        title: "マツモトキヨシ",
        totalAmount: 2300,
        category: "日用品・消耗品",
        paymentMethod: "dカード",
        items: [],
        isReconciled: false,
        createdAt: "2026-08-15T10:00:00Z",
        updatedAt: "2026-08-15T10:00:00Z",
      },
    ];

    const csvRows: CreditCardCsvRow[] = [
      {
        rowId: "c1",
        date: "2026-08-10",
        title: "セブンイレブン",
        amount: 1080,
        paymentMethod: "Oliveカード",
      },
      {
        rowId: "c2",
        date: "2026-08-15",
        title: "マツモトキヨシ〇〇店",
        amount: 2300,
        paymentMethod: "dカード",
      },
      {
        rowId: "c3",
        date: "2026-08-20",
        title: "未登録カフェ",
        amount: 800,
        paymentMethod: "Oliveカード",
      },
    ];

    const result = runAutoReconcile(csvRows, txs);
    expect(result.reconciledCount).toBe(2);
    expect(result.candidates[0].matchedTransaction?.id).toBe("tx-1");
    expect(result.candidates[1].matchedTransaction?.id).toBe("tx-2");
    expect(result.candidates[2].matchedTransaction).toBeUndefined();
    expect(result.unmatchedCsvRows.length).toBe(1);
  });
});
