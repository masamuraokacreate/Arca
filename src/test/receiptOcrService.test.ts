/**
 * src/test/receiptOcrService.test.ts
 * Arca — Gemini Vision レシートOCR解析サービス単体テスト
 */

import { describe, it, expect } from "vitest";
import { sanitizeOcrResult, cleanItemName } from "../services/receiptOcrService";

describe("receiptOcrService - sanitizeOcrResult", () => {
  it("標準的なレシートJSONを正確にパースして構造化する", () => {
    const rawJson = JSON.stringify({
      storeName: "イオン 幕張新都心店",
      date: "2026-08-25",
      totalAmount: 3240,
      paymentMethod: "イオンカード",
      items: [
        { name: "明治 おいしい牛乳 900ml", amount: 258, category: "食費" },
        { name: "国産 豚ロース切り落とし", amount: 680, category: "食費" },
        { name: "ティッシュペーパー 5P", amount: 398, category: "日用品" },
      ],
    });

    const result = sanitizeOcrResult(rawJson);
    expect(result).not.toBeNull();
    expect(result?.storeName).toBe("イオン 幕張新都心店");
    expect(result?.date).toBe("2026-08-25");
    expect(result?.totalAmount).toBe(3240);
    expect(result?.paymentMethod).toBe("イオンカード");
    expect(result?.items.length).toBe(3);
    expect(result?.items[0].name).toBe("明治 おいしい牛乳 900ml");
    expect(result?.items[0].amount).toBe(258);
    expect(result?.items[0].category).toBe("食費");
  });

  it("Markdownコードブロックで囲まれたJSONも正しく抽出・パースする", () => {
    const markdownJson = `\`\`\`json
{
  "storeName": "セブン-イレブン",
  "date": "2026/08/20",
  "totalAmount": 750,
  "paymentMethod": "現金",
  "items": [
    { "name": "おにぎり 鮭", "amount": 160, "category": "食費" },
    { "name": "緑茶 600ml", "amount": 140, "category": "食費" }
  ]
}
\`\`\``;

    const result = sanitizeOcrResult(markdownJson);
    expect(result).not.toBeNull();
    expect(result?.storeName).toBe("セブン-イレブン");
    expect(result?.date).toBe("2026-08-20");
    expect(result?.totalAmount).toBe(750);
  });

  it("外税（消費税）および値引き項目が独立した品目として正しく反映される", () => {
    const rawJson = JSON.stringify({
      storeName: "業務スーパー",
      date: "2026-08-15",
      totalAmount: 1100,
      paymentMethod: "Oliveカード",
      items: [
        { name: "パスタ 500g", amount: 120, category: "食費" },
        { name: "パスタソース", amount: 200, category: "食費" },
        { name: "クーポン割引", amount: -50, category: "食費" },
        { name: "外税8%", "amount": 21, category: "その他" },
      ],
    });

    const result = sanitizeOcrResult(rawJson);
    expect(result).not.toBeNull();
    expect(result?.items.length).toBe(4);

    const discountItem = result?.items.find((it) => it.name === "クーポン割引");
    expect(discountItem).toBeDefined();
    expect(discountItem?.amount).toBe(-50);

    const taxItem = result?.items.find((it) => it.name === "外税8%");
    expect(taxItem).toBeDefined();
    expect(taxItem?.amount).toBe(21);
  });

  it("不正なJSON文字列の場合は null を返す", () => {
    expect(sanitizeOcrResult("invalid json")).toBeNull();
    expect(sanitizeOcrResult("")).toBeNull();
  });
});

describe("receiptOcrService - cleanItemName", () => {
  it("先頭の分類番号や記号（例: 13*ニッスイ 若鶏のつく）を綺麗に除去する", () => {
    expect(cleanItemName("13*ニッスイ 若鶏のつく")).toBe("ニッスイ 若鶏のつく");
    expect(cleanItemName("01- 北海道産 牛乳")).toBe("北海道産 牛乳");
    expect(cleanItemName("8. 卵 10個入")).toBe("卵 10個入");
    expect(cleanItemName("10 バナナ 1袋")).toBe("バナナ 1袋");
    expect(cleanItemName("* 納豆 3P")).toBe("納豆 3P");
    expect(cleanItemName("■ コロッケ")).toBe("コロッケ");
    expect(cleanItemName("※ 特別割引")).toBe("特別割引");
  });

  it("記号のない通常の品名や空文字列はそのまま返す", () => {
    expect(cleanItemName("明治 おいしい牛乳 900ml")).toBe("明治 おいしい牛乳 900ml");
    expect(cleanItemName("")).toBe("");
  });
});
