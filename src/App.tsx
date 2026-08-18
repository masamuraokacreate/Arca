import { useState } from "react";
import Lists from "./components/Lists";
import Tasks from "./components/Tasks";
import Calendar from "./components/Calendar";

// ---------- ナビゲーション定義 ----------
type Module = "tasks" | "lists" | "calendar";

const NAV_ITEMS: { id: Module; label: string; sub: string }[] = [
  { id: "tasks",    label: "Tasks",    sub: "タスク" },
  { id: "lists",    label: "Lists",    sub: "買い物" },
  { id: "calendar", label: "Calendar", sub: "カレンダー" },
];

// ---------- ナビゲーションバー ----------
function NavBar({
  active,
  onChange,
}: {
  active: Module;
  onChange: (m: Module) => void;
}) {
  return (
    <nav
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        background: "rgba(245,245,240,0.82)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        boxShadow: "0 1px 0 rgba(0,0,0,0.05)",
        display: "flex",
        justifyContent: "center",
        gap: "0.25rem",
        padding: "0.6rem 1rem",
      }}
    >
      {/* ロゴ */}
      <span
        style={{
          position: "absolute",
          left: "1.5rem",
          top: "50%",
          transform: "translateY(-50%)",
          fontSize: "0.85rem",
          fontWeight: 500,
          letterSpacing: "0.15em",
          color: "var(--color-accent)",
          userSelect: "none",
        }}
      >
        Arca
      </span>

      {/* モジュールタブ */}
      {NAV_ITEMS.map(({ id, label }) => {
        const isActive = active === id;
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            style={{
              background: isActive ? "rgba(197,160,89,0.10)" : "transparent",
              border: "none",
              borderRadius: "8px",
              padding: "0.35rem 1rem",
              cursor: "pointer",
              fontSize: "0.78rem",
              fontWeight: isActive ? 500 : 400,
              letterSpacing: "0.05em",
              color: isActive ? "var(--color-accent)" : "#A0A09A",
              transition: "background 0.2s, color 0.2s",
            }}
            onMouseEnter={(e) => {
              if (!isActive)
                (e.currentTarget as HTMLButtonElement).style.color =
                  "var(--color-text)";
            }}
            onMouseLeave={(e) => {
              if (!isActive)
                (e.currentTarget as HTMLButtonElement).style.color = "#A0A09A";
            }}
          >
            {label}
          </button>
        );
      })}
    </nav>
  );
}

// ---------- App ----------
function App() {
  const [activeModule, setActiveModule] = useState<Module>("tasks");

  return (
    <>
      <NavBar active={activeModule} onChange={setActiveModule} />

      {/* ナビバー分の上余白 */}
      <div style={{ paddingTop: "3.5rem" }}>
        <div
          className="min-h-screen flex items-center justify-center"
          /* モジュール切替アニメーション */
          key={activeModule}
          style={{ animation: "arca-module-in 0.25s ease" }}
        >
          {activeModule === "tasks"    && <Tasks />}
          {activeModule === "lists"    && <Lists />}
          {activeModule === "calendar" && <Calendar />}
        </div>
      </div>

      {/* アニメーション定義 */}
      <style>{`
        @keyframes arca-module-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  );
}

export default App;
