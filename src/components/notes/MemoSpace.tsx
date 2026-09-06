/**
 * src/components/notes/MemoSpace.tsx
 * Arca — メモ（Memo）専用 Google Keep風カードグリッドスペース
 *
 * Apple HIG & Core/Rules.md 準拠:
 * - 絵文字不使用（Lucide React SVG アイコン統一）
 * - アイボリー背景、枠線なし、微細多層シャドウ、マットゴールドアクセント
 * - タップ領域 44px 以上
 * - クリックで画面遷移せず、親コンポーネント経由で MemoModal がポップアップ起動
 */

import React, { useState, useMemo } from "react";
import type { NoteItem } from "../../types";
import {
  Plus,
  Search,
  Pin,
  Trash2,
  Download,
  Upload,
  StickyNote,
  Tag,
  X,
} from "lucide-react";
import type { NoteSpaceType } from "../../types";

interface MemoSpaceProps {
  notes: NoteItem[];
  onOpenMemo: (note: NoteItem) => void;
  onNewMemo: () => void;
  onDeleteNote: (note: NoteItem) => void;
  onTogglePin: (id: string, currentPinned: boolean) => void;
  onDownloadNote: (note: NoteItem) => void;
  onTriggerImport: () => void;
  onOpenTrash: () => void;
  onSpaceChange?: (space: NoteSpaceType) => void;
  spaceCounts?: {
    memo: number;
    document: number;
    journal: number;
  };
}

function formatDateRelative(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = Math.max(0, now.getTime() - d.getTime());
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return "今日";
  if (diffDays === 1) return "昨日";
  if (diffDays < 7) return `${diffDays}日前`;
  return d.toLocaleDateString("ja-JP", { month: "short", day: "numeric" });
}

function getExcerpt(content: string, maxLen = 90): string {
  return content
    .replace(/^#+\s.+$/gm, "")
    .replace(/[*_`>[\]()#-]/g, "")
    .replace(/\n+/g, " ")
    .trim()
    .slice(0, maxLen);
}

function getFirstImageUrl(note: NoteItem): string | null {
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

export const MemoSpace: React.FC<MemoSpaceProps> = ({
  notes,
  onOpenMemo,
  onNewMemo,
  onDeleteNote,
  onTogglePin,
  onDownloadNote,
  onTriggerImport,
  onOpenTrash,
  onSpaceChange: _onSpaceChange,
  spaceCounts: _spaceCounts,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string>("all");

  // 全タグ一覧
  const allTags = useMemo(() => {
    const set = new Set<string>();
    notes.forEach((n) => n.tags?.forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [notes]);

  // フィルタリング
  const filteredNotes = useMemo(() => {
    let result = notes;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          n.content.toLowerCase().includes(q) ||
          n.tags?.some((t) => t.toLowerCase().includes(q))
      );
    }

    if (selectedTag !== "all") {
      result = result.filter((n) => n.tags?.includes(selectedTag));
    }

    return result;
  }, [notes, searchQuery, selectedTag]);

  // ピン留めと通常メモの分離
  const pinnedNotes = useMemo(
    () => filteredNotes.filter((n) => !!n.pinned),
    [filteredNotes]
  );
  const otherNotes = useMemo(
    () => filteredNotes.filter((n) => !n.pinned),
    [filteredNotes]
  );

  const renderCard = (note: NoteItem) => {
    const thumbnail = getFirstImageUrl(note);
    const excerpt = getExcerpt(note.content, 120);

    return (
      <div
        key={note.id}
        onClick={() => onOpenMemo(note)}
        className="group relative flex flex-col justify-between rounded-2xl p-4 cursor-pointer transition-all duration-200 hover:-translate-y-1 select-none overflow-hidden"
        style={{
          background: "var(--bg-card-solid)",
          boxShadow: "0 2px 10px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.02)",
          minHeight: "150px",
        }}
      >
        {/* サムネイル画像 */}
        {thumbnail && (
          <div className="-mx-4 -mt-4 mb-3 h-32 overflow-hidden bg-black/5 relative">
            <img
              src={thumbnail}
              alt=""
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              loading="lazy"
            />
          </div>
        )}

        {/* コンテンツ */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <h3 className="text-base font-semibold text-[#2C2C2E] line-clamp-1 break-words">
              {note.title.trim() || "（タイトルなし）"}
            </h3>

            {/* ピン留めトグル */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onTogglePin(note.id, !note.pinned);
              }}
              className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${
                note.pinned
                  ? "text-[#B58D3D] bg-[#B58D3D]/10"
                  : "opacity-0 group-hover:opacity-100 text-[#8E8E93] hover:text-[#2C2C2E] hover:bg-black/5"
              }`}
              title={note.pinned ? "ピン留めを解除" : "上部にピン留め"}
              aria-label={note.pinned ? "ピン留めを解除" : "上部にピン留め"}
            >
              <Pin className={`w-3.5 h-3.5 ${note.pinned ? "fill-[#B58D3D]" : ""}`} />
            </button>
          </div>

          {excerpt ? (
            <p className="text-xs text-[#8E8E93] leading-relaxed line-clamp-4 break-words">
              {excerpt}
            </p>
          ) : (
            <p className="text-xs text-[#8E8E93]/40 italic">本文なし</p>
          )}
        </div>

        {/* フッター（タグ ＆ アクション） */}
        <div className="mt-3 pt-2 flex items-center justify-between gap-2 border-t border-black/[0.04]">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            {note.tags && note.tags.length > 0 ? (
              note.tags.slice(0, 2).map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-black/[0.04] text-[#8E8E93]"
                >
                  #{t}
                </span>
              ))
            ) : (
              <span className="text-[10px] text-[#8E8E93]/60">
                {formatDateRelative(note.updatedAt)}
              </span>
            )}
            {note.tags && note.tags.length > 2 && (
              <span className="text-[10px] text-[#8E8E93]">+{note.tags.length - 2}</span>
            )}
          </div>

          {/* ホバー時アクション */}
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDownloadNote(note);
              }}
              className="w-6 h-6 flex items-center justify-center rounded text-[#8E8E93] hover:text-[#2C2C2E] hover:bg-black/5 transition-colors"
              title="Markdown保存"
              aria-label="Markdown保存"
            >
              <Download className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteNote(note);
              }}
              className="w-6 h-6 flex items-center justify-center rounded text-[#8E8E93] hover:text-[#E0564A] hover:bg-[#E0564A]/10 transition-colors"
              title="削除"
              aria-label="削除"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-5 pb-28 space-y-5">
      {/* ── ツールバー（検索・アクション） ── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* 検索バー */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8E8E93] pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="メモを検索..."
            className="w-full pl-10 pr-9 py-2.5 rounded-2xl bg-[var(--bg-card-solid)] text-sm text-[#2C2C2E] placeholder-[#8E8E93]/60 focus:outline-none focus:ring-2 focus:ring-[#B58D3D]/30 transition-all shadow-[0_1px_4px_rgba(0,0,0,0.03)]"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center text-[#8E8E93] hover:text-[#2C2C2E]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* ボタン群 */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            type="button"
            onClick={onTriggerImport}
            className="h-10 px-3 rounded-2xl bg-[var(--bg-card-solid)] text-xs font-medium text-[#8E8E93] hover:text-[#2C2C2E] shadow-[0_1px_4px_rgba(0,0,0,0.03)] flex items-center gap-1.5 transition-colors"
            title="Markdownインポート"
          >
            <Upload className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">インポート</span>
          </button>

          <button
            type="button"
            onClick={onOpenTrash}
            className="w-10 h-10 rounded-2xl bg-[var(--bg-card-solid)] text-[#8E8E93] hover:text-[#2C2C2E] shadow-[0_1px_4px_rgba(0,0,0,0.03)] flex items-center justify-center transition-colors"
            title="ごみ箱"
            aria-label="ごみ箱"
          >
            <Trash2 className="w-4 h-4" />
          </button>

          {/* 新規メモ作成ボタン */}
          <button
            type="button"
            onClick={onNewMemo}
            className="h-10 px-4 rounded-2xl bg-[#B58D3D] text-white text-xs font-semibold shadow-[0_2px_8px_rgba(181,141,61,0.25)] hover:brightness-105 active:scale-[0.98] flex items-center gap-1.5 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>新しいメモ</span>
          </button>
        </div>
      </div>

      {/* ── タグフィルター ── */}
      {allTags.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <button
            type="button"
            onClick={() => setSelectedTag("all")}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
              selectedTag === "all"
                ? "bg-[#B58D3D] text-white shadow-sm"
                : "bg-[var(--bg-card-solid)] text-[#8E8E93] hover:text-[#2C2C2E]"
            }`}
          >
            すべて
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setSelectedTag(tag)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all flex items-center gap-1 ${
                selectedTag === tag
                  ? "bg-[#B58D3D] text-white shadow-sm"
                  : "bg-[var(--bg-card-solid)] text-[#8E8E93] hover:text-[#2C2C2E]"
              }`}
            >
              <Tag className="w-3 h-3 opacity-60" />
              <span>#{tag}</span>
            </button>
          ))}
        </div>
      )}

      {/* ── メモ一覧（ピン留め / その他） ── */}
      {filteredNotes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center select-none">
          <div className="w-14 h-14 rounded-3xl bg-[var(--bg-card-solid)] shadow-[0_2px_12px_rgba(0,0,0,0.04)] flex items-center justify-center text-[#8E8E93]/60 mb-4">
            <StickyNote className="w-7 h-7 stroke-[1.5]" />
          </div>
          <p className="text-sm font-semibold text-[#2C2C2E] mb-1">
            {searchQuery || selectedTag !== "all"
              ? "一致するメモが見つかりません"
              : "メモがまだありません"}
          </p>
          <p className="text-xs text-[#8E8E93] max-w-xs mb-4">
            {searchQuery || selectedTag !== "all"
              ? "検索条件を変更するか、クリアしてください"
              : "思いついたアイデアや簡単な覚え書きを素早く残せます"}
          </p>
          {(!searchQuery && selectedTag === "all") && (
            <button
              type="button"
              onClick={onNewMemo}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-[#B58D3D] text-white text-xs font-semibold shadow-sm hover:brightness-105 active:scale-95 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>最初のメモを作成</span>
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {/* ピン留めセクション */}
          {pinnedNotes.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <Pin className="w-3.5 h-3.5 text-[#B58D3D] fill-[#B58D3D]" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#8E8E93]">
                  ピン留め
                </h4>
                <span className="text-xs text-[#8E8E93]">({pinnedNotes.length})</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {pinnedNotes.map(renderCard)}
              </div>
            </section>
          )}

          {/* その他セクション */}
          {otherNotes.length > 0 && (
            <section className="space-y-3">
              {pinnedNotes.length > 0 && (
                <div className="flex items-center gap-2 px-1">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#8E8E93]">
                    その他
                  </h4>
                  <span className="text-xs text-[#8E8E93]">({otherNotes.length})</span>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {otherNotes.map(renderCard)}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
};
