/**
 * src/test/PMScheduleOverrideAndPill.test.tsx
 * Arca — PM次回・次々回予定プレビュー、カレンダーオーバーライド、ピル型シフト表示、凡例/ドット削除 統合テスト
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  calculateFuturePMSchedules,
  getShiftShortLabel,
} from "../services/pmMasterService";
import * as pmMasterService from "../services/pmMasterService";
import { PMMasterModal } from "../components/pm/PMMasterModal";
import { CalendarDayCell } from "../components/calendar/CalendarDayCell";
import { PMOverridePopover } from "../components/pm/PMOverridePopover";
import CalendarComponent from "../components/Calendar";
import { ShiftBadge } from "../components/calendar/ShiftBadge";
import { ShiftOverrideModal } from "../components/calendar/ShiftOverrideModal";
import type { PMMaster } from "../types/pm";
import type { CalendarEvent } from "../types";
import * as firestore from "firebase/firestore";

// Firestore モック
vi.mock("../lib/firebase", () => ({
  db: {},
}));

vi.mock("firebase/firestore", async () => {
  const actual = await vi.importActual<any>("firebase/firestore");
  return {
    ...actual,
    collection: vi.fn(),
    doc: vi.fn().mockReturnValue({ id: "mock-doc-id" }),
    setDoc: vi.fn().mockResolvedValue(undefined),
    onSnapshot: vi.fn((_q, cb) => {
      cb({ docs: [], forEach: vi.fn() });
      return () => {};
    }),
    query: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    serverTimestamp: vi.fn(),
  };
});

// Google Auth モック
vi.mock("../hooks/useGoogleAuth", () => ({
  useGoogleAuth: () => ({
    isReady: true,
    isSignedIn: false,
    accessToken: null,
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}));

const mockMaster: PMMaster = {
  id: "pm-test-1",
  title: "加湿器フィルター洗浄",
  cycleType: "shift_cycle",
  cycleValue: 1,
  timingCategory: "holiday",
  timingDay: 1,
  cycleInterval: 1,
  calcBasis: "fixed_date",
  estimatedMinutes: 30,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  nextScheduledDate: "2026-10-25",
  itemTemplates: [],
  taskTemplates: [],
};

describe("1. pmMasterService: calculateFuturePMSchedules & getShiftShortLabel", () => {
  it("getShiftShortLabel が休日・出勤・早番・遅番の短縮ラベル（休1, 勤1, 早1, 遅1等）を正しく返すこと", () => {
    // 休日
    const labelHoliday = getShiftShortLabel("2026-10-20", []);
    expect(labelHoliday).toMatch(/^休\d+$/);

    // 早番イベントがある日
    const earlyEvent: CalendarEvent = {
      id: "e-early",
      title: "早番",
      date: "2026-10-21",
      startTime: "06:00",
      endTime: "15:00",
      note: "",
      createdAt: null,
    };
    const labelEarly = getShiftShortLabel("2026-10-21", [earlyEvent]);
    expect(labelEarly).toBe("早1");

    // 出勤イベントがある日
    const workEvent: CalendarEvent = {
      id: "e-work",
      title: "出勤",
      date: "2026-10-22",
      startTime: "",
      endTime: "",
      note: "",
      createdAt: null,
    };
    const labelWork = getShiftShortLabel("2026-10-22", [workEvent]);
    expect(labelWork).toBe("勤1");
  });

  it("calculateFuturePMSchedules が次回予定日と次々回予定日、およびシフト種別を算出すること", () => {
    const preview = calculateFuturePMSchedules(
      "2026-10-25",
      {
        cycleType: "shift_cycle",
        cycleValue: 1,
        calcBasis: "fixed_date",
        timingCategory: "holiday",
        timingDay: 1,
        cycleInterval: 1,
      },
      []
    );

    expect(preview.nextDate).toBe("2026-10-25");
    expect(preview.nextShiftLabel).toBeDefined();
    expect(preview.afterNextDate).toBeDefined();
    expect(preview.afterNextDate > preview.nextDate).toBe(true);
    expect(preview.afterNextShiftLabel).toBeDefined();
  });

  it("monthly_day 周期設定において翌月の同日が次々回として算出されること", () => {
    const preview = calculateFuturePMSchedules(
      "2026-10-15",
      {
        cycleType: "monthly_day",
        cycleValue: 15,
        calcBasis: "fixed_date",
      },
      []
    );

    expect(preview.nextDate).toBe("2026-10-15");
    expect(preview.afterNextDate).toBe("2026-11-15");
  });
});

describe("2. PMMasterModal: 開始日ピッカー連携 & リアルタイムプレビュー", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(pmMasterService, "subscribePMMasters").mockImplementation((cb) => {
      cb([mockMaster]);
      return () => {};
    });
    vi.spyOn(pmMasterService, "subscribePMMasterLogs").mockImplementation((_id, cb) => {
      cb([]);
      return () => {};
    });
  });

  it("開始日ピッカーとリアルタイム次回・次々回予定プレビューが表示されること", async () => {
    render(<PMMasterModal isOpen={true} onClose={vi.fn()} initialSelectedMasterId="pm-test-1" />);

    // 開始日ピッカーの存在確認
    const datePicker = screen.getByTestId("pm-base-date-picker") as HTMLInputElement;
    expect(datePicker).toBeDefined();
    expect(datePicker.value).toBe("2026-10-25");

    // プレビュー領域の確認（順序: 最終実施日 → 今回 → 次回）
    const previewArea = screen.getByTestId("pm-modal-schedule-preview");
    expect(previewArea).toBeDefined();
    expect(previewArea.textContent).toContain("最終実施日");
    expect(previewArea.textContent).toContain("今回");
    expect(previewArea.textContent).toContain("次回");

    // 作業時間目安（タスク詳細枠内）の存在確認
    expect(screen.getByText("作業時間目安")).toBeDefined();
    expect(screen.getByTestId("pm-estimated-minutes-input")).toBeDefined();

    // 「※カレンダー実行画面でチェック可能」が削除されていること
    expect(screen.queryByText(/※カレンダー実行画面でチェック可能/)).toBeNull();

    // 「購入物・関連ノート連携」の名称変更確認
    expect(screen.getByText("購入物・関連ノート連携")).toBeDefined();
  });

  it("開始日ピッカーの日付変更時に即座にプレビューが更新されること", async () => {
    render(<PMMasterModal isOpen={true} onClose={vi.fn()} initialSelectedMasterId="pm-test-1" />);

    const datePicker = screen.getByTestId("pm-base-date-picker");
    fireEvent.change(datePicker, { target: { value: "2026-11-10" } });

    await waitFor(() => {
      const previewArea = screen.getByTestId("pm-modal-schedule-preview");
      expect(previewArea.textContent).toContain("2026-11-10");
    });
  });

  it("サイクル頻度（〇サイクルに1回）の変更時に下の予定日（次回）がリアルタイムで更新されること", async () => {
    render(<PMMasterModal isOpen={true} onClose={vi.fn()} initialSelectedMasterId="pm-test-1" />);

    const cycleIntervalSelect = screen.getAllByRole("combobox")[3];
    // 初期状態の次回予定日を取得
    const previewAreaBefore = screen.getByTestId("pm-modal-schedule-preview").textContent;

    // 4サイクルに1回へ変更
    fireEvent.change(cycleIntervalSelect, { target: { value: "4" } });

    await waitFor(() => {
      const previewAreaAfter = screen.getByTestId("pm-modal-schedule-preview").textContent;
      expect(previewAreaAfter).not.toBe(previewAreaBefore);
    });
  });
});

describe("3. CalendarDayCell: ピル型シフト表示、PMドット削除、PMバッジオーバーライド", () => {
  it("日付数字がピル形状で描画され、休日に淡色ピンク系、出勤日にアンバー系のクラスが付与されること", () => {
    // 休日セルのレンダリング
    const { rerender } = render(
      <CalendarDayCell
        dateStr="2026-10-25"
        day={25}
        inMonth={true}
        isSun={false}
        isSat={false}
        isSelected={false}
        isToday={false}
        hasEvent={false}
        hasTask={false}
        hasPM={false}
        isRest={true}
        showShift={true}
        onSelectDate={vi.fn()}
      />
    );

    const holidayPill = screen.getByTestId("day-pill-2026-10-25");
    expect(holidayPill.className).toContain("rounded-full");
    expect(holidayPill.className).toContain("shift-badge-holiday");

    // 出勤日セルのレンダリング
    rerender(
      <CalendarDayCell
        dateStr="2026-10-26"
        day={26}
        inMonth={true}
        isSun={false}
        isSat={false}
        isSelected={false}
        isToday={false}
        hasEvent={false}
        hasTask={false}
        hasPM={false}
        shift={{ isWork: true }}
        isRest={false}
        showShift={true}
        onSelectDate={vi.fn()}
      />
    );

    const workPill = screen.getByTestId("day-pill-2026-10-26");
    expect(workPill.className).toContain("rounded-full");
    expect(workPill.className).toContain("shift-badge-work");
  });

  it("クリック・選択された日（isSelected=true）でもピルマークのシフト配色は維持され、セル背景のみがハイライトされること", () => {
    // 休日かつ選択中（isSelected=true）
    const { container, rerender } = render(
      <CalendarDayCell
        dateStr="2026-10-25"
        day={25}
        inMonth={true}
        isSun={false}
        isSat={false}
        isSelected={true}
        isToday={false}
        hasEvent={false}
        hasTask={false}
        hasPM={false}
        isRest={true}
        showShift={true}
        onSelectDate={vi.fn()}
      />
    );

    const holidayPill = screen.getByTestId("day-pill-2026-10-25");
    // ピルマークは休日配色のまま変更されない
    expect(holidayPill.className).toContain("shift-badge-holiday");

    // ボタン（セル全体）の背景がハイライトされていること（テーマアクセント連動クラス）
    const cellButton = container.querySelector("button")!;
    expect(cellButton.className).toContain("calendar-cell-selected");

    // 出勤日かつ選択中（isSelected=true）
    rerender(
      <CalendarDayCell
        dateStr="2026-10-26"
        day={26}
        inMonth={true}
        isSun={false}
        isSat={false}
        isSelected={true}
        isToday={false}
        hasEvent={false}
        hasTask={false}
        hasPM={false}
        shift={{ isWork: true }}
        isRest={false}
        showShift={true}
        onSelectDate={vi.fn()}
      />
    );

    const workPill = screen.getByTestId("day-pill-2026-10-26");
    // ピルマークは出勤配色のまま変更されない
    expect(workPill.className).toContain("shift-badge-work");
    expect(cellButton.className).toContain("calendar-cell-selected");
  });

  it("セル下部にPM用ドット（title='PM周期保全あり'）が描画されないこと（PMドット完全削除）", () => {
    render(
      <CalendarDayCell
        dateStr="2026-10-25"
        day={25}
        inMonth={true}
        isSun={false}
        isSat={false}
        isSelected={false}
        isToday={false}
        hasEvent={false}
        hasTask={false}
        hasPM={true}
        pmMasters={[mockMaster]}
        isRest={false}
        showShift={false}
        onSelectDate={vi.fn()}
      />
    );

    // PMドットの title="PM周期保全あり" は存在しないこと
    expect(screen.queryByTitle("PM周期保全あり")).toBeNull();
  });

  it("右上PMバッジ押下時に stopPropagation が呼ばれ、onOpenPMOverride が起動すること", () => {
    const onOpenPMOverrideMock = vi.fn();
    const onSelectDateMock = vi.fn();

    render(
      <CalendarDayCell
        dateStr="2026-10-25"
        day={25}
        inMonth={true}
        isSun={false}
        isSat={false}
        isSelected={false}
        isToday={false}
        hasEvent={false}
        hasTask={false}
        hasPM={true}
        pmMasters={[mockMaster]}
        isRest={false}
        showShift={false}
        onSelectDate={onSelectDateMock}
        onOpenPMOverride={onOpenPMOverrideMock}
      />
    );

    const pmBadge = screen.getByTestId("pm-indicator-2026-10-25");
    fireEvent.click(pmBadge);

    expect(onOpenPMOverrideMock).toHaveBeenCalledTimes(1);
    expect(onOpenPMOverrideMock).toHaveBeenCalledWith(mockMaster, expect.anything());
    // 親セルの日付選択が呼ばれないこと（stopPropagation検証）
    expect(onSelectDateMock).not.toHaveBeenCalled();
  });
});

describe("4. PMOverridePopover: カレンダーオーバーライド & リアルタイムプレビュー", () => {
  it("マスタタイトル、設定周期、最終実施日・今回・次回予定プレビューが表示されること", () => {
    render(
      <PMOverridePopover
        isOpen={true}
        master={mockMaster}
        currentDate="2026-10-25"
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText("加湿器フィルター洗浄")).toBeDefined();
    expect(screen.getByText(/設定周期: 休日1日目/)).toBeDefined();

    const preview = screen.getByTestId("pm-schedule-preview");
    expect(preview.textContent).toContain("2026-10-25");
    expect(preview.textContent).toContain("最終実施日");
    expect(preview.textContent).toContain("今回");
    expect(preview.textContent).toContain("次回");
  });

  it("過去日付が入力された場合に警告が表示され、更新ボタンが無効化されること", () => {
    render(
      <PMOverridePopover
        isOpen={true}
        master={mockMaster}
        currentDate="2026-10-25"
        onClose={vi.fn()}
      />
    );

    const input = screen.getByLabelText("新しい今回予定日") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "2020-01-01" } });

    expect(screen.getByText("過去の日付は指定できません")).toBeDefined();
    const updateBtn = screen.getByRole("button", { name: /更新する/i });
    expect(updateBtn.hasAttribute("disabled")).toBe(true);
  });

  it("有効日付で更新ボタン押下時に Firestore の setDoc が呼ばれ、onSaved が実行されること", async () => {
    const onSavedMock = vi.fn();
    const onCloseMock = vi.fn();
    const setDocSpy = vi.spyOn(firestore, "setDoc").mockResolvedValue(undefined);

    render(
      <PMOverridePopover
        isOpen={true}
        master={mockMaster}
        currentDate="2026-10-25"
        onClose={onCloseMock}
        onSaved={onSavedMock}
      />
    );

    const input = screen.getByLabelText("新しい今回予定日");
    fireEvent.change(input, { target: { value: "2026-11-05" } });

    const updateBtn = screen.getByRole("button", { name: /更新する/i });
    fireEvent.click(updateBtn);

    await waitFor(() => {
      expect(setDocSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          nextScheduledDate: "2026-11-05",
        }),
        { merge: true }
      );
      expect(onSavedMock).toHaveBeenCalledWith("2026-11-05");
      expect(onCloseMock).toHaveBeenCalled();
    });
  });

  it("Escキー押下で破棄されて閉じること", () => {
    const onCloseMock = vi.fn();
    render(
      <PMOverridePopover
        isOpen={true}
        master={mockMaster}
        currentDate="2026-10-25"
        onClose={onCloseMock}
      />
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCloseMock).toHaveBeenCalled();
  });
});

describe("5. Calendar: 凡例（Legend）のPMドットのみ削除確認", () => {
  it("カレンダー画面内に予定・タスク・出勤・休日の凡例は残り、PM凡例のみ削除されていること", () => {
    vi.spyOn(pmMasterService, "subscribePMMasters").mockImplementation((cb) => {
      cb([]);
      return () => {};
    });

    render(<CalendarComponent />);

    // 予定・タスク・出勤・休日の凡例が存在すること
    expect(screen.getAllByText("予定").length).toBeGreaterThan(0);
    expect(screen.getAllByText("タスク").length).toBeGreaterThan(0);
    expect(screen.getAllByText("出勤").length).toBeGreaterThan(0);
    expect(screen.getAllByText("休日").length).toBeGreaterThan(0);

    // 凡例内の「PM」ドット項目は存在しないこと
    const pmLegendItems = screen.queryAllByText("PM");
    expect(pmLegendItems.length).toBe(0);
  });

  it("カレンダー画面でアンカー出勤日と4勤2休サイクルに基づいて出勤日と休日が自動算出されピルに反映されること", () => {
    vi.spyOn(pmMasterService, "subscribePMMasters").mockImplementation((cb) => {
      cb([]);
      return () => {};
    });

    render(<CalendarComponent />);

    // カレンダーセル内に shift-badge-work および shift-badge-holiday のピルが存在すること
    const workPills = document.querySelectorAll(".shift-badge-work");
    const holidayPills = document.querySelectorAll(".shift-badge-holiday");
    expect(workPills.length).toBeGreaterThan(0);
    expect(holidayPills.length).toBeGreaterThan(0);
  });
});

describe("6. pmTaskAiService: Gemini API による文章要約と丸番号生成", () => {
  it("generatePMTasksWithAI が文章を要約し、丸数字（①, ②, ③...）付き手順配列を返すこと", async () => {
    const { generatePMTasksWithAI } = await import("../services/pmTaskAiService");
    const originalFetch = global.fetch;

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    tasks: [
                      "① パネルを開けてフィルターを取り外す",
                      "② 掃除機でホコリを吸い取り水洗いする",
                      "③ 日陰で乾燥させて元に戻す",
                    ],
                  }),
                },
              ],
            },
          },
        ],
      }),
    });

    try {
      const results = await generatePMTasksWithAI("エアコンのフィルターを掃除して元に戻す");
      expect(results).toHaveLength(3);
      expect(results[0]).toMatch(/^①/);
      expect(results[1]).toMatch(/^②/);
      expect(results[2]).toMatch(/^③/);
    } finally {
      global.fetch = originalFetch;
    }
  });
});

describe("7. 4勤2休シフトステータス配色の統一クラス検証", () => {
  it("ShiftBadge が出勤時に shift-badge-work、休日時に shift-badge-holiday クラスを持つこと", () => {
    const { rerender } = render(
      <ShiftBadge
        shift={{ type: "work", streakNumber: 1, isOverridden: false, date: "2026-10-25" }}
        testId="test-shift-badge"
      />
    );

    const badge = screen.getByTestId("test-shift-badge");
    expect(badge.className).toContain("shift-badge-work");

    rerender(
      <ShiftBadge
        shift={{ type: "holiday", streakNumber: 1, isOverridden: false, date: "2026-10-25" }}
        testId="test-shift-badge"
      />
    );
    expect(badge.className).toContain("shift-badge-holiday");
  });

  it("ShiftOverrideModal 内の出勤・休日選択ボタンに統一クラスが適用されること", () => {
    render(
      <ShiftOverrideModal
        isOpen={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
        currentShift={{ type: "work", streakNumber: 1, isOverridden: false, date: "2026-10-25" }}
        targetDate="2026-10-25"
      />
    );

    const workBtn = screen.getByRole("button", { name: /出勤日/i });
    expect(workBtn.className).toContain("shift-badge-work");

    const holidayBtn = screen.getByRole("button", { name: /休日（休み）/i });
    fireEvent.click(holidayBtn);
    expect(holidayBtn.className).toContain("shift-badge-holiday");
  });
});
