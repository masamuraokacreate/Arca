/**
 * src/test/Tasks.test.tsx
 * Tasks コンポーネントのインテグレーションテスト (動的タブ・詳細モーダル・Google Todo連動)
 */
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
} from "firebase/firestore";
import { useGoogleAuth } from "../hooks/useGoogleAuth";
import Tasks from "../components/Tasks";

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

describe("Tasks コンポーネント", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useGoogleAuth as Mock).mockReturnValue({
      accessToken: null,
      isSignedIn: false,
      isReady: true,
      signIn: vi.fn(),
      signOut: vi.fn(),
    });
    mockSnapshot([]);
    (addDoc as Mock).mockResolvedValue({ id: "new-task-id" });
    (updateDoc as Mock).mockResolvedValue(undefined);
    (deleteDoc as Mock).mockResolvedValue(undefined);
    (getDocs as Mock).mockResolvedValue({ docs: [] });
  });

  // ─── 表示テスト ───

  it("ヘッダー「マイタスク」が表示される", () => {
    render(<Tasks />);
    expect(screen.getByRole("heading", { name: "マイタスク" })).toBeInTheDocument();
  });

  it("空状態で「タスクはありません」を表示する", () => {
    render(<Tasks />);
    expect(screen.getByText("タスクはありません")).toBeInTheDocument();
  });

  it("タスクがある場合リストに表示する", () => {
    mockSnapshot([
      {
        id: "t1",
        data: { title: "牛乳を買う", dueDate: null, completed: false, listId: "default", createdAt: null },
      },
      {
        id: "t2",
        data: { title: "部屋の掃除", dueDate: "2026-08-20", completed: false, listId: "default", createdAt: null },
      },
    ]);
    render(<Tasks />);
    expect(screen.getByText("牛乳を買う")).toBeInTheDocument();
    expect(screen.getByText("部屋の掃除")).toBeInTheDocument();
  });

  it("完了済みタスクは「完了済み」セクションに表示される", () => {
    mockSnapshot([
      {
        id: "t1",
        data: { title: "完了タスク", dueDate: null, completed: true, listId: "default", createdAt: null },
      },
      {
        id: "t2",
        data: { title: "未完了タスク", dueDate: null, completed: false, listId: "default", createdAt: null },
      },
    ]);
    render(<Tasks />);
    expect(screen.getByText(/完了済み \(1\)/)).toBeInTheDocument();
    expect(screen.getByText("完了タスク")).toBeInTheDocument();
    expect(screen.getByText("未完了タスク")).toBeInTheDocument();
  });

  it("期限付きタスクはフォーマットされた期限文字列が表示される", () => {
    mockSnapshot([
      {
        id: "t1",
        data: { title: "レポート提出", dueDate: "2026-08-20", completed: false, listId: "default", createdAt: null },
      },
    ]);
    render(<Tasks />);
    expect(screen.getByText("レポート提出")).toBeInTheDocument();
    expect(screen.getByText(/8月20日|明日|今日|昨日/)).toBeInTheDocument();
  });

  it("優先度が高または低のタスクにバッジが表示される（中は非表示）", () => {
    mockSnapshot([
      {
        id: "t1",
        data: { title: "高優先度タスク", priority: "high", completed: false, listId: "default", createdAt: null },
      },
      {
        id: "t2",
        data: { title: "低優先度タスク", priority: "low", completed: false, listId: "default", createdAt: null },
      },
      {
        id: "t3",
        data: { title: "中優先度タスク", priority: "medium", completed: false, listId: "default", createdAt: null },
      },
    ]);
    render(<Tasks />);
    expect(screen.getByTestId("priority-high-badge")).toHaveTextContent("高");
    expect(screen.getByTestId("priority-low-badge")).toHaveTextContent("低");
  });

  // ─── 追加テスト ───

  it("タスク名を入力して追加ボタンを押すと addDoc が呼ばれる", async () => {
    const user = userEvent.setup();
    render(<Tasks />);

    const input = screen.getByPlaceholderText(/タスクを追加…/);
    await user.type(input, "新しいタスク");

    const addBtn = screen.getByText("追加");
    await user.click(addBtn);

    await waitFor(() => {
      expect(addDoc).toHaveBeenCalledTimes(1);
    });

    const callArg = (addDoc as Mock).mock.calls[0][1];
    expect(callArg.title).toBe("新しいタスク");
    expect(callArg.completed).toBe(false);
    expect(callArg.listId).toBe("default");
  });

  it("Enter キーで追加できる", async () => {
    const user = userEvent.setup();
    render(<Tasks />);

    const input = screen.getByPlaceholderText(/タスクを追加…/);
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

    const input = screen.getByPlaceholderText(/タスクを追加…/);
    await user.type(input, "期限付きタスク");

    const dateInput = screen.getByDisplayValue("") as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: "2026-09-01" } });

    await user.click(screen.getByText("追加"));

    await waitFor(() => {
      const callArg = (addDoc as Mock).mock.calls[0][1];
      expect(callArg.dueDate).toBe("2026-09-01");
    });
  });

  // ─── クリック領域の分離と完了トグル ───

  it("左端チェックボタンを押すと完了トグル（updateDoc）のみが呼ばれる", async () => {
    mockSnapshot([
      {
        id: "t1",
        data: { title: "トグルテスト", dueDate: null, completed: false, listId: "default", createdAt: null },
      },
    ]);
    const user = userEvent.setup();
    render(<Tasks />);

    const toggleBtn = screen.getByTestId("task-toggle-btn");
    await user.click(toggleBtn);

    await waitFor(() => {
      expect(updateDoc).toHaveBeenCalledTimes(1);
      const callArg = (updateDoc as Mock).mock.calls[0][1];
      expect(callArg.completed).toBe(true);
    });

    // 詳細モーダルは開いていないこと
    expect(screen.queryByText("TASK DETAILS")).not.toBeInTheDocument();
  });

  // ─── 一覧からの直接削除 ───

  it("タスク行のゴミ箱ボタンを押すと deleteDoc が呼ばれる", async () => {
    mockSnapshot([
      {
        id: "t1",
        data: { title: "一覧削除テスト", dueDate: null, completed: false, listId: "default", createdAt: null },
      },
    ]);
    const user = userEvent.setup();
    render(<Tasks />);

    const deleteBtn = screen.getByTestId("task-delete-btn");
    await user.click(deleteBtn);

    await waitFor(() => {
      expect(deleteDoc).toHaveBeenCalledTimes(1);
    });
  });

  // ─── タスク詳細モーダルの起動と操作 ───

  it("タスク行をクリックすると詳細モーダルが開き、タスク編集や削除ができる", async () => {
    mockSnapshot([
      {
        id: "t1",
        data: {
          title: "企画書作成",
          dueDate: "2026-08-25",
          priority: "high",
          completed: false,
          listId: "default",
          subtasks: [{ id: "s1", title: "リサーチ", completed: false }],
          createdAt: null,
        },
      },
    ]);
    const user = userEvent.setup();
    render(<Tasks />);

    const row = screen.getByTestId("task-item-row");
    await user.click(row);

    // 詳細モーダルが開く
    expect(screen.getByText("TASK DETAILS")).toBeInTheDocument();
    expect(screen.getByDisplayValue("企画書作成")).toBeInTheDocument();
    expect(screen.getByText("リサーチ")).toBeInTheDocument();

    // タイトルを変更して保存
    const titleInput = screen.getByDisplayValue("企画書作成");
    await user.clear(titleInput);
    await user.type(titleInput, "企画書改訂");

    const saveBtn = screen.getByTestId("detail-task-save-btn");
    await user.click(saveBtn);

    await waitFor(() => {
      expect(updateDoc).toHaveBeenCalled();
      const callArg = (updateDoc as Mock).mock.calls[0][1];
      expect(callArg.title).toBe("企画書改訂");
    });
  });

  it("詳細モーダル内でタスクを完全削除できる", async () => {
    mockSnapshot([
      {
        id: "t1",
        data: {
          title: "削除予定タスク",
          dueDate: null,
          completed: false,
          listId: "default",
          createdAt: null,
        },
      },
    ]);
    const user = userEvent.setup();
    render(<Tasks />);

    await user.click(screen.getByTestId("task-item-row"));
    expect(screen.getByText("TASK DETAILS")).toBeInTheDocument();

    const deleteBtn = screen.getByTestId("detail-task-delete-btn");
    await user.click(deleteBtn);

    await waitFor(() => {
      expect(deleteDoc).toHaveBeenCalledTimes(1);
    });
  });

  // ─── サブタスク分解テスト（Gemini連携 in 詳細モーダル） ───

  it("詳細モーダル内で「✦ AIでステップ分解」を実行してサブタスクを展開できる", async () => {
    const { breakdownTask } = await import("../lib/aetherCore");
    (breakdownTask as Mock).mockResolvedValue([
      "サブタスク1: 資料集め",
      "サブタスク2: スライド作成",
    ]);

    mockSnapshot([
      {
        id: "t1",
        data: { title: "プレゼン準備", dueDate: "2026-08-25", completed: false, listId: "default", subtasks: [], createdAt: null },
      },
    ]);
    const user = userEvent.setup();
    render(<Tasks />);

    // 詳細モーダルを開く
    await user.click(screen.getByTestId("task-item-row"));

    const breakdownBtn = screen.getByTestId("detail-ai-breakdown-btn");
    await user.click(breakdownBtn);

    await waitFor(() => {
      expect(breakdownTask).toHaveBeenCalledWith("プレゼン準備");
      expect(screen.getByText("サブタスク1: 資料集め")).toBeInTheDocument();
      expect(screen.getByText("サブタスク2: スライド作成")).toBeInTheDocument();
    });
  });

  // ─── 動的タブ型リスト管理テスト ───

  it("動的タブで「買い物リスト」に切り替えると、買い物リストのタスクのみが表示される", async () => {
    mockSnapshot([
      {
        id: "t1",
        data: { title: "マイタスクのアイテム", dueDate: null, completed: false, listId: "default", createdAt: null },
      },
      {
        id: "t2",
        data: { title: "牛乳・たまご", dueDate: null, completed: false, listId: "shopping", createdAt: null },
      },
    ]);
    const user = userEvent.setup();
    render(<Tasks />);

    // 初期状態: マイタスク
    expect(screen.getByText("マイタスクのアイテム")).toBeInTheDocument();
    expect(screen.queryByText("牛乳・たまご")).not.toBeInTheDocument();

    // 買い物リストタブをクリック
    const shoppingTab = screen.getByTestId("tab-shopping");
    await user.click(shoppingTab);

    // 買い物リストのアイテムが表示される
    expect(screen.getByText("牛乳・たまご")).toBeInTheDocument();
    expect(screen.queryByText("マイタスクのアイテム")).not.toBeInTheDocument();
  });

  it("「＋ 新しいリスト」から新規リストを作成できる（Sliding Pill と文字数制限15文字が適用される）", async () => {
    const user = userEvent.setup();
    render(<Tasks />);

    // Sliding Pill が存在すること
    expect(screen.getByTestId("tab-sliding-pill")).toBeInTheDocument();

    const addListBtn = screen.getByTestId("add-list-tab-btn");
    await user.click(addListBtn);

    const input = screen.getByPlaceholderText(/リスト名/) as HTMLInputElement;
    expect(input.maxLength).toBe(15);
    expect(screen.getByText("0/15")).toBeInTheDocument();

    await user.type(input, "読書リスト{Enter}");

    expect(screen.getByRole("heading", { name: "読書リスト" })).toBeInTheDocument();
  });
});
