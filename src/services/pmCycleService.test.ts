/**
 * src/services/pmCycleService.test.ts
 * Arca — PM サイクルサービス 単体テスト（Phase 2 フル版）
 *
 * テスト対象: ピュア関数のみ（Firestore 不要）
 *
 * カバレッジ:
 *  A. getDaysDifference — 日数差分計算
 *  B. calculateDayIndex — 循環 Day 計算・オーバーライド
 *  C. detectAnchorFromEvents — シフト自動検出
 *  D. 後方互換関数 (buildCalendarPMDates / buildLogMapForDate / resolveItemStatus)
 */

import { describe, it, expect } from "vitest";
import {
  getDaysDifference,
  calculateDayIndex,
  detectAnchorFromEvents,
  buildCalendarPMDates,
  buildLogMapForDate,
  resolveItemStatus,
  getDefaultPMTemplates,
  DEFAULT_CYCLE_LENGTH,
  DEFAULT_PM_SETTINGS,
  WORK_SHIFT_KEYWORDS,
  isWorkEvent,
  isEarlyShiftEvent,
  isLateShiftEvent,
  resolveDateShiftInfo,
  resolveShiftInfo,
  calculateCycleIndex,
  isTemplateActiveForDate,
  getActivePMTasksForDate,
  getPMTemplateTimingLabel,
  getPMTemplateCycleLabel,
  calculateFourTwoCycleRange,
  getFourDayWorkBlock,
} from "./pmCycleService";
import type { PMSettings, PMTemplateItem, PMLogItem } from "../types/pm";
import type { CalendarEvent } from "../types";

// ═══════════════════════════════════════════════════════════
// テストフィクスチャ
// ═══════════════════════════════════════════════════════════

/** 標準テスト設定（6日サイクル, 起点日 2026-01-01, 起点Day 1） */
const BASE_SETTINGS: PMSettings = {
  cycleLength: 6,
  manualAnchorDate: "2026-01-01",
  manualAnchorDay: 1,
};

/** CalendarEvent ファクトリ */
function makeEvent(title: string, date: string): CalendarEvent {
  return {
    id: `ev-${date}-${title.slice(0, 4)}`,
    title,
    date,
    startTime: "09:00",
    endTime: "18:00",
    note: "",
    createdAt: null,
  };
}

/** PMTemplateItem フィクスチャ */
const TEMPLATES: PMTemplateItem[] = [
  { id: "t1", dayIndex: 1, title: "浴室清掃", content: "排水口・鏡", order: 0 },
  { id: "t2", dayIndex: 1, title: "洗濯", content: "周期洗濯", order: 1 },
  { id: "t3", dayIndex: 3, title: "シーツ交換", content: "ベッドシーツ", order: 0 },
  { id: "t4", dayIndex: 6, title: "備蓄点検", content: "消耗品確認", order: 0 },
];

// ═══════════════════════════════════════════════════════════
// A. getDaysDifference — 日数差分計算
// ═══════════════════════════════════════════════════════════

describe("getDaysDifference", () => {
  it("同一日は 0 を返す", () => {
    expect(getDaysDifference("2026-01-01", "2026-01-01")).toBe(0);
  });

  it("正の方向（5日後）は +5 を返す", () => {
    expect(getDaysDifference("2026-01-01", "2026-01-06")).toBe(5);
  });

  it("負の方向（5日前）は -5 を返す", () => {
    expect(getDaysDifference("2026-01-06", "2026-01-01")).toBe(-5);
  });

  it("月またぎ（1/28 → 2/03）を正確に計算する", () => {
    expect(getDaysDifference("2026-01-28", "2026-02-03")).toBe(6);
  });

  it("年またぎ（2025-12-30 → 2026-01-03）を正確に計算する", () => {
    expect(getDaysDifference("2025-12-30", "2026-01-03")).toBe(4);
  });

  it("うるう年を含む計算（2024-02-28 → 2024-03-01）= 2 日", () => {
    // 2024年はうるう年。2/28 → 2/29 → 3/1 = 2日
    expect(getDaysDifference("2024-02-28", "2024-03-01")).toBe(2);
  });

  it("非うるう年を含む計算（2025-02-28 → 2025-03-01）= 1 日", () => {
    // 2025年は平年。2/28 → 3/1 = 1日
    expect(getDaysDifference("2025-02-28", "2025-03-01")).toBe(1);
  });

  it("100日間隔の長期差分", () => {
    expect(getDaysDifference("2026-01-01", "2026-04-11")).toBe(100);
  });
});

// ═══════════════════════════════════════════════════════════
// B. calculateDayIndex — 循環 Day 計算
// ═══════════════════════════════════════════════════════════

describe("calculateDayIndex — 基本循環計算", () => {
  it("起点日当日は Day 1 を返す", () => {
    const r = calculateDayIndex("2026-01-01", BASE_SETTINGS);
    expect(r.dayIndex).toBe(1);
    expect(r.isRestDay).toBe(false);
    expect(r.isOverridden).toBe(false);
    expect(r.cycleLength).toBe(6);
  });

  it("起点日の翌日は Day 2 を返す", () => {
    expect(calculateDayIndex("2026-01-02", BASE_SETTINGS).dayIndex).toBe(2);
  });

  it("起点日+2日は Day 3 を返す（サイクル中間）", () => {
    expect(calculateDayIndex("2026-01-03", BASE_SETTINGS).dayIndex).toBe(3);
  });

  it("起点日+5日は Day 6 を返す（サイクル最終日）", () => {
    expect(calculateDayIndex("2026-01-06", BASE_SETTINGS).dayIndex).toBe(6);
  });

  it("起点日+6日（1サイクル後）は Day 1 に循環する", () => {
    expect(calculateDayIndex("2026-01-07", BASE_SETTINGS).dayIndex).toBe(1);
  });

  it("起点日+7日は Day 2 に循環する", () => {
    expect(calculateDayIndex("2026-01-08", BASE_SETTINGS).dayIndex).toBe(2);
  });

  it("2サイクル後（+12日）も正確に循環する", () => {
    // 2026-01-01 + 12 = 2026-01-13 → (12 % 6 = 0) → Day 1
    expect(calculateDayIndex("2026-01-13", BASE_SETTINGS).dayIndex).toBe(1);
  });

  it("起点日 1 日前は Day 6 を返す（負のオフセット）", () => {
    // offset = -1 → (((0 + (-1)) % 6) + 6) % 6 + 1 = 5 + 1 = 6
    expect(calculateDayIndex("2025-12-31", BASE_SETTINGS).dayIndex).toBe(6);
  });

  it("起点日 6 日前は Day 1 を返す（負のオフセット・サイクル境界）", () => {
    // offset = -6 → (((0 + (-6)) % 6) + 6) % 6 + 1 = 0 + 1 = 1
    expect(calculateDayIndex("2025-12-26", BASE_SETTINGS).dayIndex).toBe(1);
  });

  it("起点日 7 日前は Day 6 を返す（負のオフセット・前サイクル）", () => {
    // offset = -7 → (((0 + (-7)) % 6) + 6) % 6 + 1 = (-1 + 6) % 6 + 1 = 5 + 1 = 6
    expect(calculateDayIndex("2025-12-25", BASE_SETTINGS).dayIndex).toBe(6);
  });

  it("manualAnchorDay=3 の場合: 起点日当日は Day 3", () => {
    const s: PMSettings = { ...BASE_SETTINGS, manualAnchorDay: 3 };
    expect(calculateDayIndex("2026-01-01", s).dayIndex).toBe(3);
  });

  it("manualAnchorDay=3 の場合: 起点日翌日は Day 4", () => {
    const s: PMSettings = { ...BASE_SETTINGS, manualAnchorDay: 3 };
    expect(calculateDayIndex("2026-01-02", s).dayIndex).toBe(4);
  });

  it("cycleLength=1 の場合: 常に Day 1 を返す", () => {
    const s: PMSettings = { ...BASE_SETTINGS, cycleLength: 1 };
    expect(calculateDayIndex("2026-03-15", s).dayIndex).toBe(1);
    expect(calculateDayIndex("2025-06-01", s).dayIndex).toBe(1);
  });

  it("cycleLength=12 の大きなサイクルでも正確", () => {
    const s: PMSettings = {
      cycleLength: 12,
      manualAnchorDate: "2026-01-01",
      manualAnchorDay: 1,
    };
    expect(calculateDayIndex("2026-01-12", s).dayIndex).toBe(12);
    expect(calculateDayIndex("2026-01-13", s).dayIndex).toBe(1);
  });

  it("起点日未設定（manualAnchorDate なし）は常に Day 1 を返す", () => {
    const s: PMSettings = { cycleLength: 6 };
    expect(calculateDayIndex("2026-06-15", s).dayIndex).toBe(1);
    expect(calculateDayIndex("2025-01-01", s).dayIndex).toBe(1);
  });

  it("detectedAnchorDate が有効に使われる（manualAnchorDate なしの場合）", () => {
    const s: PMSettings = { cycleLength: 6 };
    // anchorDate=2026-01-01, target=2026-01-04 → offset=3 → Day 4
    expect(calculateDayIndex("2026-01-04", s, "2026-01-01").dayIndex).toBe(4);
  });

  it("manualAnchorDate が detectedAnchorDate より優先される", () => {
    const s: PMSettings = {
      cycleLength: 6,
      manualAnchorDate: "2026-01-01",
      manualAnchorDay: 1,
    };
    // manualAnchorDate 基準で計算 → 2026-01-03 は Day 3
    // detectedAnchorDate を 2026-02-01 にしても無視される
    expect(calculateDayIndex("2026-01-03", s, "2026-02-01").dayIndex).toBe(3);
  });
});

describe("calculateDayIndex — 単日オーバーライド", () => {
  it("isRestDay=true のオーバーライドで dayIndex=0, isRestDay=true が返る", () => {
    const s: PMSettings = {
      ...BASE_SETTINGS,
      overrides: {
        "2026-01-03": { date: "2026-01-03", isRestDay: true },
      },
    };
    const r = calculateDayIndex("2026-01-03", s);
    expect(r.dayIndex).toBe(0);
    expect(r.isRestDay).toBe(true);
    expect(r.isOverridden).toBe(true);
  });

  it("overrideDayIndex=4 のオーバーライドで dayIndex=4, isOverridden=true が返る", () => {
    const s: PMSettings = {
      ...BASE_SETTINGS,
      overrides: {
        "2026-01-05": { date: "2026-01-05", overrideDayIndex: 4 },
      },
    };
    const r = calculateDayIndex("2026-01-05", s);
    expect(r.dayIndex).toBe(4);
    expect(r.isRestDay).toBe(false);
    expect(r.isOverridden).toBe(true);
  });

  it("note を含むオーバーライドで note が返る", () => {
    const s: PMSettings = {
      ...BASE_SETTINGS,
      overrides: {
        "2026-01-10": { date: "2026-01-10", isRestDay: true, note: "外出のため" },
      },
    };
    const r = calculateDayIndex("2026-01-10", s);
    expect(r.note).toBe("外出のため");
  });

  it("オーバーライドのない日は isOverridden=false", () => {
    expect(calculateDayIndex("2026-01-01", BASE_SETTINGS).isOverridden).toBe(false);
  });

  it("オーバーライドは指定日のみに適用され、前後の日は通常計算になる", () => {
    const s: PMSettings = {
      ...BASE_SETTINGS,
      overrides: {
        "2026-01-03": { date: "2026-01-03", overrideDayIndex: 6 },
      },
    };
    // 前日 (Day 2) は通常計算
    expect(calculateDayIndex("2026-01-02", s).dayIndex).toBe(2);
    expect(calculateDayIndex("2026-01-02", s).isOverridden).toBe(false);
    // 翌日 (Day 4) は通常計算
    expect(calculateDayIndex("2026-01-04", s).dayIndex).toBe(4);
    expect(calculateDayIndex("2026-01-04", s).isOverridden).toBe(false);
  });

  it("複数のオーバーライドが設定されている場合、それぞれ独立して動作する", () => {
    const s: PMSettings = {
      ...BASE_SETTINGS,
      overrides: {
        "2026-01-02": { date: "2026-01-02", overrideDayIndex: 5 },
        "2026-01-04": { date: "2026-01-04", isRestDay: true },
      },
    };
    expect(calculateDayIndex("2026-01-02", s).dayIndex).toBe(5);
    expect(calculateDayIndex("2026-01-04", s).isRestDay).toBe(true);
    // 影響を受けない日
    expect(calculateDayIndex("2026-01-03", s).dayIndex).toBe(3);
  });
});

// ═══════════════════════════════════════════════════════════
// C. detectAnchorFromEvents — シフト自動検出
// ═══════════════════════════════════════════════════════════

describe("detectAnchorFromEvents — シフト自動検出", () => {
  it("イベントが空の場合は null を返す", () => {
    expect(detectAnchorFromEvents([])).toBeNull();
  });

  it("勤務キーワードを含まない予定のみの場合は null を返す", () => {
    const events = [
      makeEvent("誕生日パーティー", "2026-08-20"),
      makeEvent("歯科検診", "2026-08-21"),
      makeEvent("映画鑑賞", "2026-08-22"),
    ];
    expect(detectAnchorFromEvents(events)).toBeNull();
  });

  it("「日勤」を含む単日予定から起点日を検出する", () => {
    const events = [makeEvent("日勤", "2026-08-20")];
    const result = detectAnchorFromEvents(events, "2026-08-25");
    expect(result).not.toBeNull();
    expect(result?.anchorDate).toBe("2026-08-20");
    expect(result?.confidence).toBe("high");
  });

  it("連続勤務（8/20〜8/23 日勤）から初日 8/20 を起点として検出する", () => {
    const events = [
      makeEvent("日勤", "2026-08-20"),
      makeEvent("日勤", "2026-08-21"),
      makeEvent("日勤", "2026-08-22"),
      makeEvent("日勤", "2026-08-23"),
    ];
    const result = detectAnchorFromEvents(events, "2026-08-25");
    expect(result).not.toBeNull();
    expect(result?.anchorDate).toBe("2026-08-20");
    expect(result?.matchedEventTitle).toBe("日勤");
  });

  it("連続勤務の初日の前に別の勤務日がある場合は最も直近の連続開始日を返す", () => {
    // 1回目の連勤: 8/10〜8/11, 2回目の連勤: 8/20〜8/22
    // referenceDate=8/25 → 8/20 が起点
    const events = [
      makeEvent("早番(8時)", "2026-08-10"),
      makeEvent("遅番(12時)", "2026-08-11"),
      makeEvent("早番(8時)", "2026-08-20"),
      makeEvent("日勤(8時半)", "2026-08-21"),
      makeEvent("遅番(12時)", "2026-08-22"),
    ];
    const result = detectAnchorFromEvents(events, "2026-08-25");
    expect(result?.anchorDate).toBe("2026-08-20");
  });

  it("referenceDate より未来の勤務予定は無視される", () => {
    const events = [
      makeEvent("日勤(8時半)", "2026-08-20"),
      makeEvent("日勤(8時半)", "2026-09-01"), // 未来
    ];
    const result = detectAnchorFromEvents(events, "2026-08-25");
    expect(result?.anchorDate).toBe("2026-08-20");
  });

  it("referenceDate と同日の勤務予定は含まれる", () => {
    const events = [makeEvent("早番(8時)", "2026-08-25")];
    const result = detectAnchorFromEvents(events, "2026-08-25");
    expect(result?.anchorDate).toBe("2026-08-25");
  });

  it("「早番」「遅番」「日勤」を含むフォーマットを認識する", () => {
    const keywords = ["早番(8時)", "早番（9:00）", "遅番(12時)", "遅番（13:30）", "日勤(8時半)", "日勤（8:30）", "早番", "遅番", "日勤"];
    for (const kw of keywords) {
      const events = [makeEvent(kw, "2026-01-15")];
      const result = detectAnchorFromEvents(events, "2026-01-20");
      expect(result?.anchorDate).toBe("2026-01-15"),
        `キーワード「${kw}」が検出されなかった`;
    }
  });

  it("matchedEventTitle に一致したイベントのタイトルが入る", () => {
    const events = [makeEvent("早番(8時)", "2026-08-20")];
    const result = detectAnchorFromEvents(events, "2026-08-25");
    expect(result?.matchedEventTitle).toBe("早番(8時)");
  });

  it("WORK_SHIFT_KEYWORDS 正規表現が期待通りマッチする", () => {
    const validTitles = [
      "早番(8時)",
      "早番（9:00）",
      "遅番(12時)",
      "日勤(8時半)",
      "日勤",
      "早番",
      "遅番",
      "夜勤",
      "当直",
      "仕事",
      "出勤",
      "出勤　予定",
      "勤務",
      "シフト",
      "work",
      "Work Shift",
      "NIGHT SHIFT",
    ];
    for (const title of validTitles) {
      expect(WORK_SHIFT_KEYWORDS.test(title)).toBe(true);
    }
    const invalidTitles = ["誕生日", "歯科検診", "映画", "休日外出", "旅行", "買い物", "読書"];
    for (const title of invalidTitles) {
      expect(WORK_SHIFT_KEYWORDS.test(title)).toBe(false);
    }
  });
});

// ═══════════════════════════════════════════════════════════
// D. 後方互換関数
// ═══════════════════════════════════════════════════════════

describe("buildCalendarPMDates", () => {
  it("起点日未設定の場合は空 Map を返す", () => {
    const s: PMSettings = { cycleLength: 6 };
    const map = buildCalendarPMDates(s, TEMPLATES, "2026-01-01", "2026-01-07");
    expect(map.size).toBe(0);
  });

  it("1週間の範囲でテンプレートのある日だけ含まれる", () => {
    // Day1: 1/1 → t1,t2 あり
    // Day2: 1/2 → なし
    // Day3: 1/3 → t3 あり
    // Day4: 1/4 → なし
    // Day5: 1/5 → なし
    // Day6: 1/6 → t4 あり
    // Day1: 1/7 → t1,t2 あり
    const map = buildCalendarPMDates(BASE_SETTINGS, TEMPLATES, "2026-01-01", "2026-01-07");
    expect(map.has("2026-01-01")).toBe(true);
    expect(map.get("2026-01-01")).toBe(1);
    expect(map.has("2026-01-02")).toBe(false);
    expect(map.has("2026-01-03")).toBe(true);
    expect(map.get("2026-01-03")).toBe(3);
    expect(map.has("2026-01-06")).toBe(true);
    expect(map.get("2026-01-06")).toBe(6);
    expect(map.has("2026-01-07")).toBe(true);
  });

  it("休養日はデフォルトで Map に含まれない", () => {
    const s: PMSettings = {
      ...BASE_SETTINGS,
      overrides: { "2026-01-01": { date: "2026-01-01", isRestDay: true } },
    };
    const map = buildCalendarPMDates(s, TEMPLATES, "2026-01-01", "2026-01-03");
    expect(map.has("2026-01-01")).toBe(false);
  });

  it("includeRestDays=true のとき休養日は dayIndex=0 で含まれる", () => {
    const s: PMSettings = {
      ...BASE_SETTINGS,
      overrides: { "2026-01-01": { date: "2026-01-01", isRestDay: true } },
    };
    const map = buildCalendarPMDates(s, TEMPLATES, "2026-01-01", "2026-01-01", true);
    expect(map.get("2026-01-01")).toBe(0);
  });
});

describe("buildLogMapForDate", () => {
  const logs: PMLogItem[] = [
    { id: "l1", date: "2026-01-01", templateId: "t1", dayIndex: 1, title: "浴室清掃", status: "completed" },
    { id: "l2", date: "2026-01-01", templateId: "t2", dayIndex: 1, title: "洗濯", status: "skipped", skipReason: "雨天" },
    { id: "l3", date: "2026-01-02", templateId: "t3", dayIndex: 3, title: "シーツ", status: "completed" },
  ];

  it("指定日のログだけ templateId でマッピングされる", () => {
    const map = buildLogMapForDate(logs, "2026-01-01");
    expect(map.size).toBe(2);
    expect(map.get("t1")?.status).toBe("completed");
    expect(map.get("t2")?.status).toBe("skipped");
    expect(map.get("t2")?.skipReason).toBe("雨天");
    expect(map.has("t3")).toBe(false);
  });

  it("該当ログがない日は空 Map を返す", () => {
    expect(buildLogMapForDate(logs, "2026-01-05").size).toBe(0);
  });
});

describe("resolveItemStatus", () => {
  const item = TEMPLATES[0]; // t1

  it("ログが completed の場合 completed を返す", () => {
    const map = new Map<string, PMLogItem>([
      ["t1", { id: "l1", date: "2026-01-01", templateId: "t1", dayIndex: 1, title: "浴室清掃", status: "completed" }],
    ]);
    expect(resolveItemStatus(item, map)).toBe("completed");
  });

  it("ログが skipped の場合 skipped を返す", () => {
    const map = new Map<string, PMLogItem>([
      ["t1", { id: "l1", date: "2026-01-01", templateId: "t1", dayIndex: 1, title: "浴室清掃", status: "skipped" }],
    ]);
    expect(resolveItemStatus(item, map)).toBe("skipped");
  });

  it("ログが存在しない場合 pending を返す", () => {
    expect(resolveItemStatus(item, new Map())).toBe("pending");
  });
});

// ═══════════════════════════════════════════════════════════
// E. 定数 & デフォルトテンプレート
// ═══════════════════════════════════════════════════════════

describe("定数 & DEFAULT_PM_SETTINGS", () => {
  it("DEFAULT_CYCLE_LENGTH は 6", () => {
    expect(DEFAULT_CYCLE_LENGTH).toBe(6);
  });

  it("DEFAULT_PM_SETTINGS は cycleLength=6, manualAnchorDay=1 を持つ", () => {
    expect(DEFAULT_PM_SETTINGS.cycleLength).toBe(6);
    expect(DEFAULT_PM_SETTINGS.manualAnchorDay).toBe(1);
  });
});

describe("getDefaultPMTemplates", () => {
  it("テンプレートが1件以上返る", () => {
    const templates = getDefaultPMTemplates();
    expect(templates.length).toBeGreaterThan(0);
  });

  it("全テンプレートが 1〜DEFAULT_CYCLE_LENGTH の dayIndex を持つ", () => {
    const templates = getDefaultPMTemplates();
    for (const t of templates) {
      expect(t.dayIndex).toBeGreaterThanOrEqual(1);
      expect(t.dayIndex).toBeLessThanOrEqual(DEFAULT_CYCLE_LENGTH);
    }
  });

  it("全テンプレートが title と content を持つ", () => {
    const templates = getDefaultPMTemplates();
    for (const t of templates) {
      expect(t.title.length).toBeGreaterThan(0);
      expect(t.content.length).toBeGreaterThan(0);
    }
  });

  it("各 dayIndex に少なくとも1件のテンプレートが存在する", () => {
    const templates = getDefaultPMTemplates();
    const covered = new Set(templates.map((t) => t.dayIndex).filter(Boolean));
    expect(covered.size).toBeGreaterThan(0);
  });

  it("同一 dayIndex 内で order が一意", () => {
    const templates = getDefaultPMTemplates();
    const byDay = new Map<number, number[]>();
    for (const t of templates) {
      const dIndex = t.dayIndex ?? 1;
      const orders = byDay.get(dIndex) ?? [];
      orders.push(t.order);
      byDay.set(dIndex, orders);
    }
    for (const [, orders] of byDay) {
      const unique = new Set(orders);
      expect(unique.size).toBe(orders.length);
    }
  });

  it("id フィールドを含まない（Omit<PMTemplateItem, 'id'>）", () => {
    const templates = getDefaultPMTemplates();
    for (const t of templates) {
      expect((t as Record<string, unknown>)["id"]).toBeUndefined();
    }
  });
});

describe("resolveDateShiftInfo & getActivePMTasksForDate (Sprint 9 改修)", () => {
  it("勤務予定の有無から仕事日と休日を正しく判定する", () => {
    const events: CalendarEvent[] = [
      { id: "1", title: "日勤", date: "2026-08-01", startTime: "09:00", endTime: "18:00", note: "", createdAt: null },
      { id: "2", title: "早番", date: "2026-08-02", startTime: "07:00", endTime: "16:00", note: "", createdAt: null },
      { id: "3", title: "日勤", date: "2026-08-03", startTime: "09:00", endTime: "18:00", note: "", createdAt: null },
    ];

    const workDay1 = resolveDateShiftInfo("2026-08-01", events);
    expect(workDay1.isWorkDay).toBe(true);
    expect(workDay1.isRestDay).toBe(false);
    expect(workDay1.isFirstDayOfStreak).toBe(true);
    expect(workDay1.consecutiveIndex).toBe(1);

    const workDay3 = resolveDateShiftInfo("2026-08-03", events);
    expect(workDay3.isWorkDay).toBe(true);
    expect(workDay3.isLastDayOfStreak).toBe(true);
    expect(workDay3.consecutiveIndex).toBe(3);

    const restDay1 = resolveDateShiftInfo("2026-08-04", events);
    expect(restDay1.isWorkDay).toBe(false);
    expect(restDay1.isRestDay).toBe(true);
    expect(restDay1.isFirstDayOfStreak).toBe(true);
    expect(restDay1.consecutiveIndex).toBe(1);
  });

  it("シフトタイミングに応じたPMタスクを抽出する", () => {
    const events: CalendarEvent[] = [
      { id: "1", title: "日勤", date: "2026-08-01", startTime: "09:00", endTime: "18:00", note: "", createdAt: null },
    ];
    const templates: PMTemplateItem[] = [
      { id: "t1", title: "水回り掃除", content: "", timing: "rest_day_1", order: 0 },
      { id: "t2", title: "PCメンテ", content: "", timing: "work_day_1", order: 0 },
      { id: "t3", title: "休日1日目追加タスク", content: "", timing: "rest_day_1", order: 1 },
    ];
    const settings: PMSettings = { cycleLength: 6 };

    // 2026-08-01: 出勤1日目
    const workTasks = getActivePMTasksForDate("2026-08-01", templates, events, settings);
    expect(workTasks.map((t: PMTemplateItem) => t.id)).toEqual(["t2"]);

    // 2026-08-02: 休日1日目
    const restTasks = getActivePMTasksForDate("2026-08-02", templates, events, settings);
    expect(restTasks.map((t: PMTemplateItem) => t.id)).toEqual(["t1", "t3"]);
  });

  it("resolveShiftInfo が手動オーバーライドを最優先で適用する", () => {
    const events: CalendarEvent[] = [
      { id: "1", title: "日勤", date: "2026-08-10", startTime: "09:00", endTime: "18:00", note: "", createdAt: null },
    ];
    const settings: PMSettings = {
      cycleLength: 6,
      overrides: {
        "2026-08-10": {
          date: "2026-08-10",
          type: "holiday",
          streakNumber: 2,
          shiftName: "急遽有休",
          updatedAt: "2026-08-10T00:00:00Z",
        },
      },
    };

    // 本来は日勤（出勤）だが、手動オーバーライドで「休日 2日目」が返る
    const shift = resolveShiftInfo("2026-08-10", events, settings);
    expect(shift.type).toBe("holiday");
    expect(shift.streakNumber).toBe(2);
    expect(shift.shiftName).toBe("急遽有休");
    expect(shift.isOverridden).toBe(true);

    // オーバーライドのない日は自動判定される
    const shiftNext = resolveShiftInfo("2026-08-11", events, settings);
    expect(shiftNext.type).toBe("holiday");
    expect(shiftNext.streakNumber).toBe(1);
    expect(shiftNext.isOverridden).toBe(false);
  });

  it("Googleカレンダーの「出勤予定」というタイトルから出勤日と連続日数を高精度に自動判定する", () => {
    const events: CalendarEvent[] = [
      { id: "e1", title: "早番(8時)", date: "2026-08-25", startTime: "08:00", endTime: "17:00", note: "", createdAt: null },
      { id: "e2", title: "遅番(12時)", date: "2026-08-26", startTime: "12:00", endTime: "21:00", note: "", createdAt: null },
    ];
    const shiftDay1 = resolveShiftInfo("2026-08-25", events);
    expect(shiftDay1.type).toBe("work");
    expect(shiftDay1.streakNumber).toBe(1);
    expect(shiftDay1.shiftName).toBe("早番(8時)");

    const shiftDay2 = resolveShiftInfo("2026-08-26", events);
    expect(shiftDay2.type).toBe("work");
    expect(shiftDay2.streakNumber).toBe(2);
  });

  it("一昨日が出勤で昨日・今日が休みの場合、今日が自動的に「休日 2日目」と判定される", () => {
    const events: CalendarEvent[] = [
      { id: "e1", title: "日勤(8時半)", date: "2026-08-23", startTime: "08:30", endTime: "17:30", note: "", createdAt: null },
    ];
    // 8月24日: 休日1日目
    const shiftAug24 = resolveShiftInfo("2026-08-24", events);
    expect(shiftAug24.type).toBe("holiday");
    expect(shiftAug24.streakNumber).toBe(1);

    // 8月25日: 休日2日目
    const shiftAug25 = resolveShiftInfo("2026-08-25", events);
    expect(shiftAug25.type).toBe("holiday");
    expect(shiftAug25.streakNumber).toBe(2);
  });

  it("手動オーバーライドで「休日 2日目」に指定した場合、イベントの有無に関わらず確実に適用される", () => {
    const settings: PMSettings = {
      cycleLength: 6,
      overrides: {
        "2026-08-25": {
          date: "2026-08-25",
          type: "holiday",
          streakNumber: 2,
          updatedAt: new Date().toISOString(),
        },
      },
    };
    const shift = resolveShiftInfo("2026-08-25", [], settings);
    expect(shift.type).toBe("holiday");
    expect(shift.streakNumber).toBe(2);
    expect(shift.isOverridden).toBe(true);
  });

  it("3日連続出勤 ➔ 3日連続休日のシフト遷移が全日で完全に算出される", () => {
    const events: CalendarEvent[] = [
      { id: "e1", title: "早番(8時)", date: "2026-08-20", startTime: "08:00", endTime: "17:00", note: "", createdAt: null },
      { id: "e2", title: "日勤(8時半)", date: "2026-08-21", startTime: "08:30", endTime: "17:30", note: "", createdAt: null },
      { id: "e3", title: "遅番(12時)", date: "2026-08-22", startTime: "12:00", endTime: "21:00", note: "", createdAt: null },
    ];

    // 出勤期間
    const d1 = resolveShiftInfo("2026-08-20", events);
    expect(d1.type).toBe("work");
    expect(d1.streakNumber).toBe(1);
    expect(d1.shiftName).toBe("早番(8時)");

    const d2 = resolveShiftInfo("2026-08-21", events);
    expect(d2.type).toBe("work");
    expect(d2.streakNumber).toBe(2);

    const d3 = resolveShiftInfo("2026-08-22", events);
    expect(d3.type).toBe("work");
    expect(d3.streakNumber).toBe(3);
    expect(d3.shiftName).toBe("遅番(12時)");

    // 休日期間（予定なし）
    const h1 = resolveShiftInfo("2026-08-23", events);
    expect(h1.type).toBe("holiday");
    expect(h1.streakNumber).toBe(1);

    const h2 = resolveShiftInfo("2026-08-24", events);
    expect(h2.type).toBe("holiday");
    expect(h2.streakNumber).toBe(2);

    const h3 = resolveShiftInfo("2026-08-25", events);
    expect(h3.type).toBe("holiday");
    expect(h3.streakNumber).toBe(3);
  });

  it("明示的な「公休」「有休」予定が含まれる場合も正しく休日ステータスとシフト名が算出される", () => {
    const events: CalendarEvent[] = [
      { id: "e1", title: "日勤", date: "2026-08-20", startTime: "09:00", endTime: "18:00", note: "", createdAt: null },
      { id: "e2", title: "公休", date: "2026-08-21", startTime: "", endTime: "", note: "", createdAt: null },
      { id: "e3", title: "有休", date: "2026-08-22", startTime: "", endTime: "", note: "", createdAt: null },
    ];

    const h1 = resolveShiftInfo("2026-08-21", events);
    expect(h1.type).toBe("holiday");
    expect(h1.streakNumber).toBe(1);
    expect(h1.shiftName).toBe("公休");

    const h2 = resolveShiftInfo("2026-08-22", events);
    expect(h2.type).toBe("holiday");
    expect(h2.streakNumber).toBe(2);
    expect(h2.shiftName).toBe("有休");
  });

  it("飛び石シフト（1日出勤 ➔ 1日休み ➔ 1日出勤）で連日カウントが適切にリセットされる", () => {
    const events: CalendarEvent[] = [
      { id: "e1", title: "日勤", date: "2026-08-20", startTime: "09:00", endTime: "18:00", note: "", createdAt: null },
      { id: "e2", title: "日勤", date: "2026-08-22", startTime: "09:00", endTime: "18:00", note: "", createdAt: null },
    ];

    const d1 = resolveShiftInfo("2026-08-20", events);
    expect(d1.type).toBe("work");
    expect(d1.streakNumber).toBe(1);

    const h1 = resolveShiftInfo("2026-08-21", events);
    expect(h1.type).toBe("holiday");
    expect(h1.streakNumber).toBe(1);

    const d2 = resolveShiftInfo("2026-08-22", events);
    expect(d2.type).toBe("work");
    expect(d2.streakNumber).toBe(1); // 休日を挟んだため再び 1日目
  });

  it("【全日ストレステスト】1年365日のすべての日付で例外なく有効なシフトが高速に算出される", () => {
    const sampleEvents: CalendarEvent[] = [
      { id: "e1", title: "日勤", date: "2026-01-05", startTime: "09:00", endTime: "18:00", note: "", createdAt: null },
      { id: "e2", title: "日勤", date: "2026-01-06", startTime: "09:00", endTime: "18:00", note: "", createdAt: null },
      { id: "e3", title: "出勤予定", date: "2026-06-15", startTime: "09:00", endTime: "18:00", note: "", createdAt: null },
      { id: "e4", title: "夜勤", date: "2026-08-20", startTime: "17:00", endTime: "09:00", note: "", createdAt: null },
    ];

    const startDate = new Date(2026, 0, 1);
    for (let dayOffset = 0; dayOffset < 365; dayOffset++) {
      const cur = new Date(startDate.getTime() + dayOffset * 86_400_000);
      const y = cur.getFullYear();
      const m = String(cur.getMonth() + 1).padStart(2, "0");
      const d = String(cur.getDate()).padStart(2, "0");
      const dateStr = `${y}-${m}-${d}`;

      const res = resolveShiftInfo(dateStr, sampleEvents);
      expect(res).toBeDefined();
      expect(res.date).toBe(dateStr);
      expect(res.streakNumber).toBeGreaterThanOrEqual(1);
    }
  });

  it("終日予定・時間指定予定の双方が type: 'work' として正しく判定される", () => {
    const allDayEvent: CalendarEvent = {
      id: "e-all-day",
      title: "出勤",
      date: "2026-09-01",
      startTime: "",
      endTime: "",
      note: "",
      createdAt: null,
    };
    const timedEvent: CalendarEvent = {
      id: "e-timed",
      title: "夜勤",
      date: "2026-09-02",
      startTime: "17:00",
      endTime: "09:00",
      note: "",
      createdAt: null,
    };

    const resAllDay = resolveShiftInfo("2026-09-01", [allDayEvent, timedEvent]);
    expect(resAllDay.type).toBe("work");
    expect(resAllDay.streakNumber).toBe(1);
    expect(resAllDay.shiftName).toBe("出勤");

    const resTimed = resolveShiftInfo("2026-09-02", [allDayEvent, timedEvent]);
    expect(resTimed.type).toBe("work");
    expect(resTimed.streakNumber).toBe(2);
    expect(resTimed.shiftName).toBe("夜勤");
  });

  it("イベント名に「仕事」「出勤」「早番」「遅番」「日勤」「夜勤」等が含まれる場合の表記揺れ・大文字小文字を正しく判定する", () => {
    const events: CalendarEvent[] = [
      { id: "e1", title: "仕事（東京オフィス）", date: "2026-09-10", startTime: "09:00", endTime: "18:00", note: "", createdAt: null },
      { id: "e2", title: "出勤　早番", date: "2026-09-11", startTime: "08:00", endTime: "17:00", note: "", createdAt: null },
      { id: "e3", title: "当直 勤務", date: "2026-09-12", startTime: "17:00", endTime: "09:00", note: "", createdAt: null },
      { id: "e4", title: "Day Shift work", date: "2026-09-13", startTime: "09:00", endTime: "18:00", note: "", createdAt: null },
    ];

    expect(resolveShiftInfo("2026-09-10", events).type).toBe("work");
    expect(resolveShiftInfo("2026-09-11", events).type).toBe("work");
    expect(resolveShiftInfo("2026-09-12", events).type).toBe("work");
    expect(resolveShiftInfo("2026-09-13", events).type).toBe("work");
  });

  it("手動上書き（ShiftOverride: holiday / work）がカレンダーの推論よりも最優先で適用される", () => {
    const workEvents: CalendarEvent[] = [
      { id: "e1", title: "日勤", date: "2026-09-20", startTime: "09:00", endTime: "18:00", note: "", createdAt: null },
      { id: "e2", title: "日勤", date: "2026-09-21", startTime: "09:00", endTime: "18:00", note: "", createdAt: null },
    ];

    // 2026-09-20 はカレンダー上は出勤だが、手動で「休日 1日目」にオーバーライド
    const settingsHoliday: PMSettings = {
      cycleLength: 6,
      overrides: {
        "2026-09-20": {
          date: "2026-09-20",
          type: "holiday",
          streakNumber: 1,
          shiftName: "有休取得",
          updatedAt: "2026-09-20T00:00:00Z",
        },
      },
    };

    const shiftHoliday = resolveShiftInfo("2026-09-20", workEvents, settingsHoliday);
    expect(shiftHoliday.type).toBe("holiday");
    expect(shiftHoliday.streakNumber).toBe(1);
    expect(shiftHoliday.shiftName).toBe("有休取得");
    expect(shiftHoliday.isOverridden).toBe(true);

    const dayInfoHoliday = calculateDayIndex("2026-09-20", settingsHoliday);
    expect(dayInfoHoliday.isRestDay).toBe(true);
    expect(dayInfoHoliday.isOverridden).toBe(true);

    // 予定がない日を手動で「出勤 3日目 (遅番)」にオーバーライド
    const settingsWork: PMSettings = {
      cycleLength: 6,
      overrides: {
        "2026-09-25": {
          date: "2026-09-25",
          type: "work",
          streakNumber: 3,
          shiftName: "遅番",
          updatedAt: "2026-09-25T00:00:00Z",
        },
      },
    };

    const shiftWork = resolveShiftInfo("2026-09-25", [], settingsWork);
    expect(shiftWork.type).toBe("work");
    expect(shiftWork.streakNumber).toBe(3);
    expect(shiftWork.shiftName).toBe("遅番");
    expect(shiftWork.isOverridden).toBe(true);

    const dayInfoWork = calculateDayIndex("2026-09-25", settingsWork);
    expect(dayInfoWork.dayIndex).toBe(3);
    expect(dayInfoWork.isRestDay).toBe(false);
    expect(dayInfoWork.isOverridden).toBe(true);
  });

  it("isWorkEvent が各キーワードに対して正しく判定する", () => {
    expect(isWorkEvent("仕事")).toBe(true);
    expect(isWorkEvent("出勤")).toBe(true);
    expect(isWorkEvent("早番")).toBe(true);
    expect(isWorkEvent("遅番")).toBe(true);
    expect(isWorkEvent("日勤")).toBe(true);
    expect(isWorkEvent("夜勤")).toBe(true);
    expect(isWorkEvent("当直")).toBe(true);
    expect(isWorkEvent("勤務")).toBe(true);
    expect(isWorkEvent("シフト")).toBe(true);
    expect(isWorkEvent("work")).toBe(true);
    expect(isWorkEvent("SHIFT")).toBe(true);
    expect(isWorkEvent("  出勤 9:00 ")).toBe(true);
    expect(isWorkEvent("")).toBe(false);
    expect(isWorkEvent(null)).toBe(false);
    expect(isWorkEvent(undefined)).toBe(false);
    expect(isWorkEvent("歯医者")).toBe(false);
    expect(isWorkEvent("映画鑑賞")).toBe(false);
  });

  describe("calculateFourTwoCycleRange (4勤2休サイクル算出)", () => {
    // 4勤2休（出勤4日＋休日2日）のイベント
    // 2026-09-01〜04: 出勤
    // 2026-09-05〜06: 休日
    const sampleEvents: CalendarEvent[] = [
      { id: "e1", title: "早番", date: "2026-09-01", startTime: "07:00", endTime: "16:00", note: "", createdAt: null },
      { id: "e2", title: "早番", date: "2026-09-02", startTime: "07:00", endTime: "16:00", note: "", createdAt: null },
      { id: "e3", title: "遅番", date: "2026-09-03", startTime: "13:00", endTime: "22:00", note: "", createdAt: null },
      { id: "e4", title: "遅番", date: "2026-09-04", startTime: "13:00", endTime: "22:00", note: "", createdAt: null },
    ];

    it("出勤1日目（2026-09-01）のとき、2026-09-01〜06 の6日間が算出されること", () => {
      const cycle = calculateFourTwoCycleRange("2026-09-01", sampleEvents);
      expect(cycle.startDate).toBe("2026-09-01");
      expect(cycle.endDate).toBe("2026-09-06");
      expect(cycle.days).toHaveLength(6);
      expect(cycle.days[0].shift.type).toBe("work");
      expect(cycle.days[0].shift.streakNumber).toBe(1);
      expect(cycle.days[3].shift.type).toBe("work");
      expect(cycle.days[3].shift.streakNumber).toBe(4);
      expect(cycle.days[4].shift.type).toBe("holiday");
      expect(cycle.days[5].shift.type).toBe("holiday");
    });

    it("出勤3日目（2026-09-03）のときも、同じ 2026-09-01〜06 の6日間が算出されること", () => {
      const cycle = calculateFourTwoCycleRange("2026-09-03", sampleEvents);
      expect(cycle.startDate).toBe("2026-09-01");
      expect(cycle.endDate).toBe("2026-09-06");
      expect(cycle.days[2].date).toBe("2026-09-03");
      expect(cycle.days[2].shift.shiftName).toBe("遅番");
    });

    it("休日1日目（2026-09-05）のとき、直前の4勤と合わせた 2026-09-01〜06 の6日間が算出されること", () => {
      const cycle = calculateFourTwoCycleRange("2026-09-05", sampleEvents);
      expect(cycle.startDate).toBe("2026-09-01");
      expect(cycle.endDate).toBe("2026-09-06");
      expect(cycle.days[4].date).toBe("2026-09-05");
      expect(cycle.days[4].shift.type).toBe("holiday");
    });

    it("休日2日目（2026-09-06）のとき、直前の4勤と合わせた 2026-09-01〜06 の6日間が算出されること", () => {
      const cycle = calculateFourTwoCycleRange("2026-09-06", sampleEvents);
      expect(cycle.startDate).toBe("2026-09-01");
      expect(cycle.endDate).toBe("2026-09-06");
      expect(cycle.days[5].date).toBe("2026-09-06");
      expect(cycle.days[5].shift.type).toBe("holiday");
    });

    it("手動アンカー設定がある場合、循環計算で6日間が算出されること", () => {
      const settings: PMSettings = {
        cycleLength: 6,
        manualAnchorDate: "2026-09-01",
        manualAnchorDay: 1,
      };
      const cycle = calculateFourTwoCycleRange("2026-09-03", [], settings);
      expect(cycle.startDate).toBe("2026-09-01");
      expect(cycle.endDate).toBe("2026-09-06");
      expect(cycle.days).toHaveLength(6);
    });

    it("getFourDayWorkBlock: 4連勤ブロック（出勤1〜4日目）の4日間配列が正しく抽出されること", () => {
      // 出勤1日目起点
      const block1 = getFourDayWorkBlock("2026-09-01", sampleEvents);
      expect(block1).toEqual(["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"]);

      // 出勤3日目起点でも同じ4日間が抽出されること
      const block3 = getFourDayWorkBlock("2026-09-03", sampleEvents);
      expect(block3).toEqual(["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"]);

      // 出勤4日目起点でも同じ4日間が抽出されること
      const block4 = getFourDayWorkBlock("2026-09-04", sampleEvents);
      expect(block4).toEqual(["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"]);
    });

    it("settings が null または undefined でもクラッシュせず安全にフォールバックする", () => {
      // getFourDayWorkBlock
      expect(() => getFourDayWorkBlock("2026-09-03", [], null)).not.toThrow();
      expect(() => getFourDayWorkBlock("2026-09-03", [], undefined)).not.toThrow();
      expect(getFourDayWorkBlock("2026-09-03", [], null)).toHaveLength(4);

      // calculateFourTwoCycleRange
      expect(() => calculateFourTwoCycleRange("2026-09-03", [], null)).not.toThrow();
      expect(() => calculateFourTwoCycleRange("2026-09-03", [], undefined)).not.toThrow();
      const cycle = calculateFourTwoCycleRange("2026-09-03", [], null);
      expect(cycle.days).toHaveLength(6);

      // calculateDayIndex
      expect(() => calculateDayIndex("2026-09-03", null)).not.toThrow();
      expect(() => calculateDayIndex("2026-09-03", undefined)).not.toThrow();
      const dayInfo = calculateDayIndex("2026-09-03", null);
      expect(dayInfo.cycleLength).toBe(6);

      // getActivePMTasksForDate with templates
      const templates: PMTemplateItem[] = [
        { id: "t1", title: "タスク1", content: "", timing: "rest_day_1", order: 0, enabled: true },
        { id: "t2", title: "カスタムタスク", content: "", timing: "work_day_1", dayIndex: 1, order: 1, enabled: true },
        { id: "t3", title: "レガシータスク", content: "", dayIndex: 2, order: 2, enabled: true },
      ];
      expect(() => getActivePMTasksForDate("2026-09-03", templates, [], null)).not.toThrow();
      expect(() => getActivePMTasksForDate("2026-09-03", templates, [], undefined)).not.toThrow();
    });
  });

  // ═══════════════════════════════════════════════════════════
  // J. 実施タイミング（休日/早番/遅番/出勤の何日目）＆ 隔週（サイクル頻度）機能テスト
  // ═══════════════════════════════════════════════════════════
  describe("実施タイミング（休日/早番/遅番/出勤の何日目）＆ 隔週機能", () => {
    // 4勤2休ローテーションイベント（早番2日 → 遅番2日 → 休日2日）
    // サイクル0: 2026-09-01(早番1), 09-02(早番2), 09-03(遅番1), 09-04(遅番2), 09-05(公休1), 09-06(公休2)
    // サイクル1: 2026-09-07(早番1), 09-08(早番2), 09-09(遅番1), 09-10(遅番2), 09-11(公休1), 09-12(公休2)
    const rotationEvents: CalendarEvent[] = [
      // サイクル0
      makeEvent("早番", "2026-09-01"),
      makeEvent("早番", "2026-09-02"),
      makeEvent("遅番", "2026-09-03"),
      makeEvent("遅番", "2026-09-04"),
      makeEvent("公休", "2026-09-05"),
      makeEvent("公休", "2026-09-06"),
      // サイクル1
      makeEvent("早番", "2026-09-07"),
      makeEvent("早番", "2026-09-08"),
      makeEvent("遅番", "2026-09-09"),
      makeEvent("遅番", "2026-09-10"),
      makeEvent("公休", "2026-09-11"),
      makeEvent("公休", "2026-09-12"),
    ];

    const cycleSettings: PMSettings = {
      cycleLength: 6,
      manualAnchorDate: "2026-09-01",
      manualAnchorDay: 1,
    };

    it("早番・遅番の判定関数（isEarlyShiftEvent / isLateShiftEvent）が正確に判定できること", () => {
      expect(isEarlyShiftEvent("早番")).toBe(true);
      expect(isEarlyShiftEvent("早番 8:30-17:00")).toBe(true);
      expect(isEarlyShiftEvent("遅番")).toBe(false);
      expect(isEarlyShiftEvent("日勤")).toBe(false);
      expect(isEarlyShiftEvent(null)).toBe(false);

      expect(isLateShiftEvent("遅番")).toBe(true);
      expect(isLateShiftEvent("遅番 11:00-19:30")).toBe(true);
      expect(isLateShiftEvent("早番")).toBe(false);
      expect(isLateShiftEvent("当直")).toBe(false);
      expect(isLateShiftEvent(undefined)).toBe(false);
    });

    it("4勤2休ローテーションの各日で早番/遅番の連続日数が正確に解決されること", () => {
      // 9/1: 早番1日目, 出勤1日目
      const d1 = resolveDateShiftInfo("2026-09-01", rotationEvents, cycleSettings);
      expect(d1.isWorkDay).toBe(true);
      expect(d1.isEarlyShift).toBe(true);
      expect(d1.earlyStreakIndex).toBe(1);
      expect(d1.consecutiveIndex).toBe(1); // 出勤1日目

      // 9/2: 早番2日目, 出勤2日目
      const d2 = resolveDateShiftInfo("2026-09-02", rotationEvents, cycleSettings);
      expect(d2.isWorkDay).toBe(true);
      expect(d2.isEarlyShift).toBe(true);
      expect(d2.earlyStreakIndex).toBe(2);
      expect(d2.consecutiveIndex).toBe(2); // 出勤2日目

      // 9/3: 遅番1日目, 出勤3日目
      const d3 = resolveDateShiftInfo("2026-09-03", rotationEvents, cycleSettings);
      expect(d3.isWorkDay).toBe(true);
      expect(d3.isLateShift).toBe(true);
      expect(d3.lateStreakIndex).toBe(1);
      expect(d3.consecutiveIndex).toBe(3); // 出勤3日目

      // 9/4: 遅番2日目, 出勤4日目
      const d4 = resolveDateShiftInfo("2026-09-04", rotationEvents, cycleSettings);
      expect(d4.isWorkDay).toBe(true);
      expect(d4.isLateShift).toBe(true);
      expect(d4.lateStreakIndex).toBe(2);
      expect(d4.consecutiveIndex).toBe(4); // 出勤4日目

      // 9/5: 休日1日目
      const d5 = resolveDateShiftInfo("2026-09-05", rotationEvents, cycleSettings);
      expect(d5.isRestDay).toBe(true);
      expect(d5.consecutiveIndex).toBe(1); // 休日1日目

      // 9/6: 休日2日目
      const d6 = resolveDateShiftInfo("2026-09-06", rotationEvents, cycleSettings);
      expect(d6.isRestDay).toBe(true);
      expect(d6.consecutiveIndex).toBe(2); // 休日2日目
    });

    it("「早番何日目」「遅番何日目」「出勤何日目」「休日何日目」のタスクが該当日のみ抽出されること", () => {
      const timingTemplates: PMTemplateItem[] = [
        { id: "t-early-1", title: "早番1日目タスク", content: "", timingCategory: "early_shift", timingDay: 1, order: 0 },
        { id: "t-early-2", title: "早番2日目タスク", content: "", timingCategory: "early_shift", timingDay: 2, order: 1 },
        { id: "t-late-1", title: "遅番1日目タスク", content: "", timingCategory: "late_shift", timingDay: 1, order: 2 },
        { id: "t-late-2", title: "遅番2日目タスク", content: "", timingCategory: "late_shift", timingDay: 2, order: 3 },
        { id: "t-work-3", title: "出勤3日目タスク", content: "", timingCategory: "work_day", timingDay: 3, order: 4 },
        { id: "t-rest-1", title: "休日1日目タスク", content: "", timingCategory: "holiday", timingDay: 1, order: 5 },
        { id: "t-rest-2", title: "休日2日目タスク", content: "", timingCategory: "holiday", timingDay: 2, order: 6 },
      ];

      // 9/1 (早番1日目)
      const tasks1 = getActivePMTasksForDate("2026-09-01", timingTemplates, rotationEvents, cycleSettings);
      expect(tasks1.map((t) => t.id)).toEqual(["t-early-1"]);

      // 9/2 (早番2日目)
      const tasks2 = getActivePMTasksForDate("2026-09-02", timingTemplates, rotationEvents, cycleSettings);
      expect(tasks2.map((t) => t.id)).toEqual(["t-early-2"]);

      // 9/3 (遅番1日目 ＆ 出勤3日目)
      const tasks3 = getActivePMTasksForDate("2026-09-03", timingTemplates, rotationEvents, cycleSettings);
      expect(tasks3.map((t) => t.id)).toEqual(["t-late-1", "t-work-3"]);

      // 9/4 (遅番2日目)
      const tasks4 = getActivePMTasksForDate("2026-09-04", timingTemplates, rotationEvents, cycleSettings);
      expect(tasks4.map((t) => t.id)).toEqual(["t-late-2"]);

      // 9/5 (休日1日目)
      const tasks5 = getActivePMTasksForDate("2026-09-05", timingTemplates, rotationEvents, cycleSettings);
      expect(tasks5.map((t) => t.id)).toEqual(["t-rest-1"]);

      // 9/6 (休日2日目)
      const tasks6 = getActivePMTasksForDate("2026-09-06", timingTemplates, rotationEvents, cycleSettings);
      expect(tasks6.map((t) => t.id)).toEqual(["t-rest-2"]);
    });

    it("後方互換形式の timing 文字列（early_shift_1, late_shift_2 等）でも同様に正しくマッチすること", () => {
      const legacyTimingTemplates: PMTemplateItem[] = [
        { id: "t-leg-early-1", title: "早番1文字列", content: "", timing: "early_shift_1", order: 0 },
        { id: "t-leg-late-2", title: "遅番2文字列", content: "", timing: "late_shift_2", order: 1 },
      ];

      // 9/1 は early_shift_1
      const res1 = getActivePMTasksForDate("2026-09-01", legacyTimingTemplates, rotationEvents, cycleSettings);
      expect(res1.map((t) => t.id)).toEqual(["t-leg-early-1"]);

      // 9/4 は late_shift_2
      const res4 = getActivePMTasksForDate("2026-09-04", legacyTimingTemplates, rotationEvents, cycleSettings);
      expect(res4.map((t) => t.id)).toEqual(["t-leg-late-2"]);
    });

    it("isTemplateActiveForDate: 単一テンプレートに対する直接の判定が正確に動作すること", () => {
      const d1 = resolveDateShiftInfo("2026-09-01", rotationEvents, cycleSettings);
      const earlyTpl: PMTemplateItem = { id: "e1", title: "早番", content: "", timingCategory: "early_shift", timingDay: 1, order: 0 };
      const lateTpl: PMTemplateItem = { id: "l1", title: "遅番", content: "", timingCategory: "late_shift", timingDay: 1, order: 0 };

      expect(isTemplateActiveForDate(earlyTpl, d1, "2026-09-01", cycleSettings, undefined, rotationEvents)).toBe(true);
      expect(isTemplateActiveForDate(lateTpl, d1, "2026-09-01", cycleSettings, undefined, rotationEvents)).toBe(false);
    });

    it("calculateCycleIndex: 通算サイクル番号が正確に算出されること", () => {
      // サイクル0（2026-09-01〜09-06）
      expect(calculateCycleIndex("2026-09-01", rotationEvents, cycleSettings)).toBe(0);
      expect(calculateCycleIndex("2026-09-06", rotationEvents, cycleSettings)).toBe(0);

      // サイクル1（2026-09-07〜09-12）
      expect(calculateCycleIndex("2026-09-07", rotationEvents, cycleSettings)).toBe(1);
      expect(calculateCycleIndex("2026-09-12", rotationEvents, cycleSettings)).toBe(1);
    });

    it("隔週機能（cycleInterval = 2）: 毎サイクル実施と隔週実施（グループA / グループB）が正確に動作すること", () => {
      const biWeeklyTemplates: PMTemplateItem[] = [
        // 毎サイクルの早番1日目
        { id: "t-every", title: "毎サイクル早番1", content: "", timingCategory: "early_shift", timingDay: 1, cycleInterval: 1, order: 0 },
        // 2サイクルに1回 (グループA: cycleIndex % 2 === 0)
        { id: "t-bi-a", title: "隔週A早番1", content: "", timingCategory: "early_shift", timingDay: 1, cycleInterval: 2, cycleIntervalOffset: 0, order: 1 },
        // 2サイクルに1回 (グループB: cycleIndex % 2 === 1)
        { id: "t-bi-b", title: "隔週B早番1", content: "", timingCategory: "early_shift", timingDay: 1, cycleInterval: 2, cycleIntervalOffset: 1, order: 2 },
      ];

      // サイクル0の早番1日目（2026-09-01）
      // cycleIndex = 0 → 毎サイクル + 隔週A が抽出される
      const cycle0Tasks = getActivePMTasksForDate("2026-09-01", biWeeklyTemplates, rotationEvents, cycleSettings);
      expect(cycle0Tasks.map((t) => t.id)).toEqual(["t-every", "t-bi-a"]);

      // サイクル1の早番1日目（2026-09-07）
      // cycleIndex = 1 → 毎サイクル + 隔週B が抽出される（隔週Aはスキップされる）
      const cycle1Tasks = getActivePMTasksForDate("2026-09-07", biWeeklyTemplates, rotationEvents, cycleSettings);
      expect(cycle1Tasks.map((t) => t.id)).toEqual(["t-every", "t-bi-b"]);
    });

    it("表示用ラベル生成関数（getPMTemplateTimingLabel / getPMTemplateCycleLabel）が適切なテキストを返すこと", () => {
      expect(getPMTemplateTimingLabel({ id: "1", title: "", content: "", timingCategory: "early_shift", timingDay: 2, order: 0 })).toBe("早番2日目");
      expect(getPMTemplateTimingLabel({ id: "2", title: "", content: "", timingCategory: "late_shift", timingDay: 1, order: 0 })).toBe("遅番1日目");
      expect(getPMTemplateTimingLabel({ id: "3", title: "", content: "", timingCategory: "holiday", timingDay: 1, order: 0 })).toBe("休日1日目");
      expect(getPMTemplateTimingLabel({ id: "4", title: "", content: "", timingCategory: "work_day", timingDay: 4, order: 0 })).toBe("出勤4日目");
      expect(getPMTemplateTimingLabel({ id: "5", title: "", content: "", timing: "early_shift_1", order: 0 })).toBe("早番1日目");

      expect(getPMTemplateCycleLabel({ id: "1", title: "", content: "", cycleInterval: 1, order: 0 })).toBe("毎サイクル");
      expect(getPMTemplateCycleLabel({ id: "2", title: "", content: "", cycleInterval: 2, cycleIntervalOffset: 0, order: 0 })).toBe("2サイクルに1回 (グループA)");
      expect(getPMTemplateCycleLabel({ id: "3", title: "", content: "", cycleInterval: 2, cycleIntervalOffset: 1, order: 0 })).toBe("2サイクルに1回 (グループB)");
      expect(getPMTemplateCycleLabel({ id: "4", title: "", content: "", cycleInterval: 3, order: 0 })).toBe("3サイクルに1回");
      expect(getPMTemplateCycleLabel({ id: "5", title: "", content: "", cycleInterval: 3, cycleIntervalOffset: 1, order: 0 })).toBe("3サイクルに1回 (グループB)");
    });
  });
});



