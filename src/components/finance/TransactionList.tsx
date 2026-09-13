/**
 * src/components/finance/TransactionList.tsx
 * Arca — 支出一覧 ＆ アコーディオン品目内訳（1対N）表示コンポーネント
 */

import { useState, useMemo } from "react";
import { Link as LinkIcon } from "lucide-react";
import type { ExpenseTransaction } from "../../types/finance";
import { CATEGORY_VISUALS, formatCurrency } from "../../utils/financeSummary";
import { getDaysDifference, isStoreNameSimilar } from "../../utils/csvReconcile";
import { C } from "../../lib/designSystem";

export const isManualOrOcr = (tx: ExpenseTransaction): boolean => {
  return tx.source === "manual" || tx.source === "ocr" || (Array.isArray(tx.items) && tx.items.length > 0);
};

export const isEmailNotice = (tx: ExpenseTransaction): boolean => {
  return tx.source === "email_notice" || Boolean(tx.emailMessageId);
};

interface TransactionListProps {
  transactions: ExpenseTransaction[];
  onEdit: (tx: ExpenseTransaction) => void;
  onDuplicate: (tx: ExpenseTransaction) => void;
  onDelete: (tx: ExpenseTransaction) => void;
  onToggleReconciled: (tx: ExpenseTransaction) => void;
  onMerge?: (targetTx: ExpenseTransaction, sourceTx: ExpenseTransaction) => void;
  onOpenMergeModal?: (manualOrOcrTx: ExpenseTransaction, emailTx: ExpenseTransaction) => void;
}

export function TransactionList({
  transactions,
  onEdit,
  onDuplicate,
  onDelete,
  onToggleReconciled,
  onMerge,
  onOpenMergeModal,
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

  // 有効レコード（論理削除 isDeleted: true を 100% 除外）
  const activeTransactions = useMemo(() => {
    return transactions.filter((t) => !t.isDeleted);
  }, [transactions]);

  // 未突合レコード間の突合候補ペア（手動/レシート側 ⇄ 速報メール側、または同日同額ペア）マップ
  const mergeCandidatesMap = useMemo(() => {
    const map = new Map<string, ExpenseTransaction>();
    const unreconciled = activeTransactions.filter((t) => !t.isReconciled);

    for (const t of unreconciled) {
      const tIsManual = isManualOrOcr(t);
      const tIsEmail = isEmailNotice(t);

      // 1. 店舗名類似（スマート名寄せ）を含む候補を最優先探索 (±1日以内)
      let candidate = unreconciled.find((other) => {
        if (other.id === t.id) return false;
        if (other.totalAmount !== t.totalAmount) return false;
        if (getDaysDifference(t.date, other.date) > 1) return false;
        if (!isStoreNameSimilar(t.title, other.title)) return false;

        const otherIsManual = isManualOrOcr(other);
        const otherIsEmail = isEmailNotice(other);

        return (tIsManual && otherIsEmail) || (tIsEmail && otherIsManual);
      });

      // 2. 店舗名類似の候補がなくても、同じ日と同じ金額の手動/メール速報ペアを探索
      if (!candidate) {
        candidate = unreconciled.find((other) => {
          if (other.id === t.id) return false;
          if (other.totalAmount !== t.totalAmount) return false;
          if (t.date !== other.date) return false;

          const otherIsManual = isManualOrOcr(other);
          const otherIsEmail = isEmailNotice(other);

          return (tIsManual && otherIsEmail) || (tIsEmail && otherIsManual);
        });
      }

      // 3. （予備）同じ日と同じ金額の未突合レコードを探索
      if (!candidate) {
        candidate = unreconciled.find((other) => {
          if (other.id === t.id) return false;
          if (other.totalAmount !== t.totalAmount) return false;
          if (t.date !== other.date) return false;
          return true;
        });
      }

      if (candidate) {
        map.set(t.id, candidate);
      }
    }
    return map;
  }, [activeTransactions]);

  // 日付（YYYY-MM-DD）ごとにグループ化
  const groupedByDate: Record<string, ExpenseTransaction[]> = {};
  for (const tx of activeTransactions) {
    const d = tx.date || "日付未設定";
    if (!groupedByDate[d]) {
      groupedByDate[d] = [];
    }
    groupedByDate[d].push(tx);
  }

  // 日付の降順ソート
  const sortedDates = Object.keys(groupedByDate).sort((a, b) => b.localeCompare(a));

  if (activeTransactions.length === 0) {
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
                const mergeCandidate = mergeCandidatesMap.get(tx.id);

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
                      className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                      style={{
                        padding: "0.85rem 1.05rem",
                        cursor: "pointer",
                        userSelect: "none",
                        transition: "background 0.15s ease",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLDivElement).style.background = "rgba(0, 0, 0, 0.012)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLDivElement).style.background = "transparent";
                      }}
                    >
                      {/* モバイル上段 / デスクトップ左側: 店舗名 & 金額 (モバイル) */}
                      <div className="flex items-center justify-between sm:justify-start gap-2 min-w-0 sm:flex-1">
                        {/* デスクトップ用カテゴリバッジ */}
                        <span
                          className="hidden sm:inline-block shrink-0"
                          style={{
                            fontSize: "0.68rem",
                            fontWeight: 700,
                            color: visual.color,
                            background: visual.bgColor,
                            border: `1px solid ${visual.borderColor}`,
                            padding: "0.2rem 0.5rem",
                            borderRadius: "6px",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {tx.category}
                        </span>

                        {/* 店舗名 ＆ 品目数（デスクトップ） */}
                        <div className="flex items-baseline gap-1.5 min-w-0 flex-1 mr-1 sm:mr-2">
                          <span
                            style={{
                              fontSize: "0.9rem",
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
                              className="hidden sm:inline-block shrink-0"
                              style={{
                                fontSize: "0.68rem",
                                color: C.charcoalLight,
                                background: "rgba(0, 0, 0, 0.04)",
                                padding: "0.1rem 0.35rem",
                                borderRadius: "4px",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {tx.items.length}品
                            </span>
                          )}
                        </div>

                        {/* モバイル上段右側: 金額 ＆ 展開シェブロン */}
                        <div className="flex sm:hidden items-center gap-1.5 shrink-0">
                          <span
                            style={{
                              fontSize: "0.96rem",
                              fontWeight: 750,
                              color: C.charcoal,
                              letterSpacing: "-0.01em",
                            }}
                          >
                            {formatCurrency(tx.totalAmount)}
                          </span>
                          <svg
                            width="13"
                            height="13"
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

                      {/* モバイル下段 / デスクトップ中央＋右側 */}
                      <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
                        {/* モバイル用メタデータ: 日付 ＋ カテゴリ ＋ 支払方法 */}
                        <div className="flex sm:hidden items-center gap-1.5 min-w-0 overflow-hidden">
                          {tx.date && (
                            <span style={{ fontSize: "0.68rem", color: "#555", flexShrink: 0 }}>
                              {tx.date.substring(5).replace("-", "/")}
                            </span>
                          )}
                          <span
                            style={{
                              fontSize: "0.65rem",
                              fontWeight: 700,
                              color: visual.color,
                              background: visual.bgColor,
                              border: `1px solid ${visual.borderColor}`,
                              padding: "0.1rem 0.35rem",
                              borderRadius: "5px",
                              whiteSpace: "nowrap",
                              flexShrink: 0,
                            }}
                          >
                            {tx.category}
                          </span>
                          <span
                            style={{
                              fontSize: "0.65rem",
                              color: "#4A4A4A",
                              background: "rgba(0, 0, 0, 0.04)",
                              padding: "0.1rem 0.35rem",
                              borderRadius: "5px",
                              whiteSpace: "nowrap",
                              flexShrink: 0,
                            }}
                          >
                            {tx.paymentMethod}
                          </span>
                        </div>

                        {/* デスクトップ用支払方法 */}
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

                        {/* バッジ群（モバイル下段右側 / デスクトップ中央） */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {hasItems && (
                            <span
                              className="inline-block sm:hidden shrink-0"
                              style={{
                                fontSize: "0.65rem",
                                color: "#4A4A4A",
                                background: "rgba(0, 0, 0, 0.05)",
                                padding: "0.1rem 0.32rem",
                                borderRadius: "4px",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {tx.items.length}品
                            </span>
                          )}

                          {/* メール速報バッジ */}
                          {(tx.source === "email_notice" || tx.emailMessageId) && (
                            <span
                              data-testid="email-notice-badge"
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "0.2rem",
                                fontSize: "0.66rem",
                                fontWeight: 650,
                                color: "#856404",
                                background: "rgba(255, 193, 7, 0.15)",
                                padding: "0.14rem 0.4rem",
                                borderRadius: "9999px",
                              }}
                              title="Gmail利用速報メールより取得"
                            >
                              <span>速報</span>
                            </span>
                          )}

                          {tx.isReconciled ? (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "0.2rem",
                                fontSize: "0.66rem",
                                fontWeight: 650,
                                color: "#2E7D32",
                                background: "rgba(46, 125, 50, 0.10)",
                                padding: "0.14rem 0.4rem",
                                borderRadius: "9999px",
                              }}
                              title="クレジットカード明細CSVと確認済み"
                            >
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                              <span>確認済</span>
                            </span>
                          ) : (
                            <>
                              <span
                                style={{
                                  fontSize: "0.66rem",
                                  fontWeight: 550,
                                  color: "#555",
                                  background: "rgba(0, 0, 0, 0.04)",
                                  padding: "0.14rem 0.4rem",
                                  borderRadius: "9999px",
                                }}
                                title="クレジットカード明細未確認"
                              >
                                未確認
                              </span>
                              {mergeCandidate && (
                                <span
                                  data-testid="merge-candidate-badge"
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    fontSize: "0.66rem",
                                    fontWeight: 650,
                                    color: "#B45309",
                                    background: "rgba(245, 158, 11, 0.12)",
                                    border: "1px solid rgba(245, 158, 11, 0.28)",
                                    padding: "0.12rem 0.4rem",
                                    borderRadius: "9999px",
                                  }}
                                  title={`同額の未確認決済「${mergeCandidate.title}」と結合可能`}
                                >
                                  <span>確認候補あり</span>
                                </span>
                              )}
                            </>
                          )}
                        </div>

                        {/* デスクトップ用右側: 金額 ＆ 展開シェブロン */}
                        <div className="hidden sm:flex items-center gap-2 shrink-0">
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
                            {tx.isReconciled ? "確認を解除" : "確認済みにする"}
                          </button>

                          {mergeCandidate && !tx.isReconciled && (onOpenMergeModal || onMerge) && (() => {
                            const txIsEmail = isEmailNotice(tx);
                            const candIsEmail = isEmailNotice(mergeCandidate);
                            const txHasItems = Array.isArray(tx.items) && tx.items.length > 0;
                            const candHasItems = Array.isArray(mergeCandidate.items) && mergeCandidate.items.length > 0;

                            let buttonLabel = "速報メールと結合";
                            if (txIsEmail && !candIsEmail) {
                              buttonLabel = "手動・レシート記録と結合";
                            } else if (!txIsEmail && candIsEmail) {
                              buttonLabel = "速報メールと結合";
                            } else {
                              buttonLabel = "同日同額の記録と結合";
                            }

                            // 相手先のサブ表示
                            let subText = "";
                            if (candHasItems) {
                              subText = `${mergeCandidate.title} (${mergeCandidate.items.length}品目)`;
                            } else if (candIsEmail) {
                              const candMethod = mergeCandidate.paymentMethod || "カード決済";
                              subText = `${mergeCandidate.title} (${candMethod})`;
                            } else {
                              const candMethod = mergeCandidate.paymentMethod || "未確認";
                              subText = `${mergeCandidate.title} (${candMethod})`;
                            }

                            const handleMergeClick = (e: React.MouseEvent) => {
                              e.stopPropagation();
                              let manualTx = tx;
                              let emailTx = mergeCandidate;

                              if (candHasItems && !txHasItems) {
                                manualTx = mergeCandidate;
                                emailTx = tx;
                              } else if (txHasItems && !candHasItems) {
                                manualTx = tx;
                                emailTx = mergeCandidate;
                              } else if (txIsEmail && !candIsEmail) {
                                manualTx = mergeCandidate;
                                emailTx = tx;
                              } else if (!txIsEmail && candIsEmail) {
                                manualTx = tx;
                                emailTx = mergeCandidate;
                              }

                              if (onOpenMergeModal) {
                                onOpenMergeModal(manualTx, emailTx);
                              } else if (onMerge) {
                                onMerge(manualTx, emailTx);
                              }
                            };

                            return (
                              <button
                                data-testid="merge-button"
                                onClick={handleMergeClick}
                                style={{
                                  background: "rgba(197, 160, 89, 0.10)",
                                  border: "1px solid rgba(197, 160, 89, 0.35)",
                                  borderRadius: "7px",
                                  padding: "0.32rem 0.65rem",
                                  fontSize: "0.72rem",
                                  fontWeight: 650,
                                  color: C.goldDark,
                                  cursor: "pointer",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "0.4rem",
                                  transition: "all 0.15s ease",
                                }}
                                title={`「${subText}」と統合して確定レコードにします`}
                              >
                                <LinkIcon size={13} strokeWidth={2.4} />
                                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 1.25 }}>
                                  <span>{buttonLabel}</span>
                                  <span style={{ fontSize: "0.62rem", color: C.charcoalLight, fontWeight: 500 }}>
                                    {subText}
                                  </span>
                                </div>
                              </button>
                            );
                          })()}

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
