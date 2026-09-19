/**
 * src/components/finance/TransactionModal.tsx
 * Arca — 支出取引＆レシート品目内訳（1対N）編集モーダル
 */

import { useState, useEffect } from "react";
import { BookOpen, ZoomIn, X, AlertCircle } from "lucide-react";
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
import { CategoryGuideModal } from "./CategoryGuideModal";
import { C } from "../../lib/designSystem";

interface FormExpenseItem extends Omit<ExpenseItem, "amount"> {
  amount: number | "";
}

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
  const [category, setCategory] = useState<ExpenseCategory>("食料品");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("Oliveカード");
  const [items, setItems] = useState<FormExpenseItem[]>([]);
  const [memo, setMemo] = useState("");
  const [receiptImageUrl, setReceiptImageUrl] = useState<string | undefined>(undefined);
  const [isAutoSum, setIsAutoSum] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isGuideModalOpen, setIsGuideModalOpen] = useState(false);
  const [isReceiptZoomOpen, setIsReceiptZoomOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // レシート拡大モーダル表示中のEscキーハンドリング
  useEffect(() => {
    if (!isReceiptZoomOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setIsReceiptZoomOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isReceiptZoomOpen]);

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
            ? initialTransaction.items.map((it) => ({
                ...it,
                amount: it.amount === 0 ? "" : (it.amount ?? ""),
              }))
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
        setCategory("食料品");
        setPaymentMethod("Oliveカード");
        setItems([]);
        setMemo("");
        setReceiptImageUrl(undefined);
        setIsAutoSum(true);
      }
      setSaveError(null);
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

  const handleAddItem = (categoryDefault?: unknown) => {
    const targetCat = typeof categoryDefault === "string" ? (categoryDefault as ExpenseCategory) : category;
    const emptyItem = createEmptyExpenseItem(targetCat);
    const newItem: FormExpenseItem = {
      ...emptyItem,
      amount: "", // 初期状態は空文字（0円の誤入力を防ぎ入力しやすくする）
    };
    setItems((prev) => [...prev, newItem]);
    if (!isAutoSum && items.length === 0) {
      setIsAutoSum(true);
    }
  };

  const handleItemChange = (index: number, patch: Partial<FormExpenseItem>) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  };

  const handleCategoryChange = (newCategory: ExpenseCategory) => {
    setCategory(newCategory);
    setItems((prev) =>
      prev.map((item) => ({
        ...item,
        category: newCategory,
      }))
    );
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
    setSaveError(null);
    try {
      await onSave({
        date: date || new Date().toISOString().slice(0, 10),
        title: title.trim(),
        totalAmount: isAutoSum && items.length > 0 ? itemsSum : finalTotal,
        category,
        paymentMethod,
        items: items
          .map((it) => ({
            ...it,
            amount: Number(it.amount) || 0,
          }))
          .filter((it) => it.name.trim() || it.amount !== 0),
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
      const msg = err instanceof Error ? err.message : "保存処理中にエラーが発生しました";
      setSaveError(msg);
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
        className="arca-card"
        style={{
          background: "var(--bg-card-solid)",
          borderRadius: C.radiusModal,
          boxShadow: C.modalShadow,
          width: "100%",
          maxWidth: "600px",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          border: "1px solid var(--border-subtle)",
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
            {/* 保存エラー通知バナー */}
            {saveError && (
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "0.6rem",
                  background: "rgba(192, 97, 74, 0.08)",
                  border: "1px solid rgba(192, 97, 74, 0.25)",
                  borderRadius: "10px",
                  padding: "0.75rem 0.9rem",
                  color: C.danger,
                  animation: "arca-fade-in 0.15s ease-out",
                }}
              >
                <AlertCircle size={17} style={{ flexShrink: 0, marginTop: "1px" }} />
                <div style={{ flex: 1, fontSize: "0.78rem", lineHeight: 1.45 }}>
                  <div style={{ fontWeight: 700, marginBottom: "0.15rem" }}>保存に失敗しました</div>
                  <div>{saveError}</div>
                  <div style={{ fontSize: "0.7rem", color: C.charcoalLight, marginTop: "0.25rem" }}>
                    ※ 入力内容は保持されています。内容を確認の上、再試行してください。
                  </div>
                </div>
              </div>
            )}

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
                <button
                  type="button"
                  onClick={() => setIsReceiptZoomOpen(true)}
                  title="クリックしてレシート写真を拡大表示"
                  aria-label="クリックしてレシート写真を拡大表示"
                  style={{
                    position: "relative",
                    background: "transparent",
                    border: `1.5px solid ${C.goldFaint3}`,
                    borderRadius: "8px",
                    padding: "2px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.35rem",
                    transition: "all 0.18s ease-in-out",
                    flexShrink: 0,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = C.gold;
                    e.currentTarget.style.transform = "scale(1.04)";
                    e.currentTarget.style.boxShadow = "0 2px 8px rgba(197, 160, 89, 0.25)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = C.goldFaint3;
                    e.currentTarget.style.transform = "scale(1)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  <div
                    style={{
                      position: "relative",
                      width: "38px",
                      height: "38px",
                      borderRadius: "6px",
                      overflow: "hidden",
                    }}
                  >
                    <img
                      src={receiptImageUrl}
                      alt="Receipt"
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        display: "block",
                      }}
                    />
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        backgroundColor: "rgba(0, 0, 0, 0.28)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#fff",
                      }}
                    >
                      <ZoomIn size={15} />
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: "0.68rem",
                      fontWeight: 650,
                      color: C.goldDark,
                      paddingRight: "0.25rem",
                      whiteSpace: "nowrap",
                    }}
                  >
                    拡大
                  </span>
                </button>
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
                    border: "1px solid var(--border-subtle)",
                    fontSize: "0.85rem",
                    color: C.charcoal,
                    background: C.white,
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
                    border: "1px solid var(--border-subtle)",
                    fontSize: "0.85rem",
                    color: C.charcoal,
                    background: C.white,
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
                    border: "1px solid var(--border-subtle)",
                    fontSize: "0.85rem",
                    color: C.charcoal,
                    background: C.white,
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.3rem" }}>
                  <label style={{ fontSize: "0.75rem", fontWeight: 650, color: C.charcoalMid }}>
                    カテゴリ
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsGuideModalOpen(true)}
                    data-testid="open-category-guide-btn"
                    style={{
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      color: C.goldDark,
                      fontSize: "0.72rem",
                      fontWeight: 650,
                      padding: "0 0.2rem",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.25rem",
                    }}
                    title="12カテゴリの具体例と分類ガイドを開く"
                  >
                    <BookOpen size={13} />
                    <span>ガイド</span>
                  </button>
                </div>
                <select
                  value={category}
                  onChange={(e) => handleCategoryChange(e.target.value as ExpenseCategory)}
                  style={{
                    width: "100%",
                    padding: "0.55rem 0.75rem",
                    borderRadius: "8px",
                    border: "1px solid var(--border-subtle)",
                    fontSize: "0.85rem",
                    color: C.charcoal,
                    background: C.white,
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
                    border: "1px solid var(--border-subtle)",
                    fontSize: "1.05rem",
                    fontWeight: 700,
                    color: C.charcoal,
                    background: isAutoSum && items.length > 0 ? "var(--bg-nav-track)" : C.white,
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
                          border: "1px solid var(--border-subtle)",
                          fontSize: "0.82rem",
                          color: C.charcoal,
                          background: C.white,
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
                            border: "1px solid var(--border-subtle)",
                            fontSize: "0.76rem",
                            color: C.charcoal,
                            background: C.white,
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
                            value={item.amount}
                            onChange={(e) =>
                              handleItemChange(index, {
                                amount: e.target.value === "" ? "" : Number(e.target.value),
                              })
                            }
                            style={{
                              width: "100%",
                              padding: "0.42rem 0.35rem 0.42rem 1.15rem",
                              borderRadius: "6px",
                              border: "1px solid var(--border-subtle)",
                              fontSize: "0.8rem",
                              fontWeight: 650,
                              color: C.charcoal,
                              background: C.white,
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
                  border: "1px solid var(--border-subtle)",
                  fontSize: "0.82rem",
                  color: C.charcoal,
                  background: C.white,
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
              borderTop: "1px solid var(--border-subtle)",
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: "0.6rem",
              background: "var(--bg-card-solid)",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "var(--bg-nav-track)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "8px",
                padding: "0.55rem 1rem",
                fontSize: "0.82rem",
                fontWeight: 600,
                color: C.charcoal,
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

      {/* ── 支出カテゴリ分類ガイド モーダル ── */}
      <CategoryGuideModal
        isOpen={isGuideModalOpen}
        onClose={() => setIsGuideModalOpen(false)}
        selectedCategory={category}
        onSelectCategory={(selected) => setCategory(selected)}
      />

      {/* ── レシート写真 拡大ポップアップ（ライトボックス） ── */}
      {isReceiptZoomOpen && receiptImageUrl && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 350,
            backgroundColor: "rgba(0, 0, 0, 0.72)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
            animation: "arca-fade-in 0.16s ease-out",
          }}
          onClick={() => setIsReceiptZoomOpen(false)}
        >
          <div
            style={{
              position: "relative",
              maxWidth: "min(92vw, 560px)",
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              background: "var(--bg-card-solid)",
              borderRadius: "18px",
              boxShadow: "0 24px 60px rgba(0, 0, 0, 0.35)",
              border: "1px solid var(--border-subtle)",
              overflow: "hidden",
              animation: "arca-modal-pop 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* ヘッダー */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0.85rem 1.2rem",
                borderBottom: "1px solid var(--border-subtle)",
                background: "var(--bg-card-solid)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ fontSize: "1rem" }}>📷</span>
                <span
                  style={{
                    fontSize: "0.88rem",
                    fontWeight: 700,
                    color: C.charcoal,
                  }}
                >
                  レシート写真プレビュー
                </span>
                {title && (
                  <span
                    style={{
                      fontSize: "0.74rem",
                      color: C.charcoalLight,
                      maxWidth: "200px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    ({title})
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setIsReceiptZoomOpen(false)}
                aria-label="プレビューを閉じる"
                style={{
                  background: "var(--bg-nav-track)",
                  border: "none",
                  borderRadius: "50%",
                  width: "28px",
                  height: "28px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  color: C.charcoalMid,
                  transition: "background 0.15s",
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* 画像表示エリア */}
            <div
              style={{
                padding: "1rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "auto",
                maxHeight: "calc(90vh - 120px)",
                background: "rgba(0, 0, 0, 0.03)",
              }}
            >
              <img
                src={receiptImageUrl}
                alt="レシート写真"
                style={{
                  maxWidth: "100%",
                  maxHeight: "calc(90vh - 150px)",
                  objectFit: "contain",
                  borderRadius: "10px",
                  boxShadow: "0 4px 20px rgba(0,0,0,0.14)",
                }}
              />
            </div>

            {/* フッター */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0.7rem 1.2rem",
                borderTop: "1px solid var(--border-subtle)",
                background: "var(--bg-card-solid)",
              }}
            >
              <span style={{ fontSize: "0.72rem", color: C.charcoalLight }}>
                ※ Escキーまたは枠外クリックで閉じられます
              </span>
              <button
                type="button"
                onClick={() => setIsReceiptZoomOpen(false)}
                aria-label="プレビューを閉じる"
                style={{
                  background: C.gold,
                  border: "none",
                  borderRadius: "8px",
                  padding: "0.45rem 1.1rem",
                  fontSize: "0.8rem",
                  fontWeight: 650,
                  color: "#FDFCFA",
                  cursor: "pointer",
                  boxShadow: "0 2px 6px rgba(197, 160, 89, 0.3)",
                }}
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
