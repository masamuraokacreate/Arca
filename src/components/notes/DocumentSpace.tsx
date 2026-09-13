/**
 * src/components/notes/DocumentSpace.tsx
 * Arca — ノート（Pages / Document）専用 2カラムワークスペース（Windowsエクスプローラー風 パンくずアドレスバー統合）
 *
 * Apple HIG & Core/Rules.md 準拠:
 * - 絵文字不使用（Lucide React SVG アイコン統一）
 * - 左サイドバー（階層ツリー） ＋ 右メイン（エクスプローラー風アドレスバー ＆ エディタ）の2カラム構成
 * - PanelLeftClose / PanelLeftOpen によるサイドバー折りたたみトグル
 * - 上部パンくずアドレスバーによる現在地の直感的可視化 ＆ 階層ジャンプ
 * - モバイル時はドロワーオーバーレイ対応
 */

import React, { useState, useEffect, useMemo } from "react";
import type { NoteItem, NoteSpaceType, NoteBreadcrumb } from "../../types";
import { DocumentTreeSidebar } from "./DocumentTreeSidebar";
import {
  PanelLeftOpen,
  FileText,
  Plus,
  ChevronRight,
  FolderRoot,
} from "lucide-react";
import { getBreadcrumbs } from "../../utils/noteHierarchy";

interface DocumentSpaceProps {
  notes: NoteItem[];
  activeNoteId: string | null;
  onSelectNote: (id: string) => void;
  onCreateRootNote: () => void;
  onCreateChildNote: (parentId: string) => void;
  onMoveNote: (noteId: string, newParentId: string | null) => void;
  onRenameNote?: (id: string, newTitle: string) => void;
  onDeleteNote?: (note: NoteItem) => void;
  onOpenMoveModal?: (note: NoteItem) => void;
  children: React.ReactNode;
  activeSpace?: NoteSpaceType;
  onSpaceChange?: (space: NoteSpaceType) => void;
  spaceCounts?: {
    memo: number;
    document: number;
    journal: number;
  };
}

export const DocumentSpace: React.FC<DocumentSpaceProps> = ({
  notes,
  activeNoteId,
  onSelectNote,
  onCreateRootNote,
  onCreateChildNote,
  onMoveNote,
  onRenameNote,
  onDeleteNote,
  onOpenMoveModal,
  children,
  activeSpace,
  onSpaceChange,
  spaceCounts,
}) => {
  // デスクトップでは初期表示でサイドバーを開き、モバイルでは閉じる
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (typeof window !== "undefined") {
      return window.innerWidth >= 768;
    }
    return true;
  });

  // モバイル判定
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window !== "undefined") {
      return window.innerWidth < 768;
    }
    return false;
  });

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // ノート選択時にモバイルならサイドバーを自動で閉じる
  const handleSelectNote = (id: string) => {
    onSelectNote(id);
    if (isMobile) {
      setIsSidebarOpen(false);
    }
  };

  // パンくずの算出
  const breadcrumbs = useMemo(() => {
    if (!activeNoteId) return [];
    return getBreadcrumbs(notes, activeNoteId);
  }, [notes, activeNoteId]);

  return (
    <div className="flex flex-row w-full h-[calc(100dvh-94px-env(safe-area-inset-top,0px))] md:h-[calc(100dvh-52px-env(safe-area-inset-top,0px))] overflow-hidden relative">
      {/* ── デスクトップ サイドバー ── */}
      <div
        className={`hidden md:block transition-all duration-300 ease-in-out shrink-0 overflow-hidden ${
          isSidebarOpen ? "w-64 lg:w-72 opacity-100" : "w-0 opacity-0 pointer-events-none"
        }`}
      >
        <div className="w-64 lg:w-72 h-full">
          <DocumentTreeSidebar
            notes={notes}
            activeNoteId={activeNoteId}
            onSelectNote={handleSelectNote}
            onCreateRootNote={onCreateRootNote}
            onCreateChildNote={onCreateChildNote}
            onMoveNote={onMoveNote}
            onRenameNote={onRenameNote}
            onDeleteNote={onDeleteNote}
            onOpenMoveModal={onOpenMoveModal}
            onCloseSidebar={() => setIsSidebarOpen(false)}
            activeSpace={activeSpace}
            onSpaceChange={onSpaceChange}
            spaceCounts={spaceCounts}
          />
        </div>
      </div>

      {/* ── モバイル ドロワー（オーバーレイ） ── */}
      {isMobile && isSidebarOpen && (
        <div
          className="fixed inset-0 z-50 flex md:hidden"
          role="dialog"
          aria-modal="true"
        >
          {/* 背景ディマー */}
          <div
            className="fixed inset-0 bg-black/25 backdrop-blur-sm transition-opacity"
            onClick={() => setIsSidebarOpen(false)}
          />

          {/* ドロワーパネル */}
          <div className="relative w-4/5 max-w-xs h-full bg-[var(--bg-card-solid)] shadow-2xl z-10 flex flex-col">
            <DocumentTreeSidebar
              notes={notes}
              activeNoteId={activeNoteId}
              onSelectNote={handleSelectNote}
              onCreateRootNote={onCreateRootNote}
              onCreateChildNote={onCreateChildNote}
              onMoveNote={onMoveNote}
              onRenameNote={onRenameNote}
              onDeleteNote={onDeleteNote}
              onOpenMoveModal={onOpenMoveModal}
              onCloseSidebar={() => setIsSidebarOpen(false)}
              activeSpace={activeSpace}
              onSpaceChange={onSpaceChange}
              spaceCounts={spaceCounts}
            />
          </div>
        </div>
      )}

      {/* ── 右メイン執筆エリア（Windowsエクスプローラー風アドレスバー ＆ エディタ） ── */}
      <main className="flex-1 h-full min-h-0 overflow-hidden bg-transparent relative flex flex-col min-w-0">
        {/* ── Windowsエクスプローラー風 パンくずアドレスバー ── */}
        <div className="w-full flex items-center justify-between px-3.5 py-2 border-b border-black/[0.04] dark:border-white/[0.05] bg-[var(--bg-card-solid)]/75 backdrop-blur-md shrink-0 select-none z-10">
          <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-x-auto no-scrollbar py-0.5">
            {/* サイドバー開くボタン（サイドバーが閉じている時にスマート表示） */}
            {!isSidebarOpen && (
              <button
                type="button"
                onClick={() => setIsSidebarOpen(true)}
                aria-label="ページ一覧を開く"
                className="h-7 px-2 mr-1 rounded-lg bg-stone-200/60 dark:bg-stone-800 text-charcoal-light hover:text-charcoal hover:bg-stone-200 transition-colors flex items-center gap-1 text-xs shrink-0 cursor-pointer border-none"
                title="ページ一覧を開く"
              >
                <PanelLeftOpen className="w-3.5 h-3.5 text-[#B58D3D]" />
                <span className="hidden sm:inline font-medium">一覧</span>
              </button>
            )}

            {/* パンくずリスト */}
            <div className="flex items-center gap-1 text-xs font-medium text-charcoal-light truncate">
              <button
                type="button"
                onClick={() => onSelectNote("")}
                className="flex items-center gap-1 text-charcoal-light hover:text-charcoal hover:bg-black/5 dark:hover:bg-white/5 px-1.5 py-0.5 rounded transition-colors cursor-pointer border-none bg-transparent shrink-0"
                title="Pages ホーム"
              >
                <FolderRoot size={13} className="text-[#B58D3D]" />
                <span className="font-semibold">Pages</span>
              </button>

              {breadcrumbs
                .filter((c): c is NoteBreadcrumb & { id: string } => Boolean(c.id))
                .map((crumb, idx, arr) => {
                  const isLast = idx === arr.length - 1;
                  return (
                    <React.Fragment key={crumb.id}>
                      <ChevronRight size={12} className="text-charcoal-xlight shrink-0" />
                      <button
                        type="button"
                        onClick={() => onSelectNote(crumb.id)}
                        className={`truncate max-w-[130px] sm:max-w-[200px] px-1.5 py-0.5 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer border-none bg-transparent ${
                          isLast
                            ? "font-semibold text-charcoal dark:text-stone-100"
                            : "text-charcoal-light hover:text-charcoal"
                        }`}
                        title={crumb.title}
                      >
                        {crumb.title.trim() || "（タイトルなし）"}
                      </button>
                    </React.Fragment>
                  );
                })}
            </div>
          </div>

          {/* 右側アクション: ＋ 子ページ追加 */}
          {activeNoteId && (
            <div className="flex items-center gap-2 shrink-0 ml-2">
              <button
                type="button"
                onClick={() => onCreateChildNote(activeNoteId)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-semibold text-amber-800 dark:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 transition-all cursor-pointer border-none shadow-2xs"
                title="このノートの配下に子ページを作成"
              >
                <Plus size={13} strokeWidth={2.5} />
                <span>子ページ</span>
              </button>
            </div>
          )}
        </div>

        {/* モバイル時のフローティングボタン（サイドバーが閉じていてノート表示中の場合） */}
        {isMobile && !isSidebarOpen && (
          <div className="fixed bottom-6 left-6 z-40">
            <button
              type="button"
              onClick={() => setIsSidebarOpen(true)}
              className="w-12 h-12 rounded-full bg-[#B58D3D] text-white shadow-lg flex items-center justify-center hover:brightness-105 active:scale-95 transition-all cursor-pointer border-none"
              title="ページ一覧"
              aria-label="ページ一覧"
            >
              <PanelLeftOpen className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* ノートエディタ または 空状態プレースホルダー */}
        {children ? (
          <div className="w-full flex-1 h-full min-h-0 flex flex-col">{children}</div>
        ) : (
          <div className="flex flex-col items-center justify-center flex-1 h-full px-4 py-16 text-center select-none m-auto">
            <div className="w-16 h-16 rounded-3xl bg-[var(--bg-card-solid)] shadow-[0_2px_12px_rgba(0,0,0,0.04)] flex items-center justify-center text-[#8E8E93]/50 mb-4">
              <FileText className="w-8 h-8 stroke-[1.5]" />
            </div>
            <h3 className="text-base font-semibold text-[#2C2C2E] dark:text-[#F2F2F7] mb-1">
              ページを選択してください
            </h3>
            <p className="text-xs text-[#8E8E93] max-w-sm mb-6 leading-relaxed">
              左のサイドバーからページを選択するか、新しいドキュメントを作成して思考を整理しましょう。
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onCreateRootNote}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-[#B58D3D] text-white text-xs font-semibold shadow-sm hover:brightness-105 active:scale-95 transition-all cursor-pointer border-none"
              >
                <Plus className="w-4 h-4" />
                <span>新しいページを作成</span>
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
