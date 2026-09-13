/**
 * src/components/finance/TransactionMergeModal.tsx
 * Arca — 手動/レシート記録と速報メールの対比＆結合確認モーダル (Sprint 10.14)
 *
 * 設計原則:
 * - 左（手動・レシート取り込み: 内訳維持）と右（速報メール: 決済情報引き継ぎ・重複削除）を明確に対比表示
 * - 絵文字は一切使用せず、Lucide React の SVG アイコンのみを使用
 * - Matte Gold (#C5A059) を基調とした上質なカードデザイン
 */

import { useState } from "react";
import { Link, Check, Receipt, CreditCard, ArrowRight, X } from "lucide-react";
import type { ExpenseTransaction } from "../../types/finance";
import { formatCurrency } from "../../utils/financeSummary";
import { C } from "../../lib/designSystem";

interface TransactionMergeModalProps {
  isOpen: boolean;
  manualOrOcrTx: ExpenseTransaction | null;
  emailTx: ExpenseTransaction | null;
  onClose: () => void;
  onConfirmMerge: (manualOrOcrTx: ExpenseTransaction, emailTx: ExpenseTransaction) => Promise<void>;
}

export function TransactionMergeModal({
  isOpen,
  manualOrOcrTx,
  emailTx,
  onClose,
  onConfirmMerge,
}: TransactionMergeModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !manualOrOcrTx || !emailTx) return null;

  const handleConfirm = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onConfirmMerge(manualOrOcrTx, emailTx);
      onClose();
    } catch (err) {
      console.error("[TransactionMergeModal] Error merging transactions:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const itemsCount = Array.isArray(manualOrOcrTx.items) ? manualOrOcrTx.items.length : 0;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        backgroundColor: "rgba(0, 0, 0, 0.45)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        animation: "arca-fade-in 0.15s ease-out",
      }}
      onClick={isSubmitting ? undefined : onClose}
    >
      <div
        className="arca-card"
        style={{
          background: "var(--bg-card-solid)",
          borderRadius: C.radiusModal,
          boxShadow: "var(--shadow-modal)",
          width: "100%",
          maxWidth: "640px",
          overflow: "hidden",
          border: "1px solid var(--border-subtle)",
          display: "flex",
          flexDirection: "column",
          animation: "arca-modal-pop 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* モーダルヘッダー */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "1.1rem 1.4rem",
            borderBottom: "1px solid var(--border-subtle)",
            background: "rgba(197, 160, 89, 0.04)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.55rem" }}>
            <div
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "8px",
                background: C.goldFaint,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: C.goldDark,
              }}
            >
              <Link size={16} />
            </div>
            <div>
              <h2
                style={{
                  fontSize: "1rem",
                  fontWeight: 700,
                  color: C.charcoal,
                  margin: 0,
                  letterSpacing: "-0.01em",
                }}
              >
                決済レコードの結合・確定
              </h2>
              <p style={{ fontSize: "0.74rem", color: C.charcoalLight, margin: "0.1rem 0 0" }}>
                レシートの内訳を保持し、速報メールのカード決済情報と統合します
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isSubmitting}
            style={{
              background: "transparent",
              border: "none",
              cursor: isSubmitting ? "not-allowed" : "pointer",
              color: C.charcoalLight,
              padding: "0.35rem",
              borderRadius: "6px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* 対比表示エリア */}
        <div style={{ padding: "1.3rem 1.4rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto 1fr",
              gap: "0.75rem",
              alignItems: "center",
            }}
          >
            {/* 左側: 手動・レシート取り込み */}
            <div
              style={{
                background: "var(--bg-nav-track)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "10px",
                padding: "1rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.6rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <Receipt size={14} color={C.goldDark} />
                <span style={{ fontSize: "0.72rem", fontWeight: 700, color: C.goldDark }}>
                  手動 / レシート記録
                </span>
              </div>

              <div>
                <div
                  style={{
                    fontSize: "0.92rem",
                    fontWeight: 700,
                    color: C.charcoal,
                    wordBreak: "break-word",
                  }}
                >
                  {manualOrOcrTx.title}
                </div>
                <div style={{ fontSize: "0.74rem", color: C.charcoalLight, marginTop: "0.15rem" }}>
                  {manualOrOcrTx.date}
                </div>
              </div>

              <div style={{ fontSize: "1.1rem", fontWeight: 800, color: C.charcoal }}>
                {formatCurrency(manualOrOcrTx.totalAmount)}
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  padding: "0.4rem 0.6rem",
                  background: "rgba(46, 125, 50, 0.08)",
                  borderRadius: "6px",
                  border: "1px solid rgba(46, 125, 50, 0.2)",
                  fontSize: "0.72rem",
                  fontWeight: 650,
                  color: "#2E7D32",
                }}
              >
                <Check size={13} />
                <span>
                  {itemsCount > 0 ? `${itemsCount}品目の内訳を維持` : "ベースデータとして維持"}
                </span>
              </div>
            </div>

            {/* 中央矢印 */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: C.goldDark,
                background: C.goldFaint,
                borderRadius: "50%",
                width: "28px",
                height: "28px",
              }}
            >
              <ArrowRight size={16} />
            </div>

            {/* 右側: 速報メール / 統合元決済 */}
            {(() => {
              const isEmail = emailTx.source === "email_notice" || Boolean(emailTx.emailMessageId);
              const rightLabel = isEmail ? "速報メール" : "統合元決済";
              return (
                <div
                  style={{
                    background: "var(--bg-nav-track)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "10px",
                    padding: "1rem",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.6rem",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                    <CreditCard size={14} color={C.charcoalMid} />
                    <span style={{ fontSize: "0.72rem", fontWeight: 700, color: C.charcoalMid }}>
                      {rightLabel}
                    </span>
                  </div>

                  <div>
                    <div
                      style={{
                        fontSize: "0.92rem",
                        fontWeight: 700,
                        color: C.charcoal,
                        wordBreak: "break-word",
                      }}
                    >
                      {emailTx.title}
                    </div>
                    <div style={{ fontSize: "0.74rem", color: C.charcoalLight, marginTop: "0.15rem" }}>
                      {emailTx.date}
                    </div>
                  </div>

                  <div style={{ fontSize: "1.1rem", fontWeight: 800, color: C.charcoal }}>
                    {formatCurrency(emailTx.totalAmount)}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.35rem",
                      padding: "0.4rem 0.6rem",
                      background: "rgba(197, 160, 89, 0.10)",
                      borderRadius: "6px",
                      border: "1px solid rgba(197, 160, 89, 0.25)",
                      fontSize: "0.72rem",
                      fontWeight: 650,
                      color: C.goldDark,
                    }}
                  >
                    <span>{emailTx.paymentMethod} 決済情報を引き継ぐ</span>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* 統合内容の説明 */}
          {(() => {
            const isEmail = emailTx.source === "email_notice" || Boolean(emailTx.emailMessageId);
            return (
              <div
                style={{
                  padding: "0.75rem 1rem",
                  background: "rgba(0, 0, 0, 0.02)",
                  border: "1px dashed var(--border-subtle)",
                  borderRadius: "8px",
                  fontSize: "0.74rem",
                  color: C.charcoalMid,
                  lineHeight: 1.5,
                }}
              >
                ・レシート・記録側の品目内訳（{itemsCount > 0 ? `${itemsCount}品目` : "記録データ"}）を残したまま、{isEmail ? "速報メールのカード支払方法" : "支払方法"}（{emailTx.paymentMethod}）を適用します。
                <br />
                ・統合後は「確認済み」ステータスに更新され、重複していた{isEmail ? "速報メール側の" : "もう一方の"}レコードは安全に整理されます。
              </div>
            );
          })()}
        </div>

        {/* モーダルフッター */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: "0.6rem",
            padding: "0.9rem 1.4rem",
            borderTop: "1px solid var(--border-subtle)",
            background: "var(--bg-card-solid)",
          }}
        >
          <button
            onClick={onClose}
            disabled={isSubmitting}
            style={{
              background: "transparent",
              border: "1px solid var(--border-subtle)",
              borderRadius: "8px",
              padding: "0.55rem 1rem",
              fontSize: "0.82rem",
              fontWeight: 600,
              color: C.charcoalMid,
              cursor: isSubmitting ? "not-allowed" : "pointer",
            }}
          >
            キャンセル
          </button>

          <button
            data-testid="confirm-merge-btn"
            onClick={handleConfirm}
            disabled={isSubmitting}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              background: C.gold,
              border: "none",
              borderRadius: "8px",
              padding: "0.55rem 1.15rem",
              fontSize: "0.82rem",
              fontWeight: 700,
              color: C.white,
              cursor: isSubmitting ? "not-allowed" : "pointer",
              boxShadow: "0 2px 6px rgba(197, 160, 89, 0.3)",
              opacity: isSubmitting ? 0.7 : 1,
            }}
          >
            <Check size={15} strokeWidth={2.6} />
            <span>{isSubmitting ? "結合中..." : "この2件を結合して確定"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
