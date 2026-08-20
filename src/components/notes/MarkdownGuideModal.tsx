/**
 * src/components/notes/MarkdownGuideModal.tsx
 * Arca — Markdown 構文ガイド（Apple HIG 準拠シート / ポップオーバー）
 *
 * 設計原則:
 * - 普段は非表示（控えめで思考を邪魔しないUI）
 * - ツールバーの「?」ボタンでスッと開く
 * - カテゴリ別に整理された視覚的見本
 * - クリックでエディタに直接構文を挿入可能
 */

import { useState, useEffect, useRef } from "react";
import { C } from "../../lib/designSystem";

interface GuideItem {
  id: string;
  name: string;
  syntax: string;
  example: string;
  description: string;
}

interface GuideCategory {
  title: string;
  items: GuideItem[];
}

const GUIDE_CATEGORIES: GuideCategory[] = [
  {
    title: "基本の装飾",
    items: [
      { id: "bold", name: "太字", syntax: "**テキスト**", example: "**重要事項**", description: "重要な語句を強調" },
      { id: "italic", name: "斜体", syntax: "*テキスト*", example: "*補足説明*", description: "ニュアンスや強調" },
      { id: "strike", name: "取り消し線", syntax: "~~テキスト~~", example: "~~古い情報~~", description: "修正・取り消し" },
      { id: "hr", name: "区切り線", syntax: "\n---\n", example: "---", description: "セクションの境界" },
    ],
  },
  {
    title: "見出し",
    items: [
      { id: "h1", name: "見出し 1", syntax: "# ", example: "# 大見出し", description: "ノートの主要セクション" },
      { id: "h2", name: "見出し 2", syntax: "## ", example: "## 中見出し", description: "サブセクション" },
      { id: "h3", name: "見出し 3", syntax: "### ", example: "### 小見出し", description: "詳細項目" },
    ],
  },
  {
    title: "リスト & タスク",
    items: [
      { id: "bullet", name: "箇条書き", syntax: "- ", example: "- アイテム 1\n- アイテム 2", description: "順不同の箇条書き" },
      { id: "numbered", name: "番号付きリスト", syntax: "1. ", example: "1. 最初のステップ\n2. 次のステップ", description: "順序のある手順" },
      { id: "task", name: "チェックリスト", syntax: "- [ ] ", example: "- [ ] 未完了タスク\n- [x] 完了タスク", description: "ToDo・チェック管理" },
    ],
  },
  {
    title: "構造化 & 引用",
    items: [
      { id: "quote", name: "引用", syntax: "> ", example: "> 思考を妨げない空間", description: "引用文・メモ" },
      {
        id: "table",
        name: "テーブル（表）",
        syntax: "| 項目 | 内容 |\n| :--- | :--- |\n| A    | 詳細 |",
        example: "| 項目 | 内容 |\n| :--- | :--- |\n| A    | 詳細 |",
        description: "行と列による表組み",
      },
      { id: "link", name: "リンク", syntax: "[リンク名](https://example.com)", example: "[Arca](https://example.com)", description: "Webリンク" },
      { id: "code-inline", name: "インラインコード", syntax: "`コード`", example: "`const a = 1;`", description: "文中のコード・キー" },
      { id: "code-block", name: "コードブロック", syntax: "```ts\n// ここにコード\n```", example: "```ts\nconsole.log('Arca');\n```", description: "複数行のプログラム" },
    ],
  },
];

export function MarkdownGuideModal({
  isOpen,
  onClose,
  onInsert,
}: {
  isOpen: boolean;
  onClose: () => void;
  onInsert?: (syntax: string) => void;
}) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [insertedId, setInsertedId] = useState<string | null>(null);

  const handleItemClick = (item: GuideItem) => {
    if (!onInsert) return;
    onInsert(item.syntax);
    setInsertedId(item.id);
    setTimeout(() => {
      setInsertedId((prev) => (prev === item.id ? null : prev));
    }, 1500);
  };

  // ESCキーで閉じる
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // モーダル外クリックで閉じる
  useEffect(() => {
    if (!isOpen) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filteredCategories = GUIDE_CATEGORIES.map((cat) => {
    if (selectedCategory !== "all" && cat.title !== selectedCategory) {
      return { ...cat, items: [] };
    }
    if (!searchQuery.trim()) {
      return cat;
    }
    const q = searchQuery.toLowerCase();
    const items = cat.items.filter(
      (it) =>
        it.name.toLowerCase().includes(q) ||
        it.syntax.toLowerCase().includes(q) ||
        it.description.toLowerCase().includes(q)
    );
    return { ...cat, items };
  }).filter((cat) => cat.items.length > 0);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
        background: "rgba(44, 44, 46, 0.25)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}
      aria-modal="true"
      role="dialog"
      aria-label="Markdown 構文ガイド"
    >
      <div
        ref={modalRef}
        className="arca-view-in"
        style={{
          width: "100%",
          maxWidth: "680px",
          maxHeight: "85vh",
          background: "rgba(253, 252, 250, 0.95)",
          backdropFilter: "blur(24px) saturate(180%)",
          WebkitBackdropFilter: "blur(24px) saturate(180%)",
          borderRadius: "22px",
          boxShadow: C.toastShadow,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          border: "1px solid rgba(255, 255, 255, 0.6)",
        }}
      >
        {/* ── ヘッダー ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "1.2rem 1.5rem 1rem",
            borderBottom: "1px solid rgba(0, 0, 0, 0.06)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <div
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "8px",
                background: C.goldFaint,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: C.goldDark,
                fontWeight: 700,
                fontSize: "0.85rem",
              }}
            >
              M↓
            </div>
            <div>
              <h2 style={{ fontSize: "1.05rem", fontWeight: 700, margin: 0, color: C.charcoal }}>
                Markdown 構文ガイド
              </h2>
              <p style={{ fontSize: "0.72rem", color: C.charcoalLight, margin: 0 }}>
                クリックでエディタに構文を直接挿入できます
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="ガイドを閉じる"
            style={{
              width: "30px",
              height: "30px",
              borderRadius: "50%",
              background: "rgba(0, 0, 0, 0.05)",
              border: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: C.charcoalMid,
              fontSize: "1rem",
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(0, 0, 0, 0.09)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(0, 0, 0, 0.05)";
            }}
          >
            ✕
          </button>
        </div>

        {/* ── 検索 & フィルターバー ── */}
        <div
          style={{
            padding: "0.8rem 1.5rem",
            background: "rgba(0, 0, 0, 0.015)",
            borderBottom: "1px solid rgba(0, 0, 0, 0.04)",
            display: "flex",
            gap: "0.8rem",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <input
            type="text"
            placeholder="構文を検索（例: テーブル, リスト, 見出し）..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              flex: "1 1 200px",
              padding: "0.45rem 0.8rem",
              borderRadius: "8px",
              border: "1px solid rgba(0, 0, 0, 0.08)",
              background: C.white,
              fontSize: "0.8rem",
              color: C.charcoal,
              outline: "none",
            }}
          />

          {/* カテゴリピル */}
          <div style={{ display: "flex", gap: "0.3rem", overflowX: "auto" }}>
            {["all", ...GUIDE_CATEGORIES.map((c) => c.title)].map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                style={{
                  border: "none",
                  borderRadius: "20px",
                  padding: "0.25rem 0.65rem",
                  fontSize: "0.72rem",
                  fontWeight: 500,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  background: selectedCategory === cat ? C.gold : "rgba(0, 0, 0, 0.04)",
                  color: selectedCategory === cat ? C.white : C.charcoalMid,
                  transition: "all 0.15s ease",
                }}
              >
                {cat === "all" ? "すべて" : cat}
              </button>
            ))}
          </div>
        </div>

        {/* ── ガイド一覧（スクロールエリア） ── */}
        <div
          className="arca-scroll"
          style={{
            padding: "1.2rem 1.5rem 1.5rem",
            overflowY: "auto",
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: "1.2rem",
          }}
        >
          {filteredCategories.length === 0 ? (
            <div style={{ textAlign: "center", padding: "3rem 1rem", color: C.charcoalLight }}>
              該当する構文が見つかりませんでした
            </div>
          ) : (
            filteredCategories.map((cat) => (
              <div key={cat.title}>
                <h3
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    color: C.goldDark,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    margin: "0 0 0.55rem",
                  }}
                >
                  {cat.title}
                </h3>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                    gap: "0.6rem",
                  }}
                >
                  {cat.items.map((item) => {
                    const isInserted = insertedId === item.id;
                    return (
                      <div
                        key={item.id}
                        onClick={() => handleItemClick(item)}
                        style={{
                          background: isInserted ? C.goldFaint : C.white,
                          borderRadius: "12px",
                          padding: "0.75rem 0.9rem",
                          boxShadow: "0 1px 4px rgba(0, 0, 0, 0.03)",
                          border: isInserted ? `1px solid ${C.gold}` : "1px solid rgba(0, 0, 0, 0.04)",
                          cursor: onInsert ? "pointer" : "default",
                          transition: "all 0.18s ease",
                          display: "flex",
                          flexDirection: "column",
                          gap: "0.3rem",
                        }}
                        onMouseEnter={(e) => {
                          if (onInsert && !isInserted) {
                            e.currentTarget.style.transform = "translateY(-1px)";
                            e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.06)";
                            e.currentTarget.style.borderColor = C.goldFaint3;
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (onInsert && !isInserted) {
                            e.currentTarget.style.transform = "translateY(0)";
                            e.currentTarget.style.boxShadow = "0 1px 4px rgba(0, 0, 0, 0.03)";
                            e.currentTarget.style.borderColor = "rgba(0, 0, 0, 0.04)";
                          }
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <span style={{ fontSize: "0.82rem", fontWeight: 650, color: C.charcoal }}>
                            {item.name}
                          </span>
                          {onInsert && (
                            <span
                              style={{
                                fontSize: "0.68rem",
                                color: isInserted ? "#5A8B5F" : C.gold,
                                fontWeight: 600,
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "0.2rem",
                                transition: "all 0.15s ease",
                              }}
                            >
                              {isInserted ? "挿入完了 ✓" : "挿入 ↵"}
                            </span>
                          )}
                        </div>

                      <div
                        style={{
                          background: C.ivory2,
                          padding: "0.3rem 0.55rem",
                          borderRadius: "6px",
                          fontFamily: "SF Mono, Menlo, monospace",
                          fontSize: "0.75rem",
                          color: C.charcoalMid,
                          whiteSpace: "pre-wrap",
                          overflowX: "auto",
                        }}
                      >
                        {item.syntax.trim()}
                      </div>

                      <p style={{ fontSize: "0.7rem", color: C.charcoalLight, margin: 0, lineHeight: 1.4 }}>
                        {item.description}
                      </p>
                    </div>
                  );
                })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* ── フッター ── */}
        <div
          style={{
            padding: "0.75rem 1.5rem",
            borderTop: "1px solid rgba(0, 0, 0, 0.06)",
            background: "rgba(0, 0, 0, 0.02)",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: "0.45rem 1.1rem",
              borderRadius: "8px",
              background: C.charcoal,
              color: C.white,
              fontSize: "0.78rem",
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
            }}
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
