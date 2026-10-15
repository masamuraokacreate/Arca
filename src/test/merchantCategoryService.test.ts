/**
 * src/test/merchantCategoryService.test.ts
 * Arca — 店舗名カテゴリ自動学習 ＆ 推論サービスの単体テスト
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  normalizeMerchantKey,
  predictCategory,
  learnMerchantCategory,
  initMerchantCategoriesFromTransactions,
} from "../services/merchantCategoryService";
import type { ExpenseTransaction } from "../types/finance";
import * as firestore from "firebase/firestore";

describe("merchantCategoryService", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("normalizeMerchantKey が全角英数記号を半角小文字に正規化する", () => {
    expect(normalizeMerchantKey("　セブン－イレブン　渋谷店　")).toBe("セブン-イレブン 渋谷店");
    expect(normalizeMerchantKey("Ａｍａｚｏｎ．ｃｏ．ｊｐ")).toBe("amazon.co.jp");
    expect(normalizeMerchantKey("")).toBe("");
  });

  it("キーワードベースで主要な店舗を適切なカテゴリに推論し「その他」を防止する", () => {
    expect(predictCategory("イオンモール幕張新都心")).toBe("食料品");
    expect(predictCategory("セブンイレブン 六本木店")).toBe("食料品");
    expect(predictCategory("スターバックスコーヒー")).toBe("外食");
    expect(predictCategory("マクドナルド 渋谷店")).toBe("外食");
    expect(predictCategory("マツモトキヨシ 新宿東口店")).toBe("日用品・消耗品");
    expect(predictCategory("メトロ地下鉄 運賃")).toBe("交通・移動");
    expect(predictCategory("Netflix月額料金")).toBe("サブスク・固定費");
  });

  it("手動変更したカテゴリを学習し、次回以降そのカテゴリを自動割り当てする", async () => {
    vi.spyOn(firestore, "setDoc").mockResolvedValue(undefined as any);

    // 初期状態ではキーワード推論または食料品
    const testStore = "ユニクロ 新宿フラッグス店";

    // ユーザーが手動で「衣服」に変更したと仮定して学習
    await learnMerchantCategory(testStore, "衣服");

    // 次回以降は自動的に「衣服」が割り当てられる
    expect(predictCategory(testStore)).toBe("衣服");

    // 部分一致でも学習結果が優先される
    expect(predictCategory("ユニクロ 新宿")).toBe("衣服");
  });

  it("「その他」は学習辞書に上書き登録されない", async () => {
    vi.spyOn(firestore, "setDoc").mockResolvedValue(undefined as any);

    await learnMerchantCategory("ニトリ", "日用品・消耗品");
    expect(predictCategory("ニトリ")).toBe("日用品・消耗品");

    // 「その他」に変更しても以前の学習結果（日用品・消耗品）が維持される
    await learnMerchantCategory("ニトリ", "その他");
    expect(predictCategory("ニトリ")).toBe("日用品・消耗品");
  });

  it("initMerchantCategoriesFromTransactions が過去の取引一覧から自動学習する", () => {
    const mockTxs: ExpenseTransaction[] = [
      {
        id: "tx-1",
        date: "2026-08-01",
        title: "Steam Games Purchase",
        totalAmount: 3400,
        category: "ゲーム",
        paymentMethod: "Oliveカード",
        items: [],
        isReconciled: false,
        createdAt: "2026-08-01T10:00:00Z",
        updatedAt: "2026-08-01T10:00:00Z",
        isDeleted: false,
      },
      {
        id: "tx-2",
        date: "2026-08-02",
        title: "アニメイト池袋本店",
        totalAmount: 1800,
        category: "推し活・配信",
        paymentMethod: "Oliveカード",
        items: [],
        isReconciled: false,
        createdAt: "2026-08-02T10:00:00Z",
        updatedAt: "2026-08-02T10:00:00Z",
        isDeleted: false,
      },
      {
        id: "tx-3",
        date: "2026-08-03",
        title: "不明な店舗",
        totalAmount: 500,
        category: "その他", // その他は学習しない
        paymentMethod: "Oliveカード",
        items: [],
        isReconciled: false,
        createdAt: "2026-08-03T10:00:00Z",
        updatedAt: "2026-08-03T10:00:00Z",
        isDeleted: false,
      },
    ];

    initMerchantCategoriesFromTransactions(mockTxs);

    expect(predictCategory("Steam Games Purchase")).toBe("ゲーム");
    expect(predictCategory("アニメイト池袋本店")).toBe("推し活・配信");
  });
});
