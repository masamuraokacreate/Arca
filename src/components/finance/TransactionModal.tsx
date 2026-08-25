/**
 * src/components/finance/TransactionModal.tsx
 * Arca — 支出取引＆レシート品目内訳（1対N）編集モーダル
 */

import { useState, useEffect } from "react";
import {
  EXPENSE_CATEGORIES,
  PAYMENT_METHODS,
  type ExpenseCategory,
  type ExpenseItem,
  type ExpenseTransaction,
  type PaymentMethod,
} from "../../types/finance";
import { createEmptyExpenseItem } from "../../lib/financeStorage";
import { formatCurrency } from "../../utils/financeSummary";
import { C } from "../../lib/designSystem";

interface TransactionModalProps {
  isOpen: boolean;
  initialTransaction?: ExpenseTransaction | null;
  defaultDate?: string;
  onSave: (tx: Omit<ExpenseTransaction, "id">) => Promise<void>;
  onClose: () => void;
}

export function TransactionModal({
  isOpen,
  initialTransaction,
  defaultDate,
  onSave,
  onClose,
}: TransactionModalProps) {
  const [date, setDate] = useState("");
  const [title, setTitle] = useState("");
  const [totalAmount, setTotalAmount] = useState<number | "">("");
  const [category, setCategory] = useState<ExpenseCategory>("食費");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("Oliveカード");
  const [items, setItems] = useState<ExpenseItem[]>([]);
  const [memo, setMemo] = useState("");
  const [receiptImageUrl, setReceiptImageUrl] = useState<string | undefined>(undefined);
  const [isAutoSum, setIsAutoSum] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (initialTransaction) {
        setDate(initialTransaction.date || "");
        setTitle(initialTransaction.title || "");
        setTotalAmount(initialTransaction.totalAmount ?? 0);
        setCategory(initialTransaction.category || "食費");
        setPaymentMethod(initialTransaction.paymentMethod || "Oliveカード");
        setItems(
          Array.isArray(initialTransaction.items) && initialTransaction.items.length > 0
            ? initialTransaction.items.map((it) => ({ ...it }))
            : []
        );
        setMemo(initialTransaction.memo || "");
        setReceiptImageUrl(initialTransaction.receiptImageUrl);
        setIsAutoSum(
          Array.isArray(initialTransaction.items) && initialTransaction.items.length > 0
        );
      } else {
        const today = defaultDate || new Date().toISOString().slice(0, 10);
        setDate(today);
        setTitle("");
        setTotalAmount("");
        setCategory("食費");
        setPaymentMethod("Oliveカード");
        setItems([]);
        setMemo("");
        setReceiptImageUrl(undefined);
        setIsAutoSum(true);
      }
    }
  }, [isOpen, initialTransaction, defaultDate]);

  // 品目リストの合計額を計算
  const itemsSum = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

  // 品目追加時に親合計金額を自動連動
  useEffect(() => {
    if (isAutoSum && items.length > 0) {
      setTotalAmount(itemsSum);
    }
  }, [itemsSum, isAutoSum, items.length]);

  if (!isOpen) return null;

  const handleAddItem = () => {
    const newItem = createEmptyExpenseItem(category);
    setItems((prev) => [...prev, newItem]);
    if (!isAutoSum && items.length === 0) {
      setIsAutoSum(true);
    }
  };

  const handleItemChange = (index: number, patch: Partial<ExpenseItem>) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const finalTotal = typeof totalAmount === "number" ? totalAmount : Number(totalAmount) || 0;
    if (finalTotal <= 0 && itemsSum <= 0) return;

    setIsSaving(true);
    try {
      await onSave({
        date: date || new Date().toISOString().slice(0, 10),
        title: title.trim(),
        totalAmount: isAutoSum && items.length > 0 ? itemsSum : finalTotal,
        category,
        paymentMethod,
        items: items.filter((it) => it.name.trim() || it.amount !== 0),
        isReconciled: initialTransaction?.isReconciled || false,
        matchedCsvRowId: initialTransaction?.matchedCsvRowId || "",
        receiptImageUrl: receiptImageUrl || initialTransaction?.receiptImageUrl,
        memo: memo.trim(),
        createdAt: initialTransaction?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isDeleted: false,
      });
      onClose();
    } catch (err) {
      console.error("Failed to save transaction:", err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        backgroundColor: "rgba(0, 0, 0, 0.38)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        animation: "arca-fade-in 0.18s ease-out",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: C.white,
          borderRadius: C.radiusModal,
          boxShadow: C.modalShadow,
          width: "100%",
          maxWidth: "600px",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          border: "1px solid rgba(0, 0, 0, 0.05)",
          animation: "arca-modal-pop 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* モーダルヘッダー */}
        <div
          style={{
            padding: "1.2rem 1.5rem 0.9rem",
            borderBottom: "1px solid rgba(0, 0, 0, 0.05)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <h2
              style={{
                fontSize: "1.15rem",
                fontWeight: 700,
                color: C.charcoal,
                margin: 0,
                letterSpacing: "-0.01em",
              }}
            >
              {initialTransaction ? "支出を編集" : "支出を記録"}
            </h2>
            <p style={{ fontSize: "0.74rem", color: C.charcoalLight, margin: "0.15rem 0 0" }}>
              店舗・支払先と品目内訳（レシート）を登録
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="閉じる"
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: C.charcoalLight,
              padding: "0.3rem",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* フォーム入力本文（スクロール可能） */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", overflow: "hidden", flex: 1, width: "100%", boxSizing: "border-box" }}>
          <div
            style={{
              padding: "1.2rem 1.5rem",
              overflowY: "auto",
              overflowX: "hidden",
              display: "flex",
              flexDirection: "column",
              gap: "1.1rem",
              flex: 1,
              width: "100%",
              boxSizing: "border-box",
            }}
          >
            {/* OCR読取からの登録通知 ＆ サムネイル */}
            {receiptImageUrl && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: "rgba(197, 160, 89, 0.08)",
                  border: `1px solid ${C.goldFaint3}`,
                  borderRadius: "10px",
                  padding: "0.65rem 0.9rem",
                  gap: "0.75rem",
                  width: "100%",
                  boxSizing: "border-box",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      fontSize: "0.68rem",
                      fontWeight: 700,
                      color: C.goldDark,
                      background: C.goldFaint2,
                      padding: "0.2rem 0.5rem",
                      borderRadius: "4px",
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                      display: "inline-block",
                    }}
                  >
                    📷 レシートOCR解析
                  </span>
                  <span style={{ fontSize: "0.72rem", color: C.charcoalMid, lineHeight: 1.4 }}>
                    印字内容を抽出しました。内容をご確認・修正の上保存してください。
                  </span>
                </div>
                <img
                  src={receiptImageUrl}
                  alt="Receipt"
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "6px",
                    objectFit: "cover",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                    border: "1px solid rgba(0,0,0,0.08)",
                    flexShrink: 0,
                  }}
                />
              </div>
            )}

            {/* 日付 ＆ 支払方法 */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                gap: "0.8rem",
                width: "100%",
                boxSizing: "border-box",
              }}
            >
              <div>
                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 650, color: C.charcoalMid, marginBottom: "0.3rem" }}>
                  利用日 / 決済日 <span style={{ color: C.danger }}>*</span>
                </label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.55rem 0.75rem",
                    borderRadius: "8px",
                    border: "1px solid rgba(0,0,0,0.12)",
                    fontSize: "0.85rem",
                    color: C.charcoal,
                    background: "#FFF",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 650, color: C.charcoalMid, marginBottom: "0.3rem" }}>
                  支払方法
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  style={{
                    width: "100%",
                    padding: "0.55rem 0.75rem",
                    borderRadius: "8px",
                    border: "1px solid rgba(0,0,0,0.12)",
                    fontSize: "0.85rem",
                    color: C.charcoal,
                    background: "#FFF",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                >
                  {PAYMENT_METHODS.map((pm) => (
                    <option key={pm} value={pm}>
                      {pm}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* 店舗名 / 支払先 ＆ メインカテゴリ */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                gap: "0.8rem",
                width: "100%",
                boxSizing: "border-box",
              }}
            >
              <div>
                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 650, color: C.charcoalMid, marginBottom: "0.3rem" }}>
                  店舗名・支払先 <span style={{ color: C.danger }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="例: イオン〇〇店, セブンイレブン"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.55rem 0.75rem",
                    borderRadius: "8px",
                    border: "1px solid rgba(0,0,0,0.12)",
                    fontSize: "0.85rem",
                    color: C.charcoal,
                    background: "#FFF",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 650, color: C.charcoalMid, marginBottom: "0.3rem" }}>
                  カテゴリ
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                  style={{
                    width: "100%",
                    padding: "0.55rem 0.75rem",
                    borderRadius: "8px",
                    border: "1px solid rgba(0,0,0,0.12)",
                    fontSize: "0.85rem",
                    color: C.charcoal,
                    background: "#FFF",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                >
                  {EXPENSE_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* 決済合計金額 */}
            <div
              style={{
                background: "rgba(0, 0, 0, 0.02)",
                padding: "0.85rem 1rem",
                borderRadius: "10px",
                border: "1px solid rgba(0, 0, 0, 0.04)",
                width: "100%",
                boxSizing: "border-box",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.35rem", flexWrap: "wrap", gap: "0.3rem" }}>
                <label style={{ fontSize: "0.75rem", fontWeight: 650, color: C.charcoalMid }}>
                  決済合計金額 (円) <span style={{ color: C.danger }}>*</span>
                </label>
                {items.length > 0 && (
                  <label style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.72rem", color: C.charcoalLight, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={isAutoSum}
                      onChange={(e) => setIsAutoSum(e.target.checked)}
                      style={{ accentColor: C.gold }}
                    />
                    品目合計と自動連動 ({formatCurrency(itemsSum)})
                  </label>
                )}
              </div>
              <div style={{ position: "relative" }}>
                <span
                  style={{
                    position: "absolute",
                    left: "0.75rem",
                    top: "50%",
                    transform: "translateY(-50%)",
                    fontWeight: 650,
                    color: C.charcoalLight,
                    fontSize: "0.9rem",
                  }}
                >
                  ¥
                </span>
                <input
                  type="number"
                  required
                  min="1"
                  placeholder="0"
                  value={totalAmount}
                  disabled={isAutoSum && items.length > 0}
                  onChange={(e) => setTotalAmount(e.target.value === "" ? "" : Number(e.target.value))}
                  style={{
                    width: "100%",
                    padding: "0.6rem 0.75rem 0.6rem 1.8rem",
                    borderRadius: "8px",
                    border: "1px solid rgba(0,0,0,0.12)",
                    fontSize: "1.05rem",
                    fontWeight: 700,
                    color: C.charcoal,
                    background: isAutoSum && items.length > 0 ? "rgba(0,0,0,0.03)" : "#FFF",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {/* ⚠️ 決済合計と品目合計のリアルタイム整合性バリデーション */}
              {items.length > 0 && Math.abs((Number(totalAmount) || 0) - itemsSum) > 0 && (
                <div
                  style={{
                    marginTop: "0.6rem",
                    padding: "0.55rem 0.8rem",
                    borderRadius: "8px",
                    background: "rgba(197, 160, 89, 0.12)",
                    border: "1px solid rgba(197, 160, 89, 0.28)",
                    color: "#8C6332",
                    fontSize: "0.74rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: "0.4rem",
                  }}
                >
                  <span>
                    ⚠️ 決済合計 ({formatCurrency(Number(totalAmount) || 0)}) と品目合計 ({formatCurrency(itemsSum)}) に{" "}
                    <strong>{formatCurrency(Math.abs((Number(totalAmount) || 0) - itemsSum))}</strong> の差があります
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setTotalAmount(itemsSum);
                      setIsAutoSum(true);
                    }}
                    style={{
                      background: "transparent",
                      border: "none",
                      padding: 0,
                      color: C.goldDark,
                      fontWeight: 700,
                      fontSize: "0.74rem",
                      textDecoration: "underline",
                      cursor: "pointer",
                    }}
                  >
                    品目合計に合わせる
                  </button>
                </div>
              )}
            </div>

            {/* 品目内訳 (Expense Items) リスト */}
            <div style={{ width: "100%", boxSizing: "border-box" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "0.5rem",
                }}
              >
                <div>
                  <span style={{ fontSize: "0.76rem", fontWeight: 650, color: C.charcoalMid }}>
                    品目内訳（レシート明細）
                  </span>
                  <span style={{ fontSize: "0.7rem", color: C.charcoalLight, marginLeft: "0.4rem" }}>
                    {items.length > 0 ? `${items.length}件` : "任意"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleAddItem}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.25rem",
                    background: C.goldFaint,
                    border: `1px solid ${C.goldFaint2}`,
                    borderRadius: "6px",
                    padding: "0.25rem 0.6rem",
                    fontSize: "0.72rem",
                    fontWeight: 600,
                    color: C.goldDark,
                    cursor: "pointer",
                  }}
                >
                  + 品目を追加
                </button>
              </div>

              {items.length === 0 ? (
                <div
                  style={{
                    padding: "1rem",
                    textAlign: "center",
                    background: "rgba(0, 0, 0, 0.015)",
                    borderRadius: "8px",
                    border: "1px dashed rgba(0, 0, 0, 0.08)",
                    color: C.charcoalLight,
                    fontSize: "0.74rem",
                    boxSizing: "border-box",
                  }}
                >
                  品目を登録すると、スーパーのレシートなどの個別内訳を管理できます
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", width: "100%", boxSizing: "border-box" }}>
                  {items.map((item, index) => (
                    <div
                      key={item.id || index}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.45rem",
                        background: "rgba(0, 0, 0, 0.02)",
                        padding: "0.6rem 0.75rem",
                        borderRadius: "10px",
                        border: "1px solid rgba(0, 0, 0, 0.04)",
                        width: "100%",
                        boxSizing: "border-box",
                      }}
                    >
                      {/* 1段目: 品目名 (幅いっぱい) */}
                      <input
                        type="text"
                        placeholder="品目名 (例: つくね（冷食）, 外税8%)"
                        value={item.name}
                        onChange={(e) => handleItemChange(index, { name: e.target.value })}
                        style={{
                          width: "100%",
                          padding: "0.45rem 0.65rem",
                          borderRadius: "6px",
                          border: "1px solid rgba(0,0,0,0.1)",
                          fontSize: "0.82rem",
                          background: "#FFF",
                          outline: "none",
                          boxSizing: "border-box",
                        }}
                      />

                      {/* 2段目: カテゴリ ＋ 金額 ＋ 削除ボタン */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.4rem",
                          width: "100%",
                          boxSizing: "border-box",
                        }}
                      >
                        {/* 品目カテゴリ */}
                        <select
                          value={item.category}
                          onChange={(e) =>
                            handleItemChange(index, { category: e.target.value as ExpenseCategory })
                          }
                          style={{
                            flex: "1 1 auto",
                            minWidth: "75px",
                            maxWidth: "140px",
                            padding: "0.42rem 0.35rem",
                            borderRadius: "6px",
                            border: "1px solid rgba(0,0,0,0.1)",
                            fontSize: "0.76rem",
                            background: "#FFF",
                            outline: "none",
                            boxSizing: "border-box",
                          }}
                        >
                          {EXPENSE_CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>

                        {/* 単価/金額 */}
                        <div style={{ position: "relative", width: "105px", flexShrink: 0 }}>
                          <span
                            style={{
                              position: "absolute",
                              left: "0.45rem",
                              top: "50%",
                              transform: "translateY(-50%)",
                              fontSize: "0.74rem",
                              color: C.charcoalLight,
                            }}
                          >
                            ¥
                          </span>
                          <input
                            type="number"
                            placeholder="金額"
                            value={item.amount !== undefined ? item.amount : ""}
                            onChange={(e) =>
                              handleItemChange(index, {
                                amount: e.target.value === "" ? 0 : Number(e.target.value),
                              })
                            }
                            style={{
                              width: "100%",
                              padding: "0.42rem 0.35rem 0.42rem 1.15rem",
                              borderRadius: "6px",
                              border: "1px solid rgba(0,0,0,0.1)",
                              fontSize: "0.8rem",
                              fontWeight: 650,
                              background: "#FFF",
                              outline: "none",
                              boxSizing: "border-box",
                            }}
                          />
                        </div>

                        {/* 削除ボタン */}
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(index)}
                          aria-label="品目を削除"
                          style={{
                            background: "rgba(192, 97, 74, 0.08)",
                            border: "1px solid rgba(192, 97, 74, 0.15)",
                            borderRadius: "6px",
                            padding: "0.42rem 0.55rem",
                            color: C.danger,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* メモ */}
            <div>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 650, color: C.charcoalMid, marginBottom: "0.3rem" }}>
                メモ（任意）
              </label>
              <textarea
                rows={2}
                placeholder="特記事項や用途など..."
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.55rem 0.75rem",
                  borderRadius: "8px",
                  border: "1px solid rgba(0,0,0,0.12)",
                  fontSize: "0.82rem",
                  color: C.charcoal,
                  background: "#FFF",
                  outline: "none",
                  resize: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>

          {/* モーダルフッター */}
          <div
            style={{
              padding: "0.9rem 1.5rem",
              borderTop: "1px solid rgba(0, 0, 0, 0.05)",
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: "0.6rem",
              background: "rgba(253, 252, 250, 0.95)",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "transparent",
                border: "1px solid rgba(0, 0, 0, 0.12)",
                borderRadius: "8px",
                padding: "0.55rem 1rem",
                fontSize: "0.82rem",
                fontWeight: 600,
                color: C.charcoalMid,
                cursor: "pointer",
              }}
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={isSaving}
              style={{
                background: C.gold,
                border: "none",
                borderRadius: "8px",
                padding: "0.55rem 1.3rem",
                fontSize: "0.82rem",
                fontWeight: 650,
                color: "#FDFCFA",
                cursor: isSaving ? "not-allowed" : "pointer",
                opacity: isSaving ? 0.7 : 1,
                boxShadow: "0 2px 8px rgba(197, 160, 89, 0.35)",
              }}
            >
              {isSaving ? "保存中..." : initialTransaction ? "変更を保存" : "記録する"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
