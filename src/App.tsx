/**
 * src/App.tsx
 * Arca — Apple HIG準拠の共通レイアウト & スライディングナビゲーション
 */

import { useState, useRef, useEffect, useCallback } from "react";
import Tasks from "./components/Tasks";
import Calendar from "./components/Calendar";
import Dashboard from "./components/Dashboard";
import Notes from "./components/Notes";
import Recipes from "./components/recipes/Recipes";
import Finance from "./components/finance/Finance";
import SystemMaintenanceModal from "./components/maintenance/SystemMaintenanceModal";
import ThemeModal from "./components/ThemeModal";
import { C } from "./lib/designSystem";
import { useNetworkStatus } from "./hooks/useNetworkStatus";
import { logoutUser } from "./components/AuthGate";
import { getSavedToken, syncAllGoogleData } from "./services/googleAuth";
import { useGoogleAuth } from "./hooks/useGoogleAuth";


// ---------- ネットワーク接続状態バッジ ----------
function NetworkStatusBadge({ isOnline }: { isOnline: boolean }) {
  if (isOnline) {
    return (
      <div
        className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500/10 dark:bg-emerald-400/15 shrink-0"
        title="クラウドとリアルタイム同期中"
      >
        <span
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            backgroundColor: "#5A8B5F",
            display: "inline-block",
          }}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.35rem",
        padding: "0.2rem 0.55rem",
        borderRadius: "9999px",
        background: "rgba(184, 150, 106, 0.18)",
        color: "#8C6332",
        fontSize: "0.68rem",
        fontWeight: 600,
        letterSpacing: "0.02em",
        userSelect: "none",
        transition: "all 0.2s ease",
        flexShrink: 0,
      }}
      title="オフラインです。データは端末内に安全に保存されています。"
    >
      <span
        style={{
          width: "5px",
          height: "5px",
          borderRadius: "50%",
          backgroundColor: "#C5934E",
          display: "inline-block",
        }}
      />
      <span>オフライン（ローカル保存中）</span>
    </div>
  );
}

// ---------- Google データ同期インジケータ ＆ 手動同期ボタン ----------
export type GoogleSyncStatus = "idle" | "syncing" | "done" | "error";

interface GoogleSyncBadgeProps {
  status: GoogleSyncStatus;
  onSync: () => void;
  isMobile?: boolean;
}

function GoogleSyncBadge({ status, onSync, isMobile }: GoogleSyncBadgeProps) {
  if (status === "syncing") {
    return (
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.3rem",
          padding: "0.2rem 0.55rem",
          borderRadius: "9999px",
          background: "rgba(82, 121, 111, 0.12)",
          color: "#52796F",
          fontSize: "0.68rem",
          fontWeight: 600,
          letterSpacing: "0.02em",
          userSelect: "none",
          flexShrink: 0,
        }}
        title="Googleカレンダー & Tasksを一括同期中"
      >
        <svg
          style={{
            width: "11px",
            height: "11px",
            animation: "spin 1s linear infinite",
          }}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
          />
        </svg>
        <span className={isMobile ? "hidden" : "inline"}>Google同期中…</span>
      </div>
    );
  }

  if (status === "done") {
    return (
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.25rem",
          padding: "0.2rem 0.55rem",
          borderRadius: "9999px",
          background: "rgba(82, 121, 111, 0.14)",
          color: "#52796F",
          fontSize: "0.68rem",
          fontWeight: 650,
          letterSpacing: "0.02em",
          userSelect: "none",
          flexShrink: 0,
          animation: "arca-fade-in 0.2s ease-out",
        }}
        title="Googleカレンダー & Tasksの同期が完了しました"
      >
        <span style={{ fontSize: "0.72rem", lineHeight: 1 }}>✓</span>
        <span className={isMobile ? "hidden" : "inline"}>同期完了</span>
      </div>
    );
  }

  if (status === "error") {
    return (
      <button
        onClick={onSync}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.25rem",
          padding: "0.2rem 0.55rem",
          borderRadius: "9999px",
          background: "rgba(224, 86, 74, 0.1)",
          color: "#E0564A",
          border: "none",
          fontSize: "0.68rem",
          fontWeight: 600,
          cursor: "pointer",
          userSelect: "none",
          flexShrink: 0,
        }}
        title="Google同期でエラーが発生しました。クリックで再試行"
      >
        <span>!</span>
        <span className={isMobile ? "hidden" : "inline"}>再試行</span>
      </button>
    );
  }

  // idle: 通常時はバッジ・ボタンを表示せず、ヘッダーをクリーンに保つ
  return null;
}

// ---------- ナビゲーション定義 ----------
type Module = "dashboard" | "tasks" | "calendar" | "notes" | "recipes" | "finance";

const NAV_ITEMS: { id: Module; label: string; sub: string }[] = [
  { id: "dashboard", label: "Dashboard", sub: "ダッシュボード" },
  { id: "tasks", label: "Tasks", sub: "タスク" },
  { id: "calendar", label: "Calendar", sub: "カレンダー" },
  { id: "notes", label: "Notes", sub: "ノート" },
  { id: "recipes", label: "Recipes", sub: "料理レシピ" },
  { id: "finance", label: "Finance", sub: "家計・支出" },
];

// ---------- ナビゲーションバー ----------
function NavBar({
  active,
  onChange,
  onOpenMaintenance,
  onOpenTheme,
  googleSyncStatus,
  onManualSync,
}: {
  active: Module;
  onChange: (m: Module) => void;
  onOpenMaintenance?: () => void;
  onOpenTheme?: () => void;
  googleSyncStatus: GoogleSyncStatus;
  onManualSync: () => void;
}) {
  const { isOnline } = useNetworkStatus();
  const navTrackRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Map<Module, HTMLButtonElement>>(new Map());
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" ? window.innerWidth < 640 : false);

  // ─── Arca ロゴ 2秒長押し判定（ロマントリガー） ───
  const [isLongPressing, setIsLongPressing] = useState(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasTriggeredLongPressRef = useRef(false);

  const startLongPress = useCallback(() => {
    if (longPressTimerRef.current) return;
    hasTriggeredLongPressRef.current = false;
    setIsLongPressing(true);
    longPressTimerRef.current = setTimeout(() => {
      hasTriggeredLongPressRef.current = true;
      setIsLongPressing(false);
      longPressTimerRef.current = null;
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try {
          navigator.vibrate([30]);
        } catch {}
      }
      onOpenMaintenance?.();
    }, 2000);
  }, [onOpenMaintenance]);

  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    setIsLongPressing(false);
  }, []);

  const handleLogoClick = useCallback(() => {
    if (hasTriggeredLongPressRef.current) {
      hasTriggeredLongPressRef.current = false;
      return;
    }
    onChange("dashboard");
  }, [onChange]);

  // 白い楕円インジケーターの位置とサイズ
  const [indicator, setIndicator] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
    ready: boolean;
  }>({
    left: 0,
    top: 3,
    width: 0,
    height: 0,
    ready: false,
  });

  // 画面幅監視
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 640);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // アクティブタブのDOM位置に合わせてインジケーターを更新
  const updateIndicator = useCallback(() => {
    const activeBtn = buttonRefs.current.get(active);
    const track = navTrackRef.current;
    if (!activeBtn || !track) return;

    const btnLeft = activeBtn.offsetLeft;
    const btnTop = activeBtn.offsetTop;
    const btnWidth = activeBtn.offsetWidth;
    const btnHeight = activeBtn.offsetHeight;

    setIndicator({
      left: btnLeft,
      top: btnTop,
      width: btnWidth,
      height: btnHeight,
      ready: true,
    });
  }, [active]);

  // タブ切り替え時・マウント時・リサイズ時に位置を再計算
  useEffect(() => {
    updateIndicator();

    const raf = requestAnimationFrame(updateIndicator);
    const timer = setTimeout(updateIndicator, 50);

    const handleResize = () => updateIndicator();
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      window.removeEventListener("resize", handleResize);
    };
  }, [updateIndicator, isMobile]);

  // タブクリック時のハンドラ（モバイル用スクロール追従付き）
  const handleTabClick = (id: Module) => {
    onChange(id);
    const btn = buttonRefs.current.get(id);
    if (btn) {
      btn.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
    }
  };

  return (
    <header
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        height: isMobile
          ? "calc(94px + env(safe-area-inset-top, 0px))"
          : "calc(52px + env(safe-area-inset-top, 0px))",
        transition: "height 0.2s ease",
      }}
    >
      {/* ─── すりガラス背景専用レイヤー（GPUラスタライズ巻き込み防止） ─── */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background: "var(--bg-surface-glass)",
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
          boxShadow: "0 1px 0 var(--border-subtle)",
          pointerEvents: "none",
          transform: "translateZ(0)",
          WebkitTransform: "translateZ(0)",
        }}
      />

      {/* ─── 前面コンテンツレイヤー（独立した合成レイヤーでクッキリ描画） ─── */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          height: "100%",
          boxSizing: "border-box",
          paddingTop: "env(safe-area-inset-top, 0px)",
          paddingLeft: "calc(1rem + env(safe-area-inset-left, 0px))",
          paddingRight: "calc(1rem + env(safe-area-inset-right, 0px))",
          paddingBottom: isMobile ? "0.4rem" : "0",
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          alignItems: isMobile ? "stretch" : "center",
          justifyContent: "space-between",
          WebkitFontSmoothing: "antialiased",
          MozOsxFontSmoothing: "grayscale",
        }}
      >
      {/* ─── 上段（PC時は左と右、モバイル時はロゴと右コントロールが1行） ─── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: isMobile ? "44px" : "100%",
          width: isMobile ? "100%" : "auto",
          zIndex: 2,
        }}
      >
        {/* ロゴ（2秒長押しでシステム保守・診断コンソール展開） */}
        <div
          onPointerDown={startLongPress}
          onPointerUp={cancelLongPress}
          onPointerLeave={cancelLongPress}
          onPointerCancel={cancelLongPress}
          onTouchStart={startLongPress}
          onTouchEnd={cancelLongPress}
          onTouchMove={cancelLongPress}
          onTouchCancel={cancelLongPress}
          onContextMenu={(e) => e.preventDefault()}
          onClick={handleLogoClick}
          title="ホーム（2秒長押しでシステム保守・診断コンソール）"
          className="select-none touch-none [-webkit-touch-callout:none]"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            cursor: "pointer",
            userSelect: "none",
            WebkitUserSelect: "none",
            WebkitTouchCallout: "none",
            touchAction: "none",
            flexShrink: 0,
            paddingRight: "0.75rem",
            transition: "transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), filter 0.2s ease",
            transform: isLongPressing ? "scale(0.95)" : "scale(1)",
            filter: isLongPressing
              ? "drop-shadow(0 0 10px rgba(197, 160, 89, 0.75))"
              : "none",
          }}
        >
          <img
            src="/Arca_logo.png"
            alt="Arca"
            draggable={false}
            className="select-none touch-none pointer-events-none [-webkit-touch-callout:none]"
            style={{
              width: "24px",
              height: "24px",
              borderRadius: "6px",
              boxShadow: "0 1px 3px rgba(0, 0, 0, 0.08)",
              objectFit: "cover",
              userSelect: "none",
              WebkitUserSelect: "none",
              WebkitTouchCallout: "none",
              touchAction: "none",
              pointerEvents: "none",
            }}
          />
          <span
            className="select-none pointer-events-none"
            style={{
              fontSize: "0.95rem",
              fontWeight: 700,
              letterSpacing: "0.14em",
              color: C.gold,
              userSelect: "none",
              WebkitUserSelect: "none",
              pointerEvents: "none",
            }}
          >
            Arca
          </span>
        </div>

        {/* モバイル表示時の右端コントロール */}
        {isMobile && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
            <NetworkStatusBadge isOnline={isOnline} />
            <GoogleSyncBadge status={googleSyncStatus} onSync={onManualSync} isMobile={true} />

            {/* 外観・テーマ設定 */}
            <button
              onClick={onOpenTheme}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.22rem",
                background: "transparent",
                border: "none",
                borderRadius: "8px",
                padding: "0.25rem 0.4rem",
                fontSize: "0.72rem",
                color: C.charcoalLight,
                cursor: "pointer",
              }}
              title="外観・テーマ設定"
            >
              <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.75} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" style={{ width: "0.88rem", height: "0.88rem" }}>
                <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
                <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
                <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
                <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
                <path d="M12 2C6.48 2 2 6.48 2 12a10 10 0 0 0 10 10c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c3.31 0 6-2.69 6-6 0-4.97-4.48-9-10-9z" />
              </svg>
            </button>


            {/* ログアウト */}
            <button
              onClick={logoutUser}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.25rem",
                background: "transparent",
                border: "none",
                borderRadius: "8px",
                padding: "0.25rem 0.4rem",
                fontSize: "0.72rem",
                color: C.charcoalLight,
                cursor: "pointer",
              }}
              title="ログアウト"
            >
              <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.75} stroke="currentColor" style={{ width: "0.88rem", height: "0.88rem" }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* ─── スライディングピル型モジュールタブバー（PC: 幾何学的中央に完全固定 / モバイル: 2段目に広々配置） ─── */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          position: isMobile ? "static" : "absolute",
          left: isMobile ? "auto" : "50%",
          top: isMobile ? "auto" : "50%",
          transform: isMobile ? "none" : "translate(-50%, -50%)",
          width: isMobile ? "100%" : "auto",
          overflowX: "auto",
          zIndex: 1,
        }}
        className="no-scrollbar"
      >
        <nav
          ref={navTrackRef}
          className="no-scrollbar"
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            background: "var(--bg-nav-track)",
            padding: "3px",
            borderRadius: "9999px",
            gap: "2px",
            overflowX: "auto",
            flexShrink: 0,
            maxWidth: isMobile ? "100%" : "calc(100vw - 90px)",
            boxSizing: "border-box",
          }}
        >
          {/* 移動する白い楕円（Sliding Pill） */}
          <div
            style={{
              position: "absolute",
              top: indicator.top,
              left: 0,
              transform: `translate3d(${indicator.left}px, 0, 0)`,
              width: indicator.width,
              height: indicator.height,
              background: "var(--bg-nav-pill)",
              borderRadius: "9999px",
              boxShadow: "0 1px 4px rgba(0, 0, 0, 0.08), 0 0 1px rgba(0, 0, 0, 0.04)",
              transition: indicator.ready
                ? "transform 0.28s cubic-bezier(0.16, 1, 0.3, 1), width 0.28s cubic-bezier(0.16, 1, 0.3, 1)"
                : "none",
              pointerEvents: "none",
              zIndex: 0,
              opacity: indicator.width > 0 ? 1 : 0,
            }}
          />

          {/* 各タブボタン */}
          {NAV_ITEMS.map(({ id, label }) => {
            const isActive = active === id;
            return (
              <button
                key={id}
                ref={(el) => {
                  if (el) buttonRefs.current.set(id, el);
                  else buttonRefs.current.delete(id);
                }}
                onClick={() => handleTabClick(id)}
                style={{
                  position: "relative",
                  zIndex: 1,
                  background: "transparent",
                  border: "none",
                  borderRadius: "9999px",
                  padding: isMobile ? "0.42rem 0.8rem" : "0.38rem 0.95rem",
                  cursor: "pointer",
                  fontSize: isMobile ? "0.78rem" : "0.78rem",
                  fontWeight: isActive ? 650 : 450,
                  letterSpacing: "0.02em",
                  color: isActive ? "var(--text-main)" : C.charcoalLight,
                  transition: "color 0.18s ease",
                  whiteSpace: "nowrap",
                  userSelect: "none",
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => {
                  if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = "var(--text-main)";
                }}
                onMouseLeave={(e) => {
                  if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = C.charcoalLight;
                }}
              >
                {label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ─── PC表示時の右端コントロール ─── */}
      {!isMobile && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "0.45rem", flexShrink: 0, minWidth: "24px", zIndex: 2 }}>
          <NetworkStatusBadge isOnline={isOnline} />
          <GoogleSyncBadge status={googleSyncStatus} onSync={onManualSync} isMobile={false} />

          {/* 外観・テーマ設定 */}
          <button
            onClick={onOpenTheme}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.22rem",
              background: "transparent",
              border: "none",
              borderRadius: "8px",
              padding: "0.25rem 0.45rem",
              fontSize: "0.72rem",
              color: C.charcoalLight,
              cursor: "pointer",
              transition: "all 0.15s ease",
              userSelect: "none",
            }}
            title="外観・テーマ設定"
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = C.goldDark;
              (e.currentTarget as HTMLButtonElement).style.background = C.goldFaint;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = C.charcoalLight;
              (e.currentTarget as HTMLButtonElement).style.background = "transparent";
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.75} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" style={{ width: "0.85rem", height: "0.85rem", flexShrink: 0 }}>
              <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
              <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
              <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
              <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
              <path d="M12 2C6.48 2 2 6.48 2 12a10 10 0 0 0 10 10c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c3.31 0 6-2.69 6-6 0-4.97-4.48-9-10-9z" />
            </svg>
            <span className="hidden sm:inline">外観</span>
          </button>


          {/* ログアウトボタン */}
          <button
            onClick={logoutUser}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.25rem",
              background: "transparent",
              border: "none",
              borderRadius: "8px",
              padding: "0.25rem 0.45rem",
              fontSize: "0.72rem",
              color: C.charcoalLight,
              cursor: "pointer",
              transition: "all 0.15s ease",
              userSelect: "none",
            }}
            title="ログアウト"
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = C.danger;
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(224, 86, 74, 0.08)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = C.charcoalLight;
              (e.currentTarget as HTMLButtonElement).style.background = "transparent";
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.75} stroke="currentColor" style={{ width: "0.85rem", height: "0.85rem", flexShrink: 0 }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
            </svg>
            <span className="hidden sm:inline">ログアウト</span>
          </button>
        </div>
      )}
      </div>
    </header>
  );
}

// ---------- App ----------
function App() {
  const [activeModule, setActiveModule] = useState<Module>("dashboard");
  const [tasksTab, setTasksTab] = useState<string>("default");
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [isSystemMaintenanceOpen, setIsSystemMaintenanceOpen] = useState(false);
  const [isThemeModalOpen, setIsThemeModalOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" ? window.innerWidth < 640 : false);
  const [isRecipeDetailActive, setIsRecipeDetailActive] = useState(false);

  // 画面幅監視
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 640);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // ─── Googleアカウント一括自動同期（Calendar & Tasks） ───
  const { requestAccessToken } = useGoogleAuth();
  const [googleSyncStatus, setGoogleSyncStatus] = useState<GoogleSyncStatus>("idle");
  const hasAutoSyncedRef = useRef(false);

  // 手動同期ハンドラ（ユーザーが明示的に押した場合はフラグに関係なく実行可能）
  const handleManualGoogleSync = useCallback(async () => {
    let token = getSavedToken();
    if (!token) {
      try {
        token = await requestAccessToken(false);
      } catch (e) {
        console.warn("[App] Manual sync token refresh failed:", e);
      }
    }
    if (!token) {
      console.warn("[App] Google sync skipped: no valid token found.");
      setGoogleSyncStatus("error");
      setTimeout(() => setGoogleSyncStatus("idle"), 3000);
      return;
    }

    setGoogleSyncStatus("syncing");
    try {
      await syncAllGoogleData(token);
      setGoogleSyncStatus("done");
      setTimeout(() => {
        setGoogleSyncStatus("idle");
      }, 3000);
    } catch (err) {
      console.warn("[App] Manual Google sync error:", err);
      setGoogleSyncStatus("error");
      setTimeout(() => {
        setGoogleSyncStatus("idle");
      }, 4000);
    }
  }, [requestAccessToken]);

  // ─── ページアクセス時・リロード時のGoogleデータ完全自動一括同期 ───
  useEffect(() => {
    if (hasAutoSyncedRef.current) return;

    let isMounted = true;
    let retryCount = 0;
    const maxRetries = 2;

    const tryAutoSync = async () => {
      let token = getSavedToken();
      if (!token) {
        // 保存トークンなし、または1時間経過で失効している場合、GISでサイレント再取得を試行
        try {
          token = await requestAccessToken(false);
        } catch (e) {
          console.warn("[App] Silent token refresh skipped or pending:", e);
        }
      }

      if (token) {
        hasAutoSyncedRef.current = true;
        setGoogleSyncStatus("syncing");

        try {
          await syncAllGoogleData(token);
          if (!isMounted) return;
          setGoogleSyncStatus("done");
          setTimeout(() => {
            if (isMounted) setGoogleSyncStatus("idle");
          }, 3000);
        } catch (err) {
          console.warn("[App] Auto Google sync error:", err);
          if (!isMounted) return;
          setGoogleSyncStatus("error");
          setTimeout(() => {
            if (isMounted) setGoogleSyncStatus("idle");
          }, 4000);
        }
      } else if (retryCount < maxRetries) {
        retryCount++;
        // GISスクリプト初期化待機等を考慮して500ms毎に最大2回まで再試行
        setTimeout(tryAutoSync, 500);
      }
    };

    tryAutoSync();

    return () => {
      isMounted = false;
    };
  }, [requestAccessToken]);

  const handleNavigate = useCallback((module: Module, tab: string = "default") => {
    if (module !== "notes") {
      setSelectedNoteId(null);
    }
    if (module !== "recipes") {
      setIsRecipeDetailActive(false);
      setSelectedRecipeId(null);
    }
    if (module === "tasks") {
      setTasksTab(tab || "default");
    }
    setActiveModule(module);
  }, []);

  // ダッシュボードのレシピカードからレシピ詳細に直接遷移
  const handleSelectRecipe = useCallback((recipeId: string) => {
    setSelectedRecipeId(recipeId);
    setActiveModule("recipes");
  }, []);

  const handleSelectNote = useCallback((noteId: string) => {
    setSelectedNoteId(noteId);
    setActiveModule("notes");
  }, []);

  const handleClearSelectedNote = useCallback(() => {
    setSelectedNoteId(null);
  }, []);

  const isRecipeDetailMobile = isMobile && activeModule === "recipes" && isRecipeDetailActive;
  const headerHeight = isMobile ? "94px" : "52px";

  return (
    <div style={{ minHeight: "100vh", position: "relative" }}>
      {/* ナビゲーションバー (モバイルのレシピ詳細画面では非表示) */}
      {!isRecipeDetailMobile && (
        <NavBar
          active={activeModule}
          onChange={(m) => handleNavigate(m, "tasks")}
          onOpenMaintenance={() => setIsSystemMaintenanceOpen(true)}
          onOpenTheme={() => setIsThemeModalOpen(true)}
          googleSyncStatus={googleSyncStatus}
          onManualSync={handleManualGoogleSync}
        />
      )}

      {/* メインコンテンツ領域（ナビバー分の余白 & セーフエリア） */}
      <main
        style={{
          paddingTop: isRecipeDetailMobile
            ? "0px"
            : `calc(${headerHeight} + env(safe-area-inset-top, 0px))`,
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          minHeight: isRecipeDetailMobile
            ? "100vh"
            : `calc(100vh - ${headerHeight} - env(safe-area-inset-top, 0px))`,
          width: "100%",
          transition: "padding-top 0.2s ease",
        }}
      >
        <div
          key={activeModule}
          style={{
            animation: "arca-module-in 0.24s cubic-bezier(0.16, 1, 0.3, 1)",
            width: "100%",
          }}
        >
          {activeModule === "dashboard" && (
            <Dashboard
              onNavigate={(m) => {
                if (m === "lists") {
                  handleNavigate("tasks", "lists");
                } else {
                  handleNavigate(m as Module, "tasks");
                }
              }}
              onSelectNote={handleSelectNote}
              onSelectRecipe={handleSelectRecipe}
            />
          )}
          {activeModule === "tasks" && <Tasks initialTab={tasksTab} />}
          {activeModule === "calendar" && <Calendar />}
          {activeModule === "notes" && (
            <Notes
              initialNoteId={selectedNoteId}
              onClearSelectedNote={handleClearSelectedNote}
            />
          )}
          {activeModule === "recipes" && (
            <Recipes
              onNavigateToLists={() => handleNavigate("tasks", "lists")}
              onDetailViewChange={setIsRecipeDetailActive}
              initialRecipeId={selectedRecipeId}
            />
          )}
          {activeModule === "finance" && <Finance />}
        </div>
      </main>

      {/* システム保守・診断コンソール（Arca Inspector & Logging） */}
      <SystemMaintenanceModal
        isOpen={isSystemMaintenanceOpen}
        onClose={() => setIsSystemMaintenanceOpen(false)}
      />

      {/* 外観 ＆ テーマ設定モーダル */}
      <ThemeModal
        isOpen={isThemeModalOpen}
        onClose={() => setIsThemeModalOpen(false)}
      />
    </div>
  );
}

export default App;
