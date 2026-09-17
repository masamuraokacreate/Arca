/**
 * src/components/dashboard/RecentNotesCard.tsx
 * Arca — サブグリッド中央カラム（1fr）: 最近のノート
 *
 * 設計原則 (Core/Rules.md):
 *  - 枠線完全排除（border-none）、微細二重シャドウ、Apple HIG準拠
 *  - 絵文字完全排除（Lucide React SVGアイコンのみ）
 *  - 右上「Notes >」を廃止し、最下部「ノート一覧を開く」導線へ再設計
 *  - 直近更新のノート最大3件、1行 truncate 表示
 */

import React from "react";
import { FileText, Plus } from "lucide-react";
import type { NoteItem } from "../../types";

export interface RecentNotesCardProps {
  notes: NoteItem[];
  onNavigate?: (module: "dashboard" | "tasks" | "lists" | "calendar" | "notes" | "recipes" | "finance") => void;
  onSelectNote?: (noteId: string) => void;
}

export const RecentNotesCard: React.FC<RecentNotesCardProps> = ({
  notes,
  onNavigate,
  onSelectNote,
}) => {
  const activeNotes = notes.filter(
    (n) => !n.isDeleted && (n.title.trim() !== "" || n.content.trim() !== "")
  );
  const displayNotes = activeNotes.slice(0, 3);

  return (
    <div
      data-testid="recent-notes-card"
      className="bg-white dark:bg-stone-900 rounded-2xl p-5 shadow-xs flex flex-col h-full overflow-hidden border-none transition-all"
      style={{
        boxShadow: "0 2px 10px rgba(0, 0, 0, 0.025), 0 1px 3px rgba(0, 0, 0, 0.02)",
      }}
    >
      {/* ─── ヘッダー ─── */}
      <div className="flex items-center justify-between h-7 mb-3 pb-2 border-b border-stone-100 dark:border-stone-800 shrink-0">
        <div className="flex items-center gap-2">
          <FileText size={16} className="text-amber-700 dark:text-amber-400 shrink-0" />
          <span className="text-sm font-semibold text-stone-800 dark:text-stone-100 tracking-tight">
            最近のノート
          </span>
          <span className="text-xs text-stone-400 dark:text-stone-500 font-medium">
            ({activeNotes.length})
          </span>
        </div>
      </div>

      {/* ─── 本文（ノートリスト または Empty State） ─── */}
      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto no-scrollbar">
        {displayNotes.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-2">
            <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center mb-1.5">
              <FileText size={15} className="text-amber-700 dark:text-amber-400" />
            </div>
            <p className="text-xs font-medium text-stone-600 dark:text-stone-300 m-0 mb-2">
              ノートがありません
            </p>
            <button
              type="button"
              onClick={() => onNavigate?.("notes")}
              className="appearance-none inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#F5F2EB] dark:bg-stone-800 text-[0.72rem] font-semibold text-amber-800 dark:text-amber-300 hover:bg-amber-500/15 transition-colors cursor-pointer border-none"
            >
              <Plus size={11} strokeWidth={2.5} />
              <span>ノート作成</span>
            </button>
          </div>
        ) : (
          <div className="space-y-1.5 py-0.5">
            {displayNotes.map((note) => (
              <div
                key={note.id}
                onClick={() => {
                  if (onSelectNote) {
                    onSelectNote(note.id);
                  } else if (onNavigate) {
                    onNavigate("notes");
                  }
                }}
                className="group flex items-center gap-2 p-2 rounded-xl hover:bg-[#F9F7F4] dark:hover:bg-stone-800/50 transition-colors cursor-pointer"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500/60 shrink-0" />
                <span className="text-xs font-medium text-stone-800 dark:text-stone-200 truncate flex-1">
                  {note.title || "無題のノート"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── フッター: ノート一覧を開く ─── */}
      <div className="pt-2.5 mt-auto border-t border-stone-100 dark:border-stone-800 text-center shrink-0">
        <button
          type="button"
          onClick={() => onNavigate?.("notes")}
          className="appearance-none text-xs font-semibold text-stone-500 hover:text-amber-700 dark:hover:text-amber-400 transition-colors cursor-pointer bg-transparent border-none p-0 w-full text-center py-1"
        >
          ノート一覧を開く
        </button>
      </div>
    </div>
  );
};
