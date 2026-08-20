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
  doc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import type { NoteItem, ExtractedActionableItems } from "../types";
import { C } from "../lib/designSystem";
import { useUndoToast } from "../hooks/useUndoToast";
import { UndoToast } from "./common/UndoToast";
import { extractActionableItems } from "../lib/aetherCore";
import { AetherExtractModal } from "./notes/AetherExtractModal";
import { MarkdownViewer } from "./notes/MarkdownViewer";
import { NoteEditor, type NoteEditorHandles } from "./notes/NoteEditor";
import { NoteToolbar } from "./notes/NoteToolbar";
import { MarkdownGuideModal } from "./notes/MarkdownGuideModal";
import { ConfirmModal } from "./notes/ConfirmModal";
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
    background: rgba(253, 252, 250, 0.88);
    backdrop-filter: blur(16px) saturate(180%);
    -webkit-backdrop-filter: blur(16px) saturate(180%);
    box-shadow: 0 1px 0 rgba(0, 0, 0, 0.05);
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

  @media (max-width: 640px) {
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
  }
`;

// ─────────────────────────────────────────
// ノートビューア（閲覧 ⇄ 編集 全画面）
// ─────────────────────────────────────────

type NoteViewMode = "read" | "edit";

export function NoteViewer({
  note,
  isFullWidth,
  saveStatus,
  onBack,
  onTitleChange,
  onContentChange,
  onTagsChange,
  onDelete,
  onImportMarkdown,
  onToggleFullWidth,
  onToastMessage,
}: {
  note: NoteItem;
  isFullWidth: boolean;
  saveStatus: "idle" | "saving" | "saved";
  onBack: () => void;
  onTitleChange: (val: string) => void;
  onContentChange: (val: string) => void;
  onTagsChange: (tags: string[]) => void;
  onDelete: () => void;
  onImportMarkdown?: () => void;
  onToggleFullWidth: () => void;
  onToastMessage?: (msg: string) => void;
}) {
  const defaultMode: NoteViewMode =
    !note.title && !note.content ? "edit" : "read";
  const [mode, setMode] = useState<NoteViewMode>(defaultMode);
  const [showToc, setShowToc] = useState(false);
  const [tagsInput, setTagsInput] = useState(note.tags.join(", "));
  const [showGuide, setShowGuide] = useState(false);
  const editorRef = useRef<NoteEditorHandles>(null);

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
    const m: NoteViewMode = !note.title && !note.content ? "edit" : "read";
    setMode(m);
    setShowToc(false);
    setExtractedData(null);
  }, [note.id]);

  const handleTagsBlur = () => {
    const parsed = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
    onTagsChange(parsed);
  };

  const handleInsertSyntax = useCallback((syntax: string) => {
    if (mode !== "edit") {
      setMode("edit");
    }
    setTimeout(() => {
      editorRef.current?.insertSyntax(syntax);
    }, 50);
  }, [mode]);

  const toc = extractToc(note.content);

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
      {/* ────── ツールバー ────── */}
      <NoteToolbar
        mode={mode}
        onModeChange={setMode}
        onBack={onBack}
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
      />

      {/* ────── 本文コンテナ（広大なベージュ余白と浮遊するカードシート） ────── */}
      <div
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "center",
          gap: "2rem",
          padding: isFullWidth
            ? "2.5rem clamp(1.5rem, 5vw, 4rem) 8rem"
            : "2.5rem clamp(1rem, 4vw, 3rem) 8rem",
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
            background: "rgba(255, 255, 255, 0.88)",
            backdropFilter: "blur(20px) saturate(180%)",
            WebkitBackdropFilter: "blur(20px) saturate(180%)",
            borderRadius: "24px",
            boxShadow: "0 4px 28px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.02)",
            border: "1px solid rgba(255, 255, 255, 0.8)",
            padding: "3.5rem clamp(1.75rem, 5vw, 4.5rem) 5rem",
            boxSizing: "border-box",
            transition: "all 0.3s ease",
          }}
        >
          {/* タイトル */}
          {mode === "read" ? (
            <h1
              style={{
                fontSize: "2rem",
                fontWeight: 750,
                color: C.charcoal,
                letterSpacing: "-0.03em",
                lineHeight: 1.2,
                margin: "0 0 0.8rem",
              }}
            >
              {note.title || <span style={{ color: C.charcoalXLight, fontWeight: 400 }}>（タイトルなし）</span>}
            </h1>
          ) : (
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
          )}

          {/* メタ行（タグ・更新日） */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.8rem",
              marginBottom: "2.2rem",
              paddingBottom: "1.4rem",
              borderBottom: "1px solid rgba(0,0,0,0.06)",
              flexWrap: "wrap",
            }}
          >
            {mode === "read" ? (
              <>
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
                {note.tags.length === 0 && (
                  <span style={{ fontSize: "0.72rem", color: C.charcoalXLight }}>タグなし</span>
                )}
              </>
            ) : (
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                onBlur={handleTagsBlur}
                placeholder="タグを追加（カンマ区切り）"
                style={{
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  fontSize: "0.78rem",
                  color: C.gold,
                  flex: 1,
                  letterSpacing: "0.04em",
                  minWidth: "160px",
                }}
              />
            )}
            <span style={{ fontSize: "0.7rem", color: C.charcoalXLight, whiteSpace: "nowrap", marginLeft: "auto" }}>
              {formatDateRelative(note.updatedAt)} 更新
            </span>
          </div>

          {/* 本文：閲覧 or 編集 */}
          {mode === "read" ? (
            <MarkdownViewer content={note.content} onContentChange={onContentChange} />
          ) : (
            <NoteEditor
              ref={editorRef}
              content={note.content}
              onChange={onContentChange}
            />
          )}
        </div>

        {/* TOC Sidebar */}
        {showToc && (
          <aside style={{ width: "240px", flexShrink: 0, marginTop: "0.5rem", display: "block" }}>
            <div
              style={{
                position: "sticky",
                top: "7rem",
                background: "rgba(253,252,250,0.75)",
                backdropFilter: "blur(16px)",
                padding: "1rem",
                borderRadius: "16px",
                boxShadow: C.cardShadow,
                maxHeight: "calc(100vh - 10rem)",
                overflowY: "auto",
                border: "1px solid rgba(0, 0, 0, 0.04)",
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
          background: "rgba(253,252,250,0.78)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          pointerEvents: "none",
          zIndex: 40,
          borderTop: "1px solid rgba(0, 0, 0, 0.03)",
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
// ノートカード（ダッシュボード用）
// ─────────────────────────────────────────

function NoteCard({
  note,
  onClick,
  onDelete,
  onDownload,
}: {
  note: NoteItem;
  onClick: () => void;
  onDelete: (e: React.MouseEvent) => void;
  onDownload: (e: React.MouseEvent) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const excerpt = getExcerpt(note.content, 100);
  const wordCount = note.content.trim().length;
  const menuRef = useRef<HTMLDivElement>(null);

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

  return (
    <div
      className="arca-note-card"
      onClick={onClick}
      style={{
        background: C.white,
        borderRadius: "16px",
        padding: "1.5rem 1.5rem 1.25rem",
        boxShadow: C.cardShadow,
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
        minHeight: "170px",
        position: "relative",
        cursor: "pointer",
        border: "1px solid rgba(0, 0, 0, 0.03)",
      }}
    >
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
              background: C.white,
              borderRadius: "10px",
              boxShadow: "0 6px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)",
              padding: "0.35rem",
              minWidth: "140px",
              zIndex: 20,
              animation: "slash-in 0.12s ease",
              border: "1px solid rgba(0, 0, 0, 0.05)",
            }}
          >
            <button
              onClick={(e) => {
                setMenuOpen(false);
                onDownload(e);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                width: "100%",
                textAlign: "left",
                background: "transparent",
                border: "none",
                borderRadius: "7px",
                padding: "0.5rem 0.8rem",
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
              <span>.md 保存</span>
            </button>
            <button
              onClick={(e) => {
                setMenuOpen(false);
                onDelete(e);
              }}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                background: "transparent",
                border: "none",
                borderRadius: "7px",
                padding: "0.5rem 0.8rem",
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
              削除
            </button>
          </div>
        )}
      </div>

      {/* タグ */}
      {note.tags.length > 0 && (
        <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", paddingRight: "2rem" }}>
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
      )}

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
  onClose,
}: {
  deletedNotes: NoteItem[];
  onRestore: (id: string) => void;
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
        style={{
          background: C.white,
          borderRadius: "20px",
          boxShadow: C.toastShadow,
          width: "100%",
          maxWidth: "800px",
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1.5rem 2rem", borderBottom: `1px solid ${C.ivory2}` }}>
          <h2 style={{ fontSize: "1.2rem", fontWeight: 700, margin: 0, color: C.charcoal }}>ごみ箱</h2>
          <button onClick={onClose} aria-label="閉じる" style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: "1.2rem", color: C.charcoalLight }}>✕</button>
        </div>
        <div className="arca-scroll" style={{ padding: "2rem", overflowY: "auto", flex: 1, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "1rem" }}>
          {deletedNotes.length === 0 ? (
            <p style={{ gridColumn: "1 / -1", textAlign: "center", color: C.charcoalXLight, fontSize: "0.9rem", margin: "2rem 0" }}>ごみ箱は空です</p>
          ) : (
            deletedNotes.map((n) => (
              <div key={n.id} style={{ background: C.ivory, borderRadius: "12px", padding: "1.2rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                <h3 style={{ fontSize: "0.95rem", margin: 0, color: C.charcoal, fontWeight: 650, display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{n.title || "（タイトルなし）"}</h3>
                <p style={{ fontSize: "0.75rem", color: C.charcoalMid, margin: 0, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", lineHeight: 1.5 }}>{getExcerpt(n.content, 60)}</p>
                <button onClick={() => onRestore(n.id)} style={{ marginTop: "auto", alignSelf: "flex-start", background: C.white, border: `1px solid ${C.ivory2}`, borderRadius: "6px", padding: "0.4rem 0.8rem", fontSize: "0.75rem", cursor: "pointer", color: C.charcoal, fontWeight: 600, transition: "background 0.15s" }}>復元する</button>
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
  onSelectNote,
  onNewNote,
  onDeleteNote,
  onDownloadNote,
  onTriggerImport,
  onOpenTrash,
}: {
  notes: NoteItem[];
  onSelectNote: (id: string) => void;
  onNewNote: () => void;
  onDeleteNote: (note: NoteItem) => void;
  onDownloadNote: (note: NoteItem) => void;
  onTriggerImport: () => void;
  onOpenTrash: () => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"updatedDesc" | "createdDesc" | "titleAsc">("updatedDesc");

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
        padding: "3.2rem clamp(1.5rem, 5vw, 4rem) 6rem",
      }}
    >
      {/* ── ヘッダー ── */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          marginBottom: "1.5rem",
          maxWidth: "1280px",
          marginInline: "auto",
          flexWrap: "wrap",
          gap: "1rem",
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

        {/* コントロール群 */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          {/* ごみ箱ボタン */}
          <button
            onClick={onOpenTrash}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "transparent",
              border: `1px solid rgba(0,0,0,0.06)`,
              borderRadius: "11px",
              padding: "0.62rem 0.85rem",
              cursor: "pointer",
              color: C.charcoalLight,
              fontSize: "0.82rem",
              fontWeight: 600,
              transition: "background 0.2s, color 0.2s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,0,0,0.02)";
              (e.currentTarget as HTMLButtonElement).style.color = C.charcoalMid;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "transparent";
              (e.currentTarget as HTMLButtonElement).style.color = C.charcoalLight;
            }}
          >
            ごみ箱
          </button>

          {/* .md インポートボタン */}
          <button
            onClick={onTriggerImport}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.35rem",
              background: "rgba(0, 0, 0, 0.04)",
              border: "none",
              borderRadius: "11px",
              padding: "0.62rem 0.95rem",
              cursor: "pointer",
              color: C.charcoalMid,
              fontSize: "0.82rem",
              fontWeight: 600,
              transition: "background 0.15s, color 0.15s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,0,0,0.07)";
              (e.currentTarget as HTMLButtonElement).style.color = C.charcoal;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(0, 0, 0, 0.04)";
              (e.currentTarget as HTMLButtonElement).style.color = C.charcoalMid;
            }}
            title="Markdownファイル (.md / .txt) をインポート"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>インポート</span>
          </button>

          {/* 新規ノートボタン */}
          <button
            onClick={onNewNote}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.45rem",
              background: C.gold,
              border: "none",
              borderRadius: "11px",
              padding: "0.62rem 1.25rem",
              cursor: "pointer",
              color: "#FDFCFA",
              fontSize: "0.82rem",
              fontWeight: 650,
              letterSpacing: "0.03em",
              boxShadow: "0 2px 14px rgba(197,160,89,0.38)",
              transition: "box-shadow 0.2s, transform 0.2s",
            }}
            onMouseEnter={(e) => {
              const b = e.currentTarget as HTMLButtonElement;
              b.style.boxShadow = "0 6px 24px rgba(197,160,89,0.48)";
              b.style.transform = "translateY(-1px)";
            }}
            onMouseLeave={(e) => {
              const b = e.currentTarget as HTMLButtonElement;
              b.style.boxShadow = "0 2px 14px rgba(197,160,89,0.38)";
              b.style.transform = "translateY(0)";
            }}
          >
            <span style={{ fontSize: "1.1rem", lineHeight: 1 }}>＋</span>
            新しいノート
          </button>
        </div>
      </div>

      {/* コントロール（検索・フィルター・ソート） */}
      <div
        style={{
          maxWidth: "1280px",
          marginInline: "auto",
          marginBottom: "2.4rem",
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
        }}
      >
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center" }}>
          {/* 検索 */}
          <div style={{ position: "relative", flex: "1 1 250px", maxWidth: "400px" }}>
            <span
              style={{
                position: "absolute",
                left: "0.8rem",
                top: "50%",
                transform: "translateY(-50%)",
                display: "flex",
                alignItems: "center",
                color: C.charcoalXLight,
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
              style={{
                width: "100%",
                background: C.white,
                border: "none",
                borderRadius: "10px",
                padding: "0.6rem 0.6rem 0.6rem 2.2rem",
                fontSize: "0.85rem",
                color: C.charcoal,
                boxShadow: "0 1px 4px rgba(0,0,0,0.03)",
                outline: "none",
                boxSizing: "border-box",
                transition: "box-shadow 0.15s",
              }}
              onFocus={(e) => (e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)")}
              onBlur={(e) => (e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.03)")}
            />
          </div>

          {/* ソート */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            aria-label="並び順"
            style={{
              appearance: "none",
              background: C.white,
              border: "none",
              borderRadius: "8px",
              padding: "0.6rem 2rem 0.6rem 0.8rem",
              fontSize: "0.8rem",
              color: C.charcoalMid,
              cursor: "pointer",
              boxShadow: "0 1px 4px rgba(0,0,0,0.03)",
              outline: "none",
              backgroundImage:
                "url('data:image/svg+xml;utf8,<svg fill=\"%239A9A96\" height=\"24\" viewBox=\"0 0 24 24\" width=\"24\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M7 10l5 5 5-5z\"/></svg>')",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 0.2rem center",
            }}
          >
            <option value="updatedDesc">更新日が新しい順</option>
            <option value="createdDesc">作成日が新しい順</option>
            <option value="titleAsc">タイトル順 (A-Z)</option>
          </select>
        </div>

        {/* タグフィルター */}
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button
            onClick={() => setSelectedTag("all")}
            style={{
              background: selectedTag === "all" ? C.charcoal : "transparent",
              color: selectedTag === "all" ? C.white : C.charcoalMid,
              border: "none",
              borderRadius: "20px",
              padding: "0.3rem 0.8rem",
              fontSize: "0.75rem",
              fontWeight: 500,
              cursor: "pointer",
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
                padding: "0.25rem 0.8rem",
                fontSize: "0.75rem",
                fontWeight: 500,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* ── グリッド ── */}
      <div
        style={{
          maxWidth: "1280px",
          marginInline: "auto",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))",
          gap: "1.15rem",
        }}
      >
        {filteredNotes.map((note) => (
          <NoteCard
            key={note.id}
            note={note}
            onClick={() => onSelectNote(note.id)}
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
                  fontWeight: 600,
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
        });
      });
      setNotes(fetched);
    });
    return () => unsubscribe();
  }, []);

  const activeNotes = notes.filter((n) => !n.isDeleted);
  const deletedNotes = notes.filter((n) => n.isDeleted);

  // 共通トースト
  const { toast, showUndoToast, showMessageToast, dismissToast, triggerUndo } = useUndoToast<NoteItem>();

  // ノート削除処理（確認後実行）
  const handleExecuteDelete = useCallback(
    async (id: string) => {
      const target = notes.find((n) => n.id === id);
      if (!target) return;

      if (view.type === "viewer" && view.noteId === id) {
        setView({ type: "dashboard" });
      }

      try {
        await updateDoc(doc(db, "notes", id), { isDeleted: true });
      } catch (e) {
        console.error("Delete failed", e);
      }

      showUndoToast({
        message: `ノート「${target.title || "（タイトルなし）"}」を削除しました`,
        item: target,
        onUndo: async (restoredNote) => {
          try {
            await updateDoc(doc(db, "notes", restoredNote.id), { isDeleted: false });
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

  const handleNewNote = useCallback(async () => {
    try {
      const docRef = await addDoc(collection(db, "notes"), {
        title: "",
        content: "",
        tags: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        isDeleted: false,
      });
      setView({ type: "viewer", noteId: docRef.id });
    } catch (e) {
      console.error("Create failed", e);
    }
  }, []);

  const handleSelectNote = useCallback((id: string) => {
    setView({ type: "viewer", noteId: id });
  }, []);

  const handleBack = useCallback(() => {
    setView({ type: "dashboard" });
    onClearSelectedNote?.();
  }, [onClearSelectedNote]);

  const mutateNote = useCallback(
    (id: string, patch: Partial<Omit<NoteItem, "id" | "createdAt" | "updatedAt">>) => {
      setNotes((prev) =>
        prev.map((n) => (n.id === id ? { ...n, ...patch, updatedAt: nowIso() } : n))
      );

      setSaveStatus("saving");
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(async () => {
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
      }, 800);
    },
    []
  );

  const currentId = view.type === "viewer" ? view.noteId : null;

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

      {/* 固定背景（スクロール時見切れ防止） */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: -10,
          background: view.type === "viewer" ? C.bgEditor : C.bgGrad,
          transition: "background 0.3s ease",
        }}
      />

      {view.type === "dashboard" && (
        <NoteDashboard
          key="dashboard"
          notes={activeNotes}
          onSelectNote={handleSelectNote}
          onNewNote={handleNewNote}
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
            isFullWidth={isFullWidth}
            saveStatus={saveStatus}
            onBack={handleBack}
            onTitleChange={(val) => currentId && mutateNote(currentId, { title: val })}
            onContentChange={(val) => currentId && mutateNote(currentId, { content: val })}
            onTagsChange={(tags) => currentId && mutateNote(currentId, { tags })}
            onDelete={() => setNoteToDelete(activeNote)}
            onImportMarkdown={() => fileInputRef.current?.click()}
            onToggleFullWidth={() => setIsFullWidth((v) => !v)}
            onToastMessage={showMessageToast}
          />
        </NoteErrorBoundary>
      )}

      {/* ビューア表示中にノートがなくなった場合はダッシュボードへ */}
      {view.type === "viewer" && !activeNote && (
        <NoteDashboard
          key="dashboard-fallback"
          notes={activeNotes}
          onSelectNote={handleSelectNote}
          onNewNote={handleNewNote}
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
          onClose={() => setShowTrash(false)}
        />
      )}

      {/* 削除確認モーダル */}
      <ConfirmModal
        isOpen={!!noteToDelete}
        title="ノートをごみ箱に移動しますか？"
        message={`「${noteToDelete?.title || "（タイトルなし）"}」をごみ箱に移動します。後から復元することも可能です。`}
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
