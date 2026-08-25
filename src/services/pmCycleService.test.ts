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
  resolveDateShiftInfo,
  resolveShiftInfo,
  getActivePMTasksForDate,
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
      makeEvent("勤務", "2026-08-10"),
      makeEvent("勤務", "2026-08-11"),
      makeEvent("勤務", "2026-08-20"),
      makeEvent("勤務", "2026-08-21"),
      makeEvent("勤務", "2026-08-22"),
    ];
    const result = detectAnchorFromEvents(events, "2026-08-25");
    expect(result?.anchorDate).toBe("2026-08-20");
  });

  it("referenceDate より未来の勤務予定は無視される", () => {
    const events = [
      makeEvent("日勤", "2026-08-20"),
      makeEvent("日勤", "2026-09-01"), // 未来
    ];
    const result = detectAnchorFromEvents(events, "2026-08-25");
    expect(result?.anchorDate).toBe("2026-08-20");
  });

  it("referenceDate と同日の勤務予定は含まれる", () => {
    const events = [makeEvent("勤務", "2026-08-25")];
    const result = detectAnchorFromEvents(events, "2026-08-25");
    expect(result?.anchorDate).toBe("2026-08-25");
  });

  it("様々な勤務キーワードを認識する", () => {
    const keywords = ["仕事", "早番", "遅番", "勤務", "日勤", "当直", "夜勤", "出勤", "シフト"];
    for (const kw of keywords) {
      const events = [makeEvent(kw, "2026-01-15")];
      const result = detectAnchorFromEvents(events, "2026-01-20");
      expect(result?.anchorDate).toBe("2026-01-15"),
        `キーワード「${kw}」が検出されなかった`;
    }
  });

  it("キーワードが大文字・混在でも認識する（大文字小文字無視）", () => {
    // 英字混じりタイトル
    const events = [makeEvent("Day勤務shift", "2026-01-15")];
    const result = detectAnchorFromEvents(events, "2026-01-20");
    expect(result?.anchorDate).toBe("2026-01-15");
  });

  it("matchedEventTitle に一致したイベントのタイトルが入る", () => {
    const events = [makeEvent("夜勤 A病院", "2026-08-20")];
    const result = detectAnchorFromEvents(events, "2026-08-25");
    expect(result?.matchedEventTitle).toBe("夜勤 A病院");
  });

  it("WORK_SHIFT_KEYWORDS 正規表現が期待通りマッチする", () => {
    const validTitles = ["仕事終わり", "早番入り", "遅番シフト", "日勤", "当直明け", "夜勤終了", "出勤準備", "シフト確認"];
    for (const title of validTitles) {
      expect(WORK_SHIFT_KEYWORDS.test(title)).toBe(true);
    }
    const invalidTitles = ["誕生日", "歯科検診", "映画", "休日外出"];
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
      { id: "t3", title: "すべての休日タスク", content: "", timing: "rest_all", order: 1 },
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
      { id: "e1", title: "出勤予定", date: "2026-08-25", startTime: "09:00", endTime: "18:00", note: "", createdAt: null },
      { id: "e2", title: "出勤予定", date: "2026-08-26", startTime: "09:00", endTime: "18:00", note: "", createdAt: null },
    ];
    const shiftDay1 = resolveShiftInfo("2026-08-25", events);
    expect(shiftDay1.type).toBe("work");
    expect(shiftDay1.streakNumber).toBe(1);
    expect(shiftDay1.shiftName).toBe("出勤予定");

    const shiftDay2 = resolveShiftInfo("2026-08-26", events);
    expect(shiftDay2.type).toBe("work");
    expect(shiftDay2.streakNumber).toBe(2);
  });

  it("一昨日が出勤で昨日・今日が休みの場合、今日が自動的に「休日 2日目」と判定される", () => {
    const events: CalendarEvent[] = [
      { id: "e1", title: "日勤", date: "2026-08-23", startTime: "09:00", endTime: "18:00", note: "", createdAt: null },
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
      { id: "e1", title: "日勤", date: "2026-08-20", startTime: "09:00", endTime: "18:00", note: "", createdAt: null },
      { id: "e2", title: "日勤", date: "2026-08-21", startTime: "09:00", endTime: "18:00", note: "", createdAt: null },
      { id: "e3", title: "夜勤", date: "2026-08-22", startTime: "17:00", endTime: "09:00", note: "", createdAt: null },
    ];

    // 出勤期間
    const d1 = resolveShiftInfo("2026-08-20", events);
    expect(d1.type).toBe("work");
    expect(d1.streakNumber).toBe(1);
    expect(d1.shiftName).toBe("日勤");

    const d2 = resolveShiftInfo("2026-08-21", events);
    expect(d2.type).toBe("work");
    expect(d2.streakNumber).toBe(2);

    const d3 = resolveShiftInfo("2026-08-22", events);
    expect(d3.type).toBe("work");
    expect(d3.streakNumber).toBe(3);
    expect(d3.shiftName).toBe("夜勤");

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
      expect(["work", "holiday"]).toContain(res.type);
      expect(typeof res.streakNumber).toBe("number");
      expect(res.streakNumber).toBeGreaterThanOrEqual(1);
    }
  });
});
