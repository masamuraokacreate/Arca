/**
 * src/components/Dashboard.tsx
 * Arca — Dashboard (Apple HIG × Arca 準拠)
 */

import { useState, useEffect, useCallback } from "react";
import { collection, query, onSnapshot, orderBy, doc, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import type { CalendarEvent, TaskItem, ListItem } from "../types";
import { generateBriefing } from "../lib/aetherCore";
import { C } from "../lib/designSystem";

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
      strokeWidth={1.75}
      style={{
        width: "1.25rem",
        height: "1.25rem",
        stroke: completed ? C.gold : C.charcoalXLight,
        transition: "stroke 0.25s ease, transform 0.15s ease",
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
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.75} stroke="currentColor" style={{ width: "1.05rem", height: "1.05rem" }}>
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

  // Firestore リアルタイム同期
  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, "events"), orderBy("createdAt", "asc")), (snap) => {
      setEvents(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CalendarEvent)));
    });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, "tasks"), orderBy("createdAt", "asc")), (snap) => {
      setTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() } as TaskItem)));
    });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, "lists"), orderBy("createdAt", "asc")), (snap) => {
      setLists(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ListItem)));
    });
    return unsub;
  }, []);

  // フィルタリング
  const todayEvents = events.filter((e) => e.date === today).sort((a, b) => a.startTime.localeCompare(b.startTime));
  const todayTasks = tasks.filter((t) => !t.completed && (t.dueDate === today || !t.dueDate));
  const quickShopping = lists.filter((l) => !l.completed).slice(0, 5);

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
    <div className="w-full max-w-2xl mx-auto" style={{ padding: "2.8rem 1.5rem 6rem", boxSizing: "border-box" }}>
      
      {/* ─── Aether Briefing ─── */}
      <div
        className="arca-briefing-card"
        style={{
          marginBottom: "3.2rem",
          padding: "1.6rem 1.8rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", color: C.gold, marginBottom: "0.65rem" }}>
          <SparklesIcon />
          <span style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase" }}>
            Aether Briefing
          </span>
        </div>
        <p
          style={{
            fontSize: "0.95rem",
            fontWeight: 400,
            color: C.charcoal,
            lineHeight: 1.7,
            letterSpacing: "0.02em",
            margin: 0,
          }}
        >
          {briefing}
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "2.8rem" }}>
        
        {/* ─── Today's Schedule ─── */}
        <section>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "0.85rem", padding: "0 0.25rem" }}>
            <h2 style={{ fontSize: "1.15rem", fontWeight: 600, color: C.charcoal, margin: 0, letterSpacing: "-0.015em" }}>
              今日の予定
            </h2>
            <span style={{ fontSize: "0.75rem", color: C.charcoalLight, letterSpacing: "0.02em" }}>
              {displayDate}
            </span>
          </div>

          <div
            className="arca-card"
            style={{
              padding: "1.25rem 1.5rem",
            }}
          >
            {todayEvents.length === 0 ? (
              <p style={{ margin: 0, fontSize: "0.82rem", color: C.charcoalLight, textAlign: "center", padding: "1.2rem 0" }}>
                今日の予定はありません
              </p>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {todayEvents.map((e) => (
                  <li
                    key={e.id}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "1.1rem",
                      padding: "0.65rem 0",
                    }}
                  >
                    <div
                      style={{
                        width: "3.8rem",
                        flexShrink: 0,
                        fontSize: "0.78rem",
                        color: C.gold,
                        fontWeight: 600,
                        fontFamily: "-apple-system, monospace",
                        paddingTop: "0.1rem",
                        letterSpacing: "0.02em",
                      }}
                    >
                      {e.startTime || "--:--"}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: "0.875rem", color: C.charcoal, fontWeight: 450, lineHeight: 1.4 }}>
                        {e.title}
                      </p>
                      {e.note && (
                        <p style={{ margin: "0.2rem 0 0", fontSize: "0.72rem", color: C.charcoalLight, lineHeight: 1.4 }}>
                          {e.note}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* ─── Today's Tasks ─── */}
        <section>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "0.85rem", padding: "0 0.25rem" }}>
            <h2 style={{ fontSize: "1.15rem", fontWeight: 600, color: C.charcoal, margin: 0, letterSpacing: "-0.015em" }}>
              今日のタスク
            </h2>
            <span style={{ fontSize: "0.75rem", color: C.charcoalLight, letterSpacing: "0.02em" }}>
              {todayTasks.length}件
            </span>
          </div>

          <div
            className="arca-card"
            style={{
              padding: "1.25rem 1.5rem",
            }}
          >
            {todayTasks.length === 0 ? (
              <p style={{ margin: 0, fontSize: "0.82rem", color: C.charcoalLight, textAlign: "center", padding: "1.2rem 0" }}>
                残っているタスクはありません
              </p>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                {todayTasks.map((t) => (
                  <li
                    key={t.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.85rem",
                      padding: "0.6rem 0",
                    }}
                  >
                    <button
                      onClick={() => toggleTask(t.id, t.completed)}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 0 }}
                      title={t.completed ? "未完了に戻す" : "完了にする"}
                    >
                      <CheckCircle completed={t.completed} />
                    </button>
                    <p
                      style={{
                        margin: 0,
                        fontSize: "0.875rem",
                        color: t.completed ? C.charcoalLight : C.charcoal,
                        textDecoration: t.completed ? "line-through" : "none",
                        fontWeight: 400,
                        flex: 1,
                      }}
                    >
                      {t.title}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* ─── Quick Shopping ─── */}
        <section>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "0.85rem", padding: "0 0.25rem" }}>
            <h2 style={{ fontSize: "1.15rem", fontWeight: 600, color: C.charcoal, margin: 0, letterSpacing: "-0.015em" }}>
              買い物リスト
            </h2>
            <span style={{ fontSize: "0.75rem", color: C.charcoalLight, letterSpacing: "0.02em" }}>
              上位5件
            </span>
          </div>

          <div
            className="arca-card"
            style={{
              padding: "1.25rem 1.5rem",
            }}
          >
            {quickShopping.length === 0 ? (
              <p style={{ margin: 0, fontSize: "0.82rem", color: C.charcoalLight, textAlign: "center", padding: "1.2rem 0" }}>
                買うものはありません
              </p>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                {quickShopping.map((l) => (
                  <li
                    key={l.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.85rem",
                      padding: "0.6rem 0",
                    }}
                  >
                    <button
                      onClick={() => toggleList(l.id, l.completed)}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 0 }}
                      title={l.completed ? "未完了に戻す" : "完了にする"}
                    >
                      <CheckCircle completed={l.completed} />
                    </button>
                    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <p
                        style={{
                          margin: 0,
                          fontSize: "0.875rem",
                          color: l.completed ? C.charcoalLight : C.charcoal,
                          textDecoration: l.completed ? "line-through" : "none",
                          fontWeight: 400,
                        }}
                      >
                        {l.text}
                      </p>
                      {l.category && (
                        <span
                          style={{
                            fontSize: "0.68rem",
                            color: C.charcoalLight,
                            background: "rgba(0, 0, 0, 0.04)",
                            padding: "0.15rem 0.55rem",
                            borderRadius: "6px",
                            fontWeight: 500,
                          }}
                        >
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
