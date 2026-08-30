/**
 * src/test/Dashboard.test.tsx
 * Dashboard コンポーネントのタブ遷移・ナビゲーション連携 & 文言統一テスト
 */
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { onSnapshot } from "firebase/firestore";
import Dashboard from "../components/Dashboard";

describe("Dashboard コンポーネント", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (onSnapshot as Mock).mockImplementation((_query: unknown, callback: (snap: unknown) => void) => {
      callback({ docs: [], exists: () => false, data: () => ({}) });
      return vi.fn();
    });
  });

  it("各タイルのヘッダーボタン文言が正しく、「を開く」が含まれていないこと", () => {
    render(<Dashboard />);

    // 「を開く」が含まれていないこと
    expect(screen.queryByText(/を開く/)).not.toBeInTheDocument();
    expect(screen.queryByText("リストを開く")).not.toBeInTheDocument();
    expect(screen.queryByText("ノートを開く")).not.toBeInTheDocument();
    expect(screen.queryByText("タスク一覧")).not.toBeInTheDocument();

    // 各ボタンが存在すること
    expect(screen.getByRole("button", { name: "カレンダー" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "タスク" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "レシピ" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ノート" })).toBeInTheDocument();
  });

  it("各タイルのヘッダーボタンクリック時に onNavigate が正しく呼び出されること", async () => {
    const user = userEvent.setup();
    const handleNavigate = vi.fn();

    render(<Dashboard onNavigate={handleNavigate} />);

    // カレンダーボタン
    await user.click(screen.getByRole("button", { name: "カレンダー" }));
    expect(handleNavigate).toHaveBeenCalledWith("calendar");

    // タスクボタン
    await user.click(screen.getByRole("button", { name: "タスク" }));
    expect(handleNavigate).toHaveBeenCalledWith("tasks");

    // レシピボタン
    await user.click(screen.getByRole("button", { name: "レシピ" }));
    expect(handleNavigate).toHaveBeenCalledWith("recipes");

    // ノートボタン
    await user.click(screen.getByRole("button", { name: "ノート" }));
    expect(handleNavigate).toHaveBeenCalledWith("notes");
  });

  it("ダッシュボード上から「＋」ボタンで新規タスクグループ（リスト）を追加できること", async () => {
    const user = userEvent.setup();
    render(<Dashboard />);

    const addBtn = screen.getByTestId("dashboard-add-list-btn");
    await user.click(addBtn);

    expect(screen.getByText("新しいリストを作成")).toBeInTheDocument();
    const input = screen.getByPlaceholderText(/リスト名/);
    await user.type(input, "出張準備{Enter}");

    expect(screen.getByText("出張準備")).toBeInTheDocument();
  });

  it("最近のノート行をクリックした際に onSelectNote が正しく noteId で呼び出されること", async () => {
    const user = userEvent.setup();
    const handleSelectNote = vi.fn();

    // ノートのモックデータを返すように設定
    (onSnapshot as Mock).mockImplementation((_q: unknown, callback: (snap: unknown) => void) => {
      callback({
        docs: [
          {
            id: "note-123",
            data: () => ({
              title: "テスト用ノート",
              content: "ノートの本文です",
              tags: ["test"],
              createdAt: { toDate: () => new Date() },
              updatedAt: { toDate: () => new Date() },
            }),
          },
        ],
      });
      return vi.fn();
    });

    render(<Dashboard onSelectNote={handleSelectNote} />);

    const noteItems = screen.getAllByText("テスト用ノート");
    expect(noteItems.length).toBeGreaterThan(0);

    await user.click(noteItems[noteItems.length - 1]);
    expect(handleSelectNote).toHaveBeenCalledWith("note-123");
  });

  it("ヘッダーにシフト状態バッジが表示され、クリックで出勤ステータス確認モーダルが開くこと", async () => {
    const user = userEvent.setup();
    render(<Dashboard />);

    const badge = screen.getByTestId("dashboard-shift-badge");
    expect(badge).toBeInTheDocument();
    expect(badge.textContent).toContain("休日");

    await user.click(badge);
    expect(screen.getByText("出勤ステータス確認")).toBeInTheDocument();
    expect(screen.getByText("✦ 出勤日")).toBeInTheDocument();
    expect(screen.getByText("🌙 休日（休み）")).toBeInTheDocument();
  });

  it("無題の空ノートおよび削除済みノート（isDeleted: true）はダッシュボードに表示されないこと", () => {
    (onSnapshot as Mock).mockImplementation((q: any, callback: (snap: unknown) => void) => {
      const isNotesQuery = q?._query?.path?.segments?.includes("notes") || JSON.stringify(q || {}).includes("notes");
      
      if (isNotesQuery) {
        callback({
          docs: [
            {
              id: "note-empty",
              data: () => ({
                title: "",
                content: "",
                isDeleted: false,
              }),
            },
            {
              id: "note-deleted",
              data: () => ({
                title: "削除されたノート",
                content: "本文",
                isDeleted: true,
              }),
            },
            {
              id: "note-valid",
              data: () => ({
                title: "有効なノート",
                content: "有効な本文",
                isDeleted: false,
              }),
            },
          ],
        });
      } else {
        callback({ docs: [] });
      }
      return vi.fn();
    });

    render(<Dashboard />);
    expect(screen.getByText("有効なノート")).toBeInTheDocument();
    expect(screen.queryByText("削除されたノート")).not.toBeInTheDocument();
    expect(screen.queryByText("無題のノート")).not.toBeInTheDocument();
  });

  it("料理レシピタイルにレシピデータが表示されること", () => {
    (onSnapshot as Mock).mockImplementation((q: any, callback: (snap: unknown) => void) => {
      const isRecipesQuery = q?._query?.path?.segments?.includes("recipes") || JSON.stringify(q || {}).includes("recipes");

      if (isRecipesQuery) {
        callback({
          docs: [
            {
              id: "recipe-1",
              data: () => ({
                title: "濃厚カルボナーラ",
                favorite: true,
                servings: "2人前",
                ingredients: [{ name: "パスタ", amount: "100g" }],
                isDeleted: false,
              }),
            },
          ],
        });
      } else {
        callback({ docs: [] });
      }
      return vi.fn();
    });

    render(<Dashboard />);
    expect(screen.getByText("濃厚カルボナーラ")).toBeInTheDocument();
    expect(screen.getByText("料理レシピ")).toBeInTheDocument();
  });

  it("isShiftOnly な予定（出勤予定カレンダー由来）は今日の予定タイルに表示されないこと", () => {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    (onSnapshot as Mock).mockImplementation((q: any, callback: (snap: unknown) => void) => {
      const isEventsQuery = q?._query?.path?.segments?.includes("events") || JSON.stringify(q || {}).includes("events");

      if (isEventsQuery) {
        callback({
          docs: [
            {
              id: "event-regular",
              data: () => ({
                title: "ミーティング",
                date: todayStr,
                startTime: "10:00",
                isShiftOnly: false,
              }),
            },
            {
              id: "event-shift-only",
              data: () => ({
                title: "遅番(15時)",
                date: todayStr,
                startTime: "15:00",
                isShiftOnly: true,
              }),
            },
          ],
        });
      } else {
        callback({ docs: [] });
      }
      return vi.fn();
    });

    render(<Dashboard />);
    expect(screen.getByText("ミーティング")).toBeInTheDocument();
    expect(screen.queryByText("遅番(15時)")).not.toBeInTheDocument();
  });

  it("ダッシュボードのタスクタイルに通常タスクのみが表示され、PMタスク項目が混在しないこと", () => {
    (onSnapshot as Mock).mockImplementation((q: any, callback: (snap: unknown) => void) => {
      const isTasksQuery = q?._query?.path?.segments?.includes("tasks") || JSON.stringify(q || {}).includes("tasks");

      if (isTasksQuery) {
        callback({
          docs: [
            {
              id: "task-1",
              data: () => ({
                title: "牛乳を買う",
                completed: false,
                listId: "default",
                dueDate: new Date().toISOString().slice(0, 10),
              }),
            },
            {
              id: "task-2",
              data: () => ({
                title: "部屋の片付け",
                completed: false,
                listId: "default",
                dueDate: null,
              }),
            },
          ],
        });
      } else {
        callback({ docs: [] });
      }
      return vi.fn();
    });

    render(<Dashboard />);

    // 通常タスクが表示されていること
    expect(screen.getByText("牛乳を買う")).toBeInTheDocument();
    expect(screen.getByText("部屋の片付け")).toBeInTheDocument();

    // PM項目が混在しないこと
    expect(screen.queryByText("PM 休日")).not.toBeInTheDocument();
    expect(screen.queryByText("PM 出勤")).not.toBeInTheDocument();
  });
});
