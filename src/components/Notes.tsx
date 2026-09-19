/**
 * src/components/Notes.tsx
 * Arca — Notes / Knowledge モジュール (Apple HIG × Arca デザインシステム準拠)
 *
 * デザイン原則 (Core/Rules.md):
 *  - アイボリーベースの繊細なグラデーション背景
 *  - チャコールグレーのテキスト (#2C2C2E)
 *  - マットゴールドのアクセント (#C5A059)
 *  - 枠線なし・薄いシャドウ
 *  - 広大な余白、思考を妨げない静寂な空間
 *
 * 主な機能:
 *  ① ダッシュボード — グリッド一覧、検索、タグフィルター、ソート、ごみ箱、.mdインポート
 *  ② ノートビューア — デフォルトは「閲覧（Read）」モード。
 *  ③ NoteEditor — 最下部40vh余白、安定したAuto-resize、スラッシュコマンド
 *  ④ MarkdownViewer — フルMarkdown完全対応（箇条書き・テーブル・コードコピー・タスクリスト）
 *  ⑤ NoteToolbar — 閲覧/編集、.md保存、.md読み込み、Markdown構文ガイド、Aether抽出、全画面、TOC、削除確認
 *  ⑥ ConfirmModal — 誤操作防止の削除確認ダイアログ
 */

import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
  Component,
  type ErrorInfo,
  type ReactNode,
} from "react";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import type {
  NoteItem,
  NoteBreadcrumb,
  ExtractedActionableItems,
  NoteChildViewMode,
  JournalMood,
  NoteContextSnapshot,
  NoteSpaceType,
} from "../types";
import { MemoModal } from "./notes/MemoModal";
import { MemoSpace } from "./notes/MemoSpace";
import { DocumentSpace } from "./notes/DocumentSpace";
import { ExplorerHomeView } from "./notes/ExplorerHomeView";
import { JournalSpace } from "./notes/JournalSpace";
import { NotesSpaceNav } from "./notes/NotesSpaceNav";
import {
  Sparkles,
  Folder,
  FileText,
  PanelLeftOpen,
  ChevronRight,
  Trash2,
  X,
  RotateCcw,
} from "lucide-react";
import { C } from "../lib/designSystem";
import { useUndoToast } from "../hooks/useUndoToast";
import { UndoToast } from "./common/UndoToast";
import { logger } from "../services/loggerService";
import { extractActionableItems } from "../lib/aetherCore";
import { AetherExtractModal } from "./notes/AetherExtractModal";
import { NoteEditor, type NoteEditorHandles } from "./notes/NoteEditor";
import { NoteToolbar } from "./notes/NoteToolbar";
import { MarkdownGuideModal } from "./notes/MarkdownGuideModal";
import { ConfirmModal } from "./notes/ConfirmModal";
import { NoteBreadcrumbs } from "./notes/NoteBreadcrumbs";
import { MoveNoteModal } from "./notes/MoveNoteModal";
import { MoodPicker } from "./notes/MoodPicker";
import { NoteIcon, NoteIconPickerModal } from "./notes/NoteIconPickerModal";
import { useDocumentSpace } from "./notes/DocumentSpaceContext";
import {
  fetchDailyFootprint,
  formatFootprintMarkdown,
} from "../services/footprintService";
import {
  getBreadcrumbs,
  getChildNotes,
  getChildCount,
  getDescendantNoteIds,
  canMoveNoteTo,
} from "../utils/noteHierarchy";
import { downloadMarkdownFile, readMarkdownFile } from "../utils/markdownDownload";

// ─────────────────────────────────────────
// ユーティリティ
// ─────────────────────────────────────────

function nowIso(): string {
  return new Date().toISOString();
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

export interface TocItem {
  id: string;
  level: number;
  text: string;
}

function extractToc(content: string): TocItem[] {
  const lines = content.split("\n");
  const toc: TocItem[] = [];
  let isCodeBlock = false;
  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      isCodeBlock = !isCodeBlock;
      continue;
    }
    if (isCodeBlock) continue;

    const match = line.match(/^(#{1,3})\s+(.+)$/);
    if (match) {
      const text = match[2].trim().replace(/[*_`]/g, "");
      let safeId = "";
      try {
        safeId = encodeURIComponent(text);
      } catch {
        safeId = text.replace(/[^a-zA-Z0-9]/g, "");
      }
      toc.push({
        id: safeId,
        level: match[1].length,
        text: text,
      });
    }
  }
  return toc;
}

// ─────────────────────────────────────────
// グローバルスタイル
// ─────────────────────────────────────────

const GLOBAL_STYLES = `
  /* ── Markdown prose ── */
  .arca-prose {
    color: ${C.charcoal};
    font-size: 1.0125rem;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Hiragino Sans", "Segoe UI", sans-serif;
  }
  .arca-prose h1 {
    font-size: 1.8rem;
    font-weight: 750;
    color: ${C.charcoal};
    margin: 0 0 1.4rem;
    letter-spacing: -0.028em;
    line-height: 1.2;
  }
  .arca-prose h2 {
    font-size: 1.25rem;
    font-weight: 650;
    color: ${C.charcoal};
    margin: 2.2rem 0 0.9rem;
    letter-spacing: -0.018em;
    line-height: 1.35;
    padding-bottom: 0.45rem;
    border-bottom: 1px solid rgba(0,0,0,0.06);
  }
  .arca-prose h3 {
    font-size: 1.05rem;
    font-weight: 650;
    color: ${C.charcoalMid};
    margin: 1.8rem 0 0.65rem;
    line-height: 1.4;
  }
  .arca-prose h4, .arca-prose h5, .arca-prose h6 {
    font-size: 0.95rem;
    font-weight: 600;
    color: ${C.charcoalMid};
    margin: 1.4rem 0 0.5rem;
  }
  .arca-prose p {
    margin: 0 0 1.25rem;
    line-height: 1.92;
  }

  /* 箇条書き・リスト（・が消えないように完全保証） */
  .arca-prose ul {
    list-style-type: disc !important;
    margin: 0.8rem 0 1.25rem;
    padding-left: 1.6rem !important;
    line-height: 1.88;
  }
  .arca-prose ol {
    list-style-type: decimal !important;
    margin: 0.8rem 0 1.25rem;
    padding-left: 1.6rem !important;
    line-height: 1.88;
  }
  .arca-prose ul ul {
    list-style-type: circle !important;
    margin: 0.25rem 0;
  }
  .arca-prose ol ol {
    list-style-type: lower-latin !important;
    margin: 0.25rem 0;
  }
  .arca-prose li {
    display: list-item !important;
    margin-bottom: 0.38rem;
    color: ${C.charcoal};
  }
  .arca-prose ul.contains-task-list {
    list-style-type: none !important;
    padding-left: 0.2rem !important;
  }
  .arca-prose li.task-list-item {
    list-style-type: none !important;
    display: flex !important;
    align-items: flex-start;
    gap: 0.5rem;
  }

  /* ── ノートカード ── */
  .arca-note-card {
    transition: transform 0.22s ease, box-shadow 0.22s ease;
  }
  .arca-note-card:hover {
    transform: translateY(-3px);
    box-shadow: ${C.cardShadowHover} !important;
  }
  .arca-note-card:active {
    transform: translateY(-1px);
  }

  /* ── カードの「…」メニュー ── */
  .arca-card-menu {
    opacity: 0;
    transition: opacity 0.15s;
  }
  .arca-note-card:hover .arca-card-menu {
    opacity: 1;
  }

  /* ── エディタ textarea ── */
  .arca-editor-ta {
    font-family: -apple-system, 'SF Pro Text', 'Helvetica Neue', sans-serif;
    caret-color: ${C.gold};
  }
  .arca-editor-ta::placeholder {
    color: ${C.charcoalXLight};
  }

  /* ── スクロールバー ── */
  .arca-scroll::-webkit-scrollbar {
    width: 4px;
    height: 4px;
  }
  .arca-scroll::-webkit-scrollbar-track {
    background: transparent;
  }
  .arca-scroll::-webkit-scrollbar-thumb {
    background: rgba(0,0,0,0.1);
    border-radius: 99px;
  }

  /* ── スラッシュメニュー ── */
  @keyframes slash-in {
    from { opacity: 0; transform: translateY(5px) scale(0.96); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
  .arca-slash-menu {
    animation: slash-in 0.14s ease;
  }

  /* ── 画面遷移 ── */
  @keyframes view-in {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .arca-view-in {
    animation: view-in 0.22s ease;
  }

  /* ── Full Width トグルアニメーション ── */
  .arca-layout-container {
    transition: max-width 0.28s ease, padding 0.28s ease, border-radius 0.28s ease;
  }

  /* ── ツールバー（Apple風レスポンシブ & 安定Sticky） ── */
  .arca-toolbar {
    position: sticky;
    top: 0;
    z-index: 50;
    width: 100%;
    background: var(--bg-surface-glass);
    backdrop-filter: blur(16px) saturate(180%);
    -webkit-backdrop-filter: blur(16px) saturate(180%);
    box-shadow: 0 1px 0 var(--border-subtle);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 1.25rem;
    height: 48px;
    gap: 0.4rem;
    box-sizing: border-box;
    overflow-x: auto;
    overflow-y: hidden;
    white-space: nowrap;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }
  .arca-toolbar::-webkit-scrollbar {
    display: none;
  }

  /* ツールバーボタン共通 */
  .arca-tb-btn {
    white-space: nowrap;
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    border-radius: 8px;
    font-size: 0.78rem;
    font-weight: 500;
    cursor: pointer;
    border: none;
    transition: all 0.15s ease;
    user-select: none;
    height: 32px;
    padding: 0 0.65rem;
    color: ${C.charcoalMid};
    background: transparent;
  }
  .arca-tb-btn:hover {
    color: ${C.charcoal};
    background: rgba(0, 0, 0, 0.04);
  }
  .arca-tb-btn:active {
    transform: scale(0.97);
  }

  /* モバイル非表示（デスクトップ専用）ボタン */
  @media (max-width: 639px) {
    .arca-tb-btn-desktop-only {
      display: none !important;
    }
    .arca-tb-divider-desktop-only {
      display: none !important;
    }
  }

  /* アクティブなトグルボタン */
  .arca-tb-btn.active {
    color: ${C.gold};
    background: ${C.goldFaint2};
    font-weight: 600;
  }

  /* 削除ボタン */
  .arca-tb-btn-delete {
    color: ${C.charcoalLight};
  }
  .arca-tb-btn-delete:hover {
    color: #c0614a !important;
    background: rgba(192, 97, 74, 0.08) !important;
  }

  /* セグメントコントロール（閲覧 / 編集） */
  .arca-segment-control {
    display: inline-flex;
    align-items: center;
    background: rgba(0, 0, 0, 0.05);
    padding: 2px;
    border-radius: 9px;
    flex-shrink: 0;
    gap: 1px;
  }
  .arca-segment-btn {
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    border: none;
    border-radius: 7px;
    padding: 0.3rem 0.65rem;
    cursor: pointer;
    font-size: 0.75rem;
    font-weight: 500;
    color: ${C.charcoalLight};
    background: transparent;
    transition: all 0.15s ease;
    user-select: none;
    height: 28px;
    flex-shrink: 0;
  }
  .arca-segment-btn.active {
    background: var(--bg-nav-pill);
    color: var(--text-main);
    font-weight: 600;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08), 0 0 1px rgba(0, 0, 0, 0.04);
  }

  /* 区切り線 */
  .arca-tb-divider {
    width: 1px;
    height: 18px;
    background: rgba(0, 0, 0, 0.08);
    flex-shrink: 0;
    margin: 0 0.15rem;
  }

  /* レスポンシブラベル: PC（1024px以上）でデスクトップラベル表示、画面が狭まったら（1024px未満）非表示 */
  .arca-btn-label-desktop {
    display: none;
    white-space: nowrap;
  }
  @media (min-width: 1024px) {
    .arca-btn-label-desktop {
      display: inline !important;
    }
  }

  /* モバイルラベル: スマホ（639px以下）で短縮ラベル表示、それ以上では非表示 */
  .arca-btn-label-mobile {
    display: none;
    white-space: nowrap;
  }

  /* ── ノートダッシュボード用ボタンスタイル ── */
  .arca-notes-btn-primary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.45rem;
    background: ${C.gold};
    color: #FDFCFA;
    border: none;
    border-radius: 12px;
    padding: 0 1.25rem;
    height: 42px;
    font-size: 0.84rem;
    font-weight: 650;
    letter-spacing: 0.02em;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    box-shadow: 0 2px 12px rgba(197, 160, 89, 0.32);
    transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
    user-select: none;
  }
  .arca-notes-btn-primary:hover {
    box-shadow: 0 5px 20px rgba(197, 160, 89, 0.45);
    transform: translateY(-1px);
  }
  .arca-notes-btn-primary:active {
    transform: translateY(0);
  }

  .arca-notes-btn-sub {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    background: rgba(0, 0, 0, 0.04);
    color: ${C.charcoalMid};
    border: none;
    border-radius: 12px;
    padding: 0 0.85rem;
    height: 42px;
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    transition: all 0.15s ease;
    user-select: none;
  }
  .arca-notes-btn-sub:hover {
    background: rgba(0, 0, 0, 0.07);
    color: ${C.charcoal};
  }
  .arca-notes-btn-sub:active {
    transform: scale(0.98);
  }

  /* 検索入力欄共通 */
  .arca-notes-search-input {
    width: 100%;
    height: 42px;
    background: var(--bg-surface);
    color: var(--text-main);
    border: none;
    border-radius: 12px;
    padding: 0 0.75rem 0 2.35rem;
    font-size: 0.85rem;
    box-shadow: 0 1px 4px rgba(0,0,0,0.03);
    box-sizing: border-box;
    outline: none;
    transition: box-shadow 0.15s ease;
  }
  .arca-notes-search-input:focus {
    box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  }

  /* ソートセレクタ共通 */
  .arca-notes-sort-select {
    height: 42px;
    appearance: none;
    background-color: var(--bg-surface);
    color: var(--text-mid);
    border: none;
    border-radius: 12px;
    padding: 0 2.2rem 0 0.85rem;
    font-size: 0.82rem;
    font-weight: 500;
    cursor: pointer;
    box-shadow: 0 1px 4px rgba(0,0,0,0.03);
    outline: none;
    white-space: nowrap;
    background-image: url('data:image/svg+xml;utf8,<svg fill="%239A9A96" height="24" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg"><path d="M7 10l5 5 5-5z"/></svg>');
    background-repeat: no-repeat;
    background-position: right 0.4rem center;
  }

  /* PC・タブレット表示時（min-width: 640px） */
  @media (min-width: 640px) {
    .arca-notes-toolbar-grid {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.75rem;
    }
    .arca-notes-search-box {
      position: relative;
      flex: 1 1 240px;
      max-width: 380px;
    }
    .arca-notes-sort-box {
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }
    .arca-notes-sort-label {
      display: none;
    }
    .arca-notes-btn-new {
      margin-left: auto;
      order: 10;
    }
    .arca-notes-btn-trash {
      order: 8;
    }
    .arca-notes-btn-import {
      order: 9;
    }
  }

  /* モバイル表示時（max-width: 639px） */
  @media (max-width: 639px) {
    .arca-notes-toolbar-grid {
      display: grid;
      grid-template-columns: 1fr auto auto;
      gap: 0.6rem 0.5rem;
      align-items: center;
    }
    /* 【上段】検索バー + ごみ箱 + インポート */
    .arca-notes-search-box {
      position: relative;
      grid-column: 1 / 2;
      grid-row: 1;
      min-width: 0;
    }
    .arca-notes-btn-trash {
      grid-column: 2 / 3;
      grid-row: 1;
      height: 42px;
      padding: 0 0.75rem;
    }
    .arca-notes-btn-import {
      grid-column: 3 / 4;
      grid-row: 1;
      height: 42px;
      padding: 0 0.75rem;
    }
    /* 【下段】「＋ 新規ノート」フル幅ボタン */
    .arca-notes-btn-new {
      grid-column: 1 / -1;
      grid-row: 2;
      width: 100%;
      height: 44px;
      font-size: 0.88rem;
    }
    /* 【下段下】ソートセレクタ */
    .arca-notes-sort-box {
      grid-column: 1 / -1;
      grid-row: 3;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
    }
    .arca-notes-sort-label {
      display: inline;
      font-size: 0.75rem;
      color: ${C.charcoalLight};
      font-weight: 600;
      white-space: nowrap;
    }
    .arca-notes-sort-select {
      flex: 1;
      max-width: 240px;
    }

    .arca-toolbar {
      padding: 0 0.75rem;
      gap: 0.35rem;
    }
    .arca-btn-label-desktop {
      display: none !important;
    }
    .arca-btn-label-mobile {
      display: inline !important;
    }
    .arca-tb-btn {
      padding: 0 0.5rem;
      font-size: 0.75rem;
    }
    .arca-segment-btn {
      padding: 0 0.5rem;
      font-size: 0.72rem;
    }
    .arca-notes-btn-sub {
      height: 42px;
      padding: 0 0.75rem;
      font-size: 0.8rem;
    }
  }
`;

// ─────────────────────────────────────────
// ノートビューア（閲覧 ⇄ 編集 全画面）
// ─────────────────────────────────────────

export function NoteViewer({
  note,
  allNotes,
  breadcrumbs,
  onSelectBreadcrumb,
  childNotes: _childNotes,
  onSelectChildNote,
  onNewChildNote: _onNewChildNote,
  onDeleteChildNote: _onDeleteChildNote,
  onDownloadChildNote: _onDownloadChildNote,
  onMoveChildNote: _onMoveChildNote,
  isFullWidth,
  saveStatus,
  onBack,
  onTitleChange,
  onContentChange,
  onTagsChange,
  onAttachmentsChange,
  onDelete,
  onMoveNote,
  onImportMarkdown,
  onToggleFullWidth,
  onToastMessage,
  onChildViewModeChange: _onChildViewModeChange,
  onNewJournalNote: _onNewJournalNote,
  onMoodChange,
  onJournalDateChange,
  onContextSnapshotChange,
  onIconChange,
  onTogglePin,
  onToggleToc,
  isDocumentSpace = false,
}: {
  note: NoteItem;
  allNotes: NoteItem[];
  breadcrumbs: NoteBreadcrumb[];
  onSelectBreadcrumb: (id: string | null) => void;
  childNotes: NoteItem[];
  onSelectChildNote: (id: string) => void;
  onNewChildNote: () => void;
  onDeleteChildNote: (note: NoteItem) => void;
  onDownloadChildNote: (note: NoteItem) => void;
  onMoveChildNote?: (note: NoteItem) => void;
  isFullWidth: boolean;
  saveStatus: "idle" | "saving" | "saved";
  onBack: () => void;
  onTitleChange: (val: string) => void;
  onContentChange: (val: string) => void;
  onTagsChange: (tags: string[]) => void;
  onAttachmentsChange?: (attachments: Record<string, string>) => void;
  onDelete: () => void;
  onMoveNote?: () => void;
  onImportMarkdown?: () => void;
  onToggleFullWidth: () => void;
  onToastMessage?: (msg: string) => void;
  onChildViewModeChange?: (mode: NoteChildViewMode) => void;
  onNewJournalNote?: (targetDate: string) => void;
  onMoodChange?: (mood: JournalMood) => void;
  onJournalDateChange?: (date: string) => void;
  onContextSnapshotChange?: (snapshot: NoteContextSnapshot) => void;
  onIconChange?: (icon: string | null) => void;
  onTogglePin?: () => void;
  onToggleToc?: (showToc: boolean) => void;
  isDocumentSpace?: boolean;
}) {
  const [showToc, setShowToc] = useState(() => Boolean(note.showToc));
  const [isSourceMode, setIsSourceMode] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [showGuide, setShowGuide] = useState(false);
  const [isImportingFootprint, setIsImportingFootprint] = useState(false);
  const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);
  const editorRef = useRef<NoteEditorHandles>(null);
  const imageFileInputRef = useRef<HTMLInputElement>(null);

  const handleToggleToc = useCallback(() => {
    const next = !showToc;
    setShowToc(next);
    onToggleToc?.(next);
  }, [showToc, onToggleToc]);

  const docSpace = useDocumentSpace();

  // サイドバー展開ボタンスロット（すべてのデバイスで左端に配置）
  const sidebarToggleSlot = useMemo(() => {
    if (!docSpace) return null;
    const { isSidebarOpen, setIsSidebarOpen } = docSpace;
    if (isSidebarOpen) return null;
    return (
      <button
        type="button"
        onClick={() => setIsSidebarOpen(true)}
        aria-label="ページ一覧を開く"
        className="w-10 h-10 rounded-xl flex items-center justify-center text-charcoal-light hover:text-charcoal hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 transition-all shrink-0 cursor-pointer border-none bg-transparent -ml-1 sm:ml-0"
        title="ページ一覧を開く"
      >
        <PanelLeftOpen className="w-5 h-5 text-[#B58D3D]" />
      </button>
    );
  }, [docSpace]);

  // 統合ヘッダー用のパンくずスロット
  const breadcrumbSlot = useMemo(() => {
    if (!docSpace) return null;
    const { breadcrumbs: spaceCrumbs, onSelectNote: spaceSelectNote } = docSpace;
    const crumbs = spaceCrumbs.filter((c): c is NoteBreadcrumb & { id: string } => Boolean(c.id));
    return (
      <div className="flex items-center gap-1 text-xs font-medium text-charcoal-light truncate">
        {crumbs.map((crumb, idx) => {
          const isLast = idx === crumbs.length - 1;
          return (
            <React.Fragment key={crumb.id}>
              {idx > 0 && (
                <ChevronRight size={12} className="text-charcoal-xlight shrink-0" />
              )}
              <button
                type="button"
                onClick={() => spaceSelectNote(crumb.id)}
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
    );
  }, [docSpace]);

  const isJournalNote = Boolean(
    note.journalDate ||
    (note.tags && note.tags.some((t) => t.toLowerCase() === "ジャーナル" || t.toLowerCase() === "journal"))
  );

  const handleImportFootprint = async () => {
    if (isImportingFootprint) return;
    setIsImportingFootprint(true);
    try {
      const targetDate =
        note.journalDate ||
        (note.createdAt ? note.createdAt.split("T")[0] : new Date().toISOString().split("T")[0]);
      const footprint = await fetchDailyFootprint(targetDate);
      const md = formatFootprintMarkdown(footprint, targetDate);
      const updatedContent = note.content.trim()
        ? `${note.content.trim()}\n\n${md.trim()}`
        : md.trim();
      onContentChange(updatedContent);
      onContextSnapshotChange?.({
        completedTasks: footprint.completedTasks,
        events: footprint.events,
      });
      if (!note.journalDate) {
        onJournalDateChange?.(targetDate);
      }
      const totalCount = footprint.completedTasks.length + footprint.events.length;
      if (totalCount > 0) {
        onToastMessage?.(
          `「${targetDate}」の足跡（タスク${footprint.completedTasks.length}件、予定${footprint.events.length}件）を取り込みました`
        );
      } else {
        onToastMessage?.(`「${targetDate}」の予定・完了タスクはありませんでした（テンプレートを挿入しました）`);
      }
    } catch (e) {
      console.error("Footprint import failed", e);
      onToastMessage?.("足跡の取り込みに失敗しました");
    } finally {
      setIsImportingFootprint(false);
    }
  };

  // Aether Core 抽出ステート
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedData, setExtractedData] = useState<ExtractedActionableItems | null>(null);

  const handleExtract = async () => {
    if (!note.content.trim() || isExtracting) return;
    setIsExtracting(true);
    try {
      const res = await extractActionableItems(note.content);
      if (res) {
        setExtractedData(res);
      } else {
        onToastMessage?.("アクション項目を抽出できませんでした（APIキーの設定をご確認ください）");
      }
    } catch (e) {
      console.error("Extract failed", e);
      onToastMessage?.("抽出中にエラーが発生しました");
    } finally {
      setIsExtracting(false);
    }
  };

  // 既存の子ページで親の content にリンクが含まれていないものを自動同期・補完
  useEffect(() => {
    if (!note || !note.id || note.isDeleted) return;
    const currentChildren = allNotes.filter(
      (n) => n.parentId === note.id && !n.isDeleted
    );
    if (currentChildren.length === 0) return;

    const content = note.content || "";
    const missingChildren = currentChildren.filter((child) => {
      return (
        !content.includes(`[child-page:${child.id}]`) &&
        !content.includes(`note:${child.id}`) &&
        !content.includes(`data-page-id="${child.id}"`)
      );
    });

    if (missingChildren.length > 0) {
      const missingAppend = missingChildren
        .map((child) => `[child-page:${child.id}]`)
        .join("\n\n");
      const separator = content.trim() ? "\n\n" : "";
      const updated = `${content.trim()}${separator}${missingAppend}\n`;
      onContentChange(updated);
    }
  }, [note.id, allNotes]);

  // 本文中へのインライン子ページ作成・挿入ハンドラ
  const handleCreateAndInsertChildPage = async () => {
    try {
      const docRef = await addDoc(collection(db, "notes"), {
        title: "",
        content: "",
        tags: [],
        spaceType: note.spaceType || "document",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        isDeleted: false,
        parentId: note.id,
      });
      editorRef.current?.insertChildPageNode(docRef.id);
      onToastMessage?.("子ページを作成し、リンクカードを挿入しました");
    } catch (err) {
      console.error("Failed to insert child page:", err);
    }
  };

  // 画像ファイル選択後の処理
  const handleImageFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (editorRef.current) {
      await editorRef.current.insertImage(file);
      onToastMessage?.(`画像「${file.name}」を挿入しました`);
    }
    if (imageFileInputRef.current) {
      imageFileInputRef.current.value = "";
    }
  };

  // Markdownダウンロード
  const handleDownloadMarkdown = useCallback(() => {
    try {
      const fileName = downloadMarkdownFile(note.title, note.content);
      onToastMessage?.(`「${fileName}」をダウンロードしました`);
    } catch (e) {
      console.error("Download failed", e);
      onToastMessage?.("ダウンロード中にエラーが発生しました");
    }
  }, [note.title, note.content, onToastMessage]);

  // ノート切替時のリセット
  useEffect(() => {
    setTagInput("");
    setShowToc(Boolean(note.showToc));
    setExtractedData(null);
  }, [note.id, note.showToc]);

  const handleCommitTag = () => {
    if (!tagInput.trim()) return;
    const newTags = tagInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (newTags.length > 0) {
      const merged = Array.from(new Set([...note.tags, ...newTags]));
      onTagsChange(merged);
    }
    setTagInput("");
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      handleCommitTag();
    } else if (e.key === "Backspace" && !tagInput && note.tags.length > 0) {
      const lastTag = note.tags[note.tags.length - 1];
      onTagsChange(note.tags.slice(0, -1));
      setTagInput(lastTag);
    }
  };

  const handleInsertSyntax = useCallback((syntax: string) => {
    setTimeout(() => {
      editorRef.current?.insertSyntax(syntax);
    }, 50);
  }, []);

  const toc = extractToc(note.content);

  // 目次（TOC）サイドバーの描画（画面の一番右端に配置し本文の文字レイアウトを崩さない）
  const renderTocSidebar = (
    <aside
      data-testid="note-toc-sidebar"
      className="fixed top-28 right-4 sm:right-6 z-30 w-60 sm:w-64 max-h-[calc(100vh-8.5rem)] flex flex-col transition-all duration-200"
      style={{
        background: "var(--bg-card-solid)",
        backdropFilter: "blur(24px) saturate(180%)",
        WebkitBackdropFilter: "blur(24px) saturate(180%)",
        borderRadius: "18px",
        boxShadow: "var(--shadow-modal)",
        border: "1px solid var(--border-subtle)",
        overflow: "hidden",
      }}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)] shrink-0">
        <h4 className="text-xs font-bold text-charcoal-mid dark:text-stone-300 tracking-wider m-0">
          目次
        </h4>
        <button
          type="button"
          onClick={() => {
            setShowToc(false);
            onToggleToc?.(false);
          }}
          className="w-6 h-6 rounded-lg flex items-center justify-center text-charcoal-light hover:text-charcoal hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer border-none bg-transparent"
          title="目次を閉じる"
          aria-label="目次を閉じる"
        >
          <X size={14} />
        </button>
      </div>
      <div className="p-3 overflow-y-auto arca-scroll flex-1">
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.45rem" }}>
          {toc.length === 0 ? (
            <li style={{ fontSize: "0.75rem", color: C.charcoalXLight }}>見出しがありません</li>
          ) : (
            toc.map((t) => (
              <li key={t.id} style={{ paddingLeft: `${(t.level - 1) * 0.75}rem` }}>
                <a
                  href={`#${t.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    const el = document.getElementById(t.id);
                    if (el) {
                      const headerOffset = 80;
                      const elementPosition = el.getBoundingClientRect().top;
                      const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
                      window.scrollTo({ top: offsetPosition, behavior: "smooth" });
                    }
                  }}
                  style={{
                    fontSize: "0.8rem",
                    color: C.charcoalLight,
                    textDecoration: "none",
                    display: "block",
                    lineHeight: 1.4,
                    transition: "color 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLAnchorElement).style.color = C.gold;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLAnchorElement).style.color = C.charcoalLight;
                  }}
                >
                  {t.text}
                </a>
              </li>
            ))
          )}
        </ul>
      </div>
    </aside>
  );

  // エディタ本文（タイトル、メタ行、Tiptap、サブノート）
  const editorBody = (
    <>
      {/* 非DocumentSpace時のみ本文上にパンくずリスト（DocumentSpace時はヘッダーに統合） */}
      {!isDocumentSpace && (
        <NoteBreadcrumbs
          breadcrumbs={breadcrumbs}
          onSelectBreadcrumb={onSelectBreadcrumb}
        />
      )}

      {/* タイトル行（アイコン選択ボタン ＆ インラインタイトル編集） */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", marginBottom: "0.8rem" }}>
        {onIconChange && (
          <button
            type="button"
            onClick={() => setIsIconPickerOpen(true)}
            className="w-10 h-10 rounded-xl bg-amber-500/10 text-[#B58D3D] hover:bg-amber-500/20 flex items-center justify-center shrink-0 transition-all cursor-pointer border-none shadow-2xs group"
            title="アイコンを変更"
            aria-label="アイコンを変更"
          >
            <NoteIcon icon={note.icon} defaultIcon={<FileText className="w-5 h-5" />} className="w-5 h-5 group-hover:scale-110 transition-transform" />
          </button>
        )}
        <input
          type="text"
          value={note.title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="タイトルを入力…"
          style={{
            display: "block",
            width: "100%",
            background: "transparent",
            border: "none",
            outline: "none",
            fontSize: isDocumentSpace ? "clamp(1.85rem, 3.5vw, 2.35rem)" : "2rem",
            fontWeight: 750,
            color: C.charcoal,
            letterSpacing: "-0.03em",
            lineHeight: 1.2,
            boxSizing: "border-box",
          }}
        />
      </div>

      {/* メタ行（タグ・更新日） */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.6rem",
          marginBottom: "2rem",
          paddingBottom: "1.2rem",
          borderBottom: "1px solid rgba(0,0,0,0.06)",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flex: 1, flexWrap: "wrap" }}>
          {note.tags.map((tag) => (
            <span
              key={tag}
              style={{
                fontSize: "0.7rem",
                color: C.gold,
                background: C.goldFaint,
                borderRadius: "6px",
                padding: "0.15rem 0.55rem",
                letterSpacing: "0.05em",
                fontWeight: 500,
                display: "inline-flex",
                alignItems: "center",
                gap: "0.25rem",
              }}
            >
              <button
                type="button"
                onClick={() => {
                  onTagsChange(note.tags.filter((t) => t !== tag));
                  setTagInput(tag);
                }}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  color: C.gold,
                  fontSize: "inherit",
                  fontWeight: "inherit",
                }}
                title="クリックして編集"
              >
                #{tag}
              </button>
              <button
                type="button"
                onClick={() => onTagsChange(note.tags.filter((t) => t !== tag))}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  color: C.gold,
                  display: "flex",
                  alignItems: "center",
                  lineHeight: 1,
                }}
                title="削除"
              >
                ×
              </button>
            </span>
          ))}
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onBlur={handleCommitTag}
            onKeyDown={handleTagKeyDown}
            placeholder={note.tags.length === 0 ? "タグを追加（Enterで確定）" : "+ タグ追加"}
            style={{
              background: "transparent",
              border: "none",
              outline: "none",
              fontSize: "0.76rem",
              color: C.gold,
              letterSpacing: "0.04em",
              minWidth: "120px",
              flex: "0 1 auto",
            }}
          />
        </div>

        <span style={{ fontSize: "0.75rem", color: C.charcoalXLight }}>
          最終更新: {formatDateRelative(note.updatedAt)}
        </span>
      </div>

      {/* ── ジャーナル専用メタバー（Mood選択 ＆ 当日Footprint取り込み） ── */}
      {isJournalNote && (
        <div
          data-testid="journal-meta-bar"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "0.8rem",
            padding: "0.75rem 1rem",
            marginBottom: "1.5rem",
            borderRadius: "14px",
            background: "rgba(181, 141, 61, 0.05)",
            border: "1px solid rgba(181, 141, 61, 0.12)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 650, color: C.goldDark }}>
              今日の気分
            </span>
            <MoodPicker
              value={note.mood}
              onChange={(newMood) => {
                onMoodChange?.(newMood);
                onToastMessage?.("気分を記録しました");
              }}
            />
          </div>

          <button
            type="button"
            data-testid="import-footprint-btn"
            disabled={isImportingFootprint}
            onClick={handleImportFootprint}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
              background: C.goldFaint2,
              border: "none",
              borderRadius: "8px",
              padding: "0.35rem 0.75rem",
              fontSize: "0.75rem",
              fontWeight: 600,
              color: C.goldDark,
              cursor: isImportingFootprint ? "default" : "pointer",
              opacity: isImportingFootprint ? 0.6 : 1,
              transition: "all 0.15s ease",
            }}
            title="完了タスク・Google予定をタイムラインから自動引用"
          >
            <Sparkles size={13} style={{ color: C.gold }} />
            <span>{isImportingFootprint ? "足跡取り込み中…" : "今日の足跡を取り込む"}</span>
          </button>
        </div>
      )}



      {/* ── 抽出データ プレビュー ── */}
      {extractedData && (
        <div
          style={{
            background: "rgba(181, 141, 61, 0.06)",
            border: `1px solid ${C.goldFaint}`,
            borderRadius: "14px",
            padding: "1rem",
            marginBottom: "1.5rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "0.78rem", fontWeight: 700, color: C.goldDark }}>
              ✦ Aether 抽出プレビュー
            </span>
            <button
              onClick={() => setExtractedData(null)}
              style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: "0.8rem", color: C.charcoalLight }}
            >
              閉じる
            </button>
          </div>
          {extractedData.tasks.length > 0 && (
            <p style={{ margin: "0.2rem 0", fontSize: "0.78rem", color: C.charcoal }}>
              タスク候補: {extractedData.tasks.length}件
            </p>
          )}
          {extractedData.lists && extractedData.lists.length > 0 && (
            <p style={{ margin: "0.2rem 0", fontSize: "0.78rem", color: C.charcoal }}>
              リスト候補: {extractedData.lists.length}件
            </p>
          )}
        </div>
      )}

      {/* ── NoteEditor: Tiptap WYSIWYG エディタ本体 ── */}
      <NoteEditor
        ref={editorRef}
        noteId={note.id}
        content={note.content}
        attachments={note.attachments}
        onAttachmentsChange={onAttachmentsChange}
        onChange={onContentChange}
        isSourceMode={isSourceMode}
        onInsertChildPage={handleCreateAndInsertChildPage}
        onSelectNote={onSelectChildNote}
        allNotes={allNotes}
      />
    </>
  );

  return (
    <div className="arca-view-in flex flex-col w-full h-full min-h-0 flex-1 overflow-hidden">
      {/* 非表示の画像ファイル選択input */}
      <input
        ref={imageFileInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageFileSelected}
        style={{ display: "none" }}
      />

      {/* ────── ツールバー（パンくず統合 ＆ コントロール） ────── */}
      <NoteToolbar
        sidebarToggleSlot={isDocumentSpace ? sidebarToggleSlot : undefined}
        leftSlot={isDocumentSpace ? breadcrumbSlot : undefined}
        title={note.title}
        saveStatus={saveStatus}
        onBack={onBack}
        onMoveNote={onMoveNote}
        onInsertImage={() => imageFileInputRef.current?.click()}
        onExtract={handleExtract}
        isExtracting={isExtracting}
        canExtract={!!note.content.trim()}
        onDownloadMarkdown={handleDownloadMarkdown}
        onImportMarkdown={onImportMarkdown}
        onOpenGuide={() => setShowGuide(true)}
        isFullWidth={isFullWidth}
        onToggleFullWidth={onToggleFullWidth}
        showToc={showToc}
        onToggleToc={handleToggleToc}
        onDelete={onDelete}
        isSourceMode={isSourceMode}
        onToggleSourceMode={() => setIsSourceMode((s) => !s)}
        isPinned={Boolean(note.pinned)}
        onTogglePin={onTogglePin}
      />

      {/* ────── 本文コンテナ（Notion / Apple Notes風フラット執筆エリア） ────── */}
      <div
        className="flex-1 w-full h-full overflow-y-auto arca-scroll relative"
        style={{
          WebkitOverflowScrolling: "touch",
          overscrollBehaviorY: "contain",
          touchAction: "pan-y",
          scrollPaddingBottom: "calc(7rem + env(safe-area-inset-bottom, 0px))",
        }}
      >
        <div
          className={`w-full mx-auto px-4 sm:px-8 py-4 transition-all duration-200 min-h-full flex flex-col ${
            isFullWidth || isSourceMode ? "max-w-none" : "max-w-4xl"
          }`}
          style={{
            paddingBottom: "calc(40vh + 5rem + env(safe-area-inset-bottom, 0px))",
          }}
        >
          <div className="w-full min-w-0 flex-1 flex flex-col">{editorBody}</div>
        </div>
        {showToc && renderTocSidebar}
      </div>

      {/* 右下に単独でフワッと現れる保存ステータス */}
      <div
        className={`fixed bottom-5 right-6 z-40 pointer-events-none transition-all duration-300 ease-out ${
          saveStatus !== "idle"
            ? "opacity-100 translate-y-0"
            : "opacity-0 translate-y-2 pointer-events-none"
        }`}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.4rem",
            padding: "0.35rem 0.75rem",
            borderRadius: "9999px",
            background: "var(--bg-card-solid)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            border: "1px solid var(--border-subtle)",
            boxShadow: "var(--shadow-modal, 0 4px 16px rgba(0,0,0,0.08))",
            fontSize: "0.72rem",
            fontWeight: 500,
            color: saveStatus === "saving" ? C.charcoalLight : C.goldDark,
            letterSpacing: "0.02em",
          }}
        >
          {saveStatus === "saving" && (
            <>
              <span
                style={{
                  display: "inline-block",
                  width: "5px",
                  height: "5px",
                  borderRadius: "50%",
                  background: C.gold,
                  animation: "aether-pulse 1.2s ease-in-out infinite",
                }}
              />
              <span>保存中...</span>
            </>
          )}
          {saveStatus === "saved" && (
            <>
              <span
                style={{
                  display: "inline-block",
                  width: "5px",
                  height: "5px",
                  borderRadius: "50%",
                  background: C.gold,
                }}
              />
              <span>保存済み</span>
            </>
          )}
        </div>
      </div>

      {/* ✦ アイコン選択モーダル */}
      <NoteIconPickerModal
        isOpen={isIconPickerOpen}
        onClose={() => setIsIconPickerOpen(false)}
        currentIcon={note.icon}
        onSelectIcon={(iconId) => {
          onIconChange?.(iconId);
        }}
        noteTitle={note.title}
      />

      {/* ✦ Markdown 構文ガイドモーダル */}
      <MarkdownGuideModal
        isOpen={showGuide}
        onClose={() => setShowGuide(false)}
        onInsert={handleInsertSyntax}
      />

      {/* ✦ Aether Core 抽出モーダル */}
      {extractedData && (
        <AetherExtractModal
          items={extractedData}
          onClose={() => setExtractedData(null)}
          onSuccess={(count) => {
            onToastMessage?.(`${count}件のアイテムを買い物リスト・タスクに追加しました`);
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────
// ノートカード（ダッシュボード・サブノート用）
// ─────────────────────────────────────────

const MenuFolderMoveIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.8 }}>
    <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    <path d="m14 15 3-3-3-3" />
    <path d="M10 12h7" />
  </svg>
);

const MenuFileDownloadIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.8 }}>
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
    <polyline points="14 2 14 8 20 8" />
    <path d="M12 18v-6" />
    <path d="m9 15 3 3 3-3" />
  </svg>
);

const MenuTrashIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.9 }}>
    <path d="M3 6h18" />
    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
);

const NotesGridIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
  </svg>
);

const NotesListIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" />
    <line x1="3" y1="12" x2="3.01" y2="12" />
    <line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
);

/** ノートから先頭の画像URLを抽出するヘルパー */
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



function NoteCard({
  note,
  childCount = 0,
  onClick,
  onMove,
  onDelete,
  onDownload,
  viewMode = "grid",
}: {
  note: NoteItem;
  childCount?: number;
  onClick: () => void;
  onMove?: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  onDownload: (e: React.MouseEvent) => void;
  viewMode?: "grid" | "list";
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const excerpt = getExcerpt(note.content, 100);
  const wordCount = note.content.trim().length;
  const menuRef = useRef<HTMLDivElement>(null);
  const thumbnailImg = getFirstImageUrl(note);

  // メニュー外クリックで閉じる
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

  // ── リスト表示（横並び: 1行コンパクト表示） ──
  if (viewMode === "list") {
    return (
      <div
        className="arca-card arca-note-card arca-note-card-list flex items-center justify-between cursor-pointer"
        onClick={onClick}
        style={{
          background: "var(--bg-card-solid)",
          borderRadius: "14px",
          padding: "0.85rem 1.15rem",
          boxShadow: C.cardShadow,
          border: "1px solid var(--border-subtle)",
          position: "relative",
          zIndex: menuOpen ? 100 : 1,
          gap: "0.75rem",
          width: "100%",
          maxWidth: "100%",
          minWidth: 0,
          boxSizing: "border-box",
          overflow: menuOpen ? "visible" : "hidden",
          transition: "transform 0.18s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.18s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "translateY(-1px)";
          e.currentTarget.style.boxShadow = C.cardShadowHover;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "translateY(0)";
          e.currentTarget.style.boxShadow = C.cardShadow;
        }}
      >
        {/* 左側: タイトル・タグ・抜粋 */}
        <div style={{ flex: "1 1 0%", minWidth: 0, overflow: "hidden", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", minWidth: 0, overflow: "hidden" }}>
            <h3
              style={{
                fontSize: "0.94rem",
                fontWeight: 650,
                color: C.charcoal,
                margin: 0,
                lineHeight: 1.3,
                letterSpacing: "-0.012em",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                minWidth: 0,
                flex: "0 1 auto",
              }}
            >
              {note.title || "（タイトルなし）"}
            </h3>

            {childCount > 0 && (
              <span
                style={{
                  fontSize: "0.62rem",
                  color: C.charcoalMid,
                  background: "rgba(0,0,0,0.05)",
                  borderRadius: "5px",
                  padding: "0.1rem 0.4rem",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.2rem",
                  fontWeight: 600,
                  flexShrink: 0,
                  whiteSpace: "nowrap",
                }}
                title={`${childCount}件のサブノート`}
              >
                <Folder size={11} style={{ opacity: 0.75 }} />
                <span>{childCount}件</span>
              </span>
            )}

            {note.tags && note.tags.length > 0 && (
              <div style={{ display: "flex", gap: "0.25rem", flexShrink: 0 }}>
                {note.tags.slice(0, 2).map((tag) => (
                  <span
                    key={tag}
                    style={{
                      fontSize: "0.62rem",
                      color: C.gold,
                      background: C.goldFaint,
                      borderRadius: "5px",
                      padding: "0.08rem 0.4rem",
                      fontWeight: 500,
                      whiteSpace: "nowrap",
                    }}
                  >
                    #{tag}
                  </span>
                ))}
                {note.tags.length > 2 && (
                  <span style={{ fontSize: "0.6rem", color: C.charcoalLight, whiteSpace: "nowrap" }}>
                    +{note.tags.length - 2}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* 本文プレビュー（1行省略） */}
          <p
            style={{
              fontSize: "0.78rem",
              color: C.charcoalLight,
              margin: 0,
              lineHeight: 1.4,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              minWidth: 0,
            }}
          >
            {excerpt || "まだ内容がありません"}
          </p>
        </div>

        {/* 右側: 更新日・文字数・メニュー */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexShrink: 0, minWidth: 0 }}>
          <span style={{ fontSize: "0.68rem", color: C.charcoalXLight, whiteSpace: "nowrap" }}>
            {formatDateRelative(note.updatedAt)}
          </span>
          {wordCount > 0 && (
            <span className="hidden sm:inline" style={{ fontSize: "0.68rem", color: C.charcoalXLight, whiteSpace: "nowrap" }}>
              {wordCount.toLocaleString()} 文字
            </span>
          )}

          {/* 「…」メニュー */}
          <div
            ref={menuRef}
            style={{ position: "relative" }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((o) => !o);
              }}
              aria-label="メニュー"
              style={{
                background: menuOpen ? C.goldFaint2 : "rgba(0,0,0,0.03)",
                border: "none",
                borderRadius: "7px",
                width: "28px",
                height: "28px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: C.charcoalLight,
                fontSize: "0.9rem",
                lineHeight: 1,
                transition: "background 0.15s",
              }}
            >
              ···
            </button>
            {menuOpen && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 4px)",
                  right: 0,
                  background: "var(--bg-card-solid)",
                  borderRadius: "10px",
                  boxShadow: "var(--shadow-modal)",
                  padding: "0.35rem",
                  minWidth: "135px",
                  zIndex: 100,
                  animation: "slash-in 0.12s ease",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                {onMove && (
                  <button
                    onClick={(e) => {
                      setMenuOpen(false);
                      onMove(e);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.55rem",
                      width: "100%",
                      textAlign: "left",
                      background: "transparent",
                      border: "none",
                      borderRadius: "7px",
                      padding: "0.5rem 0.75rem",
                      cursor: "pointer",
                      fontSize: "0.8rem",
                      color: C.charcoal,
                      transition: "background 0.12s",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background = C.goldFaint;
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                    }}
                  >
                    <MenuFolderMoveIcon />
                    <span>移動</span>
                  </button>
                )}
                <button
                  onClick={(e) => {
                    setMenuOpen(false);
                    onDownload(e);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.55rem",
                    width: "100%",
                    textAlign: "left",
                    background: "transparent",
                    border: "none",
                    borderRadius: "7px",
                    padding: "0.5rem 0.75rem",
                    cursor: "pointer",
                    fontSize: "0.8rem",
                    color: C.charcoal,
                    transition: "background 0.12s",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = C.goldFaint;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                  }}
                >
                  <MenuFileDownloadIcon />
                  <span>md 保存</span>
                </button>
                <button
                  onClick={(e) => {
                    setMenuOpen(false);
                    onDelete(e);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.55rem",
                    width: "100%",
                    textAlign: "left",
                    background: "transparent",
                    border: "none",
                    borderRadius: "7px",
                    padding: "0.5rem 0.75rem",
                    cursor: "pointer",
                    fontSize: "0.8rem",
                    color: "#c0614a",
                    transition: "background 0.12s",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "rgba(192,97,74,0.07)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                  }}
                >
                  <MenuTrashIcon />
                  <span>削除</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── グリッド表示（縦並びカード） ──
  return (
    <div
      className="arca-card arca-note-card arca-note-card-grid"
      onClick={onClick}
      style={{
        background: "var(--bg-card-solid)",
        borderRadius: "20px",
        padding: "1.35rem 1.35rem 1.15rem",
        boxShadow: C.cardShadow,
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
        minHeight: "170px",
        position: "relative",
        zIndex: menuOpen ? 100 : 1,
        cursor: "pointer",
        border: "1px solid var(--border-subtle)",
        overflow: menuOpen ? "visible" : "hidden",
      }}
    >
      {/* 添付画像サムネイル（存在する場合: Keep風カード） */}
      {thumbnailImg && (
        <div
          style={{
            width: "calc(100% + 2.7rem)",
            height: "130px",
            margin: "-1.35rem -1.35rem 0.5rem -1.35rem",
            overflow: "hidden",
            background: "rgba(0, 0, 0, 0.03)",
            position: "relative",
          }}
        >
          <img
            src={thumbnailImg}
            alt={note.title || "サムネイル"}
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

      {/* 「…」メニューボタン */}
      <div
        ref={menuRef}
        className="arca-card-menu"
        style={{
          position: "absolute",
          top: "0.8rem",
          right: "0.9rem",
          zIndex: 10,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((o) => !o);
          }}
          aria-label="メニュー"
          style={{
            background: menuOpen ? C.goldFaint2 : "rgba(0,0,0,0.04)",
            border: "none",
            borderRadius: "8px",
            width: "28px",
            height: "28px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: C.charcoalLight,
            fontSize: "0.9rem",
            lineHeight: 1,
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = C.goldFaint2;
          }}
          onMouseLeave={(e) => {
            if (!menuOpen) (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,0,0,0.04)";
          }}
        >
          ···
        </button>
        {menuOpen && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              right: 0,
              background: "var(--bg-card-solid)",
              borderRadius: "10px",
              boxShadow: "var(--shadow-modal)",
              padding: "0.35rem",
              minWidth: "135px",
              zIndex: 100,
              animation: "slash-in 0.12s ease",
              border: "1px solid var(--border-subtle)",
            }}
          >
            {onMove && (
              <button
                onClick={(e) => {
                  setMenuOpen(false);
                  onMove(e);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.55rem",
                  width: "100%",
                  textAlign: "left",
                  background: "transparent",
                  border: "none",
                  borderRadius: "7px",
                  padding: "0.5rem 0.75rem",
                  cursor: "pointer",
                  fontSize: "0.8rem",
                  color: C.charcoal,
                  transition: "background 0.12s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = C.goldFaint;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                }}
              >
                <MenuFolderMoveIcon />
                <span>移動</span>
              </button>
            )}
            <button
              onClick={(e) => {
                setMenuOpen(false);
                onDownload(e);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.55rem",
                width: "100%",
                textAlign: "left",
                background: "transparent",
                border: "none",
                borderRadius: "7px",
                padding: "0.5rem 0.75rem",
                cursor: "pointer",
                fontSize: "0.8rem",
                color: C.charcoal,
                transition: "background 0.12s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = C.goldFaint;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "transparent";
              }}
            >
              <MenuFileDownloadIcon />
              <span>md 保存</span>
            </button>
            <button
              onClick={(e) => {
                setMenuOpen(false);
                onDelete(e);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.55rem",
                width: "100%",
                textAlign: "left",
                background: "transparent",
                border: "none",
                borderRadius: "7px",
                padding: "0.5rem 0.75rem",
                cursor: "pointer",
                fontSize: "0.8rem",
                color: "#c0614a",
                transition: "background 0.12s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "rgba(192,97,74,0.07)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "transparent";
              }}
            >
              <MenuTrashIcon />
              <span>削除</span>
            </button>
          </div>
        )}
      </div>

      {/* タグ & 子ノート件数バッジ */}
      <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", alignItems: "center", paddingRight: "2rem" }}>
        {childCount > 0 && (
          <span
            style={{
              fontSize: "0.64rem",
              color: C.charcoalMid,
              background: "rgba(0,0,0,0.05)",
              borderRadius: "5px",
              padding: "0.12rem 0.45rem",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.25rem",
              fontWeight: 600,
              letterSpacing: "0.02em",
            }}
            title={`${childCount}件のサブノート`}
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ opacity: 0.7 }}
            >
              <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
            </svg>
            <span>{childCount}件</span>
          </span>
        )}
        {note.tags.slice(0, 3).map((tag) => (
          <span
            key={tag}
            style={{
              fontSize: "0.62rem",
              color: C.gold,
              background: C.goldFaint,
              borderRadius: "5px",
              padding: "0.12rem 0.5rem",
              letterSpacing: "0.04em",
              fontWeight: 500,
            }}
          >
            {tag}
          </span>
        ))}
      </div>

      {/* タイトル */}
      <h3
        style={{
          fontSize: "0.95rem",
          fontWeight: 650,
          color: C.charcoal,
          margin: 0,
          lineHeight: 1.38,
          letterSpacing: "-0.012em",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {note.title || "（タイトルなし）"}
      </h3>

      {/* 抜粋 */}
      <p
        style={{
          fontSize: "0.79rem",
          color: C.charcoalLight,
          margin: 0,
          lineHeight: 1.62,
          flex: 1,
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {excerpt || "まだ内容がありません"}
      </p>

      {/* フッター */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: "0.3rem",
          paddingTop: "0.65rem",
          borderTop: "1px solid rgba(0,0,0,0.045)",
        }}
      >
        <span style={{ fontSize: "0.68rem", color: C.charcoalXLight, letterSpacing: "0.03em" }}>
          {formatDateRelative(note.updatedAt)}
        </span>
        {wordCount > 0 && (
          <span style={{ fontSize: "0.68rem", color: C.charcoalXLight, letterSpacing: "0.03em" }}>
            {wordCount.toLocaleString()} 文字
          </span>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// ごみ箱モーダル
// ─────────────────────────────────────────

function TrashModal({
  deletedNotes,
  onRestore,
  onPermanentDelete,
  onEmptyTrash,
  onClose,
}: {
  deletedNotes: NoteItem[];
  onRestore: (id: string) => void;
  onPermanentDelete: (id: string) => void;
  onEmptyTrash: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm select-none animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-2xl max-h-[85vh] bg-[var(--bg-card-solid,rgba(255,255,255,0.98))] rounded-3xl shadow-2xl border border-black/[0.06] dark:border-white/[0.08] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/[0.05] dark:border-white/[0.06] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-red-500/10 text-[#E0564A] flex items-center justify-center shrink-0">
              <Trash2 className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-charcoal">ごみ箱</h2>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-black/[0.04] dark:bg-white/[0.08] text-charcoal-light">
                  {deletedNotes.length}件
                </span>
              </div>
              <p className="text-[11px] text-charcoal-light">
                ごみ箱にあるページは復元するか、完全に削除（データベースから消去）できます
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {deletedNotes.length > 0 && (
              <button
                type="button"
                onClick={onEmptyTrash}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#E0564A]/10 text-[#E0564A] hover:bg-[#E0564A]/20 transition-all cursor-pointer border-none"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>ごみ箱を空にする</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="閉じる"
              className="w-8 h-8 rounded-xl flex items-center justify-center text-charcoal-light hover:text-charcoal hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer border-none bg-transparent"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* リスト領域 */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-2.5 arca-scroll">
          {deletedNotes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center select-none">
              <div className="w-12 h-12 rounded-2xl bg-black/[0.03] dark:bg-white/[0.04] flex items-center justify-center text-charcoal-xlight mb-3">
                <Trash2 className="w-6 h-6 stroke-[1.5]" />
              </div>
              <p className="text-sm font-medium text-charcoal mb-1">ごみ箱は空です</p>
              <p className="text-xs text-charcoal-light">削除されたページはありません</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {deletedNotes.map((n) => (
                <div
                  key={n.id}
                  className="flex flex-col justify-between p-3.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/[0.04] dark:border-white/[0.06] hover:border-black/[0.08] transition-all group"
                >
                  <div className="mb-3">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="w-5 h-5 rounded-lg bg-amber-500/10 text-[#B58D3D] flex items-center justify-center shrink-0">
                        <NoteIcon
                          icon={n.icon}
                          defaultIcon={<FileText className="w-3 h-3 stroke-[2]" />}
                          className="w-3 h-3 stroke-[2]"
                        />
                      </span>
                      <h3 className="text-xs font-semibold text-charcoal truncate flex-1">
                        {n.title || "（タイトルなし）"}
                      </h3>
                    </div>
                    <p className="text-[11px] text-charcoal-light line-clamp-2 leading-relaxed">
                      {getExcerpt(n.content, 60) || "（本文なし）"}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-black/[0.03] dark:border-white/[0.04]">
                    <span className="text-[10px] text-charcoal-xlight">
                      {n.updatedAt ? new Date(n.updatedAt).toLocaleDateString() : ""}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onRestore(n.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-black/[0.04] dark:bg-white/[0.06] text-charcoal hover:bg-black/[0.08] dark:hover:bg-white/[0.12] transition-colors cursor-pointer border-none"
                      >
                        <RotateCcw className="w-3 h-3 text-charcoal-light" />
                        <span>復元する</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onPermanentDelete(n.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-red-500/10 text-[#E0564A] hover:bg-red-500/20 transition-colors cursor-pointer border-none"
                      >
                        <span>完全に削除</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// ノートダッシュボード（グリッド一覧）
// ─────────────────────────────────────────

export function NoteDashboard({
  notes,
  allNotes,
  onSelectNote,
  onNewNote,
  onDeleteNote,
  onDownloadNote,
  onMoveNote,
  onTriggerImport,
  onOpenTrash,
}: {
  notes: NoteItem[];
  allNotes: NoteItem[];
  onSelectNote: (id: string) => void;
  onNewNote: () => void;
  onDeleteNote: (note: NoteItem) => void;
  onDownloadNote: (note: NoteItem) => void;
  onMoveNote?: (note: NoteItem) => void;
  onTriggerImport: () => void;
  onOpenTrash: () => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"updatedDesc" | "createdDesc" | "titleAsc">("updatedDesc");
  const [layoutStyle, setLayoutStyle] = useState<"grid" | "list">(() => {
    try {
      return (localStorage.getItem("arca_notes_layout_style") as "grid" | "list") || "grid";
    } catch {
      return "grid";
    }
  });

  const handleToggleLayoutStyle = (style: "grid" | "list") => {
    setLayoutStyle(style);
    try {
      localStorage.setItem("arca_notes_layout_style", style);
    } catch {
      // ignore
    }
  };

  const allTags = Array.from(new Set(notes.flatMap((n) => n.tags))).sort();

  const filteredNotes = notes
    .filter((n) => selectedTag === "all" || n.tags.includes(selectedTag))
    .filter((n) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (sortBy === "updatedDesc") return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      if (sortBy === "createdDesc") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (sortBy === "titleAsc") return a.title.localeCompare(b.title);
      return 0;
    });

  return (
    <div
      className="arca-view-in arca-scroll"
      style={{
        height: "100%",
        width: "100%",
        maxWidth: "100%",
        overflowX: "hidden",
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        boxSizing: "border-box",
        padding: "2.4rem clamp(1.5rem, 5vw, 4rem) calc(8rem + env(safe-area-inset-bottom, 0px))",
      }}
    >
      {/* ── ヘッダー部（タイトル） ── */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          marginBottom: "1.5rem",
          maxWidth: "1280px",
          marginInline: "auto",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: "1.75rem",
              fontWeight: 750,
              color: C.charcoal,
              margin: 0,
              letterSpacing: "-0.03em",
              lineHeight: 1.2,
            }}
          >
            ノート
          </h1>
          <p style={{ fontSize: "0.78rem", color: C.charcoalLight, margin: "0.3rem 0 0", letterSpacing: "0.01em" }}>
            {filteredNotes.length}件のノート
          </p>
        </div>
      </div>

      {/* ── ツールバー ＆ コントロール（単一DOM・レスポンシブGrid） ── */}
      <div
        className="arca-notes-toolbar-grid"
        style={{
          maxWidth: "1280px",
          marginInline: "auto",
          marginBottom: "1.5rem",
        }}
      >
        {/* 検索入力欄 */}
        <div className="arca-notes-search-box">
          <span
            style={{
              position: "absolute",
              left: "0.85rem",
              top: "50%",
              transform: "translateY(-50%)",
              display: "flex",
              alignItems: "center",
              color: C.charcoalXLight,
              pointerEvents: "none",
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
          </span>
          <input
            type="text"
            placeholder="ノートを検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="arca-notes-search-input"
          />
        </div>

        {/* ごみ箱ボタン */}
        <button
          onClick={onOpenTrash}
          className="arca-notes-btn-sub arca-notes-btn-trash"
          title="ごみ箱を確認"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
          </svg>
          <span style={{ whiteSpace: "nowrap" }}>ごみ箱</span>
        </button>

        {/* .md インポートボタン */}
        <button
          onClick={onTriggerImport}
          className="arca-notes-btn-sub arca-notes-btn-import"
          title="Markdownファイル (.md / .txt) をインポート"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <span style={{ whiteSpace: "nowrap" }}>インポート</span>
        </button>

        {/* 新規ノートボタン */}
        <button
          onClick={onNewNote}
          className="arca-notes-btn-primary arca-notes-btn-new"
        >
          <span style={{ fontSize: "1.1rem", lineHeight: 1 }}>＋</span>
          <span style={{ whiteSpace: "nowrap" }}>新しいノート</span>
        </button>

        {/* ソートセレクタ ＆ グリッド/リスト切り替え */}
        <div className="arca-notes-sort-box" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span className="arca-notes-sort-label">並び順:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            aria-label="並び順"
            className="arca-notes-sort-select"
          >
            <option value="updatedDesc">更新日が新しい順</option>
            <option value="createdDesc">作成日が新しい順</option>
            <option value="titleAsc">タイトル順 (A-Z)</option>
          </select>

          {/* グリッド / リスト切り替え */}
          <div
            className="flex items-center p-0.5 rounded-[9px] gap-0.5 shrink-0 bg-black/[0.04] dark:bg-white/[0.08]"
          >
            <button
              type="button"
              onClick={() => handleToggleLayoutStyle("grid")}
              aria-label="グリッド表示"
              title="グリッド表示"
              className={`border-none rounded-[7px] px-2 py-1.5 flex items-center justify-center cursor-pointer transition-all duration-150 ${
                layoutStyle === "grid"
                  ? "bg-white dark:bg-stone-800 text-charcoal dark:text-stone-100 shadow-xs"
                  : "bg-transparent text-charcoal-light hover:text-charcoal dark:hover:text-stone-200"
              }`}
            >
              <NotesGridIcon />
            </button>
            <button
              type="button"
              onClick={() => handleToggleLayoutStyle("list")}
              aria-label="リスト表示"
              title="リスト表示"
              className={`border-none rounded-[7px] px-2 py-1.5 flex items-center justify-center cursor-pointer transition-all duration-150 ${
                layoutStyle === "list"
                  ? "bg-white dark:bg-stone-800 text-charcoal dark:text-stone-100 shadow-xs"
                  : "bg-transparent text-charcoal-light hover:text-charcoal dark:hover:text-stone-200"
              }`}
            >
              <NotesListIcon />
            </button>
          </div>
        </div>
      </div>

      {/* ── タグフィルター（共通） ── */}
      <div
        style={{
          maxWidth: "1280px",
          marginInline: "auto",
          marginBottom: "2.2rem",
          display: "flex",
          gap: "0.5rem",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <button
          onClick={() => setSelectedTag("all")}
          style={{
            background: selectedTag === "all" ? C.charcoal : "transparent",
            color: selectedTag === "all" ? C.white : C.charcoalMid,
            border: "none",
            borderRadius: "20px",
            padding: "0.38rem 0.95rem",
            fontSize: "0.76rem",
            fontWeight: 550,
            cursor: "pointer",
            whiteSpace: "nowrap",
            flexShrink: 0,
            transition: "all 0.15s",
          }}
        >
          すべて
        </button>
        {allTags.map((tag) => (
          <button
            key={tag}
            onClick={() => setSelectedTag(tag)}
            style={{
              background: selectedTag === tag ? C.gold : "transparent",
              color: selectedTag === tag ? C.white : C.goldDark,
              border: selectedTag === tag ? "1px solid transparent" : `1px solid ${C.goldFaint3}`,
              borderRadius: "20px",
              padding: "0.35rem 0.95rem",
              fontSize: "0.76rem",
              fontWeight: 550,
              cursor: "pointer",
              whiteSpace: "nowrap",
              flexShrink: 0,
              transition: "all 0.15s",
            }}
          >
            #{tag}
          </button>
        ))}
      </div>

      {/* ── ノート一覧（グリッド or リスト） ── */}
      <div
        style={{
          maxWidth: "1280px",
          width: "100%",
          minWidth: 0,
          boxSizing: "border-box",
          marginInline: "auto",
          display: "grid",
          gridTemplateColumns:
            layoutStyle === "grid"
              ? "repeat(auto-fill, minmax(290px, 1fr))"
              : "minmax(0, 1fr)",
          gap: layoutStyle === "grid" ? "1.15rem" : "0.65rem",
        }}
      >
        {filteredNotes.map((note) => (
          <NoteCard
            key={note.id}
            note={note}
            childCount={getChildCount(allNotes, note.id)}
            viewMode={layoutStyle}
            onClick={() => onSelectNote(note.id)}
            onMove={(e) => {
              e.stopPropagation();
              onMoveNote?.(note);
            }}
            onDelete={(e) => {
              e.stopPropagation();
              onDeleteNote(note);
            }}
            onDownload={(e) => {
              e.stopPropagation();
              onDownloadNote(note);
            }}
          />
        ))}

        {/* ノートが0件の時のエンプティステート */}
        {filteredNotes.length === 0 && (
          <div
            style={{
              gridColumn: "1 / -1",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.8rem",
              padding: "5rem 2rem",
              color: C.charcoalXLight,
            }}
          >
            <p style={{ fontSize: "1rem", margin: 0 }}>ノートがまだありません</p>
            <div style={{ display: "flex", gap: "0.8rem" }}>
              <button
                onClick={onTriggerImport}
                style={{
                  background: "rgba(0, 0, 0, 0.05)",
                  border: "none",
                  borderRadius: "9px",
                  padding: "0.6rem 1.2rem",
                  color: C.charcoalMid,
                  fontSize: "0.85rem",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                ファイルを読み込む
              </button>
              <button
                onClick={onNewNote}
                style={{
                  background: C.goldFaint2,
                  border: "none",
                  borderRadius: "9px",
                  padding: "0.6rem 1.4rem",
                  color: C.gold,
                  fontSize: "0.85rem",
                  cursor: "pointer",
                  fontWeight: 650,
                }}
              >
                最初のノートを作成する
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// エラーバウンダリー
// ─────────────────────────────────────────

class NoteErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("NoteErrorBoundary caught an error:", error, errorInfo);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: "4rem", background: C.ivory, minHeight: "100vh", color: C.charcoal }}>
          <h2 style={{ color: "#c0614a", fontSize: "1.5rem", marginBottom: "1rem" }}>表示エラーが発生しました</h2>
          <p style={{ marginBottom: "1rem", lineHeight: 1.6 }}>
            このノートのデータに問題があるか、描画処理に失敗したため、画面が真っ白になるのを防ぎました。<br />
            お手数ですが、以下のエラーメッセージをご確認ください。
          </p>
          <pre
            style={{
              background: C.white,
              padding: "1.5rem",
              borderRadius: "12px",
              border: `1px solid ${C.ivory2}`,
              overflowX: "auto",
              fontSize: "0.85rem",
              color: C.charcoalMid,
              whiteSpace: "pre-wrap",
            }}
          >
            {this.state.error.toString()}
            {"\n"}
            {this.state.error.stack}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: "2rem",
              padding: "0.8rem 1.5rem",
              background: C.gold,
              color: C.white,
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            リロードしてやり直す
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─────────────────────────────────────────
// メインコンポーネント
// ─────────────────────────────────────────

type View = { type: "dashboard" } | { type: "viewer"; noteId: string };

export interface NotesProps {
  initialNoteId?: string | null;
  onClearSelectedNote?: () => void;
}

export default function Notes({
  initialNoteId = null,
  onClearSelectedNote,
}: NotesProps = {}) {
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [activeSpace, setActiveSpace] = useState<NoteSpaceType>(() => {
    try {
      const saved = localStorage.getItem("arca_notes_active_space");
      if (saved === "memo" || saved === "document" || saved === "journal") {
        return saved;
      }
    } catch {}
    return "document";
  });
  const [editingMemo, setEditingMemo] = useState<NoteItem | null>(null);

  const [view, setView] = useState<View>(() =>
    initialNoteId ? { type: "viewer", noteId: initialNoteId } : { type: "dashboard" }
  );

  const handleSpaceChange = useCallback(
    (space: NoteSpaceType) => {
      setActiveSpace(space);
      try {
        localStorage.setItem("arca_notes_active_space", space);
      } catch {}
      setView({ type: "dashboard" });
      onClearSelectedNote?.();
    },
    [onClearSelectedNote]
  );

  useEffect(() => {
    if (initialNoteId) {
      setView({ type: "viewer", noteId: initialNoteId });
      const found = notes.find((n: NoteItem) => n.id === initialNoteId);
      if (found?.spaceType && found.spaceType !== activeSpace) {
        setActiveSpace(found.spaceType);
      }
    }
  }, [initialNoteId, notes, activeSpace]);

  const [isFullWidth, setIsFullWidth] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [showTrash, setShowTrash] = useState(false);
  const [noteToDelete, setNoteToDelete] = useState<NoteItem | null>(null);
  const [movingNote, setMovingNote] = useState<NoteItem | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Firestore Sync
  useEffect(() => {
    const q = query(collection(db, "notes"), orderBy("updatedAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched: NoteItem[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const rawSpaceType = data.spaceType as NoteSpaceType | undefined;
        const isJournalEntry = Boolean(data.journalDate);
        const fallbackSpaceType: NoteSpaceType =
          rawSpaceType || (isJournalEntry ? "journal" : "document");

        fetched.push({
          id: docSnap.id,
          title: data.title || "",
          content: data.content || "",
          tags: data.tags || [],
          createdAt: data.createdAt?.toDate?.()?.toISOString() || nowIso(),
          updatedAt: data.updatedAt?.toDate?.()?.toISOString() || nowIso(),
          isDeleted: !!data.isDeleted,
          parentId: data.parentId ?? null,
          pinned: !!data.pinned,
          spaceType: fallbackSpaceType,
          attachments: data.attachments || {},
          childViewMode:
            data.childViewMode === "board" ||
            data.childViewMode === "list" ||
            data.childViewMode === "journal"
              ? data.childViewMode
              : undefined,
          journalDate: data.journalDate || undefined,
          mood: data.mood || undefined,
          photos: data.photos || undefined,
          contextSnapshot: data.contextSnapshot || undefined,
          icon: data.icon || undefined,
          order: typeof data.order === "number" ? data.order : undefined,
        });
      });
      setNotes(fetched);
    });
    return () => unsubscribe();
  }, []);

  // データの完全分離：各ノートの spaceType をそのまま尊重
  const resolvedNotes: NoteItem[] = notes;

  const activeNotes: NoteItem[] = resolvedNotes.filter((n: NoteItem) => !n.isDeleted);
  const deletedNotes: NoteItem[] = resolvedNotes.filter((n: NoteItem) => n.isDeleted);

  // スペースごとのノート一覧
  const memoNotes = useMemo(
    () => activeNotes.filter((n: NoteItem) => n.spaceType === "memo"),
    [activeNotes]
  );
  const documentNotes = useMemo(
    () => activeNotes.filter((n: NoteItem) => n.spaceType === "document"),
    [activeNotes]
  );
  const journalNotes = useMemo(
    () => activeNotes.filter((n: NoteItem) => n.spaceType === "journal"),
    [activeNotes]
  );

  const spaceCounts = useMemo(
    () => ({
      memo: memoNotes.length,
      document: documentNotes.length,
      journal: journalNotes.length,
    }),
    [memoNotes.length, documentNotes.length, journalNotes.length]
  );

  // 共通トースト
  const { toast, showUndoToast, showMessageToast, dismissToast, triggerUndo } = useUndoToast<NoteItem>();

  const mutateNote = useCallback(
    (
      id: string,
      patch: Partial<Omit<NoteItem, "id" | "createdAt" | "updatedAt">>,
      immediate = false
    ) => {
      setNotes((prev) =>
        prev.map((n) => (n.id === id ? { ...n, ...patch, updatedAt: nowIso() } : n))
      );

      setSaveStatus("saving");
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

      const doSave = async () => {
        try {
          const docRef = doc(db, "notes", id);
          await updateDoc(docRef, {
            ...patch,
            updatedAt: serverTimestamp(),
          });
          setSaveStatus("saved");
          setTimeout(() => setSaveStatus("idle"), 2000);
        } catch (error) {
          console.error("Auto-save failed", error);
        }
      };

      if (immediate) {
        void doSave();
      } else {
        saveTimeoutRef.current = setTimeout(doSave, 800);
      }
    },
    []
  );

  // 親ノート移動処理
  const handleMoveNote = useCallback(
    async (targetNoteId: string, newParentId: string | null) => {
      const target = notes.find((n) => n.id === targetNoteId);
      if (!target) return;

      if (!canMoveNoteTo(notes, targetNoteId, newParentId)) {
        showMessageToast("循環参照となるため、自身またはその配下ノートには移動できません");
        return;
      }

      mutateNote(targetNoteId, { parentId: newParentId });

      if (newParentId) {
        const parentNote = notes.find((n) => n.id === newParentId);
        showMessageToast(`「${parentNote?.title || "親ノート"}」の配下に移動しました`);
      } else {
        showMessageToast("トップ階層（All Notes）に移動しました");
      }
    },
    [notes, mutateNote, showMessageToast]
  );

  // ノート並び替え処理（手動ドラッグ＆ドロップ / 上下移動）
  const handleReorderNotes = useCallback(
    async (orderedIds: string[], parentId: string | null) => {
      const targetParentId = parentId || null;
      // 楽観的更新
      setNotes((prev) =>
        prev.map((n) => {
          const idx = orderedIds.indexOf(n.id);
          if (idx !== -1) {
            return { ...n, order: idx, parentId: targetParentId };
          }
          return n;
        })
      );

      try {
        await Promise.all(
          orderedIds.map((id, index) =>
            updateDoc(doc(db, "notes", id), {
              order: index,
              parentId: targetParentId,
            })
          )
        );
      } catch (err) {
        console.error("Reorder notes failed", err);
      }
    },
    []
  );

  // ノート削除処理（カスケード保護 ＆ 一括Undo）
  const handleExecuteDelete = useCallback(
    async (id: string) => {
      const target = notes.find((n) => n.id === id);
      if (!target) return;

      // 対象ノート自身と配下の子孫ノートIDをすべて収集
      const descendantIds = getDescendantNoteIds(notes, id);
      const targetAndDescendants = notes.filter(
        (n) => descendantIds.includes(n.id) && !n.isDeleted
      );

      // 現在開いているノートが削除対象（またはその子孫）なら親またはダッシュボードへ遷移
      if (view.type === "viewer" && descendantIds.includes(view.noteId)) {
        const parentId = target.parentId;
        if (parentId && !descendantIds.includes(parentId)) {
          setView({ type: "viewer", noteId: parentId });
        } else {
          setView({ type: "dashboard" });
        }
      }

      try {
        await Promise.all(
          descendantIds.map((dId) =>
            updateDoc(doc(db, "notes", dId), { isDeleted: true })
          )
        );
        logger.info("firestore", `Notes: Moved note to trash "${target.title || "Untitled"}" (${target.id})`, {
          descendantCount: descendantIds.length,
        });

        // 親ノートが存在する場合、親ノート本文から該当子ページリンク（[child-page:id] 等）を除去
        const parentId = target.parentId;
        if (parentId) {
          const parentNote = notes.find((n) => n.id === parentId);
          if (parentNote && parentNote.content) {
            let updatedContent = parentNote.content;
            descendantIds.forEach((dId) => {
              const regexChildPage = new RegExp(`\\n*\\[child-page:${dId}\\]\\n*`, "g");
              const regexNoteLink = new RegExp(`\\n*\\[[^\\]]*\\]\\(note:${dId}\\)\\n*`, "g");
              updatedContent = updatedContent
                .replace(regexChildPage, "\n\n")
                .replace(regexNoteLink, "\n\n");
            });
            updatedContent = updatedContent.replace(/\n{3,}/g, "\n\n").trim();
            if (updatedContent !== parentNote.content) {
              mutateNote(parentId, { content: updatedContent }, true);
            }
          }
        }
      } catch (e) {
        console.error("Delete failed", e);
      }

      const subCount = targetAndDescendants.length - 1;
      const message =
        subCount > 0
          ? `「${target.title || "（タイトルなし）"}」とサブノート ${subCount}件をごみ箱に移動しました`
          : `ノート「${target.title || "（タイトルなし）"}」をごみ箱に移動しました`;

      showUndoToast({
        message,
        item: target,
        onUndo: async () => {
          try {
            await Promise.all(
              descendantIds.map((dId) =>
                updateDoc(doc(db, "notes", dId), { isDeleted: false })
              )
            );
            logger.info("firestore", `Notes: Restored note "${target.title || "Untitled"}"`);
          } catch (e) {
            console.error("Undo failed", e);
          }
        },
      });
    },
    [notes, view, showUndoToast, mutateNote]
  );

  // ノートダウンロード
  const handleDownloadNote = useCallback(
    (note: NoteItem) => {
      try {
        const fileName = downloadMarkdownFile(note.title, note.content);
        showMessageToast(`「${fileName}」をダウンロードしました`);
      } catch (e) {
        console.error("Download failed", e);
        showMessageToast("ダウンロード中にエラーが発生しました");
      }
    },
    [showMessageToast]
  );

  // Markdownファイル インポート処理
  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { title, content } = await readMarkdownFile(file);
      const docRef = await addDoc(collection(db, "notes"), {
        title: title || "（タイトルなし）",
        content: content || "",
        tags: [],
        spaceType: activeSpace,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        isDeleted: false,
        parentId: null,
      });
      if (activeSpace === "memo") {
        setEditingMemo({
          id: docRef.id,
          title: title || "（タイトルなし）",
          content: content || "",
          tags: [],
          spaceType: "memo",
          createdAt: nowIso(),
          updatedAt: nowIso(),
          isDeleted: false,
          parentId: null,
        });
      } else {
        setView({ type: "viewer", noteId: docRef.id });
      }
      showMessageToast(`「${file.name}」を取り込みました`);
    } catch (err) {
      console.error("Import error", err);
      showMessageToast("ファイルの読み込みに失敗しました");
    } finally {
      e.target.value = "";
    }
  };

  const activeNote =
    view.type === "viewer" ? (notes.find((n) => n.id === view.noteId) ?? null) : null;

  // ノート（Pages / Document）スペースで開くアクティブノート（未選択時は null でホーム画面を表示）
  const activeDocNote = useMemo(() => {
    if (view.type === "viewer" && view.noteId) {
      const found = documentNotes.find((n) => n.id === view.noteId);
      if (found) return found;
    }
    return null;
  }, [view, documentNotes]);

  // 新規メモ作成（画面遷移せずポップアップモーダルを即起動）
  const handleNewMemo = useCallback(async () => {
    try {
      const docRef = await addDoc(collection(db, "notes"), {
        title: "",
        content: "",
        tags: [],
        spaceType: "memo",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        isDeleted: false,
        parentId: null,
      });
      logger.info("firestore", `Notes: Created memo (ID: ${docRef.id})`);
      setEditingMemo({
        id: docRef.id,
        title: "",
        content: "",
        tags: [],
        spaceType: "memo",
        createdAt: nowIso(),
        updatedAt: nowIso(),
        isDeleted: false,
        parentId: null,
      });
    } catch (e) {
      console.error("Create memo failed", e);
    }
  }, []);

  // 新規ノート作成（親ノート指定可能）
  const handleNewNote = useCallback(
    async (parentId: string | null = null, spaceType: NoteSpaceType = "document") => {
      try {
        const targetParentId = parentId || null;
        // 同じ親階層のノート群から最大の order を取得して末尾に追加
        const siblings = notes.filter(
          (n) => (n.parentId ?? null) === targetParentId && !n.isDeleted
        );
        const maxOrder = siblings.reduce((max, n) => {
          return typeof n.order === "number" && n.order > max ? n.order : max;
        }, -1);
        const nextOrder = maxOrder + 1;

        const docRef = await addDoc(collection(db, "notes"), {
          title: "",
          content: "",
          tags: [],
          spaceType,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          isDeleted: false,
          parentId: targetParentId,
          order: nextOrder,
        });
        logger.info("firestore", `Notes: Created note (ID: ${docRef.id}, space: ${spaceType}, order: ${nextOrder})`);

        // 親ノートが指定されている場合、親ノートの本文末尾に子ページボタンを追加して保存
        if (targetParentId) {
          const parentNote = notes.find((n) => n.id === targetParentId);
          if (parentNote) {
            const currentContent = parentNote.content || "";
            const separator = currentContent.trim() ? "\n\n" : "";
            const newContent = `${currentContent.trim()}${separator}[child-page:${docRef.id}]\n`;
            mutateNote(targetParentId, { content: newContent }, true);
          }
        }

        setView({ type: "viewer", noteId: docRef.id });
      } catch (e) {
        console.error("Create failed", e);
      }
    },
    [notes, mutateNote]
  );

  // 新規ジャーナルノート作成（トップレベル / 当日ライフログ）
  const handleNewTodayJournal = useCallback(
    async (targetDate?: string) => {
      const date = targetDate || new Date().toISOString().split("T")[0];
      try {
        const existing = activeNotes.find(
          (n: NoteItem) =>
            n.spaceType === "journal" &&
            (n.journalDate === date || n.title === `${date} のジャーナル`)
        );
        if (existing) {
          setView({ type: "viewer", noteId: existing.id });
          showMessageToast(`「${date}」のジャーナルを開きました`);
          return;
        }

        const docRef = await addDoc(collection(db, "notes"), {
          title: `${date} のジャーナル`,
          content: "",
          tags: ["ジャーナル"],
          spaceType: "journal",
          journalDate: date,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          isDeleted: false,
          parentId: null,
        });
        setView({ type: "viewer", noteId: docRef.id });
        showMessageToast(`「${date}」のジャーナルを作成しました`);
      } catch (e) {
        console.error("Create journal failed", e);
        showMessageToast("ジャーナルの作成に失敗しました");
      }
    },
    [activeNotes, showMessageToast]
  );

  // 既存サブノート配下ジャーナルノート作成（互換性維持）
  const handleNewJournalNote = useCallback(
    async (targetDate: string) => {
      if (!activeNote) return;
      try {
        const existing = notes.find(
          (n) =>
            !n.isDeleted &&
            n.parentId === activeNote.id &&
            (n.journalDate === targetDate || n.title === `${targetDate} のジャーナル`)
        );
        if (existing) {
          setView({ type: "viewer", noteId: existing.id });
          showMessageToast(`「${targetDate}」のジャーナルを開きました`);
          return;
        }

        const docRef = await addDoc(collection(db, "notes"), {
          title: `${targetDate} のジャーナル`,
          content: "",
          tags: ["ジャーナル"],
          spaceType: "journal",
          journalDate: targetDate,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          isDeleted: false,
          parentId: activeNote.id,
        });
        setView({ type: "viewer", noteId: docRef.id });
        showMessageToast(`「${targetDate}」のジャーナルを作成しました`);
      } catch (e) {
        console.error("Create journal failed", e);
        showMessageToast("ジャーナルの作成に失敗しました");
      }
    },
    [activeNote, notes, showMessageToast]
  );

  const handleSelectNote = useCallback(
    (id: string) => {
      if (id) {
        setView({ type: "viewer", noteId: id });
      } else {
        setView({ type: "dashboard" });
        onClearSelectedNote?.();
      }
    },
    [onClearSelectedNote]
  );

  const handleSelectBreadcrumb = useCallback((id: string | null) => {
    if (id) {
      setView({ type: "viewer", noteId: id });
    } else {
      setView({ type: "dashboard" });
      onClearSelectedNote?.();
    }
  }, [onClearSelectedNote]);

  const handleBack = useCallback(async () => {
    if (view.type === "viewer" && view.noteId) {
      const note = notes.find((n) => n.id === view.noteId);
      if (note && !note.title.trim() && !note.content.trim()) {
        try {
          await deleteDoc(doc(db, "notes", note.id));
          setNotes((prev) => prev.filter((n) => n.id !== note.id));
        } catch (e) {
          console.error("Failed to cleanup empty note", e);
        }
      }
      // 親ノートがある場合は親ノートに戻る、なければダッシュボードへ
      if (note?.parentId) {
        setView({ type: "viewer", noteId: note.parentId });
        return;
      }
    }
    setView({ type: "dashboard" });
    onClearSelectedNote?.();
  }, [view, notes, onClearSelectedNote]);

  const handlePermanentDelete = useCallback(
    async (id: string) => {
      try {
        const descendantIds = getDescendantNoteIds(notes, id);
        await Promise.all(descendantIds.map((dId) => deleteDoc(doc(db, "notes", dId))));
        setNotes((prev) => prev.filter((n) => !descendantIds.includes(n.id)));
        showMessageToast("ノートを完全に削除しました");
      } catch (e) {
        console.error("Permanent delete failed", e);
        showMessageToast("削除中にエラーが発生しました");
      }
    },
    [notes, showMessageToast]
  );

  const handleEmptyTrash = useCallback(async () => {
    if (deletedNotes.length === 0) return;
    try {
      await Promise.all(deletedNotes.map((n: NoteItem) => deleteDoc(doc(db, "notes", n.id))));
      setNotes((prev) => prev.filter((n) => !n.isDeleted));
      setShowTrash(false);
      showMessageToast("ごみ箱を空にしました");
    } catch (e) {
      console.error("Empty trash failed", e);
      showMessageToast("削除中にエラーが発生しました");
    }
  }, [deletedNotes, showMessageToast]);

  const currentId =
    activeSpace === "document"
      ? activeDocNote?.id ?? null
      : view.type === "viewer"
      ? view.noteId
      : null;

  // 削除対象のノート配下の子孫ノート件数を集計
  const subNotesCountToDelete = noteToDelete
    ? getDescendantNoteIds(notes, noteToDelete.id).filter(
        (dId) => dId !== noteToDelete.id && !notes.find((n) => n.id === dId)?.isDeleted
      ).length
    : 0;

  // ノート執筆中（詳細/エディタ表示中）かどうかの判定（モバイルでの最下部Dock非表示用）
  const isViewingNote =
    (activeSpace === "document" && Boolean(activeDocNote)) ||
    (activeSpace === "journal" && view.type !== "dashboard" && Boolean(activeNote)) ||
    Boolean(editingMemo);

  return (
    <>
      <style>{GLOBAL_STYLES}</style>

      {/* 非表示のファイル選択input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".md,.markdown,.txt,text/markdown,text/plain"
        onChange={handleFileImport}
        style={{ display: "none" }}
        data-testid="markdown-file-input"
      />

      {/* 固定背景（上品なベージュ・アイボリー余白を常時確保） */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: -10,
          background: C.bgGrad,
          transition: "background 0.3s ease",
        }}
      />

      {/* ── 1. メモ（Memo）スペース ── */}
      {activeSpace === "memo" && (
        <MemoSpace
          notes={memoNotes}
          onOpenMemo={(note) => setEditingMemo(note)}
          onNewMemo={handleNewMemo}
          onDeleteNote={(target) => setNoteToDelete(target)}
          onTogglePin={(id, pinned) => mutateNote(id, { pinned })}
          onDownloadNote={handleDownloadNote}
          onTriggerImport={() => fileInputRef.current?.click()}
          onOpenTrash={() => setShowTrash(true)}
          activeSpace={activeSpace}
          onSpaceChange={handleSpaceChange}
          spaceCounts={spaceCounts}
        />
      )}

      {/* ── 2. ノート（Pages / Document）スペース ── */}
      {activeSpace === "document" && (
        <DocumentSpace
          notes={documentNotes}
          activeNoteId={activeDocNote?.id ?? null}
          onSelectNote={handleSelectNote}
          onCreateRootNote={() => handleNewNote(null, "document")}
          onCreateChildNote={(parentId) => handleNewNote(parentId, "document")}
          onMoveNote={handleMoveNote}
          onRenameNote={(id, title) => mutateNote(id, { title })}
          onDeleteNote={(target) => setNoteToDelete(target)}
          onOpenMoveModal={(target) => setMovingNote(target)}
          onUpdateNoteIcon={(id, icon) => mutateNote(id, { icon: icon || "" })}
          onReorderNotes={handleReorderNotes}
          onOpenTrash={() => setShowTrash(true)}
          deletedCount={deletedNotes.length}
          activeSpace={activeSpace}
          onSpaceChange={handleSpaceChange}
          spaceCounts={spaceCounts}
          onTogglePin={(id, pinned) => mutateNote(id, { pinned })}
        >
          {activeDocNote ? (
            <NoteErrorBoundary key={`boundary-doc-${activeDocNote.id}`}>
              <NoteViewer
                key={activeDocNote.id}
                note={activeDocNote}
                allNotes={documentNotes}
                breadcrumbs={getBreadcrumbs(documentNotes, activeDocNote.id)}
                onSelectBreadcrumb={handleSelectBreadcrumb}
                childNotes={getChildNotes(documentNotes, activeDocNote.id)}
                onSelectChildNote={handleSelectNote}
                onNewChildNote={() => handleNewNote(activeDocNote.id, "document")}
                onMoveChildNote={(target) => setMovingNote(target)}
                onDeleteChildNote={(target) => setNoteToDelete(target)}
                onDownloadChildNote={handleDownloadNote}
                isFullWidth={isFullWidth}
                saveStatus={saveStatus}
                onBack={() => setView({ type: "dashboard" })}
                onTitleChange={(val) => currentId && mutateNote(currentId, { title: val })}
                onContentChange={(val) => currentId && mutateNote(currentId, { content: val })}
                onTagsChange={(tags) => currentId && mutateNote(currentId, { tags })}
                onAttachmentsChange={(attachments) => currentId && mutateNote(currentId, { attachments })}
                onMoveNote={() => setMovingNote(activeDocNote)}
                onDelete={() => setNoteToDelete(activeDocNote)}
                onImportMarkdown={() => fileInputRef.current?.click()}
                onToggleFullWidth={() => setIsFullWidth((v) => !v)}
                onToastMessage={showMessageToast}
                onChildViewModeChange={(mode) =>
                  currentId && mutateNote(currentId, { childViewMode: mode }, true)
                }
                onNewJournalNote={handleNewJournalNote}
                onMoodChange={(mood) => currentId && mutateNote(currentId, { mood }, true)}
                onJournalDateChange={(date) => currentId && mutateNote(currentId, { journalDate: date }, true)}
                onContextSnapshotChange={(snapshot) =>
                  currentId && mutateNote(currentId, { contextSnapshot: snapshot }, true)
                }
                onIconChange={(icon) => currentId && mutateNote(currentId, { icon: icon || "" })}
                onTogglePin={() => activeDocNote && mutateNote(activeDocNote.id, { pinned: !activeDocNote.pinned })}
                onToggleToc={(next) => currentId && mutateNote(currentId, { showToc: next }, true)}
                isDocumentSpace={true}
              />
            </NoteErrorBoundary>
          ) : (
            <ExplorerHomeView
              notes={documentNotes}
              onSelectNote={handleSelectNote}
              onCreateNewPage={() => handleNewNote(null, "document")}
              onReorderNotes={handleReorderNotes}
            />
          )}
        </DocumentSpace>
      )}

      {/* ── 3. 日記（Journal）スペース ── */}
      {activeSpace === "journal" && (
        <>
          {view.type === "dashboard" ? (
            <JournalSpace
              notes={journalNotes}
              allNotes={journalNotes}
              onSelectNote={handleSelectNote}
              onNewJournalNote={handleNewTodayJournal}
              onDeleteNote={(target) => setNoteToDelete(target)}
              onDownloadNote={handleDownloadNote}
              onMoveNote={(target) => setMovingNote(target)}
            />
          ) : activeNote ? (
            <NoteErrorBoundary key={`boundary-journal-${activeNote.id}`}>
              <NoteViewer
                key={activeNote.id}
                note={activeNote}
                allNotes={journalNotes}
                breadcrumbs={getBreadcrumbs(journalNotes, activeNote.id)}
                onSelectBreadcrumb={handleSelectBreadcrumb}
                childNotes={getChildNotes(journalNotes, activeNote.id)}
                onSelectChildNote={handleSelectNote}
                onNewChildNote={() => handleNewNote(activeNote.id, "journal")}
                onMoveChildNote={(target) => setMovingNote(target)}
                onDeleteChildNote={(target) => setNoteToDelete(target)}
                onDownloadChildNote={handleDownloadNote}
                isFullWidth={isFullWidth}
                saveStatus={saveStatus}
                onBack={handleBack}
                onTitleChange={(val) => currentId && mutateNote(currentId, { title: val })}
                onContentChange={(val) => currentId && mutateNote(currentId, { content: val })}
                onTagsChange={(tags) => currentId && mutateNote(currentId, { tags })}
                onAttachmentsChange={(attachments) => currentId && mutateNote(currentId, { attachments })}
                onMoveNote={() => setMovingNote(activeNote)}
                onDelete={() => setNoteToDelete(activeNote)}
                onImportMarkdown={() => fileInputRef.current?.click()}
                onToggleFullWidth={() => setIsFullWidth((v) => !v)}
                onToastMessage={showMessageToast}
                onChildViewModeChange={(mode) =>
                  currentId && mutateNote(currentId, { childViewMode: mode }, true)
                }
                onNewJournalNote={handleNewJournalNote}
                onMoodChange={(mood) => currentId && mutateNote(currentId, { mood }, true)}
                onJournalDateChange={(date) => currentId && mutateNote(currentId, { journalDate: date }, true)}
                onContextSnapshotChange={(snapshot) =>
                  currentId && mutateNote(currentId, { contextSnapshot: snapshot }, true)
                }
                onIconChange={(icon) => currentId && mutateNote(currentId, { icon: icon || "" })}
                onTogglePin={() => activeNote && mutateNote(activeNote.id, { pinned: !activeNote.pinned })}
                onToggleToc={(next) => currentId && mutateNote(currentId, { showToc: next }, true)}
              />
            </NoteErrorBoundary>
          ) : (
            <JournalSpace
              notes={journalNotes}
              allNotes={journalNotes}
              onSelectNote={handleSelectNote}
              onNewJournalNote={handleNewTodayJournal}
              onDeleteNote={(target) => setNoteToDelete(target)}
              onDownloadNote={handleDownloadNote}
              onMoveNote={(target) => setMovingNote(target)}
            />
          )}
        </>
      )}

      {/* ── メモ編集ポップアップモーダル（画面遷移せず中央浮遊） ── */}
      {editingMemo && (
        <MemoModal
          note={editingMemo}
          isOpen={!!editingMemo}
          onClose={() => setEditingMemo(null)}
          onSave={(id: string, patch: Partial<NoteItem>) => mutateNote(id, patch)}
          onDelete={(target: NoteItem) => {
            setEditingMemo(null);
            setNoteToDelete(target);
          }}
          onToastMessage={showMessageToast}
        />
      )}

      {showTrash && (
        <TrashModal
          deletedNotes={deletedNotes}
          onRestore={(id) => {
            mutateNote(id, { isDeleted: false });
            setShowTrash(false);
          }}
          onPermanentDelete={handlePermanentDelete}
          onEmptyTrash={handleEmptyTrash}
          onClose={() => setShowTrash(false)}
        />
      )}

      {/* 親ノート移動モーダル */}
      {movingNote && (
        <MoveNoteModal
          targetNote={movingNote}
          allNotes={notes}
          isOpen={!!movingNote}
          onClose={() => setMovingNote(null)}
          onMove={handleMoveNote}
        />
      )}

      {/* 削除確認モーダル（子ノートを含む場合はApple HIGに準拠して警告） */}
      <ConfirmModal
        isOpen={!!noteToDelete}
        title={
          subNotesCountToDelete > 0
            ? "ノートとサブノートをごみ箱に移動しますか？"
            : "ノートをごみ箱に移動しますか？"
        }
        message={
          subNotesCountToDelete > 0
            ? `「${noteToDelete?.title || "（タイトルなし）"}」には ${subNotesCountToDelete}件のサブノートが含まれています。配下のサブノートも一緒にごみ箱に移動します。後から復元することも可能です。`
            : `「${noteToDelete?.title || "（タイトルなし）"}」をごみ箱に移動します。後から復元することも可能です。`
        }
        confirmLabel="削除する"
        cancelLabel="キャンセル"
        isDestructive={true}
        onConfirm={() => {
          if (noteToDelete) {
            handleExecuteDelete(noteToDelete.id);
            setNoteToDelete(null);
          }
        }}
        onCancel={() => setNoteToDelete(null)}
      />

      {/* ── 全ページ共通: 下中央フローティングDock（メモ・ノート・日記） ── */}
      <NotesSpaceNav
        activeSpace={activeSpace}
        onChange={handleSpaceChange}
        counts={spaceCounts}
        variant="floating"
        className={isViewingNote ? "hidden sm:block" : ""}
      />

      {/* 共通削除トースト */}
      <UndoToast toast={toast} onUndo={triggerUndo} onDismiss={dismissToast} />
    </>
  );
}
