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
  formatMonthLabel,
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

  // 日別支出の最大値（バーグラフのスケーリング用）
  const maxDailyAmount = useMemo(() => {
    const values = Object.values(summary.dailyExpenses);
    return Math.max(1, ...values);
  }, [summary.dailyExpenses]);

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
          style={{
            background: C.white,
            borderRadius: C.radiusCard,
            boxShadow: C.cardShadow,
            padding: "1.2rem 1.4rem",
            border: "1px solid rgba(0, 0, 0, 0.03)",
          }}
        >
          <div style={{ fontSize: "0.72rem", fontWeight: 650, color: C.charcoalLight, marginBottom: "0.3rem" }}>
            当月支出合計
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: 800, color: C.charcoal, letterSpacing: "-0.03em" }}>
            {formatCurrency(summary.totalExpense)}
          </div>
          <div style={{ fontSize: "0.72rem", color: C.charcoalLight, marginTop: "0.25rem" }}>
            {formatMonthLabel(selectedMonth)}の実績
          </div>
        </div>

        {/* 1日あたり平均支出 */}
        <div
          style={{
            background: C.white,
            borderRadius: C.radiusCard,
            boxShadow: C.cardShadow,
            padding: "1.2rem 1.4rem",
            border: "1px solid rgba(0, 0, 0, 0.03)",
          }}
        >
          <div style={{ fontSize: "0.72rem", fontWeight: 650, color: C.charcoalLight, marginBottom: "0.3rem" }}>
            1日あたり平均支出
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: 800, color: C.goldDark, letterSpacing: "-0.03em" }}>
            {formatCurrency(summary.dailyAverage)}
          </div>
          <div style={{ fontSize: "0.72rem", color: C.charcoalLight, marginTop: "0.25rem" }}>
            日割ペース指標
          </div>
        </div>

        {/* 取引件数 */}
        <div
          style={{
            background: C.white,
            borderRadius: C.radiusCard,
            boxShadow: C.cardShadow,
            padding: "1.2rem 1.4rem",
            border: "1px solid rgba(0, 0, 0, 0.03)",
          }}
        >
          <div style={{ fontSize: "0.72rem", fontWeight: 650, color: C.charcoalLight, marginBottom: "0.3rem" }}>
            決済件数
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: 800, color: C.charcoal, letterSpacing: "-0.03em" }}>
            {summary.transactionCount} <span style={{ fontSize: "0.9rem", fontWeight: 600 }}>件</span>
          </div>
          <div style={{ fontSize: "0.72rem", color: C.charcoalLight, marginTop: "0.25rem" }}>
            当月の記録回数
          </div>
        </div>

        {/* 最大支出 */}
        <div
          style={{
            background: C.white,
            borderRadius: C.radiusCard,
            boxShadow: C.cardShadow,
            padding: "1.2rem 1.4rem",
            border: "1px solid rgba(0, 0, 0, 0.03)",
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

      {/* ── カテゴリ別支出比率 ── */}
      <div
        style={{
          background: C.white,
          borderRadius: C.radiusCard,
          boxShadow: C.cardShadow,
          padding: "1.5rem",
          border: "1px solid rgba(0, 0, 0, 0.03)",
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
          カテゴリ別支出内訳
        </h3>

        {/* マルチセグメント比率バー */}
        {sortedCategories.length > 0 && (
          <div
            style={{
              display: "flex",
              height: "14px",
              borderRadius: "9999px",
              overflow: "hidden",
              background: "rgba(0, 0, 0, 0.04)",
              marginBottom: "1.4rem",
            }}
          >
            {sortedCategories.map(({ category, percentage }) => {
              const visual = CATEGORY_VISUALS[category];
              return (
                <div
                  key={category}
                  style={{
                    width: `${percentage}%`,
                    background: visual ? visual.color : "#999",
                    transition: "width 0.3s ease",
                  }}
                  title={`${category}: ${percentage}%`}
                />
              );
            })}
          </div>
        )}

        {/* カテゴリ一覧リスト */}
        {sortedCategories.length === 0 ? (
          <div style={{ textAlign: "center", color: C.charcoalLight, fontSize: "0.8rem", padding: "1.5rem 0" }}>
            当月の支出データがまだありません
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {sortedCategories.map(({ category, amount, percentage }, rank) => {
              const visual = CATEGORY_VISUALS[category];
              return (
                <div
                  key={category}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.8rem",
                    padding: "0.4rem 0",
                  }}
                >
                  <span style={{ fontSize: "0.74rem", fontWeight: 700, color: C.charcoalLight, width: "16px" }}>
                    {rank + 1}
                  </span>

                  <span
                    style={{
                      fontSize: "0.74rem",
                      fontWeight: 700,
                      color: visual.color,
                      background: visual.bgColor,
                      border: `1px solid ${visual.borderColor}`,
                      padding: "0.2rem 0.6rem",
                      borderRadius: "6px",
                      width: "68px",
                      textAlign: "center",
                      flexShrink: 0,
                    }}
                  >
                    {category}
                  </span>

                  <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "0.6rem" }}>
                    <div
                      style={{
                        flex: 1,
                        height: "8px",
                        borderRadius: "9999px",
                        background: "rgba(0, 0, 0, 0.04)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${percentage}%`,
                          height: "100%",
                          background: visual.color,
                          borderRadius: "9999px",
                        }}
                      />
                    </div>
                    <span style={{ fontSize: "0.74rem", color: C.charcoalLight, width: "42px", textAlign: "right" }}>
                      {percentage}%
                    </span>
                  </div>

                  <span style={{ fontSize: "0.88rem", fontWeight: 750, color: C.charcoal, minWidth: "80px", textAlign: "right" }}>
                    {formatCurrency(amount)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 日別支出推移バーチャート ── */}
      <div
        style={{
          background: C.white,
          borderRadius: C.radiusCard,
          boxShadow: C.cardShadow,
          padding: "1.5rem",
          border: "1px solid rgba(0, 0, 0, 0.03)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.2rem" }}>
          <h3
            style={{
              fontSize: "1rem",
              fontWeight: 700,
              color: C.charcoal,
              margin: 0,
              letterSpacing: "-0.01em",
            }}
          >
            日別支出推移
          </h3>
          <span style={{ fontSize: "0.72rem", color: C.charcoalLight }}>
            ピーク日: {summary.maxExpense.amount > 0 ? `${summary.maxExpense.date.slice(8)}日 (${formatCurrency(summary.maxExpense.amount)})` : "なし"}
          </span>
        </div>

        {/* 1〜31日のバーチャート */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: "3px",
            height: "160px",
            paddingTop: "20px",
            paddingBottom: "24px",
            boxSizing: "border-box",
            overflowX: "auto",
          }}
          className="no-scrollbar"
        >
          {Object.entries(summary.dailyExpenses).map(([dayStr, amount]) => {
            const dayNum = parseInt(dayStr, 10);
            const heightPct = maxDailyAmount > 0 ? (amount / maxDailyAmount) * 100 : 0;
            const isPeak = amount > 0 && amount === summary.maxExpense.amount;

            return (
              <div
                key={dayStr}
                style={{
                  flex: "1 1 0",
                  minWidth: "12px",
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  position: "relative",
                  cursor: amount > 0 ? "pointer" : "default",
                }}
                title={`${dayNum}日: ${formatCurrency(amount)}`}
              >
                {/* バー */}
                <div
                  style={{
                    width: "100%",
                    maxWidth: "16px",
                    height: `${Math.max(amount > 0 ? 6 : 2, heightPct)}%`,
                    background: isPeak ? C.gold : amount > 0 ? "rgba(197, 160, 89, 0.45)" : "rgba(0, 0, 0, 0.04)",
                    borderRadius: "4px 4px 0 0",
                    transition: "height 0.3s ease, background 0.15s ease",
                  }}
                />

                {/* 日付ラベル (5日おきまたは主要日) */}
                <span
                  style={{
                    position: "absolute",
                    bottom: "-20px",
                    fontSize: "0.62rem",
                    color: isPeak ? C.goldDark : dayNum % 5 === 0 || dayNum === 1 ? C.charcoalLight : "transparent",
                    fontWeight: isPeak ? 700 : 500,
                  }}
                >
                  {dayNum}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 高額支出ランキング (Top 5) ── */}
      {topTransactions.length > 0 && (
        <div
          style={{
            background: C.white,
            borderRadius: C.radiusCard,
            boxShadow: C.cardShadow,
            padding: "1.5rem",
            border: "1px solid rgba(0, 0, 0, 0.03)",
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
            当月の高額支出 (Top 5)
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
                    padding: "0.6rem 0.8rem",
                    background: "rgba(0, 0, 0, 0.015)",
                    borderRadius: "8px",
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
