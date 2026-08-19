/**
 * src/components/notes/AetherExtractModal.tsx
 * Arca — Aether Core 横断抽出モーダル (Apple HIG × Arca 準拠)
 */

import { useState, useId } from "react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../lib/firebase";
import type { ExtractedActionableItems } from "../../types";
import { C } from "../../lib/designSystem";

interface AetherExtractModalProps {
  items: ExtractedActionableItems;
  onClose: () => void;
  onSuccess: (count: number) => void;
}

export function AetherExtractModal({
  items,
  onClose,
  onSuccess,
}: AetherExtractModalProps) {
  const baseId = useId();

  // 買い物アイテムの選択状態 (インデックスSet)
  const [selectedLists, setSelectedLists] = useState<Set<number>>(
    new Set(items.lists.map((_, i) => i))
  );

  // タスクアイテムの選択状態 (インデックスSet)
  const [selectedTasks, setSelectedTasks] = useState<Set<number>>(
    new Set(items.tasks.map((_, i) => i))
  );

  const [saving, setSaving] = useState(false);

  const totalItems = items.lists.length + items.tasks.length;
  const selectedCount = selectedLists.size + selectedTasks.size;

  // 買い物リストの選択切り替え
  const toggleList = (index: number) => {
    setSelectedLists((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  // タスクの選択切り替え
  const toggleTask = (index: number) => {
    setSelectedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  // 全選択 / 全解除
  const toggleSelectAll = () => {
    if (selectedCount === totalItems) {
      setSelectedLists(new Set());
      setSelectedTasks(new Set());
    } else {
      setSelectedLists(new Set(items.lists.map((_, i) => i)));
      setSelectedTasks(new Set(items.tasks.map((_, i) => i)));
    }
  };

  // Arca への一括保存
  const handleSave = async () => {
    if (selectedCount === 0 || saving) return;
    setSaving(true);

    try {
      const promises: Promise<unknown>[] = [];

      // 買い物リストの保存
      for (const idx of selectedLists) {
        const item = items.lists[idx];
        if (item) {
          promises.push(
            addDoc(collection(db, "lists"), {
              text: item.title,
              completed: false,
              category: item.category || null,
              createdAt: serverTimestamp(),
            })
          );
        }
      }

      // タスクの保存
      for (const idx of selectedTasks) {
        const task = items.tasks[idx];
        if (task) {
          promises.push(
            addDoc(collection(db, "tasks"), {
              title: task.title,
              dueDate: task.dueDate || null,
              completed: false,
              createdAt: serverTimestamp(),
            })
          );
        }
      }

      await Promise.all(promises);
      onSuccess(selectedCount);
      onClose();
    } catch (err) {
      console.error("Failed to add extracted items to Arca:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0, 0, 0, 0.36)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        padding: "1rem",
        animation: "arca-view-in 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
      onClick={onClose}
    >
      {/* モーダルカード */}
      <div
        className="arca-card"
        style={{
          width: "100%",
          maxWidth: "520px",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          background: "rgba(253, 252, 250, 0.96)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          borderRadius: "24px",
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.20), 0 2px 10px rgba(0, 0, 0, 0.06)",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── ヘッダー ── */}
        <div
          style={{
            padding: "1.4rem 1.6rem 1rem",
            borderBottom: "1px solid rgba(0, 0, 0, 0.04)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.35rem",
                fontSize: "0.68rem",
                fontWeight: 700,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: C.gold,
                marginBottom: "0.3rem",
              }}
            >
              <span>✦ Aether Core</span>
            </div>
            <h3
              style={{
                fontSize: "1.2rem",
                fontWeight: 700,
                color: C.charcoal,
                margin: 0,
                letterSpacing: "-0.015em",
              }}
            >
              アクション項目の抽出
            </h3>
            <p
              style={{
                fontSize: "0.76rem",
                color: C.charcoalLight,
                margin: "0.3rem 0 0",
              }}
            >
              ノートから {totalItems} 件のアクション候補を見つけました
            </p>
          </div>

          <button
            onClick={onClose}
            style={{
              background: "rgba(0, 0, 0, 0.04)",
              border: "none",
              borderRadius: "50%",
              width: "28px",
              height: "28px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: C.charcoalLight,
              fontSize: "0.9rem",
              lineHeight: 1,
              transition: "background 0.15s ease",
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "rgba(0, 0, 0, 0.08)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "rgba(0, 0, 0, 0.04)")}
            title="閉じる"
          >
            ✕
          </button>
        </div>

        {/* ── コンテンツ（スクロール領域） ── */}
        <div
          className="no-scrollbar"
          style={{
            padding: "1.2rem 1.6rem",
            overflowY: "auto",
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: "1.4rem",
          }}
        >
          {totalItems === 0 ? (
            <div
              style={{
                padding: "2.5rem 1rem",
                textAlign: "center",
                color: C.charcoalLight,
              }}
            >
              <p style={{ fontSize: "0.88rem", margin: 0 }}>
                抽出可能なアクション項目は見つかりませんでした
              </p>
              <p style={{ fontSize: "0.75rem", color: C.charcoalXLight, marginTop: "0.4rem" }}>
                買い物アイテムやタスクが含まれるノートで再度お試しください
              </p>
            </div>
          ) : (
            <>
              {/* 全選択トグル */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                }}
              >
                <button
                  onClick={toggleSelectAll}
                  style={{
                    background: "none",
                    border: "none",
                    fontSize: "0.72rem",
                    color: C.goldDark,
                    cursor: "pointer",
                    fontWeight: 600,
                    padding: 0,
                    letterSpacing: "0.02em",
                  }}
                >
                  {selectedCount === totalItems ? "すべて解除" : "すべて選択"}
                </button>
              </div>

              {/* 買い物リストセクション */}
              {items.lists.length > 0 && (
                <div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      marginBottom: "0.65rem",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "0.72rem",
                        fontWeight: 650,
                        letterSpacing: "0.06em",
                        color: C.charcoal,
                        textTransform: "uppercase",
                      }}
                    >
                      買い物リスト候補 ({items.lists.length})
                    </span>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
                    {items.lists.map((item, idx) => {
                      const isSelected = selectedLists.has(idx);
                      const checkId = `${baseId}-list-${idx}`;
                      return (
                        <div
                          key={checkId}
                          onClick={() => toggleList(idx)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === " " || e.key === "Enter") {
                              e.preventDefault();
                              toggleList(idx);
                            }
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.85rem",
                            padding: "0.75rem 0.95rem",
                            borderRadius: "14px",
                            background: isSelected ? C.white : "rgba(0, 0, 0, 0.02)",
                            boxShadow: isSelected ? "0 2px 8px rgba(197, 160, 89, 0.12), 0 1px 2px rgba(0, 0, 0, 0.04)" : "none",
                            border: isSelected ? `1px solid ${C.goldFaint2}` : "1px solid transparent",
                            cursor: "pointer",
                            transition: "all 0.16s cubic-bezier(0.16, 1, 0.3, 1)",
                            userSelect: "none",
                            minHeight: "48px",
                            boxSizing: "border-box",
                          }}
                          onMouseEnter={(e) => {
                            if (!isSelected) e.currentTarget.style.background = "rgba(0, 0, 0, 0.04)";
                          }}
                          onMouseLeave={(e) => {
                            if (!isSelected) e.currentTarget.style.background = "rgba(0, 0, 0, 0.02)";
                          }}
                        >
                          <input
                            id={checkId}
                            type="checkbox"
                            checked={isSelected}
                            readOnly
                            style={{
                              accentColor: C.gold,
                              width: "18px",
                              height: "18px",
                              cursor: "pointer",
                              pointerEvents: "none",
                              flexShrink: 0,
                            }}
                          />
                          <span
                            style={{
                              flex: 1,
                              fontSize: "0.875rem",
                              fontWeight: isSelected ? 500 : 400,
                              color: isSelected ? C.charcoal : C.charcoalLight,
                              lineHeight: 1.35,
                            }}
                          >
                            {item.title}
                          </span>
                          {item.category && (
                            <span
                              style={{
                                fontSize: "0.68rem",
                                color: C.goldDark,
                                background: C.goldFaint2,
                                padding: "0.15rem 0.5rem",
                                borderRadius: "6px",
                                fontWeight: 500,
                                flexShrink: 0,
                              }}
                            >
                              {item.category}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* タスクセクション */}
              {items.tasks.length > 0 && (
                <div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      marginBottom: "0.65rem",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "0.72rem",
                        fontWeight: 650,
                        letterSpacing: "0.06em",
                        color: C.charcoal,
                        textTransform: "uppercase",
                      }}
                    >
                      タスク候補 ({items.tasks.length})
                    </span>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
                    {items.tasks.map((task, idx) => {
                      const isSelected = selectedTasks.has(idx);
                      const checkId = `${baseId}-task-${idx}`;
                      return (
                        <div
                          key={checkId}
                          onClick={() => toggleTask(idx)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === " " || e.key === "Enter") {
                              e.preventDefault();
                              toggleTask(idx);
                            }
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.85rem",
                            padding: "0.75rem 0.95rem",
                            borderRadius: "14px",
                            background: isSelected ? C.white : "rgba(0, 0, 0, 0.02)",
                            boxShadow: isSelected ? "0 2px 8px rgba(197, 160, 89, 0.12), 0 1px 2px rgba(0, 0, 0, 0.04)" : "none",
                            border: isSelected ? `1px solid ${C.goldFaint2}` : "1px solid transparent",
                            cursor: "pointer",
                            transition: "all 0.16s cubic-bezier(0.16, 1, 0.3, 1)",
                            userSelect: "none",
                            minHeight: "48px",
                            boxSizing: "border-box",
                          }}
                          onMouseEnter={(e) => {
                            if (!isSelected) e.currentTarget.style.background = "rgba(0, 0, 0, 0.04)";
                          }}
                          onMouseLeave={(e) => {
                            if (!isSelected) e.currentTarget.style.background = "rgba(0, 0, 0, 0.02)";
                          }}
                        >
                          <input
                            id={checkId}
                            type="checkbox"
                            checked={isSelected}
                            readOnly
                            style={{
                              accentColor: C.gold,
                              width: "18px",
                              height: "18px",
                              cursor: "pointer",
                              pointerEvents: "none",
                              flexShrink: 0,
                            }}
                          />
                          <span
                            style={{
                              flex: 1,
                              fontSize: "0.875rem",
                              fontWeight: isSelected ? 500 : 400,
                              color: isSelected ? C.charcoal : C.charcoalLight,
                              lineHeight: 1.35,
                            }}
                          >
                            {task.title}
                          </span>
                          {task.dueDate && (
                            <span
                              style={{
                                fontSize: "0.68rem",
                                color: C.charcoalLight,
                                background: "rgba(0,0,0,0.04)",
                                padding: "0.15rem 0.45rem",
                                borderRadius: "6px",
                                fontWeight: 500,
                                flexShrink: 0,
                              }}
                            >
                              {task.dueDate}
                            </span>
                          )}
                          {task.priority === "high" && (
                            <span
                              style={{
                                fontSize: "0.65rem",
                                color: C.danger,
                                background: "rgba(192, 97, 74, 0.08)",
                                padding: "0.15rem 0.45rem",
                                borderRadius: "6px",
                                fontWeight: 600,
                                flexShrink: 0,
                              }}
                            >
                              High
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── フッター ── */}
        <div
          style={{
            padding: "1rem 1.6rem 1.4rem",
            borderTop: "1px solid rgba(0, 0, 0, 0.04)",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: "0.75rem",
          }}
        >
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              padding: "0.55rem 1rem",
              borderRadius: "10px",
              cursor: "pointer",
              fontSize: "0.8rem",
              color: C.charcoalLight,
              fontWeight: 500,
            }}
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={selectedCount === 0 || saving}
            style={{
              background: selectedCount > 0 ? C.gold : "rgba(0, 0, 0, 0.06)",
              color: selectedCount > 0 ? "#FDFCFA" : C.charcoalXLight,
              border: "none",
              borderRadius: "10px",
              padding: "0.55rem 1.25rem",
              fontSize: "0.8rem",
              fontWeight: 600,
              cursor: selectedCount > 0 ? "pointer" : "default",
              boxShadow: selectedCount > 0 ? "0 2px 10px rgba(197, 160, 89, 0.32)" : "none",
              transition: "all 0.15s ease",
            }}
          >
            {saving ? "保存中…" : `${selectedCount} 件を Arca に追加`}
          </button>
        </div>
      </div>
    </div>
  );
}
