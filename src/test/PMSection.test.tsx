/**
 * src/test/PMSection.test.tsx
 * Arca — PMSection コンポーネント単体テスト
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { PMSection } from "../components/tasks/PMSection";
import { setDoc, onSnapshot, getDoc } from "firebase/firestore";

// ─────────────────────────────────────────
// ヘルパー: onSnapshot の同期モック
// ─────────────────────────────────────────

function mockOnSnapshot(
  implementations: Record<string, () => object[]> = {},
  settingsData?: object
) {
  (onSnapshot as Mock).mockImplementation((_query: unknown, callback: (snap: unknown) => void) => {
    const q = _query as { id?: string; path?: string };
    const colPath = q?.path ?? q?.id ?? "";

    if (colPath.includes("pm_settings") || colPath.includes("shift_settings")) {
      if (typeof callback === "function") {
        let resolvedData = settingsData;
        if (resolvedData === undefined && typeof (getDoc as Mock).getMockImplementation === "function") {
          const fn = (getDoc as Mock).getMockImplementation();
          if (fn) {
            try {
              const res = fn();
              if (res && typeof res.then === "function") {
                res.then((val: any) => {
                  if (val && val.exists?.()) {
                    callback({ exists: () => true, data: () => val.data() });
                  }
                });
              } else if (res && res.exists?.()) {
                resolvedData = res.data();
              }
            } catch {}
          }
        }
        callback({
          exists: () => Boolean(resolvedData),
          data: () => resolvedData,
        });
      }
      return vi.fn();
    }

    const mockDocs = (data: object[]) =>
      data.map((d, i) => ({ id: `mock-id-${i}`, data: () => d }));

    let data: object[] = [];
    for (const [key, fn] of Object.entries(implementations)) {
      if (colPath.includes(key)) {
        data = fn();
        break;
      }
    }

    const snap = { docs: mockDocs(data) };
    if (typeof callback === "function") {
      callback(snap);
    }
    return vi.fn();
  });
}

describe("PMSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
  });

  it("設定未完了（anchorDate なし）のとき空ステートが描画される", async () => {
    (getDoc as Mock).mockResolvedValue({
      exists: () => false,
      data: () => undefined,
    });

    mockOnSnapshot({ pm_templates: () => [], pm_logs: () => [], events: () => [] });

    render(<PMSection />);

    await waitFor(() => {
      expect(screen.getByText("PM 計画が未設定です")).toBeInTheDocument();
      expect(screen.getByText("PM計画を設定する")).toBeInTheDocument();
    });
  });

  it("「⚙ PM計画表」ボタンをクリックすると PMSettingsModal が開く", async () => {
    (getDoc as Mock).mockResolvedValue({
      exists: () => false,
      data: () => undefined,
    });

    mockOnSnapshot({ pm_templates: () => [], pm_logs: () => [], events: () => [] });

    render(<PMSection />);

    await waitFor(() => {
      expect(screen.getByTestId("pm-settings-btn")).toBeInTheDocument();
    });

    const settingsBtn = screen.getByTestId("pm-settings-btn");
    fireEvent.click(settingsBtn);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /PM計画表/ })).toBeInTheDocument();
    });
  });

  it("今日のシフト状態とPMタスクが正しく描画される", async () => {
    const today = new Date();
    const todayStr = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, "0"),
      String(today.getDate()).padStart(2, "0"),
    ].join("-");

    (getDoc as Mock).mockResolvedValue({
      exists: () => true,
      data: () => ({
        cycleLength: 6,
        manualAnchorDate: todayStr,
        manualAnchorDay: 1,
      }),
    });

    mockOnSnapshot({
      pm_templates: () => [
        { dayIndex: 1, timing: "rest_day_1", title: "浴室清掃", content: "床・排水口の洗浄", order: 0 },
        { dayIndex: 1, timing: "rest_all", title: "周期洗濯", content: "シーツ・タオル", order: 1 },
        { dayIndex: 2, timing: "rest_day_2", title: "全室床掃除", content: "掃除機とモップ", order: 0 },
      ],
      pm_logs: () => [],
      events: () => [],
    });

    render(<PMSection />);

    await waitFor(() => {
      expect(screen.getByText("浴室清掃")).toBeInTheDocument();
      expect(screen.getByText("床・排水口の洗浄")).toBeInTheDocument();
      expect(screen.getByText("周期洗濯")).toBeInTheDocument();
    });

    // 休日2日目（rest_day_2）のタスクは表示されない
    expect(screen.queryByText("全室床掃除")).not.toBeInTheDocument();

    // 休日バッジが表示される
    expect(screen.getByText(/休日 1日目/)).toBeInTheDocument();
  });

  it("チェックボックスのクリックで recordPMLog（setDoc completed）が呼び出される", async () => {
    const today = new Date();
    const todayStr = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, "0"),
      String(today.getDate()).padStart(2, "0"),
    ].join("-");

    (getDoc as Mock).mockResolvedValue({
      exists: () => true,
      data: () => ({
        cycleLength: 6,
        manualAnchorDate: todayStr,
        manualAnchorDay: 1,
      }),
    });

    mockOnSnapshot({
      pm_templates: () => [
        { dayIndex: 1, timing: "rest_day_1", title: "浴室清掃", content: "床・排水口", order: 0 },
      ],
      pm_logs: () => [],
      events: () => [],
    });

    render(<PMSection />);

    const completeBtn = await screen.findByTestId("pm-complete-btn-mock-id-0");
    fireEvent.click(completeBtn);

    await waitFor(() => {
      expect(setDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          date: todayStr,
          status: "completed",
          title: "浴室清掃",
          templateId: "mock-id-0",
        }),
        { merge: false }
      );
    });
  });

  it("スキップボタンのクリックでスキップ理由モーダルが開き、理由を送信すると recordPMLog（skipped）が呼び出される", async () => {
    const today = new Date();
    const todayStr = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, "0"),
      String(today.getDate()).padStart(2, "0"),
    ].join("-");

    (getDoc as Mock).mockResolvedValue({
      exists: () => true,
      data: () => ({
        cycleLength: 6,
        manualAnchorDate: todayStr,
        manualAnchorDay: 1,
      }),
    });

    mockOnSnapshot({
      pm_templates: () => [
        { dayIndex: 1, timing: "rest_day_1", title: "周期洗濯", content: "シーツ類", order: 0 },
      ],
      pm_logs: () => [],
      events: () => [],
    });

    render(<PMSection />);

    const skipBtn = await screen.findByTestId("pm-skip-btn-mock-id-0");
    fireEvent.click(skipBtn);

    // スキップモーダルが表示される
    const chip = await screen.findByText("時間不足");
    fireEvent.click(chip);

    // 「スキップを記録」をクリック
    const confirmBtn = screen.getByText("スキップを記録");
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(setDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          date: todayStr,
          status: "skipped",
          title: "周期洗濯",
          skipReason: "時間不足",
          templateId: "mock-id-0",
        }),
        { merge: false }
      );
    });
  });

  it("休養日または全タスク完了時に静かな完了メッセージが表示される", async () => {
    const today = new Date();
    const todayStr = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, "0"),
      String(today.getDate()).padStart(2, "0"),
    ].join("-");

    (getDoc as Mock).mockResolvedValue({
      exists: () => true,
      data: () => ({
        cycleLength: 6,
        manualAnchorDate: todayStr,
        manualAnchorDay: 1,
      }),
    });

    mockOnSnapshot({
      pm_templates: () => [],
      pm_logs: () => [],
      events: () => [],
    });

    render(<PMSection />);

    await waitFor(() => {
      expect(screen.getByText(/心地よい休息を/)).toBeInTheDocument();
    });
  });

  it("シフト状態バッジをクリックすると手動補正モーダルが開く", async () => {
    const today = new Date();
    const todayStr = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, "0"),
      String(today.getDate()).padStart(2, "0"),
    ].join("-");

    (getDoc as Mock).mockResolvedValue({
      exists: () => true,
      data: () => ({
        cycleLength: 6,
        manualAnchorDate: todayStr,
        manualAnchorDay: 1,
      }),
    });

    mockOnSnapshot({
      pm_templates: () => [],
      pm_logs: () => [],
      events: () => [],
    });

    render(<PMSection />);

    const shiftBadge = await screen.findByTestId("pm-shift-badge");
    fireEvent.click(shiftBadge);

    await waitFor(() => {
      expect(screen.getByText("出勤ステータス確認")).toBeInTheDocument();
    });
  });

  it("recordPMLog 単体が呼ばれると setDoc が呼ばれる", async () => {
    const { recordPMLog } = await import("../services/pmCycleService");
    await recordPMLog({
      date: "2026-08-25",
      templateId: "t1",
      dayIndex: 1,
      title: "テスト",
      status: "completed",
    });
    expect(setDoc).toHaveBeenCalled();
  });
});
