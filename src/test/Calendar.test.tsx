/**
 * src/test/Calendar.test.tsx
 * Calendar コンポーネントのインテグレーションテスト
 */
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
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
    vi.resetAllMocks();
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

  // ─── 表示テスト ───

  it("ヘッダー「カレンダー」が表示される", () => {
    mockSnapshot([], []);
    render(<Calendar />);
    expect(screen.getByText("カレンダー")).toBeInTheDocument();
  });

  it("「Today」バッジが表示される（初期選択が今日）", () => {
    mockSnapshot([], []);
    render(<Calendar />);
    expect(screen.getByText("Today")).toBeInTheDocument();
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
    expect(screen.getByText("予定")).toBeInTheDocument();
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
    const user = userEvent.setup();
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
    const user = userEvent.setup();
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
    const user = userEvent.setup();
    render(<Calendar />);
    const delBtn = screen.getByTitle("削除");
    await user.click(delBtn);
    await waitFor(() => {
      expect(deleteDoc).toHaveBeenCalledTimes(1);
    });
  });
});
