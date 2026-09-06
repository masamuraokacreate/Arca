/**
 * src/components/notes/JournalTimeline.tsx
 * Arca — 統合型 Journal / Memory（ライフログ）タイムラインビュー
 *
 * 設計原則 (Core/Rules.md & Apple HIG):
 * - iPhone ジャーナルアプリのような静謐な月別区切りと縦ストリーム
 * - 絵文字を完全排除し、Lucide SVG アイコンで統一
 * - 枠線なし、多層シャドウ、角丸 (rounded-2xl)
 * - 「今日のジャーナルを書く」クイック生成
 */

import React, { useMemo, useState, useRef, useEffect } from "react";
import {
  PenLine,
  Calendar,
  CheckCircle2,
  Clock,
  MoreHorizontal,
  FolderInput,
  Download,
  Trash2,
} from "lucide-react";
import type { NoteItem } from "../../types";
import { C } from "../../lib/designSystem";
import { MoodBadge } from "./MoodPicker";

interface JournalTimelineProps {
  childNotes: NoteItem[];
  allNotes: NoteItem[];
  onSelectChildNote: (id: string) => void;
  onNewJournalNote: (targetDate: string) => void;
  onMoveChildNote?: (note: NoteItem) => void;
  onDeleteChildNote: (note: NoteItem) => void;
  onDownloadChildNote: (note: NoteItem) => void;
}

function getTodayString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getNoteDate(note: NoteItem): string {
  if (note.journalDate) return note.journalDate;
  if (note.createdAt) {
    return note.createdAt.split("T")[0] || "";
  }
  return "";
}

function formatJournalDateLabel(dateStr: string): string {
  if (!dateStr) return "日付未設定";
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return dateStr;
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const w = weekdays[d.getDay()];
  return `${m}月${day}日 (${w})`;
}

function getMonthGroupKey(dateStr: string): string {
  if (!dateStr) return "その他";
  const parts = dateStr.split("-");
  if (parts.length >= 2) {
    return `${parts[0]}年${parseInt(parts[1], 10)}月`;
  }
  return "その他";
}

function getFirstImageUrl(note: NoteItem): string | null {
  if (note.photos && note.photos.length > 0) {
    return note.photos[0];
  }
  if (note.attachments) {
    const fromAtt = Object.values(note.attachments).find(
      (src) =>
        src.startsWith("data:image") ||
        /\.(png|jpe?g|webp|gif|svg)($|\?)/i.test(src) ||
        src.includes("firebasestorage")
    );
    if (fromAtt) return fromAtt;
  }
  const match = note.content.match(/!\[.*?\]\((https?:\/\/[^\s)]+|data:image\/[^\s)]+)\)/);
  return match ? match[1] : null;
}

function getExcerpt(content: string, maxLen = 120): string {
  return content
    .replace(/^#+\s.+$/gm, "")
    .replace(/[*_`>[\]()#-]/g, "")
    .replace(/\n+/g, " ")
    .trim()
    .slice(0, maxLen);
}

/**
 * ジャーナルカードコンポーネント
 */
function JournalCard({
  note,
  onClick,
  onMove,
  onDelete,
  onDownload,
}: {
  note: NoteItem;
  onClick: () => void;
  onMove?: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  onDownload: (e: React.MouseEvent) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const dateStr = getNoteDate(note);
  const dateLabel = formatJournalDateLabel(dateStr);
  const imageUrl = getFirstImageUrl(note);
  const excerpt = getExcerpt(note.content, 120);

  const eventsCount = note.contextSnapshot?.events?.length || 0;
  const tasksCount = note.contextSnapshot?.completedTasks?.length || 0;

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  return (
    <div
      onClick={onClick}
      className="group relative cursor-pointer transition-all duration-200"
      style={{
        background: "var(--bg-card-solid)",
        borderRadius: "20px",
        boxShadow: C.cardShadow,
        zIndex: menuOpen ? 100 : 1,
        overflow: menuOpen ? "visible" : "hidden",
        border: "1px solid var(--border-subtle)",
      }}
      data-testid={`journal-card-${note.id}`}
    >
      {/* 添付写真サムネイル */}
      {imageUrl && (
        <div
          style={{
            width: "100%",
            height: "170px",
            overflow: "hidden",
            background: "rgba(0, 0, 0, 0.03)",
            position: "relative",
          }}
        >
          <img
            src={imageUrl}
            alt={note.title || dateLabel}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
            }}
            loading="lazy"
          />
        </div>
      )}

      <div style={{ padding: "1.25rem 1.4rem 1.15rem" }}>
        {/* ヘッダー: 日付 ＆ Mood ＆ メニュー */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <span
              className="text-sm font-semibold tracking-tight"
              style={{ color: C.charcoal }}
            >
              {dateLabel}
            </span>
            <MoodBadge mood={note.mood} />
          </div>

          {/* 「…」メニューボタン */}
          <div
            ref={menuRef}
            className="relative shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((o) => !o);
              }}
              aria-label="メニュー"
              className="appearance-none flex items-center justify-center cursor-pointer transition-colors"
              style={{
                background: menuOpen ? C.goldFaint2 : "transparent",
                border: "none",
                borderRadius: "8px",
                width: "32px",
                height: "32px",
                color: C.charcoalLight,
              }}
            >
              <MoreHorizontal size={16} />
            </button>

            {menuOpen && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 4px)",
                  right: 0,
                  background: "var(--bg-card-solid)",
                  borderRadius: "12px",
                  boxShadow: "var(--shadow-modal)",
                  padding: "0.35rem",
                  minWidth: "140px",
                  zIndex: 100,
                  border: "1px solid var(--border-subtle)",
                }}
              >
                {onMove && (
                  <button
                    type="button"
                    onClick={(e) => {
                      setMenuOpen(false);
                      onMove(e);
                    }}
                    className="appearance-none whitespace-nowrap flex items-center gap-2 w-full text-left cursor-pointer p-2 rounded-lg text-xs"
                    style={{ background: "transparent", border: "none", color: C.charcoal }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = C.goldFaint;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <FolderInput size={14} />
                    <span>移動</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    setMenuOpen(false);
                    onDownload(e);
                  }}
                  className="appearance-none whitespace-nowrap flex items-center gap-2 w-full text-left cursor-pointer p-2 rounded-lg text-xs"
                  style={{ background: "transparent", border: "none", color: C.charcoal }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = C.goldFaint;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  <Download size={14} />
                  <span>md 保存</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    setMenuOpen(false);
                    onDelete(e);
                  }}
                  className="appearance-none whitespace-nowrap flex items-center gap-2 w-full text-left cursor-pointer p-2 rounded-lg text-xs"
                  style={{ background: "transparent", border: "none", color: "#c0614a" }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(192,97,74,0.07)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  <Trash2 size={14} />
                  <span>削除</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* タイトル（あれば） */}
        {note.title && (
          <h4
            className="text-sm font-semibold mb-1 line-clamp-1"
            style={{ color: C.charcoal, letterSpacing: "-0.01em" }}
          >
            {note.title}
          </h4>
        )}

        {/* 本文抜粋 */}
        <p
          className="text-xs line-clamp-3 mb-3 leading-relaxed"
          style={{ color: C.charcoalLight }}
        >
          {excerpt || "まだ内容が書かれていません"}
        </p>

        {/* フッター: 当日の足跡ピル & タグ */}
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-stone-100 dark:border-stone-800">
          <div className="flex items-center gap-2 flex-wrap">
            {eventsCount > 0 && (
              <span
                className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300"
                style={{ fontSize: "0.68rem" }}
              >
                <Calendar size={11} className="shrink-0" />
                <span>予定 {eventsCount}件</span>
              </span>
            )}
            {tasksCount > 0 && (
              <span
                className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300"
                style={{ fontSize: "0.68rem" }}
              >
                <CheckCircle2 size={11} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>完了 {tasksCount}件</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 ml-auto shrink-0 text-xs text-stone-400">
            <Clock size={11} />
            <span style={{ fontSize: "0.68rem" }}>
              {note.updatedAt?.split("T")[1]?.slice(0, 5) || "記録"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * JournalTimeline メインビュー
 */
export function JournalTimeline({
  childNotes,
  allNotes: _allNotes,
  onSelectChildNote,
  onNewJournalNote,
  onMoveChildNote,
  onDeleteChildNote,
  onDownloadChildNote,
}: JournalTimelineProps) {
  const todayStr = useMemo(() => getTodayString(), []);

  // 本日のジャーナルノートが配下に既に存在するか確認
  const todayNote = useMemo(() => {
    return childNotes.find((n) => {
      const d = getNoteDate(n);
      return d === todayStr;
    });
  }, [childNotes, todayStr]);

  // 日付の降順でソート
  const sortedNotes = useMemo(() => {
    return [...childNotes].sort((a, b) => {
      const da = getNoteDate(a);
      const db = getNoteDate(b);
      return db.localeCompare(da);
    });
  }, [childNotes]);

  // 月別にグループ化
  const groupedNotes = useMemo(() => {
    const map = new Map<string, NoteItem[]>();
    sortedNotes.forEach((n) => {
      const key = getMonthGroupKey(getNoteDate(n));
      const list = map.get(key) || [];
      list.push(n);
      map.set(key, list);
    });
    return Array.from(map.entries());
  }, [sortedNotes]);

  // 「今日のジャーナルを書く」ボタンクリック時の処理
  const handleQuickToday = () => {
    if (todayNote) {
      onSelectChildNote(todayNote.id);
    } else {
      onNewJournalNote(todayStr);
    }
  };

  return (
    <div className="w-full flex flex-col gap-6" data-testid="subnotes-journal-view">
      {/* クイックアクションバー: 「今日のジャーナルを書く」 */}
      <div
        className="flex items-center justify-between p-4 rounded-2xl transition-all"
        style={{
          background: C.goldFaint,
          boxShadow: "0 1px 4px rgba(181, 141, 61, 0.08)",
        }}
      >
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-semibold" style={{ color: C.goldDark }}>
            MEMORY & JOURNAL
          </span>
          <span className="text-sm font-medium" style={{ color: C.charcoal }}>
            {formatJournalDateLabel(todayStr)} の記録
          </span>
        </div>

        <button
          type="button"
          onClick={handleQuickToday}
          className="appearance-none whitespace-nowrap shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl cursor-pointer font-semibold text-xs transition-all duration-150 min-h-[44px]"
          style={{
            background: C.goldDark,
            color: "#FFFFFF",
            boxShadow: "0 2px 8px rgba(181, 141, 61, 0.25)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = "0.92";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = "1";
          }}
          data-testid="quick-today-journal-btn"
        >
          <PenLine size={15} strokeWidth={2.2} />
          <span>{todayNote ? "今日のジャーナルを開く" : "今日のジャーナルを書く"}</span>
        </button>
      </div>

      {/* タイムライン一覧 */}
      {sortedNotes.length === 0 ? (
        <div
          style={{
            background: "rgba(0, 0, 0, 0.015)",
            borderRadius: "16px",
            border: "1px dashed rgba(0, 0, 0, 0.07)",
            padding: "2.5rem 1.5rem",
            textAlign: "center",
          }}
        >
          <p style={{ margin: 0, fontSize: "0.85rem", color: C.charcoalLight }}>
            ジャーナルエントリーはまだありません。<br />
            上のボタンから日々の記録・思考・足跡を残してみましょう。
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {groupedNotes.map(([monthKey, notesInMonth]) => (
            <div key={monthKey} className="flex flex-col gap-3">
              {/* 月別区切りヘッダー */}
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                  {monthKey}
                </span>
                <div className="flex-1 h-px bg-stone-200/60 dark:bg-stone-800/60" />
              </div>

              {/* カードグリッド / ストリーム */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                  gap: "1.2rem",
                }}
              >
                {notesInMonth.map((child) => (
                  <JournalCard
                    key={child.id}
                    note={child}
                    onClick={() => onSelectChildNote(child.id)}
                    onMove={onMoveChildNote ? (e) => {
                      e.stopPropagation();
                      onMoveChildNote(child);
                    } : undefined}
                    onDelete={(e) => {
                      e.stopPropagation();
                      onDeleteChildNote(child);
                    }}
                    onDownload={(e) => {
                      e.stopPropagation();
                      onDownloadChildNote(child);
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
