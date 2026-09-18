/**
 * src/components/maintenance/DbInspectorTab.tsx
 * Arca — データベース・インスペクター（生データ閲覧・検索・JSONコピー）
 *
 * 準拠ガイドライン:
 * - Core/Rules.md: 主体性、データ保護、絵文字完全排除、枠線排除
 * - references/apple_hig_master.md: 洗練されたSVGアイコン、二重シャドウ、44pxタップ領域
 */

import { useState, useEffect, useMemo } from "react";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  limit,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { C } from "../../lib/designSystem";
import {
  Calendar,
  CreditCard,
  Search,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  FileCode,
  AlertCircle,
  BookOpen,
} from "lucide-react";
import { logger } from "../../services/loggerService";
import { SchemaLegendCard } from "./SchemaLegendCard";

export type InspectorCollection = "events" | "finance_transactions";

interface DbDocItem {
  id: string;
  data: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export function DbInspectorTab() {
  const [selectedCol, setSelectedCol] = useState<InspectorCollection>("events");
  const [docs, setDocs] = useState<DbDocItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "deleted" | "unreconciled">("all");
  const [expandedDocIds, setExpandedDocIds] = useState<Set<string>>(new Set());
  const [copiedDocId, setCopiedDocId] = useState<string | null>(null);
  const [showSchemaLegend, setShowSchemaLegend] = useState(false);

  // コレクションのリアルタイム購読
  useEffect(() => {
    setLoading(true);
    setDocs([]);
    setExpandedDocIds(new Set());

    logger.info("firestore", `DbInspector: Subscribed to collection "${selectedCol}"`);

    let q = query(collection(db, selectedCol), limit(150));
    try {
      if (selectedCol === "events") {
        q = query(collection(db, selectedCol), orderBy("date", "desc"), limit(150));
      } else if (selectedCol === "finance_transactions") {
        q = query(collection(db, selectedCol), orderBy("date", "desc"), limit(150));
      }
    } catch {
      // orderBy インデックス未作成時のフォールバック
      q = query(collection(db, selectedCol), limit(150));
    }

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const items: DbDocItem[] = [];
        snapshot.forEach((d) => {
          const raw = d.data();
          items.push({
            id: d.id,
            data: raw,
            createdAt: typeof raw.createdAt === "string" ? raw.createdAt : undefined,
            updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : undefined,
          });
        });
        setDocs(items);
        setLoading(false);
        logger.success("firestore", `DbInspector: Fetched ${items.length} documents from "${selectedCol}"`);
      },
      (err) => {
        console.error(`[DbInspector] Failed to subscribe to ${selectedCol}:`, err);
        logger.error("firestore", `DbInspector: Subscription error for "${selectedCol}"`, err.message);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [selectedCol]);

  // フィルタ・検索
  const filteredDocs = useMemo(() => {
    return docs.filter((item) => {
      const data = item.data;

      // 状態フィルタ
      if (filterMode === "deleted" && !data.isDeleted) return false;
      if (filterMode === "unreconciled" && (data.isReconciled || data.isDeleted)) return false;

      // 検索窓絞り込み
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const idMatch = item.id.toLowerCase().includes(q);
        const titleMatch = typeof data.title === "string" && data.title.toLowerCase().includes(q);
        const nameMatch = typeof data.name === "string" && data.name.toLowerCase().includes(q);
        const memoMatch = typeof data.memo === "string" && data.memo.toLowerCase().includes(q);
        const dateMatch = typeof data.date === "string" && data.date.toLowerCase().includes(q);
        const gEventMatch =
          typeof data.googleEventId === "string" && data.googleEventId.toLowerCase().includes(q);
        const emailMsgMatch =
          typeof data.emailMessageId === "string" && data.emailMessageId.toLowerCase().includes(q);

        return (
          idMatch ||
          titleMatch ||
          nameMatch ||
          memoMatch ||
          dateMatch ||
          gEventMatch ||
          emailMsgMatch
        );
      }

      return true;
    });
  }, [docs, filterMode, searchQuery]);

  // アコーディオン開閉
  const toggleExpand = (id: string) => {
    setExpandedDocIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // 生JSONコピー
  const handleCopyJson = async (item: DbDocItem) => {
    const fullObj = { id: item.id, ...item.data };
    try {
      await navigator.clipboard.writeText(JSON.stringify(fullObj, null, 2));
      setCopiedDocId(item.id);
      logger.info("app", `DbInspector: Copied raw JSON for document ${item.id}`);
      setTimeout(() => setCopiedDocId(null), 2000);
    } catch (err) {
      console.error("[DbInspector] Failed to copy JSON:", err);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem", width: "100%" }}>
      {/* ── コレクション切り替えセグメント ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.4rem",
          background: "var(--bg-nav-track, rgba(0, 0, 0, 0.03))",
          padding: "3px",
          borderRadius: "12px",
          overflowX: "auto",
          border: "none",
        }}
        className="no-scrollbar"
      >
        <button
          onClick={() => setSelectedCol("events")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.4rem",
            padding: "0.45rem 0.85rem",
            borderRadius: "10px",
            border: "none",
            fontSize: "0.78rem",
            fontWeight: selectedCol === "events" ? 700 : 550,
            background: selectedCol === "events" ? "var(--bg-card-solid, #FDFCFA)" : "transparent",
            color: selectedCol === "events" ? C.charcoal : C.charcoalMid,
            boxShadow:
              selectedCol === "events"
                ? "0 1px 4px rgba(0, 0, 0, 0.06), 0 2px 8px rgba(0, 0, 0, 0.03)"
                : "none",
            cursor: "pointer",
            whiteSpace: "nowrap",
            transition: "all 0.15s ease",
          }}
        >
          <Calendar size={14} color={selectedCol === "events" ? C.goldDark : undefined} />
          <span>カレンダー (events)</span>
        </button>

        <button
          onClick={() => setSelectedCol("finance_transactions")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.4rem",
            padding: "0.45rem 0.85rem",
            borderRadius: "10px",
            border: "none",
            fontSize: "0.78rem",
            fontWeight: selectedCol === "finance_transactions" ? 700 : 550,
            background:
              selectedCol === "finance_transactions" ? "var(--bg-card-solid, #FDFCFA)" : "transparent",
            color: selectedCol === "finance_transactions" ? C.charcoal : C.charcoalMid,
            boxShadow:
              selectedCol === "finance_transactions"
                ? "0 1px 4px rgba(0, 0, 0, 0.06), 0 2px 8px rgba(0, 0, 0, 0.03)"
                : "none",
            cursor: "pointer",
            whiteSpace: "nowrap",
            transition: "all 0.15s ease",
          }}
        >
          <CreditCard size={14} color={selectedCol === "finance_transactions" ? C.goldDark : undefined} />
          <span>支出・家計 (finance_transactions)</span>
        </button>
      </div>

      {/* ── 検索バー ＆ フィルタピル ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            position: "relative",
            flex: 1,
            minWidth: "200px",
          }}
        >
          <Search
            size={14}
            color={C.charcoalLight}
            style={{
              position: "absolute",
              left: "0.75rem",
              top: "50%",
              transform: "translateY(-50%)",
              pointerEvents: "none",
            }}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="タイトル・ID・店名・日時等で検索..."
            style={{
              width: "100%",
              background: "var(--bg-nav-track, rgba(0, 0, 0, 0.03))",
              border: "none",
              borderRadius: "10px",
              padding: "0.45rem 0.75rem 0.45rem 2.2rem",
              fontSize: "0.8rem",
              color: C.charcoal,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* 状態フィルタ */}
        <div style={{ display: "flex", gap: "0.3rem", alignItems: "center" }}>
          <button
            onClick={() => setFilterMode("all")}
            style={{
              padding: "0.38rem 0.7rem",
              borderRadius: "8px",
              border: "none",
              fontSize: "0.74rem",
              fontWeight: filterMode === "all" ? 650 : 500,
              background: filterMode === "all" ? "rgba(197, 160, 89, 0.14)" : "transparent",
              color: filterMode === "all" ? C.goldDark : C.charcoalMid,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            全件 ({docs.length})
          </button>

          <button
            onClick={() => setFilterMode("deleted")}
            style={{
              padding: "0.38rem 0.7rem",
              borderRadius: "8px",
              border: "none",
              fontSize: "0.74rem",
              fontWeight: filterMode === "deleted" ? 650 : 500,
              background: filterMode === "deleted" ? "rgba(192, 97, 74, 0.12)" : "transparent",
              color: filterMode === "deleted" ? C.danger : C.charcoalMid,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            論理削除 ({docs.filter((d) => d.data.isDeleted).length})
          </button>

          {selectedCol === "finance_transactions" && (
            <button
              onClick={() => setFilterMode("unreconciled")}
              style={{
                padding: "0.38rem 0.7rem",
                borderRadius: "8px",
                border: "none",
                fontSize: "0.74rem",
                fontWeight: filterMode === "unreconciled" ? 650 : 500,
                background: filterMode === "unreconciled" ? "rgba(82, 121, 111, 0.12)" : "transparent",
                color: filterMode === "unreconciled" ? C.sage : C.charcoalMid,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              未突合 ({docs.filter((d) => !d.data.isReconciled && !d.data.isDeleted).length})
            </button>
          )}

          {/* スキーマ凡例トグルボタン */}
          <button
            onClick={() => setShowSchemaLegend((prev) => !prev)}
            data-testid="toggle-schema-legend-btn"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
              padding: "0.38rem 0.75rem",
              borderRadius: "8px",
              border: "none",
              fontSize: "0.74rem",
              fontWeight: showSchemaLegend ? 700 : 550,
              background: showSchemaLegend ? "rgba(197, 160, 89, 0.18)" : "var(--bg-nav-track, rgba(0, 0, 0, 0.04))",
              color: showSchemaLegend ? C.goldDark : C.charcoalMid,
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "all 0.15s ease",
            }}
            title="データ構造（各フィールドの意味・型）の凡例を表示"
          >
            <BookOpen size={13} />
            <span>スキーマ凡例</span>
          </button>
        </div>
      </div>

      {/* ── スキーマ凡例カード（アコーディオン） ── */}
      {showSchemaLegend && (
        <SchemaLegendCard
          collection={selectedCol}
          onClose={() => setShowSchemaLegend(false)}
        />
      )}

      {/* ── ドキュメント一覧 ── */}
      {loading ? (
        <div style={{ padding: "2.5rem 1rem", textAlign: "center", color: C.charcoalLight, fontSize: "0.82rem" }}>
          Firestore から生データを読み込み中...
        </div>
      ) : filteredDocs.length === 0 ? (
        <div
          style={{
            padding: "2.5rem 1rem",
            textAlign: "center",
            background: "var(--bg-nav-track, rgba(0, 0, 0, 0.02))",
            borderRadius: "14px",
            border: "none",
          }}
        >
          <AlertCircle size={24} color={C.charcoalLight} style={{ margin: "0 auto 0.4rem" }} />
          <div style={{ fontSize: "0.84rem", fontWeight: 650, color: C.charcoal }}>
            該当するドキュメントが見つかりませんでした
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
          {filteredDocs.map((item) => {
            const data = item.data;
            const isExpanded = expandedDocIds.has(item.id);
            const isCopied = copiedDocId === item.id;
            const isDeleted = Boolean(data.isDeleted);

            return (
              <div
                key={item.id}
                style={{
                  background: "var(--bg-nav-track, rgba(0, 0, 0, 0.025))",
                  borderRadius: "14px",
                  padding: "0.75rem 0.9rem",
                  border: "none",
                  boxShadow: "0 1px 3px rgba(0, 0, 0, 0.03)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
                  transition: "background 0.15s ease",
                }}
              >
                {/* 概要ヘッダー行 */}
                <div
                  onClick={() => toggleExpand(item.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "0.6rem",
                    cursor: "pointer",
                    userSelect: "none",
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
                      <span
                        style={{
                          fontFamily: "monospace",
                          fontSize: "0.7rem",
                          color: C.charcoalLight,
                          background: "rgba(0, 0, 0, 0.05)",
                          padding: "0.1rem 0.35rem",
                          borderRadius: "4px",
                        }}
                      >
                        {item.id}
                      </span>

                      {isDeleted && (
                        <span
                          style={{
                            fontSize: "0.66rem",
                            fontWeight: 700,
                            color: C.danger,
                            background: "rgba(192, 97, 74, 0.1)",
                            padding: "0.1rem 0.4rem",
                            borderRadius: "4px",
                          }}
                        >
                          isDeleted: true
                        </span>
                      )}

                      {selectedCol === "finance_transactions" && (
                        <span
                          style={{
                            fontSize: "0.66rem",
                            fontWeight: 650,
                            color: data.isReconciled ? C.sage : C.charcoalMid,
                            background: data.isReconciled
                              ? "rgba(82, 121, 111, 0.12)"
                              : "rgba(0, 0, 0, 0.06)",
                            padding: "0.1rem 0.4rem",
                            borderRadius: "4px",
                          }}
                        >
                          {data.isReconciled ? "照合済" : "未照合"}
                        </span>
                      )}

                      {typeof data.googleEventId === "string" && Boolean(data.googleEventId) && (
                        <span
                          style={{
                            fontSize: "0.66rem",
                            fontWeight: 600,
                            color: C.goldDark,
                            background: "rgba(197, 160, 89, 0.12)",
                            padding: "0.1rem 0.4rem",
                            borderRadius: "4px",
                          }}
                        >
                          Google連動
                        </span>
                      )}
                    </div>

                    {/* タイトル / 主要情報 */}
                    <div
                      style={{
                        fontSize: "0.85rem",
                        fontWeight: 700,
                        color: C.charcoal,
                        marginTop: "0.25rem",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {String(data.title || data.name || data.shiftName || "無題のドキュメント")}
                      {typeof data.totalAmount === "number" && (
                        <span style={{ marginLeft: "0.6rem", color: C.goldDark, fontWeight: 800 }}>
                          ¥{data.totalAmount.toLocaleString()}
                        </span>
                      )}
                    </div>

                    {/* 日時 / 付加情報 */}
                    <div
                      style={{
                        fontSize: "0.72rem",
                        color: C.charcoalLight,
                        marginTop: "0.1rem",
                        display: "flex",
                        gap: "0.6rem",
                        flexWrap: "wrap",
                      }}
                    >
                      {typeof data.date === "string" && <span>日付: {data.date}</span>}
                      {typeof data.paymentMethod === "string" && <span>決済: {data.paymentMethod}</span>}
                      {typeof data.startTime === "string" && (
                        <span>
                          時間: {data.startTime}〜{String(data.endTime || "")}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 展開アイコン & コピー */}
                  <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", flexShrink: 0 }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopyJson(item);
                      }}
                      title="生JSONをクリップボードにコピー"
                      style={{
                        width: "32px",
                        height: "32px",
                        borderRadius: "8px",
                        background: isCopied ? "rgba(82, 121, 111, 0.12)" : "transparent",
                        border: "none",
                        color: isCopied ? C.sage : C.charcoalMid,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                    >
                      {isCopied ? <Check size={14} /> : <Copy size={14} />}
                    </button>

                    <div
                      style={{
                        width: "28px",
                        height: "28px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: C.charcoalLight,
                      }}
                    >
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                  </div>
                </div>

                {/* 展開された生 JSON ビュー */}
                {isExpanded && (
                  <div
                    style={{
                      background: "rgba(0, 0, 0, 0.04)",
                      borderRadius: "10px",
                      padding: "0.75rem",
                      marginTop: "0.25rem",
                      overflowX: "auto",
                      border: "none",
                      animation: "arca-fade-in 0.15s ease-out",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: "0.4rem",
                        paddingBottom: "0.3rem",
                        borderBottom: "1px solid rgba(0, 0, 0, 0.06)",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "0.68rem",
                          fontWeight: 700,
                          color: C.charcoalMid,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.3rem",
                        }}
                      >
                        <FileCode size={12} />
                        Firestore Raw Document
                      </span>

                      <button
                        onClick={() => handleCopyJson(item)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.25rem",
                          background: "transparent",
                          border: "none",
                          fontSize: "0.68rem",
                          fontWeight: 650,
                          color: C.goldDark,
                          cursor: "pointer",
                        }}
                      >
                        {isCopied ? <Check size={11} /> : <Copy size={11} />}
                        <span>{isCopied ? "コピー完了" : "JSONコピー"}</span>
                      </button>
                    </div>

                    <pre
                      style={{
                        margin: 0,
                        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                        fontSize: "0.72rem",
                        lineHeight: 1.45,
                        color: C.charcoal,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {JSON.stringify({ id: item.id, ...item.data }, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
