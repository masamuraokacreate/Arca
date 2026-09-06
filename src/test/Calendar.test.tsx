/**
 * src/test/Calendar.test.tsx
 * Calendar コンポーネントのインテグレーションテスト
 */
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  collection,
  query,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import { useGoogleAuth } from "../hooks/useGoogleAuth";
import Calendar from "../components/Calendar";

// ─── ヘルパー: コレクション名でデータを振り分けるモック ───
function mockSnapshot(
  eventsData: { id: string; data: object }[],
  tasksData: { id: string; data: object }[] = []
) {
  (collection as Mock).mockImplementation((_db, path) => path);
  (query as Mock).mockImplementation((col) => col);

  (onSnapshot as Mock).mockImplementation((q, callback) => {
    if (typeof q === "object" && q !== null && "path" in q && ((q as any).path?.includes?.("pm_settings") || (q as any).path?.includes?.("shift_settings"))) {
      callback({
        exists: () => false,
        data: () => ({}),
      });
      return vi.fn();
    }
    const docs = q === "events" ? eventsData : tasksData;
    callback({
      docs: docs.map((d) => ({
        id: d.id,
        data: () => d.data,
      })),
    });
    return vi.fn();
  });
}

const _t = new Date();
const TODAY = `${_t.getFullYear()}-${String(_t.getMonth() + 1).padStart(2, "0")}-${String(_t.getDate()).padStart(2, "0")}`;

const makeEvent = (title: string) => ({
  id: "e1",
  data: { title, date: TODAY, startTime: "", endTime: "", note: "", createdAt: null },
});

describe("Calendar コンポーネント", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useGoogleAuth as Mock).mockReturnValue({
      accessToken: null,
      isSignedIn: false,
      isReady: true,
      signIn: vi.fn(),
      signOut: vi.fn(),
    });
    (addDoc as Mock).mockResolvedValue({ id: "new-event-id" });
    (updateDoc as Mock).mockResolvedValue(undefined);
    (deleteDoc as Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  // ─── 表示テスト ───

  it("ヘッダー「カレンダー」が表示される", () => {
    mockSnapshot([], []);
    render(<Calendar />);
    expect(screen.getByText("カレンダー")).toBeInTheDocument();
  });

  it("初期選択日の日付ラベルとシフトバッジが表示される", () => {
    mockSnapshot([], []);
    render(<Calendar />);
    const shiftBadge = screen.getByTestId("calendar-shift-badge");
    expect(shiftBadge).toBeInTheDocument();
  });

  it("曜日ヘッダー（日〜土）が表示される", () => {
    mockSnapshot([], []);
    render(<Calendar />);
    ["日", "月", "火", "水", "木", "金", "土"].forEach((w) => {
      expect(screen.getByText(w)).toBeInTheDocument();
    });
  });

  it("「予定」セクションラベルが表示される", () => {
    mockSnapshot([], []);
    render(<Calendar />);
    expect(screen.getAllByText("予定").length).toBeGreaterThanOrEqual(1);
  });

  it("予定がない場合「予定はありません」を表示", () => {
    mockSnapshot([], []);
    render(<Calendar />);
    expect(screen.getByText("予定はありません")).toBeInTheDocument();
  });

  it("予定がある場合タイトルを表示する", () => {
    mockSnapshot([makeEvent("歯医者")], []);
    render(<Calendar />);
    expect(screen.getByText("歯医者")).toBeInTheDocument();
  });

  it("タスク期限セクションが表示される", () => {
    mockSnapshot([], [
      { id: "tk1", data: { title: "レポート提出", dueDate: TODAY, completed: false } },
    ]);
    render(<Calendar />);
    expect(screen.getByText("タスク期限")).toBeInTheDocument();
    expect(screen.getByText("レポート提出")).toBeInTheDocument();
  });

  // ─── 予定追加テスト ───

  it("「予定を追加」ボタンでフォームが開き予定を追加できる", async () => {
    mockSnapshot([], []);
    const user = userEvent.setup({ delay: null });
    render(<Calendar />);
    await user.click(screen.getByText("予定を追加"));
    expect(screen.getByPlaceholderText("予定タイトル")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("予定タイトル"), "ランチMTG{Enter}");
    await waitFor(() => {
      expect(addDoc).toHaveBeenCalledTimes(1);
      expect((addDoc as Mock).mock.calls[0][1].title).toBe("ランチMTG");
      expect((addDoc as Mock).mock.calls[0][1].date).toBe(TODAY);
    });
  });

  // ─── カレンダーからのタスク追加テスト ───

  it("「今日のタスクを追加」ボタンでフォームが開き、タスクを追加すると dueDate が TODAY で tasks に保存される", async () => {
    mockSnapshot([], []);
    const user = userEvent.setup({ delay: null });
    render(<Calendar />);

    await user.click(screen.getByText("今日のタスクを追加"));
    const input = screen.getByPlaceholderText("今日のタスク名…");
    await user.type(input, "カレンダーから追加タスク{Enter}");

    await waitFor(() => {
      expect(addDoc).toHaveBeenCalledTimes(1);
      const callArg = (addDoc as Mock).mock.calls[0][1];
      expect(callArg.title).toBe("カレンダーから追加タスク");
      expect(callArg.dueDate).toBe(TODAY);
      expect(callArg.completed).toBe(false);
    });
  });

  // ─── 予定削除テスト ───

  it("削除ボタンを押すと deleteDoc が呼ばれる", async () => {
    mockSnapshot([makeEvent("削除予定")], []);
    const user = userEvent.setup({ delay: null });
    render(<Calendar />);
    const delBtn = screen.getByTitle("削除");
    await user.click(delBtn);
    await waitFor(() => {
      expect(deleteDoc).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Google 同期バッジ・連携テスト ───

  it("未ログイン時に「Google同期」ボタンが表示され、クリックで signIn が呼ばれる", async () => {
    const signInMock = vi.fn();
    (useGoogleAuth as Mock).mockReturnValue({
      accessToken: null,
      isSignedIn: false,
      isReady: true,
      signIn: signInMock,
      signOut: vi.fn(),
    });

    mockSnapshot([], []);
    const user = userEvent.setup({ delay: null });
    render(<Calendar />);

    const syncBtn = screen.getByText("Google同期");
    expect(syncBtn).toBeInTheDocument();
    await user.click(syncBtn);
    expect(signInMock).toHaveBeenCalledTimes(1);
  });

  it("ログイン時に手動同期ボタンが表示され、手動同期を実行できる", async () => {
    (useGoogleAuth as Mock).mockReturnValue({
      accessToken: "mock-token",
      isSignedIn: true,
      isReady: true,
      signIn: vi.fn(),
      signOut: vi.fn(),
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ items: [] }),
    });

    mockSnapshot([], []);
    const user = userEvent.setup({ delay: null });
    render(<Calendar />);

    await waitFor(() => {
      expect(screen.getByTitle("今すぐカレンダーを手動同期")).toBeInTheDocument();
    });

    const manualSyncBtn = screen.getByTitle("今すぐカレンダーを手動同期");
    await user.click(manualSyncBtn);
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });
  });

  it("シフト状態バッジが表示され、クリックで出勤ステータス確認モーダルが開く", async () => {
    mockSnapshot([], []);
    const user = userEvent.setup({ delay: null });
    render(<Calendar />);
    const shiftBadge = screen.getByTestId("calendar-shift-badge");
    expect(shiftBadge).toBeInTheDocument();
    expect(shiftBadge.textContent).toContain("休日");

    await user.click(shiftBadge);
    expect(screen.getByText("出勤ステータス確認")).toBeInTheDocument();
    expect(screen.getByText("✦ 出勤日")).toBeInTheDocument();
    expect(screen.getByText("休日（休み）")).toBeInTheDocument();
  });

  it("勤務イベントが存在する場合に「出勤 1日目」のバッジが表示される", () => {
    mockSnapshot([makeEvent("仕事")], []);

    render(<Calendar />);

    const shiftBadge = screen.getByTestId("calendar-shift-badge");
    expect(shiftBadge).toBeInTheDocument();
    expect(shiftBadge.textContent).toContain("出勤 1日目");
  });
});


