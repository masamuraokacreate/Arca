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

import { useState, useCallback, type ReactNode, isValidElement } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { C } from "../../lib/designSystem";

export interface MarkdownViewerProps {
  content: string;
  onContentChange?: (newContent: string) => void;
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
// メイン MarkdownViewer コンポーネント
// ─────────────────────────────────────────

export function MarkdownViewer({ content, onContentChange }: MarkdownViewerProps) {
  if (!content.trim()) {
    return (
      <p style={{ color: C.charcoalXLight, fontStyle: "italic", lineHeight: 1.9, fontSize: "0.95rem" }}>
        このノートはまだ空です。鉛筆アイコンから編集を開始してください。
      </p>
    );
  }

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

  return (
    <div className="arca-prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
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
                width: "100%",
                overflowX: "auto",
                margin: "1.6rem 0",
                borderRadius: "14px",
                boxShadow: "0 1px 4px rgba(0, 0, 0, 0.04), 0 0 1px rgba(0, 0, 0, 0.08)",
                background: C.white,
                border: "1px solid rgba(0, 0, 0, 0.05)",
              }}
            >
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  textAlign: "left",
                  fontSize: "0.88rem",
                }}
              >
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead
              style={{
                background: C.ivory,
                borderBottom: `1px solid ${C.ivory2}`,
              }}
            >
              {children}
            </thead>
          ),
          th: ({ children }) => (
            <th
              style={{
                padding: "0.75rem 1rem",
                fontWeight: 650,
                fontSize: "0.8rem",
                color: C.charcoalMid,
                letterSpacing: "0.02em",
                borderBottom: `1px solid ${C.ivory2}`,
              }}
            >
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td
              style={{
                padding: "0.75rem 1rem",
                color: C.charcoal,
                borderBottom: "1px solid rgba(0, 0, 0, 0.04)",
                lineHeight: 1.6,
              }}
            >
              {children}
            </td>
          ),

          // リスト要素（箇条書き・番号・タスクリスト）
          ul: ({ className, children }) => {
            const isTaskList = className?.includes("contains-task-list");
            return (
              <ul
                className={className}
                style={{
                  listStyleType: isTaskList ? "none" : "disc",
                  paddingLeft: isTaskList ? "0.2rem" : "1.6rem",
                  margin: "0.8rem 0 1.25rem",
                  lineHeight: 1.88,
                }}
              >
                {children}
              </ul>
            );
          },
          ol: ({ className, children }) => (
            <ol
              className={className}
              style={{
                listStyleType: "decimal",
                paddingLeft: "1.6rem",
                margin: "0.8rem 0 1.25rem",
                lineHeight: 1.88,
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
                  disabled={!onContentChange}
                  onChange={(e) => {
                    if (onContentChange) {
                      const parentLi = (e.target as HTMLElement).closest("li");
                      const text = parentLi ? parentLi.textContent?.trim() || "" : "";
                      handleTaskToggle(text, isChecked);
                    }
                  }}
                  style={{
                    width: "16px",
                    height: "16px",
                    marginTop: "0.28rem",
                    accentColor: C.gold,
                    cursor: onContentChange ? "pointer" : "default",
                    flexShrink: 0,
                  }}
                  {...props}
                />
              );
            }
            return <input type={type} {...props} />;
          },

          // リンク（単独URLならスマートカード表示）
          a: ({ href, children }) => {
            const url = href || "";
            const text = getHeadingText(children);
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
                      display: "flex",
                      alignItems: "center",
                      gap: "0.8rem",
                      padding: "0.75rem 1rem",
                      background: C.white,
                      borderRadius: "12px",
                      boxShadow: C.cardShadow,
                      textDecoration: "none",
                      color: C.charcoal,
                      transition: "transform 0.15s, box-shadow 0.15s",
                      margin: "1.2rem 0",
                      border: "1px solid rgba(0, 0, 0, 0.04)",
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
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
