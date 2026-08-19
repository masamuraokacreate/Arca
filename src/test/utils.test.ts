/**
 * src/test/utils.test.ts
 * Calendar ユーティリティ関数の単体テスト
 * （純粋関数のみ → モック不要）
 */
import { describe, it, expect } from "vitest";

// ─── テスト対象の純粋関数（コンポーネント外から取り出してテスト）───

/** "YYYY-MM-DD" を生成 */
function toDateStr(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** 月の最初の曜日と日数を返す */
function monthMeta(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();
  return { firstDay, daysInMonth, daysInPrev };
}

/** 期限テキストフォーマット（Tasks.tsx の formatDue と同等） */
function formatDue(dateStr: string, referenceDate: Date): string {
  const d = new Date(`${dateStr}T00:00:00`);
  const today = new Date(referenceDate);
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "今日";
  if (diff === 1) return "明日";
  if (diff === -1) return "昨日";
  return d.toLocaleDateString("ja-JP", { month: "short", day: "numeric" });
}

// ─── テスト ───

describe("toDateStr", () => {
  it("月・日を2桁ゼロ埋めで返す", () => {
    expect(toDateStr(2026, 0, 1)).toBe("2026-01-01");
    expect(toDateStr(2026, 7, 18)).toBe("2026-08-18");
    expect(toDateStr(2026, 11, 31)).toBe("2026-12-31");
  });

  it("月インデックスが 0 始まりであることを正しく処理する", () => {
    // month=0 → 1月
    expect(toDateStr(2026, 0, 15)).toBe("2026-01-15");
    // month=11 → 12月
    expect(toDateStr(2026, 11, 1)).toBe("2026-12-01");
  });
});

describe("monthMeta", () => {
  it("2026年8月の日数が 31 日", () => {
    const { daysInMonth } = monthMeta(2026, 7); // 7 = 8月
    expect(daysInMonth).toBe(31);
  });

  it("2026年2月の日数が 28 日（平年）", () => {
    const { daysInMonth } = monthMeta(2026, 1);
    expect(daysInMonth).toBe(28);
  });

  it("2024年2月の日数が 29 日（閏年）", () => {
    const { daysInMonth } = monthMeta(2024, 1);
    expect(daysInMonth).toBe(29);
  });

  it("firstDay が 0〜6 の範囲に収まる", () => {
    for (let m = 0; m < 12; m++) {
      const { firstDay } = monthMeta(2026, m);
      expect(firstDay).toBeGreaterThanOrEqual(0);
      expect(firstDay).toBeLessThanOrEqual(6);
    }
  });

  it("daysInPrev は前月の最終日を返す", () => {
    // 8月（month=7）の前月は7月（31日）
    const { daysInPrev } = monthMeta(2026, 7);
    expect(daysInPrev).toBe(31);
    // 3月（month=2）の前月は2月（平年 28日）
    const { daysInPrev: feb } = monthMeta(2026, 2);
    expect(feb).toBe(28);
  });
});

describe("formatDue", () => {
  const REF = new Date("2026-08-18T12:00:00");

  it("当日は「今日」を返す", () => {
    expect(formatDue("2026-08-18", REF)).toBe("今日");
  });

  it("翌日は「明日」を返す", () => {
    expect(formatDue("2026-08-19", REF)).toBe("明日");
  });

  it("前日は「昨日」を返す", () => {
    expect(formatDue("2026-08-17", REF)).toBe("昨日");
  });

  it("2日以上先は月日形式", () => {
    const result = formatDue("2026-08-25", REF);
    expect(result).toMatch(/8月/);
    expect(result).toMatch(/25/);
  });

  it("期限切れ（2日以上前）は月日形式", () => {
    const result = formatDue("2026-08-10", REF);
    expect(result).toMatch(/8月/);
    expect(result).toMatch(/10/);
  });
});

describe("toDateStr の境界値テスト", () => {
  it("月末をまたぐ日付でも正しく文字列化", () => {
    // 1月31日
    expect(toDateStr(2026, 0, 31)).toBe("2026-01-31");
    // 12月31日
    expect(toDateStr(2026, 11, 31)).toBe("2026-12-31");
  });
});
