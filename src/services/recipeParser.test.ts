/**
 * src/services/recipeParser.test.ts
 * Aether Recipe Parser の単体テスト
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseRecipeWithGemini, fetchPageText, PROXY_FETCH_ERROR_MESSAGE } from "./recipeParser";

describe("recipeParser (parseRecipeWithGemini)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * URL入力時の fetch 呼び出し回数について:
   *   1回目 → CORSプロキシ経由でHTMLを取得
   *   2回目 → Gemini API でレシピを解析
   */
  it("正常なレシピJSONレスポンスを正しく ParsedRecipeResult に変換する（URL入力）", async () => {
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

    // 1回目: CORSプロキシ → HTML取得成功
    // 2回目: Gemini API → レシピJSON取得成功
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () => `<html><body><main><p>カルボナーラのレシピ本文</p></main></body></html>`,
      } as unknown as Response)
      .mockResolvedValueOnce({
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
    // fetchが2回呼ばれていることを確認
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("マークダウンコードブロック ```json で囲まれたレスポンスでもパースできる（テキスト入力）", async () => {
    const mockJson = JSON.stringify({
      title: "簡単オムライス",
      servings: "1人前",
      ingredients: [{ name: "卵", amount: "2個" }],
      steps: ["ご飯を炒める", "卵で包む"],
      tags: ["洋食"],
    });

    // テキスト入力のため fetch は Gemini API の1回のみ
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
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
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("材料や手順が欠けている場合でもデフォルト値で安全に補完される（テキスト入力）", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
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

  it("Gemini APIエラー（HTTP 500）発生時はクラッシュせず null を返す（URL入力）", async () => {
    // 1回目: CORSプロキシ → HTML取得成功
    // 2回目: Gemini API → 500エラー
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () => `<html><body><main><p>レシピ本文</p></main></body></html>`,
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "Internal Server Error",
      } as unknown as Response);

    const result = await parseRecipeWithGemini("https://example.com/fail");
    expect(result).toBeNull();
  });

  it("全プロキシが失敗した場合は PROXY_FETCH_ERROR_MESSAGE で Error を throw する", async () => {
    // 全プロキシが HTTP 403 を返す（2回分）
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => "Forbidden",
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => "Forbidden",
      } as unknown as Response);

    await expect(
      parseRecipeWithGemini("https://blocked-site.example.com/recipe")
    ).rejects.toThrow(PROXY_FETCH_ERROR_MESSAGE);
  });
});

describe("fetchPageText", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("1つ目のプロキシ成功時にテキストを返す", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      text: async () => `<html><body><main><p>レシピ本文テキスト</p></main></body></html>`,
    } as unknown as Response);

    const result = await fetchPageText("https://example.com/recipe");
    expect(result).toContain("レシピ本文テキスト");
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("1つ目のプロキシ失敗→2つ目のプロキシ成功時にテキストを返す", async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => "Forbidden",
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        text: async () => `<html><body><article><p>フォールバックで取得したレシピ</p></article></body></html>`,
      } as unknown as Response);

    const result = await fetchPageText("https://example.com/recipe");
    expect(result).toContain("フォールバックで取得したレシピ");
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("全プロキシ失敗時に PROXY_FETCH_ERROR_MESSAGE で Error を throw する", async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 403, text: async () => "" } as unknown as Response)
      .mockResolvedValueOnce({ ok: false, status: 403, text: async () => "" } as unknown as Response);

    await expect(fetchPageText("https://blocked.example.com")).rejects.toThrow(
      PROXY_FETCH_ERROR_MESSAGE
    );
  });
});


