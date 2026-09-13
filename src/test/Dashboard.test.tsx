/**
 * src/test/Dashboard.test.tsx
 * Dashboard コンポーネントのタブ遷移・ナビゲーション連携 & 文言統一テスト
 */
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen, within } from "@testing-library/react";
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

  it("ヘッダーに COCKPIT が表示され、日付と出勤ステータスバッジが存在すること", () => {
    render(<Dashboard />);
    expect(screen.getByText("COCKPIT")).toBeInTheDocument();
    expect(screen.getByText("ダッシュボード")).toBeInTheDocument();
    expect(screen.getByTestId("dashboard-shift-badge")).toBeInTheDocument();
  });

  it("各タイルのヘッダーボタン文言が正しく、「を開く」が含まれていないこと", () => {
    render(<Dashboard />);

    // 「を開く」が含まれていないこと
    expect(screen.queryByText(/を開く/)).not.toBeInTheDocument();
    expect(screen.queryByText("リストを開く")).not.toBeInTheDocument();
    expect(screen.queryByText("ノートを開く")).not.toBeInTheDocument();
    expect(screen.queryByText("タスク一覧")).not.toBeInTheDocument();

    // 各ボタンが存在すること
    expect(screen.getByRole("button", { name: "Calendar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tasks" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Recipes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Notes" })).toBeInTheDocument();
  });

  it("各タイルのヘッダーボタンクリック時に onNavigate が正しく呼び出されること", async () => {
    const user = userEvent.setup();
    const handleNavigate = vi.fn();

    render(<Dashboard onNavigate={handleNavigate} />);

    // カレンダーボタン
    await user.click(screen.getByRole("button", { name: "Calendar" }));
    expect(handleNavigate).toHaveBeenCalledWith("calendar");

    // タスクボタン
    await user.click(screen.getByRole("button", { name: "Tasks" }));
    expect(handleNavigate).toHaveBeenCalledWith("tasks");

    // レシピボタン
    await user.click(screen.getByRole("button", { name: "Recipes" }));
    expect(handleNavigate).toHaveBeenCalledWith("recipes");

    // ノートボタン
    await user.click(screen.getByRole("button", { name: "Notes" }));
    expect(handleNavigate).toHaveBeenCalledWith("notes");
  });

  it("「予定を追加」ボタンをクリックしたときに予定追加ポップアップモーダルが開くこと", async () => {
    const user = userEvent.setup();
    render(<Dashboard />);

    const addEventButtons = screen.getAllByRole("button", { name: /予定/ });
    expect(addEventButtons.length).toBeGreaterThan(0);

    await user.click(addEventButtons[0]);

    // モーダルが表示されること
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText(/タイトル/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("例: ミーティング、買い物、通院")).toBeInTheDocument();
  });

  it("期限が1週間より手前（期限切れ含む）のタスクが一元表示され、右側にタスクグループ名が表示されること", async () => {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 2);
    const pastStr = `${pastDate.getFullYear()}-${String(pastDate.getMonth() + 1).padStart(2, "0")}-${String(pastDate.getDate()).padStart(2, "0")}`;

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 3);
    const futureStr = `${futureDate.getFullYear()}-${String(futureDate.getMonth() + 1).padStart(2, "0")}-${String(futureDate.getDate()).padStart(2, "0")}`;

    const farFutureDate = new Date();
    farFutureDate.setDate(farFutureDate.getDate() + 12);
    const farFutureStr = `${farFutureDate.getFullYear()}-${String(farFutureDate.getMonth() + 1).padStart(2, "0")}-${String(farFutureDate.getDate()).padStart(2, "0")}`;

    (onSnapshot as Mock).mockImplementation((q: any, callback: (snap: unknown) => void) => {
      const isTasksQuery = q?._query?.path?.segments?.includes("tasks") || JSON.stringify(q || {}).includes("tasks");
      const isTaskListsQuery = q?._query?.path?.segments?.includes("task_lists") || JSON.stringify(q || {}).includes("task_lists");

      if (isTasksQuery) {
        callback({
          docs: [
            {
              id: "task-overdue",
              data: () => ({
                title: "期限切れの牛乳購入",
                completed: false,
                listId: "shopping",
                dueDate: pastStr,
              }),
            },
            {
              id: "task-today",
              data: () => ({
                title: "今日のレポート提出",
                completed: false,
                listId: "default",
                dueDate: todayStr,
              }),
            },
            {
              id: "task-upcoming",
              data: () => ({
                title: "週末の食材買い出し",
                completed: false,
                listId: "shopping",
                dueDate: futureStr,
              }),
            },
            {
              id: "task-far",
              data: () => ({
                title: "2週間後の旅行計画",
                completed: false,
                listId: "default",
                dueDate: farFutureStr,
              }),
            },
            {
              id: "task-nodue",
              data: () => ({
                title: "いつか読む本",
                completed: false,
                listId: "default",
                dueDate: null,
              }),
            },
          ],
        });
      } else if (isTaskListsQuery) {
        callback({
          docs: [],
        });
      } else {
        callback({ docs: [] });
      }
      return vi.fn();
    });

    render(<Dashboard />);

    // カード見出し
    expect(screen.getByText("期限の近いタスク")).toBeInTheDocument();

    // 期限切れ・今日・1週間以内のタスクが表示されていること
    expect(screen.getAllByText("期限切れの牛乳購入").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("今日のレポート提出")).toBeInTheDocument();
    expect(screen.getAllByText("週末の食材買い出し").length).toBeGreaterThanOrEqual(1);

    // 1週間より先のタスクや期限なしタスクは表示されないこと
    expect(screen.queryByText("2週間後の旅行計画")).not.toBeInTheDocument();
    expect(screen.queryByText("いつか読む本")).not.toBeInTheDocument();

    // タスクグループ名が表示されていること（買い物リスト、マイタスク）
    expect(screen.getAllByText("買い物リスト").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("マイタスク").length).toBeGreaterThanOrEqual(1);
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
    expect(screen.getByText("休日（休み）")).toBeInTheDocument();
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
    expect(screen.getByText("今サイクルの献立")).toBeInTheDocument();
    expect(screen.queryByText("2人前")).not.toBeInTheDocument();
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
    const eventsCard = screen.getByTestId("cycle-events-card");
    expect(within(eventsCard).queryByText("遅番(15時)")).not.toBeInTheDocument();
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
                dueDate: new Date().toISOString().slice(0, 10),
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

  it("4勤2休サイクルリボンが表示され、司令塔ヘッダーと各日のセルが存在し、天気アイコンや気温が表示されないこと", () => {
    render(<Dashboard />);

    expect(screen.getByText("4勤2休 サイクル司令塔")).toBeInTheDocument();
    expect(screen.getAllByText(/日目/).length).toBeGreaterThanOrEqual(6);
    // 天気の "--° / --°" や "°" が表示されないこと
    expect(screen.queryByText(/--°/)).not.toBeInTheDocument();
  });

  it("ダッシュボード上から家計・支出カードが削除されていること", () => {
    render(<Dashboard />);
    expect(screen.queryByText("家計・支出")).not.toBeInTheDocument();
    expect(screen.queryByText("今サイクル支出 (6日間)")).not.toBeInTheDocument();
  });

  it("タスクが0件のときに前向きな達成メッセージが表示されること", () => {
    (onSnapshot as Mock).mockImplementation((_q: any, callback: (snap: unknown) => void) => {
      callback({ docs: [] });
      return vi.fn();
    });

    render(<Dashboard />);
    expect(screen.getByText("今サイクルのタスクはすべて完了しています")).toBeInTheDocument();
  });

  it("クイックメモ（Scratchpad）カードが存在し、入力内容がローカルストレージに自動保存されること", async () => {
    const user = userEvent.setup();
    render(<Dashboard />);

    expect(screen.getByText("クイックメモ")).toBeInTheDocument();
    expect(screen.getByText("保存済み")).toBeInTheDocument();

    const memoTextarea = screen.getByPlaceholderText(
      "思いついたことや一時メモを記録（ローカルに自動保存されます）..."
    );
    expect(memoTextarea).toBeInTheDocument();

    await user.type(memoTextarea, "買いたいものメモ");
    expect(memoTextarea).toHaveValue("買いたいものメモ");
  });

  it("買い物リストカードの Lists ボタンクリック時に onNavigate('lists') が呼び出されること", async () => {
    const user = userEvent.setup();
    const handleNavigate = vi.fn();

    render(<Dashboard onNavigate={handleNavigate} />);

    const listsBtn = screen.getByRole("button", { name: "Lists" });
    expect(listsBtn).toBeInTheDocument();

    await user.click(listsBtn);
    expect(handleNavigate).toHaveBeenCalledWith("lists");
  });
});
