/**
 * src/components/maintenance/SystemMaintenanceModal.tsx
 * Arca — システム保守・診断コンソール（Arca Inspector ＆ Loggingモード）
 *
 * 準拠ガイドライン:
 * - Core/Rules.md: 主体性、データ保護（Local First）、絵文字完全排除、枠線排除
 * - references/apple_hig_master.md: 洗練されたSVGアイコン、二重多層シャドウ、44pxタップ領域
 */

import { useState } from "react";
import { C } from "../../lib/designSystem";
import { DbInspectorTab } from "./DbInspectorTab";
import { LogTracerTab } from "./LogTracerTab";
import { BackupTab } from "./BackupTab";
import {
  Terminal,
  Database,
  Activity,
  ShieldCheck,
  X,
} from "lucide-react";

export interface SystemMaintenanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: "db" | "tracer" | "backup";
}

type MainTab = "db" | "tracer" | "backup";

export function SystemMaintenanceModal({
  isOpen,
  onClose,
  initialTab = "db",
}: SystemMaintenanceModalProps) {
  const [activeTab, setActiveTab] = useState<MainTab>(initialTab);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        backgroundColor: "rgba(0, 0, 0, 0.45)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "calc(1.2rem + env(safe-area-inset-top, 0px)) 1rem calc(1.2rem + env(safe-area-inset-bottom, 0px))",
        animation: "arca-fade-in 0.16s ease-out",
        boxSizing: "border-box",
      }}
      onClick={onClose}
    >
      <div
        className="arca-card"
        data-testid="system-maintenance-modal"
        style={{
          background: "var(--bg-card-solid, #FDFCFA)",
          borderRadius: "24px",
          boxShadow: "0 16px 64px rgba(0, 0, 0, 0.22), 0 4px 16px rgba(0, 0, 0, 0.08)",
          width: "100%",
          maxWidth: "960px",
          height: "90vh",
          maxHeight: "920px",
          minHeight: "560px",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          border: "none",
          animation: "arca-modal-pop 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ─── モーダルヘッダー ─── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "1.1rem 1.4rem",
            background: "rgba(197, 160, 89, 0.04)",
            border: "none",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
            <div
              style={{
                width: "34px",
                height: "34px",
                borderRadius: "10px",
                background: "rgba(197, 160, 89, 0.14)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: C.goldDark,
                flexShrink: 0,
              }}
            >
              <Terminal size={19} strokeWidth={2.2} />
            </div>
            <div>
              <h2
                style={{
                  fontSize: "1.05rem",
                  fontWeight: 750,
                  color: C.charcoal,
                  margin: 0,
                  letterSpacing: "-0.01em",
                }}
              >
                システム保守・診断コンソール
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="閉じる"
            style={{
              width: "44px",
              height: "44px",
              minWidth: "44px",
              minHeight: "44px",
              borderRadius: "50%",
              background: "transparent",
              border: "none",
              color: C.charcoalLight,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "background 0.15s ease",
            }}
          >
            <X size={19} />
          </button>
        </div>

        {/* ─── セグメントピル切替タブ ─── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
            padding: "0.6rem 1.4rem 0.5rem",
            background: "var(--bg-card-solid, #FDFCFA)",
            border: "none",
            flexShrink: 0,
            overflowX: "auto",
          }}
          className="no-scrollbar"
        >
          <button
            onClick={() => setActiveTab("db")}
            data-testid="maint-tab-db"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              padding: "0.45rem 0.95rem",
              borderRadius: "9999px",
              border: "none",
              fontSize: "0.8rem",
              fontWeight: activeTab === "db" ? 700 : 550,
              background: activeTab === "db" ? "rgba(197, 160, 89, 0.16)" : "transparent",
              color: activeTab === "db" ? C.goldDark : C.charcoalMid,
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "all 0.15s ease",
            }}
          >
            <Database size={15} />
            <span>データベース</span>
          </button>

          <button
            onClick={() => setActiveTab("tracer")}
            data-testid="maint-tab-tracer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              padding: "0.45rem 0.95rem",
              borderRadius: "9999px",
              border: "none",
              fontSize: "0.8rem",
              fontWeight: activeTab === "tracer" ? 700 : 550,
              background: activeTab === "tracer" ? "rgba(197, 160, 89, 0.16)" : "transparent",
              color: activeTab === "tracer" ? C.goldDark : C.charcoalMid,
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "all 0.15s ease",
            }}
          >
            <Activity size={15} />
            <span>ログ追跡</span>
          </button>

          <button
            onClick={() => setActiveTab("backup")}
            data-testid="maint-tab-backup"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              padding: "0.45rem 0.95rem",
              borderRadius: "9999px",
              border: "none",
              fontSize: "0.8rem",
              fontWeight: activeTab === "backup" ? 700 : 550,
              background: activeTab === "backup" ? "rgba(197, 160, 89, 0.16)" : "transparent",
              color: activeTab === "backup" ? C.goldDark : C.charcoalMid,
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "all 0.15s ease",
            }}
          >
            <ShieldCheck size={15} />
            <span>バックアップ</span>
          </button>
        </div>

        {/* ─── メインコンテンツエリア ─── */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "0.85rem 1.4rem 1.4rem",
            WebkitOverflowScrolling: "touch",
          }}
        >
          {activeTab === "db" && <DbInspectorTab />}
          {activeTab === "tracer" && <LogTracerTab />}
          {activeTab === "backup" && <BackupTab />}
        </div>
      </div>
    </div>
  );
}
export default SystemMaintenanceModal;
