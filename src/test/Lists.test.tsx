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
    // vi.resetAllMocks 後に useGoogleAuth を再設定
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
  });

  // ─── 表示テスト ───

  it("「Arca / Lists」ヘッダーが表示される", () => {
    render(<Lists />);
    expect(screen.getByText("Arca / Lists")).toBeInTheDocument();
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
    expect(screen.getByText("完了済み")).toBeInTheDocument();
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

  // ─── Aether Core 提案テスト ───

  it("入力中に Aether Core の suggestCategory が呼ばれない（debounce 前）", async () => {
    const { suggestCategory } = await import("../lib/aetherCore");
    const user = userEvent.setup();
    render(<Lists />);

    const input = screen.getByPlaceholderText("アイテムを追加…");
    // debounce 600ms より前はまだ呼ばれない
    await user.type(input, "に");

    expect(suggestCategory).not.toHaveBeenCalled();
  });
});
