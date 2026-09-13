/**
 * src/components/notes/ExplorerHomeView.tsx
 * Arca — ノート (Pages) エクスプローラー ホームビュー
 *
 * Windows エクスプローラーのホーム画面を踏襲:
 *  - クイックアクセス（ピン留め・主要ページ）
 *  - 最近使用したページ（Recent Pages）
 *  - Apple HIG 準拠（絵文字排除、Lucide React SVGアイコン統一、面表現）
 */

import React from "react";
import {
  Pin,
  Clock,
  FileText,
  Plus,
  ChevronRight,
  FolderTree,
} from "lucide-react";
import type { NoteItem } from "../../types";

interface ExplorerHomeViewProps {
  notes: NoteItem[];
  onSelectNote: (id: string) => void;
  onCreateNewPage: () => void;
}

export const ExplorerHomeView: React.FC<ExplorerHomeViewProps> = ({
  notes,
  onSelectNote,
  onCreateNewPage,
}) => {
  // ピン留めされたノート（クイックアクセス）
  const pinnedNotes = notes.filter((n) => n.pinned && !n.isDeleted);

  // 最近更新されたノート（直近10件）
  const recentNotes = [...notes]
    .filter((n) => !n.isDeleted)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 10);

  // 親ノート辞書（階層表示用）
  const noteMap = new Map<string, NoteItem>();
  notes.forEach((n) => noteMap.set(n.id, n));

  const formatUpdateDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return "";
      const now = new Date();
      const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));

      if (diffDays === 0) {
        return `今日 ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
      } else if (diffDays === 1) {
        return "昨日";
      } else if (diffDays < 7) {
        return `${diffDays}日前`;
      } else {
        return `${d.getMonth() + 1}月${d.getDate()}日`;
      }
    } catch {
      return "";
    }
  };

  return (
    <div className="flex-1 w-full h-full overflow-y-auto arca-scroll px-4 sm:px-8 py-6 select-none">
      <div className="max-w-4xl mx-auto space-y-8 pb-16">
        {/* ── 1. ウェルカム / アクションヘッダー ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-black/[0.04] dark:border-white/[0.05]">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-charcoal flex items-center gap-2">
              <FolderTree className="w-6 h-6 text-[#B58D3D]" />
              <span>Pages ホーム</span>
            </h1>
            <p className="text-xs text-charcoal-light mt-1">
              ドキュメントのクイックアクセスと最近編集したページ
            </p>
          </div>

          <button
            type="button"
            onClick={onCreateNewPage}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-[#B58D3D] text-white text-xs font-semibold shadow-sm hover:brightness-105 active:scale-95 transition-all cursor-pointer border-none shrink-0"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>新規ページを作成</span>
          </button>
        </div>

        {/* ── 2. クイックアクセス（ピン留め・お気に入り） ── */}
        <div>
          <div className="flex items-center gap-1.5 mb-3">
            <Pin className="w-4 h-4 text-charcoal-light" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-charcoal-light">
              クイックアクセス
            </h2>
          </div>

          {pinnedNotes.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {pinnedNotes.map((note) => {
                const parent = note.parentId ? noteMap.get(note.parentId) : null;
                return (
                  <div
                    key={note.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelectNote(note.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelectNote(note.id);
                      }
                    }}
                    className="group p-3.5 rounded-2xl bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] border border-black/[0.04] dark:border-white/[0.06] shadow-card hover:shadow-card-hover transition-all duration-200 cursor-pointer text-left flex flex-col justify-between min-h-[90px]"
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-[#B58D3D] flex items-center justify-center shrink-0">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-semibold text-charcoal group-hover:text-[#B58D3D] transition-colors truncate">
                          {note.title.trim() || "（タイトルなし）"}
                        </h3>
                        {parent && (
                          <p className="text-[0.68rem] text-charcoal-xlight truncate mt-0.5">
                            親: {parent.title || "（タイトルなし）"}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-black/[0.03] dark:border-white/[0.04] text-[0.68rem] text-charcoal-light">
                      <span>{formatUpdateDate(note.updatedAt)}</span>
                      <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-charcoal-light" />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-5 rounded-2xl bg-[var(--bg-card)] border border-dashed border-black/10 dark:border-white/10 text-center">
              <p className="text-xs text-charcoal-light">
                ピン留めされたページはありません。よく見るノートのピン留めボタンを押すとここに固定表示されます。
              </p>
            </div>
          )}
        </div>

        {/* ── 3. 最近使用したページ（Recent Pages） ── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-charcoal-light" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-charcoal-light">
                最近使用したページ
              </h2>
            </div>
            <span className="text-xs text-charcoal-xlight">
              全 {notes.length} ページ
            </span>
          </div>

          {recentNotes.length > 0 ? (
            <div className="bg-[var(--bg-card)] border border-black/[0.04] dark:border-white/[0.06] rounded-2xl overflow-hidden shadow-card">
              <div className="divide-y divide-black/[0.03] dark:divide-white/[0.04]">
                {recentNotes.map((note) => {
                  const parent = note.parentId ? noteMap.get(note.parentId) : null;
                  return (
                    <div
                      key={note.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => onSelectNote(note.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onSelectNote(note.id);
                        }
                      }}
                      className="group flex items-center justify-between px-4 py-3 hover:bg-black/[0.025] dark:hover:bg-white/[0.035] transition-colors cursor-pointer text-left"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1 pr-4">
                        <div className="w-7 h-7 rounded-lg bg-black/[0.035] dark:bg-white/[0.06] text-charcoal-light group-hover:text-[#B58D3D] group-hover:bg-amber-500/10 flex items-center justify-center shrink-0 transition-colors">
                          <FileText className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="text-sm font-medium text-charcoal group-hover:text-[#B58D3D] transition-colors truncate block">
                            {note.title.trim() || "（タイトルなし）"}
                          </span>
                          {parent && (
                            <span className="text-[0.68rem] text-charcoal-xlight truncate block">
                              場所: {parent.title || "（タイトルなし）"}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs text-charcoal-light whitespace-nowrap">
                          {formatUpdateDate(note.updatedAt)}
                        </span>
                        <ChevronRight className="w-4 h-4 text-charcoal-xlight group-hover:text-charcoal transition-colors" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="p-8 rounded-2xl bg-[var(--bg-card)] border border-black/[0.04] dark:border-white/[0.06] text-center">
              <FileText className="w-8 h-8 text-charcoal-xlight mx-auto mb-2 stroke-[1.5]" />
              <p className="text-xs text-charcoal-light">ページがまだありません</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
