/**
 * src/test/ShiftGoogleAdjustModal.test.tsx
 * ShiftGoogleAdjustModal の単体テスト
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ShiftGoogleAdjustModal } from "../components/calendar/ShiftGoogleAdjustModal";
import type { CalendarEvent } from "../types";
import { DEFAULT_PM_SETTINGS } from "../services/pmCycleService";
import * as googleSync from "../services/googleCalendarSync";

vi.mock("../services/googleCalendarSync", () => ({
  batchUpdateShiftEvents: vi.fn().mockResolvedValue(undefined),
}));

describe("ShiftGoogleAdjustModal コンポーネント", () => {
  const mockEvents: CalendarEvent[] = [
    {
      id: "ev-1",
      title: "早番(6時)",
      date: "2026-09-17",
      startTime: "06:00",
      endTime: "15:00",
      note: "",
      createdAt: null,
    },
    {
      id: "ev-2",
      title: "早番(6時)",
      date: "2026-09-18",
      startTime: "06:00",
      endTime: "15:00",
      note: "",
      createdAt: null,
    },
    {
      id: "ev-3",
      title: "早番(6時)",
      date: "2026-09-19",
      startTime: "06:00",
      endTime: "15:00",
      note: "",
      createdAt: null,
    },
    {
      id: "ev-4",
      title: "早番(6時)",
      date: "2026-09-20",
      startTime: "06:00",
      endTime: "15:00",
      note: "",
      createdAt: null,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("モーダルが正常にレンダリングされ、出勤日一覧とプリセットが表示されること", () => {
    render(
      <ShiftGoogleAdjustModal
        isOpen={true}
        today="2026-09-17"
        events={mockEvents}
        pmSettings={DEFAULT_PM_SETTINGS}
        accessToken="mock-token"
        isGoogleSignedIn={true}
        onGoogleSignIn={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByRole("heading", { name: "シフト調整" })).toBeInTheDocument();
    expect(screen.getByText("今のサイクル")).toBeInTheDocument();
    expect(screen.getByText("次のサイクル")).toBeInTheDocument();
    expect(screen.getByText("5時")).toBeInTheDocument();
    expect(screen.getByText("日勤")).toBeInTheDocument();
  });

  it("「日勤」を選択すると時間の記入欄（開始・終了）が表示されること", async () => {
    const user = userEvent.setup();
    render(
      <ShiftGoogleAdjustModal
        isOpen={true}
        today="2026-09-17"
        events={mockEvents}
        pmSettings={DEFAULT_PM_SETTINGS}
        accessToken="mock-token"
        isGoogleSignedIn={true}
        onGoogleSignIn={vi.fn()}
        onClose={vi.fn()}
      />
    );

    // 最初は日勤の入力欄がない
    expect(screen.queryByLabelText("日勤の開始時刻")).not.toBeInTheDocument();

    // 「日勤」ボタンをクリック
    const nikkinBtn = screen.getByRole("button", { name: /日勤/ });
    await user.click(nikkinBtn);

    // 時間記入欄が表示される
    expect(screen.getByLabelText("日勤の開始時刻")).toBeInTheDocument();
    expect(screen.getByLabelText("日勤の終了時刻")).toBeInTheDocument();
    expect(screen.getByLabelText("日勤の開始時刻")).toHaveValue("08:30");
    expect(screen.getByLabelText("日勤の終了時刻")).toHaveValue("17:30");
  });

  it("出勤日を個別に選択・解除でき、選択した日のみbatchUpdateShiftEventsに渡されること", async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();

    render(
      <ShiftGoogleAdjustModal
        isOpen={true}
        today="2026-09-17"
        events={mockEvents}
        pmSettings={DEFAULT_PM_SETTINGS}
        accessToken="mock-token"
        isGoogleSignedIn={true}
        onGoogleSignIn={vi.fn()}
        onClose={handleClose}
      />
    );

    // 「すべて解除」をクリックして一度全解除
    const toggleAllBtn = screen.getByText("すべて解除");
    await user.click(toggleAllBtn);

    // 0日選択状態なのでボタンは無効
    const submitBtn = screen.getByRole("button", { name: /変更する日を選択してください/ });
    expect(submitBtn).toBeDisabled();

    // 1日目（9/17）のカードをクリックして選択
    const day1Card = screen.getByText(/9\/17/);
    await user.click(day1Card);

    // 「5時30分」プリセットを選択
    const presetBtn = screen.getByRole("button", { name: /5時30分/ });
    await user.click(presetBtn);

    // ボタンが有効になり、1日分更新のラベルになる
    const updateBtn = screen.getByRole("button", { name: /「5時30分」で更新する \(1日分\)/ });
    expect(updateBtn).toBeEnabled();

    // 更新実行
    await user.click(updateBtn);

    // batchUpdateShiftEvents が 9/17 のみ渡されて呼び出されること
    expect(googleSync.batchUpdateShiftEvents).toHaveBeenCalledWith(
      "mock-token",
      ["2026-09-17"],
      expect.objectContaining({
        title: "早番(5:30)",
        startTime: "05:30",
        endTime: "14:30",
      }),
      mockEvents
    );
  });

  it("日勤で入力した時間（例: 09:00〜18:00）で更新できること", async () => {
    const user = userEvent.setup();

    render(
      <ShiftGoogleAdjustModal
        isOpen={true}
        today="2026-09-17"
        events={mockEvents}
        pmSettings={DEFAULT_PM_SETTINGS}
        accessToken="mock-token"
        isGoogleSignedIn={true}
        onGoogleSignIn={vi.fn()}
        onClose={vi.fn()}
      />
    );

    // 「日勤」を選択
    const nikkinBtn = screen.getByRole("button", { name: /日勤/ });
    await user.click(nikkinBtn);

    // 時間を変更
    const startInput = screen.getByLabelText("日勤の開始時刻");
    const endInput = screen.getByLabelText("日勤の終了時刻");

    fireEvent.change(startInput, { target: { value: "09:00" } });
    fireEvent.change(endInput, { target: { value: "18:00" } });

    // 更新ボタンをクリック
    const updateBtn = screen.getByRole("button", { name: /「日勤」で更新する/ });
    await user.click(updateBtn);

    // 変更した時刻でbatchUpdateShiftEventsが呼ばれること
    expect(googleSync.batchUpdateShiftEvents).toHaveBeenCalledWith(
      "mock-token",
      expect.any(Array),
      expect.objectContaining({
        title: "日勤",
        startTime: "09:00",
        endTime: "18:00",
      }),
      mockEvents
    );
  });
});
