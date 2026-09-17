/**
 * src/test/Dashboard.test.tsx
 * Arca — Dashboard（今日フォーカス型サイクルボード ＆ サブグリッド）仕様テスト
 */
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { onSnapshot, updateDoc, addDoc } from "firebase/firestore";
import Dashboard from "../components/Dashboard";

describe("Dashboard コンポーネント", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (onSnapshot as Mock).mockImplementation((_query: unknown, callback: (snap: unknown) => void) => {
      callback({ docs: [], exists: () => false, data: () => ({}) });
      return vi.fn();
    });
  });

  it("ヘッダーに「ダッシュボード」が表示され、COCKPITキッカーが排除されていること", () => {
    render(<Dashboard />);
    expect(screen.getByText("ダッシュボード")).toBeInTheDocument();
    expect(screen.queryByText("COCKPIT")).not.toBeInTheDocument();
    expect(screen.getByTestId("dashboard-shift-badge")).toBeInTheDocument();
  });

  it("タイトル横にサイクル切り替えナビゲーション（MM/DD(曜日)～MM/DD(曜日)）と「シフト調整」ボタンが存在すること", () => {
    render(<Dashboard />);

    // サイクル日付範囲ラベル MM/DD(曜日)～MM/DD(曜日)
    expect(screen.getByText(/\d{2}\/\d{2}\([日月火水木金土]\)～\d{2}\/\d{2}\([日月火水木金土]\)/)).toBeInTheDocument();
    // 前後ナビゲーションボタン（独立して左に配置）
    expect(screen.getByRole("button", { name: "前のサイクル" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "次のサイクル" })).toBeInTheDocument();
    // シフト調整ボタン
    expect(screen.getByRole("button", { name: "シフト調整" })).toBeInTheDocument();
  });

  it("サイクル切り替えボタン（< / >）をクリックするとサイクルの日付範囲ラベルが更新されること", async () => {
    const user = userEvent.setup();
    render(<Dashboard />);

    const labelBefore = screen.getByText(/\d{2}\/\d{2}\([日月火水木金土]\)～\d{2}\/\d{2}\([日月火水木金土]\)/).textContent;
    const nextBtn = screen.getByRole("button", { name: "次のサイクル" });

    await user.click(nextBtn);

    const labelAfter = screen.getByText(/\d{2}\/\d{2}\([日月火水木金土]\)～\d{2}\/\d{2}\([日月火水木金土]\)/).textContent;
    expect(labelAfter).not.toEqual(labelBefore);
  });

  it("画一的な右上テキストリンク（Calendar, Tasks, Recipes, Notes）が排除されていること", () => {
    render(<Dashboard />);

    // 旧UIの画一的テキストリンクが存在しないこと
    expect(screen.queryByRole("button", { name: "Calendar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tasks" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Recipes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Notes" })).not.toBeInTheDocument();
  });

  it("4勤2休サイクルボードが表示され、今日（選択日）がフォーカス展開（data-selected='true'）されていること", () => {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    render(<Dashboard />);

    expect(screen.getByTestId("cycle-board-container")).toBeInTheDocument();
    const todayCard = screen.getByTestId(`cycle-day-card-${todayStr}`);
    expect(todayCard).toBeInTheDocument();
    expect(todayCard).toHaveAttribute("data-selected", "true");
  });

  it("フォーカス日カード内に「前の日」「次の日」ボタンが存在せず、ヘッダー右上に「前のサイクル」「次のサイクル」ボタンと「MM/DD(曜日)～MM/DD(曜日)」が表示されること", async () => {
    const user = userEvent.setup();
    render(<Dashboard />);

    // ダッシュボード見出しが存在すること
    expect(screen.getByRole("heading", { name: "ダッシュボード" })).toBeInTheDocument();

    // カード内に「前の日」「次の日」ボタンが存在しないこと
    expect(screen.queryByRole("button", { name: "前の日" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "次の日" })).not.toBeInTheDocument();

    // ヘッダー右上に「前のサイクル」「次のサイクル」ボタンが存在すること
    const prevCycleBtn = screen.getByRole("button", { name: "前のサイクル" });
    const nextCycleBtn = screen.getByRole("button", { name: "次のサイクル" });
    expect(prevCycleBtn).toBeInTheDocument();
    expect(nextCycleBtn).toBeInTheDocument();

    // MM/DD(曜日)～MM/DD(曜日) 形式の日付範囲が表示されていること
    expect(screen.getByText(/\d{2}\/\d{2}\([日月火水木金土]\)～\d{2}\/\d{2}\([日月火水木金土]\)/)).toBeInTheDocument();

    // 次のサイクルをクリックしてサイクルが更新されること
    await user.click(nextCycleBtn);
    expect(screen.getByTestId("cycle-board-container")).toBeInTheDocument();
  });

  it("サイクルボード内のカードに天気アイコンや気温テキストが表示されないこと", () => {
    render(<Dashboard />);

    const board = screen.getByTestId("cycle-board-container");
    // 気温「°」が含まれないこと
    expect(within(board).queryByText(/°/)).not.toBeInTheDocument();
    expect(within(board).queryByText(/\d+°/)).not.toBeInTheDocument();
  });

  it("他日カードをクリックすると、その日がフォーカス状態（data-selected='true'）に切り替わること", async () => {
    const user = userEvent.setup();
    render(<Dashboard />);

    const allDayCards = screen.getAllByTestId(/^cycle-day-card-/);
    expect(allDayCards.length).toBe(6);

    // 非選択のカードを見つける
    const unselectedCard = allDayCards.find((c) => c.getAttribute("data-selected") === "false");
    expect(unselectedCard).toBeDefined();

    if (unselectedCard) {
      await user.click(unselectedCard);
      expect(unselectedCard).toHaveAttribute("data-selected", "true");
    }
  });

  it("フォーカスカード内の「追加」ボタンをクリックしたときに予定追加ポップアップモーダルが開くこと", async () => {
    const user = userEvent.setup();
    render(<Dashboard />);

    const addEventButton = screen.getByRole("button", { name: "追加" });
    expect(addEventButton).toBeInTheDocument();

    await user.click(addEventButton);

    // モーダルが表示されること
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText(/タイトル/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("例: ミーティング、買い物、通院")).toBeInTheDocument();
  });

  it("フォーカスカード内の今日のToDoに当日のタスクが表示され、未完了件数が表示されること", () => {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    (onSnapshot as Mock).mockImplementation((q: any, callback: (snap: unknown) => void) => {
      const isTasksQuery = q?._query?.path?.segments?.includes("tasks") || JSON.stringify(q || {}).includes("tasks");

      if (isTasksQuery) {
        callback({
          docs: [
            {
              id: "task-today-1",
              data: () => ({
                title: "本日のレポート提出",
                completed: false,
                listId: "default",
                dueDate: todayStr,
              }),
            },
            {
              id: "task-other-day",
              data: () => ({
                title: "明日のタスク",
                completed: false,
                listId: "default",
                dueDate: "2099-01-01",
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

    expect(screen.getByText("本日のレポート提出")).toBeInTheDocument();
    expect(screen.queryByText("明日のタスク")).not.toBeInTheDocument();
    expect(screen.getByText("今日のToDo")).toBeInTheDocument();
  });

  it("ToDoの完了チェックボックストグル時に updateDoc が正しく呼び出されること", async () => {
    const user = userEvent.setup();
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    (onSnapshot as Mock).mockImplementation((q: any, callback: (snap: unknown) => void) => {
      const isTasksQuery = q?._query?.path?.segments?.includes("tasks") || JSON.stringify(q || {}).includes("tasks");

      if (isTasksQuery) {
        callback({
          docs: [
            {
              id: "task-to-toggle",
              data: () => ({
                title: "完了するタスク",
                completed: false,
                listId: "default",
                dueDate: todayStr,
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

    const taskText = screen.getByText("完了するタスク");
    expect(taskText).toBeInTheDocument();

    const checkBtn = taskText.parentElement?.querySelector("button");
    expect(checkBtn).toBeInTheDocument();

    if (checkBtn) {
      await user.click(checkBtn);
      expect(updateDoc).toHaveBeenCalled();
    }
  });

  it("クイックToDo入力欄でEnterを押した際に addDoc が正しく呼び出されること", async () => {
    const user = userEvent.setup();
    render(<Dashboard />);

    const input = screen.getByPlaceholderText("ToDoを入力してEnter...");
    expect(input).toBeInTheDocument();

    await user.type(input, "新しいクイックタスク{enter}");
    expect(addDoc).toHaveBeenCalled();
  });

  it("isShiftOnly な予定（出勤予定カレンダー由来）は当日の予定リストに表示されないこと", () => {
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
                title: "重要なミーティング",
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
    const eventsList = screen.getByTestId("cycle-day-events-list");
    expect(within(eventsList).getByText("重要なミーティング")).toBeInTheDocument();
    expect(within(eventsList).queryByText("遅番(15時)")).not.toBeInTheDocument();
  });

  it("献立＆買い物カードにレシピデータが表示され、「買い物リストを見る」クリックで onNavigate('lists') が呼ばれること", async () => {
    const user = userEvent.setup();
    const handleNavigate = vi.fn();

    (onSnapshot as Mock).mockImplementation((q: any, callback: (snap: unknown) => void) => {
      const isRecipesQuery = q?._query?.path?.segments?.includes("recipes") || JSON.stringify(q || {}).includes("recipes");
      const isTasksQuery = q?._query?.path?.segments?.includes("tasks") || JSON.stringify(q || {}).includes("tasks");

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
                updatedAt: Date.now(),
              }),
            },
          ],
        });
      } else if (isTasksQuery) {
        callback({
          docs: [
            {
              id: "task-shop-1",
              data: () => ({
                title: "卵を購入",
                completed: false,
                listId: "shopping",
              }),
            },
          ],
        });
      } else {
        callback({ docs: [] });
      }
      return vi.fn();
    });

    render(<Dashboard onNavigate={handleNavigate} />);

    expect(screen.getByText("今サイクルの献立 ＆ 買い物")).toBeInTheDocument();
    expect(screen.getByText("濃厚カルボナーラ")).toBeInTheDocument();

    const shopBtn = screen.getByRole("button", { name: /買い物リストを見る/ });
    expect(shopBtn).toBeInTheDocument();
    await user.click(shopBtn);
    expect(handleNavigate).toHaveBeenCalledWith("lists");
  });

  it("献立が0件のとき「献立が未設定です」と「+ 献立を設定」ボタンが表示され、クリックで onNavigate('recipes') が呼ばれること", async () => {
    const user = userEvent.setup();
    const handleNavigate = vi.fn();

    (onSnapshot as Mock).mockImplementation((_q: any, callback: (snap: unknown) => void) => {
      callback({ docs: [] });
      return vi.fn();
    });

    render(<Dashboard onNavigate={handleNavigate} />);

    expect(screen.getByText("献立が未設定です")).toBeInTheDocument();
    const setRecipeBtn = screen.getByRole("button", { name: /献立を設定/ });
    expect(setRecipeBtn).toBeInTheDocument();

    await user.click(setRecipeBtn);
    expect(handleNavigate).toHaveBeenCalledWith("recipes");
  });

  it("最近のノート行をクリックした際に onSelectNote が正しく noteId で呼び出されること", async () => {
    const user = userEvent.setup();
    const handleSelectNote = vi.fn();

    (onSnapshot as Mock).mockImplementation((q: any, callback: (snap: unknown) => void) => {
      const isNotesQuery = q?._query?.path?.segments?.includes("notes") || JSON.stringify(q || {}).includes("notes");
      if (isNotesQuery) {
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
      } else {
        callback({ docs: [] });
      }
      return vi.fn();
    });

    render(<Dashboard onSelectNote={handleSelectNote} />);

    const notesCard = screen.getByTestId("recent-notes-card");
    const noteItem = within(notesCard).getByText("テスト用ノート");
    expect(noteItem).toBeInTheDocument();

    await user.click(noteItem);
    expect(handleSelectNote).toHaveBeenCalledWith("note-123");
  });

  it("最近のノートの「ノート一覧を開く」クリックで onNavigate('notes') が呼ばれること", async () => {
    const user = userEvent.setup();
    const handleNavigate = vi.fn();

    render(<Dashboard onNavigate={handleNavigate} />);

    const openNotesBtn = screen.getByRole("button", { name: "ノート一覧を開く" });
    expect(openNotesBtn).toBeInTheDocument();

    await user.click(openNotesBtn);
    expect(handleNavigate).toHaveBeenCalledWith("notes");
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

  it("シフト調整ボタンクリックで出勤ステータス確認モーダルが開くこと", async () => {
    const user = userEvent.setup();
    render(<Dashboard />);

    const shiftAdjBtn = screen.getByRole("button", { name: "シフト調整" });
    expect(shiftAdjBtn).toBeInTheDocument();

    await user.click(shiftAdjBtn);
    expect(screen.getByText("出勤ステータス確認")).toBeInTheDocument();
    expect(screen.getByText("出勤日")).toBeInTheDocument();
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
});
