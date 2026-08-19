/**
 * src/components/Dashboard.tsx
 * Arca — Dashboard / Bento Grid レイアウト (Apple HIG × Arca 準拠)
 *
 * 設計方針 (Core/Rules.md):
 *  - 道具としての静けさ、1画面に収まる美しい Bento Grid タイル
 *  - PC画面: 画面全体（100vh活用）の大型 2×2 グリッドで俯瞰、スクロール不要
 *  - 4大タイル: Calendar（予定）, Tasks（タスク）, Lists（買い物）, Notes（直近ノート）
 *  - 各タイル内部スクロール（overflow-y-auto）とモバイル縦スクロール対応
 */

import { useState, useEffect, useCallback } from "react";
import {
  collection,
  query,
  onSnapshot,
  orderBy,
  doc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import type { CalendarEvent, TaskItem, ListItem, NoteItem } from "../types";
import { C } from "../lib/designSystem";

// ---------- ユーティリティ ----------
function toDateStr(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function todayStr(): string {
  const t = new Date();
  return toDateStr(t.getFullYear(), t.getMonth(), t.getDate());
}

// ---------- アイコン ----------
function CheckCircle({ completed }: { completed: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth={1.75}
      style={{
        width: "1.15rem",
        height: "1.15rem",
        stroke: completed ? C.gold : C.charcoalXLight,
        transition: "stroke 0.25s ease, transform 0.15s ease",
        flexShrink: 0,
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

function ArrowRightIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor" style={{ width: "0.75rem", height: "0.75rem" }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
    </svg>
  );
}

// ---------- メインコンポーネント ----------
export default function Dashboard() {
  const today = todayStr();

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [lists, setLists] = useState<ListItem[]>([]);
  const [notes, setNotes] = useState<NoteItem[]>([]);

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

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, "notes"), orderBy("updatedAt", "desc")), (snap) => {
      setNotes(
        snap.docs.map((d) => ({
          id: d.id,
          title: d.data().title || "無題のノート",
          content: d.data().content || "",
          tags: d.data().tags || [],
          createdAt: d.data().createdAt?.toDate ? d.data().createdAt.toDate().toISOString() : new Date().toISOString(),
          updatedAt: d.data().updatedAt?.toDate ? d.data().updatedAt.toDate().toISOString() : new Date().toISOString(),
        }))
      );
    });
    return unsub;
  }, []);

  // フィルタリング
  const todayEvents = events.filter((e) => e.date === today).sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));
  const todayTasks = tasks.filter((t) => !t.completed && (t.dueDate === today || !t.dueDate));
  const activeLists = lists.filter((l) => !l.completed);
  const recentNotes = notes.slice(0, 6);

  // タスク完了トグル
  const toggleTask = useCallback(async (id: string, current: boolean) => {
    await updateDoc(doc(db, "tasks", id), { completed: !current });
  }, []);

  // 買い物完了トグル
  const toggleList = useCallback(async (id: string, current: boolean) => {
    await updateDoc(doc(db, "lists", id), { completed: !current });
  }, []);

  // 日付の和風フォーマット
  const displayDate = new Date().toLocaleDateString("ja-JP", {
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  return (
    <div
      className="w-full max-w-6xl mx-auto"
      style={{
        padding: "1.8rem 1.5rem 4rem",
        boxSizing: "border-box",
        minHeight: "calc(100vh - 4rem)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ─── 日付ヘッダー ─── */}
      <div style={{ marginBottom: "1.2rem", padding: "0 0.25rem", display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: "1.65rem", fontWeight: 750, color: C.charcoal, margin: 0, letterSpacing: "-0.03em" }}>
            ホーム
          </h1>
          <p style={{ fontSize: "0.78rem", color: C.charcoalLight, margin: "0.25rem 0 0", letterSpacing: "0.01em" }}>
            {displayDate}
          </p>
        </div>
      </div>

      {/* ─── Bento Grid メインレイアウト (PC: 2x2 等幅大型グリッド / Mobile: 1カラム) ─── */}
      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 460px), 1fr))",
          gap: "1.25rem",
          alignItems: "stretch",
        }}
      >
        {/* ─── タイルA: Calendar（今日の予定） ─── */}
        <div
          className="arca-card"
          style={{
            padding: "1.4rem 1.6rem 1.2rem",
            display: "flex",
            flexDirection: "column",
            minHeight: "310px",
            boxSizing: "border-box",
            borderRadius: "20px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.9rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
              <span style={{ fontSize: "0.85rem", fontWeight: 700, color: C.charcoal, letterSpacing: "0.02em" }}>
                今日の予定
              </span>
              <span style={{ fontSize: "0.74rem", color: C.charcoalLight }}>
                ({todayEvents.length})
              </span>
            </div>
            <a
              href="#calendar"
              onClick={(e) => {
                e.preventDefault();
                window.location.hash = "calendar";
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.25rem",
                fontSize: "0.74rem",
                color: C.goldDark,
                textDecoration: "none",
                fontWeight: 550,
              }}
            >
              <span>カレンダー</span>
              <ArrowRightIcon />
            </a>
          </div>

          {/* 内部スクロール */}
          <div style={{ flex: 1, overflowY: "auto", paddingRight: "0.25rem" }}>
            {todayEvents.length === 0 ? (
              <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <p style={{ margin: 0, fontSize: "0.85rem", color: C.charcoalLight }}>
                  今日の予定はありません
                </p>
              </div>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                {todayEvents.map((e) => (
                  <li
                    key={e.id}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "0.85rem",
                      padding: "0.45rem 0",
                      borderBottom: "1px solid rgba(0, 0, 0, 0.03)",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "0.78rem",
                        color: C.gold,
                        fontWeight: 650,
                        fontFamily: "-apple-system, monospace",
                        flexShrink: 0,
                        width: "3.4rem",
                      }}
                    >
                      {e.startTime || "--:--"}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: "0.88rem", color: C.charcoal, fontWeight: 450 }}>
                        {e.title}
                      </p>
                      {e.note && (
                        <p style={{ margin: "0.15rem 0 0", fontSize: "0.74rem", color: C.charcoalLight }}>
                          {e.note}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* ─── タイルB: Tasks（今日のタスク ＆ 優先タスク） ─── */}
        <div
          className="arca-card"
          style={{
            padding: "1.4rem 1.6rem 1.2rem",
            display: "flex",
            flexDirection: "column",
            minHeight: "310px",
            boxSizing: "border-box",
            borderRadius: "20px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.9rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
              <span style={{ fontSize: "0.85rem", fontWeight: 700, color: C.charcoal, letterSpacing: "0.02em" }}>
                今日のタスク
              </span>
              <span style={{ fontSize: "0.74rem", color: C.charcoalLight }}>
                ({todayTasks.length})
              </span>
            </div>
            <a
              href="#tasks"
              onClick={(e) => {
                e.preventDefault();
                window.location.hash = "tasks";
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.25rem",
                fontSize: "0.74rem",
                color: C.goldDark,
                textDecoration: "none",
                fontWeight: 550,
              }}
            >
              <span>タスク一覧</span>
              <ArrowRightIcon />
            </a>
          </div>

          {/* 内部スクロール */}
          <div style={{ flex: 1, overflowY: "auto", paddingRight: "0.25rem" }}>
            {todayTasks.length === 0 ? (
              <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <p style={{ margin: 0, fontSize: "0.85rem", color: C.charcoalLight }}>
                  残っているタスクはありません
                </p>
              </div>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {todayTasks.map((t) => (
                  <li
                    key={t.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                      padding: "0.45rem 0",
                      borderBottom: "1px solid rgba(0, 0, 0, 0.03)",
                    }}
                  >
                    <button
                      onClick={() => toggleTask(t.id, t.completed)}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 0 }}
                      title={t.completed ? "未完了に戻す" : "完了にする"}
                    >
                      <CheckCircle completed={t.completed} />
                    </button>
                    <span
                      style={{
                        flex: 1,
                        fontSize: "0.88rem",
                        color: t.completed ? C.charcoalLight : C.charcoal,
                        textDecoration: t.completed ? "line-through" : "none",
                        lineHeight: 1.35,
                      }}
                    >
                      {t.title}
                    </span>
                    {t.priority === "high" && (
                      <span
                        style={{
                          fontSize: "0.68rem",
                          fontWeight: 600,
                          color: C.danger,
                          background: "rgba(224, 86, 74, 0.08)",
                          padding: "0.15rem 0.45rem",
                          borderRadius: "4px",
                          flexShrink: 0,
                        }}
                      >
                        高
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* ─── タイルC: Lists（買い物リスト） ─── */}
        <div
          className="arca-card"
          style={{
            padding: "1.4rem 1.6rem 1.2rem",
            display: "flex",
            flexDirection: "column",
            minHeight: "310px",
            boxSizing: "border-box",
            borderRadius: "20px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.9rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
              <span style={{ fontSize: "0.85rem", fontWeight: 700, color: C.charcoal, letterSpacing: "0.02em" }}>
                買い物リスト
              </span>
              <span style={{ fontSize: "0.74rem", color: C.charcoalLight }}>
                ({activeLists.length})
              </span>
            </div>
            <a
              href="#lists"
              onClick={(e) => {
                e.preventDefault();
                window.location.hash = "lists";
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.25rem",
                fontSize: "0.74rem",
                color: C.goldDark,
                textDecoration: "none",
                fontWeight: 550,
              }}
            >
              <span>リストを開く</span>
              <ArrowRightIcon />
            </a>
          </div>

          {/* 内部スクロール */}
          <div style={{ flex: 1, overflowY: "auto", paddingRight: "0.25rem" }}>
            {activeLists.length === 0 ? (
              <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <p style={{ margin: 0, fontSize: "0.85rem", color: C.charcoalLight }}>
                  未購入アイテムはありません
                </p>
              </div>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {activeLists.map((item) => (
                  <li
                    key={item.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                      padding: "0.45rem 0",
                      borderBottom: "1px solid rgba(0, 0, 0, 0.03)",
                    }}
                  >
                    <button
                      onClick={() => toggleList(item.id, item.completed)}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 0 }}
                      title={item.completed ? "未購入に戻す" : "購入済みにする"}
                    >
                      <CheckCircle completed={item.completed} />
                    </button>
                    <span style={{ flex: 1, fontSize: "0.88rem", color: C.charcoal }}>
                      {item.text}
                    </span>
                    {item.category && (
                      <span
                        style={{
                          fontSize: "0.68rem",
                          color: C.charcoalLight,
                          background: "rgba(0, 0, 0, 0.04)",
                          padding: "0.15rem 0.5rem",
                          borderRadius: "6px",
                          flexShrink: 0,
                        }}
                      >
                        {item.category}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* ─── タイルD: Notes（直近のノート） ─── */}
        <div
          className="arca-card"
          style={{
            padding: "1.4rem 1.6rem 1.2rem",
            display: "flex",
            flexDirection: "column",
            minHeight: "310px",
            boxSizing: "border-box",
            borderRadius: "20px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.9rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
              <span style={{ fontSize: "0.85rem", fontWeight: 700, color: C.charcoal, letterSpacing: "0.02em" }}>
                最近のノート
              </span>
              <span style={{ fontSize: "0.74rem", color: C.charcoalLight }}>
                ({notes.length})
              </span>
            </div>
            <a
              href="#notes"
              onClick={(e) => {
                e.preventDefault();
                window.location.hash = "notes";
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.25rem",
                fontSize: "0.74rem",
                color: C.goldDark,
                textDecoration: "none",
                fontWeight: 550,
              }}
            >
              <span>ノートを開く</span>
              <ArrowRightIcon />
            </a>
          </div>

          {/* 内部スクロール */}
          <div style={{ flex: 1, overflowY: "auto", paddingRight: "0.25rem" }}>
            {recentNotes.length === 0 ? (
              <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <p style={{ margin: 0, fontSize: "0.85rem", color: C.charcoalLight }}>
                  ノートはまだありません
                </p>
              </div>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.45rem" }}>
                {recentNotes.map((note) => (
                  <li
                    key={note.id}
                    onClick={() => {
                      window.location.hash = `notes?id=${note.id}`;
                    }}
                    style={{
                      padding: "0.55rem 0.65rem",
                      borderRadius: "10px",
                      background: "rgba(0, 0, 0, 0.015)",
                      cursor: "pointer",
                      transition: "background 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLLIElement).style.background = "rgba(0, 0, 0, 0.04)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLLIElement).style.background = "rgba(0, 0, 0, 0.015)";
                    }}
                  >
                    <p style={{ margin: 0, fontSize: "0.86rem", fontWeight: 600, color: C.charcoal, letterSpacing: "0.01em" }}>
                      {note.title}
                    </p>
                    {note.content && (
                      <p
                        style={{
                          margin: "0.2rem 0 0",
                          fontSize: "0.74rem",
                          color: C.charcoalLight,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {note.content.slice(0, 60)}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
