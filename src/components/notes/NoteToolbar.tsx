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

import { C } from "../../lib/designSystem";

// アイコン定義
const ChevronLeftIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="m15 18-6-6 6-6" />
  </svg>
);

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

export interface NoteToolbarProps {
  onBack: () => void;
  onMoveNote?: () => void;
  onInsertImage?: () => void;
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
  onBack,
  onMoveNote,
  onInsertImage,
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
    <header className="arca-toolbar">
      {/* ── 左側: 戻る ── */}
      <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
        <button
          onClick={onBack}
          className="arca-tb-btn"
          title="ノート一覧に戻る"
          style={{ paddingLeft: "0.2rem" }}
        >
          <ChevronLeftIcon />
          <span className="arca-btn-label-desktop">ノート一覧</span>
          <span className="arca-btn-label-mobile">戻る</span>
        </button>
      </div>

      {/* ── 右側: コントロール群 ── */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", flexShrink: 0 }}>
        {/* ✦ Aether 抽出ボタン */}
        <button
          onClick={onExtract}
          disabled={isExtracting || !canExtract}
          className="arca-tb-btn"
          title="ノートから買い物リスト・タスクを抽出"
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
          <span className="arca-btn-label-desktop">✦ Aether 抽出</span>
          <span className="arca-btn-label-mobile">✦ 抽出</span>
        </button>

        {/* 画像挿入（🖼）ボタン（常時利用可能） */}
        {onInsertImage && (
          <button
            onClick={onInsertImage}
            className="arca-tb-btn"
            title="画像を挿入（貼り付け・ファイル選択）"
          >
            <ImageIcon />
            <span className="arca-btn-label-desktop">画像</span>
          </button>
        )}

        {/* 親ノート移動（📁）ボタン */}
        {onMoveNote && (
          <button
            onClick={onMoveNote}
            className="arca-tb-btn"
            title="親ノートを変更・移動する"
          >
            <FolderMoveIcon />
            <span className="arca-btn-label-desktop">移動</span>
          </button>
        )}

        {/* エクスポート（↑）ボタン */}
        <button
          onClick={onDownloadMarkdown}
          className="arca-tb-btn"
          title="Markdownファイル (.md) としてエクスポート"
        >
          <ExportIcon />
          <span className="arca-btn-label-desktop">エクスポート</span>
          <span className="arca-btn-label-mobile">書き出し</span>
        </button>

        {/* インポート（↓）ボタン */}
        {onImportMarkdown && (
          <button
            onClick={onImportMarkdown}
            className="arca-tb-btn"
            title="Markdownファイル (.md / .txt) をインポート"
          >
            <ImportIcon />
            <span className="arca-btn-label-desktop">インポート</span>
          </button>
        )}

        {/* Markdown 構文ガイド（?）ボタン */}
        <button
          onClick={onOpenGuide}
          className="arca-tb-btn"
          title="Markdown 構文ガイドを確認"
        >
          <HelpCircleIcon />
          <span className="arca-btn-label-desktop">ガイド</span>
        </button>

        {/* ソース（Markdownテキストモード）切替ボタン */}
        {onToggleSourceMode && (
          <button
            onClick={onToggleSourceMode}
            className={`arca-tb-btn ${isSourceMode ? "active" : ""}`}
            title={isSourceMode ? "リッチエディタ（WYSIWYG）に切り替え" : "テキストモード（生Markdown）に切り替え"}
            style={{
              fontWeight: isSourceMode ? 600 : 400,
              background: isSourceMode ? C.goldFaint : undefined,
              color: isSourceMode ? C.goldDark : undefined,
            }}
          >
            <CodeIcon />
            <span className="arca-btn-label-desktop">{isSourceMode ? "WYSIWYG" : "ソース"}</span>
            <span className="arca-btn-label-mobile">{isSourceMode ? "リッチ" : "生文"}</span>
          </button>
        )}

        <div className="arca-tb-divider" />

        {/* Full Width トグル */}
        <button
          onClick={onToggleFullWidth}
          className={`arca-tb-btn ${isFullWidth ? "active" : ""}`}
          title={isFullWidth ? "標準幅に戻す" : "全画面で表示"}
        >
          {isFullWidth ? <ShrinkIcon /> : <ExpandIcon />}
          <span className="arca-btn-label-desktop">{isFullWidth ? "標準幅" : "全画面"}</span>
        </button>

        {/* 目次 トグル */}
        <button
          onClick={onToggleToc}
          className={`arca-tb-btn ${showToc ? "active" : ""}`}
          title={showToc ? "目次を非表示" : "目次を表示"}
        >
          <TocIcon />
          <span className="arca-btn-label-desktop">目次</span>
        </button>

        <div className="arca-tb-divider" />

        {/* 削除 */}
        <button
          onClick={onDelete}
          className="arca-tb-btn arca-tb-btn-delete"
          title="このノートを削除"
        >
          <TrashIcon />
          <span className="arca-btn-label-desktop">削除</span>
        </button>
      </div>
    </header>
  );
}
