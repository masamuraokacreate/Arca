/**
 * src/components/maintenance/LogTracerTab.tsx
 * Arca — ロギング＆トレーサー（処理ログ追跡・ストリーム表示・AI解析用一括コピー）
 *
 * 準拠ガイドライン:
 * - Core/Rules.md: 主体性、データ保護、絵文字完全排除、枠線排除
 * - references/apple_hig_master.md: 洗練されたSVGアイコン、二重シャドウ、44pxタップ領域
 */

import { useState, useEffect } from "react";
import { C } from "../../lib/designSystem";
import {
  logger,
  type LogEntry,
  type LogLevel,
} from "../../services/loggerService";
import {
  Activity,
  Copy,
  Check,
  Trash2,
  Power,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

export function LogTracerTab() {
  const [isLoggingEnabled, setIsLoggingEnabled] = useState(logger.getLoggingEnabled());
  const [logs, setLogs] = useState<LogEntry[]>(logger.getLogs());
  const [isCopied, setIsCopied] = useState(false);
  const [expandedLogIds, setExpandedLogIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const unsub = logger.subscribe((newLogs) => {
      setLogs(newLogs);
    });
    return () => unsub();
  }, []);

  const handleToggleLogging = () => {
    const next = !isLoggingEnabled;
    setIsLoggingEnabled(next);
    logger.setLoggingEnabled(next);
  };

  const handleCopyAllLogs = async () => {
    try {
      const text = logger.formatForAi();
      await navigator.clipboard.writeText(text);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2200);
    } catch (err) {
      console.error("[LogTracer] Failed to copy logs:", err);
    }
  };

  const handleClearLogs = () => {
    logger.clearLogs();
    setExpandedLogIds(new Set());
  };

  const toggleExpand = (id: string) => {
    setExpandedLogIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const getLevelBadgeStyle = (level: LogLevel) => {
    switch (level) {
      case "success":
        return {
          bg: "rgba(82, 121, 111, 0.12)",
          color: C.sage,
        };
      case "warn":
        return {
          bg: "rgba(197, 160, 89, 0.16)",
          color: C.goldDark,
        };
      case "error":
        return {
          bg: "rgba(192, 97, 74, 0.12)",
          color: C.danger,
        };
      case "info":
      default:
        return {
          bg: "rgba(0, 0, 0, 0.05)",
          color: C.charcoalMid,
        };
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem", width: "100%" }}>
      {/* ── コントロールバー（Logging トグルスイッチ ＆ アクション） ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "0.6rem",
          background: "var(--bg-nav-track, rgba(0, 0, 0, 0.025))",
          borderRadius: "14px",
          padding: "0.65rem 0.95rem",
          border: "none",
        }}
      >
        {/* ON/OFF ピルトグルスイッチ */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <button
            onClick={handleToggleLogging}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.45rem",
              padding: "0.4rem 0.85rem",
              borderRadius: "9999px",
              border: "none",
              background: isLoggingEnabled ? C.gold : "rgba(0, 0, 0, 0.08)",
              color: isLoggingEnabled ? "#FFFFFF" : C.charcoalMid,
              fontSize: "0.78rem",
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: isLoggingEnabled ? "0 2px 8px rgba(197, 160, 89, 0.3)" : "none",
              transition: "all 0.15s ease",
            }}
          >
            <Power size={13} strokeWidth={2.5} />
            <span>{isLoggingEnabled ? "Logging モード: 有効" : "Logging モード: 停止中"}</span>
          </button>

          <span style={{ fontSize: "0.74rem", color: C.charcoalLight }}>
            {logs.length} / 100 件
          </span>
        </div>

        {/* コピー ＆ クリア */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
          <button
            onClick={handleCopyAllLogs}
            disabled={logs.length === 0}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
              padding: "0.4rem 0.8rem",
              borderRadius: "8px",
              border: "none",
              background: isCopied ? "rgba(82, 121, 111, 0.14)" : "var(--bg-card-solid, #FDFCFA)",
              color: isCopied ? C.sage : C.charcoal,
              fontSize: "0.76rem",
              fontWeight: 650,
              cursor: logs.length === 0 ? "not-allowed" : "pointer",
              boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
              transition: "all 0.15s ease",
              opacity: logs.length === 0 ? 0.5 : 1,
            }}
          >
            {isCopied ? <Check size={13} /> : <Copy size={13} />}
            <span>{isCopied ? "コピー完了" : "全ログをコピー"}</span>
          </button>

          <button
            onClick={handleClearLogs}
            disabled={logs.length === 0}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
              padding: "0.4rem 0.8rem",
              borderRadius: "8px",
              border: "none",
              background: "transparent",
              color: C.charcoalLight,
              fontSize: "0.76rem",
              fontWeight: 600,
              cursor: logs.length === 0 ? "not-allowed" : "pointer",
              transition: "color 0.15s ease",
              opacity: logs.length === 0 ? 0.5 : 1,
            }}
          >
            <Trash2 size={13} />
            <span>ログをクリア</span>
          </button>
        </div>
      </div>

      {/* ── ログストリーム表示エリア ── */}
      {logs.length === 0 ? (
        <div
          style={{
            padding: "3rem 1.5rem",
            textAlign: "center",
            background: "var(--bg-nav-track, rgba(0, 0, 0, 0.02))",
            borderRadius: "14px",
            border: "none",
          }}
        >
          <Activity size={28} color={C.charcoalLight} style={{ margin: "0 auto 0.5rem" }} />
          <div style={{ fontSize: "0.85rem", fontWeight: 650, color: C.charcoal }}>
            ログは記録されていません
          </div>
          <div style={{ fontSize: "0.74rem", color: C.charcoalLight, marginTop: "0.25rem" }}>
            {isLoggingEnabled
              ? "操作を行うと Firestore Read/Write や API 呼び出しがここにリアルタイム記録されます。"
              : "上部の「Logging モード」を有効にすると、以後の処理ログが記録されます。"}
          </div>
        </div>
      ) : (
        <div
          style={{
            background: "var(--bg-card-solid, #FDFCFA)",
            borderRadius: "14px",
            padding: "0.6rem",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.03)",
            display: "flex",
            flexDirection: "column",
            gap: "0.35rem",
            maxHeight: "56vh",
            overflowY: "auto",
            border: "none",
          }}
        >
          {logs.map((entry) => {
            const badge = getLevelBadgeStyle(entry.level);
            const timeStr = entry.timestamp.slice(11, 23);
            const isExpanded = expandedLogIds.has(entry.id);
            const hasDetails = entry.details !== undefined && entry.details !== null;

            return (
              <div
                key={entry.id}
                style={{
                  background: "var(--bg-nav-track, rgba(0, 0, 0, 0.02))",
                  borderRadius: "8px",
                  padding: "0.45rem 0.65rem",
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                  fontSize: "0.74rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.3rem",
                  border: "none",
                }}
              >
                {/* ログ行メイン */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    justifyContent: "space-between",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.6rem",
                      minWidth: 0,
                      flex: 1,
                    }}
                  >
                    {/* タイムスタンプ */}
                    <span
                      style={{
                        width: "82px",
                        color: C.charcoalLight,
                        fontSize: "0.68rem",
                        fontVariantNumeric: "tabular-nums",
                        flexShrink: 0,
                        letterSpacing: "-0.01em",
                      }}
                    >
                      {timeStr}
                    </span>

                    {/* レベルバッジ */}
                    <span
                      style={{
                        width: "48px",
                        textAlign: "center",
                        display: "inline-block",
                        boxSizing: "border-box",
                        padding: "0.1rem 0",
                        borderRadius: "4px",
                        fontSize: "0.62rem",
                        fontWeight: 750,
                        background: badge.bg,
                        color: badge.color,
                        flexShrink: 0,
                        letterSpacing: "0.02em",
                      }}
                    >
                      {entry.level.toUpperCase()}
                    </span>

                    {/* カテゴリバッジ */}
                    <span
                      style={{
                        width: "88px",
                        textAlign: "center",
                        display: "inline-block",
                        boxSizing: "border-box",
                        padding: "0.1rem 0",
                        borderRadius: "4px",
                        fontSize: "0.62rem",
                        fontWeight: 650,
                        background: "rgba(0, 0, 0, 0.05)",
                        color: C.charcoalMid,
                        flexShrink: 0,
                      }}
                    >
                      {entry.category.toUpperCase()}
                    </span>

                    {/* メッセージ本文 */}
                    <span
                      style={{
                        color: C.charcoal,
                        fontWeight: 550,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {entry.message}
                    </span>
                  </div>

                  {/* 詳細展開ボタン */}
                  {hasDetails && (
                    <button
                      onClick={() => toggleExpand(entry.id)}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: C.charcoalLight,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        padding: "0.2rem",
                        flexShrink: 0,
                      }}
                    >
                      {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>
                  )}
                </div>

                {/* 詳細ペイロード */}
                {isExpanded && hasDetails && (
                  <pre
                    style={{
                      margin: "0.2rem 0 0",
                      background: "rgba(0, 0, 0, 0.04)",
                      padding: "0.45rem 0.6rem",
                      borderRadius: "6px",
                      fontSize: "0.68rem",
                      lineHeight: 1.4,
                      color: C.charcoal,
                      overflowX: "auto",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {typeof entry.details === "string"
                      ? entry.details
                      : JSON.stringify(entry.details, null, 2)}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
