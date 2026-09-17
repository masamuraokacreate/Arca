/**
 * src/components/notes/NoteToolbar.tsx
 * Arca — NoteViewer 用ヘッダーツールバー (Apple HIG 準拠)
 *
 * 機能:
 * - 戻る（一覧へ）
 * - 閲覧 / 編集 セグメントコントロール
 * - ✦ Aether Core 抽出
 * - エクスポート（↑ Markdownファイル保存・書き出し）
 * - インポート（↓ Markdownファイル読み込み）
 * - Markdown 構文ガイド（?）
 * - 全画面（Full Width）トグル
 * - 目次（TOC）トグル
 * - ノート削除
 */

import { ChevronLeft } from "lucide-react";
import { C } from "../../lib/designSystem";

// アイコン定義
// エクスポート（↑ 上向き矢印）
const ExportIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

// インポート（↓ 下向き矢印）
const ImportIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const HelpCircleIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <circle cx="12" cy="12" r="10" />
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const ExpandIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="M15 3h6v6" />
    <path d="M9 21H3v-6" />
    <path d="M21 3l-7 7" />
    <path d="M3 21l7-7" />
  </svg>
);

const ShrinkIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="M4 14h6v6" />
    <path d="M20 10h-6V4" />
    <path d="M14 10l7-7" />
    <path d="M3 21l7-7" />
  </svg>
);

const TocIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <line x1="21" x2="3" y1="6" y2="6" />
    <line x1="15" x2="3" y1="12" y2="12" />
    <line x1="17" x2="3" y1="18" y2="18" />
  </svg>
);

const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="M3 6h18" />
    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
  </svg>
);

const SparklesIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: C.gold }}>
    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
    <path d="M5 3v4" />
    <path d="M19 17v4" />
    <path d="M3 5h4" />
    <path d="M17 19h4" />
  </svg>
);

const FolderMoveIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    <path d="m14 15 3-3-3-3" />
    <path d="M10 12h7" />
  </svg>
);

const ImageIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
  </svg>
);

const CodeIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
  </svg>
);

const PinIcon = ({ isPinned }: { isPinned?: boolean }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill={isPinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <line x1="12" y1="17" x2="12" y2="22" />
    <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
  </svg>
);

export interface NoteToolbarProps {
  sidebarToggleSlot?: React.ReactNode;
  leftSlot?: React.ReactNode;
  title?: string;
  saveStatus?: "idle" | "saving" | "saved";
  onBack?: () => void;
  onMoveNote?: () => void;
  onInsertImage?: () => void;
  isPinned?: boolean;
  onTogglePin?: () => void;
  onChangeIcon?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onExtract: () => void;
  isExtracting: boolean;
  canExtract: boolean;
  onDownloadMarkdown: () => void;
  onImportMarkdown?: () => void;
  onOpenGuide: () => void;
  isFullWidth: boolean;
  onToggleFullWidth: () => void;
  showToc: boolean;
  onToggleToc: () => void;
  onDelete: () => void;
  isSourceMode?: boolean;
  onToggleSourceMode?: () => void;
}

export function NoteToolbar({
  sidebarToggleSlot,
  leftSlot,
  title: _title,
  saveStatus,
  onBack,
  onMoveNote,
  onInsertImage,
  isPinned = false,
  onTogglePin,
  onChangeIcon: _onChangeIcon,
  onUndo: _onUndo,
  onRedo: _onRedo,
  canUndo: _canUndo = true,
  canRedo: _canRedo = true,
  onExtract,
  isExtracting,
  canExtract,
  onDownloadMarkdown,
  onImportMarkdown,
  onOpenGuide,
  isFullWidth,
  onToggleFullWidth,
  showToc,
  onToggleToc,
  onDelete,
  isSourceMode,
  onToggleSourceMode,
}: NoteToolbarProps) {
  return (
    <header className="sticky top-0 z-50 w-full bg-[var(--bg-surface-glass)] backdrop-blur-xl -webkit-backdrop-blur-xl border-b border-black/[0.06] dark:border-white/[0.08] flex flex-col">
      {/* ── 1. 上部ヘッダー（ナビゲーション ＆ タイトル・ステータス ＆ 目次） ── */}
      <div className="flex items-center justify-between px-2 sm:px-4 h-11 w-full gap-2 border-b border-black/[0.03] dark:border-white/[0.04]">
        {/* 左端: タブのアイコン（サイドバー展開） ＆ 戻るボタン ＆ パンくずスロット */}
        <div className="flex items-center gap-1 min-w-0 flex-1">
          {sidebarToggleSlot && (
            <div className="shrink-0 flex items-center">
              {sidebarToggleSlot}
            </div>
          )}
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label="一覧に戻る"
              title="一覧に戻る"
              className="w-11 h-11 -ml-1 sm:ml-0 rounded-xl flex items-center justify-center text-charcoal-light hover:text-charcoal hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 transition-all cursor-pointer border-none bg-transparent shrink-0"
            >
              <ChevronLeft className="w-5 h-5 text-[#B58D3D]" />
            </button>
          )}
          {leftSlot && (
            <div className="flex items-center min-w-0 flex-1 overflow-x-auto no-scrollbar py-0.5">
              {leftSlot}
            </div>
          )}
        </div>

        {/* 中央: 控えめな保存ステータス（保存中・保存済みのアニメーション通知のみ） */}
        <div className="flex items-center justify-center min-w-0 px-2 select-none">
          {saveStatus && saveStatus !== "idle" && (
            <span className="text-[11px] font-medium text-charcoal-light flex items-center gap-1.5 shrink-0 animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-[#B58D3D]" />
              {saveStatus === "saving" ? "保存中…" : "保存済み"}
            </span>
          )}
        </div>

        {/* 右端: 目次アクション ＆ ごみ箱（赤文字） */}
        <div className="flex items-center gap-1 shrink-0">
          {/* 目次はPC・タブレットのみ表示（スマホでは非表示） */}
          <button
            type="button"
            onClick={onToggleToc}
            className={`w-9 h-9 rounded-lg !hidden sm:!flex items-center justify-center transition-colors cursor-pointer border-none ${
              showToc
                ? "bg-amber-500/15 text-[#B58D3D]"
                : "text-charcoal-light hover:text-charcoal hover:bg-black/5 dark:hover:bg-white/5 bg-transparent"
            }`}
            title={showToc ? "目次を非表示" : "目次を表示"}
            aria-label="目次"
          >
            <TocIcon />
          </button>
          {/* ごみ箱ボタン（パンくず右端に赤文字で配置） */}
          <button
            type="button"
            onClick={onDelete}
            className="h-9 px-2 rounded-lg flex items-center gap-1 text-red-500 hover:text-red-600 hover:bg-red-500/10 active:scale-95 transition-all cursor-pointer border-none bg-transparent text-xs font-medium shrink-0"
            title="このノートを削除"
            aria-label="削除"
          >
            <TrashIcon />
            <span className="arca-btn-label-desktop">削除</span>
            <span className="arca-btn-label-mobile">ごみ箱</span>
          </button>
        </div>
      </div>

      {/* ── 2. 書式・挿入ツールバー（PCでは文字表示、狭い画面やスマホではアイコン化） ── */}
      <div className="flex flex-row items-center gap-1 sm:gap-1.5 overflow-x-auto no-scrollbar py-1.5 px-3 bg-[var(--bg-surface-glass)]/60">
        {/* ✦ Aether 抽出ボタン */}
        <button
          type="button"
          onClick={onExtract}
          disabled={isExtracting || !canExtract}
          className="arca-tb-btn shrink-0 h-9 min-w-[36px] min-h-[36px] px-2 sm:px-2.5 flex items-center justify-center"
          title="ノートから買い物リスト・タスクを抽出"
          aria-label="Aether 抽出"
          style={{
            color: C.goldDark,
            background: C.goldFaint,
            fontWeight: 600,
            cursor: isExtracting || !canExtract ? "default" : "pointer",
            opacity: !canExtract ? 0.5 : 1,
          }}
        >
          {isExtracting ? (
            <span style={{ display: "inline-flex", gap: "2px", alignItems: "center", height: "14px" }}>
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  style={{
                    width: "3px",
                    height: "3px",
                    borderRadius: "50%",
                    backgroundColor: C.gold,
                    display: "inline-block",
                    animation: `aether-pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                  }}
                />
              ))}
            </span>
          ) : (
            <SparklesIcon />
          )}
          <span className="arca-btn-label-desktop ml-1">✦ Aether 抽出</span>
          <span className="arca-btn-label-mobile ml-1">抽出</span>
        </button>

        {/* 画像挿入ボタン */}
        {onInsertImage && (
          <button
            type="button"
            onClick={onInsertImage}
            className="arca-tb-btn shrink-0 h-9 min-w-[36px] min-h-[36px] px-2 sm:px-2.5 flex items-center justify-center"
            title="画像を挿入（貼り付け・ファイル選択）"
            aria-label="画像を挿入"
          >
            <ImageIcon />
            <span className="arca-btn-label-desktop ml-1">画像</span>
            <span className="arca-btn-label-mobile ml-1">画像</span>
          </button>
        )}

        {/* ピン留めボタン */}
        {onTogglePin && (
          <button
            type="button"
            onClick={onTogglePin}
            className={`arca-tb-btn shrink-0 h-9 min-w-[36px] min-h-[36px] px-2 sm:px-2.5 flex items-center justify-center ${isPinned ? "active" : ""}`}
            title={isPinned ? "ピン留めを解除" : "ピン留め"}
            aria-label="ピン留め"
            style={{
              color: isPinned ? C.goldDark : undefined,
              background: isPinned ? C.goldFaint : undefined,
            }}
          >
            <PinIcon isPinned={isPinned} />
            <span className="arca-btn-label-desktop ml-1">{isPinned ? "ピン解除" : "ピン留め"}</span>
            <span className="arca-btn-label-mobile ml-1">{isPinned ? "ピン解除" : "ピン留め"}</span>
          </button>
        )}

        {/* 親ノート移動ボタン */}
        {onMoveNote && (
          <button
            type="button"
            onClick={onMoveNote}
            className="arca-tb-btn shrink-0 h-9 min-w-[36px] min-h-[36px] px-2 sm:px-2.5 flex items-center justify-center"
            title="親ノートを変更・移動する"
            aria-label="親ノートを変更・移動"
          >
            <FolderMoveIcon />
            <span className="arca-btn-label-desktop ml-1">移動</span>
            <span className="arca-btn-label-mobile ml-1">移動</span>
          </button>
        )}

        {/* エクスポート（書き出し）ボタン（スマホ不要 → PCのみ表示） */}
        <button
          type="button"
          onClick={onDownloadMarkdown}
          className="arca-tb-btn arca-tb-btn-desktop-only shrink-0 h-9 min-w-[36px] min-h-[36px] px-2 sm:px-2.5 !hidden sm:!inline-flex items-center justify-center"
          title="Markdownファイル (.md) としてエクスポート"
          aria-label="エクスポート"
        >
          <ExportIcon />
          <span className="arca-btn-label-desktop ml-1">エクスポート</span>
        </button>

        {/* インポート（読み込み）ボタン（スマホ不要 → PCのみ表示） */}
        {onImportMarkdown && (
          <button
            type="button"
            onClick={onImportMarkdown}
            className="arca-tb-btn arca-tb-btn-desktop-only shrink-0 h-9 min-w-[36px] min-h-[36px] px-2 sm:px-2.5 !hidden sm:!inline-flex items-center justify-center"
            title="Markdownファイル (.md / .txt) をインポート"
            aria-label="インポート"
          >
            <ImportIcon />
            <span className="arca-btn-label-desktop ml-1">インポート</span>
          </button>
        )}

        {/* 構文ガイドボタン */}
        <button
          type="button"
          onClick={onOpenGuide}
          className="arca-tb-btn shrink-0 h-9 min-w-[36px] min-h-[36px] px-2 sm:px-2.5 flex items-center justify-center"
          title="構文ガイドを確認"
          aria-label="構文ガイド"
        >
          <HelpCircleIcon />
          <span className="arca-btn-label-desktop ml-1">ガイド</span>
          <span className="arca-btn-label-mobile ml-1">ガイド</span>
        </button>

        {/* ソース切替（Markdownとリッチテキストの切り替え）ボタン（スマホ不要 → PCのみ表示） */}
        {onToggleSourceMode && (
          <button
            type="button"
            onClick={onToggleSourceMode}
            className={`arca-tb-btn arca-tb-btn-desktop-only shrink-0 h-9 min-w-[36px] min-h-[36px] px-2 sm:px-2.5 !hidden sm:!inline-flex items-center justify-center ${isSourceMode ? "active" : ""}`}
            title={isSourceMode ? "リッチエディタ（WYSIWYG）に切り替え" : "テキストモード（生Markdown）に切り替え"}
            aria-label={isSourceMode ? "リッチエディタに切り替え" : "テキストモードに切り替え"}
            style={{
              fontWeight: isSourceMode ? 600 : 400,
              background: isSourceMode ? C.goldFaint : undefined,
              color: isSourceMode ? C.goldDark : undefined,
            }}
          >
            <CodeIcon />
            <span className="arca-btn-label-desktop ml-1">{isSourceMode ? "WYSIWYG" : "ソース"}</span>
          </button>
        )}

        <div className="arca-tb-divider arca-tb-divider-desktop-only shrink-0 !hidden sm:!block" />

        {/* Full Width（全画面表示）トグル（スマホ不要 → PCのみ表示） */}
        <button
          type="button"
          onClick={onToggleFullWidth}
          className={`arca-tb-btn arca-tb-btn-desktop-only shrink-0 h-9 min-w-[36px] min-h-[36px] px-2 sm:px-2.5 !hidden sm:!inline-flex items-center justify-center ${isFullWidth ? "active" : ""}`}
          title={isFullWidth ? "標準幅に戻す" : "全画面で表示"}
          aria-label={isFullWidth ? "標準幅に戻す" : "全画面で表示"}
        >
          {isFullWidth ? <ShrinkIcon /> : <ExpandIcon />}
          <span className="arca-btn-label-desktop ml-1">{isFullWidth ? "標準幅" : "全画面"}</span>
        </button>
      </div>
    </header>
  );
}
