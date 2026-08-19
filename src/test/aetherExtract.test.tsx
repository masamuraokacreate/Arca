/**
 * src/test/aetherExtract.test.tsx
 * Aether Core 横断抽出機能の単体・インテグレーションテスト
 */

vi.unmock("../lib/aetherCore");

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addDoc } from "firebase/firestore";
import { extractActionableItems } from "../lib/aetherCore";
import { AetherExtractModal } from "../components/notes/AetherExtractModal";
import type { ExtractedActionableItems } from "../types";

describe("Aether Core extractActionableItems", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    import.meta.env.VITE_GEMINI_API_KEY = "test-key";
  });

  it("空文字の場合は即座に null を返す", async () => {
    const result = await extractActionableItems("");
    expect(result).toBeNull();
  });

  it("正常な JSON レスポンスから lists と tasks を抽出する", async () => {
    const mockJson = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  lists: [
                    { title: "玉ねぎ", category: "野菜" },
                    { title: "鶏肉", category: "肉・魚" },
                  ],
                  tasks: [
                    { title: "下味をつける", priority: "medium" },
                    { title: "オーブンを予熱する", priority: "high", dueDate: "2026-09-01" },
                  ],
                }),
              },
            ],
          },
        },
      ],
    };

    // global.fetch をモック
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockJson,
    });

    try {
      const result = await extractActionableItems("今夜のチキンカレーレシピ: 玉ねぎ、鶏肉を買って下味をつける。9/1にオーブン予熱。");
      expect(result).not.toBeNull();
      expect(result?.lists).toHaveLength(2);
      expect(result?.lists[0].title).toBe("玉ねぎ");
      expect(result?.lists[0].category).toBe("野菜");
      expect(result?.tasks).toHaveLength(2);
      expect(result?.tasks[1].title).toBe("オーブンを予熱する");
      expect(result?.tasks[1].priority).toBe("high");
      expect(result?.tasks[1].dueDate).toBe("2026-09-01");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("APIエラー時や不正なレスポンス時は null を返しクラッシュしない", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    });

    try {
      const result = await extractActionableItems("メモ内容");
      expect(result).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("AetherExtractModal コンポーネント", () => {
  const sampleItems: ExtractedActionableItems = {
    lists: [
      { title: "トマト缶", category: "調味料" },
      { title: "パスタ 500g", category: "日用品" },
    ],
    tasks: [
      { title: "ニンニクをみじん切りにする", priority: "medium" },
      { title: "タイマーを8分にセット", priority: "high", dueDate: "2026-08-20" },
    ],
  };

  beforeEach(() => {
    vi.resetAllMocks();
    (addDoc as Mock).mockResolvedValue({ id: "mock-doc-id" });
  });

  it("抽出されたアイテム一覧がチェックボックス付きでレンダリングされる", () => {
    render(
      <AetherExtractModal
        items={sampleItems}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    expect(screen.getByText("アクション項目の抽出")).toBeInTheDocument();
    expect(screen.getByText("トマト缶")).toBeInTheDocument();
    expect(screen.getByText("調味料")).toBeInTheDocument();
    expect(screen.getByText("パスタ 500g")).toBeInTheDocument();
    expect(screen.getByText("ニンニクをみじん切りにする")).toBeInTheDocument();
    expect(screen.getByText("タイマーを8分にセット")).toBeInTheDocument();
    expect(screen.getByText("4 件を Arca に追加")).toBeInTheDocument();
  });

  it("カード行のテキストをクリックして個別にON/OFFをトグルできる", async () => {
    const user = userEvent.setup();
    render(
      <AetherExtractModal
        items={sampleItems}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    // 最初は 4件選択中
    expect(screen.getByText("4 件を Arca に追加")).toBeInTheDocument();

    // 「トマト缶」のテキスト行をクリックして解除
    const itemText = screen.getByText("トマト缶");
    await user.click(itemText);
    expect(screen.getByText("3 件を Arca に追加")).toBeInTheDocument();

    // もう一度クリックして再選択
    await user.click(itemText);
    expect(screen.getByText("4 件を Arca に追加")).toBeInTheDocument();
  });

  it("すべて解除・すべて選択ボタンで選択状態を切り替えられる", async () => {
    const user = userEvent.setup();
    render(
      <AetherExtractModal
        items={sampleItems}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    const toggleBtn = screen.getByText("すべて解除");
    await user.click(toggleBtn);

    expect(screen.getByText("すべて選択")).toBeInTheDocument();
    expect(screen.getByText("0 件を Arca に追加")).toBeDisabled();

    await user.click(screen.getByText("すべて選択"));
    expect(screen.getByText("4 件を Arca に追加")).toBeEnabled();
  });

  it("追加ボタンを押すと Firestore に選択されたアイテムが一括保存される", async () => {
    const user = userEvent.setup();
    const handleSuccess = vi.fn();
    const handleClose = vi.fn();

    render(
      <AetherExtractModal
        items={sampleItems}
        onClose={handleClose}
        onSuccess={handleSuccess}
      />
    );

    const addBtn = screen.getByText("4 件を Arca に追加");
    await user.click(addBtn);

    await waitFor(() => {
      // 買い物2件 + タスク2件 = 合計4回 addDoc
      expect(addDoc).toHaveBeenCalledTimes(4);
      expect(handleSuccess).toHaveBeenCalledWith(4);
      expect(handleClose).toHaveBeenCalledTimes(1);
    });
  });
});
