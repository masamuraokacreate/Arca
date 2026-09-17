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

import { useState, useEffect, useMemo, useRef } from "react";
import type {
  CreditCardCsvRow,
  ExpenseCategory,
  ExpenseTransaction,
  FinanceViewTab,
  MonthlyCardReconcileStatus,
  PaymentMethod,
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
  subscribeMonthlyReconcileStatuses,
  toggleMonthlyCardReconcile,
} from "../../services/csvReconcileService";
import {
  fetchAndProcessCardNoticeEmails,
  mergeExpenseTransactions,
  cleanupDuplicateExpenses,
} from "../../services/gmailFinanceService";
import { useGoogleAuth } from "../../hooks/useGoogleAuth";
import { loadSavedToken } from "../../services/googleAuth";
import {
  getCurrentMonth,
  getPrevMonth,
  getNextMonth,
  formatMonthLabel,
  calculateMonthlySummary,
  formatCurrency,
} from "../../utils/financeSummary";
import { TransactionList } from "./TransactionList";
import { TransactionMergeModal } from "./TransactionMergeModal";
import { TransactionModal } from "./TransactionModal";
import { FinanceAnalytics } from "./FinanceAnalytics";
import { ReconcileWorkbench } from "./ReconcileWorkbench";
import { ReceiptScannerModal } from "./ReceiptScannerModal";
import { ConfirmModal } from "../notes/ConfirmModal";
import { useUndoToast } from "../../hooks/useUndoToast";
import { UndoToast } from "../common/UndoToast";
import { C } from "../../lib/designSystem";
import { Plus, Camera, Mail, SlidersHorizontal, X } from "lucide-react";

export default function Finance() {
  const [transactions, setTransactions] = useState<ExpenseTransaction[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentMonth());
  const [activeTab, setActiveTab] = useState<FinanceViewTab>("transactions");

  // フィルタ状態
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>("all");
  const [reconcileFilter, setReconcileFilter] = useState<"all" | "reconciled" | "unreconciled">("all");
  const [reconcileStatuses, setReconcileStatuses] = useState<MonthlyCardReconcileStatus[]>([]);

  // メール取得状態
  const [isFetchingEmails, setIsFetchingEmails] = useState(false);
  const [syncToastMessage, setSyncToastMessage] = useState<string | null>(null);
  const { requestAccessToken } = useGoogleAuth();

  // モーダル状態
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<ExpenseTransaction | null>(null);
  const [transactionToDelete, setTransactionToDelete] = useState<ExpenseTransaction | null>(null);
  const [mergePair, setMergePair] = useState<{ manualOrOcrTx: ExpenseTransaction; emailTx: ExpenseTransaction } | null>(null);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [isFabMenuOpen, setIsFabMenuOpen] = useState(false);

  // 共通トースト
  const { toast, showUndoToast, dismissToast, triggerUndo } = useUndoToast<ExpenseTransaction>();

  // ── Firestore リアルタイム購読（取引 & 照合ステータス） ──
  useEffect(() => {
    const unsubTx = subscribeExpenseTransactions((fetched) => {
      setTransactions(fetched);
    });
    const unsubReconcile = subscribeMonthlyReconcileStatuses((fetched) => {
      setReconcileStatuses(fetched);
    });
    return () => {
      unsubTx();
      unsubReconcile();
    };
  }, []);

  // ── 既存重複レコード（同一 emailMessageId）の自動一括クリーンアップ ──
  const hasCleanedUpRef = useRef(false);
  useEffect(() => {
    if (hasCleanedUpRef.current) return;
    hasCleanedUpRef.current = true;

    cleanupDuplicateExpenses()
      .then((res) => {
        if (res.deletedCount > 0) {
          setTransactions((prev) => prev.filter((t) => !res.duplicateIds.includes(t.id)));
        }
      })
      .catch((err) => {
        console.warn("[Finance] Duplicate cleanup skipped or failed:", err);
      });
  }, []);

  // ── 起動時バックグラウンド自動同期 (直近5分以内の多重実行防止 ＆ サイレント処理) ──
  const hasAutoSyncedRef = useRef(false);
  const AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5分

  useEffect(() => {
    if (hasAutoSyncedRef.current) return;

    try {
      const lastSyncStr = sessionStorage.getItem("arca_gmail_last_sync");
      if (lastSyncStr && Date.now() - parseInt(lastSyncStr, 10) < AUTO_SYNC_INTERVAL_MS) {
        return;
      }
    } catch {
      // sessionStorage エラー無視
    }

    const savedToken = loadSavedToken();
    if (!savedToken) return;

    hasAutoSyncedRef.current = true;
    try {
      sessionStorage.setItem("arca_gmail_last_sync", String(Date.now()));
    } catch {}

    // バックグラウンドでサイレント同期を実行
    setIsFetchingEmails(true);
    fetchAndProcessCardNoticeEmails(savedToken, transactions)
      .then((result) => {
        if (result.createdCount > 0 || result.linkedCount > 0) {
          const parts: string[] = [];
          if (result.createdCount > 0) parts.push(`${result.createdCount}件の速報決済を取り込み`);
          if (result.linkedCount > 0) parts.push(`${result.linkedCount}件を既存レコードに紐付け`);
          setSyncToastMessage(`${parts.join("、")}しました`);
          setTimeout(() => setSyncToastMessage(null), 4500);
        }
      })
      .catch((err) => {
        console.warn("[Finance AutoSync] Silent Gmail sync skipped or failed:", err);
      })
      .finally(() => {
        setIsFetchingEmails(false);
      });
  }, [transactions]);

  // 有効取引（論理削除除外）
  const activeTransactions = useMemo(() => {
    return transactions.filter((t) => !t.isDeleted);
  }, [transactions]);

  // 当月のサマリー情報
  const monthlySummary = useMemo(() => {
    return calculateMonthlySummary(activeTransactions, selectedMonth);
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

        // 検索クエリ（カード名、店舗名、カテゴリ、品目、メモを横断検索）
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchTitle = t.title.toLowerCase().includes(q);
          const matchMemo = t.memo?.toLowerCase().includes(q) || false;
          const matchItems = t.items?.some((it) => it.name.toLowerCase().includes(q)) || false;
          const matchPayment = t.paymentMethod?.toLowerCase().includes(q) || false;
          const matchCategory = t.category?.toLowerCase().includes(q) || false;
          return matchTitle || matchMemo || matchItems || matchPayment || matchCategory;
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

  // フィルターが適用されているかどうかの判定（検索クエリ除く詳細絞り込み条件）
  const isFiltered = selectedCategory !== "all" || reconcileFilter !== "all" || selectedPaymentMethod !== "all";

  // 選択月における各支払方法の照合ステータスマップ
  const currentMonthReconcileMap = useMemo(() => {
    const map = new Map<PaymentMethod, MonthlyCardReconcileStatus>();
    for (const st of reconcileStatuses) {
      if (st.month === selectedMonth) {
        map.set(st.paymentMethod, st);
      }
    }
    return map;
  }, [reconcileStatuses, selectedMonth]);

  // 主要なカード（Oliveカード, dカード, イオンカード）または選択中カードの照合状況
  const currentMonthReconciledInfo = useMemo(() => {
    const monthLabel = formatMonthLabel(selectedMonth);
    if (selectedPaymentMethod !== "all") {
      const pm = selectedPaymentMethod as PaymentMethod;
      const status = currentMonthReconcileMap.get(pm);
      if (status?.isReconciled) {
        return {
          isReconciled: true,
          label: `${monthLabel}の${pm}明細はCSV照合済みです（全件確認完了）`,
        };
      }
      return { isReconciled: false, label: "" };
    }

    // 「すべて」選択時：主要カード（Olive, dカード, イオンカード）が照合されているか
    const mainCards: PaymentMethod[] = ["Oliveカード", "dカード", "イオンカード"];
    const allReconciled = mainCards.every((card) => currentMonthReconcileMap.get(card)?.isReconciled);
    const anyReconciled = mainCards.some((card) => currentMonthReconcileMap.get(card)?.isReconciled);

    if (allReconciled) {
      return {
        isReconciled: true,
        label: `${monthLabel}の主要カード明細はすべてCSV照合済みです（全件確認完了）`,
      };
    } else if (anyReconciled) {
      const reconciledCardNames = mainCards.filter((card) => currentMonthReconcileMap.get(card)?.isReconciled).join("・");
      return {
        isReconciled: true,
        label: `${monthLabel}の${reconciledCardNames}はCSV照合済みです`,
      };
    }

    return { isReconciled: false, label: "" };
  }, [selectedMonth, selectedPaymentMethod, currentMonthReconcileMap]);

  // 手動トグルハンドラ
  const handleToggleCardReconcile = async (pm: PaymentMethod, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const current = currentMonthReconcileMap.get(pm)?.isReconciled || false;
    await toggleMonthlyCardReconcile(selectedMonth, pm, current);
  };

  // ── Gmail カード利用速報メールの取得＆下書き生成ハンドラ ──
  const handleSyncGmailNotices = async () => {
    if (isFetchingEmails) return;
    setIsFetchingEmails(true);
    try {
      let token: string;
      try {
        token = await requestAccessToken(false);
      } catch {
        token = await requestAccessToken(true);
      }

      const result = await fetchAndProcessCardNoticeEmails(token, transactions);

      try {
        sessionStorage.setItem("arca_gmail_last_sync", String(Date.now()));
      } catch {}

      if (result.createdCount > 0 || result.linkedCount > 0) {
        const parts: string[] = [];
        if (result.createdCount > 0) parts.push(`${result.createdCount}件の新規決済を作成`);
        if (result.linkedCount > 0) parts.push(`${result.linkedCount}件を既存レコードに紐付け`);
        setSyncToastMessage(`${parts.join("、")}しました`);
      } else if (result.totalFound > 0) {
        setSyncToastMessage("今月の利用速報メールはすべて取り込み済みです");
      } else {
        setSyncToastMessage("今月の新しい利用速報メールはありませんでした");
      }
    } catch (err: any) {
      console.error("Gmail sync error:", err);
      setSyncToastMessage(`速報メール取得に失敗: ${err?.message || "認証エラー"}`);
    } finally {
      setIsFetchingEmails(false);
      setTimeout(() => setSyncToastMessage(null), 4500);
    }
  };

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

    // 主カテゴリの推定（品目中最も頻出するもの、または食料品）
    let mainCategory: ExpenseCategory = "食料品";
    if (result.items.length > 0) {
      const catCount: Record<string, number> = {};
      for (const item of result.items) {
        const cat = item.category || "食料品";
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

  // ── 手動突合・マージハンドラー ──
  const handleMergeTransactions = async (targetTx: ExpenseTransaction, sourceTx: ExpenseTransaction) => {
    try {
      const merged = await mergeExpenseTransactions(targetTx, sourceTx);
      showUndoToast({
        message: `「${merged.title}」(${formatCurrency(merged.totalAmount)}) を1件の確定レコードに統合しました`,
        item: sourceTx,
        onUndo: async (restored) => {
          await restoreExpenseTransaction(restored.id);
        },
      });
    } catch (err: any) {
      console.error("[Finance] Failed to merge transactions:", err);
      setSyncToastMessage(`決済の結合に失敗しました: ${err?.message || "エラー"}`);
      setTimeout(() => setSyncToastMessage(null), 4000);
    }
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
        className="arca-view-in p-3.5 pb-28 sm:p-8 sm:pb-24"
        style={{
          minHeight: "100vh",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        {/* ── ヘッダー ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "0.85rem",
            maxWidth: "1280px",
            marginInline: "auto",
            gap: "0.8rem",
          }}
        >
          {/* アプリ名・見出し */}
          <div>
            <h1
              style={{
                fontSize: "1.35rem",
                fontWeight: 750,
                color: C.charcoal,
                margin: 0,
                letterSpacing: "-0.02em",
                lineHeight: 1.2,
              }}
              className="sm:text-2xl"
            >
              家計・支出管理
            </h1>
          </div>

          {/* 右側: 月ナビゲーター ＆ デスクトップ用ボタングループ */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            {/* 月ナビゲーター */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                background: "var(--bg-card-solid)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "10px",
                padding: "2px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
              }}
            >
              <button
                onClick={() => setSelectedMonth((m) => getPrevMonth(m))}
                aria-label="前月"
                style={{
                  background: "transparent",
                  border: "none",
                  padding: "0.35rem 0.45rem",
                  cursor: "pointer",
                  color: C.charcoalMid,
                  borderRadius: "8px",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>

              <span
                style={{
                  fontSize: "0.78rem",
                  fontWeight: 700,
                  color: C.charcoal,
                  padding: "0.15rem 0.45rem",
                  letterSpacing: "0.02em",
                  minWidth: "70px",
                  textAlign: "center",
                  whiteSpace: "nowrap",
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
                  padding: "0.35rem 0.45rem",
                  cursor: "pointer",
                  color: C.charcoalMid,
                  borderRadius: "8px",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>

              <button
                onClick={() => setSelectedMonth(getCurrentMonth())}
                style={{
                  background: "var(--bg-nav-track)",
                  border: "none",
                  borderRadius: "6px",
                  padding: "0.22rem 0.45rem",
                  fontSize: "0.68rem",
                  fontWeight: 650,
                  color: C.charcoalMid,
                  cursor: "pointer",
                  marginRight: "2px",
                  whiteSpace: "nowrap",
                }}
              >
                今月
              </button>
            </div>

            {/* デスクトップ表示（hidden sm:flex）のボタン群: PC操作性とテスト互換性を完全維持 */}
            <div className="hidden sm:flex items-center gap-2">
              <button
                onClick={handleSyncGmailNotices}
                disabled={isFetchingEmails}
                data-testid="gmail-sync-btn"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  background: "var(--bg-card-solid)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "10px",
                  padding: "0.5rem 0.85rem",
                  cursor: isFetchingEmails ? "not-allowed" : "pointer",
                  color: C.charcoal,
                  fontSize: "0.8rem",
                  fontWeight: 650,
                  boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
                  transition: "background 0.15s",
                  opacity: isFetchingEmails ? 0.75 : 1,
                  whiteSpace: "nowrap",
                }}
              >
                {isFetchingEmails ? (
                  <span
                    style={{
                      display: "inline-block",
                      width: "14px",
                      height: "14px",
                      border: "2px solid rgba(0,0,0,0.15)",
                      borderTopColor: C.goldDark,
                      borderRadius: "50%",
                      animation: "spin 0.8s linear infinite",
                    }}
                  />
                ) : (
                  <Mail size={14} color={C.goldDark} />
                )}
                <span>{isFetchingEmails ? "メール取得中..." : "速報メール取得"}</span>
              </button>

              <button
                onClick={() => setIsScannerOpen(true)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  background: "var(--bg-card-solid)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "10px",
                  padding: "0.5rem 0.85rem",
                  cursor: "pointer",
                  color: C.charcoal,
                  fontSize: "0.8rem",
                  fontWeight: 650,
                  boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
                  whiteSpace: "nowrap",
                }}
              >
                <Camera size={14} color={C.goldDark} />
                <span>レシート読取</span>
              </button>

              <button
                onClick={handleOpenNew}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  background: C.gold,
                  border: "none",
                  borderRadius: "10px",
                  padding: "0.5rem 1.05rem",
                  cursor: "pointer",
                  color: "#FDFCFA",
                  fontSize: "0.8rem",
                  fontWeight: 650,
                  boxShadow: "0 2px 8px rgba(197, 160, 89, 0.3)",
                  whiteSpace: "nowrap",
                }}
              >
                <Plus size={15} strokeWidth={2.5} />
                <span>支出を記録</span>
              </button>
            </div>
          </div>
        </div>

        {/* ── Apple HIG風カード型サマリー ── */}
        <div
          style={{
            maxWidth: "1280px",
            marginInline: "auto",
            marginBottom: "0.85rem",
            background: "var(--bg-card-solid)",
            borderRadius: "16px",
            padding: "0.85rem 1.15rem",
            boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)",
            border: "1px solid var(--border-subtle)",
            display: "flex",
            flexDirection: "column",
            gap: "0.4rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
            {/* メイン: 今月の支出合計 */}
            <div>
              <span style={{ fontSize: "0.72rem", color: C.charcoalLight, fontWeight: 600 }}>
                {formatMonthLabel(selectedMonth)}の支出合計
              </span>
              <div
                style={{
                  fontSize: "1.55rem",
                  fontWeight: 800,
                  color: C.charcoal,
                  letterSpacing: "-0.03em",
                  lineHeight: 1.15,
                  marginTop: "0.08rem",
                }}
              >
                {formatCurrency(monthlySummary.totalExpense)}
              </div>
            </div>

            {/* サブ: 取引件数 ＆ 未突合バッジ */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", flexWrap: "wrap" }}>
              <span
                style={{
                  fontSize: "0.74rem",
                  fontWeight: 650,
                  color: C.charcoalMid,
                  background: "var(--bg-nav-track)",
                  padding: "0.2rem 0.55rem",
                  borderRadius: "8px",
                  whiteSpace: "nowrap",
                }}
              >
                {monthlySummary.transactionCount}件の決済
              </span>
            </div>
          </div>

          {/* 安心インジケータ（照合完了時） */}
          {currentMonthReconciledInfo.isReconciled && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                paddingTop: "0.35rem",
                borderTop: "1px solid rgba(0,0,0,0.04)",
                fontSize: "0.74rem",
                color: "#2E7D32",
                fontWeight: 650,
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "15px",
                  height: "15px",
                  borderRadius: "50%",
                  background: C.sage,
                  color: "#FFF",
                  fontSize: "0.62rem",
                  fontWeight: 800,
                  flexShrink: 0,
                }}
              >
                ✓
              </span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {currentMonthReconciledInfo.label}
              </span>
            </div>
          )}
        </div>

        {/* ── メインタブバー（横幅均等セグメントコントロール） ── */}
        <div
          style={{
            maxWidth: "1280px",
            marginInline: "auto",
            marginBottom: "0.75rem",
            display: "flex",
            background: "var(--bg-nav-track)",
            padding: "3px",
            borderRadius: "12px",
            gap: "3px",
            width: "100%",
            boxSizing: "border-box",
          }}
        >
          <button
            onClick={() => setActiveTab("transactions")}
            style={{
              flex: 1,
              background: activeTab === "transactions" ? "var(--bg-nav-pill)" : "transparent",
              border: "none",
              borderRadius: "9px",
              padding: "0.42rem 0.25rem",
              fontSize: "0.76rem",
              fontWeight: activeTab === "transactions" ? 700 : 550,
              color: activeTab === "transactions" ? "var(--text-main)" : "#555",
              cursor: "pointer",
              boxShadow: activeTab === "transactions" ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
              transition: "all 0.15s ease",
              whiteSpace: "nowrap",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.25rem",
            }}
          >
            <span>支出一覧</span>
            <span style={{ fontSize: "0.68rem", opacity: 0.85 }}>({filteredTransactions.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("analytics")}
            style={{
              flex: 1,
              background: activeTab === "analytics" ? "var(--bg-nav-pill)" : "transparent",
              border: "none",
              borderRadius: "9px",
              padding: "0.42rem 0.25rem",
              fontSize: "0.76rem",
              fontWeight: activeTab === "analytics" ? 700 : 550,
              color: activeTab === "analytics" ? "var(--text-main)" : "#555",
              cursor: "pointer",
              boxShadow: activeTab === "analytics" ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
              transition: "all 0.15s ease",
              whiteSpace: "nowrap",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span>分析・グラフ</span>
          </button>

          <button
            onClick={() => setActiveTab("reconcile")}
            style={{
              flex: 1,
              background: activeTab === "reconcile" ? "var(--bg-nav-pill)" : "transparent",
              border: "none",
              borderRadius: "9px",
              padding: "0.42rem 0.25rem",
              fontSize: "0.76rem",
              fontWeight: activeTab === "reconcile" ? 700 : 550,
              color: activeTab === "reconcile" ? "var(--text-main)" : "#555",
              cursor: "pointer",
              boxShadow: activeTab === "reconcile" ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
              transition: "all 0.15s ease",
              whiteSpace: "nowrap",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span>クレカ明細確認</span>
          </button>
        </div>

        {/* ── 検索バー ＆ 詳細絞り込みボタン ── */}
        {activeTab === "transactions" && (
          <div
            style={{
              maxWidth: "1280px",
              marginInline: "auto",
              marginBottom: "0.85rem",
              display: "flex",
              alignItems: "center",
              width: "100%",
            }}
          >
            {/* 検索入力欄（右端にフィルターボタン） */}
            <div
              style={{
                position: "relative",
                flex: 1,
                display: "flex",
                alignItems: "center",
              }}
            >
              <input
                type="text"
                placeholder="カード・店名・分類・品目で検索..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: "100%",
                  background: "var(--bg-card-solid)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "10px",
                  padding: searchQuery ? "0.45rem 3.8rem 0.45rem 0.75rem" : "0.45rem 2.2rem 0.45rem 0.75rem",
                  fontSize: "0.8rem",
                  color: C.charcoal,
                  boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
              {/* 検索クリアボタン */}
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  style={{
                    position: "absolute",
                    right: "2.3rem",
                    background: "transparent",
                    border: "none",
                    padding: "0.2rem",
                    cursor: "pointer",
                    color: C.charcoalLight,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  title="検索をクリア"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}

              {/* 詳細フィルターボタン（ポップアップ展開） */}
              <button
                onClick={() => setIsFilterModalOpen(true)}
                style={{
                  position: "absolute",
                  right: "0.4rem",
                  background: isFiltered ? "rgba(197, 160, 89, 0.15)" : "transparent",
                  border: isFiltered ? `1px solid ${C.gold}` : "1px solid transparent",
                  borderRadius: "6px",
                  padding: "0.3rem",
                  cursor: "pointer",
                  color: isFiltered ? C.goldDark : C.charcoalLight,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.15s ease",
                }}
                title="詳細絞り込み"
              >
                <SlidersHorizontal size={15} />
              </button>
            </div>
          </div>
        )}

        {/* ── コンテンツ表示エリア ── */}
        <div style={{ maxWidth: "1280px", marginInline: "auto" }}>
          {activeTab === "transactions" && (
            <TransactionList
              transactions={filteredTransactions}
              onEdit={handleOpenEdit}
              onDuplicate={handleDuplicate}
              onDelete={(tx) => setTransactionToDelete(tx)}
              onToggleReconciled={handleToggleReconciled}
              onMerge={handleMergeTransactions}
              onOpenMergeModal={(manualTx, emailTx) => setMergePair({ manualOrOcrTx: manualTx, emailTx })}
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

      {/* ── 結合・確定確認モーダル ── */}
      <TransactionMergeModal
        isOpen={Boolean(mergePair)}
        manualOrOcrTx={mergePair?.manualOrOcrTx || null}
        emailTx={mergePair?.emailTx || null}
        onClose={() => setMergePair(null)}
        onConfirmMerge={handleMergeTransactions}
      />

      {/* ── 親指操作FAB (Floating Action Button) ── */}
      <div
        className="fixed sm:hidden"
        style={{
          bottom: "calc(1.5rem + env(safe-area-inset-bottom, 0px))",
          right: "1.25rem",
          zIndex: 100,
        }}
      >
        <button
          onClick={() => setIsFabMenuOpen((prev) => !prev)}
          data-testid="fab-main-button"
          aria-label={isFabMenuOpen ? "メニューを閉じる" : "アクションメニューを開く"}
          style={{
            width: "56px",
            height: "56px",
            borderRadius: "50%",
            background: C.gold,
            color: "#FFF",
            border: "none",
            boxShadow: "0 4px 16px rgba(197, 160, 89, 0.42)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
            transform: isFabMenuOpen ? "rotate(45deg)" : "rotate(0deg)",
          }}
        >
          <Plus size={26} strokeWidth={2.6} />
        </button>
      </div>

      {/* ── FAB展開アクションシート（半透明オーバーレイ付き） ── */}
      {isFabMenuOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 99,
            backgroundColor: "rgba(0, 0, 0, 0.38)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            padding: "1rem 1.25rem calc(5.5rem + env(safe-area-inset-bottom, 0px))",
            animation: "arca-fade-in 0.18s ease-out",
          }}
          onClick={() => setIsFabMenuOpen(false)}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.65rem",
              alignItems: "flex-end",
              animation: "arca-slide-up 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 1. 手動で支出を記録 */}
            <button
              onClick={() => {
                setIsFabMenuOpen(false);
                handleOpenNew();
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.6rem",
                background: "var(--bg-card-solid)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "9999px",
                padding: "0.65rem 1.15rem",
                fontSize: "0.85rem",
                fontWeight: 650,
                color: C.charcoal,
                boxShadow: "0 4px 14px rgba(0, 0, 0, 0.12)",
                cursor: "pointer",
                animation: "arca-fab-btn-in 0.24s cubic-bezier(0.16, 1, 0.3, 1) both",
                animationDelay: "0.08s",
              }}
            >
              <div
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "50%",
                  background: C.gold,
                  color: "#FFF",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Plus size={16} strokeWidth={2.6} />
              </div>
              <span>手動で支出を記録</span>
            </button>

            {/* 2. レシートを読み取る (OCR) */}
            <button
              onClick={() => {
                setIsFabMenuOpen(false);
                setIsScannerOpen(true);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.6rem",
                background: "var(--bg-card-solid)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "9999px",
                padding: "0.65rem 1.15rem",
                fontSize: "0.85rem",
                fontWeight: 650,
                color: C.charcoal,
                boxShadow: "0 4px 14px rgba(0, 0, 0, 0.12)",
                cursor: "pointer",
                animation: "arca-fab-btn-in 0.24s cubic-bezier(0.16, 1, 0.3, 1) both",
                animationDelay: "0.04s",
              }}
            >
              <div
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "50%",
                  background: C.goldFaint,
                  color: C.goldDark,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Camera size={15} strokeWidth={2.2} />
              </div>
              <span>レシートを読み取る (OCR)</span>
            </button>

            {/* 3. カード速報メールを取得 */}
            <button
              onClick={() => {
                setIsFabMenuOpen(false);
                handleSyncGmailNotices();
              }}
              disabled={isFetchingEmails}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.6rem",
                background: "var(--bg-card-solid)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "9999px",
                padding: "0.65rem 1.15rem",
                fontSize: "0.85rem",
                fontWeight: 650,
                color: C.charcoal,
                boxShadow: "0 4px 14px rgba(0, 0, 0, 0.12)",
                cursor: isFetchingEmails ? "not-allowed" : "pointer",
                opacity: isFetchingEmails ? 0.75 : 1,
                animation: "arca-fab-btn-in 0.24s cubic-bezier(0.16, 1, 0.3, 1) both",
                animationDelay: "0s",
              }}
            >
              <div
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "50%",
                  background: C.goldFaint,
                  color: C.goldDark,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Mail size={15} strokeWidth={2.2} />
              </div>
              <span>{isFetchingEmails ? "メール取得中..." : "カード速報メールを取得"}</span>
            </button>
          </div>
        </div>
      )}

      {/* ── 詳細絞り込みポップアップ（画面中央モーダル） ── */}
      {isFilterModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 150,
            backgroundColor: "rgba(0, 0, 0, 0.45)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
            animation: "arca-fade-in 0.15s ease-out",
          }}
          onClick={() => setIsFilterModalOpen(false)}
        >
          <div
            className="arca-card"
            style={{
              background: "var(--bg-card-solid)",
              borderRadius: "16px",
              padding: "1.3rem 1.4rem",
              boxShadow: "var(--shadow-modal)",
              width: "100%",
              maxWidth: "480px",
              maxHeight: "85vh",
              overflowY: "auto",
              animation: "arca-modal-pop 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
              boxSizing: "border-box",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* ヘッダー */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.1rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                <SlidersHorizontal size={17} color={C.goldDark} />
                <h3 style={{ fontSize: "0.95rem", fontWeight: 700, color: C.charcoal, margin: 0 }}>
                  詳細絞り込み
                </h3>
              </div>
              <button
                onClick={() => setIsFilterModalOpen(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: C.charcoalLight,
                  padding: "0.2rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
              {/* 支払方法で絞り込み */}
              <div>
                <label style={{ fontSize: "0.75rem", fontWeight: 700, color: C.charcoalMid, display: "block", marginBottom: "0.5rem" }}>
                  支払方法で絞り込み
                </label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                  <button
                    onClick={() => setSelectedPaymentMethod("all")}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "0.35rem 0.75rem",
                      borderRadius: "9999px",
                      border: "none",
                      fontSize: "0.74rem",
                      fontWeight: selectedPaymentMethod === "all" ? 650 : 500,
                      background: selectedPaymentMethod === "all" ? "var(--bg-nav-pill)" : "var(--bg-nav-track)",
                      color: selectedPaymentMethod === "all" ? "var(--text-main)" : "#555",
                      boxShadow: selectedPaymentMethod === "all" ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    すべての支払方法
                  </button>

                  {PAYMENT_METHODS.map((pm) => {
                    const isSelected = selectedPaymentMethod === pm;
                    const status = currentMonthReconcileMap.get(pm);
                    const isReconciled = Boolean(status?.isReconciled);

                    return (
                      <button
                        key={pm}
                        data-testid={`card-filter-${pm}`}
                        onClick={() => setSelectedPaymentMethod(pm)}
                        title={`${formatMonthLabel(selectedMonth)} ${pm} ${isReconciled ? "照合完了" : "未照合"}（バッジクリックで手動切替）`}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.35rem",
                          padding: "0.35rem 0.75rem",
                          borderRadius: "9999px",
                          border: "none",
                          fontSize: "0.74rem",
                          fontWeight: isSelected ? 650 : 500,
                          background: isSelected ? "var(--bg-nav-pill)" : "var(--bg-nav-track)",
                          color: isSelected ? "var(--text-main)" : "#4A4A4A",
                          boxShadow: isSelected ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
                          cursor: "pointer",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <span>{pm}</span>

                        {/* 照合ステータスバッジ（クリックで手動トグル可能） */}
                        <span
                          data-testid={`reconcile-badge-${pm}`}
                          onClick={(e) => handleToggleCardReconcile(pm, e)}
                          title={
                            isReconciled
                              ? `${formatMonthLabel(selectedMonth)} ${pm} 照合完了（クリックで未照合に変更）`
                              : `${formatMonthLabel(selectedMonth)} ${pm} 未照合（クリックで照合済みに変更）`
                          }
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: "15px",
                            height: "15px",
                            borderRadius: "50%",
                            fontSize: "0.62rem",
                            fontWeight: 750,
                            background: isReconciled ? C.sage : "rgba(128, 128, 128, 0.18)",
                            color: isReconciled ? "#FFFFFF" : "#555",
                            transition: "all 0.15s ease",
                            cursor: "pointer",
                            lineHeight: 1,
                          }}
                        >
                          {isReconciled ? "✓" : "○"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* カテゴリ */}
              <div>
                <label style={{ fontSize: "0.75rem", fontWeight: 700, color: C.charcoalMid, display: "block", marginBottom: "0.4rem" }}>
                  カテゴリ
                </label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  style={{
                    width: "100%",
                    background: "var(--bg-nav-track)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "10px",
                    padding: "0.52rem 0.75rem",
                    fontSize: "0.82rem",
                    color: C.charcoal,
                    outline: "none",
                  }}
                >
                  <option value="all">すべてのカテゴリ</option>
                  {EXPENSE_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              {/* 照合状態 */}
              <div>
                <label style={{ fontSize: "0.75rem", fontWeight: 700, color: C.charcoalMid, display: "block", marginBottom: "0.4rem" }}>
                  CSV照合状態
                </label>
                <select
                  value={reconcileFilter}
                  onChange={(e) => setReconcileFilter(e.target.value as any)}
                  style={{
                    width: "100%",
                    background: "var(--bg-nav-track)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "10px",
                    padding: "0.52rem 0.75rem",
                    fontSize: "0.82rem",
                    color: C.charcoal,
                    outline: "none",
                  }}
                >
                  <option value="all">すべて表示</option>
                  <option value="reconciled">照合済のみ</option>
                  <option value="unreconciled">未照合のみ</option>
                </select>
              </div>

              {/* リセット & 適用ボタン */}
              <div style={{ display: "flex", gap: "0.6rem", marginTop: "0.4rem" }}>
                <button
                  onClick={() => {
                    setSelectedPaymentMethod("all");
                    setSelectedCategory("all");
                    setReconcileFilter("all");
                  }}
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "10px",
                    padding: "0.55rem",
                    fontSize: "0.82rem",
                    fontWeight: 650,
                    color: C.charcoalMid,
                    cursor: "pointer",
                  }}
                >
                  リセット
                </button>
                <button
                  onClick={() => setIsFilterModalOpen(false)}
                  style={{
                    flex: 1,
                    background: C.gold,
                    border: "none",
                    borderRadius: "10px",
                    padding: "0.55rem",
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    color: "#FFF",
                    cursor: "pointer",
                  }}
                >
                  閉じる
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 共通 Undo トースト ── */}
      <UndoToast toast={toast} onUndo={triggerUndo} onDismiss={dismissToast} />

      {/* ── メール同期結果トースト ── */}
      {syncToastMessage && (
        <div
          data-testid="sync-toast"
          style={{
            position: "fixed",
            bottom: "5rem",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 9999,
            background: "rgba(33, 37, 41, 0.94)",
            backdropFilter: "blur(8px)",
            color: "#FFF",
            padding: "0.6rem 1.25rem",
            borderRadius: "9999px",
            fontSize: "0.82rem",
            fontWeight: 650,
            boxShadow: "0 4px 16px rgba(0, 0, 0, 0.22)",
            animation: "arca-view-in 0.2s ease-out",
            pointerEvents: "none",
            whiteSpace: "nowrap",
          }}
        >
          {syncToastMessage}
        </div>
      )}
    </>
  );
}
