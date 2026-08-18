/**
 * src/test/Calendar.test.tsx
 * Calendar コンポーネントのインテグレーションテスト（v4 確定版）
 *
 * モック設計:
 *   - beforeEach で vi.resetAllMocks() + 再 mockImplementation
 *   - 編集/削除ボタンは data-testid で取得（titleより確実）
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
  // query(collection(db, "path"), ...) の結果が "path" になるようにする
  (collection as Mock).mockImplementation((_db, path) => path);
  (query as Mock).mockImplementation((col) => col);

  (onSnapshot as Mock).mockImplementation((q, callback) => {
    // q は "events" または "tasks" になる
    const docs = q === "events" ? eventsData : tasksData;
    callback({
      docs: docs.map((d) => ({
        id: d.id,
        data: () => d.data,
      })),
    });
    return vi.fn(); // unsubscribe
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
    // ★ mockSnapshot はここでは呼ばない。
    //   各テストが独自に mockSnapshot を呼ぶことで
    //   mockImplementationOnce のキューが汚染されないようにする。
    (addDoc as Mock).mockResolvedValue({ id: "new-event-id" });
    (updateDoc as Mock).mockResolvedValue(undefined);
    (deleteDoc as Mock).mockResolvedValue(undefined);
  });

  // ─── 表示テスト ───

  it("「Arca / Calendar」ヘッダーが表示される", () => {
    mockSnapshot([], []);
    render(<Calendar />);
    expect(screen.getByText("Arca / Calendar")).toBeInTheDocument();
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

  it("タスク期限がある日を選択すると「タスク期限」セクションが表示される", () => {
    mockSnapshot([], [
      { id: "tk1", data: { title: "レポート提出", dueDate: TODAY, completed: false } },
    ]);
    render(<Calendar />);
    expect(screen.getByText("タスク期限")).toBeInTheDocument();
    expect(screen.getByText("レポート提出")).toBeInTheDocument();
  });

  // ─── 予定追加テスト ───

  it("「予定を追加」ボタンでフォームが開く", async () => {
    mockSnapshot([], []);
    const user = userEvent.setup();
    render(<Calendar />);
    await user.click(screen.getByText("予定を追加"));
    expect(screen.getByPlaceholderText("予定のタイトル…")).toBeInTheDocument();
  });

  it("タイトルを入力して追加すると addDoc が呼ばれる", async () => {
    mockSnapshot([], []);
    const user = userEvent.setup();
    render(<Calendar />);
    await user.click(screen.getByText("予定を追加"));
    await user.type(screen.getByPlaceholderText("予定のタイトル…"), "ランチMTG{Enter}");
    await waitFor(() => {
      expect(addDoc).toHaveBeenCalledTimes(1);
      expect((addDoc as Mock).mock.calls[0][1].title).toBe("ランチMTG");
      expect((addDoc as Mock).mock.calls[0][1].date).toBe(TODAY);
    });
  });

  it("Escape キーでフォームが閉じる", async () => {
    mockSnapshot([], []);
    const user = userEvent.setup();
    render(<Calendar />);
    await user.click(screen.getByText("予定を追加"));
    await user.keyboard("{Escape}");
    expect(screen.queryByPlaceholderText("予定のタイトル…")).not.toBeInTheDocument();
  });

  it("空タイトルでは追加できない", async () => {
    mockSnapshot([], []);
    const user = userEvent.setup();
    render(<Calendar />);
    await user.click(screen.getByText("予定を追加"));
    await user.click(screen.getByText("追加"));
    expect(addDoc).not.toHaveBeenCalled();
  });

  // ─── 予定削除テスト ───

  it("削除ボタン（data-testid）で deleteDoc が呼ばれる", async () => {
    mockSnapshot([makeEvent("削除する予定")], []);
    const user = userEvent.setup();
    render(<Calendar />);
    // data-testid で確実に取得
    await user.click(screen.getByTestId("event-delete-btn"));
    await waitFor(() => {
      expect(deleteDoc).toHaveBeenCalledTimes(1);
    });
  });

  // ─── 予定編集テスト ───

  it("編集ボタン（data-testid）でインライン編集フォームが開く", async () => {
    mockSnapshot([makeEvent("編集テスト予定")], []);
    const user = userEvent.setup();
    render(<Calendar />);
    await user.click(screen.getByTestId("event-edit-btn"));
    expect(screen.getByDisplayValue("編集テスト予定")).toBeInTheDocument();
  });

  it("編集して保存ボタンで updateDoc が呼ばれる", async () => {
    mockSnapshot([makeEvent("元のタイトル")], []);
    const user = userEvent.setup();
    render(<Calendar />);
    await user.click(screen.getByTestId("event-edit-btn"));
    const input = screen.getByDisplayValue("元のタイトル");
    await user.clear(input);
    await user.type(input, "更新後タイトル");
    await user.click(screen.getByTitle("保存"));
    await waitFor(() => {
      expect(updateDoc).toHaveBeenCalledTimes(1);
      expect((updateDoc as Mock).mock.calls[0][1].title).toBe("更新後タイトル");
    });
  });

  it("編集中に Enter キーで保存できる", async () => {
    mockSnapshot([makeEvent("Enter保存テスト")], []);
    const user = userEvent.setup();
    render(<Calendar />);
    await user.click(screen.getByTestId("event-edit-btn"));
    await user.type(screen.getByDisplayValue("Enter保存テスト"), "{Enter}");
    await waitFor(() => {
      expect(updateDoc).toHaveBeenCalledTimes(1);
    });
  });

  it("キャンセルボタンで編集フォームが閉じる", async () => {
    mockSnapshot([makeEvent("キャンセルテスト")], []);
    const user = userEvent.setup();
    render(<Calendar />);
    await user.click(screen.getByTestId("event-edit-btn"));
    expect(screen.getByDisplayValue("キャンセルテスト")).toBeInTheDocument();
    await user.click(screen.getByTitle("キャンセル"));
    expect(screen.queryByDisplayValue("キャンセルテスト")).not.toBeInTheDocument();
  });

  // ─── 月ナビゲーションテスト ───

  it("前月ボタンで月が変わる", async () => {
    mockSnapshot([], []); // 初期 render用
    const user = userEvent.setup();
    render(<Calendar />);
    const currentMonth = new Date().getMonth();
    const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const prevLabel = ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"][prevMonth];
    await user.click(screen.getAllByRole("button")[0]);
    expect(screen.getByText(new RegExp(prevLabel))).toBeInTheDocument();
  });

  it("次月ボタンで月が変わる", async () => {
    mockSnapshot([], []); // 初期 render用
    const user = userEvent.setup();
    render(<Calendar />);
    const currentMonth = new Date().getMonth();
    const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1;
    const nextLabel = ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"][nextMonth];
    await user.click(screen.getAllByRole("button")[1]);
    expect(screen.getByText(new RegExp(nextLabel))).toBeInTheDocument();
  });
});
