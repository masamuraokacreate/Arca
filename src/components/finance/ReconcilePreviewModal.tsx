/**
 * src/components/finance/ReconcilePreviewModal.tsx
 * Arca — CSV照合プレビュー & 一括確定モーダル
 */

import { useState } from "react";
import type { ReconcilePreviewResult, ReconcilePreviewItem } from "../../types/finance";
import { formatCurrency } from "../../utils/financeSummary";
import { C } from "../../lib/designSystem";

interface ReconcilePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  previewResult: ReconcilePreviewResult | null;
  onConfirm: (preview: ReconcilePreviewResult) => Promise<void>;
}

type FilterTab = "all" | "match" | "create" | "skip";

export function ReconcilePreviewModal({
  isOpen,
  onClose,
  previewResult,
  onConfirm,
}: ReconcilePreviewModalProps) {
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !previewResult) return null;

  const totalCommitted = previewResult.matchedCount + previewResult.createdCount;

  const filteredItems = previewResult.items.filter((item) => {
    if (filterTab === "all") return true;
    return item.action === filterTab;
  });

  const handleExecute = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onConfirm(previewResult);
      onClose();
    } catch (err) {
      console.error("[ReconcilePreviewModal] Commit error:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        backgroundColor: "rgba(0, 0, 0, 0.4)",
        backdropFilter: "blur(6px)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div
        className="arca-card"
        style={{
          width: "100%",
          maxWidth: "680px",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          borderRadius: "20px",
          background: "var(--bg-card-solid)",
          border: "1px solid var(--border-subtle)",
          boxShadow: "0 16px 40px rgba(0, 0, 0, 0.16)",
          overflow: "hidden",
        }}
      >
        {/* ── ヘッダー ── */}
        <div
          style={{
            padding: "1.25rem 1.5rem",
            borderBottom: "1px solid var(--border-subtle)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <h2
              style={{
                fontSize: "1.1rem",
                fontWeight: 700,
                color: C.charcoal,
                margin: 0,
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <span>📊</span>
              <span>CSV照合プレビュー（{previewResult.paymentMethod}）</span>
            </h2>
            <p
              style={{
                fontSize: "0.78rem",
                color: C.charcoalLight,
                margin: "0.25rem 0 0",
              }}
            >
              対象月: {previewResult.affectedMonths.join(", ")} • 合計 {previewResult.totalCsvRows}件の明細
            </p>
          </div>

          <button
            onClick={onClose}
            disabled={isSubmitting}
            style={{
              background: "transparent",
              border: "none",
              cursor: isSubmitting ? "not-allowed" : "pointer",
              color: C.charcoalLight,
              padding: "0.4rem",
              borderRadius: "8px",
            }}
          >
            ✕
          </button>
        </div>

        {/* ── サマリーバッジ ＆ フィルタタブ ── */}
        <div
          style={{
            padding: "0.9rem 1.5rem",
            background: "var(--bg-nav-track)",
            borderBottom: "1px solid var(--border-subtle)",
            display: "flex",
            flexWrap: "wrap",
            gap: "0.5rem",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {/* サマリーバッジ */}
          <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
            <span
              style={{
                fontSize: "0.72rem",
                fontWeight: 650,
                color: "#2E7D32",
                background: "rgba(46, 125, 50, 0.12)",
                padding: "0.25rem 0.6rem",
                borderRadius: "9999px",
              }}
            >
              ✓ 突合: {previewResult.matchedCount}件
            </span>
            <span
              style={{
                fontSize: "0.72rem",
                fontWeight: 650,
                color: "#1565C0",
                background: "rgba(21, 101, 192, 0.12)",
                padding: "0.25rem 0.6rem",
                borderRadius: "9999px",
              }}
            >
              ＋ 新規作成: {previewResult.createdCount}件
            </span>
            {previewResult.skippedCount > 0 && (
              <span
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 650,
                  color: C.charcoalLight,
                  background: "rgba(0, 0, 0, 0.05)",
                  padding: "0.25rem 0.6rem",
                  borderRadius: "9999px",
                }}
              >
                ⚪ スキップ: {previewResult.skippedCount}件
              </span>
            )}
          </div>

          {/* フィルタピル */}
          <div style={{ display: "flex", gap: "0.3rem" }}>
            {(
              [
                { id: "all", label: "すべて" },
                { id: "match", label: "突合" },
                { id: "create", label: "新規" },
                { id: "skip", label: "スキップ" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilterTab(tab.id)}
                style={{
                  background: filterTab === tab.id ? "var(--bg-card-solid)" : "transparent",
                  color: filterTab === tab.id ? C.charcoal : C.charcoalLight,
                  border: filterTab === tab.id ? "1px solid var(--border-subtle)" : "1px solid transparent",
                  borderRadius: "6px",
                  padding: "0.2rem 0.5rem",
                  fontSize: "0.7rem",
                  fontWeight: filterTab === tab.id ? 700 : 500,
                  cursor: "pointer",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── 明細プレビューリスト ── */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "0.8rem 1.5rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.6rem",
          }}
        >
          {filteredItems.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "2.5rem 1rem",
                color: C.charcoalLight,
                fontSize: "0.85rem",
              }}
            >
              該当する明細がありません
            </div>
          ) : (
            filteredItems.map((item, idx) => (
              <PreviewRowItem key={item.csvRow.rowId || idx} item={item} />
            ))
          )}
        </div>

        {/* ── フッター ── */}
        <div
          style={{
            padding: "1rem 1.5rem",
            borderTop: "1px solid var(--border-subtle)",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: "0.8rem",
            background: "var(--bg-card-solid)",
          }}
        >
          <button
            onClick={onClose}
            disabled={isSubmitting}
            style={{
              padding: "0.55rem 1.1rem",
              borderRadius: "10px",
              border: "1px solid var(--border-subtle)",
              background: "transparent",
              color: C.charcoalMid,
              fontSize: "0.82rem",
              fontWeight: 600,
              cursor: isSubmitting ? "not-allowed" : "pointer",
            }}
          >
            キャンセル
          </button>

          <button
            onClick={handleExecute}
            disabled={isSubmitting || totalCommitted === 0}
            data-testid="batch-commit-btn"
            style={{
              padding: "0.55rem 1.4rem",
              borderRadius: "10px",
              border: "none",
              background: totalCommitted === 0 ? "rgba(0,0,0,0.1)" : C.gold,
              color: totalCommitted === 0 ? C.charcoalLight : "#FDFCFA",
              fontSize: "0.82rem",
              fontWeight: 700,
              cursor: isSubmitting || totalCommitted === 0 ? "not-allowed" : "pointer",
              boxShadow: totalCommitted === 0 ? "none" : "0 2px 8px rgba(197, 160, 89, 0.3)",
              display: "flex",
              alignItems: "center",
              gap: "0.45rem",
            }}
          >
            {isSubmitting ? (
              <>
                <span
                  style={{
                    display: "inline-block",
                    width: "14px",
                    height: "14px",
                    border: "2px solid rgba(255,255,255,0.3)",
                    borderTopColor: "#FFF",
                    borderRadius: "50%",
                    animation: "spin 0.8s linear infinite",
                  }}
                />
                <span>登録中...</span>
              </>
            ) : (
              <>
                <span>✓</span>
                <span>
                  {totalCommitted > 0
                    ? `すべて登録して確定 (${totalCommitted}件)`
                    : "登録対象なし"}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function PreviewRowItem({ item }: { item: ReconcilePreviewItem }) {
  const getBadge = () => {
    switch (item.action) {
      case "match":
        return (
          <span
            style={{
              fontSize: "0.68rem",
              fontWeight: 700,
              color: "#2E7D32",
              background: "rgba(46, 125, 50, 0.12)",
              padding: "0.15rem 0.45rem",
              borderRadius: "6px",
              whiteSpace: "nowrap",
            }}
          >
            突合
          </span>
        );
      case "create":
        return (
          <span
            style={{
              fontSize: "0.68rem",
              fontWeight: 700,
              color: "#1565C0",
              background: "rgba(21, 101, 192, 0.12)",
              padding: "0.15rem 0.45rem",
              borderRadius: "6px",
              whiteSpace: "nowrap",
            }}
          >
            新規
          </span>
        );
      case "skip":
        return (
          <span
            style={{
              fontSize: "0.68rem",
              fontWeight: 700,
              color: C.charcoalLight,
              background: "rgba(0, 0, 0, 0.05)",
              padding: "0.15rem 0.45rem",
              borderRadius: "6px",
              whiteSpace: "nowrap",
            }}
          >
            スキップ
          </span>
        );
    }
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0.65rem 0.85rem",
        borderRadius: "10px",
        background: item.action === "skip" ? "rgba(0,0,0,0.015)" : "var(--bg-nav-track)",
        border: "1px solid var(--border-subtle)",
        gap: "0.8rem",
        opacity: item.action === "skip" ? 0.65 : 1,
      }}
    >
      {/* 左側: バッジ ＆ 日付 ＆ 店名 */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", minWidth: 0 }}>
        {getBadge()}
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: "0.84rem",
              fontWeight: 650,
              color: C.charcoal,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {item.csvRow.title}
          </div>
          <div style={{ fontSize: "0.7rem", color: C.charcoalLight }}>
            {item.csvRow.date} • {item.matchReason}
          </div>
        </div>
      </div>

      {/* 右側: 金額 */}
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: "0.9rem", fontWeight: 700, color: C.charcoal }}>
          {formatCurrency(item.csvRow.amount)}
        </div>
        {item.matchedTransaction && (
          <div style={{ fontSize: "0.68rem", color: "#2E7D32", fontWeight: 600 }}>
            既存: {item.matchedTransaction.title}
          </div>
        )}
      </div>
    </div>
  );
}
