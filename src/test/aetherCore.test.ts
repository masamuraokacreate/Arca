/**
 * src/test/aetherCore.test.ts
 * Aether Core クライアント（Gemini API 連携）の単体テスト
 */

vi.unmock("../lib/aetherCore");

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  suggestCategory,
  categorizeItems,
  suggestRelatedItems,
  breakdownTask,
  generateDailyBriefing,
  parseTaskInput,
} from "../lib/aetherCore";

describe("Aether Core — suggestCategory", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    import.meta.env.VITE_GEMINI_API_KEY = "test-key";
  });

  it("空文字の場合は null を返す", async () => {
    const result = await suggestCategory("");
    expect(result).toBeNull();
  });

  it("正常なカテゴリ推論文字列を返す", async () => {
    const mockJson = {
      candidates: [
        {
          content: {
            parts: [{ text: "野菜" }],
          },
        },
      ],
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockJson,
    });

    try {
      const result = await suggestCategory("にんじん");
      expect(result).toBe("野菜");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("Aether Core — categorizeItems", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    import.meta.env.VITE_GEMINI_API_KEY = "test-key";
  });

  it("空配列の場合は即座に空オブジェクトを返す", async () => {
    const result = await categorizeItems([]);
    expect(result).toEqual({});
  });

  it("正常な JSON レスポンスからアイテムとカテゴリのマッピングを返す", async () => {
    const mockJson = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  "キャベツ": "野菜・果物",
                  "豚ロース": "肉・魚",
                  "ヨーグルト": "乳製品・卵・調味料",
                }),
              },
            ],
          },
        },
      ],
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockJson,
    });

    try {
      const result = await categorizeItems(["キャベツ", "豚ロース", "ヨーグルト"]);
      expect(result["キャベツ"]).toBe("野菜・果物");
      expect(result["豚ロース"]).toBe("肉・魚");
      expect(result["ヨーグルト"]).toBe("乳製品・卵・調味料");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("APIエラー時は空オブジェクトを返しクラッシュしない", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    try {
      const result = await categorizeItems(["にんじん"]);
      expect(result).toEqual({});
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("Aether Core — suggestRelatedItems", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    import.meta.env.VITE_GEMINI_API_KEY = "test-key";
  });

  it("空配列の場合は即座に空配列を返す", async () => {
    const result = await suggestRelatedItems([]);
    expect(result).toEqual([]);
  });

  it("現在のアイテムから関連アイテムを最大4件提案する", async () => {
    const mockJson = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify(["じゃがいも", "にんじん", "カレールー", "福神漬け"]),
              },
            ],
          },
        },
      ],
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockJson,
    });

    try {
      const result = await suggestRelatedItems(["牛肉", "玉ねぎ"]);
      expect(result).toEqual(["じゃがいも", "にんじん", "カレールー", "福神漬け"]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("Aether Core — breakdownTask", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    import.meta.env.VITE_GEMINI_API_KEY = "test-key";
  });

  it("空文字の場合は空配列を返す", async () => {
    const result = await breakdownTask("");
    expect(result).toEqual([]);
  });

  it("タスク名からサブタスクのリストを生成する", async () => {
    const mockJson = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify([
                  "不要な物を処分する",
                  "家具の配置図を描く",
                  "床を掃除する",
                  "家具を移動する",
                ]),
              },
            ],
          },
        },
      ],
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockJson,
    });

    try {
      const result = await breakdownTask("部屋の模様替えをする");
      expect(result).toHaveLength(4);
      expect(result[0]).toBe("不要な物を処分する");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("Aether Core — generateDailyBriefing", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    import.meta.env.VITE_GEMINI_API_KEY = "test-key";
  });

  it("予定・タスク・買い物リストから簡潔な日次ブリーフィングを生成する", async () => {
    const mockJson = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: "午前中に重要な会議があります。午後は買い物リストの補充を優先し、静かに一日を整えましょう。",
              },
            ],
          },
        },
      ],
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockJson,
    });

    try {
      const result = await generateDailyBriefing({
        events: [{ title: "会議", startTime: "10:00" }],
        tasks: [{ title: "資料作成", priority: "high" }],
        listsCount: 3,
      });
      expect(result).toContain("午前中に重要な会議があります");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("APIエラー時は null を返しクラッシュしない", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    try {
      const result = await generateDailyBriefing({
        events: [],
        tasks: [],
        listsCount: 0,
      });
      expect(result).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("Aether Core — parseTaskInput", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    import.meta.env.VITE_GEMINI_API_KEY = "test-key";
  });

  it("自然言語からタイトル・期日・優先度を抽出する", async () => {
    const mockJson = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  title: "書類提出",
                  dueDate: "2026-08-20",
                  priority: "high",
                }),
              },
            ],
          },
        },
      ],
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockJson,
    });

    try {
      const result = await parseTaskInput("明日15時に書類提出 #高", "2026-08-19");
      expect(result?.title).toBe("書類提出");
      expect(result?.dueDate).toBe("2026-08-20");
      expect(result?.priority).toBe("high");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("空文字や短い文字列の場合は null を返す", async () => {
    const result = await parseTaskInput("a");
    expect(result).toBeNull();
  });
});
