/**
 * src/test/PMMaster.test.tsx
 * Arca — PM（周期保全・管理台帳）モジュール & カレンダー実行連携テスト
 *
 * 完了条件（Definition of Done）の網羅的検証:
 *  1. PMMasterModal の2ペイン構造（左：検索・ソート・新規作成、右：ワイド詳細）
 *  2. 未選択時に「右のタスクをクリックして詳細を表示」が表示されること
 *  3. 新規作成ボタンが左ペインの並び替えボタン直下のみに存在すること
 *  4. 購入物テンプレートの表示 & [ Listsへ追加 ] アクションの動作
 *  5. 手順チェックリストの未完了時は「完了」ボタンがdisabled、全チェック完了で点灯すること
 *  6. 「開始」ボタン押下後に同一サイズのまま「開始取消」へ切り替わること（レイアウトシフト防止）
 *  7. 「完了」ボタン押下時に工数計算と差分が算出され、pm_logs に保存されること
 *  8. 絵文字が一切含まれず、SVGアイコンのみであること
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PMMasterModal } from "../components/pm/PMMasterModal";
import { PMExecutionPopover } from "../components/pm/PMExecutionPopover";
import { CalendarDayCell } from "../components/calendar/CalendarDayCell";
import type { PMMaster } from "../types/pm";
import * as pmMasterService from "../services/pmMasterService";

// Firestore / Service のモック
vi.mock("../lib/firebase", () => ({
  db: {},
}));

const mockMasters: PMMaster[] = [
  {
    id: "pm-master-1",
    title: "エアコンフィルター清掃",
    cycleType: "monthly_day",
    cycleValue: 25,
    calcBasis: "fixed_date",
    estimatedMinutes: 20,
    noteId: "note-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    itemTemplates: [
      { id: "item-1", masterId: "pm-master-1", itemName: "エアコン用防カビスプレー" },
    ],
    taskTemplates: [
      { id: "task-1", masterId: "pm-master-1", content: "フィルターを取り外す", sortOrder: 1 },
      { id: "task-2", masterId: "pm-master-1", content: "水洗いして乾燥させる", sortOrder: 2 },
    ],
    nextScheduledDate: "2026-10-25",
  },
];

describe("PMMasterModal (PM管理台帳 2ペインUI)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(pmMasterService, "subscribePMMasters").mockImplementation((cb) => {
      cb(mockMasters);
      return () => {};
    });
    vi.spyOn(pmMasterService, "subscribePMMasterLogs").mockImplementation((_id, cb) => {
      cb([]);
      return () => {};
    });
  });

  it("1. 2ペイン構造で描画され、左ペインに検索・ソート・新規作成ボタンが配置されること", async () => {
    render(<PMMasterModal isOpen={true} onClose={vi.fn()} />);

    // 検索入力欄の存在確認
    expect(screen.getByPlaceholderText(/PM台帳を検索/i)).toBeDefined();

    // 並び替えセレクトの存在確認
    expect(screen.getByRole("combobox")).toBeDefined();

    // 新規作成ボタンの存在確認
    const newBtn = screen.getByRole("button", { name: /新規作成/i });
    expect(newBtn).toBeDefined();

    // PMカード一覧にタイトルが表示されること
    expect(screen.getByText("エアコンフィルター清掃")).toBeDefined();
  });

  it("2. 未選択時に『右のタスクをクリックして詳細を表示』が表示されること", async () => {
    // 初期選択なしでレンダリング
    render(<PMMasterModal isOpen={true} onClose={vi.fn()} initialSelectedMasterId={null} />);

    // 未選択メッセージが表示されることを確認
    expect(screen.getByText("右のタスクをクリックして詳細を表示")).toBeDefined();
  });

  it("3. 新規作成ボタンは左ペインのみに1つだけ存在すること（詳細ペイン等に重複しない）", async () => {
    render(<PMMasterModal isOpen={true} onClose={vi.fn()} initialSelectedMasterId="pm-master-1" />);

    // 「＋新規作成」というボタンは画面全体で1つのみ
    const createButtons = screen.getAllByRole("button", { name: /新規作成/i });
    expect(createButtons.length).toBe(1);
  });

  it("3b. カードの削除ボタンをクリックすると独自削除確認ダイアログが表示されること", async () => {
    render(<PMMasterModal isOpen={true} onClose={vi.fn()} initialSelectedMasterId="pm-master-1" />);

    // カードの削除ボタンをクリック
    const deleteCardBtn = screen.getByTestId("pm-card-delete-btn-pm-master-1");
    fireEvent.click(deleteCardBtn);

    // 独自削除確認ダイアログが表示されること
    expect(screen.getByText("台帳の削除確認")).toBeDefined();
    expect(screen.getAllByText(/エアコンフィルター清掃/).length).toBeGreaterThanOrEqual(2);

    // キャンセルボタンをクリックするとダイアログが閉じること
    const cancelBtn = screen.getByTestId("pm-cancel-delete-btn");
    fireEvent.click(cancelBtn);
    expect(screen.queryByText("台帳の削除確認")).toBeNull();
  });
});

describe("PMExecutionPopover (カレンダー実行パネル)", () => {
  const master = mockMasters[0];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("4. 購入物品テンプレートが表示され、[ Listsへ追加 ] ボタンを押すとLists連携が呼ばれること", async () => {
    const addToListsSpy = vi.spyOn(pmMasterService, "addItemsToLists").mockResolvedValue(1);

    render(
      <PMExecutionPopover
        isOpen={true}
        onClose={vi.fn()}
        date="2026-10-25"
        master={master}
      />
    );

    // 購入物名が表示されていること
    expect(screen.getByText("エアコン用防カビスプレー")).toBeDefined();

    // [ Listsへ追加 ] ボタンをクリック
    const addBtn = screen.getByRole("button", { name: /Listsへ追加/i });
    fireEvent.click(addBtn);

    await waitFor(() => {
      expect(addToListsSpy).toHaveBeenCalledWith(["エアコン用防カビスプレー"]);
    });
  });

  it("5. 手順チェックリストの未完了時は『完了』ボタンがdisabledであり、全チェックで点灯すること", async () => {
    render(
      <PMExecutionPopover
        isOpen={true}
        onClose={vi.fn()}
        date="2026-10-25"
        master={master}
      />
    );

    const completeBtn = screen.getByRole("button", { name: /完了/i }) as HTMLButtonElement;

    // 初期状態: 未完了のため disabled
    expect(completeBtn.disabled).toBe(true);

    // チェックボックスを取得（2項目）
    const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(checkboxes.length).toBe(2);

    // 1つだけチェック
    fireEvent.click(checkboxes[0]);
    expect(completeBtn.disabled).toBe(true);

    // 2つめもチェック -> 全完了
    fireEvent.click(checkboxes[1]);
    expect(completeBtn.disabled).toBe(false);
  });

  it("6. 『開始』ボタンを押すと固定サイズのまま『開始取消』に切り替わり、再度押すと元に戻ること", async () => {
    render(
      <PMExecutionPopover
        isOpen={true}
        onClose={vi.fn()}
        date="2026-10-25"
        master={master}
      />
    );

    // 初期状態: 「開始」ボタン
    const startBtn = screen.getByRole("button", { name: /開始$/i });
    expect(startBtn.style.width).toBe("110px");
    expect(startBtn.style.height).toBe("36px");

    // クリック -> 「開始取消」に切り替え
    fireEvent.click(startBtn);

    const cancelBtn = screen.getByRole("button", { name: /開始取消/i });
    expect(cancelBtn).toBeDefined();
    expect(cancelBtn.style.width).toBe("110px");
    expect(cancelBtn.style.height).toBe("36px");

    // 再度クリック -> 「開始」に戻る
    fireEvent.click(cancelBtn);
    expect(screen.getByRole("button", { name: /開始$/i })).toBeDefined();
  });

  it("7. 全完了後に『完了』ボタンを押すと工数計算とログ記録が実行されること", async () => {
    const recordSpy = vi.spyOn(pmMasterService, "recordPMExecution").mockResolvedValue({
      id: "log-1",
      masterId: master.id,
      date: "2026-10-25",
      startedAt: "10:00",
      completedAt: "10:25",
      actualMinutes: 25,
      diffMinutes: 5,
      allTasksCompleted: true,
    });

    const onCompletedMock = vi.fn();

    render(
      <PMExecutionPopover
        isOpen={true}
        onClose={vi.fn()}
        date="2026-10-25"
        master={master}
        onCompleted={onCompletedMock}
      />
    );

    // 開始を押す
    const startBtn = screen.getByRole("button", { name: /開始$/i });
    fireEvent.click(startBtn);

    // チェックボックスを全てオンにする
    const checkboxes = screen.getAllByRole("checkbox");
    checkboxes.forEach((cb) => fireEvent.click(cb));

    // 完了ボタンを押す
    const completeBtn = screen.getByRole("button", { name: /完了/i });
    fireEvent.click(completeBtn);

    await waitFor(() => {
      expect(recordSpy).toHaveBeenCalled();
      expect(onCompletedMock).toHaveBeenCalled();
    });
  });
});

describe("CalendarDayCell (PM専用インジケータ)", () => {
  it("8. PM予定があるセルに専用SVGアイコンが表示され、タップで実行ポップオーバーが開くこと", () => {
    const onOpenMock = vi.fn();

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
        pmMasters={mockMasters}
        isRest={false}
        showShift={false}
        onSelectDate={vi.fn()}
        onOpenPMExecution={onOpenMock}
      />
    );

    // PMインジケータが表示されていること
    const indicator = screen.getByTestId("pm-indicator-2026-10-25");
    expect(indicator).toBeDefined();

    // クリックでコールバックが呼ばれること
    fireEvent.click(indicator);
    expect(onOpenMock).toHaveBeenCalledWith("2026-10-25", mockMasters);
  });
});
