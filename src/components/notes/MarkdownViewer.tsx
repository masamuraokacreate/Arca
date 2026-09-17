/**
 * src/components/notes/MarkdownViewer.tsx
 * Arca — フルMarkdown レンダラーコンポーネント (Apple HIG × Arca デザインシステム準拠)
 *
 * 特徴:
 * 1. remark-gfm 完全統合（テーブル、タスクリスト、取り消し線、自動リンク）
 * 2. 箇条書き（ul / ol / li）のビュレット・番号の完全保持・階層対応
 * 3. クリーンなApple風テーブルレンダリング
 * 4. コードブロックのワンクリックコピー機能 & シンタックスフォント
 * 5. タスクリスト（- [ ] / - [x]）のインタラクティブ・トグル対応
 * 6. 外部リンクのスマートURLカード表示
 */

import { useState, useCallback, useMemo, type ReactNode, isValidElement } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { FileText, ChevronRight } from "lucide-react";
import { C } from "../../lib/designSystem";
import type { NoteItem } from "../../types";

export interface MarkdownViewerProps {
  content: string;
  attachments?: Record<string, string>;
  onContentChange?: (newContent: string) => void;
  onSelectNote?: (noteId: string) => void;
  allNotes?: NoteItem[];
}

// ─────────────────────────────────────────
// ユーティリティ
// ─────────────────────────────────────────

function getHeadingText(children: ReactNode): string {
  try {
    if (!children) return "";
    if (typeof children === "string") return children;
    if (typeof children === "number") return children.toString();
    if (Array.isArray(children)) return children.map(getHeadingText).join("");
    if (isValidElement<{ children?: ReactNode }>(children)) {
      return getHeadingText(children.props.children);
    }
    return "";
  } catch {
    return "";
  }
}

// ─────────────────────────────────────────
// コードブロック（コピー機能付き）
// ─────────────────────────────────────────

function CodeBlock({ children, className }: { children?: ReactNode; className?: string }) {
  const [copied, setCopied] = useState(false);
  const codeString = String(children || "").replace(/\n$/, "");
  const match = /language-(\w+)/.exec(className || "");
  const language = match ? match[1] : "";

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(codeString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [codeString]);

  return (
    <div
      style={{
        position: "relative",
        margin: "1.4rem 0 1.8rem",
        borderRadius: "12px",
        overflow: "hidden",
        background: "#242426",
        boxShadow: "0 4px 16px rgba(0, 0, 0, 0.12)",
      }}
    >
      {/* コードブロックヘッダー（言語表示 & コピーボタン） */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.45rem 1rem",
          background: "rgba(255, 255, 255, 0.05)",
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
        }}
      >
        <span
          style={{
            fontSize: "0.68rem",
            color: "rgba(255, 255, 255, 0.45)",
            fontFamily: "SF Mono, Menlo, monospace",
            textTransform: "lowercase",
            letterSpacing: "0.05em",
          }}
        >
          {language || "code"}
        </span>

        <button
          onClick={handleCopy}
          aria-label={copied ? "コピーしました" : "コードをコピー"}
          style={{
            background: copied ? "rgba(197, 160, 89, 0.25)" : "rgba(255, 255, 255, 0.08)",
            color: copied ? "#F5D485" : "rgba(255, 255, 255, 0.75)",
            border: "none",
            borderRadius: "6px",
            padding: "0.22rem 0.55rem",
            fontSize: "0.68rem",
            fontWeight: 500,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.3rem",
            transition: "all 0.15s ease",
          }}
        >
          {copied ? (
            <>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>コピー完了</span>
            </>
          ) : (
            <>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              <span>コピー</span>
            </>
          )}
        </button>
      </div>

      {/* コード本体 */}
      <pre
        style={{
          margin: 0,
          padding: "1rem 1.25rem",
          overflowX: "auto",
          fontFamily: "SF Mono, Menlo, Monaco, Consolas, monospace",
          fontSize: "0.86rem",
          lineHeight: 1.7,
          color: "#EDE8DF",
        }}
      >
        <code>{codeString}</code>
      </pre>
    </div>
  );
}

// ─────────────────────────────────────────
// 画像要素（Small / Medium / Full 切り替え & Lightbox）
// ─────────────────────────────────────────

type ImageSize = "small" | "medium" | "full";

function NoteImage({
  src,
  alt,
  content,
  attachments,
  onContentChange,
}: {
  src?: string;
  alt?: string;
  content?: string;
  attachments?: Record<string, string>;
  onContentChange?: (newContent: string) => void;
}) {
  const [lightboxOpen, setLightboxOpen] = useState(false);

  // alt からタイトルとサイズ（width=50% または small / medium / full）を抽出
  const rawAlt = alt || "";
  let initialSize: ImageSize = "medium";
  let cleanAlt = rawAlt;
  let customWidth: string | null = null;

  const widthMatch = rawAlt.match(/\|width=([0-9]+%)/);
  if (widthMatch) {
    customWidth = widthMatch[1];
    cleanAlt = rawAlt.replace(/\|width=[0-9]+%/, "").trim();
  } else if (rawAlt.includes("|")) {
    const parts = rawAlt.split("|");
    cleanAlt = parts[0].trim();
    const sizeCandidate = parts[1].trim().toLowerCase();
    if (sizeCandidate === "small" || sizeCandidate === "full" || sizeCandidate === "medium") {
      initialSize = sizeCandidate as ImageSize;
    }
  }

  const [currentSize, setCurrentSize] = useState<ImageSize>(initialSize);

  const handleSizeChange = (newSize: ImageSize) => {
    setCurrentSize(newSize);
    if (onContentChange && content && src) {
      // 本文内の該当 Markdown 画像記法を更新
      const targetAltPart = cleanAlt ? cleanAlt : "";
      const regex = new RegExp(`!\\[${escapeRegex(cleanAlt)}(?:\\|[^\\]]*)?\\]\\(${escapeRegex(src)}\\)`, "g");
      const newMarkdown = `![${targetAltPart}|${newSize}](${src})`;
      const updated = content.replace(regex, newMarkdown);
      if (updated !== content) {
        onContentChange(updated);
      }
    }
  };

  if (!src) return null;

  // attachment:img_id の解決
  let resolvedSrc = src;
  if (src.startsWith("attachment:")) {
    const attachmentId = src.replace(/^attachment:/, "");
    if (attachments && attachments[attachmentId]) {
      resolvedSrc = attachments[attachmentId];
    }
  }

  const widthPercent = customWidth ? parseInt(customWidth.replace("%", ""), 10) : null;
  const isInlineLayout = widthPercent !== null && widthPercent < 95;

  // 標準幅表示（max-w-4xl、本文実幅約800px）を基準とした固定最大幅
  // 全画面表示に切り替えても画像が巨大化せず、標準幅表示時と完全に同一のサイズを維持
  const standardBaseWidth = 800;
  const computedMaxWidth = widthPercent
    ? Math.round((standardBaseWidth * widthPercent) / 100)
    : 800;

  const sizeStyles: React.CSSProperties = customWidth
    ? {
        width: `${widthPercent}%`,
        maxWidth: `min(100%, ${computedMaxWidth}px)`,
        display: isInlineLayout ? "inline-flex" : "flex",
        margin: isInlineLayout ? "0.6rem 0.4%" : "1.6rem auto",
        verticalAlign: "top",
      }
    : {
        ...{
          small: { maxWidth: "260px", margin: "1.2rem auto", display: "flex" as const },
          medium: { maxWidth: "620px", margin: "1.6rem auto", display: "flex" as const },
          full: { maxWidth: "min(100%, 800px)", width: "100%", margin: "1.8rem auto", display: "flex" as const },
        }[currentSize],
      };

  return (
    <figure
      style={{
        ...sizeStyles,
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        boxSizing: "border-box",
      }}
      className="arca-image-container group"
    >
      <div
        style={{
          position: "relative",
          borderRadius: "16px",
          overflow: "hidden",
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.07), 0 1px 4px rgba(0, 0, 0, 0.04)",
          background: C.ivory2,
          width: "100%",
          cursor: "zoom-in",
          transition: "transform 0.18s ease, box-shadow 0.18s ease",
        }}
        onClick={() => setLightboxOpen(true)}
      >
        <img
          src={resolvedSrc}
          alt={cleanAlt}
          loading="lazy"
          style={{
            display: "block",
            width: "100%",
            height: "auto",
            objectFit: "contain",
          }}
        />
      </div>

      {/* キャプション & サイズ切り替えツールバー */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          padding: "0.45rem 0.2rem 0",
          gap: "0.6rem",
          flexWrap: "wrap",
        }}
      >
        {cleanAlt ? (
          <figcaption
            style={{
              fontSize: "0.76rem",
              color: C.charcoalLight,
              textAlign: "left",
              fontStyle: "italic",
            }}
          >
            {cleanAlt}
          </figcaption>
        ) : (
          <div />
        )}

        {/* サイズ切り替えピル */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            background: "rgba(0,0,0,0.04)",
            borderRadius: "8px",
            padding: "2px",
            gap: "2px",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {(["small", "medium", "full"] as ImageSize[]).map((size) => {
            const labels = { small: "小", medium: "中", full: "大" };
            const isActive = currentSize === size;
            return (
              <button
                key={size}
                type="button"
                onClick={() => handleSizeChange(size)}
                style={{
                  border: "none",
                  borderRadius: "6px",
                  padding: "0.15rem 0.45rem",
                  fontSize: "0.68rem",
                  fontWeight: isActive ? 650 : 500,
                  color: isActive ? C.charcoal : C.charcoalLight,
                  background: isActive ? C.white : "transparent",
                  boxShadow: isActive ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                  cursor: "pointer",
                  transition: "all 0.12s",
                }}
              >
                {labels[size]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Lightbox 全画面モーダル */}
      {lightboxOpen && (
        <div
          role="dialog"
          aria-label="画像拡大プレビュー"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.82)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1.5rem",
            cursor: "zoom-out",
          }}
          onClick={() => setLightboxOpen(false)}
        >
          <button
            type="button"
            aria-label="閉じる"
            onClick={(e) => {
              e.stopPropagation();
              setLightboxOpen(false);
            }}
            style={{
              position: "absolute",
              top: "1.5rem",
              right: "1.5rem",
              background: "rgba(255, 255, 255, 0.15)",
              border: "none",
              borderRadius: "50%",
              width: "36px",
              height: "36px",
              color: "#fff",
              fontSize: "1.1rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backdropFilter: "blur(4px)",
            }}
          >
            ✕
          </button>
          <img
            src={src}
            alt={cleanAlt}
            style={{
              maxWidth: "92vw",
              maxHeight: "90vh",
              borderRadius: "12px",
              boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
              objectFit: "contain",
            }}
          />
        </div>
      )}
    </figure>
  );
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface ContentSection {
  type: "markdown" | "toggle";
  content: string;
  title?: string;
  isOpen?: boolean;
}

function parseToggleSections(rawText: string): ContentSection[] {
  const sections: ContentSection[] = [];
  const regex = /<details(\s+open)?><summary>(.*?)<\/summary>([\s\S]*?)<\/details>/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(rawText)) !== null) {
    if (match.index > lastIndex) {
      sections.push({
        type: "markdown",
        content: rawText.slice(lastIndex, match.index),
      });
    }
    const isOpen = Boolean(match[1]);
    const title = match[2]?.trim() || "トグル";
    const innerContent = match[3] || "";
    sections.push({
      type: "toggle",
      content: innerContent,
      title,
      isOpen,
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < rawText.length) {
    sections.push({
      type: "markdown",
      content: rawText.slice(lastIndex),
    });
  }

  return sections;
}

function ToggleViewer({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="my-3 rounded-2xl border border-stone-200/70 dark:border-stone-800/80 bg-stone-50/50 dark:bg-stone-900/30 overflow-hidden shadow-2xs">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 px-3.5 py-2.5 bg-stone-100/60 dark:bg-stone-800/50 hover:bg-stone-150/70 dark:hover:bg-stone-800/80 transition-colors select-none text-left cursor-pointer border-none"
      >
        <ChevronRight
          size={16}
          className={`transition-transform duration-200 text-[#B58D3D] shrink-0 ${
            isOpen ? "rotate-90" : "rotate-0"
          }`}
        />
        <span className="text-sm font-semibold text-charcoal dark:text-stone-200 truncate">
          {title || "トグル"}
        </span>
      </button>
      {isOpen && (
        <div className="px-4 py-2 text-stone-800 dark:text-stone-200">
          {children}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────
// メイン MarkdownViewer コンポーネント
// ─────────────────────────────────────────

export function MarkdownViewer({
  content,
  attachments,
  onContentChange,
  onSelectNote,
  allNotes = [],
}: MarkdownViewerProps) {
  if (!content.trim()) {
    return (
      <p style={{ color: C.charcoalXLight, fontStyle: "italic", lineHeight: 1.9, fontSize: "0.95rem" }}>
        このノートはまだ空です。クリックして入力を開始できます。
      </p>
    );
  }

  // [child-page:pageId] 構文を Markdown リンク [子ページ](note:pageId) に前処理
  // [bookmark:URL] 構文をスマートURLカード表示用に単独URL行に前処理
  const processedContent = content
    .replace(/\[child-page:([a-zA-Z0-9_-]+)\]/g, "[$1](note:$1)")
    .replace(/\[bookmark:(https?:\/\/[^\]]+)\]/g, "\n\n$1\n\n");

  // タスクリストのチェックボックスをクリックした際のトグル処理
  const handleTaskToggle = (taskText: string, currentChecked: boolean) => {
    if (!onContentChange) return;

    const targetSymbol = currentChecked ? "\\[x\\]" : "\\[ \\]";
    const newSymbol = currentChecked ? "[ ]" : "[x]";
    const cleanText = taskText.trim().replace(/^[-*+]\s*\[[ x]\]\s*/, "");
    const escapedText = cleanText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`^(\\s*[-*+]\\s*)${targetSymbol}(\\s*${escapedText})`, "m");

    if (regex.test(content)) {
      const updated = content.replace(regex, `$1${newSymbol}$2`);
      onContentChange(updated);
    } else {
      // フォールバック: 最初に見つかった対応状態の行を置換
      const fallbackRegex = new RegExp(`^(\\s*[-*+]\\s*)${targetSymbol}`, "m");
      if (fallbackRegex.test(content)) {
        onContentChange(content.replace(fallbackRegex, `$1${newSymbol}`));
      }
    }
  };

  const renderHeading = (level: number, children: ReactNode) => {
    const text = getHeadingText(children);
    let id = "";
    try {
      id = encodeURIComponent(text.replace(/[*_`]/g, "").trim());
    } catch {
      id = text.replace(/[^a-zA-Z0-9]/g, "");
    }
    const Tag = `h${level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
    return <Tag id={id}>{children}</Tag>;
  };

  const markdownComponents: React.ComponentProps<typeof ReactMarkdown>["components"] = useMemo(
    () => ({
      h1: ({ children }) => renderHeading(1, children),
      h2: ({ children }) => renderHeading(2, children),
      h3: ({ children }) => renderHeading(3, children),
      h4: ({ children }) => renderHeading(4, children),
      h5: ({ children }) => renderHeading(5, children),
      h6: ({ children }) => renderHeading(6, children),

      // コード要素（インライン vs ブロック判定）
      code: ({ className, children, ...props }) => {
        const isInline = !className && typeof children === "string" && !children.includes("\n");
        if (isInline) {
          return (
            <code
              style={{
                fontFamily: "SF Mono, Menlo, Monaco, Consolas, monospace",
                fontSize: "0.85em",
                background: C.ivory2,
                color: C.charcoal,
                padding: "0.18em 0.46em",
                borderRadius: "5px",
                letterSpacing: "-0.01em",
              }}
              {...props}
            >
              {children}
            </code>
          );
        }
        return <CodeBlock className={className}>{children}</CodeBlock>;
      },
      pre: ({ children }) => <>{children}</>,

      // テーブル要素（Apple HIG風カードテーブル）
      table: ({ children }) => (
        <div
          style={{
            overflowX: "auto",
            margin: "1.4rem 0",
            borderRadius: "12px",
            border: `1px solid ${C.goldFaint}`,
            boxShadow: C.cardShadow,
            background: "#fff",
          }}
          className="arca-scroll"
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "0.88rem",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {children}
          </table>
        </div>
      ),
      thead: ({ children }) => (
        <thead
          style={{
            background: C.goldFaint,
            borderBottom: `1px solid ${C.goldFaint}`,
          }}
        >
          {children}
        </thead>
      ),
      tbody: ({ children }) => <tbody>{children}</tbody>,
      tr: ({ children }) => (
        <tr
          style={{
            borderBottom: "1px solid rgba(0, 0, 0, 0.04)",
            transition: "background 0.12s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLTableRowElement).style.background = C.ivory2;
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLTableRowElement).style.background = "transparent";
          }}
        >
          {children}
        </tr>
      ),
      th: ({ children, style }) => (
        <th
          style={{
            padding: "0.65rem 1rem",
            textAlign: (style?.textAlign as any) || "left",
            fontWeight: 650,
            fontSize: "0.78rem",
            color: C.charcoal,
            letterSpacing: "0.03em",
            textTransform: "uppercase",
          }}
        >
          {children}
        </th>
      ),
      td: ({ children, style }) => (
        <td
          style={{
            padding: "0.65rem 1rem",
            textAlign: (style?.textAlign as any) || "left",
            color: C.charcoal,
          }}
        >
          {children}
        </td>
      ),

      // 箇条書きリスト
      ul: ({ className, children }) => {
        const isTaskList = className?.includes("contains-task-list");
        return (
          <ul
            className={className}
            style={{
              listStyleType: isTaskList ? "none" : "disc",
              paddingLeft: isTaskList ? "0.2rem" : "1.5rem",
              margin: "0.8rem 0",
            }}
          >
            {children}
          </ul>
        );
      },
      ol: ({ children }) => (
        <ol
          style={{
            listStyleType: "decimal",
            paddingLeft: "1.5rem",
            margin: "0.8rem 0",
          }}
        >
          {children}
        </ol>
      ),
      li: ({ className, children }) => {
        const isTaskItem = className?.includes("task-list-item");
        if (isTaskItem) {
          return (
            <li
              className={className}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "0.55rem",
                marginBottom: "0.45rem",
                listStyleType: "none",
              }}
            >
              {children}
            </li>
          );
        }
        return (
          <li
            className={className}
            style={{
              display: "list-item",
              marginBottom: "0.4rem",
              color: C.charcoal,
            }}
          >
            {children}
          </li>
        );
      },

      // チェックボックス（タスクリスト）
      input: ({ type, checked, disabled: _disabled, ...props }) => {
        if (type === "checkbox") {
          const isChecked = !!checked;
          return (
            <input
              type="checkbox"
              checked={isChecked}
              onChange={(e) => {
                const parent = e.currentTarget.closest("li");
                const text = parent?.textContent || "";
                if (text) {
                  handleTaskToggle(text, isChecked);
                }
              }}
              style={{
                appearance: "none",
                WebkitAppearance: "none",
                width: 17,
                height: 17,
                borderRadius: "5px",
                border: isChecked ? "none" : `1.5px solid ${C.gold}`,
                background: isChecked ? C.gold : "transparent",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                marginTop: "0.25rem",
                flexShrink: 0,
                transition: "all 0.15s ease",
              }}
              {...props}
            />
          );
        }
        return <input type={type} checked={checked} {...props} />;
      },

      // リンク & スマートURLカード & 子ページリンク
      a: ({ href, children }) => {
        const url = href || "";
        const text = String(children || "");

        // 子ページリンク [タイトル](note:pageId)
        if (url.startsWith("note:") || url.startsWith("arca-note://") || url.startsWith("#note-")) {
          const noteId = url
            .replace(/^note:/, "")
            .replace(/^arca-note:\/\//, "")
            .replace(/^#note-/, "");

          const targetNote = allNotes?.find((n) => n.id === noteId);

          // 削除済みまたは存在しない子ページは画面上にゴースト表示しない
          if (allNotes && allNotes.length > 0 && !targetNote) {
            return null;
          }

          const fallbackText = text.replace(/^📄\s*/, "").trim();
          const title =
            targetNote?.title?.trim() ||
            (fallbackText && fallbackText !== noteId ? fallbackText : "無題のページ");

          return (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (noteId && onSelectNote) {
                  onSelectNote(noteId);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  if (noteId && onSelectNote) {
                    onSelectNote(noteId);
                  }
                }
              }}
              className="group inline-flex items-center justify-between gap-2.5 w-full max-w-md px-3.5 py-2.5 my-2 rounded-xl bg-stone-100/70 dark:bg-stone-800/70 hover:bg-stone-200/80 dark:hover:bg-stone-700/80 transition-all duration-150 cursor-pointer shadow-2xs hover:shadow-xs select-none"
              title="子ページを開く"
            >
              <span className="flex items-center gap-2.5 min-w-0 flex-1">
                <span className="w-6 h-6 rounded-lg bg-amber-500/10 text-[#B58D3D] flex items-center justify-center shrink-0">
                  <FileText className="w-3.5 h-3.5 stroke-[2]" />
                </span>
                <span className="text-sm font-medium text-charcoal dark:text-stone-200 group-hover:text-[#B58D3D] transition-colors truncate">
                  {title}
                </span>
              </span>
              <ChevronRight className="w-4 h-4 text-charcoal-light dark:text-stone-400 group-hover:text-charcoal dark:group-hover:text-stone-200 group-hover:translate-x-0.5 transition-all shrink-0" />
            </span>
          );
        }

        if (url === text && url.startsWith("http")) {
          let hostname = "";
          try {
            hostname = new URL(url).hostname;
          } catch {}
          if (hostname) {
            return (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.6rem",
                  padding: "0.55rem 0.9rem",
                  margin: "0.5rem 0",
                  borderRadius: "10px",
                  background: C.goldFaint,
                  border: `1px solid ${C.goldFaint}`,
                  textDecoration: "none",
                  boxShadow: C.cardShadow,
                  transition: "all 0.15s ease",
                  maxWidth: "100%",
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
                <img
                  src={`https://www.google.com/s2/favicons?domain=${hostname}&sz=32`}
                  alt=""
                  style={{ width: 22, height: 22, borderRadius: 4, flexShrink: 0 }}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
                <span style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
                  <span
                    style={{
                      fontSize: "0.83rem",
                      fontWeight: 600,
                      color: C.charcoal,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {hostname}
                  </span>
                  <span
                    style={{
                      fontSize: "0.72rem",
                      color: C.charcoalLight,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {url}
                  </span>
                </span>
              </a>
            );
          }
        }
        return (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: C.gold,
              textDecoration: "none",
              borderBottom: "1px solid rgba(197, 160, 89, 0.4)",
              transition: "border-color 0.15s",
            }}
          >
            {children}
          </a>
        );
      },

      // 引用
      blockquote: ({ children }) => (
        <blockquote
          style={{
            borderLeft: `3px solid ${C.gold}`,
            margin: "1.4rem 0",
            padding: "0.8rem 1.3rem",
            color: C.charcoalMid,
            fontStyle: "italic",
            background: C.goldFaint,
            borderRadius: "0 10px 10px 0",
          }}
        >
          {children}
        </blockquote>
      ),

      // 画像（小 / 中 / 大 切り替え & 拡大）
      img: ({ src, alt }) => (
        <NoteImage
          src={typeof src === "string" ? src : undefined}
          alt={typeof alt === "string" ? alt : undefined}
          content={content}
          attachments={attachments}
          onContentChange={onContentChange}
        />
      ),

      // 水平線
      hr: () => (
        <hr
          style={{
            border: "none",
            borderTop: "1px solid rgba(0, 0, 0, 0.08)",
            margin: "2.4rem 0",
          }}
        />
      ),
    }),
    [allNotes, attachments, content, onContentChange, onSelectNote]
  );

  const sections = useMemo(() => parseToggleSections(processedContent), [processedContent]);

  return (
    <div className="arca-prose">
      {/* タスクリスト（チェックリスト）用スタイル */}
      <style>{`
        .arca-prose ul.contains-task-list {
          list-style: none !important;
          padding-left: 0.2rem !important;
        }
        .arca-prose li.task-list-item {
          display: flex !important;
          flex-direction: row !important;
          align-items: flex-start !important;
          gap: 0.55rem !important;
          margin-bottom: 0.4rem !important;
          list-style: none !important;
        }
        .arca-prose li.task-list-item > input[type="checkbox"] {
          margin-top: 0.22rem !important;
          flex-shrink: 0 !important;
        }
        .arca-prose li.task-list-item p {
          margin: 0 !important;
          padding: 0 !important;
          line-height: 1.6 !important;
          display: inline !important;
        }
      `}</style>
      {sections.map((sec, idx) => {
        if (sec.type === "toggle") {
          return (
            <ToggleViewer key={idx} title={sec.title || "トグル"} defaultOpen={sec.isOpen ?? true}>
              <ReactMarkdown
                urlTransform={(url) => url}
                remarkPlugins={[remarkGfm, remarkBreaks]}
                components={markdownComponents}
              >
                {sec.content.trim()}
              </ReactMarkdown>
            </ToggleViewer>
          );
        }
        if (!sec.content.trim()) return null;
        return (
          <ReactMarkdown
            key={idx}
            urlTransform={(url) => url}
            remarkPlugins={[remarkGfm, remarkBreaks]}
            components={markdownComponents}
          >
            {sec.content}
          </ReactMarkdown>
        );
      })}
    </div>
  );
}
