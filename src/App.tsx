/**
 * src/App.tsx
 * Arca — Apple HIG準拠の共通レイアウト & スライディングナビゲーション
 */

import { useState, useRef, useEffect, useCallback } from "react";
import Lists from "./components/Lists";
import Tasks from "./components/Tasks";
import Calendar from "./components/Calendar";
import Dashboard from "./components/Dashboard";
import Notes from "./components/Notes";
import BackupModal from "./components/BackupModal";
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
type Module = "dashboard" | "tasks" | "lists" | "calendar" | "notes";

const NAV_ITEMS: { id: Module; label: string; sub: string }[] = [
  { id: "dashboard", label: "Home", sub: "ホーム" },
  { id: "tasks", label: "Tasks", sub: "タスク" },
  { id: "lists", label: "Lists", sub: "買い物" },
  { id: "calendar", label: "Calendar", sub: "カレンダー" },
  { id: "notes", label: "Notes", sub: "記録" },
];

// ---------- ナビゲーションバー ----------
function NavBar({
  active,
  onChange,
  onOpenBackup,
}: {
  active: Module;
  onChange: (m: Module) => void;
  onOpenBackup?: () => void;
}) {
  const { isOnline } = useNetworkStatus();
  const navTrackRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Map<Module, HTMLButtonElement>>(new Map());

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

    // フォント読み込み完了時やレンダリング安定後に再測定
    const raf = requestAnimationFrame(updateIndicator);
    const timer = setTimeout(updateIndicator, 50);

    const handleResize = () => updateIndicator();
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      window.removeEventListener("resize", handleResize);
    };
  }, [updateIndicator]);

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
        background: "rgba(253, 252, 250, 0.85)",
        backdropFilter: "blur(20px) saturate(180%)",
        WebkitBackdropFilter: "blur(20px) saturate(180%)",
        boxShadow: "0 1px 0 rgba(0, 0, 0, 0.04)",
        height: "calc(52px + env(safe-area-inset-top, 0px))",
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingLeft: "calc(1.25rem + env(safe-area-inset-left, 0px))",
        paddingRight: "calc(1.25rem + env(safe-area-inset-right, 0px))",
        paddingBottom: "0",
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      {/* ─── ロゴ（左端固定・フレックスで被りを防止） ─── */}
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

      {/* ─── スライディングピル型モジュールタブバー ─── */}
      <nav
        ref={navTrackRef}
        className="no-scrollbar"
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          background: "rgba(0, 0, 0, 0.04)",
          padding: "3px",
          borderRadius: "9999px",
          gap: "2px",
          overflowX: "auto",
          flexShrink: 1,
          maxWidth: "calc(100vw - 90px)",
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
            background: C.white,
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
                padding: "0.38rem 0.95rem",
                cursor: "pointer",
                fontSize: "0.78rem",
                fontWeight: isActive ? 600 : 450,
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

      {/* ─── 右端コントロール（データ保護 & ネットワーク状態 & ログアウト） ─── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "0.45rem", flexShrink: 0, minWidth: "24px" }}>
        <NetworkStatusBadge isOnline={isOnline} />

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
    </header>
  );
}

// ---------- App ----------
function App() {
  const [activeModule, setActiveModule] = useState<Module>("dashboard");
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);

  const handleNavigate = useCallback((module: Module) => {
    if (module !== "notes") {
      setSelectedNoteId(null);
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

  return (
    <div style={{ minHeight: "100vh", position: "relative" }}>
      {/* ナビゲーションバー */}
      <NavBar
        active={activeModule}
        onChange={handleNavigate}
        onOpenBackup={() => setIsBackupModalOpen(true)}
      />

      {/* メインコンテンツ領域（ナビバー分の余白 & セーフエリア） */}
      <main
        style={{
          paddingTop: "calc(3.5rem + env(safe-area-inset-top, 0px))",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          minHeight: "calc(100vh - 3.5rem - env(safe-area-inset-top, 0px))",
          width: "100%",
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
              onNavigate={handleNavigate}
              onSelectNote={handleSelectNote}
            />
          )}
          {activeModule === "tasks" && <Tasks />}
          {activeModule === "lists" && <Lists />}
          {activeModule === "calendar" && <Calendar />}
          {activeModule === "notes" && (
            <Notes
              initialNoteId={selectedNoteId}
              onClearSelectedNote={handleClearSelectedNote}
            />
          )}
        </div>
      </main>

      {/* データ保護 ＆ バックアップモーダル */}
      <BackupModal
        isOpen={isBackupModalOpen}
        onClose={() => setIsBackupModalOpen(false)}
      />
    </div>
  );
}

export default App;
