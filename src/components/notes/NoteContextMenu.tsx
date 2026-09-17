/**
 * src/components/notes/NoteContextMenu.tsx
 * Arca — ノート用 カスタムコンテキストメニュー（Apple HIG × Arca 準拠）
 *
 * 設計原則:
 * - 枠線完全排除、微細多層シャドウ、洗練されたフォントと余白
 * - 絵文字不使用（Lucide React SVG アイコン統一）
 * - 画面外はみ出し防止スマートポジショニング
 * - Escapeキーおよび外側クリックで自動クローズ
 */

import React, { useEffect, useRef } from "react";
import type { NoteItem } from "../../types";
import { Edit3, Plus, FolderInput, Trash2, Smile } from "lucide-react";

export interface NoteContextMenuProps {
  x: number;
  y: number;
  note: NoteItem;
  onClose: () => void;
  onRename: (note: NoteItem) => void;
  onChangeIcon?: (note: NoteItem) => void;
  onCreateChild: (noteId: string) => void;
  onMove: (note: NoteItem) => void;
  onDelete: (note: NoteItem) => void;
}

export const NoteContextMenu: React.FC<NoteContextMenuProps> = ({
  x,
  y,
  note,
  onClose,
  onRename,
  onChangeIcon,
  onCreateChild,
  onMove,
  onDelete,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // 外側クリックで閉じる
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  // 画面端のオーバーフロー防止
  const menuWidth = 190;
  const menuHeight = 175;
  const adjustedX = typeof window !== "undefined" && x + menuWidth > window.innerWidth
    ? Math.max(10, window.innerWidth - menuWidth - 12)
    : x;
  const adjustedY = typeof window !== "undefined" && y + menuHeight > window.innerHeight
    ? Math.max(10, window.innerHeight - menuHeight - 12)
    : y;

  return (
    <div
      ref={menuRef}
      role="menu"
      data-testid="note-context-menu"
      className="fixed z-50 py-1.5 px-1 rounded-2xl select-none animate-in fade-in zoom-in-95 duration-100"
      style={{
        top: `${adjustedY}px`,
        left: `${adjustedX}px`,
        width: `${menuWidth}px`,
        background: "var(--bg-card-solid, rgba(255, 255, 255, 0.96))",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        boxShadow: "0 12px 36px -4px rgba(0, 0, 0, 0.14), 0 2px 8px -2px rgba(0, 0, 0, 0.06)",
        border: "1px solid var(--border-subtle, rgba(0, 0, 0, 0.06))",
      }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* ノート名プレビュー */}
      <div className="px-3 py-1.5 mb-1 border-b border-black/[0.04] dark:border-white/[0.06]">
        <p className="text-[11px] font-semibold text-charcoal truncate m-0">
          {note.title.trim() || "（タイトルなし）"}
        </p>
      </div>

      {/* メニューアイテム: 名前の変更 */}
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onRename(note);
          onClose();
        }}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-charcoal hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors cursor-pointer border-none bg-transparent text-left"
      >
        <Edit3 size={14} className="text-charcoal-light shrink-0" />
        <span>名前の変更</span>
      </button>

      {/* メニューアイテム: アイコンの変更 */}
      {onChangeIcon && (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onChangeIcon(note);
            onClose();
          }}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-charcoal hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors cursor-pointer border-none bg-transparent text-left"
        >
          <Smile size={14} className="text-amber-700 dark:text-amber-400 shrink-0" />
          <span>アイコンの変更</span>
        </button>
      )}

      {/* メニューアイテム: 子ページを作成 */}
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onCreateChild(note.id);
          onClose();
        }}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-charcoal hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors cursor-pointer border-none bg-transparent text-left"
      >
        <Plus size={14} className="text-amber-700 dark:text-amber-400 shrink-0" />
        <span>子ページを作成</span>
      </button>

      {/* メニューアイテム: 移動 */}
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onMove(note);
          onClose();
        }}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-charcoal hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors cursor-pointer border-none bg-transparent text-left"
      >
        <FolderInput size={14} className="text-charcoal-light shrink-0" />
        <span>移動...</span>
      </button>

      {/* 区切り線 */}
      <div className="my-1 border-t border-black/[0.04] dark:border-white/[0.06]" />

      {/* メニューアイテム: 削除 */}
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onDelete(note);
          onClose();
        }}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer border-none bg-transparent text-left"
      >
        <Trash2 size={14} className="shrink-0" />
        <span>削除</span>
      </button>
    </div>
  );
};
