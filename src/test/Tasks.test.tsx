/**
 * src/test/Tasks.test.tsx
 * Tasks コンポーネントのインテグレーションテスト
 *
 * 戦略:
 *   - Firestore は setup.ts でモック済み
 *   - onSnapshot のコールバックを手動で呼び出してデータを注入する
 *   - 追加・完了トグル・削除の各操作を検証する
 */
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import Tasks from "../components/Tasks";

// ─── ヘルパー: onSnapshot を即時実行させる ───
function mockSnapshot(docs: { id: string; data: object }[]) {
  (onSnapshot as Mock).mockImplementation(
    (_query: unknown, callback: (snap: unknown) => void) => {
      callback({
        docs: docs.map((d) => ({
          id: d.id,
          data: () => d.data,
        })),
      });
      return vi.fn(); // unsubscribe
    }
  );
}

describe("Tasks コンポーネント", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // デフォルト: 空のリスト
    mockSnapshot([]);
    (addDoc as Mock).mockResolvedValue({ id: "new-task-id" });
    (updateDoc as Mock).mockResolvedValue(undefined);
    (deleteDoc as Mock).mockResolvedValue(undefined);
  });

  // ─── 表示テスト ───

  it("空状態で「タスクはありません」を表示する", () => {
    render(<Tasks />);
    expect(screen.getByText("タスクはありません")).toBeInTheDocument();
  });

  it("ヘッダー「Arca / Tasks」と「タスク」が表示される", () => {
    render(<Tasks />);
    expect(screen.getByText("Arca / Tasks")).toBeInTheDocument();
    expect(screen.getByText("タスク")).toBeInTheDocument();
  });

  it("タスクが存在する場合はリストに表示する", () => {
    mockSnapshot([
      {
        id: "t1",
        data: { title: "牛乳を買う", dueDate: null, completed: false, createdAt: null },
      },
      {
        id: "t2",
        data: { title: "歯医者の予約", dueDate: "2026-08-20", completed: false, createdAt: null },
      },
    ]);
    render(<Tasks />);
    expect(screen.getByText("牛乳を買う")).toBeInTheDocument();
    expect(screen.getByText("歯医者の予約")).toBeInTheDocument();
  });

  it("完了済みタスクは「完了済み」セクションに分離される", () => {
    mockSnapshot([
      {
        id: "t1",
        data: { title: "完了したタスク", dueDate: null, completed: true, createdAt: null },
      },
      {
        id: "t2",
        data: { title: "未完了タスク", dueDate: null, completed: false, createdAt: null },
      },
    ]);
    render(<Tasks />);
    expect(screen.getByText("完了済み")).toBeInTheDocument();
    expect(screen.getByText("完了したタスク")).toBeInTheDocument();
    expect(screen.getByText("未完了タスク")).toBeInTheDocument();
  });

  // ─── 追加テスト ───

  it("タスクタイトルを入力して追加ボタンを押すと addDoc が呼ばれる", async () => {
    const user = userEvent.setup();
    render(<Tasks />);

    const input = screen.getByPlaceholderText("タスクを追加…");
    await user.type(input, "新しいタスク");

    const addBtn = screen.getByText("追加");
    await user.click(addBtn);

    await waitFor(() => {
      expect(addDoc).toHaveBeenCalledTimes(1);
    });

    const callArg = (addDoc as Mock).mock.calls[0][1];
    expect(callArg.title).toBe("新しいタスク");
    expect(callArg.completed).toBe(false);
  });

  it("Enter キーで追加できる", async () => {
    const user = userEvent.setup();
    render(<Tasks />);

    const input = screen.getByPlaceholderText("タスクを追加…");
    await user.type(input, "Enterで追加{Enter}");

    await waitFor(() => {
      expect(addDoc).toHaveBeenCalledTimes(1);
    });
  });

  it("空文字では追加できない（addDoc が呼ばれない）", async () => {
    const user = userEvent.setup();
    render(<Tasks />);

    const addBtn = screen.getByText("追加");
    await user.click(addBtn);

    expect(addDoc).not.toHaveBeenCalled();
  });

  it("期限を設定して追加すると dueDate が正しく渡される", async () => {
    const user = userEvent.setup();
    render(<Tasks />);

    const input = screen.getByPlaceholderText("タスクを追加…");
    await user.type(input, "期限付きタスク");

    // 期限 input に日付をセット
    const dateInput = screen.getByDisplayValue("") as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: "2026-09-01" } });

    await user.click(screen.getByText("追加"));

    await waitFor(() => {
      const callArg = (addDoc as Mock).mock.calls[0][1];
      expect(callArg.dueDate).toBe("2026-09-01");
    });
  });

  // ─── 完了トグルテスト ───

  it("チェックボタンを押すと updateDoc が呼ばれる", async () => {
    mockSnapshot([
      {
        id: "t1",
        data: { title: "トグルテスト", dueDate: null, completed: false, createdAt: null },
      },
    ]);
    const user = userEvent.setup();
    render(<Tasks />);

    const checkBtn = screen.getByTitle("完了にする");
    await user.click(checkBtn);

    await waitFor(() => {
      expect(updateDoc).toHaveBeenCalledTimes(1);
      const callArg = (updateDoc as Mock).mock.calls[0][1];
      expect(callArg.completed).toBe(true);
    });
  });

  // ─── 削除テスト ───

  it("ゴミ箱ボタンを押すと deleteDoc が呼ばれる", async () => {
    mockSnapshot([
      {
        id: "t1",
        data: { title: "削除テスト", dueDate: null, completed: false, createdAt: null },
      },
    ]);
    render(<Tasks />);

    // ホバーしなくても削除ボタンはDOMに存在する（opacity:0 だが）
    const deleteBtn = screen.getByTitle("削除");
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(deleteDoc).toHaveBeenCalledTimes(1);
    });
  });
});
