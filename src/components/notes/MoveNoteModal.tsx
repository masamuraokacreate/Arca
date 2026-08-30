/**
 * src/components/notes/MoveNoteModal.tsx
 * Arca — 親ノート移動（付箋の付け替え）モーダル (Apple HIG × Arca デザインシステム準拠)
 *
 * 特徴:
 * 1. 循環参照ガード（自身および子孫ノートの選択を無効化）
 * 2. トップ階層（ルート）へのワンタップ移動対応
 * 3. 視覚的にわかりやすいインデントツリー表示
 */

import { useState } from "react";
import type { NoteItem } from "../../types";
import { getHierarchyTreeOptions } from "../../utils/noteHierarchy";
import { C } from "../../lib/designSystem";

const FolderMoveModalIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: C.gold }}>
    <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    <path d="m14 15 3-3-3-3" />
    <path d="M10 12h7" />
  </svg>
);

const HomeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: C.charcoalMid }}>
    <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);

const DocumentIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.65 }}>
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);

export interface MoveNoteModalProps {
  targetNote: NoteItem;
  allNotes: NoteItem[];
  isOpen: boolean;
  onClose: () => void;
  onMove: (targetNoteId: string, newParentId: string | null) => void;
}

export function MoveNoteModal({
  targetNote,
  allNotes,
  isOpen,
  onClose,
  onMove,
}: MoveNoteModalProps) {
  const currentParentId = targetNote.parentId ?? null;
  const [selectedParentId, setSelectedParentId] = useState<string | null>(currentParentId);

  if (!isOpen) return null;

  const options = getHierarchyTreeOptions(allNotes, targetNote.id);
  const isCurrentSelection = selectedParentId === currentParentId;

  const handleConfirm = () => {
    onMove(targetNote.id, selectedParentId);
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.4)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "1rem",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: C.white,
          borderRadius: "20px",
          boxShadow: "0 16px 48px rgba(0,0,0,0.16), 0 2px 8px rgba(0,0,0,0.06)",
          width: "100%",
          maxWidth: "460px",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          border: "1px solid rgba(0,0,0,0.06)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* モーダルヘッダー */}
        <div
          style={{
            padding: "1.2rem 1.4rem 0.9rem",
            borderBottom: "1px solid rgba(0, 0, 0, 0.05)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <FolderMoveModalIcon />
            <h3
              style={{
                fontSize: "1.05rem",
                fontWeight: 700,
                color: C.charcoal,
                margin: 0,
                letterSpacing: "-0.02em",
              }}
            >
              ノートの移動先を選択
            </h3>
          </div>
          <p
            style={{
              margin: "0.35rem 0 0",
              fontSize: "0.8rem",
              color: C.charcoalLight,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            対象: <strong>{targetNote.title || "（タイトルなし）"}</strong>
          </p>
        </div>

        {/* リストエリア */}
        <div
          className="arca-scroll"
          style={{
            padding: "0.8rem 1rem",
            overflowY: "auto",
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: "0.35rem",
          }}
        >
          {/* トップ階層（All Notes）オプション */}
          <button
            type="button"
            onClick={() => setSelectedParentId(null)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%",
              padding: "0.7rem 0.9rem",
              borderRadius: "12px",
              border: selectedParentId === null ? `1.5px solid ${C.gold}` : "1px solid rgba(0,0,0,0.04)",
              background: selectedParentId === null ? C.goldFaint2 : "rgba(0,0,0,0.015)",
              cursor: "pointer",
              textAlign: "left",
              transition: "all 0.12s ease",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              <div
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "8px",
                  background: selectedParentId === null ? "rgba(197, 160, 89, 0.18)" : "rgba(0, 0, 0, 0.04)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <HomeIcon />
              </div>
              <div>
                <div
                  style={{
                    fontSize: "0.88rem",
                    fontWeight: 650,
                    color: C.charcoal,
                  }}
                >
                  トップ階層（All Notes）
                </div>
                <div style={{ fontSize: "0.72rem", color: C.charcoalLight }}>
                  どのノートの配下にも属さない独立したノートにします
                </div>
              </div>
            </div>

            {currentParentId === null && (
              <span
                style={{
                  fontSize: "0.68rem",
                  fontWeight: 600,
                  color: C.charcoalLight,
                  background: "rgba(0,0,0,0.05)",
                  padding: "0.15rem 0.45rem",
                  borderRadius: "6px",
                  flexShrink: 0,
                }}
              >
                現在の場所
              </span>
            )}
          </button>

          <div
            style={{
              fontSize: "0.68rem",
              fontWeight: 700,
              color: C.charcoalXLight,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              padding: "0.6rem 0.4rem 0.2rem",
            }}
          >
            他のノートのサブノートにする
          </div>

          {options.length === 0 ? (
            <div
              style={{
                padding: "1.5rem",
                textAlign: "center",
                color: C.charcoalLight,
                fontSize: "0.82rem",
              }}
            >
              移動先の親ノート候補がありません
            </div>
          ) : (
            options.map(({ note, depth, isSelectable, disabledReason, isCurrentParent }) => {
              const isSelected = selectedParentId === note.id;

              return (
                <button
                  key={note.id}
                  type="button"
                  disabled={!isSelectable}
                  onClick={() => {
                    if (isSelectable) setSelectedParentId(note.id);
                  }}
                  title={disabledReason}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                    padding: "0.6rem 0.8rem",
                    paddingLeft: `${0.8 + depth * 1.2}rem`,
                    borderRadius: "10px",
                    border: isSelected ? `1.5px solid ${C.gold}` : "1px solid transparent",
                    background: isSelected
                      ? C.goldFaint2
                      : isSelectable
                      ? "transparent"
                      : "rgba(0,0,0,0.02)",
                    opacity: isSelectable ? 1 : 0.45,
                    cursor: isSelectable ? "pointer" : "not-allowed",
                    textAlign: "left",
                    transition: "all 0.12s ease",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.45rem",
                      minWidth: 0,
                      overflow: "hidden",
                    }}
                  >
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.2rem", flexShrink: 0, color: C.charcoalLight }}>
                      {depth > 0 && <span style={{ fontSize: "0.75rem", opacity: 0.6 }}>↳</span>}
                      <DocumentIcon />
                    </span>
                    <span
                      style={{
                        fontSize: "0.84rem",
                        fontWeight: isSelected ? 650 : 500,
                        color: isSelected ? C.goldDark : C.charcoal,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {note.title || "（タイトルなし）"}
                    </span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", flexShrink: 0 }}>
                    {isCurrentParent && (
                      <span
                        style={{
                          fontSize: "0.66rem",
                          fontWeight: 600,
                          color: C.charcoalLight,
                          background: "rgba(0,0,0,0.05)",
                          padding: "0.15rem 0.4rem",
                          borderRadius: "6px",
                        }}
                      >
                        現在の親
                      </span>
                    )}
                    {!isSelectable && disabledReason && (
                      <span
                        style={{
                          fontSize: "0.64rem",
                          color: C.charcoalLight,
                          fontStyle: "italic",
                        }}
                      >
                        {disabledReason}
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* フッター */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: "0.6rem",
            padding: "0.9rem 1.4rem",
            background: C.ivory,
            borderTop: `1px solid ${C.ivory2}`,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "0.45rem 0.95rem",
              borderRadius: "8px",
              border: "1px solid rgba(0,0,0,0.08)",
              background: C.white,
              fontSize: "0.82rem",
              fontWeight: 500,
              color: C.charcoalMid,
              cursor: "pointer",
            }}
          >
            キャンセル
          </button>
          <button
            type="button"
            disabled={isCurrentSelection}
            onClick={handleConfirm}
            style={{
              padding: "0.45rem 1.1rem",
              borderRadius: "8px",
              border: "none",
              background: isCurrentSelection ? "rgba(0,0,0,0.08)" : C.gold,
              fontSize: "0.82rem",
              fontWeight: 650,
              color: isCurrentSelection ? C.charcoalLight : C.white,
              cursor: isCurrentSelection ? "default" : "pointer",
              boxShadow: isCurrentSelection ? "none" : "0 2px 8px rgba(197, 160, 89, 0.35)",
              transition: "all 0.15s ease",
            }}
          >
            移動する
          </button>
        </div>
      </div>
    </div>
  );
}
