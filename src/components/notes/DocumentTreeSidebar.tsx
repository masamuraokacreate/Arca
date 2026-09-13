/**
 * src/components/notes/DocumentTreeSidebar.tsx
 * Arca — ノート（Pages）専用 階層ツリーサイドバー（Windowsエクスプローラー風 D&D ＆ 右クリック対応）
 *
 * Apple HIG & Core/Rules.md 準拠:
 * - 絵文字不使用（Lucide React SVG アイコン統一）
 * - アイボリー背景、枠線なし、微細シャドウ、マットゴールドのアクセント
 * - タップ領域 44px 以上、インデント可視化
 * - ドラッグ＆ドロップによる直感的な階層移動（循環参照ガード付き）
 * - 右クリックによるカスタムコンテキストメニュー（名前変更・子ページ作成・移動・削除）
 * - インラインでのノート名変更
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import type { NoteItem } from "../../types";
import {
  Folder,
  FolderOpen,
  FileText,
  ChevronRight,
  ChevronDown,
  Plus,
  PanelLeftClose,
  FolderRoot,
} from "lucide-react";
import { C } from "../../lib/designSystem";
import type { NoteSpaceType } from "../../types";
import { canMoveNoteTo } from "../../utils/noteHierarchy";
import { NoteContextMenu } from "./NoteContextMenu";

interface DocumentTreeSidebarProps {
  notes: NoteItem[];
  activeNoteId: string | null;
  onSelectNote: (id: string) => void;
  onCreateRootNote: () => void;
  onCreateChildNote: (parentId: string) => void;
  onMoveNote: (noteId: string, newParentId: string | null) => void;
  onRenameNote?: (id: string, newTitle: string) => void;
  onDeleteNote?: (note: NoteItem) => void;
  onOpenMoveModal?: (note: NoteItem) => void;
  onCloseSidebar?: () => void;
  activeSpace?: NoteSpaceType;
  onSpaceChange?: (space: NoteSpaceType) => void;
  spaceCounts?: {
    memo: number;
    document: number;
    journal: number;
  };
}

interface TreeNode {
  note: NoteItem;
  children: TreeNode[];
  depth: number;
}

export const DocumentTreeSidebar: React.FC<DocumentTreeSidebarProps> = ({
  notes,
  activeNoteId,
  onSelectNote,
  onCreateRootNote,
  onCreateChildNote,
  onMoveNote,
  onRenameNote,
  onDeleteNote,
  onOpenMoveModal,
  onCloseSidebar,
}) => {
  // 開閉状態管理（ノードIDのSet）
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // ドラッグ＆ドロップステート
  const [draggedNoteId, setDraggedNoteId] = useState<string | null>(null);
  const [dragOverTargetId, setDragOverTargetId] = useState<string | null>(null);
  const [isDragOverRoot, setIsDragOverRoot] = useState<boolean>(false);

  // コンテキストメニューステート
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    note: NoteItem;
  } | null>(null);

  // インライン名前変更ステート
  const [renamingNoteId, setRenamingNoteId] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState<string>("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  // ツリー構築
  const tree = useMemo(() => {
    const childrenMap = new Map<string | null, NoteItem[]>();

    notes.forEach((n) => {
      const pid = n.parentId ?? null;
      const list = childrenMap.get(pid) || [];
      list.push(n);
      childrenMap.set(pid, list);
    });

    childrenMap.forEach((list) => {
      list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    });

    const buildNodes = (parentId: string | null, depth: number): TreeNode[] => {
      const items = childrenMap.get(parentId) || [];
      return items.map((note) => ({
        note,
        depth,
        children: buildNodes(note.id, depth + 1),
      }));
    };

    return buildNodes(null, 0);
  }, [notes]);

  // アクティブなノートの祖先を自動展開
  useEffect(() => {
    if (!activeNoteId) return;

    const parentMap = new Map<string, string | null>();
    notes.forEach((n) => parentMap.set(n.id, n.parentId ?? null));

    const ancestors = new Set<string>();
    let curr = parentMap.get(activeNoteId);
    while (curr) {
      ancestors.add(curr);
      curr = parentMap.get(curr) ?? null;
    }

    if (ancestors.size > 0) {
      setExpandedIds((prev) => {
        const next = new Set(prev);
        ancestors.forEach((id) => next.add(id));
        return next;
      });
    }
  }, [activeNoteId, notes]);

  // 名前変更入力欄に自動フォーカス
  useEffect(() => {
    if (renamingNoteId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingNoteId]);

  const toggleExpand = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // 名前変更確定
  const handleRenameSubmit = () => {
    if (renamingNoteId && onRenameNote) {
      const trimmed = renameTitle.trim();
      if (trimmed) {
        onRenameNote(renamingNoteId, trimmed);
      }
    }
    setRenamingNoteId(null);
  };

  // ドラッグハンドラ
  const handleDragStart = (e: React.DragEvent, noteId: string) => {
    e.stopPropagation();
    setDraggedNoteId(noteId);
    e.dataTransfer.setData("text/arca-note-id", noteId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragEnd = () => {
    setDraggedNoteId(null);
    setDragOverTargetId(null);
    setIsDragOverRoot(false);
  };

  const handleDragOverNode = (e: React.DragEvent, targetNoteId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedNoteId || draggedNoteId === targetNoteId) return;

    if (canMoveNoteTo(notes, draggedNoteId, targetNoteId)) {
      e.dataTransfer.dropEffect = "move";
      setDragOverTargetId(targetNoteId);
    } else {
      e.dataTransfer.dropEffect = "none";
    }
  };

  const handleDropOnNode = (e: React.DragEvent, targetNoteId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const sourceId = e.dataTransfer.getData("text/arca-note-id") || draggedNoteId;
    if (sourceId && sourceId !== targetNoteId && canMoveNoteTo(notes, sourceId, targetNoteId)) {
      onMoveNote(sourceId, targetNoteId);
      // ドロップ先フォルダを自動展開
      setExpandedIds((prev) => new Set(prev).add(targetNoteId));
    }
    handleDragEnd();
  };

  const handleDropOnRoot = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const sourceId = e.dataTransfer.getData("text/arca-note-id") || draggedNoteId;
    if (sourceId) {
      onMoveNote(sourceId, null);
    }
    handleDragEnd();
  };

  // ノード再帰描画
  const renderNode = (node: TreeNode) => {
    const { note, depth, children } = node;
    const hasChildren = children.length > 0;
    const isExpanded = expandedIds.has(note.id);
    const isActive = note.id === activeNoteId;
    const isDraggingThis = note.id === draggedNoteId;
    const isDragOver = note.id === dragOverTargetId;
    const isRenaming = note.id === renamingNoteId;

    return (
      <div key={note.id} className="select-none">
        <div
          draggable={!isRenaming}
          onDragStart={(e) => handleDragStart(e, note.id)}
          onDragEnd={handleDragEnd}
          onDragOver={(e) => handleDragOverNode(e, note.id)}
          onDragLeave={(e) => {
            e.stopPropagation();
            if (dragOverTargetId === note.id) setDragOverTargetId(null);
          }}
          onDrop={(e) => handleDropOnNode(e, note.id)}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setContextMenu({
              x: e.clientX,
              y: e.clientY,
              note,
            });
          }}
          onClick={() => onSelectNote(note.id)}
          className={`group relative flex items-center min-h-[42px] px-2 py-1.5 rounded-xl cursor-pointer transition-all duration-150 ${
            isDraggingThis ? "opacity-40 scale-95" : ""
          } ${
            isDragOver
              ? "bg-amber-500/20 ring-2 ring-amber-500/40 shadow-sm"
              : isActive
              ? "bg-amber-500/10 text-[#B58D3D]"
              : "hover:bg-black/[0.035] dark:hover:bg-white/[0.04] text-charcoal"
          }`}
          style={{
            paddingLeft: `${Math.max(8, depth * 16 + 8)}px`,
            color: isActive ? C.goldDark : undefined,
          }}
        >
          {/* 開閉ボタン */}
          <button
            type="button"
            onClick={(e) => hasChildren && toggleExpand(note.id, e)}
            className={`w-6 h-6 flex items-center justify-center rounded-lg transition-colors shrink-0 ${
              hasChildren
                ? "text-charcoal-light hover:text-charcoal hover:bg-black/5 dark:hover:bg-white/5"
                : "opacity-0 pointer-events-none"
            }`}
            aria-label={isExpanded ? "折りたたむ" : "展開する"}
          >
            {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>

          {/* アイコン */}
          <div className="flex-shrink-0 mx-1 text-charcoal-light group-hover:text-charcoal">
            {hasChildren ? (
              isExpanded ? (
                <FolderOpen className="w-4 h-4 text-[#B58D3D]" />
              ) : (
                <Folder className="w-4 h-4 text-charcoal-light" />
              )
            ) : (
              <FileText className="w-4 h-4" />
            )}
          </div>

          {/* タイトル or インライン名前変更入力 */}
          {isRenaming ? (
            <input
              ref={renameInputRef}
              type="text"
              value={renameTitle}
              onChange={(e) => setRenameTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRenameSubmit();
                if (e.key === "Escape") setRenamingNoteId(null);
              }}
              onBlur={handleRenameSubmit}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 min-w-0 text-sm px-1.5 py-0.5 rounded bg-white dark:bg-stone-800 border border-amber-500/50 outline-none text-charcoal"
            />
          ) : (
            <span
              className={`flex-1 min-w-0 text-xs sm:text-sm truncate font-medium ${
                isActive ? "font-semibold text-[#B58D3D]" : "text-charcoal"
              }`}
            >
              {note.title.trim() || "（タイトルなし）"}
            </span>
          )}

          {/* ホバー時の子ページ作成ボタン */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCreateChildNote(note.id);
            }}
            className="w-7 h-7 flex items-center justify-center rounded-lg opacity-0 group-hover:opacity-100 transition-all text-charcoal-light hover:text-[#B58D3D] hover:bg-black/5 dark:hover:bg-white/5 focus:opacity-100 shrink-0"
            title="子ページを追加"
            aria-label="子ページを追加"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 子ノード再帰描画 */}
        {hasChildren && isExpanded && (
          <div className="relative">
            <div
              className="absolute top-0 bottom-2 w-px bg-black/5 dark:bg-white/5"
              style={{ left: `${depth * 16 + 19}px` }}
            />
            {children.map(renderNode)}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside
      className="flex flex-col h-full w-full bg-[var(--bg-card-solid)] border-r border-black/[0.04] dark:border-white/[0.05] select-none"
      style={{ minWidth: "240px" }}
    >
      {/* ── 最上部ヘッダー（左: 折りたたみ / 中: ドキュメント / 右: 新規作成） ── */}
      <div className="flex items-center justify-between px-3.5 py-3 border-b border-black/[0.04] dark:border-white/[0.04]">
        <div className="flex items-center gap-1.5 min-w-0">
          {onCloseSidebar && (
            <button
              type="button"
              onClick={onCloseSidebar}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-charcoal-light hover:text-charcoal hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              title="サイドバーを閉じる"
              aria-label="サイドバーを閉じる"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          )}

          <span className="text-xs font-semibold tracking-tight text-charcoal truncate">
            ドキュメント
          </span>
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-black/5 dark:bg-white/10 text-charcoal-light">
            {notes.length}
          </span>
        </div>

        <button
          type="button"
          onClick={onCreateRootNote}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-[#B58D3D] hover:bg-[#B58D3D]/10 active:scale-95 transition-all"
          title="新規ページを作成"
          aria-label="新規ページを作成"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* ── ルート階層へのドロップターゲット（ドラッグ中のみ表示または常に利用可能） ── */}
      {draggedNoteId && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setIsDragOverRoot(true);
          }}
          onDragLeave={() => setIsDragOverRoot(false)}
          onDrop={handleDropOnRoot}
          className={`mx-2 my-1.5 p-2 rounded-xl text-center text-xs font-semibold transition-all border border-dashed ${
            isDragOverRoot
              ? "bg-amber-500/20 text-amber-800 dark:text-amber-300 border-amber-500"
              : "bg-black/[0.02] dark:bg-white/[0.03] text-charcoal-light border-black/10 dark:border-white/10"
          }`}
        >
          <FolderRoot size={14} className="inline mr-1.5" />
          <span>トップ階層（ルート）へ移動</span>
        </div>
      )}

      {/* ノートツリー一覧 */}
      <div
        className="flex-1 overflow-y-auto px-2 py-2.5 pb-20 space-y-0.5"
        onDragOver={(e) => {
          // ツリーの余白部分でのドロップもルート移動とする
          if (draggedNoteId && e.target === e.currentTarget) {
            e.preventDefault();
          }
        }}
        onDrop={(e) => {
          if (draggedNoteId && e.target === e.currentTarget) {
            handleDropOnRoot(e);
          }
        }}
      >
        {tree.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 px-4 text-center">
            <FileText className="w-8 h-8 text-charcoal-xlight mb-2 stroke-[1.5]" />
            <p className="text-xs text-charcoal-light mb-3">ページがまだありません</p>
            <button
              type="button"
              onClick={onCreateRootNote}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-[#B58D3D] text-white shadow-sm hover:brightness-105 transition-all cursor-pointer border-none"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>最初のページを作成</span>
            </button>
          </div>
        ) : (
          tree.map(renderNode)
        )}
      </div>

      {/* ── 右クリックカスタムコンテキストメニュー ── */}
      {contextMenu && (
        <NoteContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          note={contextMenu.note}
          onClose={() => setContextMenu(null)}
          onRename={(note) => {
            setRenamingNoteId(note.id);
            setRenameTitle(note.title);
          }}
          onCreateChild={(noteId) => {
            onCreateChildNote(noteId);
            setExpandedIds((prev) => new Set(prev).add(noteId));
          }}
          onMove={(note) => {
            onOpenMoveModal?.(note);
          }}
          onDelete={(note) => {
            onDeleteNote?.(note);
          }}
        />
      )}
    </aside>
  );
};
