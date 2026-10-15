/**
 * src/test/ShiftOverrideModal.test.tsx
 * ShiftOverrideModal の単体・結合テスト
 *
 * 検証項目:
 *  - モーダル正常表示（タイトル、日付、現在のステータス）
 *  - 「変更を確認する」ボタン押下時に誤タップ防止の確認ポップアップが表示されること
 *  - 確認ポップアップで「戻る」を押すとキャンセルされ、onSave は実行されないこと
 *  - 確認ポップアップで「変更を反映する」を押すと onSave が正しく実行されること
 *  - 出勤日選択時のシフト名クイック選択および時間指定が反映されること
 *  - 休日選択時の確認ポップアップ表示および実行
 *  - 自動判定に戻す（リセット）の確認ポップアップ表示および実行
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ShiftOverrideModal } from "../components/calendar/ShiftOverrideModal";
import type { ShiftInfo } from "../types/shift";
import type { CalendarEvent } from "../types";

describe("ShiftOverrideModal", () => {
  const defaultShift: ShiftInfo = {
    date: "2026-10-05",
    type: "work",
    streakNumber: 1,
    shiftName: "早番",
    isOverridden: false,
  };

  const mockEvents: CalendarEvent[] = [
    {
      id: "ev-1",
      title: "早番",
      date: "2026-10-05",
      startTime: "06:00",
      endTime: "14:30",
      note: "",
      googleEventId: "gid-1",
      createdAt: null,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("isOpen=false のときは何もレンダリングされない", () => {
    const { container } = render(
      <ShiftOverrideModal
        isOpen={false}
        targetDate="2026-10-05"
        currentShift={defaultShift}
        events={mockEvents}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("isOpen=true のとき、出勤ステータス確認画面が正常に表示される", () => {
    render(
      <ShiftOverrideModal
        isOpen={true}
        targetDate="2026-10-05"
        currentShift={defaultShift}
        events={mockEvents}
        isGoogleSignedIn={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );

    expect(screen.getByText("出勤ステータス確認")).toBeInTheDocument();
    expect(screen.getByText("出勤日")).toBeInTheDocument();
    expect(screen.getByText("休日（休み）")).toBeInTheDocument();
    expect(screen.getByText("変更を確認する")).toBeInTheDocument();
  });

  it("「変更を確認する」をクリックすると確認ポップアップが表示され、即座には onSave が呼ばれない（誤タップ防止）", async () => {
    const handleSave = vi.fn();
    render(
      <ShiftOverrideModal
        isOpen={true}
        targetDate="2026-10-05"
        currentShift={defaultShift}
        events={mockEvents}
        isGoogleSignedIn={true}
        onClose={vi.fn()}
        onSave={handleSave}
      />
    );

    // 「変更を確認する」ボタンをクリック
    const reviewBtn = screen.getByText("変更を確認する");
    fireEvent.click(reviewBtn);

    // 確認ポップアップのタイトルが表示される
    expect(
      screen.getByText("Googleカレンダーに出勤予定を反映しますか？")
    ).toBeInTheDocument();

    // まだ onSave は呼ばれていない
    expect(handleSave).not.toHaveBeenCalled();

    // 「戻る」ボタンを押すとポップアップが閉じ、onSave も呼ばれない
    const backBtn = screen.getByText("戻る");
    fireEvent.click(backBtn);

    expect(
      screen.queryByText("Googleカレンダーに出勤予定を反映しますか？")
    ).not.toBeInTheDocument();
    expect(handleSave).not.toHaveBeenCalled();
  });

  it("確認ポップアップで「変更を反映する」を押すと、出勤予定と時間が onSave に渡される", async () => {
    const handleSave = vi.fn().mockResolvedValue(undefined);
    const handleClose = vi.fn();

    render(
      <ShiftOverrideModal
        isOpen={true}
        targetDate="2026-10-05"
        currentShift={defaultShift}
        events={mockEvents}
        isGoogleSignedIn={true}
        onClose={handleClose}
        onSave={handleSave}
      />
    );

    // クイックシフト「遅番」をクリック
    const lateBtn = screen.getByText("遅番");
    fireEvent.click(lateBtn);

    // 「変更を確認する」をクリック
    fireEvent.click(screen.getByText("変更を確認する"));

    // 確認ポップアップの確定ボタンをクリック
    const confirmBtn = screen.getByTestId("confirm-shift-btn");
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(handleSave).toHaveBeenCalledWith(
        {
          type: "work",
          streakNumber: 1,
          shiftName: "遅番",
        },
        {
          startTime: "15:00",
          endTime: "23:30",
        }
      );
    });

    expect(handleClose).toHaveBeenCalled();
  });

  it("休日を選択して「変更を確認する」→確定すると休日の削除案内ポップアップが表示され、onSave に holiday が渡される", async () => {
    const handleSave = vi.fn().mockResolvedValue(undefined);
    const handleClose = vi.fn();

    render(
      <ShiftOverrideModal
        isOpen={true}
        targetDate="2026-10-05"
        currentShift={defaultShift}
        events={mockEvents}
        isGoogleSignedIn={true}
        onClose={handleClose}
        onSave={handleSave}
      />
    );

    // 「休日（休み）」をクリック
    fireEvent.click(screen.getByText("休日（休み）"));

    // 「変更を確認する」をクリック
    fireEvent.click(screen.getByText("変更を確認する"));

    // 休日用の確認ポップアップが表示される
    expect(
      screen.getByText("Googleカレンダーの出勤予定を削除しますか？")
    ).toBeInTheDocument();

    // 確定ボタンをクリック
    fireEvent.click(screen.getByTestId("confirm-shift-btn"));

    await waitFor(() => {
      expect(handleSave).toHaveBeenCalledWith(
        {
          type: "holiday",
          streakNumber: 1,
          shiftName: undefined,
        },
        undefined
      );
    });

    expect(handleClose).toHaveBeenCalled();
  });

  it("手動上書き中のとき、「自動判定に戻す」を押すと確認ポップアップが表示され、確定で onSave(null) が呼ばれる", async () => {
    const overriddenShift: ShiftInfo = {
      ...defaultShift,
      isOverridden: true,
    };
    const handleSave = vi.fn().mockResolvedValue(undefined);
    const handleClose = vi.fn();

    render(
      <ShiftOverrideModal
        isOpen={true}
        targetDate="2026-10-05"
        currentShift={overriddenShift}
        events={mockEvents}
        isGoogleSignedIn={true}
        onClose={handleClose}
        onSave={handleSave}
      />
    );

    // 「自動判定に戻す」ボタンをクリック
    const resetBtn = screen.getByText("自動判定に戻す");
    fireEvent.click(resetBtn);

    // リセット確認ポップアップが表示される
    expect(screen.getByText("自動判定に戻しますか？")).toBeInTheDocument();
    expect(handleSave).not.toHaveBeenCalled();

    // 確定ボタンをクリック
    fireEvent.click(screen.getByTestId("confirm-shift-btn"));

    await waitFor(() => {
      expect(handleSave).toHaveBeenCalledWith(null);
    });

    expect(handleClose).toHaveBeenCalled();
  });
});
