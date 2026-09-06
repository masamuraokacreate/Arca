/**
 * src/components/finance/CategoryGuideModal.tsx
 * Arca — Finance 支出カテゴリ分類ガイド モーダル (Sprint 10.13)
 */

import { useState } from "react";
import { CATEGORY_GUIDE_DATA, type ExpenseCategory } from "../../types/finance";
import { C } from "../../lib/designSystem";

interface CategoryGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectCategory?: (category: ExpenseCategory) => void;
  selectedCategory?: ExpenseCategory;
}

export function CategoryGuideModal({
  isOpen,
  onClose,
  onSelectCategory,
  selectedCategory,
}: CategoryGuideModalProps) {
  const [searchQuery, setSearchQuery] = useState("");

  if (!isOpen) return null;

  const filteredGuides = CATEGORY_GUIDE_DATA.filter((item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const matchesCategory = item.category.toLowerCase().includes(q);
    const matchesDesc = item.description.toLowerCase().includes(q);
    const matchesExamples = item.examples.some((ex) => ex.toLowerCase().includes(q));
    return matchesCategory || matchesDesc || matchesExamples;
  });

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        backgroundColor: "rgba(0, 0, 0, 0.45)",
        backdropFilter: "blur(8px)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="arca-card"
        style={{
          width: "100%",
          maxWidth: "720px",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          borderRadius: "20px",
          background: "var(--bg-card-solid)",
          border: "1px solid var(--border-subtle)",
          boxShadow: "0 20px 50px rgba(0, 0, 0, 0.2)",
          overflow: "hidden",
        }}
      >
        {/* ── ヘッダー ── */}
        <div
          style={{
            padding: "1.25rem 1.6rem 1rem",
            borderBottom: "1px solid var(--border-subtle)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <h2
              style={{
                fontSize: "1.12rem",
                fontWeight: 750,
                color: C.charcoal,
                margin: 0,
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <span>📖</span>
              <span>支出カテゴリ分類ガイド</span>
            </h2>
            <p
              style={{
                fontSize: "0.76rem",
                color: C.charcoalLight,
                margin: "0.25rem 0 0",
              }}
            >
              {onSelectCategory
                ? "カードをクリックすると、そのカテゴリを選択してフォームに反映します"
                : "支出の目的に合わせて適切なカテゴリを選択してください"}
            </p>
          </div>

          <button
            onClick={onClose}
            aria-label="閉じる"
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: C.charcoalLight,
              padding: "0.4rem",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* ── 検索バー ── */}
        <div
          style={{
            padding: "0.75rem 1.6rem",
            background: "var(--bg-nav-track)",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          <input
            type="text"
            placeholder="カテゴリ名・具体例（例: スーパー, スタバ, 新幹線, 課金）で検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "0.5rem 0.85rem",
              borderRadius: "8px",
              border: "1px solid var(--border-subtle)",
              fontSize: "0.82rem",
              color: C.charcoal,
              background: "var(--bg-card-solid)",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* ── ガイド一覧（2カラムグリッド） ── */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "1.2rem 1.6rem",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: "0.9rem",
          }}
        >
          {filteredGuides.length === 0 ? (
            <div
              style={{
                gridColumn: "1 / -1",
                textAlign: "center",
                padding: "3rem 1rem",
                color: C.charcoalLight,
                fontSize: "0.85rem",
              }}
            >
              「{searchQuery}」に一致するカテゴリが見つかりませんでした
            </div>
          ) : (
            filteredGuides.map((item) => {
              const isSelected = selectedCategory === item.category;

              return (
                <div
                  key={item.category}
                  onClick={() => {
                    if (onSelectCategory) {
                      onSelectCategory(item.category);
                      onClose();
                    }
                  }}
                  data-testid={`category-guide-card-${item.category}`}
                  style={{
                    padding: "0.95rem 1.1rem",
                    borderRadius: "14px",
                    background: isSelected ? "rgba(197, 160, 89, 0.08)" : "var(--bg-card-solid)",
                    border: isSelected
                      ? `2px solid ${C.gold}`
                      : "1px solid var(--border-subtle)",
                    boxShadow: isSelected
                      ? "0 4px 12px rgba(197, 160, 89, 0.2)"
                      : "0 1px 4px rgba(0, 0, 0, 0.03)",
                    cursor: onSelectCategory ? "pointer" : "default",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.55rem",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    if (onSelectCategory) {
                      e.currentTarget.style.transform = "translateY(-2px)";
                      e.currentTarget.style.borderColor = item.color;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (onSelectCategory) {
                      e.currentTarget.style.transform = "translateY(0)";
                      e.currentTarget.style.borderColor = isSelected
                        ? C.gold
                        : "var(--border-subtle)";
                    }
                  }}
                >
                  {/* タイトル ＆ カラーバッジ */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                      <span
                        style={{
                          display: "inline-block",
                          width: "9px",
                          height: "9px",
                          borderRadius: "50%",
                          backgroundColor: item.color,
                        }}
                      />
                      <span
                        style={{
                          fontSize: "0.92rem",
                          fontWeight: 750,
                          color: C.charcoal,
                        }}
                      >
                        {item.category}
                      </span>
                    </div>

                    {isSelected && (
                      <span
                        style={{
                          fontSize: "0.68rem",
                          fontWeight: 700,
                          color: C.goldDark,
                          background: C.goldFaint,
                          padding: "0.15rem 0.45rem",
                          borderRadius: "6px",
                        }}
                      >
                        選択中
                      </span>
                    )}
                  </div>

                  {/* 説明文 */}
                  <p
                    style={{
                      fontSize: "0.76rem",
                      color: C.charcoalMid,
                      margin: 0,
                      lineHeight: 1.45,
                    }}
                  >
                    {item.description}
                  </p>

                  {/* 具体例タグ一覧 */}
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "0.3rem",
                      marginTop: "0.15rem",
                    }}
                  >
                    {item.examples.map((ex) => (
                      <span
                        key={ex}
                        style={{
                          fontSize: "0.68rem",
                          color: C.charcoalLight,
                          background: "var(--bg-nav-track)",
                          padding: "0.18rem 0.45rem",
                          borderRadius: "5px",
                          border: "1px solid var(--border-subtle)",
                        }}
                      >
                        {ex}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* ── フッター ── */}
        <div
          style={{
            padding: "0.85rem 1.6rem",
            borderTop: "1px solid var(--border-subtle)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "var(--bg-card-solid)",
          }}
        >
          <span style={{ fontSize: "0.72rem", color: C.charcoalLight }}>
            12分類体系（自炊・外食・推し活・サブスク等に対応）
          </span>

          <button
            onClick={onClose}
            style={{
              padding: "0.45rem 1.1rem",
              borderRadius: "8px",
              border: "1px solid var(--border-subtle)",
              background: "var(--bg-nav-track)",
              color: C.charcoalMid,
              fontSize: "0.8rem",
              fontWeight: 650,
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
