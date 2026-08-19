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
import { C } from "./lib/designSystem";

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
}: {
  active: Module;
  onChange: (m: Module) => void;
}) {
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
        height: "52px",
        padding: "0 1.25rem",
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
          gap: "0.4rem",
          cursor: "pointer",
          userSelect: "none",
          flexShrink: 0,
          paddingRight: "0.75rem",
        }}
      >
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

      {/* ─── デスクトップ用バランススペーサー（ロゴと同幅で中央揃えを維持） ─── */}
      <div
        className="arca-nav-desktop-spacer"
        style={{
          width: "48px",
          flexShrink: 0,
          pointerEvents: "none",
        }}
      />
    </header>
  );
}

// ---------- App ----------
function App() {
  const [activeModule, setActiveModule] = useState<Module>("dashboard");

  return (
    <div style={{ minHeight: "100vh", position: "relative" }}>
      {/* ナビゲーションバー */}
      <NavBar active={activeModule} onChange={setActiveModule} />

      {/* メインコンテンツ領域（ナビバー分の余白） */}
      <main
        style={{
          paddingTop: "3.5rem",
          minHeight: "calc(100vh - 3.5rem)",
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
          {activeModule === "dashboard" && <Dashboard />}
          {activeModule === "tasks" && <Tasks />}
          {activeModule === "lists" && <Lists />}
          {activeModule === "calendar" && <Calendar />}
          {activeModule === "notes" && <Notes />}
        </div>
      </main>
    </div>
  );
}

export default App;
