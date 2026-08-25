/**
 * src/components/finance/Finance.tsx
 * Arca — Finance（家計・支出管理）メインモジュール
 *
 * 設計原則 (Core/Rules.md & Apple HIG):
 * - 収入・収支を排し、「純粋な出費（支出）」の記録・分析・可視化に特化
 * - レシート品目内訳（1対Nリレーショナル）
 * - クレジットカード明細CSVインポート ＆ 自動突合エンジン
 * - アイボリー/ゴールド基調の静けさと品位のあるデザイン
 * - 5秒間復元可能な UndoToast ＆ 削除確認ダイアログ
 */

import { useState, useEffect, useMemo } from "react";
import type {
  CreditCardCsvRow,
  ExpenseCategory,
  ExpenseTransaction,
  FinanceViewTab,
  ReceiptOcrResult,
} from "../../types/finance";
import { EXPENSE_CATEGORIES, PAYMENT_METHODS } from "../../types/finance";
import {
  subscribeExpenseTransactions,
  createExpenseTransaction,
  updateExpenseTransaction,
  deleteExpenseTransaction,
  restoreExpenseTransaction,
  setTransactionReconciled,
} from "../../lib/financeStorage";
import {
  getCurrentMonth,
  getPrevMonth,
  getNextMonth,
  formatMonthLabel,
  calculateMonthlySummary,
  formatCurrency,
} from "../../utils/financeSummary";
import { TransactionList } from "./TransactionList";
import { TransactionModal } from "./TransactionModal";
import { FinanceAnalytics } from "./FinanceAnalytics";
import { ReconcileWorkbench } from "./ReconcileWorkbench";
import { ReceiptScannerModal } from "./ReceiptScannerModal";
import { ConfirmModal } from "../notes/ConfirmModal";
import { useUndoToast } from "../../hooks/useUndoToast";
import { UndoToast } from "../common/UndoToast";
import { C } from "../../lib/designSystem";

export default function Finance() {
  const [transactions, setTransactions] = useState<ExpenseTransaction[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentMonth());
  const [activeTab, setActiveTab] = useState<FinanceViewTab>("transactions");

  // フィルタ状態
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>("all");
  const [reconcileFilter, setReconcileFilter] = useState<"all" | "reconciled" | "unreconciled">("all");

  // モーダル状態
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<ExpenseTransaction | null>(null);
  const [transactionToDelete, setTransactionToDelete] = useState<ExpenseTransaction | null>(null);

  // 共通トースト
  const { toast, showUndoToast, dismissToast, triggerUndo } = useUndoToast<ExpenseTransaction>();

  // ── Firestore リアルタイム購読 ──
  useEffect(() => {
    const unsubscribe = subscribeExpenseTransactions((fetched) => {
      setTransactions(fetched);
    });
    return () => unsubscribe();
  }, []);

  // 有効取引（論理削除除外）
  const activeTransactions = useMemo(() => {
    return transactions.filter((t) => !t.isDeleted);
  }, [transactions]);

  // 当月のサマリー情報
  const monthlySummary = useMemo(() => {
    return calculateMonthlySummary(activeTransactions, selectedMonth);
  }, [activeTransactions, selectedMonth]);

  // 当月の未突合件数
  const unreconciledCount = useMemo(() => {
    return activeTransactions.filter(
      (t) => t.date?.startsWith(selectedMonth) && !t.isReconciled
    ).length;
  }, [activeTransactions, selectedMonth]);

  // 絞り込み済み取引一覧（当月 & 検索 & カテゴリ & 支払方法 & 突合状態）
  const filteredTransactions = useMemo(() => {
    return activeTransactions
      .filter((t) => {
        // 月フィルター
        if (!t.date || !t.date.startsWith(selectedMonth)) return false;

        // カテゴリフィルター
        if (selectedCategory !== "all" && t.category !== selectedCategory) return false;

        // 支払方法フィルター
        if (selectedPaymentMethod !== "all" && t.paymentMethod !== selectedPaymentMethod) return false;

        // 突合状態フィルター
        if (reconcileFilter === "reconciled" && !t.isReconciled) return false;
        if (reconcileFilter === "unreconciled" && t.isReconciled) return false;

        // 検索クエリ
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchTitle = t.title.toLowerCase().includes(q);
          const matchMemo = t.memo?.toLowerCase().includes(q) || false;
          const matchItems = t.items?.some((it) => it.name.toLowerCase().includes(q)) || false;
          return matchTitle || matchMemo || matchItems;
        }

        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [
    activeTransactions,
    selectedMonth,
    selectedCategory,
    selectedPaymentMethod,
    reconcileFilter,
    searchQuery,
  ]);

  // ── 新規作成 / 編集 / 複製ハンドラ ──
  const handleOpenNew = () => {
    setEditingTransaction(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (tx: ExpenseTransaction) => {
    setEditingTransaction(tx);
    setIsModalOpen(true);
  };

  const handleDuplicate = (tx: ExpenseTransaction) => {
    setEditingTransaction({
      ...tx,
      id: "",
      date: new Date().toISOString().slice(0, 10),
      isReconciled: false,
      matchedCsvRowId: undefined,
    });
    setIsModalOpen(true);
  };

  const handleCreateFromCsv = (csvRow: CreditCardCsvRow) => {
    setEditingTransaction({
      id: "",
      date: csvRow.date,
      title: csvRow.title,
      totalAmount: csvRow.amount,
      category: "その他",
      paymentMethod: csvRow.paymentMethod,
      items: [],
      isReconciled: true,
      matchedCsvRowId: csvRow.rowId,
      memo: "クレジットカード明細より登録",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    setIsModalOpen(true);
  };

  const handleScanComplete = (result: ReceiptOcrResult, imageUrl?: string) => {
    const today = new Date().toISOString().slice(0, 10);
    const date = result.date || today;
    const title = result.storeName || "レシート支出";
    const totalAmount = result.totalAmount || result.items.reduce((s, it) => s + it.amount, 0);
    const paymentMethod = result.paymentMethod || "現金";

    // 主カテゴリの推定（品目中最も頻出するもの、または食費）
    let mainCategory: ExpenseCategory = "食費";
    if (result.items.length > 0) {
      const catCount: Record<string, number> = {};
      for (const item of result.items) {
        const cat = item.category || "食費";
        catCount[cat] = (catCount[cat] || 0) + 1;
      }
      const topCat = Object.entries(catCount).sort((a, b) => b[1] - a[1])[0];
      if (topCat && EXPENSE_CATEGORIES.includes(topCat[0] as ExpenseCategory)) {
        mainCategory = topCat[0] as ExpenseCategory;
      }
    }

    const items = result.items.map((it, idx) => ({
      id: `ocr-item-${Date.now()}-${idx}`,
      name: it.name,
      amount: it.amount,
      category: it.category || mainCategory,
      quantity: it.quantity || 1,
    }));

    setEditingTransaction({
      id: "",
      date,
      title,
      totalAmount,
      category: mainCategory,
      paymentMethod,
      items,
      isReconciled: false,
      receiptImageUrl: imageUrl,
      memo: "レシートOCR解析より読み取り",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    setIsScannerOpen(false);
    setIsModalOpen(true);
  };

  // ── 保存処理 ──
  const handleSaveTransaction = async (txData: Omit<ExpenseTransaction, "id">) => {
    if (editingTransaction && editingTransaction.id) {
      await updateExpenseTransaction(editingTransaction.id, txData);
    } else {
      await createExpenseTransaction(txData);
    }
  };

  // ── 削除処理（確認後実行 ＆ Undo） ──
  const handleExecuteDelete = async (tx: ExpenseTransaction) => {
    await deleteExpenseTransaction(tx.id);
    setTransactionToDelete(null);

    showUndoToast({
      message: `支出「${tx.title || "支出"}」を削除しました`,
      item: tx,
      onUndo: async (restored) => {
        await restoreExpenseTransaction(restored.id);
      },
    });
  };

  // ── 突合ステータストグル ──
  const handleToggleReconciled = async (tx: ExpenseTransaction) => {
    await setTransactionReconciled(tx.id, !tx.isReconciled);
  };

  const handleReconcile = async (transactionId: string, csvRowId: string) => {
    await setTransactionReconciled(transactionId, true, csvRowId);
  };

  const handleUnreconcile = async (transactionId: string) => {
    await setTransactionReconciled(transactionId, false);
  };

  return (
    <>
      {/* 画面全体の固定背景 */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: -10,
          background: C.bgGrad,
          pointerEvents: "none",
        }}
      />

      <div
        className="arca-view-in"
        style={{
          minHeight: "100vh",
          width: "100%",
          padding: "3.2rem clamp(1.5rem, 5vw, 4rem) 6rem",
          boxSizing: "border-box",
        }}
      >
        {/* ── ヘッダー ── */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            marginBottom: "1.8rem",
            maxWidth: "1280px",
            marginInline: "auto",
            flexWrap: "wrap",
            gap: "1rem",
          }}
        >
          <div>
            <p
              style={{
                fontSize: "0.68rem",
                fontWeight: 650,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: C.charcoalLight,
                margin: 0,
              }}
            >
              FINANCE
            </p>
            <h1
              style={{
                fontSize: "1.75rem",
                fontWeight: 750,
                color: C.charcoal,
                margin: "0.15rem 0 0",
                letterSpacing: "-0.03em",
                lineHeight: 1.2,
              }}
            >
              家計・支出管理
            </h1>
            <p style={{ fontSize: "0.78rem", color: C.charcoalLight, margin: "0.3rem 0 0" }}>
              支出合計: <strong style={{ color: C.charcoal }}>{formatCurrency(monthlySummary.totalExpense)}</strong>
              <span style={{ margin: "0 0.4rem" }}>•</span>
              {monthlySummary.transactionCount}件の決済
              {unreconciledCount > 0 && (
                <span style={{ marginLeft: "0.4rem", color: C.goldDark, fontWeight: 600 }}>
                  （未突合 {unreconciledCount}件）
                </span>
              )}
            </p>
          </div>

          {/* 月移動 ＆ 新規作成ボタン */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
            {/* 月ナビゲーター */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                background: C.white,
                borderRadius: "10px",
                padding: "2px",
                boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
              }}
            >
              <button
                onClick={() => setSelectedMonth((m) => getPrevMonth(m))}
                aria-label="前月"
                style={{
                  background: "transparent",
                  border: "none",
                  padding: "0.4rem 0.55rem",
                  cursor: "pointer",
                  color: C.charcoalMid,
                  borderRadius: "8px",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>

              <span
                style={{
                  fontSize: "0.82rem",
                  fontWeight: 700,
                  color: C.charcoal,
                  padding: "0.2rem 0.6rem",
                  letterSpacing: "0.02em",
                  minWidth: "78px",
                  textAlign: "center",
                }}
              >
                {formatMonthLabel(selectedMonth)}
              </span>

              <button
                onClick={() => setSelectedMonth((m) => getNextMonth(m))}
                aria-label="翌月"
                style={{
                  background: "transparent",
                  border: "none",
                  padding: "0.4rem 0.55rem",
                  cursor: "pointer",
                  color: C.charcoalMid,
                  borderRadius: "8px",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>

              <button
                onClick={() => setSelectedMonth(getCurrentMonth())}
                style={{
                  background: "rgba(0, 0, 0, 0.04)",
                  border: "none",
                  borderRadius: "6px",
                  padding: "0.25rem 0.5rem",
                  fontSize: "0.7rem",
                  fontWeight: 650,
                  color: C.charcoalMid,
                  cursor: "pointer",
                  marginRight: "2px",
                }}
              >
                今月
              </button>
            </div>

            {/* レシートカメラ読取ボタン */}
            <button
              onClick={() => setIsScannerOpen(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.45rem",
                background: C.white,
                border: "1px solid rgba(0, 0, 0, 0.08)",
                borderRadius: "11px",
                padding: "0.62rem 1.05rem",
                cursor: "pointer",
                color: C.charcoal,
                fontSize: "0.82rem",
                fontWeight: 650,
                letterSpacing: "0.02em",
                boxShadow: "0 1px 4px rgba(0, 0, 0, 0.04)",
                transition: "background 0.15s, transform 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = C.goldFaint;
                e.currentTarget.style.transform = "translateY(-1px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = C.white;
                e.currentTarget.style.transform = "translateY(0)";
              }}
              title="iPhoneのカメラまたは写真からレシートを自動解析"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: C.goldDark }}>
                <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                <circle cx="12" cy="13" r="3" />
              </svg>
              <span>レシート読取</span>
            </button>

            {/* 新規支出作成ボタン */}
            <button
              onClick={handleOpenNew}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.45rem",
                background: C.gold,
                border: "none",
                borderRadius: "11px",
                padding: "0.62rem 1.25rem",
                cursor: "pointer",
                color: "#FDFCFA",
                fontSize: "0.82rem",
                fontWeight: 650,
                letterSpacing: "0.03em",
                boxShadow: "0 2px 14px rgba(197,160,89,0.38)",
                transition: "box-shadow 0.2s, transform 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = "0 6px 24px rgba(197,160,89,0.48)";
                e.currentTarget.style.transform = "translateY(-1px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = "0 2px 14px rgba(197,160,89,0.38)";
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>支出を記録</span>
            </button>
          </div>
        </div>

        {/* ── メインタブバー（支出一覧 / 分析・グラフ / クレカ明細突合） ── */}
        <div
          style={{
            maxWidth: "1280px",
            marginInline: "auto",
            marginBottom: "1.8rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "1rem",
          }}
        >
          {/* タブ切り替えピル */}
          <div
            style={{
              display: "flex",
              background: "rgba(0, 0, 0, 0.04)",
              padding: "3px",
              borderRadius: "9999px",
              gap: "2px",
            }}
          >
            <button
              onClick={() => setActiveTab("transactions")}
              style={{
                background: activeTab === "transactions" ? C.white : "transparent",
                border: "none",
                borderRadius: "9999px",
                padding: "0.42rem 1.05rem",
                fontSize: "0.78rem",
                fontWeight: activeTab === "transactions" ? 650 : 500,
                color: activeTab === "transactions" ? C.charcoal : C.charcoalLight,
                cursor: "pointer",
                boxShadow: activeTab === "transactions" ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
                transition: "all 0.15s ease",
              }}
            >
              支出一覧 ({filteredTransactions.length})
            </button>

            <button
              onClick={() => setActiveTab("analytics")}
              style={{
                background: activeTab === "analytics" ? C.white : "transparent",
                border: "none",
                borderRadius: "9999px",
                padding: "0.42rem 1.05rem",
                fontSize: "0.78rem",
                fontWeight: activeTab === "analytics" ? 650 : 500,
                color: activeTab === "analytics" ? C.charcoal : C.charcoalLight,
                cursor: "pointer",
                boxShadow: activeTab === "analytics" ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
                transition: "all 0.15s ease",
              }}
            >
              分析・グラフ
            </button>

            <button
              onClick={() => setActiveTab("reconcile")}
              style={{
                background: activeTab === "reconcile" ? C.white : "transparent",
                border: "none",
                borderRadius: "9999px",
                padding: "0.42rem 1.05rem",
                fontSize: "0.78rem",
                fontWeight: activeTab === "reconcile" ? 650 : 500,
                color: activeTab === "reconcile" ? C.charcoal : C.charcoalLight,
                cursor: "pointer",
                boxShadow: activeTab === "reconcile" ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
                transition: "all 0.15s ease",
                display: "flex",
                alignItems: "center",
                gap: "0.35rem",
              }}
            >
              <span>クレカ明細突合</span>
              {unreconciledCount > 0 && (
                <span
                  style={{
                    background: C.gold,
                    color: "#FFF",
                    fontSize: "0.62rem",
                    padding: "0.05rem 0.35rem",
                    borderRadius: "9999px",
                    fontWeight: 700,
                  }}
                >
                  {unreconciledCount}
                </span>
              )}
            </button>
          </div>

          {/* 支出一覧タブ時のフィルターコントロール群 */}
          {activeTab === "transactions" && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
              {/* 検索バー */}
              <div style={{ position: "relative", width: "200px" }}>
                <input
                  type="text"
                  placeholder="店舗・品名・メモ検索..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: "100%",
                    background: C.white,
                    border: "none",
                    borderRadius: "8px",
                    padding: "0.45rem 0.6rem",
                    fontSize: "0.78rem",
                    color: C.charcoal,
                    boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {/* カテゴリセレクタ */}
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                style={{
                  background: C.white,
                  border: "none",
                  borderRadius: "8px",
                  padding: "0.45rem 0.65rem",
                  fontSize: "0.76rem",
                  color: C.charcoalMid,
                  cursor: "pointer",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                  outline: "none",
                }}
              >
                <option value="all">全カテゴリ</option>
                {EXPENSE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>

              {/* 支払方法セレクタ */}
              <select
                value={selectedPaymentMethod}
                onChange={(e) => setSelectedPaymentMethod(e.target.value)}
                style={{
                  background: C.white,
                  border: "none",
                  borderRadius: "8px",
                  padding: "0.45rem 0.65rem",
                  fontSize: "0.76rem",
                  color: C.charcoalMid,
                  cursor: "pointer",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                  outline: "none",
                }}
              >
                <option value="all">全支払方法</option>
                {PAYMENT_METHODS.map((pm) => (
                  <option key={pm} value={pm}>
                    {pm}
                  </option>
                ))}
              </select>

              {/* 突合状態フィルタ */}
              <select
                value={reconcileFilter}
                onChange={(e) => setReconcileFilter(e.target.value as any)}
                style={{
                  background: C.white,
                  border: "none",
                  borderRadius: "8px",
                  padding: "0.45rem 0.65rem",
                  fontSize: "0.76rem",
                  color: C.charcoalMid,
                  cursor: "pointer",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                  outline: "none",
                }}
              >
                <option value="all">突合: すべて</option>
                <option value="reconciled">突合済のみ</option>
                <option value="unreconciled">未突合のみ</option>
              </select>
            </div>
          )}
        </div>

        {/* ── コンテンツ表示エリア ── */}
        <div style={{ maxWidth: "1280px", marginInline: "auto" }}>
          {activeTab === "transactions" && (
            <TransactionList
              transactions={filteredTransactions}
              onEdit={handleOpenEdit}
              onDuplicate={handleDuplicate}
              onDelete={(tx) => setTransactionToDelete(tx)}
              onToggleReconciled={handleToggleReconciled}
            />
          )}

          {activeTab === "analytics" && (
            <FinanceAnalytics
              transactions={activeTransactions}
              selectedMonth={selectedMonth}
            />
          )}

          {activeTab === "reconcile" && (
            <ReconcileWorkbench
              transactions={activeTransactions}
              onReconcile={handleReconcile}
              onUnreconcile={handleUnreconcile}
              onCreateFromCsv={handleCreateFromCsv}
            />
          )}
        </div>
      </div>

      {/* ── 支出編集モーダル ── */}
      <TransactionModal
        isOpen={isModalOpen}
        initialTransaction={editingTransaction}
        defaultDate={new Date().toISOString().slice(0, 10)}
        onSave={handleSaveTransaction}
        onClose={() => {
          setIsModalOpen(false);
          setEditingTransaction(null);
        }}
      />

      {/* ── レシートスキャナーモーダル ── */}
      <ReceiptScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanComplete={handleScanComplete}
      />

      {/* ── 削除確認ダイアログ ── */}
      <ConfirmModal
        isOpen={!!transactionToDelete}
        title="支出を削除しますか？"
        message={`「${transactionToDelete?.title || "支出"} (${formatCurrency(transactionToDelete?.totalAmount || 0)})」を削除します。5秒以内であれば元に戻すことができます。`}
        confirmLabel="削除する"
        cancelLabel="キャンセル"
        isDestructive={true}
        onConfirm={() => {
          if (transactionToDelete) {
            handleExecuteDelete(transactionToDelete);
          }
        }}
        onCancel={() => setTransactionToDelete(null)}
      />

      {/* ── 共通 Undo トースト ── */}
      <UndoToast toast={toast} onUndo={triggerUndo} onDismiss={dismissToast} />
    </>
  );
}
