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
import { fetchAndProcessCardNoticeEmails } from "../../services/gmailFinanceService";
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
          setSyncToastMessage(`✉️ ${parts.join("、")}しました`);
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
        setSyncToastMessage(`✉️ ${parts.join("、")}しました`);
      } else if (result.totalFound > 0) {
        setSyncToastMessage("✉️ 利用速報メールはすべて取り込み済みです");
      } else {
        setSyncToastMessage("✉️ 直近14日以内の新しい利用速報メールはありませんでした");
      }
    } catch (err: any) {
      console.error("Gmail sync error:", err);
      setSyncToastMessage(`✉️ 速報メール取得に失敗: ${err?.message || "認証エラー"}`);
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
          padding: "2.4rem clamp(1.5rem, 5vw, 4rem) 6rem",
          boxSizing: "border-box",
        }}
      >
        {/* ── ヘッダー ── */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            marginBottom: "1.5rem",
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
                background: "var(--bg-card-solid)",
                border: "1px solid var(--border-subtle)",
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
                  background: "var(--bg-nav-track)",
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

            {/* Gmail速報メール取得ボタン */}
            <button
              onClick={handleSyncGmailNotices}
              disabled={isFetchingEmails}
              data-testid="gmail-sync-btn"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.45rem",
                background: "var(--bg-card-solid)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "11px",
                padding: "0.62rem 0.95rem",
                cursor: isFetchingEmails ? "not-allowed" : "pointer",
                color: C.charcoal,
                fontSize: "0.82rem",
                fontWeight: 650,
                letterSpacing: "0.02em",
                boxShadow: "0 1px 4px rgba(0, 0, 0, 0.04)",
                transition: "background 0.15s, transform 0.15s",
                opacity: isFetchingEmails ? 0.75 : 1,
              }}
              onMouseEnter={(e) => {
                if (!isFetchingEmails) {
                  e.currentTarget.style.background = C.goldFaint;
                  e.currentTarget.style.transform = "translateY(-1px)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isFetchingEmails) {
                  e.currentTarget.style.background = "var(--bg-card-solid)";
                  e.currentTarget.style.transform = "translateY(0)";
                }
              }}
              title="三井住友/Olive・dカード・イオン・ViewカードのGmail利用速報メールから支出下書きを即時生成"
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
                <span style={{ fontSize: "0.85rem", color: C.goldDark }}>✉️</span>
              )}
              <span>{isFetchingEmails ? "メール取得中..." : "速報メール取得"}</span>
            </button>

            {/* レシートカメラ読取ボタン */}
            <button
              onClick={() => setIsScannerOpen(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.45rem",
                background: "var(--bg-card-solid)",
                border: "1px solid var(--border-subtle)",
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
                e.currentTarget.style.background = "var(--bg-card-solid)";
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
                letterSpacing: "0.02em",
                boxShadow: "0 2px 10px rgba(197, 160, 89, 0.3)",
                transition: "transform 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-1px)";
              }}
              onMouseLeave={(e) => {
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

        {/* ── 月次サマリー上部の安心インジケータバナー ── */}
        {currentMonthReconciledInfo.isReconciled && (
          <div
            style={{
              maxWidth: "1280px",
              marginInline: "auto",
              marginBottom: "1.2rem",
              background: "rgba(82, 121, 111, 0.10)",
              border: "1px solid rgba(82, 121, 111, 0.22)",
              borderRadius: "12px",
              padding: "0.55rem 1rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.6rem",
              animation: "arca-view-in 0.2s ease-out",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "18px",
                  height: "18px",
                  borderRadius: "50%",
                  background: C.sage,
                  color: "#FFF",
                  fontSize: "0.68rem",
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                ✓
              </span>
              <span style={{ fontSize: "0.8rem", fontWeight: 650, color: "#3B5E53", letterSpacing: "0.01em" }}>
                ✦ {currentMonthReconciledInfo.label}
              </span>
            </div>
            <span style={{ fontSize: "0.68rem", color: C.charcoalLight }}>
              {formatMonthLabel(selectedMonth)} 照合完了
            </span>
          </div>
        )}

        {/* ── メインタブバー（支出一覧 / 分析・グラフ / クレカ明細突合） ── */}
        <div
          style={{
            maxWidth: "1280px",
            marginInline: "auto",
            marginBottom: "1.2rem",
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
              background: "var(--bg-nav-track)",
              padding: "3px",
              borderRadius: "9999px",
              gap: "2px",
            }}
          >
            <button
              onClick={() => setActiveTab("transactions")}
              style={{
                background: activeTab === "transactions" ? "var(--bg-nav-pill)" : "transparent",
                border: "none",
                borderRadius: "9999px",
                padding: "0.42rem 1.05rem",
                fontSize: "0.78rem",
                fontWeight: activeTab === "transactions" ? 650 : 500,
                color: activeTab === "transactions" ? "var(--text-main)" : C.charcoalLight,
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
                background: activeTab === "analytics" ? "var(--bg-nav-pill)" : "transparent",
                border: "none",
                borderRadius: "9999px",
                padding: "0.42rem 1.05rem",
                fontSize: "0.78rem",
                fontWeight: activeTab === "analytics" ? 650 : 500,
                color: activeTab === "analytics" ? "var(--text-main)" : C.charcoalLight,
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
                background: activeTab === "reconcile" ? "var(--bg-nav-pill)" : "transparent",
                border: "none",
                borderRadius: "9999px",
                padding: "0.42rem 1.05rem",
                fontSize: "0.78rem",
                fontWeight: activeTab === "reconcile" ? 650 : 500,
                color: activeTab === "reconcile" ? "var(--text-main)" : C.charcoalLight,
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
                    background: "var(--bg-card-solid)",
                    border: "1px solid var(--border-subtle)",
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
                  background: "var(--bg-card-solid)",
                  border: "1px solid var(--border-subtle)",
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
                  background: "var(--bg-card-solid)",
                  border: "1px solid var(--border-subtle)",
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
                  background: "var(--bg-card-solid)",
                  border: "1px solid var(--border-subtle)",
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

        {/* ── カード別絞込フィルター（Pill Tabs ＆ 照合バッジ） ── */}
        {activeTab === "transactions" && (
          <div
            style={{
              maxWidth: "1280px",
              marginInline: "auto",
              marginBottom: "1rem",
              display: "flex",
              alignItems: "center",
              gap: "0.45rem",
              overflowX: "auto",
              paddingBottom: "4px",
              scrollbarWidth: "none",
            }}
            className="no-scrollbar"
          >
            <button
              onClick={() => setSelectedPaymentMethod("all")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.35rem",
                padding: "0.36rem 0.85rem",
                borderRadius: "9999px",
                border: "none",
                fontSize: "0.76rem",
                fontWeight: selectedPaymentMethod === "all" ? 650 : 500,
                background: selectedPaymentMethod === "all" ? "var(--bg-nav-pill)" : "var(--bg-nav-track)",
                color: selectedPaymentMethod === "all" ? "var(--text-main)" : C.charcoalLight,
                boxShadow: selectedPaymentMethod === "all" ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "all 0.15s ease",
                flexShrink: 0,
              }}
            >
              <span>すべての支払方法</span>
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
                    gap: "0.45rem",
                    padding: "0.36rem 0.85rem",
                    borderRadius: "9999px",
                    border: "none",
                    fontSize: "0.76rem",
                    fontWeight: isSelected ? 650 : 500,
                    background: isSelected ? "var(--bg-nav-pill)" : "var(--bg-nav-track)",
                    color: isSelected ? "var(--text-main)" : C.charcoalLight,
                    boxShadow: isSelected ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    transition: "all 0.15s ease",
                    flexShrink: 0,
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
                      width: "16px",
                      height: "16px",
                      borderRadius: "50%",
                      fontSize: "0.65rem",
                      fontWeight: 750,
                      background: isReconciled ? C.sage : "rgba(128, 128, 128, 0.18)",
                      color: isReconciled ? "#FFFFFF" : C.charcoalLight,
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
