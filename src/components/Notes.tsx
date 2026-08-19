/**
 * src/components/Notes.tsx
 * Arca — Notes / Knowledge モジュール (Sprint 4, Step 1 v3)
 *
 * デザイン原則 (Core/Rules.md) 厳守:
 *  - アイボリーベースの繊細なグラデーション背景
 *  - チャコールグレーのテキスト (#3A3A38)
 *  - マットゴールドのアクセント (#C5A059)
 *  - 枠線なし・薄いシャドウ
 *  - 広大な余白、思考を妨げない静寂な空間
 *
 * 画面構成:
 *  ① ダッシュボード — Notionライクなグリッド一覧
 *  ② ノートビューア — デフォルトは「閲覧（Read）」モード。鉛筆アイコンで「編集（Edit）」へ
 *
 * UX:
 *  - 削除時はトースト通知（5秒間 Undo 可能）
 *  - Full Width トグル（閲覧/編集で横幅を共有）
 *  - スラッシュコマンド（/h1, /todo, /bullet 等）
 *
 * Step 2 でFirestore連携を行うため、現時点ではローカルステートで管理。
 */

import {
  useState,
  useCallback,
  useRef,
  useEffect,
  type KeyboardEvent,
  Component,
  type ErrorInfo,
  type ReactNode,
  isValidElement,
} from "react";
import ReactMarkdown from "react-markdown";
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
  const lines = content.split('\n');
  const toc: TocItem[] = [];
  let isCodeBlock = false;
  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      isCodeBlock = !isCodeBlock;
      continue;
    }
    if (isCodeBlock) continue;

    const match = line.match(/^(#{1,3})\s+(.+)$/);
    if (match) {
      const text = match[2].trim().replace(/[*_`]/g, '');
      let safeId = "";
      try {
        safeId = encodeURIComponent(text);
      } catch {
        safeId = text.replace(/[^a-zA-Z0-9]/g, "");
      }
      toc.push({
        id: safeId,
        level: match[1].length,
        text: text
      });
    }
  }
  return toc;
}

function getHeadingText(children: ReactNode): string {
  try {
    if (!children) return '';
    if (typeof children === 'string') return children;
    if (typeof children === 'number') return children.toString();
    if (Array.isArray(children)) return children.map(getHeadingText).join('');
    if (isValidElement<{ children?: ReactNode }>(children)) {
      return getHeadingText(children.props.children);
    }
    return '';
  } catch {
    return '';
  }
}

// ─────────────────────────────────────────
// グローバルスタイル
// ─────────────────────────────────────────

const GLOBAL_STYLES = `
  /* ── Markdown prose ── */
  .arca-prose { color: ${C.charcoal}; font-size: 1.0125rem; font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Segoe UI", sans-serif; }
  .arca-prose h1 {
    font-size: 1.8rem; font-weight: 750; color: ${C.charcoal};
    margin: 0 0 1.4rem; letter-spacing: -0.028em; line-height: 1.2;
  }
  .arca-prose h2 {
    font-size: 1.2rem; font-weight: 650; color: ${C.charcoal};
    margin: 2.4rem 0 0.9rem; letter-spacing: -0.018em; line-height: 1.35;
    padding-bottom: 0.45rem; border-bottom: 1px solid rgba(0,0,0,0.06);
  }
  .arca-prose h3 {
    font-size: 1.0rem; font-weight: 650; color: ${C.charcoalMid};
    margin: 2rem 0 0.65rem; line-height: 1.4;
  }
  .arca-prose p { margin: 0 0 1.25rem; line-height: 1.92; }
  .arca-prose ul, .arca-prose ol {
    margin: 0 0 1.25rem; padding-left: 1.5rem; line-height: 1.92;
  }
  .arca-prose li { margin-bottom: 0.38rem; }
  .arca-prose blockquote {
    border-left: 2.5px solid ${C.gold}; margin: 1.6rem 0;
    padding: 0.75rem 1.4rem; color: ${C.charcoalMid}; font-style: italic;
    background: ${C.goldFaint}; border-radius: 0 10px 10px 0;
  }
  .arca-prose code {
    font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
    font-size: 0.845em; background: ${C.ivory2};
    color: ${C.charcoalMid}; padding: 0.18em 0.46em; border-radius: 5px;
  }
  .arca-prose pre {
    background: ${C.ivory2}; border-radius: 10px;
    padding: 1.1rem 1.45rem; overflow-x: auto; margin: 1.3rem 0 1.7rem;
  }
  .arca-prose pre code {
    background: transparent; padding: 0; font-size: 0.875rem; line-height: 1.75;
  }
  .arca-prose strong { font-weight: 680; color: ${C.charcoal}; }
  .arca-prose em { color: ${C.charcoalMid}; font-style: italic; }
  .arca-prose hr { border: none; border-top: 1px solid rgba(0,0,0,0.07); margin: 2.6rem 0; }
  .arca-prose a {
    color: ${C.gold}; text-decoration: none;
    border-bottom: 1px solid rgba(197,160,89,0.38);
    transition: border-color 0.15s;
  }
  .arca-prose a:hover { border-color: ${C.gold}; }
  .arca-prose input[type="checkbox"] { margin-right: 0.5rem; accent-color: ${C.gold}; }

  /* ── ノートカード ── */
  .arca-note-card { transition: transform 0.22s ease, box-shadow 0.22s ease; }
  .arca-note-card:hover {
    transform: translateY(-3px);
    box-shadow: ${C.cardShadowHover} !important;
  }
  .arca-note-card:active { transform: translateY(-1px); }

  /* ── カードの「…」メニュー ── */
  .arca-card-menu { opacity: 0; transition: opacity 0.15s; }
  .arca-note-card:hover .arca-card-menu { opacity: 1; }

  /* ── エディタ textarea ── */
  .arca-editor-ta {
    font-family: -apple-system, 'SF Pro Text', 'Helvetica Neue', sans-serif;
    caret-color: ${C.gold};
  }
  .arca-editor-ta::placeholder { color: ${C.charcoalXLight}; }

  /* ── スクロールバー ── */
  .arca-scroll::-webkit-scrollbar { width: 4px; height: 4px; }
  .arca-scroll::-webkit-scrollbar-track { background: transparent; }
  .arca-scroll::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 99px; }

  /* ── スラッシュメニュー ── */
  @keyframes slash-in {
    from { opacity:0; transform: translateY(5px) scale(0.96); }
    to   { opacity:1; transform: translateY(0) scale(1); }
  }
  .arca-slash-menu { animation: slash-in 0.14s ease; }

  /* ── 画面遷移 ── */
  @keyframes view-in {
    from { opacity:0; transform: translateY(10px); }
    to   { opacity:1; transform: translateY(0); }
  }
  .arca-view-in { animation: view-in 0.22s ease; }

  /* ── トーストスナックバー ── */
  @keyframes toast-in  { from { opacity:0; transform: translateY(16px) scale(0.96); } to { opacity:1; transform: translateY(0) scale(1); } }
  @keyframes toast-out { from { opacity:1; transform: translateY(0) scale(1); } to { opacity:0; transform: translateY(8px) scale(0.97); } }
  .arca-toast { animation: toast-in 0.22s ease; }
  .arca-toast.leaving { animation: toast-out 0.18s ease forwards; }

  /* ── Full Width トグルアニメーション ── */
  .arca-layout-container { transition: max-width 0.28s ease, padding 0.28s ease; }

  /* ── ツールバー（Apple風レスポンシブ） ── */
  .arca-toolbar {
    position: sticky;
    top: 0;
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
    gap: 0.5rem;
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

  /* ── Cheat Sheet Hide ── */
  @media (max-width: 1200px) {
    .arca-cheatsheet { display: none !important; }
  }

  /* ── Cheat Sheet Hover ── */
  .arca-cs-btn {
    background: transparent; border: none; border-bottom: 1px solid rgba(0,0,0,0.04);
    padding: 0.6rem 0; text-align: left; font-size: 0.72rem; color: ${C.charcoalLight};
    cursor: pointer; display: flex; flex-direction: column; gap: 0.2rem;
    transition: color 0.15s; width: 100%;
  }
  .arca-cs-btn:last-child { border-bottom: none; }
  .arca-cs-btn:hover { color: ${C.charcoal}; }
  .arca-cs-btn:hover .cs-syntax { color: ${C.charcoal}; }
  .cs-syntax { font-weight: 600; color: ${C.charcoalMid}; transition: color 0.15s; }
`;

// ─────────────────────────────────────────
// アイコンコンポーネント
// ─────────────────────────────────────────

const ChevronLeftIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="m15 18-6-6 6-6" />
  </svg>
);

const EyeIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EditIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
    <path d="m15 5 4 4" />
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

// ─────────────────────────────────────────
// スラッシュコマンド定義
// ─────────────────────────────────────────

interface SlashCommand {
  id: string;
  label: string;
  description: string;
  icon: string;
  syntax: string;
}

const SLASH_COMMANDS: SlashCommand[] = [
  { id: "h1",     label: "見出し 1",       description: "大きな見出し",      icon: "H₁",  syntax: "# "       },
  { id: "h2",     label: "見出し 2",       description: "中見出し",           icon: "H₂",  syntax: "## "      },
  { id: "h3",     label: "見出し 3",       description: "小見出し",           icon: "H₃",  syntax: "### "     },
  { id: "bullet", label: "箇条書き",       description: "リスト",             icon: "•",   syntax: "- "       },
  { id: "todo",   label: "チェックリスト", description: "タスク",             icon: "☐",   syntax: "- [ ] "   },
  { id: "quote",  label: "引用",           description: "ブロッククォート",   icon: "❝",   syntax: "> "       },
  { id: "code",   label: "コードブロック", description: "コード",             icon: "</>", syntax: "```\n\n```"},
  { id: "hr",     label: "区切り線",       description: "水平線",             icon: "─",   syntax: "---\n"    },
];

// ─────────────────────────────────────────
// スラッシュコマンドメニュー
// ─────────────────────────────────────────

function SlashMenu({
  query,
  onSelect,
  onDismiss,
  anchorRef,
  lineIndex,
}: {
  query: string;
  onSelect: (cmd: SlashCommand) => void;
  onDismiss: () => void;
  anchorRef: React.RefObject<HTMLTextAreaElement | null>;
  lineIndex: number;
}) {
  const filtered = SLASH_COMMANDS.filter(
    (c) => c.id.startsWith(query.toLowerCase()) || c.label.includes(query)
  );
  const [focusIdx, setFocusIdx] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if (!filtered.length) return;
      if (e.key === "ArrowDown") { e.preventDefault(); setFocusIdx((i) => (i + 1) % filtered.length); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setFocusIdx((i) => (i - 1 + filtered.length) % filtered.length); }
      else if (e.key === "Enter") { e.preventDefault(); onSelect(filtered[focusIdx]); }
      else if (e.key === "Escape") { onDismiss(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [filtered, focusIdx, onSelect, onDismiss]);

  useEffect(() => { setFocusIdx(0); }, [query]);

  const [pos, setPos] = useState({ top: 0, left: 0 });
  useEffect(() => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const lineH = parseFloat(getComputedStyle(el).lineHeight) || 30;
    const pt = parseFloat(getComputedStyle(el).paddingTop) || 0;
    setPos({
      top: rect.top + pt + lineIndex * lineH + lineH,
      left: rect.left + 16,
    });
  }, [anchorRef, lineIndex]);

  if (!filtered.length) return null;

  return (
    <div
      ref={menuRef}
      className="arca-slash-menu"
      style={{
        position: "fixed",
        top: Math.min(pos.top, window.innerHeight - 340),
        left: pos.left,
        zIndex: 600,
        background: C.white,
        borderRadius: "14px",
        boxShadow: "0 8px 48px rgba(0,0,0,0.14), 0 2px 10px rgba(0,0,0,0.06)",
        padding: "0.45rem",
        minWidth: "230px",
        maxHeight: "320px",
        overflowY: "auto",
      }}
    >
      <p style={{ fontSize: "0.63rem", color: C.charcoalXLight, letterSpacing: "0.14em", textTransform: "uppercase", padding: "0.3rem 0.8rem 0.45rem", margin: 0 }}>
        {query ? `/${query} の候補` : "挿入するブロック"}
      </p>
      {filtered.map((cmd, i) => (
        <button
          key={cmd.id}
          onClick={() => onSelect(cmd)}
          onMouseEnter={() => setFocusIdx(i)}
          style={{
            display: "flex", alignItems: "center", gap: "0.7rem",
            width: "100%", textAlign: "left",
            background: i === focusIdx ? C.goldFaint2 : "transparent",
            border: "none", borderRadius: "9px",
            padding: "0.56rem 0.8rem", cursor: "pointer",
            transition: "background 0.1s",
          }}
        >
          <span style={{
            width: "30px", height: "30px",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: i === focusIdx ? C.goldFaint3 : C.ivory2,
            borderRadius: "7px", fontSize: "0.75rem", fontWeight: 700,
            color: i === focusIdx ? C.gold : C.charcoalMid,
            flexShrink: 0, fontFamily: "monospace",
            transition: "background 0.1s, color 0.1s",
          }}>
            {cmd.icon}
          </span>
          <span>
            <span style={{ display: "block", fontSize: "0.83rem", fontWeight: 500, color: i === focusIdx ? C.charcoal : C.charcoalMid, lineHeight: 1.3 }}>
              {cmd.label}
            </span>
            <span style={{ display: "block", fontSize: "0.7rem", color: C.charcoalXLight, lineHeight: 1.3 }}>
              {cmd.description}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────
// Markdownチートシート
// ─────────────────────────────────────────

function MarkdownCheatSheet({ onInsert }: { onInsert: (syntax: string) => void }) {
  const [showLinkPopup, setShowLinkPopup] = useState(false);
  const [linkName, setLinkName] = useState("");
  const [linkUrl, setLinkUrl] = useState("");

  const items = [
    { id: "h1", label: "見出し1", syntax: "# " },
    { id: "h2", label: "見出し2", syntax: "## " },
    { id: "bullet", label: "箇条書き", syntax: "- " },
    { id: "todo", label: "チェックリスト", syntax: "- [ ] " },
    { id: "quote", label: "引用", syntax: "> " },
    { id: "link", label: "リンク", syntax: "[名前](URL)" },
    { id: "code", label: "コード", syntax: "```\n\n```" },
  ];

  return (
    <div
      className="arca-cheatsheet"
      style={{
        position: "fixed", left: "2rem", top: "10rem",
        width: "140px", display: "flex", flexDirection: "column",
        opacity: 0.5, transition: "opacity 0.2s", zIndex: 60,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
      onMouseLeave={(e) => {
        e.currentTarget.style.opacity = "0.5";
        setShowLinkPopup(false);
      }}
    >
      <div style={{ fontSize: "0.7rem", fontWeight: 700, color: C.charcoalMid, letterSpacing: "0.05em", marginBottom: "0.2rem", paddingBottom: "0.4rem", borderBottom: `1px solid ${C.ivory2}` }}>
        Markdown ガイド
      </div>
      {items.map((it) => {
        if (it.id === "link") {
          return (
            <div key="link" style={{ position: "relative" }}>
              <button className="arca-cs-btn" onClick={() => setShowLinkPopup(!showLinkPopup)}>
                <span className="cs-syntax">[名前](URL)</span>
                <span>{it.label}</span>
              </button>
              {showLinkPopup && (
                <div style={{
                  position: "absolute", left: "100%", top: 0,
                  background: C.white, padding: "0.8rem", borderRadius: "8px",
                  boxShadow: C.cardShadowHover, display: "flex", flexDirection: "column",
                  gap: "0.5rem", zIndex: 100, width: "220px", marginLeft: "1rem"
                }}>
                  <input
                    placeholder="表示名" value={linkName} onChange={e => setLinkName(e.target.value)}
                    style={{ fontSize: "0.75rem", padding: "0.4rem", border: `1px solid ${C.ivory2}`, borderRadius: "4px", outline: "none", color: C.charcoal }}
                  />
                  <input
                    placeholder="URL (https://...)" value={linkUrl} onChange={e => setLinkUrl(e.target.value)}
                    style={{ fontSize: "0.75rem", padding: "0.4rem", border: `1px solid ${C.ivory2}`, borderRadius: "4px", outline: "none", color: C.charcoal }}
                  />
                  <button
                    onClick={() => {
                      onInsert(`[${linkName || 'link'}](${linkUrl})`);
                      setShowLinkPopup(false); setLinkName(""); setLinkUrl("");
                    }}
                    style={{ background: C.gold, color: "white", border: "none", borderRadius: "4px", padding: "0.4rem", cursor: "pointer", fontSize: "0.75rem", fontWeight: 600 }}
                  >
                    挿入
                  </button>
                </div>
              )}
            </div>
          );
        }
        return (
          <button key={it.label} className="arca-cs-btn" onClick={() => onInsert(it.syntax)}>
            <span className="cs-syntax">{it.syntax.replace("\n\n", "")}</span>
            <span>{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────
// Markdownプレビュー（読書モード）
// ─────────────────────────────────────────

function MarkdownPreview({ content }: { content: string }) {
  if (!content.trim()) {
    return (
      <p style={{ color: C.charcoalXLight, fontStyle: "italic", lineHeight: 1.9, fontSize: "0.95rem" }}>
        このノートはまだ空です。鉛筆アイコンから編集を開始してください。
      </p>
    );
  }

  // remark-gfm の代わりに正規表現で生のURLを自動リンク化する
  // 既にMarkdownリンクになっているものや画像タグのURLは置換しないようにする簡易ヒューリスティック
  const processedContent = content.replace(
    /(^|[^("\]])(https?:\/\/[a-zA-Z0-9-._~:/?#[\]@!$&'()*+,;=%]+)/g,
    '$1[$2]($2)'
  );

  const renderHeading = (level: number, children: ReactNode) => {
    const text = getHeadingText(children);
    let id = "";
    try {
      id = encodeURIComponent(text.replace(/[*_`]/g, '').trim());
    } catch {
      id = text.replace(/[^a-zA-Z0-9]/g, "");
    }
    const Tag = `h${level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
    return <Tag id={id}>{children}</Tag>;
  };

  return (
    <div className="arca-prose">
      <ReactMarkdown
        components={{
          h1: ({ children }) => renderHeading(1, children),
          h2: ({ children }) => renderHeading(2, children),
          h3: ({ children }) => renderHeading(3, children),
          a: ({ href, children }) => {
            const url = href || "";
            const text = getHeadingText(children);
            if (url === text) {
              let hostname = "";
              try { hostname = new URL(url).hostname; } catch {}
              if (hostname) {
                return (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "flex", alignItems: "center", gap: "0.8rem",
                      padding: "0.8rem 1rem", background: C.white,
                      borderRadius: "10px", boxShadow: C.cardShadow,
                      textDecoration: "none", color: C.charcoal,
                      transition: "transform 0.15s, box-shadow 0.15s",
                      margin: "1.5rem 0",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLAnchorElement).style.transform = "translateY(-2px)";
                      (e.currentTarget as HTMLAnchorElement).style.boxShadow = C.cardShadowHover;
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLAnchorElement).style.transform = "translateY(0)";
                      (e.currentTarget as HTMLAnchorElement).style.boxShadow = C.cardShadow;
                    }}
                  >
                    <img src={`https://www.google.com/s2/favicons?domain=${hostname}&sz=32`} alt="" style={{ width: 24, height: 24, borderRadius: 4 }} />
                    <span style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
                      <span style={{ fontSize: "0.85rem", fontWeight: 600, color: C.charcoal, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {hostname}
                      </span>
                      <span style={{ fontSize: "0.75rem", color: C.charcoalLight, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {url}
                      </span>
                    </span>
                  </a>
                );
              }
            }
            return (
              <a href={url} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            );
          },
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}

// ─────────────────────────────────────────
// ノートビューア（閲覧 ⇄ 編集 全画面）
// ─────────────────────────────────────────

type NoteViewMode = "read" | "edit";

function NoteViewer({
  note,
  isFullWidth,
  saveStatus,
  onBack,
  onTitleChange,
  onContentChange,
  onTagsChange,
  onDelete,
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
  onToggleFullWidth: () => void;
  onToastMessage?: (msg: string) => void;
}) {
  // デフォルトは「閲覧」モード。新規ノート（タイトルと内容が空）は直接編集へ
  const defaultMode: NoteViewMode =
    !note.title && !note.content ? "edit" : "read";
  const [mode, setMode] = useState<NoteViewMode>(defaultMode);
  const [showToc, setShowToc] = useState(false);
  const [tagsInput, setTagsInput] = useState(note.tags.join(", "));
  const [slashActive, setSlashActive] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const [slashLineIdx, setSlashLineIdx] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  // ノート切替時のリセット
  useEffect(() => {
    setTagsInput(note.tags.join(", "));
    const m: NoteViewMode = !note.title && !note.content ? "edit" : "read";
    setMode(m);
    setSlashActive(false);
    setShowToc(false);
    setExtractedData(null);
  }, [note.id]);

  // Textarea 自動伸長
  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, window.innerHeight * 0.65)}px`;
  }, []);

  useEffect(() => {
    if (mode === "edit") {
      setTimeout(autoResize, 0);
      textareaRef.current?.focus();
    }
  }, [mode, autoResize]);

  const handleTagsBlur = () => {
    const parsed = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
    onTagsChange(parsed);
  };

  // スラッシュコマンド検出
  const detectSlash = useCallback((text: string, cursorPos: number) => {
    const before = text.slice(0, cursorPos);
    const lines = before.split("\n");
    const cur = lines[lines.length - 1];
    const match = cur.match(/^\/(\w*)$/);
    if (match) {
      setSlashActive(true);
      setSlashQuery(match[1]);
      setSlashLineIdx(lines.length - 1);
    } else {
      setSlashActive(false);
      setSlashQuery("");
    }
  }, []);

  const handleContentChange = (val: string) => {
    onContentChange(val);
    autoResize();
    const pos = textareaRef.current?.selectionStart ?? 0;
    detectSlash(val, pos);
  };

  const handleKeyUp = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape" && slashActive) { setSlashActive(false); return; }
    const el = textareaRef.current;
    if (el) detectSlash(el.value, el.selectionStart);
  };

  const handleSlashSelect = useCallback(
    (cmd: SlashCommand) => {
      const el = textareaRef.current;
      if (!el) return;
      const pos = el.selectionStart;
      const text = el.value;
      const textBefore = text.slice(0, pos);
      const lineStart = textBefore.lastIndexOf("\n") + 1;
      const lineContent = textBefore.slice(lineStart);
      const isSlashLine = /^\/\w*$/.test(lineContent);
      let newText: string;
      let newCursor: number;
      if (isSlashLine) {
        const before = text.slice(0, lineStart);
        const after = text.slice(pos);
        if (cmd.syntax.includes("\n")) {
          const parts = cmd.syntax.split("\n");
          newText = before + cmd.syntax + after;
          newCursor = before.length + parts[0].length + 1;
        } else {
          newText = before + cmd.syntax + after;
          newCursor = before.length + cmd.syntax.length;
        }
      } else {
        newText = text.slice(0, pos) + cmd.syntax + text.slice(pos);
        newCursor = pos + cmd.syntax.length;
      }
      onContentChange(newText);
      setSlashActive(false);
      setSlashQuery("");
      requestAnimationFrame(() => {
        if (!textareaRef.current) return;
        textareaRef.current.value = newText;
        textareaRef.current.selectionStart = newCursor;
        textareaRef.current.selectionEnd = newCursor;
        textareaRef.current.focus();
        autoResize();
      });
    },
    [onContentChange, autoResize]
  );

  const handleInsertSyntax = useCallback((syntax: string) => {
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    const success = document.execCommand("insertText", false, syntax);
    if (success) {
      // execCommandによってDOMは更新されるがReactのstateが同期されない場合があるため強制同期
      onContentChange(el.value);
      autoResize();
      detectSlash(el.value, el.selectionStart);
    } else {
      // Fallback if execCommand is not supported
      const start = el.selectionStart;
      const val = el.value;
      const newVal = val.slice(0, start) + syntax + val.slice(el.selectionEnd);
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
      setter?.call(el, newVal);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }, [onContentChange, autoResize, detectSlash]);

  // ── レイアウト定数（閲覧・編集で完全共有） ──
  const maxW = isFullWidth ? "none" : "900px";
  const px = isFullWidth ? "clamp(4rem, 10vw, 12rem)" : "clamp(1.5rem, 6vw, 5rem)";
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
      <header className="arca-toolbar">
        {/* 左側: 戻る */}
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

        {/* 右側: コントロール群 */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexShrink: 0 }}>
          
          {/* 表示モードセグメントコントロール */}
          <div className="arca-segment-control">
            <button
              onClick={() => setMode("read")}
              className={`arca-segment-btn ${mode === "read" ? "active" : ""}`}
              title="閲覧モード"
            >
              <EyeIcon />
              <span>閲覧</span>
            </button>
            <button
              onClick={() => setMode("edit")}
              className={`arca-segment-btn ${mode === "edit" ? "active" : ""}`}
              title="編集モード"
            >
              <EditIcon />
              <span>編集</span>
            </button>
          </div>

          <div className="arca-tb-divider" />

          {/* ✦ Aether 抽出ボタン */}
          <button
            onClick={handleExtract}
            disabled={isExtracting || !note.content.trim()}
            className="arca-tb-btn"
            title="ノートから買い物リスト・タスクを抽出"
            style={{
              color: C.goldDark,
              background: C.goldFaint,
              fontWeight: 600,
              cursor: isExtracting || !note.content.trim() ? "default" : "pointer",
              opacity: !note.content.trim() ? 0.5 : 1,
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
            onClick={() => setShowToc((s) => !s)}
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

      {/* ────── 本文コンテナ（閲覧・編集で同一の maxW / padding を共有） ────── */}
      <div style={{
          width: "100%", display: "flex", justifyContent: "center", gap: "2rem",
          padding: isFullWidth ? `3rem ${px} 6rem` : `3rem clamp(1rem, 3vw, 2rem) 6rem`, 
          boxSizing: "border-box"
      }}>
        <div
          className="arca-layout-container"
          style={{
            width: "100%",
            maxWidth: maxW,
            flex: 1,
            minWidth: 0, // prevents flex item from overflowing
            background: isFullWidth ? "transparent" : C.white,
            borderRadius: isFullWidth ? "0" : "18px",
            boxShadow: isFullWidth ? "none" : C.cardShadow,
            padding: isFullWidth ? "0" : "4rem clamp(2rem, 5vw, 5rem)",
            boxSizing: "border-box",
            transition: "background 0.3s, box-shadow 0.3s, max-width 0.3s, padding 0.3s",
          }}
        >
          {/* タイトル */}
        {mode === "read" ? (
          <h1
            style={{
              fontSize: "2rem", fontWeight: 750, color: C.charcoal,
              letterSpacing: "-0.03em", lineHeight: 1.2,
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
              display: "block", width: "100%",
              background: "transparent", border: "none", outline: "none",
              fontSize: "2rem", fontWeight: 750, color: C.charcoal,
              letterSpacing: "-0.03em", lineHeight: 1.2,
              marginBottom: "0.8rem", boxSizing: "border-box",
            }}
          />
        )}

        {/* メタ行（タグ・更新日） */}
        <div
          style={{
            display: "flex", alignItems: "center", gap: "0.8rem",
            marginBottom: "2.2rem", paddingBottom: "1.4rem",
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
                    fontSize: "0.7rem", color: C.gold,
                    background: C.goldFaint, borderRadius: "6px",
                    padding: "0.15rem 0.55rem", letterSpacing: "0.05em", fontWeight: 500,
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
                background: "transparent", border: "none", outline: "none",
                fontSize: "0.78rem", color: C.gold, flex: 1,
                letterSpacing: "0.04em", minWidth: "160px",
              }}
            />
          )}
          <span style={{ fontSize: "0.7rem", color: C.charcoalXLight, whiteSpace: "nowrap", marginLeft: "auto" }}>
            {formatDateRelative(note.updatedAt)} 更新
          </span>
        </div>

        {/* 本文：閲覧 or 編集 */}
        {mode === "read" ? (
          <MarkdownPreview content={note.content} />
        ) : (
          <div style={{ position: "relative" }}>
            <MarkdownCheatSheet onInsert={handleInsertSyntax} />
            <textarea
              ref={textareaRef}
              className="arca-editor-ta arca-scroll"
              value={note.content}
              onChange={(e) => handleContentChange(e.target.value)}
              onKeyUp={handleKeyUp}
              onClick={() => {
                const el = textareaRef.current;
                if (el) detectSlash(el.value, el.selectionStart);
              }}
              placeholder={`Markdownで書き始める…\n\n行頭で / と入力するとブロックメニューが開きます`}
              style={{
                display: "block", width: "100%",
                minHeight: "65vh",
                background: "transparent", border: "none", outline: "none",
                resize: "none", fontSize: "1rem", lineHeight: 1.92,
                color: C.charcoal, letterSpacing: "0.005em",
                padding: 0, boxSizing: "border-box", overflowY: "hidden",
              }}
            />
            {slashActive && (
              <SlashMenu
                query={slashQuery}
                onSelect={handleSlashSelect}
                onDismiss={() => setSlashActive(false)}
                anchorRef={textareaRef}
                lineIndex={slashLineIdx}
              />
            )}
          </div>
        )}
        </div>

        {/* TOC Sidebar */}
        {showToc && (
          <aside style={{ width: "240px", flexShrink: 0, marginTop: "0.5rem", display: "block" }}>
            <div style={{
              position: "sticky", top: "7rem",
              background: "rgba(253,252,250,0.4)",
              backdropFilter: "blur(10px)",
              padding: "1rem", borderRadius: "12px",
              boxShadow: C.cardShadow,
              maxHeight: "calc(100vh - 10rem)",
              overflowY: "auto",
            }} className="arca-scroll">
              <h4 style={{ fontSize: "0.75rem", fontWeight: 700, color: C.charcoalMid, margin: "0 0 1rem", letterSpacing: "0.05em" }}>
                目次
              </h4>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {toc.length === 0 ? (
                  <li style={{ fontSize: "0.75rem", color: C.charcoalXLight }}>見出しがありません</li>
                ) : (
                  toc.map(t => (
                    <li key={t.id} style={{ paddingLeft: `${(t.level - 1) * 0.8}rem` }}>
                      <a
                        href={`#${t.id}`}
                        onClick={(e) => {
                          e.preventDefault();
                          const el = document.getElementById(t.id);
                          if (el) {
                            const headerOffset = 80; // approximate toolbar height
                            const elementPosition = el.getBoundingClientRect().top;
                            const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
                            window.scrollTo({ top: offsetPosition, behavior: "smooth" });
                          }
                        }}
                        style={{
                          fontSize: "0.8rem", color: C.charcoalLight, textDecoration: "none",
                          display: "block", lineHeight: 1.4, transition: "color 0.15s",
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = C.gold; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = C.charcoalLight; }}
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
          position: "fixed", bottom: 0, left: 0, right: 0,
          padding: "0.45rem 2rem", textAlign: "right",
          background: "rgba(253,252,250,0.65)",
          backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
          pointerEvents: "none", zIndex: 40,
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", fontSize: "0.66rem", color: saveStatus === "saving" ? C.charcoalXLight : C.goldDark, letterSpacing: "0.04em", marginRight: "1rem" }}>
          {saveStatus === "saving" && "保存中..."}
          {saveStatus === "saved" && <>
            <span style={{ display: "inline-block", width: "5px", height: "5px", borderRadius: "50%", background: C.gold }} />
            保存済み
          </>}
        </span>
        <span style={{ fontSize: "0.66rem", color: C.charcoalXLight, letterSpacing: "0.04em" }}>
          {note.content.length.toLocaleString()} 文字
        </span>
      </footer>

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
}: {
  note: NoteItem;
  onClick: () => void;
  onDelete: (e: React.MouseEvent) => void;
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
        borderRadius: "15px",
        padding: "1.5rem 1.5rem 1.25rem",
        boxShadow: C.cardShadow,
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
        minHeight: "170px",
        position: "relative",
        cursor: "pointer",
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
          onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o); }}
          style={{
            background: menuOpen ? C.goldFaint2 : "rgba(0,0,0,0.04)",
            border: "none", borderRadius: "8px",
            width: "28px", height: "28px",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", color: C.charcoalLight,
            fontSize: "0.9rem", lineHeight: 1,
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = C.goldFaint2; }}
          onMouseLeave={(e) => {
            if (!menuOpen) (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,0,0,0.04)";
          }}
        >
          ···
        </button>
        {menuOpen && (
          <div
            style={{
              position: "absolute", top: "calc(100% + 4px)", right: 0,
              background: C.white,
              borderRadius: "10px",
              boxShadow: "0 6px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)",
              padding: "0.35rem",
              minWidth: "130px", zIndex: 20,
              animation: "slash-in 0.12s ease",
            }}
          >
            <button
              onClick={(e) => { setMenuOpen(false); onDelete(e); }}
              style={{
                display: "block", width: "100%", textAlign: "left",
                background: "transparent", border: "none",
                borderRadius: "7px", padding: "0.5rem 0.8rem",
                cursor: "pointer", fontSize: "0.8rem",
                color: "#c0614a", transition: "background 0.12s",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(192,97,74,0.07)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
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
                fontSize: "0.62rem", color: C.gold,
                background: C.goldFaint, borderRadius: "5px",
                padding: "0.12rem 0.5rem", letterSpacing: "0.04em", fontWeight: 500,
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
          fontSize: "0.95rem", fontWeight: 650, color: C.charcoal,
          margin: 0, lineHeight: 1.38, letterSpacing: "-0.012em",
          display: "-webkit-box", WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical", overflow: "hidden",
        }}
      >
        {note.title || "（タイトルなし）"}
      </h3>

      {/* 抜粋 */}
      <p
        style={{
          fontSize: "0.79rem", color: C.charcoalLight, margin: 0,
          lineHeight: 1.62, flex: 1,
          display: "-webkit-box", WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical", overflow: "hidden",
        }}
      >
        {excerpt || "まだ内容がありません"}
      </p>

      {/* フッター */}
      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginTop: "0.3rem", paddingTop: "0.65rem",
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
  onClose
}: {
  deletedNotes: NoteItem[];
  onRestore: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 2000,
      background: "rgba(253,252,250,0.5)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "2rem"
    }}>
      <div style={{
        background: C.white, borderRadius: "20px", boxShadow: C.toastShadow,
        width: "100%", maxWidth: "800px", maxHeight: "80vh",
        display: "flex", flexDirection: "column", overflow: "hidden"
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1.5rem 2rem", borderBottom: `1px solid ${C.ivory2}` }}>
          <h2 style={{ fontSize: "1.2rem", fontWeight: 700, margin: 0, color: C.charcoal }}>ごみ箱</h2>
          <button onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: "1.2rem", color: C.charcoalLight }}>✕</button>
        </div>
        <div className="arca-scroll" style={{ padding: "2rem", overflowY: "auto", flex: 1, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "1rem" }}>
          {deletedNotes.length === 0 ? (
            <p style={{ gridColumn: "1 / -1", textAlign: "center", color: C.charcoalXLight, fontSize: "0.9rem", margin: "2rem 0" }}>ごみ箱は空です</p>
          ) : (
            deletedNotes.map(n => (
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
  onOpenTrash,
}: {
  notes: NoteItem[];
  onSelectNote: (id: string) => void;
  onNewNote: () => void;
  onDeleteNote: (id: string) => void;
  onOpenTrash: () => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"updatedDesc" | "createdDesc" | "titleAsc">("updatedDesc");

  const allTags = Array.from(new Set(notes.flatMap(n => n.tags))).sort();

  const filteredNotes = notes
    .filter(n => selectedTag === "all" || n.tags.includes(selectedTag))
    .filter(n => {
       if (!searchQuery) return true;
       const q = searchQuery.toLowerCase();
       return (n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q));
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
          <p style={{
            fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.22em",
            textTransform: "uppercase", color: C.charcoalXLight, margin: "0 0 0.4rem",
          }}>
            Notes & Knowledge
          </p>
          <h1 style={{
            fontSize: "1.75rem", fontWeight: 750, color: C.charcoal,
            margin: 0, letterSpacing: "-0.025em", lineHeight: 1.2,
          }}>
            すべてのノート
          </h1>
          <p style={{ fontSize: "0.78rem", color: C.charcoalLight, margin: "0.35rem 0 0" }}>
            {filteredNotes.length}件
          </p>
        </div>

        {/* コントロール群（一箇所に統一） */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.8rem" }}>
          {/* ごみ箱ボタン */}
          <button
            onClick={onOpenTrash}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "transparent", border: `1px solid rgba(0,0,0,0.06)`, borderRadius: "11px",
              padding: "0.68rem 0.9rem", cursor: "pointer",
              color: C.charcoalLight, fontSize: "0.85rem", fontWeight: 600,
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

          {/* 新規ノートボタン */}
          <button
            onClick={onNewNote}
            style={{
              display: "flex", alignItems: "center", gap: "0.45rem",
              background: C.gold, border: "none", borderRadius: "11px",
              padding: "0.68rem 1.35rem", cursor: "pointer",
              color: "#FDFCFA", fontSize: "0.82rem", fontWeight: 650,
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
      <div style={{
        maxWidth: "1280px", marginInline: "auto", marginBottom: "2.4rem",
        display: "flex", flexDirection: "column", gap: "1rem"
      }}>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center" }}>
          {/* 検索 */}
          <div style={{ position: "relative", flex: "1 1 250px", maxWidth: "400px" }}>
            <span style={{ position: "absolute", left: "0.8rem", top: "50%", transform: "translateY(-50%)", display: "flex", alignItems: "center", color: C.charcoalXLight }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </span>
            <input
              type="text"
              placeholder="ノートを検索..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: "100%", background: C.white, border: "none",
                borderRadius: "10px", padding: "0.6rem 0.6rem 0.6rem 2.2rem",
                fontSize: "0.85rem", color: C.charcoal, boxShadow: "0 1px 4px rgba(0,0,0,0.03)",
                outline: "none", boxSizing: "border-box", transition: "box-shadow 0.15s"
              }}
              onFocus={(e) => e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)"}
              onBlur={(e) => e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.03)"}
            />
          </div>

          {/* ソート */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            style={{
              appearance: "none", background: C.white, border: "none",
              borderRadius: "8px", padding: "0.6rem 2rem 0.6rem 0.8rem",
              fontSize: "0.8rem", color: C.charcoalMid, cursor: "pointer",
              boxShadow: "0 1px 4px rgba(0,0,0,0.03)", outline: "none",
              backgroundImage: "url('data:image/svg+xml;utf8,<svg fill=\"%239A9A96\" height=\"24\" viewBox=\"0 0 24 24\" width=\"24\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M7 10l5 5 5-5z\"/></svg>')",
              backgroundRepeat: "no-repeat", backgroundPosition: "right 0.2rem center",
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
              border: "none", borderRadius: "20px", padding: "0.3rem 0.8rem",
              fontSize: "0.75rem", fontWeight: 500, cursor: "pointer",
              transition: "all 0.15s"
            }}
          >
            すべて
          </button>
          {allTags.map(tag => (
            <button
              key={tag}
              onClick={() => setSelectedTag(tag)}
              style={{
                background: selectedTag === tag ? C.gold : "transparent",
                color: selectedTag === tag ? C.white : C.goldDark,
                border: selectedTag === tag ? "1px solid transparent" : `1px solid ${C.goldFaint3}`,
                borderRadius: "20px", padding: "0.25rem 0.8rem",
                fontSize: "0.75rem", fontWeight: 500, cursor: "pointer",
                transition: "all 0.15s"
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
            onDelete={(e) => { e.stopPropagation(); onDeleteNote(note.id); }}
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
            <button
              onClick={onNewNote}
              style={{
                background: C.goldFaint2, border: "none", borderRadius: "9px",
                padding: "0.6rem 1.4rem", color: C.gold, fontSize: "0.85rem",
                cursor: "pointer", fontWeight: 600, marginTop: "0.4rem",
              }}
            >
              最初のノートを作成する
            </button>
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
            このノートのデータに問題があるか、描画処理に失敗したため、画面が真っ白になるのを防ぎました。<br/>
            お手数ですが、以下のエラーメッセージをAIアシスタントにお伝えください。
          </p>
          <pre style={{ background: C.white, padding: "1.5rem", borderRadius: "12px", border: `1px solid ${C.ivory2}`, overflowX: "auto", fontSize: "0.85rem", color: C.charcoalMid, whiteSpace: "pre-wrap" }}>
            {this.state.error.toString()}{"\n"}
            {this.state.error.stack}
          </pre>
          <button onClick={() => window.location.reload()} style={{ marginTop: "2rem", padding: "0.8rem 1.5rem", background: C.gold, color: C.white, border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: 600 }}>
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

export default function Notes() {
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [view, setView] = useState<View>({ type: "dashboard" });
  const [isFullWidth, setIsFullWidth] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [showTrash, setShowTrash] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const activeNotes = notes.filter(n => !n.isDeleted);
  const deletedNotes = notes.filter(n => n.isDeleted);

  // 共通トースト
  const { toast, showUndoToast, showMessageToast, dismissToast, triggerUndo } = useUndoToast<NoteItem>();

  // ノート削除（Undo対応）
  const handleDeleteNote = useCallback(
    async (id: string) => {
      const target = notes.find((n) => n.id === id);
      if (!target) return;

      // ビューアから削除の場合はダッシュボードに戻る
      if (view.type === "viewer" && view.noteId === id) {
        setView({ type: "dashboard" });
      }

      // Firestore 論理削除
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

      {/* 固定背景（スクロール時見切れ防止） */}
      <div style={{
        position: "fixed",
        inset: 0,
        zIndex: -10,
        background: view.type === "viewer" ? C.bgEditor : C.bgGrad,
        transition: "background 0.3s ease"
      }} />

      {view.type === "dashboard" && (
        <NoteDashboard
          key="dashboard"
          notes={activeNotes}
          onSelectNote={handleSelectNote}
          onNewNote={handleNewNote}
          onDeleteNote={handleDeleteNote}
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
            onBack={() => setView({ type: "dashboard" })}
            onTitleChange={(val) => currentId && mutateNote(currentId, { title: val })}
            onContentChange={(val) => currentId && mutateNote(currentId, { content: val })}
            onTagsChange={(tags) => currentId && mutateNote(currentId, { tags })}
            onDelete={() => currentId && handleDeleteNote(currentId)}
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
          onDeleteNote={handleDeleteNote}
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

      {/* 共通削除トースト */}
      <UndoToast toast={toast} onUndo={triggerUndo} onDismiss={dismissToast} />
    </>
  );
}
