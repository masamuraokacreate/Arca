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

function mockOnSnapshot(implementations: Record<string, () => object[]> = {}) {
  (onSnapshot as Mock).mockImplementation((_query: unknown, callback: (snap: unknown) => void) => {
    const mockDocs = (data: object[]) =>
      data.map((d, i) => ({ id: `mock-id-${i}`, data: () => d }));

    const q = _query as { id?: string; path?: string };
    const colPath = q?.id ?? q?.path ?? "";

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
      expect(screen.getByText("PM 計画を設定する")).toBeInTheDocument();
    });
  });

  it("「⚙ 計画表」ボタンをクリックすると PMSettingsModal が開く", async () => {
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
      expect(screen.getByText(/PM（予防保全）計画表/)).toBeInTheDocument();
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

    await waitFor(() => {
      expect(screen.getByText("浴室清掃")).toBeInTheDocument();
    });

    const completeBtn = screen.getByTestId("pm-complete-btn-mock-id-0");
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

    await waitFor(() => {
      expect(screen.getByText("周期洗濯")).toBeInTheDocument();
    });

    const skipBtn = screen.getByTestId("pm-skip-btn-mock-id-0");
    fireEvent.click(skipBtn);

    // スキップモーダルが表示される
    await waitFor(() => {
      expect(screen.getByText(/「周期洗濯」をスキップ/)).toBeInTheDocument();
      expect(screen.getByText("実施見送り（スキップ）の記録")).toBeInTheDocument();
    });

    // クイックチップ「時間不足」をクリック
    const chip = screen.getByText("時間不足");
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
        overrides: { [todayStr]: { date: todayStr, isRestDay: true } },
      }),
    });

    mockOnSnapshot({
      pm_templates: () => [
        { dayIndex: 1, timing: "rest_day_1", title: "浴室清掃", content: "", order: 0 },
      ],
      pm_logs: () => [],
      events: () => [],
    });

    render(<PMSection />);

    await waitFor(() => {
      expect(
        screen.getByText("本日のPM計画はすべて完了しています。心地よい休息を。")
      ).toBeInTheDocument();
    });
  });
});
