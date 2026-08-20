/**
 * src/test/Tasks.test.tsx
 * Tasks コンポーネントのインテグレーションテスト
 */
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  onSnapshot,
  addDoc,
  updateDoc,
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
    vi.resetAllMocks();
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
    (getDocs as Mock).mockResolvedValue({ docs: [] });
  });

  // ─── 表示テスト ───

  it("ヘッダー「タスク」が表示される", () => {
    render(<Tasks />);
    expect(screen.getByText("タスク")).toBeInTheDocument();
  });

  it("空状態で「タスクはありません」を表示する", () => {
    render(<Tasks />);
    expect(screen.getByText("タスクはありません")).toBeInTheDocument();
  });

  it("タスクがある場合リストに表示する", () => {
    mockSnapshot([
      {
        id: "t1",
        data: { title: "牛乳を買う", dueDate: null, completed: false, createdAt: null },
      },
      {
        id: "t2",
        data: { title: "部屋の掃除", dueDate: "2026-08-20", completed: false, createdAt: null },
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
        data: { title: "完了タスク", dueDate: null, completed: true, createdAt: null },
      },
      {
        id: "t2",
        data: { title: "未完了タスク", dueDate: null, completed: false, createdAt: null },
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
        data: { title: "レポート提出", dueDate: "2026-08-20", completed: false, createdAt: null },
      },
    ]);
    render(<Tasks />);
    expect(screen.getByText("レポート提出")).toBeInTheDocument();
    expect(screen.getByText(/8月20日|明日|今日|昨日/)).toBeInTheDocument();
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

    const item = screen.getByText("トグルテスト");
    await user.click(item);

    await waitFor(() => {
      expect(updateDoc).toHaveBeenCalledTimes(1);
      const callArg = (updateDoc as Mock).mock.calls[0][1];
      expect(callArg.completed).toBe(true);
    });
  });

  it("完了済みタスクをクリックすると completed: false になる", async () => {
    mockSnapshot([
      {
        id: "t1",
        data: { title: "完了タスク", dueDate: null, completed: true, createdAt: null },
      },
    ]);
    const user = userEvent.setup();
    render(<Tasks />);

    const item = screen.getByText("完了タスク");
    await user.click(item);

    await waitFor(() => {
      const callArg = (updateDoc as Mock).mock.calls[0][1];
      expect(callArg.completed).toBe(false);
    });
  });

  // ─── サブタスク機能テスト ───

  it("サブタスクがある場合、進捗ピルバッジ（例: 1/2）が表示される", () => {
    mockSnapshot([
      {
        id: "t1",
        data: {
          title: "企画書作成",
          dueDate: null,
          completed: false,
          subtasks: [
            { id: "s1", title: "リサーチ", completed: true },
            { id: "s2", title: "構成案", completed: false },
          ],
          createdAt: null,
        },
      },
    ]);
    render(<Tasks />);
    expect(screen.getByText("1/2")).toBeInTheDocument();
  });

  it("サブタスク展開ボタンを押してインラインでサブタスクを追加できる", async () => {
    mockSnapshot([
      {
        id: "t1",
        data: {
          title: "部屋の片付け",
          dueDate: null,
          completed: false,
          subtasks: [],
          createdAt: null,
        },
      },
    ]);
    const user = userEvent.setup();
    render(<Tasks />);

    const chevronBtn = screen.getByTitle("サブタスクを開く");
    await user.click(chevronBtn);

    const subtaskInput = screen.getByPlaceholderText(/サブタスクを追加…/);
    await user.type(subtaskInput, "ゴミ出し{Enter}");

    await waitFor(() => {
      expect(updateDoc).toHaveBeenCalledTimes(1);
      const callArg = (updateDoc as Mock).mock.calls[0][1];
      expect(callArg.subtasks).toHaveLength(1);
      expect(callArg.subtasks[0].title).toBe("ゴミ出し");
    });
  });

  it("サブタスクの完了チェックをトグルできる", async () => {
    mockSnapshot([
      {
        id: "t1",
        data: {
          title: "旅行計画",
          dueDate: null,
          completed: false,
          subtasks: [{ id: "s1", title: "ホテル予約", completed: false }],
          createdAt: null,
        },
      },
    ]);
    const user = userEvent.setup();
    render(<Tasks />);

    await user.click(screen.getByTitle("サブタスクを開く"));

    const subItem = screen.getByText("ホテル予約");
    await user.click(subItem);

    await waitFor(() => {
      expect(updateDoc).toHaveBeenCalledTimes(1);
      const callArg = (updateDoc as Mock).mock.calls[0][1];
      expect(callArg.subtasks[0].completed).toBe(true);
    });
  });

  // ─── サブタスク分解テスト（Gemini連携） ───

  it("「分解」ボタンをクリックしてAIサブタスクを一括展開できる", async () => {
    const { breakdownTask } = await import("../lib/aetherCore");
    (breakdownTask as Mock).mockResolvedValue([
      "サブタスク1: 資料集め",
      "サブタスク2: スライド作成",
    ]);

    mockSnapshot([
      {
        id: "t1",
        data: { title: "プレゼン準備", dueDate: "2026-08-25", completed: false, subtasks: [], createdAt: null },
      },
    ]);
    const user = userEvent.setup();
    render(<Tasks />);

    const breakdownBtn = screen.getByTestId("task-breakdown-btn");
    await user.click(breakdownBtn);

    await waitFor(() => {
      expect(breakdownTask).toHaveBeenCalledWith("プレゼン準備");
      expect(updateDoc).toHaveBeenCalledTimes(1);
      const callArg = (updateDoc as Mock).mock.calls[0][1];
      expect(callArg.subtasks).toHaveLength(2);
      expect(callArg.subtasks[0].title).toBe("サブタスク1: 資料集め");
      expect(callArg.subtasks[1].title).toBe("サブタスク2: スライド作成");
    });
  });

  // ─── Google Tasks 同期 & 期限連携テスト ───

  it("Google Tasks から期限付きタスクを同期した際、dueDate にマッピングされて登録される", async () => {
    const { getTaskLists, getTasks } = await import("../lib/googleTasks");
    (useGoogleAuth as Mock).mockReturnValue({
      accessToken: "mock-token",
      isSignedIn: true,
      isReady: true,
      signIn: vi.fn(),
      signOut: vi.fn(),
    });

    (getTaskLists as Mock).mockResolvedValue([
      { id: "list-default", title: "My Tasks" },
    ]);
    (getTasks as Mock).mockResolvedValue([
      {
        id: "gtask-100",
        title: "Googleタスク期限付き",
        status: "needsAction",
        due: "2026-08-30T00:00:00.000Z",
      },
    ]);

    (getDocs as Mock).mockResolvedValue({ docs: [] });

    render(<Tasks />);

    await waitFor(() => {
      expect(addDoc).toHaveBeenCalled();
      const callArg = (addDoc as Mock).mock.calls[0][1];
      expect(callArg.title).toBe("Googleタスク期限付き");
      expect(callArg.dueDate).toBe("2026-08-30");
      expect(callArg.googleTaskId).toBe("gtask-100");
    });
  });

  // ─── 自然言語タスク入力推論テスト ───

  it("自然言語から期日と優先度が推論され、追加時に自動反映される", async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;

    const { parseTaskInput } = await import("../lib/aetherCore");
    (parseTaskInput as Mock).mockResolvedValue({
      title: "書類提出",
      dueDate: tomorrowStr,
      priority: "high",
    });

    const user = userEvent.setup();
    render(<Tasks />);

    const input = screen.getByPlaceholderText(/タスクを追加…/);
    await user.type(input, "明日までに書類提出 #高");

    // debounce 後に parseTaskInput が呼ばれ、プレビューが表示される
    await waitFor(() => {
      expect(parseTaskInput).toHaveBeenCalledWith("明日までに書類提出 #高");
      expect(screen.getByText("高")).toBeInTheDocument();
      expect(screen.getByText("明日")).toBeInTheDocument();
    });

    const addBtn = screen.getByText("追加");
    await user.click(addBtn);

    await waitFor(() => {
      expect(addDoc).toHaveBeenCalledTimes(1);
      const callArg = (addDoc as Mock).mock.calls[0][1];
      expect(callArg.title).toBe("書類提出");
      expect(callArg.dueDate).toBe(tomorrowStr);
      expect(callArg.priority).toBe("high");
    });
  });
});
