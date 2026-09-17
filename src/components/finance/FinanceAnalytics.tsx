/**
 * src/components/finance/FinanceAnalytics.tsx
 * Arca — Finance（家計・支出管理）月次分析・グラフ・カテゴリ統計
 */

import { useMemo } from "react";
import type { ExpenseTransaction } from "../../types/finance";
import {
  calculateMonthlySummary,
  CATEGORY_VISUALS,
  formatCurrency,
} from "../../utils/financeSummary";
import { C } from "../../lib/designSystem";

interface FinanceAnalyticsProps {
  transactions: ExpenseTransaction[];
  selectedMonth: string;
}

export function FinanceAnalytics({ transactions, selectedMonth }: FinanceAnalyticsProps) {
  const summary = useMemo(() => {
    return calculateMonthlySummary(transactions, selectedMonth);
  }, [transactions, selectedMonth]);

  // 金額降順でソートしたカテゴリリスト
  const sortedCategories = useMemo(() => {
    return Object.entries(summary.categoryBreakdown)
      .map(([category, stat]) => ({
        category: category as keyof typeof CATEGORY_VISUALS,
        amount: stat.amount,
        percentage: stat.percentage,
      }))
      .filter((c) => c.amount > 0)
      .sort((a, b) => b.amount - a.amount);
  }, [summary.categoryBreakdown]);

  // 当月のトップ5支出
  const topTransactions = useMemo(() => {
    return transactions
      .filter((t) => !t.isDeleted && t.date?.startsWith(selectedMonth))
      .sort((a, b) => (b.totalAmount || 0) - (a.totalAmount || 0))
      .slice(0, 5);
  }, [transactions, selectedMonth]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.8rem" }}>
      {/* ── KPI 概要カード群 ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "0.9rem",
        }}
      >
        {/* 支出合計 */}
        <div
          className="arca-card"
          style={{
            background: "var(--bg-card-solid)",
            borderRadius: C.radiusCard,
            boxShadow: C.cardShadow,
            padding: "1.2rem 1.4rem",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <div style={{ fontSize: "0.72rem", fontWeight: 650, color: C.charcoalLight, marginBottom: "0.3rem" }}>
            当月支出合計
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: 800, color: C.charcoal, letterSpacing: "-0.03em" }}>
            {formatCurrency(summary.totalExpense)}
          </div>
        </div>

        {/* 1日あたり平均支出 */}
        <div
          className="arca-card"
          style={{
            background: "var(--bg-card-solid)",
            borderRadius: C.radiusCard,
            boxShadow: C.cardShadow,
            padding: "1.2rem 1.4rem",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <div style={{ fontSize: "0.72rem", fontWeight: 650, color: C.charcoalLight, marginBottom: "0.3rem" }}>
            1日あたり平均支出
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: 800, color: C.goldDark, letterSpacing: "-0.03em" }}>
            {formatCurrency(summary.dailyAverage)}
          </div>
        </div>

        {/* 取引件数 */}
        <div
          className="arca-card"
          style={{
            background: "var(--bg-card-solid)",
            borderRadius: C.radiusCard,
            boxShadow: C.cardShadow,
            padding: "1.2rem 1.4rem",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <div style={{ fontSize: "0.72rem", fontWeight: 650, color: C.charcoalLight, marginBottom: "0.3rem" }}>
            決済件数
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: 800, color: C.charcoal, letterSpacing: "-0.03em" }}>
            {summary.transactionCount} <span style={{ fontSize: "0.9rem", fontWeight: 600 }}>件</span>
          </div>
        </div>

        {/* 最大支出 */}
        <div
          className="arca-card"
          style={{
            background: "var(--bg-card-solid)",
            borderRadius: C.radiusCard,
            boxShadow: C.cardShadow,
            padding: "1.2rem 1.4rem",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <div style={{ fontSize: "0.72rem", fontWeight: 650, color: C.charcoalLight, marginBottom: "0.3rem" }}>
            最大支出
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: 800, color: C.charcoal, letterSpacing: "-0.03em" }}>
            {formatCurrency(summary.maxExpense.amount)}
          </div>
          <div
            style={{
              fontSize: "0.72rem",
              color: C.charcoalLight,
              marginTop: "0.25rem",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {summary.maxExpense.title ? `${summary.maxExpense.title} (${summary.maxExpense.date.slice(5)})` : "なし"}
          </div>
        </div>
      </div>

      {/* ── カテゴリ別支出内訳 ＆ 円グラフ ── */}
      <div
        className="arca-card"
        style={{
          background: "var(--bg-card-solid)",
          borderRadius: C.radiusCard,
          boxShadow: C.cardShadow,
          padding: "1.5rem",
          border: "1px solid var(--border-subtle)",
        }}
      >
        <div style={{ marginBottom: "1.2rem" }}>
          <h3
            style={{
              fontSize: "1rem",
              fontWeight: 700,
              color: C.charcoal,
              margin: 0,
              letterSpacing: "-0.01em",
            }}
          >
            カテゴリ別支出内訳
          </h3>
        </div>

        {sortedCategories.length === 0 ? (
          <div style={{ textAlign: "center", color: C.charcoalLight, fontSize: "0.8rem", padding: "2.5rem 0" }}>
            当月の支出データがまだありません
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            {/* 左側: カテゴリ一覧リスト（中央寄せ＆余白最適化） */}
            <div className="lg:col-span-7 flex justify-center w-full">
              <div style={{ width: "100%", maxWidth: "340px", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                {/* リスト見出し */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto auto",
                    alignItems: "center",
                    columnGap: "1.2rem",
                    paddingBottom: "0.4rem",
                    borderBottom: "1px solid var(--border-subtle)",
                    fontSize: "0.72rem",
                    fontWeight: 650,
                    color: C.charcoalLight,
                  }}
                >
                  <span>カテゴリ</span>
                  <span style={{ minWidth: "40px", textAlign: "right" }}>割合</span>
                  <span style={{ minWidth: "75px", textAlign: "right" }}>金額</span>
                </div>

                {/* 各カテゴリ行 */}
                {sortedCategories.map(({ category, amount, percentage }, idx) => {
                  const visual = CATEGORY_VISUALS[category] || CATEGORY_VISUALS["その他"];
                  return (
                    <div
                      key={category}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr auto auto",
                        alignItems: "center",
                        columnGap: "1.2rem",
                        padding: "0.45rem 0",
                        borderBottom:
                          idx < sortedCategories.length - 1
                            ? "1px solid rgba(0, 0, 0, 0.03)"
                            : "none",
                      }}
                    >
                      {/* カテゴリ名（カラードット ＋ 囲みなしテキスト ＋ 改行なし） */}
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0 }}>
                        <span
                          style={{
                            width: "8px",
                            height: "8px",
                            borderRadius: "9999px",
                            background: visual.color,
                            flexShrink: 0,
                          }}
                        />
                        <span
                          style={{
                            fontSize: "0.82rem",
                            fontWeight: 600,
                            color: C.charcoal,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {category}
                        </span>
                      </div>

                      {/* パーセント */}
                      <span
                        style={{
                          fontSize: "0.76rem",
                          fontWeight: 600,
                          color: C.charcoalLight,
                          minWidth: "40px",
                          textAlign: "right",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {percentage}%
                      </span>

                      {/* 金額 */}
                      <span
                        style={{
                          fontSize: "0.88rem",
                          fontWeight: 750,
                          color: C.charcoal,
                          minWidth: "75px",
                          textAlign: "right",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {formatCurrency(amount)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 右側: SVG 円グラフ（ドーナツチャート） */}
            <div className="lg:col-span-5 flex flex-col items-center justify-center p-2">
              <div style={{ position: "relative", width: "210px", height: "210px" }}>
                <svg
                  width="210"
                  height="210"
                  viewBox="0 0 200 200"
                  style={{ transform: "rotate(-90deg)", overflow: "visible" }}
                >
                  {/* 背景トラック */}
                  <circle
                    cx="100"
                    cy="100"
                    r="70"
                    fill="none"
                    stroke="var(--bg-nav-track)"
                    strokeWidth="24"
                  />
                  {/* 各カテゴリセグメント */}
                  {(() => {
                    const circumference = 2 * Math.PI * 70;
                    let accumulatedOffset = 0;
                    return sortedCategories.map(({ category, amount, percentage }) => {
                      const visual = CATEGORY_VISUALS[category] || CATEGORY_VISUALS["その他"];
                      const strokeLength = (percentage / 100) * circumference;
                      const currentOffset = accumulatedOffset;
                      accumulatedOffset += strokeLength;

                      return (
                        <circle
                          key={category}
                          cx="100"
                          cy="100"
                          r="70"
                          fill="none"
                          stroke={visual.color}
                          strokeWidth="24"
                          strokeDasharray={`${Math.max(0, strokeLength - 1.5)} ${circumference}`}
                          strokeDashoffset={-currentOffset}
                          style={{
                            transition: "stroke-dasharray 0.4s ease, stroke-dashoffset 0.4s ease",
                          }}
                        >
                          <title>{`${category}: ${formatCurrency(amount)} (${percentage}%)`}</title>
                        </circle>
                      );
                    });
                  })()}
                </svg>

                {/* ドーナツ中央のテキスト情報 */}
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    pointerEvents: "none",
                    textAlign: "center",
                  }}
                >
                  <span style={{ fontSize: "0.7rem", fontWeight: 650, color: C.charcoalLight }}>
                    当月支出合計
                  </span>
                  <span
                    style={{
                      fontSize: "1.15rem",
                      fontWeight: 800,
                      color: C.charcoal,
                      letterSpacing: "-0.02em",
                      marginTop: "0.15rem",
                    }}
                  >
                    {formatCurrency(summary.totalExpense)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── 高額支出ランキング (Top 5) ── */}
      {topTransactions.length > 0 && (
        <div
          className="arca-card"
          style={{
            background: "var(--bg-card-solid)",
            borderRadius: C.radiusCard,
            boxShadow: C.cardShadow,
            padding: "1.5rem",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <h3
            style={{
              fontSize: "1rem",
              fontWeight: 700,
              color: C.charcoal,
              margin: "0 0 1rem",
              letterSpacing: "-0.01em",
            }}
          >
            高額支出ランキング (Top 5)
          </h3>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {topTransactions.map((tx, idx) => {
              const visual = CATEGORY_VISUALS[tx.category] || CATEGORY_VISUALS["その他"];
              return (
                <div
                  key={tx.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0.65rem 0.9rem",
                    background: "var(--bg-nav-track)",
                    borderRadius: "10px",
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                    <span style={{ fontSize: "0.76rem", fontWeight: 700, color: idx === 0 ? C.goldDark : C.charcoalLight }}>
                      #{idx + 1}
                    </span>
                    <span
                      style={{
                        fontSize: "0.66rem",
                        fontWeight: 650,
                        color: visual.color,
                        background: visual.bgColor,
                        padding: "0.15rem 0.45rem",
                        borderRadius: "4px",
                      }}
                    >
                      {tx.category}
                    </span>
                    <span style={{ fontSize: "0.84rem", fontWeight: 650, color: C.charcoal }}>
                      {tx.title}
                    </span>
                    <span style={{ fontSize: "0.7rem", color: C.charcoalLight }}>
                      {tx.date}
                    </span>
                  </div>

                  <span style={{ fontSize: "0.92rem", fontWeight: 750, color: C.charcoal }}>
                    {formatCurrency(tx.totalAmount)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
