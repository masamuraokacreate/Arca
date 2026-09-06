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
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
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
    (setDoc as Mock).mockResolvedValue(undefined);
    (updateDoc as Mock).mockResolvedValue(undefined);
    (deleteDoc as Mock).mockResolvedValue(undefined);
    (writeBatch as Mock).mockReturnValue({
      delete: vi.fn(),
      set: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
    });
    (getDocs as Mock).mockResolvedValue({ docs: [] });
    window.confirm = vi.fn().mockReturnValue(true);
  });

  // ─── 表示テスト ───

  it("ヘッダー「マイタスク」が表示される", () => {
    render(<Tasks />);
    expect(screen.getByRole("heading", { name: "マイタスク" })).toBeInTheDocument();
  });

  it("initialTab='tasks' や未指定時でも確実にマイタスクが選択された状態になる", () => {
    render(<Tasks initialTab="tasks" />);
    expect(screen.getByRole("heading", { name: "マイタスク" })).toBeInTheDocument();
    expect(screen.getByTestId("tab-default")).toBeInTheDocument();
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

  it("タスク名を入力して追加ボタンを押すと setDoc が呼ばれる", async () => {
    const user = userEvent.setup();
    render(<Tasks />);

    const input = screen.getByPlaceholderText(/タスクを追加…/);
    await user.type(input, "新しいタスク");

    const addBtn = screen.getByText("追加");
    await user.click(addBtn);

    await waitFor(() => {
      expect(setDoc).toHaveBeenCalledTimes(1);
    });

    const callArg = (setDoc as Mock).mock.calls[0][1];
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
      expect(setDoc).toHaveBeenCalledTimes(1);
    });
  });

  it("空文字では追加できない（setDoc が呼ばれない）", async () => {
    const user = userEvent.setup();
    render(<Tasks />);

    const addBtn = screen.getByText("追加");
    await user.click(addBtn);

    expect(setDoc).not.toHaveBeenCalled();
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
      const callArg = (setDoc as Mock).mock.calls[0][1];
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
    expect(screen.getAllByText("リサーチ").length).toBeGreaterThanOrEqual(1);

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

  it("詳細モーダル内でサブタスクを追加して保存すると、Firestoreにsubtasks配列が保存される", async () => {
    mockSnapshot([
      {
        id: "t1",
        data: {
          title: "旅行の準備",
          dueDate: null,
          completed: false,
          listId: "default",
          subtasks: [],
          createdAt: null,
        },
      },
    ]);
    const user = userEvent.setup();
    render(<Tasks />);

    await user.click(screen.getByTestId("task-item-row"));
    expect(screen.getByText("TASK DETAILS")).toBeInTheDocument();

    const subtaskInput = screen.getByPlaceholderText(/サブタスクを追加…/);
    await user.type(subtaskInput, "ホテル予約{Enter}");

    expect(screen.getByText("ホテル予約")).toBeInTheDocument();

    const saveBtn = screen.getByTestId("detail-task-save-btn");
    await user.click(saveBtn);

    await waitFor(() => {
      expect(updateDoc).toHaveBeenCalled();
      const callArg = (updateDoc as Mock).mock.calls[0][1];
      expect(callArg.subtasks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            title: "ホテル予約",
            completed: false,
          }),
        ])
      );
    });
  });

  it("詳細モーダルでサブタスク変更後に✕ボタンで閉じても自動保存される", async () => {
    mockSnapshot([
      {
        id: "t1",
        data: {
          title: "会議資料作成",
          dueDate: null,
          completed: false,
          listId: "default",
          subtasks: [],
          createdAt: null,
        },
      },
    ]);
    const user = userEvent.setup();
    render(<Tasks />);

    await user.click(screen.getByTestId("task-item-row"));

    const subtaskInput = screen.getByPlaceholderText(/サブタスクを追加…/);
    await user.type(subtaskInput, "グラフ作成{Enter}");

    // ✕ボタンをクリック
    const closeBtn = screen.getByRole("button", { name: "✕" });
    await user.click(closeBtn);

    await waitFor(() => {
      expect(updateDoc).toHaveBeenCalled();
      const callArg = (updateDoc as Mock).mock.calls[0][1];
      expect(callArg.subtasks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            title: "グラフ作成",
            completed: false,
          }),
        ])
      );
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

  it("Google連携時にカスタムリストを作成すると、カテゴリIDが Google TaskList ID に統一され見出しが表示される", async () => {
    (useGoogleAuth as Mock).mockReturnValue({
      accessToken: "mock-token",
      isSignedIn: true,
      isReady: true,
      signIn: vi.fn(),
      signOut: vi.fn(),
    });
    mockSnapshot([]);
    const user = userEvent.setup();
    render(<Tasks />);

    const addListBtn = screen.getByTestId("add-list-tab-btn");
    await user.click(addListBtn);

    const input = screen.getByPlaceholderText(/リスト名/) as HTMLInputElement;
    await user.type(input, "趣味リスト{Enter}");

    expect(screen.getByRole("heading", { name: "趣味リスト" })).toBeInTheDocument();
  });

  // ─── 完了済み一括削除 & PMSection 制御テスト ───

  it("完了済みタスクがある場合、「完了済みを一括削除」ボタンで ConfirmModal が表示され、削除を押すと即座に画面から消去（楽観的更新）されバックグラウンドで一括削除される", async () => {
    const mockBatchDelete = vi.fn();
    const mockBatchCommit = vi.fn().mockResolvedValue(undefined);
    (writeBatch as Mock).mockReturnValue({
      delete: mockBatchDelete,
      set: vi.fn(),
      commit: mockBatchCommit,
    });

    mockSnapshot([
      {
        id: "task-active",
        data: { title: "進行中タスク", completed: false, listId: "default", createdAt: null },
      },
      {
        id: "task-completed-1",
        data: { title: "完了タスク1", completed: true, listId: "default", createdAt: null },
      },
      {
        id: "task-completed-2",
        data: { title: "完了タスク2", completed: true, listId: "default", createdAt: null },
      },
    ]);
    const user = userEvent.setup();
    render(<Tasks />);

    // 「完了済み (2)」のアコーディオンを展開
    const accordionBtn = screen.getByText(/完了済み \(2\)/);
    await user.click(accordionBtn);

    // 「完了済みを一括削除」ボタンが表示される
    const clearBtn = screen.getByRole("button", { name: /完了済みを一括削除/ });
    expect(clearBtn).toBeInTheDocument();

    await user.click(clearBtn);

    // Arca のポップアップウィンドウ（ConfirmModal）が表示される
    expect(screen.getByText("完了したタスクをすべて削除しますか？")).toBeInTheDocument();
    expect(screen.getByText("完了したすべてのタスクがこのりすとから完全に削除されます。")).toBeInTheDocument();

    // 「キャンセル」ボタンを押すとモーダルが閉じ、削除は実行されない
    const cancelBtn = screen.getByRole("button", { name: "キャンセル" });
    await user.click(cancelBtn);
    expect(mockBatchDelete).not.toHaveBeenCalled();
    expect(screen.queryByText("完了したタスクをすべて削除しますか？")).not.toBeInTheDocument();

    // 再度一括削除をクリックし、今度は「削除」を押す
    await user.click(clearBtn);
    const confirmDeleteBtn = screen.getByRole("button", { name: "削除" });
    await user.click(confirmDeleteBtn);

    // ─── A. 楽観的UI更新（0ms）の検証 ───
    // ダイアログで「削除」を押した瞬間、API完了を待たずに画面から即座に対象タスクが消滅
    expect(screen.queryByText("完了タスク1")).not.toBeInTheDocument();
    expect(screen.queryByText("完了タスク2")).not.toBeInTheDocument();
    // 進行中タスクはそのまま残っていること
    expect(screen.getByText("進行中タスク")).toBeInTheDocument();

    // ─── C. 控えめなトースト通知の表示検証 ───
    expect(screen.getByText("2件の完了済みタスクを削除しました")).toBeInTheDocument();

    // ─── B. バックグラウンドバッチ削除の検証 ───
    await waitFor(() => {
      expect(mockBatchDelete).toHaveBeenCalledTimes(2);
      expect(mockBatchCommit).toHaveBeenCalledTimes(1);
    });
  });

  it("PMSection はマイタスクでのみ表示され、買い物リストなど他のタブでは表示されない", async () => {
    mockSnapshot([]);
    const user = userEvent.setup();
    render(<Tasks />);

    // マイタスク表示時は PMSection（PM作業）が存在する
    expect(screen.getByText(/PM作業/i)).toBeInTheDocument();

    // 買い物リストに切り替え
    const shoppingTab = screen.getByTestId("tab-shopping");
    await user.click(shoppingTab);

    // 買い物リスト表示時は PMSection が非表示になる
    expect(screen.queryByText(/PM作業/i)).not.toBeInTheDocument();
  });

  // ─── サブタスク インデント表示 & 開閉トグル テスト ───

  it("サブタスクを持つタスクはデフォルトでインデントされたサブタスク一覧が表示される", () => {
    mockSnapshot([
      {
        id: "t-with-subtasks",
        data: {
          title: "大型プロジェクト準備",
          completed: false,
          listId: "default",
          subtasks: [
            { id: "st-1", title: "要件ヒアリング", completed: false },
            { id: "st-2", title: "見積書作成", completed: true },
          ],
          createdAt: null,
        },
      },
    ]);

    render(<Tasks />);

    // メインタスクとサブタスク進捗バッジ
    expect(screen.getByText("大型プロジェクト準備")).toBeInTheDocument();
    expect(screen.getByText("1/2")).toBeInTheDocument();

    // デフォルトでサブタスク一覧がインデント表示されていること
    const subtaskList = screen.getByTestId("subtask-list");
    expect(subtaskList).toBeInTheDocument();
    expect(screen.getByText("要件ヒアリング")).toBeInTheDocument();
    expect(screen.getByText("見積書作成")).toBeInTheDocument();

    // 開閉ボタン（＞）が存在すること
    const collapseBtn = screen.getByTestId("subtask-collapse-btn");
    expect(collapseBtn).toBeInTheDocument();
  });

  it("開閉ボタン（＞）をクリックするとサブタスクが折りたたまれ、再度クリックすると展開される", async () => {
    mockSnapshot([
      {
        id: "t-collapsible",
        data: {
          title: "折りたたみテストタスク",
          completed: false,
          listId: "default",
          subtasks: [
            { id: "st-a", title: "サブタスクA", completed: false },
          ],
          createdAt: null,
        },
      },
    ]);
    const user = userEvent.setup();
    render(<Tasks />);

    // 初期状態: サブタスクが表示されている
    expect(screen.getByTestId("subtask-list")).toBeInTheDocument();
    expect(screen.getByText("サブタスクA")).toBeInTheDocument();

    // ＞をクリックして折りたたむ
    const collapseBtn = screen.getByTestId("subtask-collapse-btn");
    await user.click(collapseBtn);

    // サブタスクが非表示になる（しまわれる）
    expect(screen.queryByTestId("subtask-list")).not.toBeInTheDocument();
    expect(screen.queryByText("サブタスクA")).not.toBeInTheDocument();
    // 親タスクの詳細モーダルは開いていないこと
    expect(screen.queryByText("TASK DETAILS")).not.toBeInTheDocument();

    // 再度クリックして展開する
    await user.click(collapseBtn);

    // 再度サブタスクが表示される
    expect(screen.getByTestId("subtask-list")).toBeInTheDocument();
    expect(screen.getByText("サブタスクA")).toBeInTheDocument();
  });

  it("一覧上のサブタスクのチェックボタンをクリックするとサブタスクの完了状態がトグルされる", async () => {
    mockSnapshot([
      {
        id: "t-toggle-sub",
        data: {
          title: "サブタスク完了トグルタスク",
          completed: false,
          listId: "default",
          subtasks: [
            { id: "st-check", title: "チェック対象サブタスク", completed: false },
          ],
          createdAt: null,
        },
      },
    ]);
    const user = userEvent.setup();
    render(<Tasks />);

    // サブタスクのチェックボタンをクリック
    const subCheckBtn = screen.getByTestId("subtask-toggle-btn-st-check");
    await user.click(subCheckBtn);

    // FirestoreのupdateDocが呼ばれ、subtasksの該当アイテムがcompleted: trueに更新される
    expect(updateDoc).toHaveBeenCalled();
    const callArgs = (updateDoc as Mock).mock.calls;
    const lastCall = callArgs[callArgs.length - 1];
    expect(lastCall[1].subtasks).toEqual([
      { id: "st-check", title: "チェック対象サブタスク", completed: true },
    ]);

    // 親タスクの詳細モーダルは開いていないこと
    expect(screen.queryByText("TASK DETAILS")).not.toBeInTheDocument();
  });

  // ─── カスタムSVGリストアイコン & Firestore永続化 テスト ───

  it("タブバーに高品質なSVGリストアイコン（マイタスク: sparkle, 買い物リスト: cart）が表示される", () => {
    mockSnapshot([]);
    render(<Tasks />);

    // マイタスクタブに sparkle SVG アイコンが表示されていること
    const defaultTab = screen.getByTestId("tab-default");
    expect(defaultTab.querySelector('svg[aria-label="sparkle"]')).toBeInTheDocument();

    // 買い物リストタブに cart SVG アイコンが表示されていること
    const shoppingTab = screen.getByTestId("tab-shopping");
    expect(shoppingTab.querySelector('svg[aria-label="cart"]')).toBeInTheDocument();
  });

  it("新しいリスト作成時に12種類のアイコンから選択でき、Firestoreのtask_listsに選択したアイコンが保存される", async () => {
    mockSnapshot([]);
    const user = userEvent.setup();
    render(<Tasks />);

    // 「＋」追加ボタンをクリックして新規作成モーダルを開く
    const addTabBtn = screen.getByTestId("add-list-tab-btn");
    await user.click(addTabBtn);

    expect(screen.getByText("新しいリストを作成")).toBeInTheDocument();
    expect(screen.getByTestId("list-icon-picker")).toBeInTheDocument();

    // リスト名を入力
    const nameInput = screen.getByPlaceholderText(/リスト名/);
    await user.type(nameInput, "仕事プロジェクト");

    // 「briefcase（ビジネス・仕事）」アイコンを選択
    const briefcaseOpt = screen.getByTestId("icon-opt-briefcase");
    await user.click(briefcaseOpt);

    // 「作成する」ボタンを押下
    const submitBtn = screen.getByRole("button", { name: "作成する" });
    await user.click(submitBtn);

    // Firestoreの setDoc (task_lists) が呼ばれ、icon: 'briefcase' が保存されたこと
    expect(setDoc).toHaveBeenCalled();
    const setDocCalls = (setDoc as Mock).mock.calls;
    const taskListCall = setDocCalls.find((call) => {
      const data = call[1];
      return data && data.title === "仕事プロジェクト";
    });
    expect(taskListCall).toBeDefined();
    expect(taskListCall![1].icon).toBe("briefcase");

    // 新規作成されたタブに briefcase SVG アイコンが表示されていること
    const tabs = screen.getAllByText("仕事プロジェクト");
    const newTabSpan = tabs.find((el) => el.tagName === "SPAN");
    const newTab = newTabSpan?.closest("button");
    expect(newTab?.querySelector('svg[aria-label="briefcase"]')).toBeInTheDocument();
  });

  it("リスト設定モーダルでマイタスクのマークを変更して保存するとFirestoreのtask_listsが更新される", async () => {
    mockSnapshot([]);
    const user = userEvent.setup();
    render(<Tasks />);

    // マイタスクのリスト設定ボタンをクリック
    const defaultSettingsBtn = screen.getByTestId("list-settings-btn-default");
    await user.click(defaultSettingsBtn);

    // モーダルが開き、マイタスク用の案内が表示されている
    expect(screen.getByText("リスト設定")).toBeInTheDocument();
    expect(screen.getByText(/マイタスクの名称・削除は固定ですが、お好みのマークを設定できます/)).toBeInTheDocument();

    // 「flame（炎）」アイコンを選択
    const flameOpt = screen.getByTestId("icon-opt-flame");
    await user.click(flameOpt);

    // 保存ボタンをクリック
    const saveBtn = screen.getByTestId("list-settings-save-btn");
    await user.click(saveBtn);

    // Firestore に default リストの icon: 'flame' が更新保存されること
    expect(setDoc).toHaveBeenCalled();
    const setDocCalls = (setDoc as Mock).mock.calls;
    const defaultListCall = setDocCalls.find((call) => {
      const data = call[1];
      return data && data.id === "default" && data.icon === "flame";
    });
    expect(defaultListCall).toBeDefined();
    expect(defaultListCall![1].icon).toBe("flame");
  });

  it("Google同期が実行されてもFirestoreに保存されたカスタムアイコンが維持される", async () => {
    (useGoogleAuth as Mock).mockReturnValue({
      accessToken: "mock-token",
      isSignedIn: true,
      isReady: true,
      signIn: vi.fn(),
      signOut: vi.fn(),
    });

    const { getTaskLists } = await import("../lib/googleTasks");
    (getTaskLists as Mock).mockResolvedValue([
      { id: "@default", title: "My Tasks" },
      { id: "custom-glist-1", title: "学習メモ" },
    ]);

    // Firestoreのtask_listsにカスタムアイコンが保存されている状態を再現
    (onSnapshot as Mock).mockImplementation((q: unknown, callback: (snap: unknown) => void) => {
      // コレクションパスを判定
      const queryString = String(q);
      if (queryString.includes("task_lists") || typeof q === "object") {
        callback({
          docs: [
            {
              id: "custom-glist-1",
              data: () => ({ id: "custom-glist-1", icon: "book-open", title: "学習メモ" }),
            },
          ],
        });
      } else {
        callback({ docs: [] });
      }
      return vi.fn();
    });

    render(<Tasks />);

    // Googleから「学習メモ」が読み込まれ、Firestoreの「book-open」アイコンが適用されて表示されること
    await waitFor(() => {
      const tab = screen.queryByTestId("tab-custom-glist-1");
      expect(tab).toBeInTheDocument();
      expect(tab?.querySelector('svg[aria-label="book-open"]')).toBeInTheDocument();
    });
  });
});


