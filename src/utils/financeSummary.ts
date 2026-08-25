/**
 * src/utils/financeSummary.ts
 * Arca — Finance（家計・支出管理）月次集計 ＆ 分析ユーティリティ
 */

import {
  EXPENSE_CATEGORIES,
  type ExpenseCategory,
  type ExpenseTransaction,
  type MonthlyFinanceSummary,
  type CategoryStat,
} from "../types/finance";

/** カテゴリごとの視覚表現定義（Apple HIG × Arca パレット） */
export interface CategoryVisual {
  color: string;
  bgColor: string;
  borderColor: string;
}

export const CATEGORY_VISUALS: Record<ExpenseCategory, CategoryVisual> = {
  食費: { color: "#C05621", bgColor: "rgba(192, 86, 33, 0.10)", borderColor: "rgba(192, 86, 33, 0.25)" },
  日用品: { color: "#2E7D32", bgColor: "rgba(46, 125, 50, 0.10)", borderColor: "rgba(46, 125, 50, 0.25)" },
  交通費: { color: "#1976D2", bgColor: "rgba(25, 118, 210, 0.10)", borderColor: "rgba(25, 118, 210, 0.25)" },
  被服: { color: "#7B1FA2", bgColor: "rgba(123, 31, 162, 0.10)", borderColor: "rgba(123, 31, 162, 0.25)" },
  交際費: { color: "#C2185B", bgColor: "rgba(194, 24, 91, 0.10)", borderColor: "rgba(194, 24, 91, 0.25)" },
  娯楽費: { color: "#E65100", bgColor: "rgba(230, 81, 0, 0.10)", borderColor: "rgba(230, 81, 0, 0.25)" },
  特別費: { color: "#C62828", bgColor: "rgba(198, 40, 40, 0.10)", borderColor: "rgba(198, 40, 40, 0.25)" },
  通信費: { color: "#00838F", bgColor: "rgba(0, 131, 143, 0.10)", borderColor: "rgba(0, 131, 143, 0.25)" },
  光熱費: { color: "#B78103", bgColor: "rgba(183, 129, 3, 0.10)", borderColor: "rgba(183, 129, 3, 0.25)" },
  サブスク: { color: "#3949AB", bgColor: "rgba(57, 73, 171, 0.10)", borderColor: "rgba(57, 73, 171, 0.25)" },
  車両係: { color: "#455A64", bgColor: "rgba(69, 90, 100, 0.10)", borderColor: "rgba(69, 90, 100, 0.25)" },
  その他: { color: "#616161", bgColor: "rgba(97, 97, 97, 0.10)", borderColor: "rgba(97, 97, 97, 0.25)" },
};

/** 金額を日本円形式にフォーマット (例: ¥1,234) */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

/** 現在の年月 (YYYY-MM) を取得 */
export function getCurrentMonth(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** 年月 (YYYY-MM) の前月を取得 */
export function getPrevMonth(monthStr: string): string {
  const [yStr, mStr] = monthStr.split("-");
  let y = parseInt(yStr, 10);
  let m = parseInt(mStr, 10) - 1;
  if (m < 1) {
    m = 12;
    y -= 1;
  }
  return `${y}-${String(m).padStart(2, "0")}`;
}

/** 年月 (YYYY-MM) の次月を取得 */
export function getNextMonth(monthStr: string): string {
  const [yStr, mStr] = monthStr.split("-");
  let y = parseInt(yStr, 10);
  let m = parseInt(mStr, 10) + 1;
  if (m > 12) {
    m = 1;
    y += 1;
  }
  return `${y}-${String(m).padStart(2, "0")}`;
}

/** 年月 (YYYY-MM) を日本語表示に変換 (例: 2026年8月) */
export function formatMonthLabel(monthStr: string): string {
  const [y, m] = monthStr.split("-");
  return `${y}年${parseInt(m, 10)}月`;
}

/** 月の日数を取得 */
export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * 月次支出の完全集計を行う
 * @param transactions 全支出取引リスト
 * @param targetMonth 集計対象年月 (YYYY-MM)
 */
export function calculateMonthlySummary(
  transactions: ExpenseTransaction[],
  targetMonth: string
): MonthlyFinanceSummary {
  const [yearStr, monthNumStr] = targetMonth.split("-");
  const year = parseInt(yearStr, 10) || new Date().getFullYear();
  const month = parseInt(monthNumStr, 10) || new Date().getMonth() + 1;
  const daysCount = getDaysInMonth(year, month);

  // 対象月の有効取引（論理削除除外）を抽出
  const monthTransactions = transactions.filter((t) => {
    if (t.isDeleted) return false;
    if (!t.date) return false;
    return t.date.startsWith(targetMonth);
  });

  let totalExpense = 0;
  let maxExpense = {
    amount: 0,
    title: "",
    date: "",
  };

  // カテゴリ初期化
  const categoryBreakdown: Record<ExpenseCategory, CategoryStat> = EXPENSE_CATEGORIES.reduce(
    (acc, cat) => {
      acc[cat] = { amount: 0, percentage: 0 };
      return acc;
    },
    {} as Record<ExpenseCategory, CategoryStat>
  );

  // 日別集計初期化 (1〜daysCount)
  const dailyExpenses: Record<number, number> = {};
  for (let d = 1; d <= daysCount; d++) {
    dailyExpenses[d] = 0;
  }

  // 取引データの集計
  for (const t of monthTransactions) {
    const amount = Number(t.totalAmount) || 0;
    totalExpense += amount;

    // 最大支出の更新
    if (amount > maxExpense.amount) {
      maxExpense = {
        amount,
        title: t.title || "支出",
        date: t.date,
      };
    }

    // カテゴリ別加算
    const cat = t.category && EXPENSE_CATEGORIES.includes(t.category) ? t.category : "その他";
    categoryBreakdown[cat].amount += amount;

    // 日別加算
    const dayMatch = t.date.match(/^\d{4}-\d{2}-(\d{2})/);
    if (dayMatch) {
      const dayNum = parseInt(dayMatch[1], 10);
      if (dayNum >= 1 && dayNum <= daysCount) {
        dailyExpenses[dayNum] = (dailyExpenses[dayNum] || 0) + amount;
      }
    }
  }

  // カテゴリ比率の算出 (0〜100%)
  for (const cat of EXPENSE_CATEGORIES) {
    if (totalExpense > 0) {
      const pct = (categoryBreakdown[cat].amount / totalExpense) * 100;
      categoryBreakdown[cat].percentage = Math.round(pct * 10) / 10;
    } else {
      categoryBreakdown[cat].percentage = 0;
    }
  }

  // 1日あたりの平均支出
  // 当月の場合は現在日までの経過日数、過去月の場合は月の日数で計算
  const now = new Date();
  const isCurrentMonth = now.getFullYear() === year && now.getMonth() + 1 === month;
  const elapsedDays = isCurrentMonth ? Math.max(1, now.getDate()) : daysCount;
  const dailyAverage = totalExpense > 0 ? Math.round(totalExpense / elapsedDays) : 0;

  return {
    month: targetMonth,
    totalExpense,
    transactionCount: monthTransactions.length,
    dailyAverage,
    maxExpense,
    categoryBreakdown,
    dailyExpenses,
  };
}
