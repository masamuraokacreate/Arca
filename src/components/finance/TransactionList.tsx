/**
 * src/components/finance/TransactionList.tsx
 * Arca — 支出一覧 ＆ アコーディオン品目内訳（1対N）表示コンポーネント
 */

import { useState } from "react";
import type { ExpenseTransaction } from "../../types/finance";
import { CATEGORY_VISUALS, formatCurrency } from "../../utils/financeSummary";
import { C } from "../../lib/designSystem";

interface TransactionListProps {
  transactions: ExpenseTransaction[];
  onEdit: (tx: ExpenseTransaction) => void;
  onDuplicate: (tx: ExpenseTransaction) => void;
  onDelete: (tx: ExpenseTransaction) => void;
  onToggleReconciled: (tx: ExpenseTransaction) => void;
}

export function TransactionList({
  transactions,
  onEdit,
  onDuplicate,
  onDelete,
  onToggleReconciled,
}: TransactionListProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // 日付（YYYY-MM-DD）ごとにグループ化
  const groupedByDate: Record<string, ExpenseTransaction[]> = {};
  for (const tx of transactions) {
    const d = tx.date || "日付未設定";
    if (!groupedByDate[d]) {
      groupedByDate[d] = [];
    }
    groupedByDate[d].push(tx);
  }

  // 日付の降順ソート
  const sortedDates = Object.keys(groupedByDate).sort((a, b) => b.localeCompare(a));

  if (transactions.length === 0) {
    return (
      <div
        className="arca-card"
        style={{
          background: "var(--bg-card-solid)",
          borderRadius: C.radiusCard,
          border: "1px solid var(--border-subtle)",
          boxShadow: C.cardShadow,
          padding: "4rem 2rem",
          textAlign: "center",
          color: C.charcoalLight,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "0.8rem",
        }}
      >
        <div
          style={{
            width: "56px",
            height: "56px",
            borderRadius: "50%",
            background: C.goldFaint,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: C.goldDark,
          }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <rect width="20" height="14" x="2" y="5" rx="2" />
            <line x1="2" x2="22" y1="10" y2="10" />
          </svg>
        </div>
        <div>
          <p style={{ fontSize: "0.95rem", fontWeight: 650, color: C.charcoal, margin: "0 0 0.25rem" }}>
            支出取引が見つかりません
          </p>
          <p style={{ fontSize: "0.78rem", color: C.charcoalLight, margin: 0 }}>
            右上の「+ 支出を記録」から日々の買い物を登録しましょう
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.4rem" }}>
      {sortedDates.map((dateStr) => {
        const dayTxs = groupedByDate[dateStr];
        const dayTotal = dayTxs.reduce((sum, t) => sum + (Number(t.totalAmount) || 0), 0);

        // 曜日付きフォーマット
        let displayDate = dateStr;
        try {
          const dObj = new Date(dateStr);
          if (!isNaN(dObj.getTime())) {
            const dayNames = ["日", "月", "火", "水", "木", "金", "土"];
            const m = dObj.getMonth() + 1;
            const d = dObj.getDate();
            const w = dayNames[dObj.getDay()];
            displayDate = `${m}月${d}日 (${w})`;
          }
        } catch {
          // fallback to dateStr
        }

        return (
          <div key={dateStr} style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {/* 日付ヘッダー ＆ 日計 */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0 0.5rem",
              }}
            >
              <span
                style={{
                  fontSize: "0.78rem",
                  fontWeight: 700,
                  color: C.charcoalMid,
                  letterSpacing: "0.02em",
                }}
              >
                {displayDate}
              </span>
              <span
                style={{
                  fontSize: "0.74rem",
                  fontWeight: 650,
                  color: C.charcoalLight,
                  background: "var(--bg-nav-track)",
                  padding: "0.15rem 0.5rem",
                  borderRadius: "9999px",
                }}
              >
                日計: {formatCurrency(dayTotal)}
              </span>
            </div>

            {/* 当日の取引カード群 */}
            <div
              className="arca-card"
              style={{
                background: "var(--bg-card-solid)",
                borderRadius: C.radiusCard,
                boxShadow: C.cardShadow,
                overflow: "hidden",
                border: "1px solid var(--border-subtle)",
              }}
            >
              {dayTxs.map((tx, idx) => {
                const isExpanded = expandedIds.has(tx.id);
                const visual = CATEGORY_VISUALS[tx.category] || CATEGORY_VISUALS["その他"];
                const hasItems = Array.isArray(tx.items) && tx.items.length > 0;

                return (
                  <div
                    key={tx.id}
                    style={{
                      borderBottom:
                        idx < dayTxs.length - 1 ? "1px solid rgba(0, 0, 0, 0.04)" : "none",
                      transition: "background 0.15s ease",
                    }}
                  >
                    {/* 親決済行 */}
                    <div
                      onClick={() => toggleExpand(tx.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "0.9rem 1.2rem",
                        cursor: "pointer",
                        gap: "0.8rem",
                        userSelect: "none",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLDivElement).style.background = "rgba(0, 0, 0, 0.012)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLDivElement).style.background = "transparent";
                      }}
                    >
                      {/* 左側: カテゴリバッジ ＆ 店舗名 ＆ 品目数 */}
                      <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", minWidth: 0, flex: 1 }}>
                        <span
                          style={{
                            fontSize: "0.68rem",
                            fontWeight: 700,
                            color: visual.color,
                            background: visual.bgColor,
                            border: `1px solid ${visual.borderColor}`,
                            padding: "0.2rem 0.5rem",
                            borderRadius: "6px",
                            whiteSpace: "nowrap",
                            flexShrink: 0,
                          }}
                        >
                          {tx.category}
                        </span>

                        <div style={{ minWidth: 0, display: "flex", alignItems: "baseline", gap: "0.4rem" }}>
                          <span
                            style={{
                              fontSize: "0.88rem",
                              fontWeight: 650,
                              color: C.charcoal,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {tx.title || "支出"}
                          </span>

                          {hasItems && (
                            <span
                              style={{
                                fontSize: "0.68rem",
                                color: C.charcoalLight,
                                background: "rgba(0, 0, 0, 0.04)",
                                padding: "0.1rem 0.35rem",
                                borderRadius: "4px",
                                whiteSpace: "nowrap",
                                flexShrink: 0,
                              }}
                            >
                              {tx.items.length}品
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 中央: 支払方法 ＆ 突合ステータスバッジ */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.45rem",
                          flexShrink: 0,
                        }}
                      >
                        <span
                          className="hidden sm:inline"
                          style={{
                            fontSize: "0.7rem",
                            color: C.charcoalMid,
                            background: "rgba(0, 0, 0, 0.03)",
                            padding: "0.18rem 0.45rem",
                            borderRadius: "6px",
                          }}
                        >
                          {tx.paymentMethod}
                        </span>

                        {tx.isReconciled ? (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.2rem",
                              fontSize: "0.68rem",
                              fontWeight: 650,
                              color: "#2E7D32",
                              background: "rgba(46, 125, 50, 0.10)",
                              padding: "0.18rem 0.45rem",
                              borderRadius: "9999px",
                            }}
                            title="クレジットカード明細CSVと突合済み"
                          >
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                            <span className="hidden sm:inline">突合済</span>
                          </span>
                        ) : (
                          <span
                            style={{
                              fontSize: "0.68rem",
                              color: C.charcoalLight,
                              background: "rgba(0, 0, 0, 0.03)",
                              padding: "0.18rem 0.45rem",
                              borderRadius: "9999px",
                            }}
                            title="クレジットカード明細未突合"
                          >
                            未突合
                          </span>
                        )}
                      </div>

                      {/* 右側: 合計金額 ＆ 展開シェブロン */}
                      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexShrink: 0 }}>
                        <span
                          style={{
                            fontSize: "0.95rem",
                            fontWeight: 750,
                            color: C.charcoal,
                            letterSpacing: "-0.01em",
                          }}
                        >
                          {formatCurrency(tx.totalAmount)}
                        </span>

                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          style={{
                            color: C.charcoalLight,
                            transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                            transition: "transform 0.2s ease",
                          }}
                        >
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </div>
                    </div>

                    {/* アコーディオン展開ビュー: 品目内訳 ＆ メモ ＆ アクション */}
                    {isExpanded && (
                      <div
                        style={{
                          background: "var(--bg-nav-track)",
                          borderTop: "1px dashed var(--border-subtle)",
                          padding: "0.9rem 1.2rem 1rem",
                          display: "flex",
                          flexDirection: "column",
                          gap: "0.75rem",
                          animation: "arca-fade-in 0.15s ease-out",
                        }}
                      >
                        {/* 品目リスト */}
                        {hasItems ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                            <div style={{ fontSize: "0.72rem", fontWeight: 700, color: C.charcoalLight, marginBottom: "0.15rem" }}>
                              レシート品目内訳
                            </div>
                            {tx.items.map((item, i) => {
                              const itemVisual = CATEGORY_VISUALS[item.category] || visual;
                              return (
                                <div
                                  key={item.id || i}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    padding: "0.35rem 0.6rem",
                                    background: C.white,
                                    borderRadius: "6px",
                                    border: "1px solid var(--border-subtle)",
                                  }}
                                >
                                  <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                                    <span
                                      style={{
                                        fontSize: "0.62rem",
                                        fontWeight: 650,
                                        color: itemVisual.color,
                                        background: itemVisual.bgColor,
                                        padding: "0.1rem 0.35rem",
                                        borderRadius: "4px",
                                      }}
                                    >
                                      {item.category}
                                    </span>
                                    <span style={{ fontSize: "0.8rem", color: C.charcoal }}>
                                      {item.name || "品目"}
                                    </span>
                                    {item.quantity && item.quantity > 1 && (
                                      <span style={{ fontSize: "0.7rem", color: C.charcoalLight }}>
                                        ×{item.quantity}
                                      </span>
                                    )}
                                  </div>
                                  <span style={{ fontSize: "0.82rem", fontWeight: 650, color: C.charcoalMid }}>
                                    {formatCurrency(item.amount)}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div style={{ fontSize: "0.74rem", color: C.charcoalLight, fontStyle: "italic" }}>
                            個別品目の内訳登録はありません
                          </div>
                        )}

                        {/* メモ */}
                        {tx.memo && (
                          <div
                            style={{
                              fontSize: "0.76rem",
                              color: C.charcoalMid,
                              background: "rgba(197, 160, 89, 0.06)",
                              borderLeft: `3px solid ${C.gold}`,
                              padding: "0.4rem 0.6rem",
                              borderRadius: "0 6px 6px 0",
                            }}
                          >
                            {tx.memo}
                          </div>
                        )}

                        {/* 操作アクションボタンバー */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "flex-end",
                            gap: "0.45rem",
                            paddingTop: "0.3rem",
                          }}
                        >
                          <button
                            onClick={() => onToggleReconciled(tx)}
                            style={{
                              background: "transparent",
                              border: "1px solid rgba(0, 0, 0, 0.1)",
                              borderRadius: "6px",
                              padding: "0.3rem 0.6rem",
                              fontSize: "0.72rem",
                              fontWeight: 600,
                              color: tx.isReconciled ? C.charcoalLight : "#2E7D32",
                              cursor: "pointer",
                            }}
                          >
                            {tx.isReconciled ? "突合を解除" : "突合済みにする"}
                          </button>

                          <button
                            onClick={() => onDuplicate(tx)}
                            style={{
                              background: "transparent",
                              border: "1px solid rgba(0, 0, 0, 0.1)",
                              borderRadius: "6px",
                              padding: "0.3rem 0.6rem",
                              fontSize: "0.72rem",
                              fontWeight: 600,
                              color: C.charcoalMid,
                              cursor: "pointer",
                            }}
                          >
                            複製
                          </button>

                          <button
                            onClick={() => onEdit(tx)}
                            style={{
                              background: C.goldFaint,
                              border: `1px solid ${C.goldFaint2}`,
                              borderRadius: "6px",
                              padding: "0.3rem 0.65rem",
                              fontSize: "0.72rem",
                              fontWeight: 600,
                              color: C.goldDark,
                              cursor: "pointer",
                            }}
                          >
                            編集
                          </button>

                          <button
                            onClick={() => onDelete(tx)}
                            style={{
                              background: "transparent",
                              border: "1px solid rgba(192, 97, 74, 0.2)",
                              borderRadius: "6px",
                              padding: "0.3rem 0.6rem",
                              fontSize: "0.72rem",
                              fontWeight: 600,
                              color: C.danger,
                              cursor: "pointer",
                            }}
                          >
                            削除
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
