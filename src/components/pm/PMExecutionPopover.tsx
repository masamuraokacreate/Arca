/**
 * src/components/pm/PMExecutionPopover.tsx
 * Arca — PM（周期保全・管理台帳）カレンダー実行パネル
 *
 * 設計原則:
 *  - 道具としての静けさ、Apple HIG × Arca 準拠（多層シャドウ、枠線排除）
 *  - Aether Core 連携:
 *      * 台帳で定義された購入物品テンプレートの表示 & [ Listsへ追加 ] ワンタップ登録
 *      * 関連ノートリンクの表示 & クリックでの即座参照（プレビューダイアログ）
 *  - 実行用チェックリスト（全ステップ完了で完了ボタンが点灯）
 *  - レイアウトシフト防止の固定サイズボタンスイッチング:
 *      * パネル右下に「開始/開始取消」と「完了」ボタンを横並び配置
 *      * 固定幅・固定高さ（w-[110px] h-[36px]）を厳格に保持
 *  - 工数計算（開始〜完了）および目安との差分を自動計算し、pm_logs テーブルへ保存
 *  - 絵文字完全排除、Lucide React SVGアイコンのみ使用
 */

import { useState, useEffect, useMemo } from "react";
import {
  RotateCw,
  Play,
  RotateCcw,
  Check,
  Clock,
  BookOpen,
  Plus,
  ShoppingCart,
  X,
  Calendar,
  ExternalLink,
  ChevronRight,
} from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { C } from "../../lib/designSystem";
import type { PMMaster, PMMasterLog, PMItemTemplate } from "../../types/pm";
import type { NoteItem } from "../../types";
import {
  recordPMExecution,
  addItemsToLists,
  todayStr,
} from "../../services/pmMasterService";
import { useModalAnimation } from "../../hooks/useModalAnimation";

export interface PMExecutionPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  /** 実行対象の日付 ("YYYY-MM-DD") */
  date: string;
  /** 単一のPMマスタまたは当日のPMマスタ一覧 */
  master?: PMMaster | null;
  masters?: PMMaster[];
  /** 完了時のコールバック */
  onCompleted?: (log: PMMasterLog) => void;
  /** 台帳編集モーダルを開くコールバック */
  onOpenMaster?: (masterId: string) => void;
}

/** 現在時刻を "HH:mm" で取得 */
function getCurrentTimeStr(): string {
  const d = new Date();
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

export function PMExecutionPopover({
  isOpen,
  onClose,
  date,
  master: singleMaster,
  masters: masterList,
  onCompleted,
  onOpenMaster,
}: PMExecutionPopoverProps) {
  // 利用可能なPMマスタのリストを統合
  const availableMasters = useMemo(() => {
    if (masterList && masterList.length > 0) return masterList;
    if (singleMaster) return [singleMaster];
    return [];
  }, [singleMaster, masterList]);

  // 選択中のPMマスタID
  const [selectedMasterId, setSelectedMasterId] = useState<string>("");

  useEffect(() => {
    if (availableMasters.length > 0) {
      if (!selectedMasterId || !availableMasters.some((m) => m.id === selectedMasterId)) {
        setSelectedMasterId(availableMasters[0].id);
      }
    }
  }, [availableMasters, selectedMasterId]);

  const activeMaster = useMemo(() => {
    return availableMasters.find((m) => m.id === selectedMasterId) || availableMasters[0] || null;
  }, [availableMasters, selectedMasterId]);

  // 実行チェックリストの完了ステート (taskId -> boolean)
  const [completedTaskIds, setCompletedTaskIds] = useState<Set<string>>(new Set());

  // 計測用開始時刻 ("HH:mm")
  const [startedAt, setStartedAt] = useState<string | null>(null);

  // Lists追加中 / 完了ステート
  const [addingItemMap, setAddingItemMap] = useState<Record<string, boolean>>({});
  const [addedItemMap, setAddedItemMap] = useState<Record<string, boolean>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // 関連ノート情報
  const [linkedNote, setLinkedNote] = useState<NoteItem | null>(null);
  const [showNotePreview, setShowNotePreview] = useState(false);

  // 保存処理中フラグ
  const [isSubmitting, setIsSubmitting] = useState(false);

  // マスタ切り替え時・開閉時にステートを初期化
  useEffect(() => {
    if (isOpen) {
      setCompletedTaskIds(new Set());
      setStartedAt(null);
      setAddedItemMap({});
      setAddingItemMap({});
      setToastMessage(null);
      setShowNotePreview(false);
    }
  }, [isOpen, selectedMasterId]);

  // 関連ノートの取得
  useEffect(() => {
    if (!activeMaster?.noteId) {
      setLinkedNote(null);
      return;
    }
    let cancelled = false;
    getDoc(doc(db, "notes", activeMaster.noteId))
      .then((snap) => {
        if (!cancelled && snap.exists()) {
          const data = snap.data();
          setLinkedNote({
            id: snap.id,
            title: data.title || "名称未設定ノート",
            content: data.content || "",
            spaceType: data.spaceType || "document",
            tags: data.tags || [],
            createdAt: typeof data.createdAt === "string" ? data.createdAt : new Date().toISOString(),
            updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : new Date().toISOString(),
          });
        }
      })
      .catch((err) => {
        console.error("[PMExecutionPopover] fetch linked note error:", err);
      });
    return () => {
      cancelled = true;
    };
  }, [activeMaster?.noteId]);

  // Escapeキーで閉じる
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showNotePreview) {
          setShowNotePreview(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, showNotePreview, onClose]);

  // 手順チェックリストの完了状況判定
  const tasks = activeMaster?.taskTemplates || [];
  const totalTasks = tasks.length;
  const isAllTasksCompleted = totalTasks === 0 || completedTaskIds.size === totalTasks;

  // チェックボックストグル
  const handleToggleTask = (taskId: string) => {
    setCompletedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  // 開始 / 開始取消 ボタン処理
  const handleToggleStart = () => {
    if (!startedAt) {
      // 未開始 → 開始時刻記録
      const nowTime = getCurrentTimeStr();
      setStartedAt(nowTime);
    } else {
      // 開始済み → 取消
      setStartedAt(null);
    }
  };

  // Listsへ追加アクション
  const handleAddSingleItemToLists = async (item: PMItemTemplate) => {
    if (addingItemMap[item.id] || addedItemMap[item.id]) return;
    setAddingItemMap((prev) => ({ ...prev, [item.id]: true }));
    try {
      await addItemsToLists([item.itemName]);
      setAddedItemMap((prev) => ({ ...prev, [item.id]: true }));
      showToast(`「${item.itemName}」を買い物リストに追加しました`);
    } catch (err) {
      console.error("[PMExecutionPopover] add item to lists error:", err);
      showToast("買い物リストへの追加に失敗しました");
    } finally {
      setAddingItemMap((prev) => ({ ...prev, [item.id]: false }));
    }
  };

  const handleAddAllItemsToLists = async () => {
    if (!activeMaster?.itemTemplates || activeMaster.itemTemplates.length === 0) return;
    const unadded = activeMaster.itemTemplates.filter((i) => !addedItemMap[i.id]);
    if (unadded.length === 0) return;

    try {
      await addItemsToLists(unadded.map((i) => i.itemName));
      const newAdded: Record<string, boolean> = { ...addedItemMap };
      unadded.forEach((i) => {
        newAdded[i.id] = true;
      });
      setAddedItemMap(newAdded);
      showToast(`${unadded.length}件の購入物を買い物リストに追加しました`);
    } catch (err) {
      console.error("[PMExecutionPopover] add all items error:", err);
      showToast("買い物リストへの一括追加に失敗しました");
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((cur) => (cur === msg ? null : cur));
    }, 3000);
  };

  // 完了ボタン処理（工数計算 & ログ保存 & 次回予定日更新）
  const handleCompleteExecution = async () => {
    if (!activeMaster || !isAllTasksCompleted || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const completedTime = getCurrentTimeStr();
      const logRecord = await recordPMExecution({
        master: activeMaster,
        startedAt: startedAt,
        completedAt: completedTime,
        date: date || todayStr(),
      });

      showToast("PM作業を完了として記録しました");
      if (onCompleted) {
        onCompleted(logRecord);
      }
      setTimeout(() => {
        onClose();
      }, 500);
    } catch (err) {
      console.error("[PMExecutionPopover] complete execution error:", err);
      showToast("完了記録の保存に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  const { shouldRender, isClosing, handleClose } = useModalAnimation({
    isOpen,
    onClose,
  });

  // Escape キーで閉じる
  useEffect(() => {
    if (!shouldRender || isClosing) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [shouldRender, isClosing, handleClose]);

  if (!shouldRender || !activeMaster) return null;

  return (
    <div
      className={`arca-modal-backdrop ${isClosing ? "is-closing" : ""}`}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        backgroundColor: "rgba(0, 0, 0, 0.32)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="PM作業実行パネル"
        className={`arca-modal-window ${isClosing ? "is-closing" : ""}`}
        style={{
          width: "100%",
          maxWidth: "540px",
          maxHeight: "90vh",
          backgroundColor: "#FAF9F6", // アイボリー
          borderRadius: "20px",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 24px 64px -12px rgba(0, 0, 0, 0.22), 0 8px 24px -4px rgba(0, 0, 0, 0.12)",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {/* トースト表示 */}
        {toastMessage && (
          <div
            style={{
              position: "absolute",
              top: "12px",
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 30,
              backgroundColor: "rgba(44, 44, 46, 0.92)",
              backdropFilter: "blur(8px)",
              color: "#FDFCFA",
              padding: "0.4rem 1rem",
              borderRadius: "9999px",
              fontSize: "0.75rem",
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              boxShadow: "0 4px 14px rgba(0,0,0,0.18)",
              pointerEvents: "none",
            }}
          >
            <Check size={13} strokeWidth={2.5} style={{ color: "#85E0A3" }} />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* ヘッダーエリア */}
        <div
          style={{
            padding: "1.1rem 1.35rem 0.9rem",
            backgroundColor: "#FFFFFF",
            borderBottom: "1px solid rgba(0, 0, 0, 0.05)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "0.75rem",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* 上部タグ群 */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem", flexWrap: "wrap" }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.3rem",
                  fontSize: "0.7rem",
                  fontWeight: 650,
                  color: "#C5A059",
                  backgroundColor: "rgba(197, 160, 89, 0.12)",
                  padding: "0.15rem 0.55rem",
                  borderRadius: "6px",
                  letterSpacing: "0.02em",
                }}
              >
                <RotateCw size={11} strokeWidth={2.2} />
                <span>周期保全実行</span>
              </span>

              {/* 実施日バッジ */}
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.25rem",
                  fontSize: "0.7rem",
                  color: C.charcoalMid,
                  backgroundColor: "rgba(0, 0, 0, 0.04)",
                  padding: "0.15rem 0.5rem",
                  borderRadius: "6px",
                }}
              >
                <Calendar size={11} />
                <span>{date}</span>
              </span>

              {/* 目安工数バッジ */}
              {activeMaster.estimatedMinutes !== undefined && activeMaster.estimatedMinutes !== null && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.25rem",
                    fontSize: "0.7rem",
                    color: C.charcoalMid,
                    backgroundColor: "rgba(0, 0, 0, 0.04)",
                    padding: "0.15rem 0.5rem",
                    borderRadius: "6px",
                  }}
                >
                  <Clock size={11} />
                  <span>目安 {activeMaster.estimatedMinutes}分</span>
                </span>
              )}
            </div>

            {/* タイトル */}
            <h2
              style={{
                fontSize: "1.08rem",
                fontWeight: 700,
                color: C.charcoal,
                margin: 0,
                letterSpacing: "-0.01em",
                lineHeight: 1.3,
                wordBreak: "break-word",
              }}
            >
              {activeMaster.title}
            </h2>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
            {onOpenMaster && (
              <button
                type="button"
                onClick={() => onOpenMaster(activeMaster.id)}
                title="台帳で定義を編集"
                style={{
                  background: "transparent",
                  border: "none",
                  padding: "0.35rem",
                  borderRadius: "8px",
                  color: C.charcoalLight,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "background 0.15s ease",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(0,0,0,0.05)")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
              >
                <ExternalLink size={16} />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              title="閉じる"
              style={{
                background: "transparent",
                border: "none",
                padding: "0.35rem",
                borderRadius: "8px",
                color: C.charcoalLight,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "background 0.15s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(0,0,0,0.05)")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* 複数PMマスタがある場合のタブセレクタ */}
        {availableMasters.length > 1 && (
          <div
            style={{
              padding: "0.4rem 1.35rem",
              backgroundColor: "#F4F3F0",
              borderBottom: "1px solid rgba(0, 0, 0, 0.05)",
              display: "flex",
              gap: "0.4rem",
              overflowX: "auto",
            }}
          >
            {availableMasters.map((m) => {
              const isSelected = m.id === selectedMasterId;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelectedMasterId(m.id)}
                  style={{
                    background: isSelected ? "#FFFFFF" : "transparent",
                    border: "none",
                    borderRadius: "8px",
                    padding: "0.3rem 0.65rem",
                    fontSize: "0.74rem",
                    fontWeight: isSelected ? 650 : 500,
                    color: isSelected ? C.charcoal : C.charcoalLight,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    boxShadow: isSelected ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                    transition: "all 0.15s ease",
                  }}
                >
                  {m.title}
                </button>
              );
            })}
          </div>
        )}

        {/* スクロールコンテンツ領域 */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "1.1rem 1.35rem",
            display: "flex",
            flexDirection: "column",
            gap: "1.25rem",
          }}
        >
          {/* Aether Core 連携アクション群 */}
          {((activeMaster.itemTemplates && activeMaster.itemTemplates.length > 0) || activeMaster.noteId) && (
            <div
              style={{
                backgroundColor: "#FFFFFF",
                borderRadius: "14px",
                padding: "0.9rem 1rem",
                boxShadow: "0 2px 8px rgba(0, 0, 0, 0.03)",
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
              }}
            >
              {/* 購入物品テンプレート & Listsへ追加 */}
              {activeMaster.itemTemplates && activeMaster.itemTemplates.length > 0 && (
                <div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: "0.45rem",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.76rem", fontWeight: 650, color: C.charcoalMid }}>
                      <ShoppingCart size={13} style={{ color: "#52796F" }} />
                      <span>必要備品・購入物</span>
                    </div>

                    {activeMaster.itemTemplates.length > 1 && (
                      <button
                        type="button"
                        onClick={handleAddAllItemsToLists}
                        style={{
                          background: "none",
                          border: "none",
                          padding: "0.15rem 0.4rem",
                          fontSize: "0.7rem",
                          color: "#52796F",
                          fontWeight: 600,
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.2rem",
                        }}
                      >
                        <Plus size={11} strokeWidth={2.5} />
                        <span>すべてListsへ追加</span>
                      </button>
                    )}
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                    {activeMaster.itemTemplates.map((item) => {
                      const isAdded = !!addedItemMap[item.id];
                      const isAdding = !!addingItemMap[item.id];
                      return (
                        <div
                          key={item.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "0.4rem 0.6rem",
                            borderRadius: "8px",
                            backgroundColor: "rgba(0, 0, 0, 0.025)",
                            fontSize: "0.78rem",
                            color: C.charcoal,
                          }}
                        >
                          <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {item.itemName}
                          </span>

                          <button
                            type="button"
                            onClick={() => handleAddSingleItemToLists(item)}
                            disabled={isAdded || isAdding}
                            style={{
                              background: isAdded ? "rgba(82, 121, 111, 0.12)" : "rgba(0, 0, 0, 0.05)",
                              color: isAdded ? "#52796F" : C.charcoalMid,
                              border: "none",
                              borderRadius: "6px",
                              padding: "0.22rem 0.55rem",
                              fontSize: "0.69rem",
                              fontWeight: 600,
                              cursor: isAdded || isAdding ? "default" : "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.25rem",
                              transition: "all 0.15s ease",
                              flexShrink: 0,
                            }}
                          >
                            {isAdded ? (
                              <>
                                <Check size={11} strokeWidth={2.5} />
                                <span>Lists追加済</span>
                              </>
                            ) : (
                              <>
                                <Plus size={11} strokeWidth={2.5} />
                                <span>Listsへ追加</span>
                              </>
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 関連ノートリンク */}
              {activeMaster.noteId && (
                <div
                  style={{
                    paddingTop: activeMaster.itemTemplates && activeMaster.itemTemplates.length > 0 ? "0.6rem" : "0",
                    borderTop:
                      activeMaster.itemTemplates && activeMaster.itemTemplates.length > 0
                        ? "1px solid rgba(0, 0, 0, 0.05)"
                        : "none",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.76rem", fontWeight: 650, color: C.charcoalMid }}>
                      <BookOpen size={13} style={{ color: "#C5A059" }} />
                      <span>マニュアル / 手順ノート</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowNotePreview(true)}
                      style={{
                        background: "rgba(197, 160, 89, 0.12)",
                        color: "#8C6332",
                        border: "none",
                        borderRadius: "6px",
                        padding: "0.25rem 0.6rem",
                        fontSize: "0.72rem",
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.25rem",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <span>{linkedNote ? linkedNote.title : "ノートを参照"}</span>
                      <ChevronRight size={12} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 実行用手順チェックリスト */}
          <div
            style={{
              backgroundColor: "#FFFFFF",
              borderRadius: "14px",
              padding: "1rem",
              boxShadow: "0 2px 8px rgba(0, 0, 0, 0.03)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "0.75rem",
              }}
            >
              <h3 style={{ fontSize: "0.82rem", fontWeight: 700, color: C.charcoal, margin: 0 }}>
                作業手順チェックリスト
              </h3>
              <span
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 650,
                  color: isAllTasksCompleted ? "#52796F" : C.charcoalLight,
                  backgroundColor: isAllTasksCompleted ? "rgba(82, 121, 111, 0.12)" : "rgba(0, 0, 0, 0.04)",
                  padding: "0.15rem 0.5rem",
                  borderRadius: "9999px",
                }}
              >
                {completedTaskIds.size} / {totalTasks} 完了
              </span>
            </div>

            {tasks.length === 0 ? (
              <div
                style={{
                  padding: "1.25rem",
                  textAlign: "center",
                  fontSize: "0.78rem",
                  color: C.charcoalLight,
                  backgroundColor: "rgba(0, 0, 0, 0.02)",
                  borderRadius: "10px",
                }}
              >
                登録されている手順がありません（そのまま完了できます）
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
                {tasks.map((task, idx) => {
                  const isChecked = completedTaskIds.has(task.id);
                  return (
                    <label
                      key={task.id}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "0.65rem",
                        padding: "0.6rem 0.75rem",
                        borderRadius: "10px",
                        backgroundColor: isChecked ? "rgba(82, 121, 111, 0.04)" : "rgba(0, 0, 0, 0.02)",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                        userSelect: "none",
                      }}
                      onMouseEnter={(e) => {
                        if (!isChecked) e.currentTarget.style.backgroundColor = "rgba(0,0,0,0.04)";
                      }}
                      onMouseLeave={(e) => {
                        if (!isChecked) e.currentTarget.style.backgroundColor = "rgba(0,0,0,0.02)";
                      }}
                    >
                      {/* チェックボックス */}
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleTask(task.id)}
                        style={{ position: "absolute", opacity: 0, width: "1px", height: "1px", pointerEvents: "none" }}
                      />
                      <div
                        style={{
                          width: "18px",
                          height: "18px",
                          borderRadius: "5px",
                          border: isChecked ? "none" : `1.5px solid ${C.charcoalXLight}`,
                          backgroundColor: isChecked ? "#52796F" : "#FFFFFF",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          marginTop: "2px",
                          transition: "all 0.15s ease",
                          boxShadow: isChecked ? "0 2px 5px rgba(82, 121, 111, 0.3)" : "none",
                        }}
                      >
                        {isChecked && <Check size={12} strokeWidth={2.8} style={{ color: "#FFFFFF" }} />}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                          <span
                            style={{
                              fontSize: "0.68rem",
                              fontWeight: 700,
                              color: isChecked ? C.charcoalLight : C.charcoalMid,
                              width: "16px",
                            }}
                          >
                            {idx + 1}.
                          </span>
                          <span
                            style={{
                              fontSize: "0.82rem",
                              lineHeight: 1.45,
                              color: isChecked ? C.charcoalLight : C.charcoal,
                              textDecoration: isChecked ? "line-through" : "none",
                              wordBreak: "break-word",
                            }}
                          >
                            {task.content}
                          </span>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* フッターエリア（ボタンスイッチング・配置仕様、レイアウトシフト防止） */}
        <div
          style={{
            padding: "0.9rem 1.35rem",
            backgroundColor: "#FFFFFF",
            borderTop: "1px solid rgba(0, 0, 0, 0.05)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.75rem",
          }}
        >
          {/* 左側：開始時刻状態表示 */}
          <div style={{ fontSize: "0.75rem", color: C.charcoalLight, display: "flex", alignItems: "center", gap: "0.35rem" }}>
            {startedAt ? (
              <>
                <Clock size={13} style={{ color: "#C5A059" }} />
                <span>開始: <strong>{startedAt}</strong></span>
              </>
            ) : (
              <span>作業開始前に「開始」を押すと工数を自動計測します</span>
            )}
          </div>

          {/* 右下ボタン配置（固定サイズ w-[110px] h-[36px] を厳格に指定） */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0 }}>
            {/* 1. 開始 / 開始取消 ボタン */}
            <button
              type="button"
              onClick={handleToggleStart}
              style={{
                width: "110px",
                height: "36px",
                minWidth: "110px",
                maxWidth: "110px",
                minHeight: "36px",
                maxHeight: "36px",
                boxSizing: "border-box",
                borderRadius: "10px",
                border: "none",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.35rem",
                fontSize: "0.78rem",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s ease",
                backgroundColor: startedAt ? "rgba(0, 0, 0, 0.06)" : "rgba(197, 160, 89, 0.15)",
                color: startedAt ? C.charcoalMid : "#8C6332",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = startedAt
                  ? "rgba(0, 0, 0, 0.1)"
                  : "rgba(197, 160, 89, 0.22)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = startedAt
                  ? "rgba(0, 0, 0, 0.06)"
                  : "rgba(197, 160, 89, 0.15)";
              }}
            >
              {startedAt ? (
                <>
                  <RotateCcw size={13} />
                  <span>開始取消</span>
                </>
              ) : (
                <>
                  <Play size={13} fill="currentColor" />
                  <span>開始</span>
                </>
              )}
            </button>

            {/* 2. 完了 ボタン（点灯ロジック：全チェック完了時にのみアクセントカラーで点灯・アクティブ化） */}
            <button
              type="button"
              onClick={handleCompleteExecution}
              disabled={!isAllTasksCompleted || isSubmitting}
              style={{
                width: "110px",
                height: "36px",
                minWidth: "110px",
                maxWidth: "110px",
                minHeight: "36px",
                maxHeight: "36px",
                boxSizing: "border-box",
                borderRadius: "10px",
                border: "none",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.35rem",
                fontSize: "0.78rem",
                fontWeight: 650,
                cursor: isAllTasksCompleted && !isSubmitting ? "pointer" : "not-allowed",
                transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
                // 点灯ロジック:
                backgroundColor: isAllTasksCompleted
                  ? "#52796F" // セージ（アクティブ）
                  : "rgba(0, 0, 0, 0.06)", // グレーアウト（非活性・低コントラスト）
                color: isAllTasksCompleted
                  ? "#FDFCFA"
                  : C.charcoalXLight,
                boxShadow: isAllTasksCompleted
                  ? "0 4px 12px rgba(82, 121, 111, 0.32), 0 1px 3px rgba(82, 121, 111, 0.2)"
                  : "none",
              }}
              onMouseEnter={(e) => {
                if (isAllTasksCompleted && !isSubmitting) {
                  e.currentTarget.style.backgroundColor = "#466960";
                }
              }}
              onMouseLeave={(e) => {
                if (isAllTasksCompleted && !isSubmitting) {
                  e.currentTarget.style.backgroundColor = "#52796F";
                }
              }}
            >
              <Check size={14} strokeWidth={2.6} />
              <span>{isSubmitting ? "記録中..." : "完了"}</span>
            </button>
          </div>
        </div>

        {/* 関連ノートプレビューダイアログ */}
        {showNotePreview && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 40,
              backgroundColor: "rgba(250, 249, 246, 0.98)",
              backdropFilter: "blur(10px)",
              display: "flex",
              flexDirection: "column",
              animation: "arca-popover-in 0.15s ease",
            }}
          >
            <div
              style={{
                padding: "0.9rem 1.25rem",
                backgroundColor: "#FFFFFF",
                borderBottom: "1px solid rgba(0, 0, 0, 0.06)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                <BookOpen size={16} style={{ color: "#C5A059" }} />
                <h3 style={{ fontSize: "0.92rem", fontWeight: 700, color: C.charcoal, margin: 0 }}>
                  {linkedNote ? linkedNote.title : "ノートプレビュー"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowNotePreview(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  padding: "0.3rem",
                  borderRadius: "6px",
                  color: C.charcoalLight,
                  cursor: "pointer",
                }}
              >
                <X size={18} />
              </button>
            </div>

            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "1.25rem",
                fontSize: "0.85rem",
                lineHeight: 1.65,
                color: C.charcoal,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {linkedNote?.content ? (
                linkedNote.content
              ) : (
                <div style={{ color: C.charcoalLight, textAlign: "center", paddingTop: "2rem" }}>
                  ノートの内容がありません
                </div>
              )}
            </div>

            <div
              style={{
                padding: "0.75rem 1.25rem",
                backgroundColor: "#FFFFFF",
                borderTop: "1px solid rgba(0, 0, 0, 0.06)",
                display: "flex",
                justifyContent: "flex-end",
              }}
            >
              <button
                type="button"
                onClick={() => setShowNotePreview(false)}
                style={{
                  backgroundColor: "rgba(0, 0, 0, 0.06)",
                  border: "none",
                  borderRadius: "8px",
                  padding: "0.4rem 0.9rem",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  color: C.charcoal,
                  cursor: "pointer",
                }}
              >
                閉じる
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
