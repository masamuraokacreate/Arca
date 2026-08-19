/**
 * src/test/Lists.test.tsx
 * Lists コンポーネントのインテグレーションテスト
 */
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
} from "firebase/firestore";
import { useGoogleAuth } from "../hooks/useGoogleAuth";
import Lists from "../components/Lists";

// ─── ヘルパー ───
function mockSnapshot(docs: { id: string; data: object }[]) {
  (onSnapshot as Mock).mockImplementation(
    (_query: unknown, callback: (snap: unknown) => void) => {
      callback({
        docs: docs.map((d) => ({
          id: d.id,
          data: () => d.data,
        })),
      });
      return vi.fn();
    }
  );
}

describe("Lists コンポーネント", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (useGoogleAuth as Mock).mockReturnValue({
      accessToken: null,
      isSignedIn: false,
      isReady: true,
      signIn: vi.fn(),
      signOut: vi.fn(),
    });
    mockSnapshot([]);
    (addDoc as Mock).mockResolvedValue({ id: "new-list-id" });
    (updateDoc as Mock).mockResolvedValue(undefined);
    (deleteDoc as Mock).mockResolvedValue(undefined);
    (getDocs as Mock).mockResolvedValue({ docs: [] });
  });

  // ─── 表示テスト ───

  it("ヘッダー「買い物リスト」が表示される", () => {
    render(<Lists />);
    expect(screen.getByText("買い物リスト")).toBeInTheDocument();
  });

  it("空状態で「リストは空です」を表示する", () => {
    render(<Lists />);
    expect(screen.getByText("リストは空です")).toBeInTheDocument();
  });

  it("Google同期ボタンが表示される（未ログイン時）", () => {
    render(<Lists />);
    expect(screen.getByText("Google同期")).toBeInTheDocument();
  });

  it("アイテムがある場合リストに表示する", () => {
    mockSnapshot([
      {
        id: "l1",
        data: { text: "牛乳", completed: false, createdAt: null },
      },
      {
        id: "l2",
        data: { text: "パン", completed: false, createdAt: null },
      },
    ]);
    render(<Lists />);
    expect(screen.getByText("牛乳")).toBeInTheDocument();
    expect(screen.getByText("パン")).toBeInTheDocument();
  });

  it("完了済みアイテムは「完了済み」セクションに表示される", () => {
    mockSnapshot([
      {
        id: "l1",
        data: { text: "卵", completed: true, createdAt: null },
      },
      {
        id: "l2",
        data: { text: "野菜", completed: false, createdAt: null },
      },
    ]);
    render(<Lists />);
    expect(screen.getByText(/完了済み \(1\)/)).toBeInTheDocument();
    expect(screen.getByText("卵")).toBeInTheDocument();
    expect(screen.getByText("野菜")).toBeInTheDocument();
  });

  it("カテゴリバッジが表示される", () => {
    mockSnapshot([
      {
        id: "l1",
        data: { text: "にんじん", completed: false, createdAt: null, category: "野菜" },
      },
    ]);
    render(<Lists />);
    expect(screen.getByTitle("カテゴリ: 野菜")).toBeInTheDocument();
  });

  // ─── 追加テスト ───

  it("アイテムを入力して追加ボタンを押すと addDoc が呼ばれる", async () => {
    const user = userEvent.setup();
    render(<Lists />);

    const input = screen.getByPlaceholderText("アイテムを追加…");
    await user.type(input, "りんご");

    const addBtn = screen.getByText("追加");
    await user.click(addBtn);

    await waitFor(() => {
      expect(addDoc).toHaveBeenCalledTimes(1);
      const callArg = (addDoc as Mock).mock.calls[0][1];
      expect(callArg.text).toBe("りんご");
      expect(callArg.completed).toBe(false);
    });
  });

  it("Enter キーで追加できる", async () => {
    const user = userEvent.setup();
    render(<Lists />);

    const input = screen.getByPlaceholderText("アイテムを追加…");
    await user.type(input, "バナナ{Enter}");

    await waitFor(() => {
      expect(addDoc).toHaveBeenCalledTimes(1);
    });
  });

  it("空文字では追加できない（addDoc 呼ばれない）", async () => {
    const user = userEvent.setup();
    render(<Lists />);

    const addBtn = screen.getByText("追加");
    await user.click(addBtn);

    expect(addDoc).not.toHaveBeenCalled();
  });

  // ─── 完了トグルテスト ───

  it("アイテムをクリックすると updateDoc が呼ばれる", async () => {
    mockSnapshot([
      {
        id: "l1",
        data: { text: "オレンジ", completed: false, createdAt: null },
      },
    ]);
    const user = userEvent.setup();
    render(<Lists />);

    const item = screen.getByText("オレンジ");
    await user.click(item);

    await waitFor(() => {
      expect(updateDoc).toHaveBeenCalledTimes(1);
      const callArg = (updateDoc as Mock).mock.calls[0][1];
      expect(callArg.completed).toBe(true);
    });
  });

  it("完了済みアイテムをクリックすると completed: false になる", async () => {
    mockSnapshot([
      {
        id: "l1",
        data: { text: "完了アイテム", completed: true, createdAt: null },
      },
    ]);
    const user = userEvent.setup();
    render(<Lists />);

    const item = screen.getByText("完了アイテム");
    await user.click(item);

    await waitFor(() => {
      const callArg = (updateDoc as Mock).mock.calls[0][1];
      expect(callArg.completed).toBe(false);
    });
  });

  // ─── インライン編集テスト ───

  it("編集ボタンをクリックして新しいタイトルを入力し Enter で updateDoc が呼ばれる", async () => {
    mockSnapshot([
      {
        id: "l1",
        data: { text: "牛乳", completed: false, createdAt: null, category: "乳製品" },
      },
    ]);
    const user = userEvent.setup();
    render(<Lists />);

    const editBtn = screen.getByTestId("item-edit-btn");
    await user.click(editBtn);

    const editInput = screen.getByDisplayValue("牛乳");
    await user.clear(editInput);
    await user.type(editInput, "低脂肪乳{Enter}");

    await waitFor(() => {
      expect(updateDoc).toHaveBeenCalledTimes(1);
      const callArg = (updateDoc as Mock).mock.calls[0][1];
      expect(callArg.text).toBe("低脂肪乳");
    });
  });

  it("編集モードで Escape を押すと編集がキャンセルされる", async () => {
    mockSnapshot([
      {
        id: "l1",
        data: { text: "牛乳", completed: false, createdAt: null },
      },
    ]);
    const user = userEvent.setup();
    render(<Lists />);

    const editBtn = screen.getByTestId("item-edit-btn");
    await user.click(editBtn);

    const editInput = screen.getByDisplayValue("牛乳");
    await user.type(editInput, "（キャンセルテスト）{Escape}");

    expect(screen.getByText("牛乳")).toBeInTheDocument();
    expect(updateDoc).not.toHaveBeenCalled();
  });

  // ─── スーパー買い回り順路ソートテスト ───

  it("「順路順で並び替え」ボタンで売り場順路に沿ってアイテムが整列する", async () => {
    mockSnapshot([
      { id: "1", data: { text: "アイス", completed: false, category: "アイス", createdAt: null } },
      { id: "2", data: { text: "トマト", completed: false, category: "野菜", createdAt: null } },
      { id: "3", data: { text: "豚肉", completed: false, category: "精肉", createdAt: null } },
    ]);
    const user = userEvent.setup();
    render(<Lists />);

    const sortBtn = screen.getByText("順路順で並び替え");
    await user.click(sortBtn);

    const listItems = screen.getAllByRole("listitem");
    expect(listItems[0]).toHaveTextContent("トマト");
    expect(listItems[1]).toHaveTextContent("豚肉");
    expect(listItems[2]).toHaveTextContent("アイス");
  });

  // ─── グループ化表示テスト ───

  it("「グループ表示」セグメントでカテゴリごとにグループ化されて表示される", async () => {
    mockSnapshot([
      { id: "1", data: { text: "キャベツ", completed: false, category: "野菜", createdAt: null } },
      { id: "2", data: { text: "鶏もも肉", completed: false, category: "精肉", createdAt: null } },
    ]);
    const user = userEvent.setup();
    render(<Lists />);

    const groupBtn = screen.getByText("グループ表示");
    await user.click(groupBtn);

    expect(screen.getByText("✦ 野菜・果物")).toBeInTheDocument();
    expect(screen.getByText("✦ 肉・魚")).toBeInTheDocument();
  });

  // ─── 未分類一括整理テスト ───

  it("未分類アイテムが存在する場合「未分類を自動整理」ボタンが表示され一括分類できる", async () => {
    const { categorizeItems } = await import("../lib/aetherCore");
    (categorizeItems as Mock).mockResolvedValue({
      "レタス": "野菜・果物",
      "牛バラ肉": "肉・魚",
    });

    mockSnapshot([
      { id: "1", data: { text: "レタス", completed: false, category: null, createdAt: null } },
      { id: "2", data: { text: "牛バラ肉", completed: false, category: "", createdAt: null } },
    ]);
    const user = userEvent.setup();
    render(<Lists />);

    const autoBtn = screen.getByText(/✦ 未分類を自動整理 \(2\)/);
    expect(autoBtn).toBeInTheDocument();

    await user.click(autoBtn);

    await waitFor(() => {
      expect(categorizeItems).toHaveBeenCalledWith(["レタス", "牛バラ肉"]);
      expect(updateDoc).toHaveBeenCalledTimes(2);
    });
  });

  // ─── 完了済み一括消去 & 確認モーダル & Undoテスト ───

  it("「完了済みを消去」ボタンを押すと確認モーダルが開き、削除すると deleteDoc と Undo が動作する", async () => {
    mockSnapshot([
      { id: "c1", data: { text: "完了1", completed: true, createdAt: null } },
      { id: "c2", data: { text: "完了2", completed: true, createdAt: null } },
      { id: "p1", data: { text: "未完了1", completed: false, createdAt: null } },
    ]);
    const user = userEvent.setup();
    render(<Lists />);

    const clearBtn = screen.getByText("完了済みを消去");
    await user.click(clearBtn);

    // 確認モーダルが表示されること
    expect(screen.getByText("完了済みアイテムの削除")).toBeInTheDocument();
    expect(screen.getByText("完了した 2 件のアイテムをリストから削除しますか？")).toBeInTheDocument();

    // モーダル内の「削除する」をクリック
    const confirmBtn = screen.getByText("削除する");
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(deleteDoc).toHaveBeenCalledTimes(2);
    });

    // Undoトーストが表示されること
    expect(screen.getByText("2件の完了アイテムを削除しました")).toBeInTheDocument();
    const undoBtn = screen.getByText("元に戻す");
    expect(undoBtn).toBeInTheDocument();

    // Undoをクリックして復元されること
    await user.click(undoBtn);
    await waitFor(() => {
      expect(addDoc).toHaveBeenCalledTimes(2);
    });
  });

  // ─── Google同期 重複防止テスト ───

  it("Google同期時、既に同じgoogleTaskIdが存在する場合は新規追加されない", async () => {
    const { getTaskLists, getTasks } = await import("../lib/googleTasks");
    (useGoogleAuth as Mock).mockReturnValue({
      accessToken: "mock-token",
      isSignedIn: true,
      isReady: true,
      signIn: vi.fn(),
      signOut: vi.fn(),
    });

    (getTaskLists as Mock).mockResolvedValue([
      { id: "list-1", title: "買い物リスト" },
    ]);
    (getTasks as Mock).mockResolvedValue([
      { id: "gtask-1", title: "既存タスク", status: "needsAction" },
    ]);

    (getDocs as Mock).mockResolvedValue({
      docs: [
        {
          id: "doc-1",
          data: () => ({
            text: "既存タスク",
            completed: false,
            googleTaskId: "gtask-1",
          }),
        },
      ],
    });

    render(<Lists />);

    await waitFor(() => {
      expect(getTasks).toHaveBeenCalled();
    });

    expect(addDoc).not.toHaveBeenCalled();
  });

  // ─── Aether Core 提案テスト ───

  it("入力中に Aether Core の suggestCategory が呼ばれない（debounce 前）", async () => {
    const { suggestCategory } = await import("../lib/aetherCore");
    const user = userEvent.setup();
    render(<Lists />);

    const input = screen.getByPlaceholderText("アイテムを追加…");
    await user.type(input, "に");

    expect(suggestCategory).not.toHaveBeenCalled();
  });
});
