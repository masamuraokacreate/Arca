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
} from "../types";
import {
  List,
  LayoutGrid,
  BookOpen,
  Sparkles,
  Folder,
  FileText,
} from "lucide-react";
import { C } from "../lib/designSystem";
import { useUndoToast } from "../hooks/useUndoToast";
import { UndoToast } from "./common/UndoToast";
import { extractActionableItems } from "../lib/aetherCore";
import { AetherExtractModal } from "./notes/AetherExtractModal";
import { NoteEditor, type NoteEditorHandles } from "./notes/NoteEditor";
import { NoteToolbar } from "./notes/NoteToolbar";
import { MarkdownGuideModal } from "./notes/MarkdownGuideModal";
import { ConfirmModal } from "./notes/ConfirmModal";
import { NoteBreadcrumbs } from "./notes/NoteBreadcrumbs";
import { MoveNoteModal } from "./notes/MoveNoteModal";
import { JournalTimeline } from "./notes/JournalTimeline";
import { MoodPicker } from "./notes/MoodPicker";
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
    top: calc(52px + env(safe-area-inset-top, 0px));
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
  @media (max-width: 639px) {
    .arca-toolbar {
      top: calc(88px + env(safe-area-inset-top, 0px));
    }
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
    background: ${C.white};
    color: ${C.charcoal};
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

  /* レスポンシブラベル */
  .arca-btn-label-desktop {
    display: inline;
    white-space: nowrap;
  }
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
    background: ${C.white};
    color: ${C.charcoal};
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
    background-color: ${C.white};
    color: ${C.charcoalMid};
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
  childNotes,
  onSelectChildNote,
  onNewChildNote,
  onDeleteChildNote,
  onDownloadChildNote,
  onMoveChildNote,
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
  onChildViewModeChange,
  onNewJournalNote,
  onMoodChange,
  onJournalDateChange,
  onContextSnapshotChange,
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
}) {
  const [showToc, setShowToc] = useState(false);
  const [isSourceMode, setIsSourceMode] = useState(false);
  const [tagsInput, setTagsInput] = useState(note.tags.join(", "));
  const [showGuide, setShowGuide] = useState(false);
  const [isImportingFootprint, setIsImportingFootprint] = useState(false);
  const editorRef = useRef<NoteEditorHandles>(null);
  const imageFileInputRef = useRef<HTMLInputElement>(null);

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
    setTagsInput(note.tags.join(", "));
    setShowToc(false);
    setExtractedData(null);
  }, [note.id]);

  const handleTagsBlur = () => {
    const parsed = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
    onTagsChange(parsed);
  };

  const handleInsertSyntax = useCallback((syntax: string) => {
    setTimeout(() => {
      editorRef.current?.insertSyntax(syntax);
    }, 50);
  }, []);

  const toc = extractToc(note.content);
  const currentChildViewMode: NoteChildViewMode = note.childViewMode || "list";

  return (
    <div
      className="arca-view-in"
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        width: "100%",
      }}
    >
      {/* 非表示の画像ファイル選択input */}
      <input
        ref={imageFileInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageFileSelected}
        style={{ display: "none" }}
      />

      {/* ────── ツールバー ────── */}
      <NoteToolbar
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
        onToggleToc={() => setShowToc((s) => !s)}
        onDelete={onDelete}
        isSourceMode={isSourceMode}
        onToggleSourceMode={() => setIsSourceMode((s) => !s)}
      />

      {/* ────── 本文コンテナ（広大なベージュ余白と浮遊するカードシート） ────── */}
      <div
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "center",
          gap: "2rem",
          padding: isFullWidth
            ? "2rem clamp(1.5rem, 5vw, 4rem) 6rem"
            : "2rem clamp(1rem, 4vw, 3rem) 6rem",
          boxSizing: "border-box",
        }}
      >
        <div
          className="arca-layout-container"
          style={{
            width: "100%",
            maxWidth: isFullWidth ? "100%" : "880px",
            flex: 1,
            minWidth: 0,
            background: "var(--bg-surface-glass)",
            backdropFilter: "blur(20px) saturate(180%)",
            WebkitBackdropFilter: "blur(20px) saturate(180%)",
            borderRadius: "22px",
            boxShadow: "var(--shadow-modal)",
            border: "1px solid var(--border-subtle)",
            padding: "2.5rem clamp(1.5rem, 4vw, 3.5rem) 2.5rem",
            boxSizing: "border-box",
            transition: "all 0.3s ease",
          }}
        >
          {/* パンくずリスト（階層ナビゲーション） */}
          <NoteBreadcrumbs
            breadcrumbs={breadcrumbs}
            onSelectBreadcrumb={onSelectBreadcrumb}
          />

          {/* タイトル入力（直接インライン編集） */}
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
              fontSize: "2rem",
              fontWeight: 750,
              color: C.charcoal,
              letterSpacing: "-0.03em",
              lineHeight: 1.2,
              marginBottom: "0.8rem",
              boxSizing: "border-box",
            }}
          />

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
                  }}
                >
                  {tag}
                </span>
              ))}
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                onBlur={handleTagsBlur}
                placeholder={note.tags.length === 0 ? "タグを追加（カンマ区切り）" : "+ タグ追加"}
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
              {!isJournalNote && (
                <button
                  type="button"
                  onClick={() => {
                    const today = new Date().toISOString().split("T")[0];
                    const newTags = Array.from(new Set([...note.tags, "ジャーナル"]));
                    onTagsChange(newTags);
                    if (!note.journalDate) {
                      onJournalDateChange?.(today);
                    }
                  }}
                  className="appearance-none whitespace-nowrap shrink-0 flex items-center gap-1"
                  style={{
                    fontSize: "0.7rem",
                    color: C.charcoalLight,
                    background: "rgba(0,0,0,0.03)",
                    borderRadius: "6px",
                    padding: "0.15rem 0.5rem",
                    border: "none",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                  title="このノートをジャーナル形式として記録します"
                >
                  <span>+ ジャーナル化</span>
                </button>
              )}
            </div>
            <span style={{ fontSize: "0.7rem", color: C.charcoalXLight, whiteSpace: "nowrap", marginLeft: "auto" }}>
              {formatDateRelative(note.updatedAt)} 更新
            </span>
          </div>

          {/* ジャーナル メタバー（コンディション / Mood & 足跡取り込み） */}
          {isJournalNote && (
            <div
              className="flex items-center justify-between flex-wrap gap-3"
              style={{
                marginBottom: "1.6rem",
                padding: "0.75rem 1.1rem",
                background: "rgba(0, 0, 0, 0.025)",
                borderRadius: "14px",
                border: "1px solid rgba(0, 0, 0, 0.04)",
              }}
              data-testid="journal-meta-bar"
            >
              <div className="flex items-center gap-3 flex-wrap">
                <span
                  style={{
                    fontSize: "0.76rem",
                    fontWeight: 650,
                    color: C.charcoalMid,
                    letterSpacing: "-0.01em",
                  }}
                >
                  今日の気分
                </span>
                <MoodPicker
                  currentMood={note.mood}
                  onChange={(m) => onMoodChange?.(m)}
                />
              </div>

              <button
                type="button"
                onClick={handleImportFootprint}
                disabled={isImportingFootprint}
                className="appearance-none whitespace-nowrap shrink-0 flex items-center gap-1.5 transition-all active:scale-[0.98]"
                style={{
                  minHeight: "36px",
                  background: C.goldFaint2,
                  color: C.goldDark,
                  border: "none",
                  borderRadius: "9px",
                  padding: "0.4rem 0.85rem",
                  fontSize: "0.78rem",
                  fontWeight: 650,
                  cursor: isImportingFootprint ? "wait" : "pointer",
                  opacity: isImportingFootprint ? 0.7 : 1,
                  boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                }}
                title="当日のタスク・予定を本文末尾に取り込みます"
                data-testid="import-footprint-btn"
              >
                <Sparkles size={14} style={{ color: C.gold }} />
                <span>{isImportingFootprint ? "取り込み中…" : "今日の足跡を取り込む"}</span>
              </button>
            </div>
          )}

          {/* 本文（完全インライン統合エディタ） */}
          <NoteEditor
            ref={editorRef}
            content={note.content}
            attachments={note.attachments}
            onAttachmentsChange={onAttachmentsChange}
            onChange={onContentChange}
            isSourceMode={isSourceMode}
          />

          {/* ────── サブノート（Sub-notes Hub）セクション ────── */}
          <div
            style={{
              marginTop: "2rem",
              paddingTop: "1.5rem",
              borderTop: "1px solid rgba(0, 0, 0, 0.06)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "1.2rem",
                flexWrap: "wrap",
                gap: "0.8rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.8rem", flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                  <h3
                    style={{
                      fontSize: "1.08rem",
                      fontWeight: 700,
                      color: C.charcoal,
                      margin: 0,
                      letterSpacing: "-0.02em",
                    }}
                  >
                    サブノート
                  </h3>
                  {childNotes.length > 0 && (
                    <span
                      style={{
                        fontSize: "0.72rem",
                        color: C.charcoalMid,
                        background: "rgba(0,0,0,0.04)",
                        borderRadius: "12px",
                        padding: "0.15rem 0.55rem",
                        fontWeight: 600,
                      }}
                    >
                      {childNotes.length}件
                    </span>
                  )}
                </div>

                {/* ビュー切り替えピル（セグメントコントロール）: [ リスト | カード | ジャーナル ] */}
                <div
                  role="radiogroup"
                  aria-label="サブノート表示形式切り替え"
                  className="flex items-center shrink-0"
                  style={{
                    background: "rgba(0, 0, 0, 0.04)",
                    borderRadius: "9px",
                    padding: "2px",
                    gap: "2px",
                  }}
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={currentChildViewMode === "list"}
                    aria-label="リスト表示"
                    title="Notion風リスト表示"
                    onClick={() => onChildViewModeChange?.("list")}
                    className="appearance-none whitespace-nowrap shrink-0 flex items-center gap-1.5"
                    style={{
                      background: currentChildViewMode === "list" ? "var(--bg-card-solid)" : "transparent",
                      color: currentChildViewMode === "list" ? C.charcoal : C.charcoalLight,
                      border: "none",
                      borderRadius: "7px",
                      padding: "0.35rem 0.65rem",
                      cursor: "pointer",
                      fontSize: "0.76rem",
                      fontWeight: currentChildViewMode === "list" ? 650 : 500,
                      boxShadow: currentChildViewMode === "list" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <List size={14} />
                    <span>リスト</span>
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={currentChildViewMode === "board"}
                    aria-label="カード表示"
                    title="Keep風カード表示"
                    onClick={() => onChildViewModeChange?.("board")}
                    className="appearance-none whitespace-nowrap shrink-0 flex items-center gap-1.5"
                    style={{
                      background: currentChildViewMode === "board" ? "var(--bg-card-solid)" : "transparent",
                      color: currentChildViewMode === "board" ? C.charcoal : C.charcoalLight,
                      border: "none",
                      borderRadius: "7px",
                      padding: "0.35rem 0.65rem",
                      cursor: "pointer",
                      fontSize: "0.76rem",
                      fontWeight: currentChildViewMode === "board" ? 650 : 500,
                      boxShadow: currentChildViewMode === "board" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <LayoutGrid size={14} />
                    <span>カード</span>
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={currentChildViewMode === "journal"}
                    aria-label="ジャーナル表示"
                    title="ジャーナルタイムライン表示"
                    onClick={() => onChildViewModeChange?.("journal")}
                    className="appearance-none whitespace-nowrap shrink-0 flex items-center gap-1.5"
                    style={{
                      background: currentChildViewMode === "journal" ? "var(--bg-card-solid)" : "transparent",
                      color: currentChildViewMode === "journal" ? C.charcoal : C.charcoalLight,
                      border: "none",
                      borderRadius: "7px",
                      padding: "0.35rem 0.65rem",
                      cursor: "pointer",
                      fontSize: "0.76rem",
                      fontWeight: currentChildViewMode === "journal" ? 650 : 500,
                      boxShadow: currentChildViewMode === "journal" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <BookOpen size={14} />
                    <span>ジャーナル</span>
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={onNewChildNote}
                className="appearance-none whitespace-nowrap shrink-0"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  background: C.goldFaint2,
                  border: "none",
                  borderRadius: "8px",
                  padding: "0.4rem 0.85rem",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  color: C.goldDark,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = C.goldFaint3;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = C.goldFaint2;
                }}
              >
                <span style={{ fontSize: "0.95rem", lineHeight: 1 }}>＋</span>
                <span>子ノート作成</span>
              </button>
            </div>

            {currentChildViewMode === "journal" ? (
              <JournalTimeline
                childNotes={childNotes}
                allNotes={allNotes}
                onSelectChildNote={onSelectChildNote}
                onNewJournalNote={onNewJournalNote || (() => onNewChildNote())}
                onMoveChildNote={onMoveChildNote}
                onDeleteChildNote={onDeleteChildNote}
                onDownloadChildNote={onDownloadChildNote}
              />
            ) : childNotes.length === 0 ? (
              <div
                style={{
                  background: "rgba(0, 0, 0, 0.015)",
                  borderRadius: "14px",
                  border: "1px dashed rgba(0, 0, 0, 0.07)",
                  padding: "1.8rem 1.5rem",
                  textAlign: "center",
                }}
              >
                <p style={{ margin: 0, fontSize: "0.8rem", color: C.charcoalLight }}>
                  サブノートはまだありません
                </p>
              </div>
            ) : currentChildViewMode === "list" ? (
              /* Notion風リスト表示 */
              <div
                className="flex flex-col w-full"
                style={{ gap: "0.25rem" }}
                data-testid="subnotes-list-view"
              >
                {childNotes.map((child) => (
                  <NoteSubNoteListItem
                    key={child.id}
                    note={child}
                    childCount={getChildCount(allNotes, child.id)}
                    onClick={() => onSelectChildNote(child.id)}
                    onMove={(e) => {
                      e.stopPropagation();
                      onMoveChildNote?.(child);
                    }}
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
            ) : (
              /* Google Keep風カードグリッド表示 */
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                  gap: "1rem",
                }}
                data-testid="subnotes-board-view"
              >
                {childNotes.map((child) => (
                  <NoteCard
                    key={child.id}
                    note={child}
                    childCount={getChildCount(allNotes, child.id)}
                    onClick={() => onSelectChildNote(child.id)}
                    onMove={(e) => {
                      e.stopPropagation();
                      onMoveChildNote?.(child);
                    }}
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
            )}
          </div>
        </div>

        {/* TOC Sidebar */}
        {showToc && (
          <aside style={{ width: "240px", flexShrink: 0, marginTop: "0.5rem", display: "block" }}>
            <div
              style={{
                position: "sticky",
                top: "7rem",
                background: "var(--bg-surface-glass)",
                backdropFilter: "blur(16px)",
                padding: "1rem",
                borderRadius: "16px",
                boxShadow: C.cardShadow,
                maxHeight: "calc(100vh - 10rem)",
                overflowY: "auto",
                border: "1px solid var(--border-subtle)",
              }}
              className="arca-scroll"
            >
              <h4 style={{ fontSize: "0.75rem", fontWeight: 700, color: C.charcoalMid, margin: "0 0 1rem", letterSpacing: "0.05em" }}>
                目次
              </h4>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {toc.length === 0 ? (
                  <li style={{ fontSize: "0.75rem", color: C.charcoalXLight }}>見出しがありません</li>
                ) : (
                  toc.map((t) => (
                    <li key={t.id} style={{ paddingLeft: `${(t.level - 1) * 0.8}rem` }}>
                      <a
                        href={`#${t.id}`}
                        onClick={(e) => {
                          e.preventDefault();
                          const el = document.getElementById(t.id);
                          if (el) {
                            const headerOffset = 110;
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
        )}
      </div>

      {/* フッター（文字数・保存ステータス） */}
      <footer
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "0.45rem 2rem calc(0.45rem + env(safe-area-inset-bottom, 0px)) 2rem",
          textAlign: "right",
          background: "var(--bg-surface-glass)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          pointerEvents: "none",
          zIndex: 40,
          borderTop: "1px solid var(--border-subtle)",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.3rem",
            fontSize: "0.66rem",
            color: saveStatus === "saving" ? C.charcoalXLight : C.goldDark,
            letterSpacing: "0.04em",
            marginRight: "1rem",
          }}
        >
          {saveStatus === "saving" && "保存中..."}
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
              保存済み
            </>
          )}
        </span>
        <span style={{ fontSize: "0.66rem", color: C.charcoalXLight, letterSpacing: "0.04em" }}>
          {note.content.length.toLocaleString()} 文字
        </span>
      </footer>

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

/**
 * Notion風リストアイテム（枠線なし、上品なホバー、1行コンパクト表示）
 */
function NoteSubNoteListItem({
  note,
  childCount = 0,
  onClick,
  onMove,
  onDelete,
  onDownload,
}: {
  note: NoteItem;
  childCount?: number;
  onClick: () => void;
  onMove?: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  onDownload: (e: React.MouseEvent) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const hasChildren = childCount > 0;

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
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className="group w-full max-w-full overflow-x-hidden rounded-xl px-3.5 py-2.5 flex items-center justify-between cursor-pointer transition-colors duration-150 hover:bg-stone-100/60 dark:hover:bg-stone-800/60"
      style={{
        border: "none",
        background: "transparent",
        minHeight: "44px",
        boxSizing: "border-box",
      }}
      data-testid={`subnote-list-item-${note.id}`}
    >
      {/* 左側: アイコン + タイトル + サブノート件数 + タグ */}
      <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-3">
        {/* アイコン: フォルダまたはドキュメント */}
        <span
          className="shrink-0 flex items-center justify-center select-none"
          style={{ opacity: 0.85, color: hasChildren ? C.gold : C.charcoalLight }}
          aria-hidden="true"
        >
          {hasChildren ? <Folder size={16} /> : <FileText size={16} />}
        </span>

        {/* タイトル */}
        <span
          className="font-medium text-sm truncate"
          style={{
            color: C.charcoal,
            letterSpacing: "-0.012em",
          }}
        >
          {note.title || "（タイトルなし）"}
        </span>

        {/* 子ノート件数バッジ */}
        {hasChildren && (
          <span
            className="shrink-0 whitespace-nowrap text-xs rounded px-1.5 py-0.5"
            style={{
              fontSize: "0.65rem",
              color: C.charcoalMid,
              background: "rgba(0,0,0,0.04)",
              fontWeight: 600,
            }}
          >
            {childCount}件
          </span>
        )}

        {/* タグ */}
        {note.tags && note.tags.length > 0 && (
          <div className="hidden sm:flex items-center gap-1 shrink-0">
            {note.tags.slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="whitespace-nowrap rounded px-1.5 py-0.5 font-medium"
                style={{
                  fontSize: "0.62rem",
                  color: C.gold,
                  background: C.goldFaint,
                }}
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 右側: 更新日時 + メニュー */}
      <div className="flex items-center gap-3 shrink-0">
        <span
          className="text-xs whitespace-nowrap"
          style={{ fontSize: "0.7rem", color: C.charcoalXLight }}
        >
          {formatDateRelative(note.updatedAt)}
        </span>

        {/* 「…」メニュー */}
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
            className="appearance-none shrink-0 flex items-center justify-center cursor-pointer transition-opacity"
            style={{
              background: menuOpen ? C.goldFaint2 : "transparent",
              border: "none",
              borderRadius: "6px",
              width: "28px",
              height: "28px",
              color: C.charcoalLight,
              fontSize: "0.9rem",
              lineHeight: 1,
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
                zIndex: 30,
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
                  className="appearance-none whitespace-nowrap flex items-center gap-2 w-full text-left cursor-pointer transition-colors"
                  style={{
                    background: "transparent",
                    border: "none",
                    borderRadius: "7px",
                    padding: "0.5rem 0.75rem",
                    fontSize: "0.8rem",
                    color: C.charcoal,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = C.goldFaint;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  <MenuFolderMoveIcon />
                  <span>移動</span>
                </button>
              )}
              <button
                type="button"
                onClick={(e) => {
                  setMenuOpen(false);
                  onDownload(e);
                }}
                className="appearance-none whitespace-nowrap flex items-center gap-2 w-full text-left cursor-pointer transition-colors"
                style={{
                  background: "transparent",
                  border: "none",
                  borderRadius: "7px",
                  padding: "0.5rem 0.75rem",
                  fontSize: "0.8rem",
                  color: C.charcoal,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = C.goldFaint;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                <MenuFileDownloadIcon />
                <span>md 保存</span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  setMenuOpen(false);
                  onDelete(e);
                }}
                className="appearance-none whitespace-nowrap flex items-center gap-2 w-full text-left cursor-pointer transition-colors"
                style={{
                  background: "transparent",
                  border: "none",
                  borderRadius: "7px",
                  padding: "0.5rem 0.75rem",
                  fontSize: "0.8rem",
                  color: "#c0614a",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(192,97,74,0.07)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
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
          gap: "0.75rem",
          width: "100%",
          maxWidth: "100%",
          minWidth: 0,
          boxSizing: "border-box",
          overflow: "hidden",
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
                  zIndex: 20,
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
        cursor: "pointer",
        border: "1px solid var(--border-subtle)",
        overflow: "hidden",
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
              zIndex: 20,
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
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        background: "rgba(253,252,250,0.5)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
      }}
    >
      <div
        className="arca-card"
        style={{
          background: "var(--bg-card-solid)",
          borderRadius: "20px",
          boxShadow: C.toastShadow,
          width: "100%",
          maxWidth: "800px",
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          border: "1px solid var(--border-subtle)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1.5rem 2rem", borderBottom: "1px solid var(--border-subtle)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <h2 style={{ fontSize: "1.2rem", fontWeight: 700, margin: 0, color: C.charcoal }}>ごみ箱</h2>
            {deletedNotes.length > 0 && (
              <button
                type="button"
                onClick={onEmptyTrash}
                style={{
                  background: "rgba(224, 86, 74, 0.08)",
                  border: "none",
                  borderRadius: "6px",
                  padding: "0.3rem 0.65rem",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  color: C.danger,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                ごみ箱を空にする
              </button>
            )}
          </div>
          <button onClick={onClose} aria-label="閉じる" style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: "1.2rem", color: C.charcoalLight }}>✕</button>
        </div>
        <div className="arca-scroll" style={{ padding: "2rem", overflowY: "auto", flex: 1, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "1rem" }}>
          {deletedNotes.length === 0 ? (
            <p style={{ gridColumn: "1 / -1", textAlign: "center", color: C.charcoalXLight, fontSize: "0.9rem", margin: "2rem 0" }}>ごみ箱は空です</p>
          ) : (
            deletedNotes.map((n) => (
              <div key={n.id} style={{ background: "var(--bg-nav-track)", border: "1px solid var(--border-subtle)", borderRadius: "12px", padding: "1.2rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                <h3 style={{ fontSize: "0.95rem", margin: 0, color: C.charcoal, fontWeight: 650, display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{n.title || "（タイトルなし）"}</h3>
                <p style={{ fontSize: "0.75rem", color: C.charcoalMid, margin: 0, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", lineHeight: 1.5 }}>{getExcerpt(n.content, 60)}</p>
                <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <button onClick={() => onRestore(n.id)} style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "6px", padding: "0.4rem 0.8rem", fontSize: "0.75rem", cursor: "pointer", color: C.charcoal, fontWeight: 600, transition: "background 0.15s" }}>復元する</button>
                  <button onClick={() => onPermanentDelete(n.id)} style={{ background: "rgba(224, 86, 74, 0.08)", border: "none", borderRadius: "6px", padding: "0.4rem 0.8rem", fontSize: "0.75rem", cursor: "pointer", color: C.danger, fontWeight: 600, transition: "background 0.15s" }}>完全に削除</button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// ノートダッシュボード（グリッド一覧）
// ─────────────────────────────────────────

function NoteDashboard({
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
      className="arca-view-in"
      style={{
        minHeight: "100vh",
        width: "100%",
        maxWidth: "100%",
        overflowX: "hidden",
        boxSizing: "border-box",
        padding: "2.4rem clamp(1.5rem, 5vw, 4rem) 6rem",
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
          <p
            style={{
              fontSize: "0.68rem",
              fontWeight: 650,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: C.charcoalLight,
              margin: 0,
            }}
          >
            NOTES
          </p>
          <h1
            style={{
              fontSize: "1.75rem",
              fontWeight: 750,
              color: C.charcoal,
              margin: "0.15rem 0 0",
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
            style={{
              display: "flex",
              background: "rgba(0, 0, 0, 0.04)",
              borderRadius: "9px",
              padding: "2px",
              gap: "1px",
              flexShrink: 0,
            }}
          >
            <button
              onClick={() => handleToggleLayoutStyle("grid")}
              aria-label="グリッド表示"
              title="グリッド表示"
              style={{
                background: layoutStyle === "grid" ? C.white : "transparent",
                color: layoutStyle === "grid" ? C.charcoal : C.charcoalLight,
                border: "none",
                borderRadius: "7px",
                padding: "0.4rem 0.55rem",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: layoutStyle === "grid" ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
                transition: "all 0.15s ease",
              }}
            >
              <NotesGridIcon />
            </button>
            <button
              onClick={() => handleToggleLayoutStyle("list")}
              aria-label="リスト表示"
              title="リスト表示"
              style={{
                background: layoutStyle === "list" ? C.white : "transparent",
                color: layoutStyle === "list" ? C.charcoal : C.charcoalLight,
                border: "none",
                borderRadius: "7px",
                padding: "0.4rem 0.55rem",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: layoutStyle === "list" ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
                transition: "all 0.15s ease",
              }}
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
  const [view, setView] = useState<View>(() =>
    initialNoteId ? { type: "viewer", noteId: initialNoteId } : { type: "dashboard" }
  );

  useEffect(() => {
    if (initialNoteId) {
      setView({ type: "viewer", noteId: initialNoteId });
    }
  }, [initialNoteId]);

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
        });
      });
      setNotes(fetched);
    });
    return () => unsubscribe();
  }, []);

  const activeNotes = notes.filter((n) => !n.isDeleted);
  const rootNotes = activeNotes.filter((n) => !n.parentId);
  const deletedNotes = notes.filter((n) => n.isDeleted);

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
          } catch (e) {
            console.error("Undo failed", e);
          }
        },
      });
    },
    [notes, view, showUndoToast]
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
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        isDeleted: false,
        parentId: null,
      });
      setView({ type: "viewer", noteId: docRef.id });
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

  // 新規ノート作成（親ノート指定可能）
  const handleNewNote = useCallback(async (parentId: string | null = null) => {
    try {
      const docRef = await addDoc(collection(db, "notes"), {
        title: "",
        content: "",
        tags: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        isDeleted: false,
        parentId: parentId || null,
      });
      setView({ type: "viewer", noteId: docRef.id });
    } catch (e) {
      console.error("Create failed", e);
    }
  }, []);

  // 新規ジャーナルノート作成
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

  const handleSelectNote = useCallback((id: string) => {
    setView({ type: "viewer", noteId: id });
  }, []);

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
      await Promise.all(deletedNotes.map((n) => deleteDoc(doc(db, "notes", n.id))));
      setNotes((prev) => prev.filter((n) => !n.isDeleted));
      setShowTrash(false);
      showMessageToast("ごみ箱を空にしました");
    } catch (e) {
      console.error("Empty trash failed", e);
      showMessageToast("削除中にエラーが発生しました");
    }
  }, [deletedNotes, showMessageToast]);

  const currentId = view.type === "viewer" ? view.noteId : null;

  // 削除対象のノート配下の子孫ノート件数を集計
  const subNotesCountToDelete = noteToDelete
    ? getDescendantNoteIds(notes, noteToDelete.id).filter(
        (dId) => dId !== noteToDelete.id && !notes.find((n) => n.id === dId)?.isDeleted
      ).length
    : 0;

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

      {view.type === "dashboard" && (
        <NoteDashboard
          key="dashboard"
          notes={rootNotes}
          allNotes={activeNotes}
          onSelectNote={handleSelectNote}
          onNewNote={() => handleNewNote(null)}
          onMoveNote={(target) => setMovingNote(target)}
          onDeleteNote={(target) => setNoteToDelete(target)}
          onDownloadNote={handleDownloadNote}
          onTriggerImport={() => fileInputRef.current?.click()}
          onOpenTrash={() => setShowTrash(true)}
        />
      )}

      {view.type === "viewer" && activeNote && (
        <NoteErrorBoundary key={`boundary-${activeNote.id}`}>
          <NoteViewer
            key={activeNote.id}
            note={activeNote}
            allNotes={notes}
            breadcrumbs={getBreadcrumbs(notes, activeNote.id)}
            onSelectBreadcrumb={handleSelectBreadcrumb}
            childNotes={getChildNotes(activeNotes, activeNote.id)}
            onSelectChildNote={handleSelectNote}
            onNewChildNote={() => handleNewNote(activeNote.id)}
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
          />
        </NoteErrorBoundary>
      )}

      {/* ビューア表示中にノートがなくなった場合はダッシュボードへ */}
      {view.type === "viewer" && !activeNote && (
        <NoteDashboard
          key="dashboard-fallback"
          notes={rootNotes}
          allNotes={activeNotes}
          onSelectNote={handleSelectNote}
          onNewNote={() => handleNewNote(null)}
          onMoveNote={(target) => setMovingNote(target)}
          onDeleteNote={(target) => setNoteToDelete(target)}
          onDownloadNote={handleDownloadNote}
          onTriggerImport={() => fileInputRef.current?.click()}
          onOpenTrash={() => setShowTrash(true)}
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

      {/* 共通削除トースト */}
      <UndoToast toast={toast} onUndo={triggerUndo} onDismiss={dismissToast} />
    </>
  );
}
