import { useState, useEffect, useCallback } from "react";
import { collection, query, onSnapshot, orderBy, doc, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import type { CalendarEvent, TaskItem, ListItem } from "../types";
import { generateBriefing } from "../lib/aetherCore";

// ---------- Utils ----------
function toDateStr(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function todayStr(): string {
  const t = new Date();
  return toDateStr(t.getFullYear(), t.getMonth(), t.getDate());
}

// ---------- Icons ----------
function CheckCircle({ completed }: { completed: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth={1.5}
      style={{
        width: "1.2rem",
        height: "1.2rem",
        stroke: completed ? "var(--color-accent)" : "#C8C8C0",
        transition: "stroke 0.3s",
      }}
    >
      {completed ? (
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      ) : (
        <circle cx="12" cy="12" r="9" />
      )}
    </svg>
  );
}

function SparklesIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor" style={{ width: "1rem", height: "1rem" }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09l2.846.813-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
    </svg>
  );
}

// ---------- Component ----------
export default function Dashboard() {
  const today = todayStr();

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [lists, setLists] = useState<ListItem[]>([]);

  // Firestore 購読
  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, "events"), orderBy("createdAt", "asc")), (snap) => {
      setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() } as CalendarEvent)));
    });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, "tasks"), orderBy("createdAt", "asc")), (snap) => {
      setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() } as TaskItem)));
    });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, "lists"), orderBy("createdAt", "asc")), (snap) => {
      setLists(snap.docs.map(d => ({ id: d.id, ...d.data() } as ListItem)));
    });
    return unsub;
  }, []);

  // フィルタリング
  const todayEvents = events.filter(e => e.date === today).sort((a, b) => a.startTime.localeCompare(b.startTime));
  const todayTasks = tasks.filter(t => !t.completed && (t.dueDate === today || !t.dueDate));
  const quickShopping = lists.filter(l => !l.completed).slice(0, 5);

  const briefing = generateBriefing(todayEvents, todayTasks, quickShopping);

  // タスク完了トグル
  const toggleTask = useCallback(async (id: string, current: boolean) => {
    await updateDoc(doc(db, "tasks", id), { completed: !current });
  }, []);

  // 買い物完了トグル
  const toggleList = useCallback(async (id: string, current: boolean) => {
    await updateDoc(doc(db, "lists", id), { completed: !current });
  }, []);

  // 日付の和風フォーマット
  const displayDate = new Date().toLocaleDateString("ja-JP", { month: "long", day: "numeric", weekday: "short" });

  return (
    <div className="w-full max-w-2xl mx-auto" style={{ padding: "2rem 1.5rem 5rem" }}>
      
      {/* ─── Aether Briefing ─── */}
      <div style={{
        marginBottom: "3.5rem",
        padding: "1.5rem",
        background: "rgba(197, 160, 89, 0.04)",
        borderRadius: "16px",
        boxShadow: "0 4px 30px rgba(197, 160, 89, 0.08)",
        backdropFilter: "blur(10px)",
        animation: "arca-module-in 0.3s ease",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--color-accent)", marginBottom: "0.5rem" }}>
          <SparklesIcon />
          <span style={{ fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.2em", textTransform: "uppercase" }}>
            Aether Briefing
          </span>
        </div>
        <p style={{
          fontSize: "0.95rem",
          fontWeight: 400,
          color: "var(--color-text)",
          lineHeight: 1.6,
          letterSpacing: "0.03em",
          margin: 0,
        }}>
          {briefing}
        </p>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr",
        gap: "2.5rem",
      }}>
        
        {/* ─── Today's Schedule ─── */}
        <section>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "1rem" }}>
            <h2 style={{ fontSize: "1.2rem", fontWeight: 300, color: "var(--color-text)", margin: 0, letterSpacing: "0.02em" }}>
              Today's Schedule
            </h2>
            <span style={{ fontSize: "0.75rem", color: "#A0A09A", letterSpacing: "0.05em" }}>
              {displayDate}
            </span>
          </div>
          <div style={{
            background: "rgba(255, 255, 255, 0.6)",
            borderRadius: "16px",
            padding: "1.25rem",
            boxShadow: "0 2px 20px rgba(0,0,0,0.055)",
            backdropFilter: "blur(8px)",
          }}>
            {todayEvents.length === 0 ? (
              <p style={{ margin: 0, fontSize: "0.8rem", color: "#B0AFA8", textAlign: "center", padding: "1rem 0" }}>
                今日の予定はありません
              </p>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {todayEvents.map((e) => (
                  <li key={e.id} style={{ display: "flex", gap: "1rem", padding: "0.5rem 0", borderBottom: "1px solid rgba(0,0,0,0.03)" }}>
                    <div style={{ width: "4rem", flexShrink: 0, fontSize: "0.75rem", color: "var(--color-accent)", fontWeight: 500, fontFamily: "monospace", paddingTop: "0.1rem" }}>
                      {e.startTime || "--:--"}
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--color-text)" }}>{e.title}</p>
                      {e.note && <p style={{ margin: "0.25rem 0 0", fontSize: "0.7rem", color: "#A0A09A" }}>{e.note}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* ─── Today's Tasks ─── */}
        <section>
          <h2 style={{ fontSize: "1.2rem", fontWeight: 300, color: "var(--color-text)", margin: "0 0 1rem 0", letterSpacing: "0.02em" }}>
            Today's Tasks
          </h2>
          <div style={{
            background: "rgba(255, 255, 255, 0.6)",
            borderRadius: "16px",
            padding: "1.25rem",
            boxShadow: "0 2px 20px rgba(0,0,0,0.055)",
            backdropFilter: "blur(8px)",
          }}>
            {todayTasks.length === 0 ? (
              <p style={{ margin: 0, fontSize: "0.8rem", color: "#B0AFA8", textAlign: "center", padding: "1rem 0" }}>
                残っているタスクはありません
              </p>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                {todayTasks.map((t) => (
                  <li key={t.id} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.5rem 0" }}>
                    <button onClick={() => toggleTask(t.id, t.completed)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                      <CheckCircle completed={t.completed} />
                    </button>
                    <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--color-text)" }}>{t.title}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* ─── Quick Shopping ─── */}
        <section>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "1rem" }}>
            <h2 style={{ fontSize: "1.2rem", fontWeight: 300, color: "var(--color-text)", margin: 0, letterSpacing: "0.02em" }}>
              Quick Shopping
            </h2>
            <span style={{ fontSize: "0.75rem", color: "#A0A09A", letterSpacing: "0.05em" }}>上位5件</span>
          </div>
          <div style={{
            background: "rgba(255, 255, 255, 0.6)",
            borderRadius: "16px",
            padding: "1.25rem",
            boxShadow: "0 2px 20px rgba(0,0,0,0.055)",
            backdropFilter: "blur(8px)",
          }}>
            {quickShopping.length === 0 ? (
              <p style={{ margin: 0, fontSize: "0.8rem", color: "#B0AFA8", textAlign: "center", padding: "1rem 0" }}>
                買うものはありません
              </p>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                {quickShopping.map((l) => (
                  <li key={l.id} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.5rem 0" }}>
                    <button onClick={() => toggleList(l.id, l.completed)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                      <CheckCircle completed={l.completed} />
                    </button>
                    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--color-text)" }}>{l.text}</p>
                      {l.category && (
                        <span style={{ fontSize: "0.65rem", color: "#A0A09A", background: "rgba(0,0,0,0.03)", padding: "0.1rem 0.4rem", borderRadius: "4px" }}>
                          {l.category}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

      </div>
    </div>
  );
}
