/**
 * src/components/tasks/PMSettingsModal.tsx
 * Arca — PM計画表・タスク設定モーダル（Apple HIG × Arca 準拠）
 *
 * 設計原則:
 *  - 枠線の完全排除・多層シャドウ・マットゴールド #C5A059
 *  - 1画面に全PMタスクが一覧表示され、タスクごとにシフト連動（休みの初日、出勤日等）を設定
 *  - 広大で快適なメモ・手順入力フィールド（textarea）
 */

import { useState, useEffect, useRef } from "react";
import {
  collection,
  doc,
  addDoc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import type { PMSettings, PMTemplateItem, PMShiftTiming } from "../../types/pm";
import { PM_TIMING_LABELS } from "../../types/pm";
import { C } from "../../lib/designSystem";

// ─────────────────────────────────────────
// インライン SVG アイコン
// ─────────────────────────────────────────

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor" style={{ width: "1rem", height: "1rem" }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  );
}

function TrashIcon({ size = "0.85rem" }: { size?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.75} stroke="currentColor" style={{ width: size, height: size }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor" style={{ width: "0.85rem", height: "0.85rem" }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

function EditIcon({ size = "0.85rem" }: { size?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.75} stroke="currentColor" style={{ width: size, height: size }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
    </svg>
  );
}

// ─────────────────────────────────────────
// Props
// ─────────────────────────────────────────

export interface PMSettingsModalProps {
  isOpen?: boolean;
  settings?: PMSettings;
  templates?: PMTemplateItem[];
  detectedAnchorDate?: string;
  onClose: () => void;
  onSaveSettings?: (settings: Partial<PMSettings>) => Promise<unknown>;
  onSaveTemplate?: (template: Omit<PMTemplateItem, "id"> & { id?: string }) => Promise<unknown>;
  onDeleteTemplate?: (templateId: string) => Promise<unknown>;
}

export function PMSettingsModal({
  isOpen = true,
  settings: _propSettings,
  templates: propTemplates,
  onClose,
  onSaveTemplate,
  onDeleteTemplate,
}: PMSettingsModalProps) {
  const [localTemplates, setLocalTemplates] = useState<PMTemplateItem[]>(propTemplates || []);

  // 編集・追加ステート
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskContent, setTaskContent] = useState("");
  const [taskTiming, setTaskTiming] = useState<PMShiftTiming>("rest_day_1");
  const [intervalDays, setIntervalDays] = useState<number>(7);
  const [customDay, setCustomDay] = useState<number>(1);

  const [isSaving, setIsSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (msg: string) => {
    setToastMsg(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMsg(null), 2500);
  };

  // ── Firestore リアルタイム同期 ──
  useEffect(() => {
    if (!isOpen) return;

    const unsubTemplates = onSnapshot(
      query(collection(db, "pm_templates"), orderBy("order", "asc")),
      (snap) => {
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as PMTemplateItem));
        setLocalTemplates(items);
      }
    );

    return () => unsubTemplates();
  }, [isOpen]);

  useEffect(() => {
    if (propTemplates) setLocalTemplates(propTemplates);
  }, [propTemplates]);

  // Escape キーで閉じる
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isFormOpen) {
          setIsFormOpen(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, isFormOpen, onClose]);

  if (!isOpen) return null;

  // 編集フォームを開く
  const handleOpenEdit = (item: PMTemplateItem) => {
    setEditingId(item.id);
    setTaskTitle(item.title);
    setTaskContent(item.content || "");
    setTaskTiming(item.timing || (item.dayIndex ? "custom_day" : "rest_day_1"));
    setIntervalDays(item.intervalDays || 7);
    setCustomDay(item.dayIndex || 1);
    setIsFormOpen(true);
  };

  // 新規追加フォームを開く
  const handleOpenNew = () => {
    setEditingId(null);
    setTaskTitle("");
    setTaskContent("");
    setTaskTiming("rest_day_1");
    setIntervalDays(7);
    setCustomDay(1);
    setIsFormOpen(true);
  };

  // フォームキャンセル
  const handleCancelForm = () => {
    setIsFormOpen(false);
    setEditingId(null);
    setTaskTitle("");
    setTaskContent("");
  };

  // ── テンプレート保存ハンドラ ──
  const handleSaveTemplate = async () => {
    if (!taskTitle.trim()) return;
    setIsSaving(true);

    try {
      const templateData: Omit<PMTemplateItem, "id"> = {
        title: taskTitle.trim(),
        content: taskContent.trim(),
        timing: taskTiming,
        intervalDays: taskTiming === "interval_days" ? intervalDays : undefined,
        dayIndex: taskTiming === "custom_day" ? customDay : undefined,
        order: editingId
          ? (localTemplates.find((t) => t.id === editingId)?.order ?? 0)
          : localTemplates.length,
      };

      if (editingId) {
        if (onSaveTemplate) {
          await onSaveTemplate({ id: editingId, ...templateData });
        } else {
          await setDoc(doc(db, "pm_templates", editingId), templateData, { merge: true });
        }
        showToast("タスクを更新しました");
      } else {
        if (onSaveTemplate) {
          await onSaveTemplate(templateData);
        } else {
          await addDoc(collection(db, "pm_templates"), {
            ...templateData,
            createdAt: serverTimestamp(),
          });
        }
        showToast("タスクを追加しました");
      }

      handleCancelForm();
    } catch (err) {
      console.error("Failed to save template:", err);
      showToast("保存に失敗しました");
    } finally {
      setIsSaving(false);
    }
  };

  // ── テンプレート削除ハンドラ ──
  const handleDeleteTemplate = async (id: string) => {
    if (!window.confirm("このPMタスクを削除しますか？")) return;
    try {
      if (onDeleteTemplate) {
        await onDeleteTemplate(id);
      } else {
        await deleteDoc(doc(db, "pm_templates", id));
      }
      showToast("タスクを削除しました");
    } catch (err) {
      console.error("Failed to delete template:", err);
      showToast("削除に失敗しました");
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0, 0, 0, 0.35)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="arca-card"
        style={{
          width: "100%",
          maxWidth: "680px",
          maxHeight: "90vh",
          background: "var(--bg-card-solid)",
          borderRadius: C.radiusCardLg,
          border: "1px solid var(--border-subtle)",
          boxShadow: "var(--shadow-modal)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          animation: "arca-modal-in 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* ─── ヘッダー ─── */}
        <div
          style={{
            padding: "1.25rem 1.6rem",
            borderBottom: "1px solid var(--border-subtle)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <span style={{ fontSize: "0.68rem", fontWeight: 700, color: C.goldDark, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              PREVENTIVE MAINTENANCE
            </span>
            <h2 style={{ margin: "0.15rem 0 0", fontSize: "1.25rem", fontWeight: 750, color: C.charcoal, letterSpacing: "-0.02em" }}>
              ⚙ PM計画表・タスク管理
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: "0.4rem",
              borderRadius: "8px",
              color: C.charcoalLight,
            }}
          >
            <XIcon />
          </button>
        </div>

        {/* ─── メインコンテンツ ─── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "1.4rem 1.6rem" }}>
          
          {/* トースト表示 */}
          {toastMsg && (
            <div
              style={{
                marginBottom: "1rem",
                padding: "0.55rem 0.9rem",
                borderRadius: "8px",
                background: C.goldFaint2,
                color: C.goldDark,
                fontSize: "0.78rem",
                fontWeight: 600,
                textAlign: "center",
              }}
            >
              {toastMsg}
            </div>
          )}

          {/* ── タスク追加・編集フォーム ── */}
          {isFormOpen ? (
            <div
              style={{
                background: "rgba(0, 0, 0, 0.02)",
                borderRadius: "16px",
                padding: "1.4rem",
                display: "flex",
                flexDirection: "column",
                gap: "1.1rem",
                marginBottom: "1.5rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: "0.95rem", fontWeight: 700, color: C.charcoal }}>
                  {editingId ? "タスクを編集" : "＋ 新しいPMタスクを追加"}
                </span>
                <button
                  type="button"
                  onClick={handleCancelForm}
                  style={{
                    background: "none",
                    border: "none",
                    fontSize: "0.75rem",
                    color: C.charcoalLight,
                    cursor: "pointer",
                  }}
                >
                  キャンセル
                </button>
              </div>

              {/* タイトル入力 */}
              <div>
                <label style={{ fontSize: "0.78rem", fontWeight: 650, color: C.charcoal, display: "block", marginBottom: "0.35rem" }}>
                  タスクタイトル <span style={{ color: C.danger }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder="例: 風呂場・水回りの徹底洗浄、シーツ交換"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  autoFocus
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "10px",
                    padding: "0.6rem 0.8rem",
                    fontSize: "0.9rem",
                    fontWeight: 600,
                    outline: "none",
                    background: C.white,
                    color: C.charcoal,
                    boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
                  }}
                />
              </div>

              {/* 周期・タイミング設定 */}
              <div>
                <label style={{ fontSize: "0.78rem", fontWeight: 650, color: C.charcoal, display: "block", marginBottom: "0.35rem" }}>
                  実施タイミング（勤務シフト連動 / 周期）
                </label>
                <select
                  value={taskTiming}
                  onChange={(e) => setTaskTiming(e.target.value as PMShiftTiming)}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "10px",
                    padding: "0.6rem 0.8rem",
                    fontSize: "0.85rem",
                    fontWeight: 550,
                    color: C.charcoal,
                    background: C.white,
                    boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
                    outline: "none",
                    cursor: "pointer",
                  }}
                >
                  <option value="rest_day_1">{PM_TIMING_LABELS.rest_day_1}</option>
                  <option value="rest_day_2">{PM_TIMING_LABELS.rest_day_2}</option>
                  <option value="rest_all">{PM_TIMING_LABELS.rest_all}</option>
                  <option value="work_day_1">{PM_TIMING_LABELS.work_day_1}</option>
                  <option value="work_last_day">{PM_TIMING_LABELS.work_last_day}</option>
                  <option value="work_all">{PM_TIMING_LABELS.work_all}</option>
                  <option value="interval_days">{PM_TIMING_LABELS.interval_days}</option>
                  <option value="custom_day">{PM_TIMING_LABELS.custom_day}</option>
                </select>

                {/* インターバル日数設定 */}
                {taskTiming === "interval_days" && (
                  <div style={{ marginTop: "0.6rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={intervalDays}
                      onChange={(e) => setIntervalDays(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      style={{
                        width: "80px",
                        padding: "0.45rem 0.6rem",
                        borderRadius: "8px",
                        border: "1px solid var(--border-subtle)",
                        background: C.white,
                        color: C.charcoal,
                        fontSize: "0.85rem",
                        outline: "none",
                      }}
                    />
                    <span style={{ fontSize: "0.8rem", color: C.charcoalMid }}>日ごとに実施</span>
                  </div>
                )}

                {/* Day番号設定 */}
                {taskTiming === "custom_day" && (
                  <div style={{ marginTop: "0.6rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <input
                      type="number"
                      min={1}
                      max={24}
                      value={customDay}
                      onChange={(e) => setCustomDay(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      style={{
                        width: "80px",
                        padding: "0.45rem 0.6rem",
                        borderRadius: "8px",
                        border: "1px solid var(--border-subtle)",
                        background: C.white,
                        color: C.charcoal,
                        fontSize: "0.85rem",
                        outline: "none",
                      }}
                    />
                    <span style={{ fontSize: "0.8rem", color: C.charcoalMid }}>番目のDayに実施</span>
                  </div>
                )}
              </div>

              {/* 広大な具体的な内容入力欄 */}
              <div>
                <label style={{ fontSize: "0.78rem", fontWeight: 650, color: C.charcoal, display: "block", marginBottom: "0.35rem" }}>
                  具体的な内容・手順・チェック項目・メモ（広めの記述欄）
                </label>
                <textarea
                  placeholder="手順やチェック項目、使用する洗剤、留意点などを自由に詳しく記述できます。&#10;例:&#10;1. 排水口の髪の毛を除去&#10;2. カビキラーをスプレーして5分放置&#10;3. スポンジで床と壁をブラッシング洗浄&#10;4. シャンプー・洗剤のストック残量確認"
                  value={taskContent}
                  onChange={(e) => setTaskContent(e.target.value)}
                  rows={7}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "10px",
                    padding: "0.75rem 0.85rem",
                    fontSize: "0.85rem",
                    lineHeight: 1.6,
                    outline: "none",
                    resize: "vertical",
                    background: C.white,
                    boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
                    color: C.charcoal,
                  }}
                />
              </div>

              {/* フォームアクション */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.6rem" }}>
                <button
                  type="button"
                  onClick={handleCancelForm}
                  style={{
                    background: "none",
                    border: "none",
                    padding: "0.5rem 1rem",
                    fontSize: "0.8rem",
                    color: C.charcoalLight,
                    cursor: "pointer",
                  }}
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={handleSaveTemplate}
                  disabled={!taskTitle.trim() || isSaving}
                  style={{
                    background: taskTitle.trim() ? C.gold : "rgba(0,0,0,0.06)",
                    color: taskTitle.trim() ? "#FDFCFA" : C.charcoalXLight,
                    border: "none",
                    borderRadius: "10px",
                    padding: "0.55rem 1.3rem",
                    fontSize: "0.82rem",
                    fontWeight: 650,
                    cursor: taskTitle.trim() && !isSaving ? "pointer" : "default",
                    boxShadow: taskTitle.trim() ? "0 2px 8px rgba(197, 160, 89, 0.28)" : "none",
                  }}
                >
                  {isSaving ? "保存中…" : editingId ? "変更を保存する" : "タスクを追加する"}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ marginBottom: "1.2rem", display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={handleOpenNew}
                style={{
                  background: C.gold,
                  color: "#FDFCFA",
                  border: "none",
                  borderRadius: "10px",
                  padding: "0.55rem 1.1rem",
                  fontSize: "0.8rem",
                  fontWeight: 650,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  boxShadow: "0 2px 8px rgba(197, 160, 89, 0.25)",
                }}
              >
                <PlusIcon />
                <span>新しいPMタスクを追加</span>
              </button>
            </div>
          )}

          {/* ── タスク一覧カードリスト ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {localTemplates.length === 0 && !isFormOpen ? (
              <div style={{ textAlign: "center", padding: "2.5rem 1rem" }}>
                <p style={{ margin: 0, fontSize: "0.9rem", fontWeight: 650, color: C.charcoal }}>
                  登録されたPMタスクがありません
                </p>
                <p style={{ margin: "0.3rem 0 1rem", fontSize: "0.76rem", color: C.charcoalLight }}>
                  休日の初日や出勤日に行うPMタスクを登録してください
                </p>
              </div>
            ) : (
              localTemplates.map((item) => {
                const timingLabel = item.timing
                  ? PM_TIMING_LABELS[item.timing]
                  : item.dayIndex
                  ? `Day ${item.dayIndex}`
                  : PM_TIMING_LABELS.rest_day_1;

                return (
                  <div
                    key={item.id}
                    className="arca-card"
                    onClick={() => handleOpenEdit(item)}
                    style={{
                      background: "var(--bg-card-solid)",
                      borderRadius: "14px",
                      border: "1px solid var(--border-subtle)",
                      padding: "1rem 1.15rem",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.5rem",
                      boxShadow: "var(--shadow-card)",
                      cursor: "pointer",
                      transition: "transform 0.15s ease, box-shadow 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)";
                      (e.currentTarget as HTMLDivElement).style.boxShadow = C.cardShadowHover;
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
                      (e.currentTarget as HTMLDivElement).style.boxShadow = "0 1px 4px rgba(0,0,0,0.03), 0 4px 16px rgba(0,0,0,0.02)";
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.75rem" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                          <span
                            style={{
                              fontSize: "0.68rem",
                              fontWeight: 700,
                              color: C.goldDark,
                              background: C.goldFaint,
                              padding: "0.15rem 0.55rem",
                              borderRadius: "9999px",
                            }}
                          >
                            ✦ {timingLabel}
                          </span>
                        </div>
                        <h4 style={{ margin: "0.15rem 0 0", fontSize: "0.92rem", fontWeight: 700, color: C.charcoal }}>
                          {item.title}
                        </h4>
                      </div>

                      {/* アクションボタン */}
                      <div
                        style={{ display: "flex", gap: "0.3rem", flexShrink: 0 }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(item)}
                          style={{
                            background: "transparent",
                            border: "none",
                            padding: "0.35rem",
                            cursor: "pointer",
                            color: C.charcoalLight,
                            borderRadius: "6px",
                          }}
                          title="編集"
                        >
                          <EditIcon />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteTemplate(item.id)}
                          style={{
                            background: "transparent",
                            border: "none",
                            padding: "0.35rem",
                            cursor: "pointer",
                            color: C.danger,
                            borderRadius: "6px",
                          }}
                          title="削除"
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </div>

                    {/* 具体的な内容プレビュー */}
                    {item.content && (
                      <p
                        style={{
                          margin: 0,
                          fontSize: "0.78rem",
                          color: C.charcoalMid,
                          lineHeight: 1.5,
                          whiteSpace: "pre-wrap",
                          display: "-webkit-box",
                          WebkitLineClamp: 3,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {item.content}
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
