/**
 * src/services/recipeParser.test.ts
 * Aether Recipe Parser の単体テスト
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseRecipeWithGemini } from "./recipeParser";

describe("recipeParser (parseRecipeWithGemini)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("正常なレシピJSONレスポンスを正しく ParsedRecipeResult に変換する", async () => {
    const mockResponse = {
      title: "絶品カルボナーラ",
      servings: "2人前",
      ingredients: [
        { name: "スパゲッティ", amount: "200g" },
        { name: "ブロックベーコン", amount: "80g" },
        { name: "卵黄", amount: "2個" },
        { name: "パルメザンチーズ", amount: "30g" },
      ],
      steps: [
        "パスタを塩分1%のお湯で茹でる。",
        "ベーコンをオリーブオイルでじっくり炒める。",
        "ボウルに卵黄、粉チーズ、黒胡椒を混ぜ合わせる。",
        "茹でたパスタとベーコン、卵液を手早く和える。",
      ],
      tags: ["イタリアン", "パスタ", "定番"],
      notes: "卵液が固まらないように火を止めてから混ぜるのがコツ",
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: JSON.stringify(mockResponse) }],
            },
          },
        ],
      }),
    } as unknown as Response);

    const result = await parseRecipeWithGemini("https://example.com/carbonara");

    expect(result).not.toBeNull();
    expect(result?.title).toBe("絶品カルボナーラ");
    expect(result?.servings).toBe("2人前");
    expect(result?.ingredients).toHaveLength(4);
    expect(result?.ingredients[0]).toEqual({ name: "スパゲッティ", amount: "200g" });
    expect(result?.steps).toHaveLength(4);
    expect(result?.tags).toEqual(["イタリアン", "パスタ", "定番"]);
    expect(result?.notes).toContain("卵液が固まらないように");
  });

  it("マークダウンコードブロック ```json で囲まれたレスポンスでもパースできる", async () => {
    const mockJson = JSON.stringify({
      title: "簡単オムライス",
      servings: "1人前",
      ingredients: [{ name: "卵", amount: "2個" }],
      steps: ["ご飯を炒める", "卵で包む"],
      tags: ["洋食"],
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: `\`\`\`json\n${mockJson}\n\`\`\`` }],
            },
          },
        ],
      }),
    } as unknown as Response);

    const result = await parseRecipeWithGemini("卵2個、ご飯を使ってオムライスの作り方");

    expect(result).not.toBeNull();
    expect(result?.title).toBe("簡単オムライス");
    expect(result?.ingredients[0].name).toBe("卵");
  });

  it("材料や手順が欠けている場合でもデフォルト値で安全に補完される", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: JSON.stringify({ title: "" }) }],
            },
          },
        ],
      }),
    } as unknown as Response);

    const result = await parseRecipeWithGemini("適当なレシピテキスト");

    expect(result).not.toBeNull();
    expect(result?.title).toBe("無題のレシピ");
    expect(result?.servings).toBe("1人前");
    expect(result?.ingredients).toEqual([]);
    expect(result?.steps).toEqual([]);
    expect(result?.tags).toEqual([]);
  });

  it("入力が空文字列の場合は fetch を呼ばずに null を返す", async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;

    const result = await parseRecipeWithGemini("   ");
    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("APIエラー（HTTP 500）発生時はクラッシュせず null を返す", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    } as unknown as Response);

    const result = await parseRecipeWithGemini("https://example.com/fail");
    expect(result).toBeNull();
  });
});
