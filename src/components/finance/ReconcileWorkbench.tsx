/**
 * src/components/finance/ReconcileWorkbench.tsx
 * Arca — クレジットカード明細CSVインポート ＆ 突合（Reconciliation）ワークベンチ
 */

import { useState, useMemo } from "react";
import { Check } from "lucide-react";
import type {
  CreditCardCsvRow,
  ExpenseCategory,
  ExpenseTransaction,
  PaymentMethod,
  ReconcilePreviewResult,
} from "../../types/finance";
import {
  parseCreditCardCsv,
  decodeCsvBuffer,
  buildReconcilePreview,
  isStoreNameSimilar,
} from "../../utils/csvReconcile";
import {
  commitBatchReconcile,
} from "../../services/csvReconcileService";
import { createExpenseTransaction } from "../../lib/financeStorage";
import {
  predictCategory,
  normalizeMerchantKey,
} from "../../services/merchantCategoryService";
import { ReconcilePreviewModal } from "./ReconcilePreviewModal";
import { formatCurrency } from "../../utils/financeSummary";
import { C } from "../../lib/designSystem";

const CARD_PORTALS = [
  {
    name: "Olive / SMBC",
    url: "https://www.smbc-card.com/memx/web_meisai/top/index.html?p01=202605#info2",
    color: "#008350",
    bgColor: "rgba(0, 131, 80, 0.08)",
  },
  {
    name: "dカード",
    url: "https://dcard.docomo.ne.jp/dsw/top",
    color: "#CC0033",
    bgColor: "rgba(204, 0, 51, 0.08)",
  },
  {
    name: "イオンカード",
    url: "https://www.aeon.co.jp/app/details/?tmid=menu_loggedin-pc_details",
    color: "#C2185B",
    bgColor: "rgba(194, 24, 91, 0.08)",
  },
  {
    name: "Viewカード",
    url: "https://www.viewsnet.jp/V0300/V0300_001.aspx?sv=w01",
    color: "#0078D7",
    bgColor: "rgba(0, 120, 215, 0.08)",
  },
];

interface ReconcileWorkbenchProps {
  transactions: ExpenseTransaction[];
  onReconcile: (transactionId: string, csvRowId: string) => Promise<void>;
  onUnreconcile: (transactionId: string) => Promise<void>;
  onCreateFromCsv: (csvRow: CreditCardCsvRow) => void;
}

export function ReconcileWorkbench({
  transactions,
  onReconcile,
  onUnreconcile,
  onCreateFromCsv,
}: ReconcileWorkbenchProps) {
  const [csvText, setCsvText] = useState("");
  const [csvRows, setCsvRows] = useState<CreditCardCsvRow[]>([]);
  const [detectedMethod, setDetectedMethod] = useState<PaymentMethod>("Oliveカード");
  const [isProcessing, setIsProcessing] = useState(false);
  const [manualSelectCsvRowId, setManualSelectCsvRowId] = useState<string | null>(null);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [batchSuccessMessage, setBatchSuccessMessage] = useState<string | null>(null);

  // ファイル読み込みハンドラ (UTF-8 / Shift-JIS 自動判別対応)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const buffer = event.target?.result as ArrayBuffer;
      const text = decodeCsvBuffer(buffer);
      setCsvText(text);
      const parsed = parseCreditCardCsv(text, detectedMethod);
      setCsvRows(parsed.rows);
      setDetectedMethod(parsed.detectedMethod);
    };

    // ArrayBuffer として読み込み、自動判別デコード
    reader.readAsArrayBuffer(file);
  };

  // テキスト貼り付けからパース
  const handleParseText = () => {
    if (!csvText.trim()) return;
    const parsed = parseCreditCardCsv(csvText, detectedMethod);
    setCsvRows(parsed.rows);
    setDetectedMethod(parsed.detectedMethod);
  };

  // 1対1ペアリング消費モデル ＆ 二重取込防止に基づく照合プレビュー
  const previewResult = useMemo(() => {
    if (csvRows.length === 0) return null;
    return buildReconcilePreview(csvRows, transactions, detectedMethod);
  }, [csvRows, transactions, detectedMethod]);

  // 一括確定コミットハンドラ
  const handleCommitBatch = async (preview: ReconcilePreviewResult) => {
    const result = await commitBatchReconcile(preview);
    const parts: string[] = [];
    if (result.matchedCount > 0) parts.push(`${result.matchedCount}件を確認`);
    if (result.createdCount > 0) parts.push(`${result.createdCount}件を新規登録`);
    setBatchSuccessMessage(`✓ ${parts.join("・")}しました`);
    setTimeout(() => setBatchSuccessMessage(null), 4500);
  };

  // ── 日付と名前（店名/品目）による照合判定 ──
  const matchResults = useMemo(() => {
    if (csvRows.length === 0) return [];
    const activeTxs = transactions.filter((t) => !t.isDeleted);

    return csvRows.map((csvRow) => {
      const rowDateNorm = (csvRow.date || "").replace(/\//g, "-");
      const rowTitleNorm = normalizeMerchantKey(csvRow.title);

      // 日付と名前が一致する取引を探索
      const matched = activeTxs.find((tx) => {
        const txDateNorm = (tx.date || "").replace(/\//g, "-");
        if (rowDateNorm && txDateNorm && rowDateNorm !== txDateNorm) {
          return false;
        }
        const txTitleNorm = normalizeMerchantKey(tx.title);
        if (rowTitleNorm === txTitleNorm) return true;
        if (rowTitleNorm.length >= 2 && txTitleNorm.includes(rowTitleNorm)) return true;
        if (txTitleNorm.length >= 2 && rowTitleNorm.includes(txTitleNorm)) return true;
        if (isStoreNameSimilar(csvRow.title, tx.title)) return true;

        return false;
      });

      // 過去の履歴学習から最適なカテゴリを自動推論（「その他」防止）
      const suggestedCategory = predictCategory(csvRow.title, "食料品");

      return {
        csvRow,
        isMatched: Boolean(matched),
        matchedTransaction: matched,
        suggestedCategory,
      };
    });
  }, [csvRows, transactions]);

  // 未登録明細の個別登録ハンドラ（日付と名前がヒットしなかった場合のみ呼び出し可能）
  const handleRegisterUnmatched = async (csvRow: CreditCardCsvRow, category?: ExpenseCategory) => {
    setIsProcessing(true);
    try {
      const finalCategory = category || predictCategory(csvRow.title, "食料品");
      await createExpenseTransaction({
        date: csvRow.date,
        title: csvRow.title,
        totalAmount: csvRow.amount,
        category: finalCategory,
        paymentMethod: csvRow.paymentMethod || detectedMethod,
        items: [],
        isReconciled: true,
        matchedCsvRowId: csvRow.rowId,
        csvRowFingerprint: csvRow.fingerprint || "",
        source: "manual",
        memo: "クレジットカード明細より登録",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isDeleted: false,
      });
      setBatchSuccessMessage(`✓ 「${csvRow.title}」を支出一覧に登録しました`);
      setTimeout(() => setBatchSuccessMessage(null), 3500);
    } catch (err) {
      console.error("Failed to register transaction from CSV:", err);
    } finally {
      setIsProcessing(false);
    }
  };

  // 未登録明細の一括登録ハンドラ
  const handleRegisterAllUnmatched = async () => {
    const unmatched = matchResults.filter((m) => !m.isMatched);
    if (unmatched.length === 0) return;

    setIsProcessing(true);
    try {
      let count = 0;
      for (const item of unmatched) {
        await createExpenseTransaction({
          date: item.csvRow.date,
          title: item.csvRow.title,
          totalAmount: item.csvRow.amount,
          category: item.suggestedCategory,
          paymentMethod: item.csvRow.paymentMethod || detectedMethod,
          items: [],
          isReconciled: true,
          matchedCsvRowId: item.csvRow.rowId,
          csvRowFingerprint: item.csvRow.fingerprint || "",
          source: "manual",
          memo: "クレジットカード明細より登録",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          isDeleted: false,
        });
        count++;
      }
      setBatchSuccessMessage(`✓ 未登録の明細 ${count}件 を支出一覧に登録しました`);
      setTimeout(() => setBatchSuccessMessage(null), 4500);
    } catch (err) {
      console.error("Batch register all unmatched failed:", err);
    } finally {
      setIsProcessing(false);
    }
  };



  // 手動選択用の未突合取引候補
  const unreconciledTransactions = useMemo(() => {
    return transactions.filter((t) => !t.isDeleted && !t.isReconciled);
  }, [transactions]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.6rem" }}>
      {/* ── CSV 取り込みパネル ── */}
      <div
        className="arca-card"
        style={{
          background: "var(--bg-card-solid)",
          borderRadius: C.radiusCard,
          boxShadow: C.cardShadow,
          padding: "1.5rem",
          border: "1px solid var(--border-subtle)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.8rem", flexWrap: "wrap", gap: "0.6rem" }}>
          <div>
            <h3 style={{ fontSize: "1rem", fontWeight: 700, color: C.charcoal, margin: 0 }}>
              クレジットカード明細 CSV インポート
            </h3>
            <p style={{ fontSize: "0.74rem", color: C.charcoalLight, margin: "0.2rem 0 0" }}>
              Olive / SMBC・dカード・イオンカード・Viewカード等の明細CSVを読み込んで自動照合・確認します
            </p>
          </div>
          {csvRows.length > 0 && (
            <button
              onClick={() => {
                setCsvRows([]);
                setCsvText("");
              }}
              style={{
                background: "transparent",
                border: "1px solid rgba(0,0,0,0.1)",
                borderRadius: "6px",
                padding: "0.3rem 0.6rem",
                fontSize: "0.72rem",
                color: C.charcoalMid,
                cursor: "pointer",
              }}
            >
              リセット
            </button>
          )}
        </div>

        {/* 各社明細Webページへのリンクボタン群 */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", marginBottom: "1.2rem" }}>
          <span style={{ fontSize: "0.72rem", fontWeight: 650, color: C.charcoalLight }}>
            🌐 各社のWEB明細ページで確認・CSVダウンロード:
          </span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "0.5rem" }}>
            {CARD_PORTALS.map((portal) => (
              <a
                key={portal.name}
                href={portal.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.5rem 0.75rem",
                  borderRadius: "8px",
                  background: portal.bgColor,
                  border: "1px solid rgba(0, 0, 0, 0.05)",
                  textDecoration: "none",
                  color: portal.color,
                  fontSize: "0.76rem",
                  fontWeight: 650,
                  transition: "transform 0.15s, opacity 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-1px)";
                  e.currentTarget.style.opacity = "0.85";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.opacity = "1";
                }}
              >
                <span>{portal.name}</span>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </a>
            ))}
          </div>
        </div>

        {csvRows.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {/* ファイルドロップ・選択エリア */}
            <label
              style={{
                border: `2px dashed ${C.goldFaint3}`,
                borderRadius: "12px",
                padding: "2rem 1.5rem",
                textAlign: "center",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0.6rem",
                background: "rgba(197, 160, 89, 0.02)",
                transition: "all 0.15s ease",
              }}
            >
              <input
                type="file"
                accept=".csv,text/csv,text/plain"
                onChange={handleFileUpload}
                style={{ display: "none" }}
              />
              <div
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "50%",
                  background: C.goldFaint,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: C.goldDark,
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </div>
              <div>
                <span style={{ fontSize: "0.85rem", fontWeight: 650, color: C.charcoal }}>
                  CSVファイルを選択、またはここにドラッグ＆ドロップ
                </span>
                <p style={{ fontSize: "0.72rem", color: C.charcoalLight, margin: "0.2rem 0 0" }}>
                  Shift-JIS / UTF-8 自動対応
                </p>
              </div>
            </label>

            {/* またはテキスト貼り付け */}
            <details style={{ fontSize: "0.76rem", color: C.charcoalMid }}>
              <summary style={{ cursor: "pointer", color: C.goldDark, fontWeight: 600 }}>
                CSVテキストを直接貼り付けて読み込む
              </summary>
              <div style={{ marginTop: "0.6rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <textarea
                  rows={4}
                  placeholder="利用日,利用店名,利用金額..."
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.6rem",
                    borderRadius: "8px",
                    border: "1px solid rgba(0,0,0,0.12)",
                    fontSize: "0.78rem",
                    fontFamily: "monospace",
                    boxSizing: "border-box",
                  }}
                />
                <button
                  type="button"
                  onClick={handleParseText}
                  style={{
                    alignSelf: "flex-end",
                    background: C.gold,
                    color: "#FFF",
                    border: "none",
                    borderRadius: "6px",
                    padding: "0.4rem 0.9rem",
                    fontSize: "0.76rem",
                    fontWeight: 650,
                    cursor: "pointer",
                  }}
                >
                  明細を解析する
                </button>
              </div>
            </details>
          </div>
        ) : (
          /* 読み込み済みステータスバー */
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "var(--accent-gold-faint, rgba(138, 194, 221, 0.12))",
              padding: "0.8rem 1.2rem",
              borderRadius: "10px",
              flexWrap: "wrap",
              gap: "0.6rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.8rem", flexWrap: "wrap" }}>
              <span style={{ fontSize: "0.82rem", fontWeight: 700, color: C.charcoal }}>
                {detectedMethod} 明細: {csvRows.length}件 読み込み完了
              </span>
              <div style={{ display: "flex", gap: "0.4rem" }}>
                <span style={{ fontSize: "0.72rem", color: "#2E7D32", fontWeight: 650 }}>
                  登録済み: {matchResults.filter((m) => m.isMatched).length}件
                </span>
                <span style={{ fontSize: "0.72rem", color: "#1565C0", fontWeight: 650 }}>
                  未登録: {matchResults.filter((m) => !m.isMatched).length}件
                </span>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              {matchResults.some((m) => !m.isMatched) && (
                <button
                  onClick={handleRegisterAllUnmatched}
                  disabled={isProcessing}
                  data-testid="register-all-unmatched-btn"
                  style={{
                    background: C.gold,
                    color: "#FFF",
                    border: "none",
                    borderRadius: "8px",
                    padding: "0.45rem 1.1rem",
                    fontSize: "0.78rem",
                    fontWeight: 700,
                    cursor: isProcessing ? "not-allowed" : "pointer",
                    boxShadow: "0 2px 8px var(--accent-gold-glow, rgba(138, 194, 221, 0.3))",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.35rem",
                  }}
                >
                  <Check size={14} strokeWidth={2.5} />
                  <span>
                    未登録の明細を一括で支出一覧に登録 ({matchResults.filter((m) => !m.isMatched).length}件)
                  </span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── 突合照合結果リスト ── */}
      {csvRows.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.8rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 0.5rem" }}>
            <span style={{ fontSize: "0.82rem", fontWeight: 700, color: C.charcoalMid }}>
              照合結果一覧（{matchResults.length}件）
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {matchResults.map((item, idx) => {
              const { csvRow, isMatched, matchedTransaction, suggestedCategory } = item;
              const isManualOpen = manualSelectCsvRowId === csvRow.rowId;

              return (
                <div
                  key={csvRow.rowId || idx}
                  className="arca-card"
                  style={{
                    background: "var(--bg-card-solid)",
                    borderRadius: C.radiusCard,
                    boxShadow: C.cardShadow,
                    padding: "1rem 1.2rem",
                    border: isMatched
                      ? "1px solid rgba(46, 125, 50, 0.35)"
                      : "1px solid var(--border-subtle)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.8rem",
                  }}
                >
                  {/* カード上部: 照合ステータス ＆ 金額 */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", flexWrap: "wrap" }}>
                      {isMatched ? (
                        <span
                          style={{
                            fontSize: "0.68rem",
                            fontWeight: 700,
                            color: "#2E7D32",
                            background: "rgba(46, 125, 50, 0.12)",
                            padding: "0.18rem 0.55rem",
                            borderRadius: "9999px",
                          }}
                        >
                          100% 完全一致（支出一覧に登録済み）
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: "0.68rem",
                            fontWeight: 700,
                            color: "var(--accent-gold-dark, #8C6332)",
                            background: "var(--accent-gold-faint, rgba(197, 160, 89, 0.14))",
                            padding: "0.18rem 0.55rem",
                            borderRadius: "9999px",
                          }}
                        >
                          支出一覧に未登録
                        </span>
                      )}

                      {!isMatched && (
                        <span
                          style={{
                            fontSize: "0.68rem",
                            fontWeight: 650,
                            color: C.charcoalMid,
                            background: "var(--bg-nav-track)",
                            padding: "0.18rem 0.5rem",
                            borderRadius: "6px",
                          }}
                        >
                          自動推論分類: {suggestedCategory}
                        </span>
                      )}
                    </div>

                    <span style={{ fontSize: "0.92rem", fontWeight: 750, color: C.charcoal }}>
                      {formatCurrency(csvRow.amount)}
                    </span>
                  </div>

                  {/* カード中央: 左右対比 (左: CSV明細 / 右: Arca支出) */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "0.8rem",
                      background: "var(--bg-nav-track)",
                      padding: "0.8rem 1rem",
                      borderRadius: "8px",
                    }}
                  >
                    {/* 左: クレカ明細 */}
                    <div>
                      <div style={{ fontSize: "0.68rem", fontWeight: 700, color: C.charcoalLight, marginBottom: "0.2rem" }}>
                        クレジットカード明細 (CSV)
                      </div>
                      <div style={{ fontSize: "0.86rem", fontWeight: 650, color: C.charcoal }}>
                        {csvRow.title}
                      </div>
                      <div style={{ display: "flex", alignItems: "baseline", gap: "0.4rem", marginTop: "0.15rem" }}>
                        <span style={{ fontSize: "0.72rem", color: C.charcoalLight }}>{csvRow.date}</span>
                        <span style={{ fontSize: "0.72rem", color: C.charcoalLight }}>
                          ({csvRow.paymentMethod || detectedMethod})
                        </span>
                      </div>
                    </div>

                    {/* 右: 照合したArca支出 */}
                    <div>
                      <div style={{ fontSize: "0.68rem", fontWeight: 700, color: C.charcoalLight, marginBottom: "0.2rem" }}>
                        Arca 支出記録
                      </div>
                      {matchedTransaction ? (
                        <div>
                          <div style={{ fontSize: "0.86rem", fontWeight: 650, color: C.charcoal }}>
                            {matchedTransaction.title}
                          </div>
                          <div style={{ display: "flex", alignItems: "baseline", gap: "0.4rem", marginTop: "0.15rem" }}>
                            <span style={{ fontSize: "0.72rem", color: C.charcoalLight }}>{matchedTransaction.date}</span>
                            <span style={{ fontSize: "0.92rem", fontWeight: 750, color: C.charcoal }}>
                              {formatCurrency(matchedTransaction.totalAmount)}
                            </span>
                            <span style={{ fontSize: "0.65rem", color: C.charcoalLight }}>
                              ({matchedTransaction.category})
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontSize: "0.78rem", color: C.charcoalLight, fontStyle: "italic", paddingTop: "0.2rem" }}>
                          対応する記録がありません（未登録）
                        </div>
                      )}
                    </div>
                  </div>

                  {/* カード下部: アクションボタン */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "0.5rem", flexWrap: "wrap" }}>
                    {isMatched ? (
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span style={{ fontSize: "0.74rem", color: "#2E7D32", fontWeight: 650 }}>
                          ✓ 登録済み（重複登録防止のため登録不可）
                        </span>
                        {matchedTransaction && (
                          <button
                            onClick={() => onUnreconcile(matchedTransaction.id)}
                            style={{
                              background: "transparent",
                              border: "1px solid rgba(0,0,0,0.12)",
                              borderRadius: "6px",
                              padding: "0.28rem 0.6rem",
                              fontSize: "0.7rem",
                              fontWeight: 600,
                              color: C.charcoalLight,
                              cursor: "pointer",
                            }}
                          >
                            照合解除
                          </button>
                        )}
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => handleRegisterUnmatched(csvRow, suggestedCategory)}
                          disabled={isProcessing}
                          style={{
                            background: C.gold,
                            color: "#FFF",
                            border: "none",
                            borderRadius: "6px",
                            padding: "0.38rem 0.9rem",
                            fontSize: "0.75rem",
                            fontWeight: 650,
                            cursor: isProcessing ? "not-allowed" : "pointer",
                            boxShadow: "0 2px 6px var(--accent-gold-glow, rgba(138, 194, 221, 0.3))",
                          }}
                        >
                          + 支出一覧に登録（{suggestedCategory}）
                        </button>
                        <button
                          onClick={() => onCreateFromCsv(csvRow)}
                          style={{
                            background: "transparent",
                            border: "1px solid rgba(0, 0, 0, 0.12)",
                            borderRadius: "6px",
                            padding: "0.32rem 0.7rem",
                            fontSize: "0.74rem",
                            fontWeight: 600,
                            color: C.charcoalMid,
                            cursor: "pointer",
                          }}
                        >
                          + この明細から支出を作成
                        </button>
                        <button
                          onClick={() => setManualSelectCsvRowId(isManualOpen ? null : csvRow.rowId)}
                          style={{
                            background: "transparent",
                            border: "1px solid rgba(0, 0, 0, 0.12)",
                            borderRadius: "6px",
                            padding: "0.32rem 0.7rem",
                            fontSize: "0.74rem",
                            fontWeight: 600,
                            color: C.charcoalMid,
                            cursor: "pointer",
                          }}
                        >
                          手動で紐付け
                        </button>
                      </>
                    )}
                  </div>

                  {/* 手動選択ドロップダウン */}
                  {isManualOpen && (
                    <div
                      style={{
                        marginTop: "0.4rem",
                        padding: "0.6rem",
                        background: "var(--bg-nav-track)",
                        borderRadius: "8px",
                        border: "1px solid var(--border-subtle)",
                      }}
                    >
                      <div style={{ fontSize: "0.72rem", fontWeight: 700, color: C.charcoalLight, marginBottom: "0.4rem" }}>
                        確認する支出を選択:
                      </div>
                      {unreconciledTransactions.length === 0 ? (
                        <div style={{ fontSize: "0.74rem", color: C.charcoalLight, fontStyle: "italic", padding: "0.4rem 0" }}>
                          未確認の支出がありません
                        </div>
                      ) : (
                        <div style={{ maxHeight: "150px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                          {unreconciledTransactions.map((tx) => (
                            <div
                              key={tx.id}
                              onClick={async () => {
                                await onReconcile(tx.id, csvRow.rowId);
                                setManualSelectCsvRowId(null);
                              }}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                padding: "0.4rem 0.6rem",
                                background: C.white,
                                borderRadius: "6px",
                                cursor: "pointer",
                                fontSize: "0.76rem",
                                border: "1px solid rgba(0,0,0,0.04)",
                              }}
                              onMouseEnter={(e) => {
                                (e.currentTarget as HTMLDivElement).style.background = C.goldFaint;
                              }}
                              onMouseLeave={(e) => {
                                (e.currentTarget as HTMLDivElement).style.background = C.white;
                              }}
                            >
                              <span>
                                {tx.date} - {tx.title} ({tx.category})
                              </span>
                              <span style={{ fontWeight: 700 }}>
                                {formatCurrency(tx.totalAmount)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 照合プレビュー & 一括確定モーダル ── */}
      <ReconcilePreviewModal
        isOpen={isPreviewModalOpen}
        onClose={() => setIsPreviewModalOpen(false)}
        previewResult={previewResult}
        onConfirm={handleCommitBatch}
      />

      {/* ── 一括確定トースト ── */}
      {batchSuccessMessage && (
        <div
          data-testid="batch-success-toast"
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
          {batchSuccessMessage}
        </div>
      )}
    </div>
  );
}
