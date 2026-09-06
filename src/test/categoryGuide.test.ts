/**
 * src/test/categoryGuide.test.ts
 * Arca — Finance 支出カテゴリ体系刷新 ＆ 「カテゴリ分類ガイド」単体テスト (Sprint 10.13)
 */

import { describe, it, expect } from "vitest";
import {
  EXPENSE_CATEGORIES,
  CATEGORY_GUIDE_DATA,
  type ExpenseCategory,
} from "../types/finance";
import { CATEGORY_VISUALS } from "../utils/financeSummary";
import { migrateLegacyCategory } from "../lib/financeStorage";
import { inferCategoryFromTitle } from "../services/gmailFinanceService";

describe("Finance 12カテゴリ体系 ＆ カテゴリ分類ガイド (Sprint 10.13)", () => {
  it("1. EXPENSE_CATEGORIES がユーザー指定の12分類と完全に一致する", () => {
    const expectedCategories: ExpenseCategory[] = [
      "食料品",
      "外食",
      "日用品・消耗品",
      "衣服",
      "ゲーム",
      "推し活・配信",
      "イベント・旅行",
      "交通・移動",
      "サブスク・固定費",
      "光熱費・住居",
      "大型出費",
      "その他",
    ];

    expect(EXPENSE_CATEGORIES).toHaveLength(12);
    expect(EXPENSE_CATEGORIES).toEqual(expectedCategories);
  });

  it("2. CATEGORY_GUIDE_DATA が全12カテゴリを網羅し、説明文・具体例・カラーを保持する", () => {
    expect(CATEGORY_GUIDE_DATA).toHaveLength(12);

    for (const cat of EXPENSE_CATEGORIES) {
      const guide = CATEGORY_GUIDE_DATA.find((g) => g.category === cat);
      expect(guide).toBeDefined();
      expect(guide?.description.length).toBeGreaterThan(0);
      expect(guide?.examples.length).toBeGreaterThan(0);
      expect(guide?.color).toMatch(/^#[0-9A-Fa-f]{6}$/);

      // CATEGORY_VISUALS にも対応する配色が定義されていること
      const visual = CATEGORY_VISUALS[cat];
      expect(visual).toBeDefined();
      expect(visual.color).toBe(guide?.color);
    }
  });

  it("3. migrateLegacyCategory が旧カテゴリおよび類似表記を新12分類へ正しくマイグレーションする", () => {
    // 食料品
    expect(migrateLegacyCategory("食費")).toBe("食料品");
    expect(migrateLegacyCategory("自炊・食料品")).toBe("食料品");
    expect(migrateLegacyCategory("食料品")).toBe("食料品");

    // 外食
    expect(migrateLegacyCategory("外食")).toBe("外食");
    expect(migrateLegacyCategory("外食・カフェ")).toBe("外食");
    expect(migrateLegacyCategory("交際費")).toBe("外食");

    // 日用品・消耗品
    expect(migrateLegacyCategory("日用品")).toBe("日用品・消耗品");
    expect(migrateLegacyCategory("日用品・消耗品")).toBe("日用品・消耗品");

    // 衣服
    expect(migrateLegacyCategory("被服")).toBe("衣服");
    expect(migrateLegacyCategory("衣服・美容")).toBe("衣服");
    expect(migrateLegacyCategory("衣服")).toBe("衣服");

    // ゲーム
    expect(migrateLegacyCategory("娯楽費")).toBe("ゲーム");
    expect(migrateLegacyCategory("ゲーム")).toBe("ゲーム");

    // 推し活・配信
    expect(migrateLegacyCategory("推し活・配信")).toBe("推し活・配信");

    // イベント・旅行
    expect(migrateLegacyCategory("特別費")).toBe("イベント・旅行");
    expect(migrateLegacyCategory("旅行・イベント")).toBe("イベント・旅行");
    expect(migrateLegacyCategory("レジャー・お出かけ")).toBe("イベント・旅行");
    expect(migrateLegacyCategory("イベント・旅行")).toBe("イベント・旅行");

    // 交通・移動
    expect(migrateLegacyCategory("交通費")).toBe("交通・移動");
    expect(migrateLegacyCategory("車両係")).toBe("交通・移動");
    expect(migrateLegacyCategory("交通・移動")).toBe("交通・移動");

    // サブスク・固定費
    expect(migrateLegacyCategory("サブスク")).toBe("サブスク・固定費");
    expect(migrateLegacyCategory("通信費")).toBe("サブスク・固定費");
    expect(migrateLegacyCategory("サブスク・固定費")).toBe("サブスク・固定費");

    // 光熱費・住居
    expect(migrateLegacyCategory("光熱費")).toBe("光熱費・住居");
    expect(migrateLegacyCategory("光熱費・住居")).toBe("光熱費・住居");

    // 大型出費
    expect(migrateLegacyCategory("大型出費")).toBe("大型出費");

    // その他 / 未知
    expect(migrateLegacyCategory("その他")).toBe("その他");
    expect(migrateLegacyCategory(undefined)).toBe("その他");
    expect(migrateLegacyCategory("不明な項目")).toBe("その他");
  });

  it("4. inferCategoryFromTitle が店舗名・キーワードから適切な新12カテゴリを推論する", () => {
    expect(inferCategoryFromTitle("スターバックス 渋谷店")).toBe("外食");
    expect(inferCategoryFromTitle("マクドナルド 新宿南口店")).toBe("外食");
    expect(inferCategoryFromTitle("セブンイレブン 港区店")).toBe("食料品");
    expect(inferCategoryFromTitle("ライフ 恵比寿店")).toBe("食料品");
    expect(inferCategoryFromTitle("マツモトキヨシ 原宿店")).toBe("日用品・消耗品");
    expect(inferCategoryFromTitle("ユニクロ 銀座店")).toBe("衣服");
    expect(inferCategoryFromTitle("STEAM GAMES PURCHASE")).toBe("ゲーム");
    expect(inferCategoryFromTitle("YOUTUBE SUPER CHAT")).toBe("推し活・配信");
    expect(inferCategoryFromTitle("じゃらんnet 宿泊予約")).toBe("イベント・旅行");
    expect(inferCategoryFromTitle("モバイルSuica チャージ")).toBe("交通・移動");
    expect(inferCategoryFromTitle("NETFLIX.COM")).toBe("サブスク・固定費");
    expect(inferCategoryFromTitle("東京電力エナジーパートナー")).toBe("光熱費・住居");
    expect(inferCategoryFromTitle("ビックカメラ 有楽町店")).toBe("大型出費");
  });
});
