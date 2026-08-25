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
import BackupModal from "./components/BackupModal";
import ThemeModal from "./components/ThemeModal";
import { C } from "./lib/designSystem";
import { useNetworkStatus } from "./hooks/useNetworkStatus";
import { logoutUser } from "./components/AuthGate";

// ---------- ネットワーク接続状態バッジ ----------
function NetworkStatusBadge({ isOnline }: { isOnline: boolean }) {
  if (isOnline) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.35rem",
          padding: "0.2rem 0.55rem",
          borderRadius: "9999px",
          background: "rgba(107, 142, 111, 0.12)",
          color: "#466B4A",
          fontSize: "0.68rem",
          fontWeight: 600,
          letterSpacing: "0.02em",
          userSelect: "none",
          transition: "all 0.2s ease",
          flexShrink: 0,
        }}
        title="クラウドとリアルタイム同期中"
      >
        <span
          style={{
            width: "5px",
            height: "5px",
            borderRadius: "50%",
            backgroundColor: "#5A8B5F",
            display: "inline-block",
          }}
        />
        <span className="hidden sm:inline">クラウド同期中</span>
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
  onOpenBackup,
  onOpenTheme,
}: {
  active: Module;
  onChange: (m: Module) => void;
  onOpenBackup?: () => void;
  onOpenTheme?: () => void;
}) {
  const { isOnline } = useNetworkStatus();
  const navTrackRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Map<Module, HTMLButtonElement>>(new Map());
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" ? window.innerWidth < 640 : false);

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
        background: "var(--bg-surface-glass)",
        backdropFilter: "blur(20px) saturate(180%)",
        WebkitBackdropFilter: "blur(20px) saturate(180%)",
        boxShadow: "0 1px 0 var(--border-subtle)",
        height: isMobile
          ? "calc(94px + env(safe-area-inset-top, 0px))"
          : "calc(52px + env(safe-area-inset-top, 0px))",
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingLeft: "calc(1rem + env(safe-area-inset-left, 0px))",
        paddingRight: "calc(1rem + env(safe-area-inset-right, 0px))",
        paddingBottom: isMobile ? "0.4rem" : "0",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        alignItems: isMobile ? "stretch" : "center",
        justifyContent: isMobile ? "space-between" : "space-between",
        transition: "height 0.2s ease",
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
        }}
      >
        {/* ロゴ */}
        <div
          onClick={() => onChange("dashboard")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            cursor: "pointer",
            userSelect: "none",
            flexShrink: 0,
            paddingRight: "0.75rem",
          }}
        >
          <img
            src="/Arca_logo.png"
            alt="Arca"
            style={{
              width: "24px",
              height: "24px",
              borderRadius: "6px",
              boxShadow: "0 1px 3px rgba(0, 0, 0, 0.08)",
              objectFit: "cover",
            }}
          />
          <span
            style={{
              fontSize: "0.95rem",
              fontWeight: 700,
              letterSpacing: "0.14em",
              color: C.gold,
            }}
          >
            Arca
          </span>
        </div>

        {/* モバイル表示時の右端コントロール */}
        {isMobile && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
            <NetworkStatusBadge isOnline={isOnline} />

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
              <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.75} stroke="currentColor" style={{ width: "0.88rem", height: "0.88rem" }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.098 19.902a3.75 3.75 0 0 0 5.304 0l6.401-6.402M6.75 21A3.75 3.75 0 0 1 3 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125v4.072M6.75 21a3.75 3.75 0 0 0 3.75-3.75V8.197M6.75 21h13.125c.621 0 1.125-.504 1.125-1.125v-5.25c0-.621-.504-1.125-1.125-1.125h-4.072M10.5 8.197l9.75 9.75" />
              </svg>
            </button>

            {/* データ保護 / バックアップ */}
            <button
              onClick={onOpenBackup}
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
              title="データ保護 / バックアップ"
            >
              <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.75} stroke="currentColor" style={{ width: "0.88rem", height: "0.88rem" }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
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

      {/* ─── スライディングピル型モジュールタブバー（PC: 中央 / モバイル: 2段目に広々配置） ─── */}
      <div
        style={{
          display: "flex",
          justifyContent: isMobile ? "center" : "center",
          width: isMobile ? "100%" : "auto",
          overflowX: "auto",
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
                  color: isActive ? C.charcoal : C.charcoalLight,
                  transition: "color 0.18s ease",
                  whiteSpace: "nowrap",
                  userSelect: "none",
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => {
                  if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = C.charcoal;
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "0.45rem", flexShrink: 0, minWidth: "24px" }}>
          <NetworkStatusBadge isOnline={isOnline} />

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
            <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.75} stroke="currentColor" style={{ width: "0.85rem", height: "0.85rem", flexShrink: 0 }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.098 19.902a3.75 3.75 0 0 0 5.304 0l6.401-6.402M6.75 21A3.75 3.75 0 0 1 3 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125v4.072M6.75 21a3.75 3.75 0 0 0 3.75-3.75V8.197M6.75 21h13.125c.621 0 1.125-.504 1.125-1.125v-5.25c0-.621-.504-1.125-1.125-1.125h-4.072M10.5 8.197l9.75 9.75" />
            </svg>
            <span className="hidden sm:inline">外観</span>
          </button>

          {/* データ保護 / バックアップモーダルボタン */}
          <button
            onClick={onOpenBackup}
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
            title="データ保護 / バックアップ"
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = C.goldDark;
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(197, 160, 89, 0.08)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = C.charcoalLight;
              (e.currentTarget as HTMLButtonElement).style.background = "transparent";
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.75} stroke="currentColor" style={{ width: "0.85rem", height: "0.85rem", flexShrink: 0 }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
            </svg>
            <span className="hidden sm:inline">保護</span>
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
    </header>
  );
}

// ---------- App ----------
function App() {
  const [activeModule, setActiveModule] = useState<Module>("dashboard");
  const [tasksTab, setTasksTab] = useState<"tasks" | "lists">("tasks");
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [isThemeModalOpen, setIsThemeModalOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" ? window.innerWidth < 640 : false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 640);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleNavigate = useCallback((module: Module, tab: "tasks" | "lists" = "tasks") => {
    if (module !== "notes") {
      setSelectedNoteId(null);
    }
    if (module === "tasks") {
      setTasksTab(tab);
    }
    setActiveModule(module);
  }, []);

  const handleSelectNote = useCallback((noteId: string) => {
    setSelectedNoteId(noteId);
    setActiveModule("notes");
  }, []);

  const handleClearSelectedNote = useCallback(() => {
    setSelectedNoteId(null);
  }, []);

  const headerHeight = isMobile ? "94px" : "52px";

  return (
    <div style={{ minHeight: "100vh", position: "relative" }}>
      {/* ナビゲーションバー */}
      <NavBar
        active={activeModule}
        onChange={(m) => handleNavigate(m, "tasks")}
        onOpenBackup={() => setIsBackupModalOpen(true)}
        onOpenTheme={() => setIsThemeModalOpen(true)}
      />

      {/* メインコンテンツ領域（ナビバー分の余白 & セーフエリア） */}
      <main
        style={{
          paddingTop: `calc(${headerHeight} + env(safe-area-inset-top, 0px))`,
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          minHeight: `calc(100vh - ${headerHeight} - env(safe-area-inset-top, 0px))`,
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
            <Recipes onNavigateToLists={() => handleNavigate("tasks", "lists")} />
          )}
          {activeModule === "finance" && <Finance />}
        </div>
      </main>

      {/* データ保護 ＆ バックアップモーダル */}
      <BackupModal
        isOpen={isBackupModalOpen}
        onClose={() => setIsBackupModalOpen(false)}
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
