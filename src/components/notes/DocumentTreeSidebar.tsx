/**
 * src/components/notes/DocumentTreeSidebar.tsx
 * Arca — ノート（Pages）専用 階層ツリーサイドバー
 * 
 * Apple HIG & Core/Rules.md 準拠:
 * - 絵文字不使用（Lucide React SVG アイコン統一）
 * - アイボリー背景、枠線なし、微細シャドウ、マットゴールドのアクセント
 * - タップ領域 44px 以上、インデント可視化
 * - 階層ツリーの開閉、ルート作成、子ページ作成
 */

import React, { useState, useEffect, useMemo, useCallback } from "react";
import type { NoteItem } from "../../types";
import {
  Folder,
  FolderOpen,
  FileText,
  ChevronRight,
  ChevronDown,
  Plus,
  PanelLeftClose,
} from "lucide-react";
import { C } from "../../lib/designSystem";
import type { NoteSpaceType } from "../../types";

interface DocumentTreeSidebarProps {
  notes: NoteItem[];
  activeNoteId: string | null;
  onSelectNote: (id: string) => void;
  onCreateRootNote: () => void;
  onCreateChildNote: (parentId: string) => void;
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
  onCloseSidebar,
  activeSpace: _activeSpace = "document",
  onSpaceChange: _onSpaceChange,
  spaceCounts: _spaceCounts,
}) => {
  // 開閉状態管理（ノードIDのSet）
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // ツリー構築
  const tree = useMemo(() => {
    const noteMap = new Map<string, NoteItem>();
    const childrenMap = new Map<string | null, NoteItem[]>();

    notes.forEach((n) => {
      noteMap.set(n.id, n);
      const pid = n.parentId ?? null;
      const list = childrenMap.get(pid) || [];
      list.push(n);
      childrenMap.set(pid, list);
    });

    // ソート（更新日降順またはタイトル順など、ここでは更新日降順）
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

  const renderNode = (node: TreeNode) => {
    const { note, depth, children } = node;
    const hasChildren = children.length > 0;
    const isExpanded = expandedIds.has(note.id);
    const isActive = note.id === activeNoteId;

    return (
      <div key={note.id} className="select-none">
        <div
          onClick={() => onSelectNote(note.id)}
          className="group relative flex items-center min-h-[44px] px-2 py-1.5 rounded-xl cursor-pointer transition-colors duration-150"
          style={{
            paddingLeft: `${Math.max(8, depth * 16 + 8)}px`,
            backgroundColor: isActive ? "rgba(181, 141, 61, 0.12)" : "transparent",
            color: isActive ? C.goldDark : C.charcoal,
          }}
        >
          {/* 開閉ボタン */}
          <button
            type="button"
            onClick={(e) => hasChildren && toggleExpand(note.id, e)}
            className={`w-6 h-6 flex items-center justify-center rounded-lg transition-colors ${
              hasChildren
                ? "text-[#8E8E93] hover:text-[#2C2C2E] hover:bg-black/5"
                : "opacity-0 pointer-events-none"
            }`}
            aria-label={isExpanded ? "折りたたむ" : "展開する"}
          >
            {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>

          {/* アイコン */}
          <div className="flex-shrink-0 mx-1.5 text-[#8E8E93] group-hover:text-[#2C2C2E]">
            {hasChildren ? (
              isExpanded ? (
                <FolderOpen className="w-4 h-4 text-[#B58D3D]" />
              ) : (
                <Folder className="w-4 h-4 text-[#8E8E93]" />
              )
            ) : (
              <FileText className="w-4 h-4" />
            )}
          </div>

          {/* タイトル */}
          <span
            className={`flex-1 min-w-0 text-sm truncate font-medium ${
              isActive ? "font-semibold text-[#B58D3D]" : "text-[#2C2C2E]"
            }`}
          >
            {note.title.trim() || "（タイトルなし）"}
          </span>

          {/* ホバー時の子ページ作成ボタン */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCreateChildNote(note.id);
            }}
            className="w-7 h-7 flex items-center justify-center rounded-lg opacity-0 group-hover:opacity-100 transition-all text-[#8E8E93] hover:text-[#B58D3D] hover:bg-black/5 focus:opacity-100"
            title="サブページを追加"
            aria-label="サブページを追加"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 子ノード再帰描画 */}
        {hasChildren && isExpanded && (
          <div className="relative">
            {/* 階層ガイド線（微細なライン） */}
            <div
              className="absolute top-0 bottom-2 w-px bg-black/5"
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
      className="flex flex-col h-full w-full bg-stone-100/50 dark:bg-stone-900/40 select-none"
      style={{ minWidth: "240px" }}
    >
      {/* ── 最上部ヘッダー（左: 折りたたみ / 中: ドキュメント / 右: 新規作成） ── */}
      <div className="flex items-center justify-between px-3.5 py-3 border-b border-black/[0.04] dark:border-white/[0.04]">
        <div className="flex items-center gap-1.5 min-w-0">
          {/* 左上: サイドバー折りたたみボタン */}
          {onCloseSidebar && (
            <button
              type="button"
              onClick={onCloseSidebar}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-[#8E8E93] hover:text-[#2C2C2E] hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              title="サイドバーを閉じる"
              aria-label="サイドバーを閉じる"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          )}

          <span className="text-xs font-semibold tracking-tight text-[#2C2C2E] dark:text-[#E5E5EA] truncate">
            ドキュメント
          </span>
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-black/5 dark:bg-white/10 text-[#8E8E93]">
            {notes.length}
          </span>
        </div>

        {/* 右上: ルートページ作成ボタン */}
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

      {/* ノートツリー一覧 */}
      <div className="flex-1 overflow-y-auto px-2 py-3 pb-20 space-y-0.5">
        {tree.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 px-4 text-center">
            <FileText className="w-8 h-8 text-[#8E8E93]/40 mb-2 stroke-[1.5]" />
            <p className="text-xs text-[#8E8E93] mb-3">ページがまだありません</p>
            <button
              type="button"
              onClick={onCreateRootNote}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-[#B58D3D] text-white shadow-sm hover:brightness-105 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>最初のページを作成</span>
            </button>
          </div>
        ) : (
          tree.map(renderNode)
        )}
      </div>
    </aside>
  );
};
