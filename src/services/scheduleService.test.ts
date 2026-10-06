/**
 * src/services/scheduleService.test.ts
 * Arca — 次回休日計算サービス 単体テスト
 */

import { describe, it, expect } from "vitest";
import {
  calculateNextHolidayBlocks,
  dateStrToEpochDays,
  epochDaysToDateStr,
  formatDateToMMDD,
  buildHolidayBlock,
} from "./scheduleService";
import type { CalendarEvent, PMSettings } from "../types";

describe("scheduleService - 日付ユーティリティ", () => {
  it("dateStrToEpochDays と epochDaysToDateStr が可逆であること", () => {
    const dates = ["2026-01-01", "2026-02-28", "2026-10-11", "2026-12-31"];
    for (const d of dates) {
      expect(epochDaysToDateStr(dateStrToEpochDays(d))).toBe(d);
    }
  });

  it("formatDateToMMDD が MM/DD 形式にフォーマットすること", () => {
    expect(formatDateToMMDD("2026-10-11")).toBe("10/11");
    expect(formatDateToMMDD("2026-01-05")).toBe("01/05");
  });

  it("buildHolidayBlock が開始日・終了日・日付配列を正しく組み立てること", () => {
    const block = buildHolidayBlock("2026-10-11", "2026-10-12");
    expect(block).toEqual({
      start: "2026-10-11",
      end: "2026-10-12",
      dates: ["10/11", "10/12"],
    });
  });

  it("buildHolidayBlock: 1日のみの休日でも正しく機能すること", () => {
    const block = buildHolidayBlock("2026-10-11", "2026-10-11");
    expect(block).toEqual({
      start: "2026-10-11",
      end: "2026-10-11",
      dates: ["10/11"],
    });
  });
});

describe("calculateNextHolidayBlocks - 4勤2休サイクル計算", () => {
  // 4勤2休ローテーションイベント（早番2日 → 遅番2日 → 休日2日）
  // サイクル0: 2026-09-01(早番), 09-02(早番), 09-03(遅番), 09-04(遅番), 09-05(公休), 09-06(公休)
  // サイクル1: 2026-09-07(早番), 09-08(早番), 09-09(遅番), 09-10(遅番), 09-11(公休), 09-12(公休)
  // サイクル2: 2026-09-13(早番), 09-14(早番), 09-15(遅番), 09-16(遅番), 09-17(公休), 09-18(公休)
  const sampleEvents: CalendarEvent[] = [
    { id: "e1", title: "早番", date: "2026-09-01", startTime: "08:00", endTime: "17:00", note: "", createdAt: null },
    { id: "e2", title: "早番", date: "2026-09-02", startTime: "08:00", endTime: "17:00", note: "", createdAt: null },
    { id: "e3", title: "遅番", date: "2026-09-03", startTime: "12:00", endTime: "21:00", note: "", createdAt: null },
    { id: "e4", title: "遅番", date: "2026-09-04", startTime: "12:00", endTime: "21:00", note: "", createdAt: null },
    { id: "e5", title: "公休", date: "2026-09-05", startTime: "00:00", endTime: "23:59", note: "", createdAt: null },
    { id: "e6", title: "公休", date: "2026-09-06", startTime: "00:00", endTime: "23:59", note: "", createdAt: null },
    { id: "e7", title: "早番", date: "2026-09-07", startTime: "08:00", endTime: "17:00", note: "", createdAt: null },
    { id: "e8", title: "早番", date: "2026-09-08", startTime: "08:00", endTime: "17:00", note: "", createdAt: null },
    { id: "e9", title: "遅番", date: "2026-09-09", startTime: "12:00", endTime: "21:00", note: "", createdAt: null },
    { id: "e10", title: "遅番", date: "2026-09-10", startTime: "12:00", endTime: "21:00", note: "", createdAt: null },
    { id: "e11", title: "公休", date: "2026-09-11", startTime: "00:00", endTime: "23:59", note: "", createdAt: null },
    { id: "e12", title: "公休", date: "2026-09-12", startTime: "00:00", endTime: "23:59", note: "", createdAt: null },
    { id: "e13", title: "早番", date: "2026-09-13", startTime: "08:00", endTime: "17:00", note: "", createdAt: null },
    { id: "e14", title: "早番", date: "2026-09-14", startTime: "08:00", endTime: "17:00", note: "", createdAt: null },
    { id: "e15", title: "遅番", date: "2026-09-15", startTime: "12:00", endTime: "21:00", note: "", createdAt: null },
    { id: "e16", title: "遅番", date: "2026-09-16", startTime: "12:00", endTime: "21:00", note: "", createdAt: null },
    { id: "e17", title: "公休", date: "2026-09-17", startTime: "00:00", endTime: "23:59", note: "", createdAt: null },
    { id: "e18", title: "公休", date: "2026-09-18", startTime: "00:00", endTime: "23:59", note: "", createdAt: null },
  ];

  it("出勤1日目（2026-09-01）のとき、直近の 09-05〜06 と 次回の 09-11〜12 を返却すること", () => {
    const res = calculateNextHolidayBlocks("2026-09-01", sampleEvents);

    expect(res.current_or_next_block).toEqual({
      start: "2026-09-05",
      end: "2026-09-06",
      dates: ["09/05", "09/06"],
    });

    expect(res.following_block).toEqual({
      start: "2026-09-11",
      end: "2026-09-12",
      dates: ["09/11", "09/12"],
    });
  });

  it("出勤4日目（2026-09-04）のとき、直近の 09-05〜06 と 次回の 09-11〜12 を返却すること", () => {
    const res = calculateNextHolidayBlocks("2026-09-04", sampleEvents);

    expect(res.current_or_next_block).toEqual({
      start: "2026-09-05",
      end: "2026-09-06",
      dates: ["09/05", "09/06"],
    });

    expect(res.following_block).toEqual({
      start: "2026-09-11",
      end: "2026-09-12",
      dates: ["09/11", "09/12"],
    });
  });

  it("休日1日目（2026-09-05）のとき、現在進行中の 09-05〜06 と 次回の 09-11〜12 を返却すること", () => {
    const res = calculateNextHolidayBlocks("2026-09-05", sampleEvents);

    expect(res.current_or_next_block).toEqual({
      start: "2026-09-05",
      end: "2026-09-06",
      dates: ["09/05", "09/06"],
    });

    expect(res.following_block).toEqual({
      start: "2026-09-11",
      end: "2026-09-12",
      dates: ["09/11", "09/12"],
    });
  });

  it("休日2日目（2026-09-06・連休最終日）のとき、現在進行中の 09-05〜06 と 次回の 09-11〜12 を返却すること", () => {
    const res = calculateNextHolidayBlocks("2026-09-06", sampleEvents);

    expect(res.current_or_next_block).toEqual({
      start: "2026-09-05",
      end: "2026-09-06",
      dates: ["09/05", "09/06"],
    });

    expect(res.following_block).toEqual({
      start: "2026-09-11",
      end: "2026-09-12",
      dates: ["09/11", "09/12"],
    });
  });

  it("休日ブロック終了翌日（2026-09-07・出勤初日）のとき、自動的に次のブロック（09-11〜12 と 09-17〜18）へ繰り上がること", () => {
    const res = calculateNextHolidayBlocks("2026-09-07", sampleEvents);

    expect(res.current_or_next_block).toEqual({
      start: "2026-09-11",
      end: "2026-09-12",
      dates: ["09/11", "09/12"],
    });

    expect(res.following_block).toEqual({
      start: "2026-09-17",
      end: "2026-10-18".startsWith("2026-09") ? "2026-09-18" : "2026-09-18",
      dates: ["09/17", "09/18"],
    });
  });

  it("仕様書のサンプル日付（10/11〜10/12 と 10/17〜10/18）と一致する動作を確認", () => {
    // 10/07〜10/10 出勤, 10/11〜10/12 休日, 10/13〜10/16 出勤, 10/17〜10/18 休日
    const octEvents: CalendarEvent[] = [
      { id: "o1", title: "日勤", date: "2026-10-07", startTime: "09:00", endTime: "18:00", note: "", createdAt: null },
      { id: "o2", title: "日勤", date: "2026-10-08", startTime: "09:00", endTime: "18:00", note: "", createdAt: null },
      { id: "o3", title: "日勤", date: "2026-10-09", startTime: "09:00", endTime: "18:00", note: "", createdAt: null },
      { id: "o4", title: "日勤", date: "2026-10-10", startTime: "09:00", endTime: "18:00", note: "", createdAt: null },
      { id: "o5", title: "公休", date: "2026-10-11", startTime: "00:00", endTime: "23:59", note: "", createdAt: null },
      { id: "o6", title: "公休", date: "2026-10-12", startTime: "00:00", endTime: "23:59", note: "", createdAt: null },
      { id: "o7", title: "日勤", date: "2026-10-13", startTime: "09:00", endTime: "18:00", note: "", createdAt: null },
      { id: "o8", title: "日勤", date: "2026-10-14", startTime: "09:00", endTime: "18:00", note: "", createdAt: null },
      { id: "o9", title: "日勤", date: "2026-10-15", startTime: "09:00", endTime: "18:00", note: "", createdAt: null },
      { id: "o10", title: "日勤", date: "2026-10-16", startTime: "09:00", endTime: "18:00", note: "", createdAt: null },
      { id: "o11", title: "公休", date: "2026-10-17", startTime: "00:00", endTime: "23:59", note: "", createdAt: null },
      { id: "o12", title: "公休", date: "2026-10-18", startTime: "00:00", endTime: "23:59", note: "", createdAt: null },
    ];

    const res = calculateNextHolidayBlocks("2026-10-07", octEvents);

    expect(res).toEqual({
      current_or_next_block: {
        start: "2026-10-11",
        end: "2026-10-12",
        dates: ["10/11", "10/12"],
      },
      following_block: {
        start: "2026-10-17",
        end: "2026-10-18",
        dates: ["10/17", "10/18"],
      },
    });
  });

  it("有休等による3連休（変則パターン）でも正確にブロック化されること", () => {
    const specialEvents: CalendarEvent[] = [
      { id: "s1", title: "仕事", date: "2026-11-01", startTime: "09:00", endTime: "18:00", note: "", createdAt: null },
      { id: "s2", title: "有休", date: "2026-11-02", startTime: "00:00", endTime: "23:59", note: "", createdAt: null },
      { id: "s3", title: "公休", date: "2026-11-03", startTime: "00:00", endTime: "23:59", note: "", createdAt: null },
      { id: "s4", title: "公休", date: "2026-11-04", startTime: "00:00", endTime: "23:59", note: "", createdAt: null },
      { id: "s5", title: "仕事", date: "2026-11-05", startTime: "09:00", endTime: "18:00", note: "", createdAt: null },
      { id: "s6", title: "公休", date: "2026-11-06", startTime: "00:00", endTime: "23:59", note: "", createdAt: null },
    ];

    const res = calculateNextHolidayBlocks("2026-11-01", specialEvents);

    expect(res.current_or_next_block).toEqual({
      start: "2026-11-02",
      end: "2026-11-04",
      dates: ["11/02", "11/03", "11/04"],
    });

    expect(res.following_block).toEqual({
      start: "2026-11-06",
      end: "2026-11-06",
      dates: ["11/06"],
    });
  });

  it("手動アンカー設定（イベント未登録の循環計算）でも6日周期で正確に計算されること", () => {
    const settings: PMSettings = {
      cycleLength: 6,
      manualAnchorDate: "2026-10-01", // Day 1
      manualAnchorDay: 1,
    };
    // 6日周期: Day 1〜4が出勤, Day 5〜6が休日
    // 10/01(D1), 10/02(D2), 10/03(D3), 10/04(D4), 10/05(D5=休), 10/06(D6=休)
    // 次: 10/07(D1), ..., 10/10(D4), 10/11(D5=休), 10/12(D6=休)

    // 出勤日 10/02 から計算
    const res = calculateNextHolidayBlocks("2026-10-02", [], settings);
    expect(res.current_or_next_block.start).toBe("2026-10-05");
    expect(res.current_or_next_block.end).toBe("2026-10-06");
    expect(res.current_or_next_block.dates).toEqual(["10/05", "10/06"]);

    expect(res.following_block.start).toBe("2026-10-11");
    expect(res.following_block.end).toBe("2026-10-12");
    expect(res.following_block.dates).toEqual(["10/11", "10/12"]);
  });
});
