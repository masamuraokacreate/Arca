/**
 * src/components/pm/PMMasterModal.tsx
 * Arca — PM（周期保全・管理台帳）マスタ管理モーダル (2ペイン構成)
 *
 * 設計原則:
 *  - 左ペイン（幅固定）：検索バー、並び替え、＋新規PM作成ボタン、PMカード一覧
 *  - 中央〜右（ワイド詳細）：基本設定・周期設定、Aether Core連携、手順リスト、過去のログ
 *  - 絵文字完全禁止、Lucide React アイコンのみ使用
 *  - Apple HIG & Core/Rules.md 準拠、枠線完全排除と多層シャドウ、マットゴールド #C5A059
 */

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Search,
  Trash2,
  BookOpen,
  X,
  ChevronUp,
  ChevronDown,
  RotateCw,
  Sparkles,
} from "lucide-react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { C } from "../../lib/designSystem";
import type {
  PMMaster,
  PMItemTemplate,
  PMTaskTemplate,
  PMMasterLog,
  PMCycleType,
  PMCalcBasis,
  PMTimingCategory,
  PMSettings,
  PMSchedulePreview,
} from "../../types/pm";
import type { NoteItem, CalendarEvent } from "../../types";
import {
  subscribePMMasters,
  savePMMaster,
  deletePMMaster,
  subscribePMMasterLogs,
  calculateNextScheduledDate,
  calculateFuturePMSchedules,
  todayStr,
  DEFAULT_PM_MASTERS,
} from "../../services/pmMasterService";
import { generatePMTasksWithAI } from "../../services/pmTaskAiService";
import { ConfirmModal } from "../notes/ConfirmModal";

export interface PMMasterModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSelectedMasterId?: string | null;
  events?: CalendarEvent[];
  settings?: PMSettings | null;
}

type SortOrder = "next_date" | "cycle" | "title" | "recent";

export function PMMasterModal({
  isOpen,
  onClose,
  initialSelectedMasterId,
  events = [],
  settings,
}: PMMasterModalProps) {
  // 開閉アニメーション用ステート (Core/Rules/Motion.md)
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isClosing, setIsClosing] = useState(false);
  const closingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // コンポーネント破棄時にタイマーをクリーンアップ
  useEffect(() => {
    return () => {
      if (closingTimerRef.current) clearTimeout(closingTimerRef.current);
    };
  }, []);

  // 滑らかな閉じるハンドラ（180msのExitアニメーション完了後にonCloseを実行）
  const handleClose = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    if (closingTimerRef.current) clearTimeout(closingTimerRef.current);
    closingTimerRef.current = setTimeout(() => {
      onClose();
      setShouldRender(false);
      setIsClosing(false);
    }, 180);
  }, [isClosing, onClose]);

  // 親からの isOpen 変化のみを監視・追従（内部の handleClose 実行中の打ち消しを防ぐ）
  const prevIsOpenRef = useRef(isOpen);
  useEffect(() => {
    if (prevIsOpenRef.current !== isOpen) {
      prevIsOpenRef.current = isOpen;
      if (isOpen) {
        // 新規オープン
        if (closingTimerRef.current) clearTimeout(closingTimerRef.current);
        setShouldRender(true);
        setIsClosing(false);
      } else {
        // 親側から外部要因で閉じられた場合
        if (shouldRender && !isClosing) {
          setIsClosing(true);
          if (closingTimerRef.current) clearTimeout(closingTimerRef.current);
          closingTimerRef.current = setTimeout(() => {
            setShouldRender(false);
            setIsClosing(false);
          }, 180);
        }
      }
    }
  }, [isOpen, shouldRender, isClosing]);

  // PMマスタ一覧
  const [masters, setMasters] = useState<PMMaster[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // 検索・並び替え
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<SortOrder>("next_date");

  // 選択中マスタの編集用フォームステート
  const [title, setTitle] = useState("");
  const [cycleType, setCycleType] = useState<PMCycleType>("shift_cycle");
  const [cycleValue, setCycleValue] = useState<number>(1);
  const [timingCategory, setTimingCategory] = useState<PMTimingCategory>("holiday");
  const [timingDay, setTimingDay] = useState<number>(1);
  const [cycleInterval, setCycleInterval] = useState<number>(1);
  const [calcBasis, setCalcBasis] = useState<PMCalcBasis>("fixed_date");
  const [estimatedMinutes, setEstimatedMinutes] = useState<string>("");
  const [noteId, setNoteId] = useState<string>("");
  const [items, setItems] = useState<PMItemTemplate[]>([]);
  const [tasks, setTasks] = useState<PMTaskTemplate[]>([]);
  const [newItemName, setNewItemName] = useState("");
  const [newTaskContent, setNewTaskContent] = useState("");
  const [baseDate, setBaseDate] = useState<string>("");

  // AI手順自動要約・生成ステート (Gemini API)
  const [isAiCardOpen, setIsAiCardOpen] = useState(false);
  const [aiInputText, setAiInputText] = useState("");
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiPreviewTasks, setAiPreviewTasks] = useState<string[]>([]);

  // 過去ログ
  const [logs, setLogs] = useState<PMMasterLog[]>([]);

  // 関連ノート一覧（Notesモジュール連携用）
  const [notesList, setNotesList] = useState<NoteItem[]>([]);

  // 保存ステータス
  const [saving, setSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // 独自削除確認モーダル用ステート
  const [deletingMaster, setDeletingMaster] = useState<PMMaster | null>(null);

  // 1. PMマスタリアルタイム同期
  useEffect(() => {
    if (!shouldRender) return;
    const unsub = subscribePMMasters((list) => {
      setMasters(list);
      // 初期データが空の場合はサンプルの投入を促す、またはそのまま
      if (list.length > 0 && !selectedId) {
        if (initialSelectedMasterId && list.some((m) => m.id === initialSelectedMasterId)) {
          setSelectedId(initialSelectedMasterId);
        }
      }
    });
    return () => unsub();
  }, [shouldRender, initialSelectedMasterId]);

  // 2. Notes一覧リアルタイム同期（Aether Core連携）
  useEffect(() => {
    if (!shouldRender) return;
    const q = query(collection(db, "notes"), orderBy("updatedAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const fetched: NoteItem[] = [];
        snap.forEach((d) => {
          const data = d.data();
          if (!data.isDeleted) {
            fetched.push({ id: d.id, ...data } as NoteItem);
          }
        });
        setNotesList(fetched);
      },
      () => setNotesList([])
    );
    return () => unsub();
  }, [shouldRender]);

  // 3. 選択中マスタのログ同期
  useEffect(() => {
    if (!shouldRender || !selectedId) {
      setLogs([]);
      return;
    }
    const unsub = subscribePMMasterLogs(selectedId, setLogs);
    return () => unsub();
  }, [shouldRender, selectedId]);

  // 選択されたマスタが切り替わったときのフォーム初期化
  const selectedMaster = useMemo(() => {
    return masters.find((m) => m.id === selectedId) || null;
  }, [masters, selectedId]);

  useEffect(() => {
    if (selectedMaster) {
      setTitle(selectedMaster.title);
      setCycleType(selectedMaster.cycleType);
      setCycleValue(selectedMaster.cycleValue);
      setCalcBasis(selectedMaster.calcBasis);
      setTimingCategory(selectedMaster.timingCategory || "holiday");
      setTimingDay(selectedMaster.timingDay || 1);
      setCycleInterval(selectedMaster.cycleInterval || 1);
      setEstimatedMinutes(
        selectedMaster.estimatedMinutes !== undefined && selectedMaster.estimatedMinutes !== null
          ? String(selectedMaster.estimatedMinutes)
          : ""
      );
      setNoteId(selectedMaster.noteId || "");
      setItems(selectedMaster.itemTemplates || []);
      setTasks(selectedMaster.taskTemplates || []);
      setNewItemName("");
      setNewTaskContent("");
      setBaseDate(selectedMaster.nextScheduledDate || todayStr());
      setIsAiCardOpen(false);
      setAiInputText("");
      setAiPreviewTasks([]);
      setAiError(null);
    } else {
      setTitle("");
      setItems([]);
      setTasks([]);
      setBaseDate(todayStr());
      setIsAiCardOpen(false);
      setAiInputText("");
      setAiPreviewTasks([]);
      setAiError(null);
    }
  }, [selectedMaster]);

  // リアルタイム次回・次々回予定プレビュー算出（周期・タイミング・基準日変更に即座追従）
  const schedulePreview = useMemo<PMSchedulePreview | null>(() => {
    if (!baseDate) return null;
    const isShift = cycleType === "shift_cycle";
    return calculateFuturePMSchedules(
      baseDate,
      {
        cycleType,
        cycleValue: Number(cycleValue) || 1,
        calcBasis,
        timingCategory: isShift ? timingCategory : undefined,
        timingDay: isShift ? Number(timingDay) || 1 : undefined,
        cycleInterval: isShift ? Number(cycleInterval) || 1 : undefined,
      },
      events,
      settings
    );
  }, [baseDate, cycleType, cycleValue, calcBasis, timingCategory, timingDay, cycleInterval, events, settings]);

  // Escapeキーで閉じる（滑らかなトランジション連動）
  useEffect(() => {
    if (!shouldRender || isClosing) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [shouldRender, isClosing, handleClose]);

  // 検索・ソートされたマスタ一覧
  const filteredMasters = useMemo(() => {
    let result = masters.filter((m) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const matchTitle = m.title.toLowerCase().includes(q);
      const matchItems = (m.itemTemplates || []).some((i) => i.itemName.toLowerCase().includes(q));
      const matchTasks = (m.taskTemplates || []).some((t) => t.content.toLowerCase().includes(q));
      return matchTitle || matchItems || matchTasks;
    });

    result.sort((a, b) => {
      if (sortOrder === "next_date") {
        return (a.nextScheduledDate || "9999").localeCompare(b.nextScheduledDate || "9999");
      }
      if (sortOrder === "cycle") {
        return a.cycleType.localeCompare(b.cycleType) || a.cycleValue - b.cycleValue;
      }
      if (sortOrder === "title") {
        return a.title.localeCompare(b.title, "ja");
      }
      if (sortOrder === "recent") {
        return (b.lastCompletedAt || "").localeCompare(a.lastCompletedAt || "");
      }
      return 0;
    });

    return result;
  }, [masters, searchQuery, sortOrder]);

  if (!shouldRender) return null;

  // ── 新規作成ハンドラ ──
  const handleCreateNew = async () => {
    const newTitle = "";
    const newId = await savePMMaster({
      title: newTitle,
      cycleType: "shift_cycle",
      cycleValue: 1,
      timingCategory: "holiday",
      timingDay: 1,
      cycleInterval: 1,
      calcBasis: "fixed_date",
      estimatedMinutes: 30,
      itemTemplates: [],
      taskTemplates: [
        { id: `task-${Date.now()}-1`, masterId: "", content: "手順1を入力", sortOrder: 1 },
      ],
    });
    setSelectedId(newId);
  };

  // サンプルデータの投入
  const handleSeedDefaults = async () => {
    for (const d of DEFAULT_PM_MASTERS) {
      await savePMMaster(d);
    }
  };

  // ── 保存ハンドラ ──
  const handleSave = async () => {
    if (!selectedId || !title.trim()) return;
    setSaving(true);
    try {
      const isShift = cycleType === "shift_cycle";
      await savePMMaster({
        id: selectedId,
        title: title.trim(),
        cycleType,
        cycleValue: Number(cycleValue) || 1,
        timingCategory: isShift ? timingCategory : undefined,
        timingDay: isShift ? Number(timingDay) || 1 : undefined,
        cycleInterval: isShift ? Number(cycleInterval) || 1 : undefined,
        calcBasis,
        estimatedMinutes: estimatedMinutes ? Number(estimatedMinutes) : undefined,
        noteId: noteId || undefined,
        itemTemplates: items,
        taskTemplates: tasks,
        createdAt: selectedMaster?.createdAt,
        nextScheduledDate:
          schedulePreview?.nextDate ||
          calculateNextScheduledDate(
            {
              cycleType,
              cycleValue: Number(cycleValue) || 1,
              timingCategory: isShift ? timingCategory : undefined,
              timingDay: isShift ? Number(timingDay) || 1 : undefined,
              cycleInterval: isShift ? Number(cycleInterval) || 1 : undefined,
              calcBasis,
              lastCompletedAt: selectedMaster?.lastCompletedAt,
              nextScheduledDate: selectedMaster?.nextScheduledDate,
            },
            baseDate || undefined,
            events,
            settings
          ),
      });
      setToastMsg("管理台帳を更新しました");
      setTimeout(() => setToastMsg(null), 2500);
    } catch (err) {
      console.error("Failed to save PM master:", err);
    } finally {
      setSaving(false);
    }
  };

  // ── 削除ハンドラ ──
  const handleDelete = () => {
    if (!selectedMaster) return;
    setDeletingMaster(selectedMaster);
  };

  const confirmDeleteMaster = async () => {
    if (!deletingMaster) return;
    try {
      await deletePMMaster(deletingMaster.id);
      if (selectedId === deletingMaster.id) {
        setSelectedId(null);
      }
      setToastMsg("PM管理台帳を削除しました");
      setTimeout(() => setToastMsg(null), 2500);
    } catch (err) {
      console.error("Failed to delete PM master:", err);
    } finally {
      setDeletingMaster(null);
    }
  };

  // ── 購入物テンプレートの追加・削除 ──
  const handleAddItem = () => {
    if (!newItemName.trim() || !selectedId) return;
    const newItem: PMItemTemplate = {
      id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      masterId: selectedId,
      itemName: newItemName.trim(),
    };
    setItems((prev) => [...prev, newItem]);
    setNewItemName("");
  };

  const handleRemoveItem = (itemId: string) => {
    setItems((prev) => prev.filter((i) => i.id !== itemId));
  };

  // ── 手順マスタの追加・削除・並び替え ──
  const handleAddTask = () => {
    if (!newTaskContent.trim() || !selectedId) return;
    const newTask: PMTaskTemplate = {
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      masterId: selectedId,
      content: newTaskContent.trim(),
      sortOrder: tasks.length + 1,
    };
    setTasks((prev) => [...prev, newTask]);
    setNewTaskContent("");
  };

  const handleRemoveTask = (taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  };

  const handleMoveTask = (index: number, direction: "up" | "down") => {
    const newTasks = [...tasks];
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= newTasks.length) return;
    const temp = newTasks[index];
    newTasks[index] = newTasks[targetIdx];
    newTasks[targetIdx] = temp;
    // sortOrder を再採番
    newTasks.forEach((t, i) => {
      t.sortOrder = i + 1;
    });
    setTasks(newTasks);
  };

  // ── AI自動要約・手順生成ハンドラ (Gemini API) ──
  const handleGenerateAiTasks = async () => {
    if (!aiInputText.trim() || isAiGenerating) return;
    setIsAiGenerating(true);
    setAiError(null);
    setAiPreviewTasks([]);
    try {
      const generated = await generatePMTasksWithAI(aiInputText);
      if (generated.length === 0) {
        setAiError("手順を抽出できませんでした。もう少し具体的な作業文章を入力してください。");
      } else {
        setAiPreviewTasks(generated);
      }
    } catch (err: unknown) {
      console.error("AIタスク生成エラー:", err);
      const msg = err instanceof Error ? err.message : "手順の生成に失敗しました。";
      setAiError(msg);
    } finally {
      setIsAiGenerating(false);
    }
  };

  const handleApplyAiTasks = (mode: "replace" | "append") => {
    if (aiPreviewTasks.length === 0 || !selectedId) return;
    const newTemplates: PMTaskTemplate[] = aiPreviewTasks.map((content, idx) => ({
      id: `task-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
      masterId: selectedId,
      content,
      sortOrder: mode === "replace" ? idx + 1 : tasks.length + idx + 1,
    }));

    if (mode === "replace") {
      setTasks(newTemplates);
    } else {
      setTasks((prev) => [...prev, ...newTemplates]);
    }
    setAiPreviewTasks([]);
    setAiInputText("");
    setIsAiCardOpen(false);
    setToastMsg("AI生成手順を反映しました");
    setTimeout(() => setToastMsg(null), 2500);
  };

  // 周期表示文字列のヘルパー
  const formatCycleBadge = (m: PMMaster) => {
    switch (m.cycleType) {
      case "shift_cycle": {
        const catMap: Record<string, string> = {
          holiday: "休日",
          early_shift: "早番",
          late_shift: "遅番",
          work_day: "出勤",
        };
        const cat = catMap[m.timingCategory || "holiday"] || "勤務";
        const day = m.timingDay ? `${m.timingDay}日目` : "";
        const interval = m.cycleInterval && m.cycleInterval > 1 ? `(${m.cycleInterval}周期)` : "";
        return `${cat}${day}${interval}`;
      }
      case "monthly_day":
        return `毎月${m.cycleValue}日`;
      case "interval_month":
        return `${m.cycleValue}ヶ月毎`;
      case "annual":
        return `年1回`;
      case "interval_days":
        return `${m.cycleValue}日毎`;
      default:
        return "定期保全";
    }
  };

  return (
    <div
      onClick={handleClose}
      className={`fixed inset-0 z-[1200] flex items-center justify-center p-3 sm:p-6 pm-modal-backdrop ${
        isClosing ? "is-closing" : ""
      }`}
      style={{
        background: "rgba(35, 34, 30, 0.42)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
      }}
      role="dialog"
      aria-modal="true"
      aria-label="PM管理マスター"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`arca-card flex flex-col w-full max-w-5xl h-[92vh] max-h-[860px] overflow-hidden pm-modal-window ${
          isClosing ? "is-closing" : ""
        }`}
        style={{
          background: "var(--bg-card-solid)",
          boxShadow: "0 28px 70px rgba(0,0,0,0.25), 0 4px 20px rgba(0,0,0,0.1)",
          borderRadius: "24px",
          border: "1px solid var(--border-subtle)",
        }}
      >
        {/* ─── モーダルヘッダー ─── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "1.1rem 1.6rem",
            borderBottom: "1px solid rgba(0,0,0,0.05)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <div
              className="pm-master-header-icon"
              style={{
                width: "2.1rem",
                height: "2.1rem",
                borderRadius: "10px",
                background: C.goldFaint,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: C.goldDark,
              }}
            >
              <RotateCw size={18} />
            </div>
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: "1.18rem",
                  fontWeight: 750,
                  letterSpacing: "-0.02em",
                  color: "var(--text-main)",
                }}
              >
                PM管理マスター
              </h2>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            {toastMsg && (
              <span
                style={{
                  fontSize: "0.75rem",
                  color: C.sage,
                  fontWeight: 600,
                  background: "rgba(82, 121, 111, 0.1)",
                  padding: "0.25rem 0.6rem",
                  borderRadius: "6px",
                  animation: "pm-overlay-in 0.15s ease",
                }}
              >
                {toastMsg}
              </span>
            )}
            <button
              type="button"
              onClick={handleClose}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: "0.35rem",
                borderRadius: "8px",
                color: C.charcoalLight,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              aria-label="閉じる"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ─── 2ペイン本体 ─── */}
        <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>
          
          {/* ══════════════════════════════════════════════════
              左ペイン（操作・一覧部 / 幅固定 300px）
             ══════════════════════════════════════════════════ */}
          <div
            style={{
              width: "300px",
              minWidth: "300px",
              maxWidth: "300px",
              borderRight: "1px solid rgba(0,0,0,0.06)",
              display: "flex",
              flexDirection: "column",
              background: "var(--bg-nav-track)",
              padding: "1rem",
              boxSizing: "border-box",
              gap: "0.6rem",
            }}
          >
            {/* 1. 最上部: 検索バー（カードと同幅） */}
            <div
              style={{
                position: "relative",
                width: "100%",
                boxSizing: "border-box",
              }}
            >
              <Search
                size={14}
                style={{
                  position: "absolute",
                  left: "0.65rem",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: C.charcoalLight,
                }}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="PM台帳を検索…"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "0.48rem 0.65rem 0.48rem 2rem",
                  fontSize: "0.78rem",
                  borderRadius: "10px",
                  border: "none",
                  background: "var(--bg-card-solid)",
                  color: "var(--text-main)",
                  outline: "none",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                }}
              />
            </div>

            {/* 2. 直下: 並び替えセレクトボタン（カードと同幅） */}
            <div style={{ width: "100%", position: "relative" }}>
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as SortOrder)}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "0.45rem 0.65rem",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  borderRadius: "10px",
                  border: "none",
                  background: "var(--bg-card-solid)",
                  color: "var(--text-main)",
                  cursor: "pointer",
                  outline: "none",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                }}
              >
                <option value="next_date">次回予定日順</option>
                <option value="cycle">周期順</option>
                <option value="title">タイトル順</option>
                <option value="recent">最終実施日順</option>
              </select>
            </div>

            {/* 3. 直下: ＋ 新規PM作成ボタン（カードと同幅・ここだけに配置） */}
            <button
              type="button"
              onClick={handleCreateNew}
              data-testid="pm-create-new-btn"
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "0.52rem 0.75rem",
                borderRadius: "10px",
                border: "none",
                background: C.gold,
                color: "#FDFCFA",
                fontSize: "0.78rem",
                fontWeight: 700,
                letterSpacing: "0.02em",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.4rem",
                boxShadow: "0 2px 8px rgba(197, 160, 89, 0.28)",
                transition: "opacity 0.15s ease",
              }}
            >
              <span>＋新規作成</span>
            </button>

            {/* 4. PMカード一覧スクロール部 */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: "0.45rem",
                marginTop: "0.3rem",
                paddingRight: "0.15rem",
              }}
              className="no-scrollbar"
            >
              {filteredMasters.length === 0 ? (
                <div style={{ textAlign: "center", padding: "2rem 0.5rem", color: C.charcoalLight, fontSize: "0.75rem" }}>
                  <p style={{ margin: 0 }}>台帳が見つかりません</p>
                  {masters.length === 0 && (
                    <button
                      type="button"
                      onClick={handleSeedDefaults}
                      style={{
                        marginTop: "0.75rem",
                        background: "transparent",
                        border: "none",
                        color: C.goldDark,
                        fontSize: "0.75rem",
                        cursor: "pointer",
                        textDecoration: "underline",
                      }}
                    >
                      標準サンプルを登録する
                    </button>
                  )}
                </div>
              ) : (
                filteredMasters.map((m) => {
                  const isSelected = m.id === selectedId;
                  return (
                    <div
                      key={m.id}
                      onClick={() => setSelectedId(m.id)}
                      data-testid={`pm-card-${m.id}`}
                      className={`pm-card-item ${
                        isSelected
                          ? "bg-white dark:bg-white/[0.14] shadow-xs dark:shadow-none ring-1 ring-black/[0.04] dark:ring-white/[0.08]"
                          : "bg-black/[0.03] dark:bg-white/[0.04] hover:bg-black/[0.05] dark:hover:bg-white/[0.07]"
                      }`}
                      style={{
                        padding: "0.65rem 0.8rem",
                        borderRadius: "12px",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.25rem" }}>
                        <span
                          className={
                            isSelected
                              ? "bg-amber-500/15 text-amber-900 dark:bg-amber-400/25 dark:text-amber-200"
                              : "bg-black/[0.04] dark:bg-white/[0.08] text-stone-600 dark:text-stone-400"
                          }
                          style={{
                            fontSize: "0.65rem",
                            fontWeight: 700,
                            padding: "0.15rem 0.4rem",
                            borderRadius: "5px",
                          }}
                        >
                          {formatCycleBadge(m)}
                        </span>
                        {m.nextScheduledDate && (
                          <span
                            className="text-stone-500 dark:text-stone-400"
                            style={{ fontSize: "0.68rem", fontWeight: 500 }}
                          >
                            次回: {m.nextScheduledDate.slice(5)}
                          </span>
                        )}
                      </div>

                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.4rem" }}>
                        <p
                          className={
                            isSelected
                              ? "text-stone-900 dark:text-stone-100 font-bold"
                              : "text-stone-700 dark:text-stone-300 font-semibold"
                          }
                          style={{
                            margin: 0,
                            fontSize: "0.82rem",
                            lineHeight: 1.3,
                            flex: 1,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            fontStyle: m.title.trim() ? "normal" : "italic",
                            opacity: m.title.trim() ? 1 : 0.65,
                          }}
                        >
                          {m.title.trim() ? m.title : "名称未設定"}
                        </p>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeletingMaster(m);
                          }}
                          data-testid={`pm-card-delete-btn-${m.id}`}
                          title="この台帳を削除"
                          style={{
                            background: "transparent",
                            border: "none",
                            padding: "0.2rem",
                            borderRadius: "6px",
                            cursor: "pointer",
                            color: C.charcoalLight,
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            transition: "all 0.15s ease",
                            flexShrink: 0,
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = C.danger;
                            e.currentTarget.style.backgroundColor = "rgba(224, 86, 74, 0.1)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = C.charcoalLight;
                            e.currentTarget.style.backgroundColor = "transparent";
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* ══════════════════════════════════════════════════
              中央〜右（ワイド詳細ペイン）
             ══════════════════════════════════════════════════ */}
          <div
            style={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              overflowY: "auto",
              padding: "1.5rem 1.8rem 2rem",
              boxSizing: "border-box",
            }}
          >
            {!selectedMaster ? (
              // 未選択時の表示（指示書の要件文言）
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: "360px",
                }}
              >
                <p
                  style={{
                    color: C.charcoalLight,
                    fontSize: "0.78rem",
                    fontWeight: 500,
                    letterSpacing: "0.02em",
                  }}
                >
                  右のタスクをクリックして詳細を表示
                </p>
              </div>
            ) : (
              // 選択時の詳細フォーム
              <div style={{ display: "flex", flexDirection: "column", gap: "1.4rem" }}>
                
                {/* 1. 基本設定・周期設定 */}
                <div
                  style={{
                    background: "var(--bg-nav-track)",
                    borderRadius: "16px",
                    padding: "1.2rem",
                    display: "flex",
                    flexDirection: "column",
                    gap: "1rem",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem" }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: "block", fontSize: "0.7rem", fontWeight: 700, color: C.charcoalLight, marginBottom: "0.3rem" }}>
                        タイトル
                      </label>
                      <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="例: 洗濯槽クリーナー洗浄、フィルター交換"
                        style={{
                          width: "100%",
                          boxSizing: "border-box",
                          fontSize: "1.05rem",
                          fontWeight: 700,
                          color: "var(--text-main)",
                          background: "var(--bg-card-solid)",
                          border: "none",
                          borderRadius: "10px",
                          padding: "0.55rem 0.8rem",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                          outline: "none",
                        }}
                      />
                    </div>

                    <div style={{ display: "flex", gap: "0.6rem", alignItems: "center" }}>
                      <button
                        type="button"
                        onClick={handleDelete}
                        style={{
                          background: "transparent",
                          border: "none",
                          padding: "0.45rem",
                          color: C.charcoalLight,
                          cursor: "pointer",
                          borderRadius: "8px",
                        }}
                        title="この台帳を削除"
                      >
                        <Trash2 size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving || !title.trim()}
                        style={{
                          background: C.gold,
                          color: "#FDFCFA",
                          border: "none",
                          borderRadius: "10px",
                          padding: "0.55rem 1.2rem",
                          fontSize: "0.8rem",
                          fontWeight: 700,
                          cursor: saving ? "default" : "pointer",
                          boxShadow: "0 2px 6px rgba(197, 160, 89, 0.25)",
                          opacity: saving ? 0.7 : 1,
                        }}
                      >
                        {saving ? "保存中…" : "台帳を保存"}
                      </button>
                    </div>
                  </div>

                  {/* 周期設定・起算基準・工数 */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.8rem" }}>
                    
                    {/* 周期タイプ */}
                    <div>
                      <label style={{ display: "block", fontSize: "0.7rem", fontWeight: 700, color: C.charcoalLight, marginBottom: "0.3rem" }}>
                        周期タイプ
                      </label>
                      <select
                        value={cycleType}
                        onChange={(e) => setCycleType(e.target.value as PMCycleType)}
                        style={{
                          width: "100%",
                          padding: "0.5rem 0.7rem",
                          borderRadius: "10px",
                          border: "none",
                          background: "var(--bg-card-solid)",
                          fontSize: "0.8rem",
                          color: "var(--text-main)",
                          outline: "none",
                        }}
                      >
                        <option value="shift_cycle">出勤・シフト連動（勤務サイクル）</option>
                        <option value="monthly_day">毎月指定日（毎月○日）</option>
                        <option value="interval_month">月間インターバル（○ヶ月ごと）</option>
                        <option value="annual">年次（年1回）</option>
                        <option value="interval_days">日数インターバル（○日ごと）</option>
                      </select>
                    </div>

                    {cycleType === "shift_cycle" ? (
                      <>
                        {/* シフト種別 */}
                        <div>
                          <label style={{ display: "block", fontSize: "0.7rem", fontWeight: 700, color: C.charcoalLight, marginBottom: "0.3rem" }}>
                            対象シフト
                          </label>
                          <select
                            value={timingCategory}
                            onChange={(e) => setTimingCategory(e.target.value as PMTimingCategory)}
                            style={{
                              width: "100%",
                              padding: "0.5rem 0.7rem",
                              borderRadius: "10px",
                              border: "none",
                              background: "var(--bg-card-solid)",
                              fontSize: "0.8rem",
                              color: "var(--text-main)",
                              outline: "none",
                            }}
                          >
                            <option value="holiday">休日</option>
                            <option value="early_shift">早番</option>
                            <option value="late_shift">遅番</option>
                            <option value="work_day">出勤日（全般）</option>
                          </select>
                        </div>

                        {/* 何日目 */}
                        <div>
                          <label style={{ display: "block", fontSize: "0.7rem", fontWeight: 700, color: C.charcoalLight, marginBottom: "0.3rem" }}>
                            実施日
                          </label>
                          <select
                            value={timingDay}
                            onChange={(e) => setTimingDay(Number(e.target.value) || 1)}
                            style={{
                              width: "100%",
                              padding: "0.5rem 0.7rem",
                              borderRadius: "10px",
                              border: "none",
                              background: "var(--bg-card-solid)",
                              fontSize: "0.8rem",
                              color: "var(--text-main)",
                              outline: "none",
                            }}
                          >
                            <option value={1}>1日目</option>
                            <option value={2}>2日目</option>
                            <option value={3}>3日目</option>
                            <option value={4}>4日目</option>
                          </select>
                        </div>

                        {/* サイクル頻度 */}
                        <div>
                          <label style={{ display: "block", fontSize: "0.7rem", fontWeight: 700, color: C.charcoalLight, marginBottom: "0.3rem" }}>
                            サイクル頻度
                          </label>
                          <select
                            value={cycleInterval}
                            onChange={(e) => setCycleInterval(Number(e.target.value) || 1)}
                            style={{
                              width: "100%",
                              padding: "0.5rem 0.7rem",
                              borderRadius: "10px",
                              border: "none",
                              background: "var(--bg-card-solid)",
                              fontSize: "0.8rem",
                              color: "var(--text-main)",
                              outline: "none",
                            }}
                          >
                            <option value={1}>毎サイクル（毎回）</option>
                            <option value={2}>2サイクルに1回（隔サイクル）</option>
                            <option value={3}>3サイクルに1回</option>
                            <option value={4}>4サイクルに1回</option>
                          </select>
                        </div>
                      </>
                    ) : (
                      /* 周期値 */
                      <div>
                        <label style={{ display: "block", fontSize: "0.7rem", fontWeight: 700, color: C.charcoalLight, marginBottom: "0.3rem" }}>
                          {cycleType === "monthly_day"
                            ? "実施日（1〜31日）"
                            : cycleType === "interval_month"
                            ? "間隔（ヶ月）"
                            : cycleType === "annual"
                            ? "年次指定"
                            : "間隔（日数）"}
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={cycleType === "monthly_day" ? 31 : 365}
                          value={cycleValue}
                          onChange={(e) => setCycleValue(Number(e.target.value) || 1)}
                          style={{
                            width: "100%",
                            boxSizing: "border-box",
                            padding: "0.5rem 0.7rem",
                            borderRadius: "10px",
                            border: "none",
                            background: "var(--bg-card-solid)",
                            fontSize: "0.8rem",
                            color: "var(--text-main)",
                            outline: "none",
                          }}
                        />
                      </div>
                    )}

                    {/* 次回起算基準 (トグルボタン) */}
                    <div>
                      <label style={{ display: "block", fontSize: "0.7rem", fontWeight: 700, color: C.charcoalLight, marginBottom: "0.3rem" }}>
                        次回起算基準
                      </label>
                      <div
                        style={{
                          display: "flex",
                          background: "var(--bg-card-solid)",
                          borderRadius: "10px",
                          padding: "3px",
                          gap: "3px",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => setCalcBasis("fixed_date")}
                          style={{
                            flex: 1,
                            border: "none",
                            borderRadius: "8px",
                            padding: "0.45rem 0.4rem",
                            fontSize: "0.74rem",
                            fontWeight: calcBasis === "fixed_date" ? 700 : 500,
                            background: calcBasis === "fixed_date" ? C.gold : "transparent",
                            color: calcBasis === "fixed_date" ? "#FFFFFF" : C.charcoalMid,
                            cursor: "pointer",
                            transition: "all 0.15s ease",
                          }}
                        >
                          予定日基準
                        </button>
                        <button
                          type="button"
                          onClick={() => setCalcBasis("completion_date")}
                          style={{
                            flex: 1,
                            border: "none",
                            borderRadius: "8px",
                            padding: "0.45rem 0.4rem",
                            fontSize: "0.74rem",
                            fontWeight: calcBasis === "completion_date" ? 700 : 500,
                            background: calcBasis === "completion_date" ? C.gold : "transparent",
                            color: calcBasis === "completion_date" ? "#FFFFFF" : C.charcoalMid,
                            cursor: "pointer",
                            transition: "all 0.15s ease",
                          }}
                        >
                          完了日基準
                        </button>
                      </div>
                    </div>

                    {/* 今回予定日（開始日）ピッカー */}
                    <div>
                      <label style={{ display: "block", fontSize: "0.7rem", fontWeight: 700, color: C.charcoalLight, marginBottom: "0.3rem" }}>
                        今回予定日（開始日）
                      </label>
                      <input
                        type="date"
                        value={baseDate}
                        onChange={(e) => setBaseDate(e.target.value)}
                        data-testid="pm-base-date-picker"
                        style={{
                          width: "100%",
                          boxSizing: "border-box",
                          padding: "0.5rem 0.7rem",
                          borderRadius: "10px",
                          border: "none",
                          background: "var(--bg-card-solid)",
                          fontSize: "0.8rem",
                          color: "var(--text-main)",
                          outline: "none",
                        }}
                      />
                    </div>
                  </div>

                  {/* 最終実施日・今回・次回プレビューのステータス表示 */}
                  <div
                    data-testid="pm-modal-schedule-preview"
                    style={{
                      background: "rgba(197, 160, 89, 0.08)",
                      borderRadius: "12px",
                      padding: "0.75rem 1rem",
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "center",
                      gap: "1.2rem",
                      fontSize: "0.76rem",
                      color: C.charcoalMid,
                      border: "1px solid rgba(197, 160, 89, 0.18)",
                    }}
                  >
                    <div>
                      最終実施日:{" "}
                      <span>
                        {selectedMaster.lastCompletedAt
                          ? selectedMaster.lastCompletedAt.slice(0, 10)
                          : "未実施"}
                      </span>
                    </div>
                    <div>
                      今回:{" "}
                      <strong style={{ color: C.goldDark, fontWeight: 750 }}>
                        {schedulePreview
                          ? `${schedulePreview.nextDate} (${schedulePreview.nextShiftLabel})`
                          : selectedMaster.nextScheduledDate || "未算出"}
                      </strong>
                    </div>
                    {schedulePreview && (
                      <div>
                        次回:{" "}
                        <strong style={{ color: C.sage, fontWeight: 700 }}>
                          {`${schedulePreview.afterNextDate} (${schedulePreview.afterNextShiftLabel})`}
                        </strong>
                      </div>
                    )}
                  </div>
                </div>

                {/* 2. タスク詳細（マスタテンプレート：チェックボックスなし） */}
                <div
                  style={{
                    background: "var(--bg-nav-track)",
                    borderRadius: "16px",
                    padding: "1.2rem",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.8rem",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.6rem" }}>
                    <h3 style={{ margin: 0, fontSize: "0.88rem", fontWeight: 750, color: C.charcoal }}>
                      タスク詳細
                    </h3>

                    <div style={{ display: "flex", alignItems: "center", gap: "0.8rem" }}>
                      {/* 作業時間目安（旧: 工数目安） */}
                      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                        <label style={{ fontSize: "0.72rem", fontWeight: 700, color: C.charcoalLight }}>
                          作業時間目安
                        </label>
                        <div style={{ position: "relative", width: "76px" }}>
                          <input
                            type="number"
                            min={1}
                            step={5}
                            value={estimatedMinutes}
                            onChange={(e) => setEstimatedMinutes(e.target.value)}
                            placeholder="30"
                            data-testid="pm-estimated-minutes-input"
                            style={{
                              width: "100%",
                              boxSizing: "border-box",
                              padding: "0.35rem 1.6rem 0.35rem 0.55rem",
                              borderRadius: "8px",
                              border: "none",
                              background: "var(--bg-card-solid)",
                              fontSize: "0.78rem",
                              fontWeight: 650,
                              color: "var(--text-main)",
                              outline: "none",
                            }}
                          />
                          <span
                            style={{
                              position: "absolute",
                              right: "0.5rem",
                              top: "50%",
                              transform: "translateY(-50%)",
                              fontSize: "0.72rem",
                              color: C.charcoalLight,
                              pointerEvents: "none",
                            }}
                          >
                            分
                          </span>
                        </div>
                      </div>

                      {/* AI自動要約・生成ボタン */}
                      <button
                        type="button"
                        onClick={() => {
                          setIsAiCardOpen((prev) => !prev);
                          setAiError(null);
                        }}
                        data-testid="pm-ai-task-toggle-btn"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.35rem",
                          background: isAiCardOpen ? C.goldDark : "rgba(197, 160, 89, 0.15)",
                          color: isAiCardOpen ? "#FFFFFF" : C.goldDark,
                          border: "none",
                          padding: "0.35rem 0.65rem",
                          borderRadius: "8px",
                          fontSize: "0.74rem",
                          fontWeight: 700,
                          cursor: "pointer",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <Sparkles size={13} />
                        <span>AI手順作成</span>
                      </button>
                    </div>
                  </div>

                  {/* AI手順自動生成カード（開閉） */}
                  {isAiCardOpen && (
                    <div
                      data-testid="pm-ai-task-card"
                      style={{
                        background: "var(--bg-card-solid)",
                        borderRadius: "12px",
                        padding: "0.9rem",
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.7rem",
                        border: "1px solid rgba(197, 160, 89, 0.25)",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                        animation: "pm-overlay-in 0.18s ease",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                          <Sparkles size={14} style={{ color: C.goldDark }} />
                          <span style={{ fontSize: "0.76rem", fontWeight: 750, color: C.charcoal }}>
                            AI作業手順の自動要約（レシピ・マニュアル解析）
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsAiCardOpen(false)}
                          style={{
                            background: "transparent",
                            border: "none",
                            padding: "0.15rem",
                            cursor: "pointer",
                            color: C.charcoalLight,
                          }}
                        >
                          <X size={14} />
                        </button>
                      </div>

                      <p style={{ margin: 0, fontSize: "0.7rem", color: C.charcoalLight, lineHeight: 1.4 }}>
                        マニュアル、手順メモ、レシピ等の文章を貼り付けてください。Gemini APIが要約し、丸番号（①, ②, ③...）付きの保全タスクに変換します。
                      </p>

                      <textarea
                        value={aiInputText}
                        onChange={(e) => setAiInputText(e.target.value)}
                        placeholder="例: エアコンの前面パネルを持ち上げて外し、内部のエアフィルターを取り出します。掃除機で大まかなホコリを吸い取ってから、中性洗剤でぬるま湯洗いします。陰干しで完全に乾いたら元通りにセットして完了です。"
                        rows={3}
                        data-testid="pm-ai-input-textarea"
                        style={{
                          width: "100%",
                          boxSizing: "border-box",
                          padding: "0.5rem 0.65rem",
                          borderRadius: "8px",
                          border: "1px solid rgba(0,0,0,0.08)",
                          background: "var(--bg-nav-track)",
                          fontSize: "0.76rem",
                          color: "var(--text-main)",
                          outline: "none",
                          resize: "vertical",
                          fontFamily: "inherit",
                        }}
                      />

                      {aiError && (
                        <div
                          style={{
                            fontSize: "0.7rem",
                            color: C.danger,
                            background: "rgba(224, 86, 74, 0.08)",
                            padding: "0.4rem 0.6rem",
                            borderRadius: "6px",
                          }}
                        >
                          {aiError}
                        </div>
                      )}

                      {aiPreviewTasks.length > 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                          <span style={{ fontSize: "0.72rem", fontWeight: 700, color: C.sage }}>
                            生成プレビュー（{aiPreviewTasks.length}ステップ）:
                          </span>
                          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                            {aiPreviewTasks.map((step, sIdx) => (
                              <div
                                key={sIdx}
                                style={{
                                  fontSize: "0.74rem",
                                  color: C.charcoal,
                                  background: "rgba(82, 121, 111, 0.06)",
                                  padding: "0.35rem 0.6rem",
                                  borderRadius: "6px",
                                }}
                              >
                                {step}
                              </div>
                            ))}
                          </div>
                          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.3rem" }}>
                            <button
                              type="button"
                              onClick={() => handleApplyAiTasks("replace")}
                              data-testid="pm-ai-apply-replace-btn"
                              style={{
                                flex: 1,
                                padding: "0.45rem",
                                borderRadius: "8px",
                                border: "none",
                                background: C.gold,
                                color: "#FFFFFF",
                                fontSize: "0.74rem",
                                fontWeight: 700,
                                cursor: "pointer",
                              }}
                            >
                              既存タスクを上書き反映
                            </button>
                            <button
                              type="button"
                              onClick={() => handleApplyAiTasks("append")}
                              data-testid="pm-ai-apply-append-btn"
                              style={{
                                flex: 1,
                                padding: "0.45rem",
                                borderRadius: "8px",
                                border: "1px solid rgba(0,0,0,0.12)",
                                background: "transparent",
                                color: C.charcoal,
                                fontSize: "0.74rem",
                                fontWeight: 600,
                                cursor: "pointer",
                              }}
                            >
                              末尾に追加
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: "flex", justifyContent: "flex-end" }}>
                          <button
                            type="button"
                            onClick={handleGenerateAiTasks}
                            disabled={!aiInputText.trim() || isAiGenerating}
                            data-testid="pm-ai-submit-btn"
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.35rem",
                              padding: "0.45rem 1rem",
                              borderRadius: "8px",
                              border: "none",
                              background: aiInputText.trim() && !isAiGenerating ? C.gold : "rgba(0,0,0,0.06)",
                              color: aiInputText.trim() && !isAiGenerating ? "#FFFFFF" : C.charcoalLight,
                              fontSize: "0.75rem",
                              fontWeight: 700,
                              cursor: aiInputText.trim() && !isAiGenerating ? "pointer" : "default",
                            }}
                          >
                            {isAiGenerating ? (
                              <>
                                <RotateCw size={12} className="animate-spin" />
                                <span>要約生成中…</span>
                              </>
                            ) : (
                              <>
                                <Sparkles size={13} />
                                <span>手順を要約生成</span>
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 手順追加入力 */}
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <input
                      type="text"
                      value={newTaskContent}
                      onChange={(e) => setNewTaskContent(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddTask()}
                      placeholder="新しい手順を入力…"
                      style={{
                        flex: 1,
                        padding: "0.48rem 0.75rem",
                        borderRadius: "10px",
                        border: "none",
                        background: "var(--bg-card-solid)",
                        fontSize: "0.78rem",
                        color: C.charcoal,
                        outline: "none",
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleAddTask}
                      disabled={!newTaskContent.trim()}
                      style={{
                        padding: "0.48rem 0.9rem",
                        borderRadius: "10px",
                        border: "none",
                        background: newTaskContent.trim() ? C.gold : "rgba(0,0,0,0.06)",
                        color: newTaskContent.trim() ? "#FDFCFA" : C.charcoalLight,
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        cursor: newTaskContent.trim() ? "pointer" : "default",
                      }}
                    >
                      追加
                    </button>
                  </div>

                  {/* 手順リスト（追加・削除・並び替え） */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                    {tasks.length === 0 ? (
                      <p style={{ margin: "0.5rem 0", fontSize: "0.75rem", color: C.charcoalLight }}>
                        手順が登録されていません
                      </p>
                    ) : (
                      tasks.map((t, idx) => {
                        const hasCircledPrefix = /^[\u2460-\u2473\u3251-\u325f]/.test(t.content);
                        return (
                          <div
                            key={t.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "0.6rem",
                              background: "var(--bg-card-solid)",
                              padding: "0.45rem 0.75rem",
                              borderRadius: "10px",
                              boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                            }}
                          >
                            {!hasCircledPrefix && (
                              <span
                                style={{
                                  fontSize: "0.72rem",
                                  fontWeight: 700,
                                  color: C.charcoalLight,
                                  width: "1.2rem",
                                }}
                              >
                                {idx + 1}.
                              </span>
                            )}
                            <span style={{ flex: 1, fontSize: "0.78rem", color: C.charcoal }}>
                              {t.content}
                            </span>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.2rem" }}>
                              <button
                                type="button"
                                onClick={() => handleMoveTask(idx, "up")}
                                disabled={idx === 0}
                                style={{
                                  background: "none",
                                  border: "none",
                                  padding: "0.2rem",
                                  cursor: idx === 0 ? "default" : "pointer",
                                  color: idx === 0 ? "rgba(0,0,0,0.15)" : C.charcoalLight,
                                }}
                              >
                                <ChevronUp size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleMoveTask(idx, "down")}
                                disabled={idx === tasks.length - 1}
                                style={{
                                  background: "none",
                                  border: "none",
                                  padding: "0.2rem",
                                  cursor: idx === tasks.length - 1 ? "default" : "pointer",
                                  color: idx === tasks.length - 1 ? "rgba(0,0,0,0.15)" : C.charcoalLight,
                                }}
                              >
                                <ChevronDown size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveTask(t.id)}
                                style={{
                                  background: "none",
                                  border: "none",
                                  padding: "0.2rem",
                                  cursor: "pointer",
                                  color: C.charcoalLight,
                                  marginLeft: "0.3rem",
                                }}
                              >
                                <X size={14} />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* 3. 購入物・関連ノート連携 */}
                <div
                  style={{
                    background: "var(--bg-nav-track)",
                    borderRadius: "16px",
                    padding: "1.2rem",
                    display: "flex",
                    flexDirection: "column",
                    gap: "1rem",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <BookOpen size={16} color={C.goldDark} />
                    <h3 style={{ margin: 0, fontSize: "0.88rem", fontWeight: 750, color: C.charcoal }}>
                      購入物・関連ノート連携
                    </h3>
                  </div>

                  {/* 購入物テンプレート */}
                  <div>
                    <label style={{ display: "block", fontSize: "0.7rem", fontWeight: 700, color: C.charcoalLight, marginBottom: "0.3rem" }}>
                      購入物テンプレート（消耗品・必要機材）
                    </label>
                    <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.6rem" }}>
                      <input
                        type="text"
                        value={newItemName}
                        onChange={(e) => setNewItemName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleAddItem()}
                        placeholder="例: 洗濯槽クリーナー、防カビスプレー"
                        style={{
                          flex: 1,
                          padding: "0.48rem 0.75rem",
                          borderRadius: "10px",
                          border: "none",
                          background: "var(--bg-card-solid)",
                          fontSize: "0.78rem",
                          color: C.charcoal,
                          outline: "none",
                        }}
                      />
                      <button
                        type="button"
                        onClick={handleAddItem}
                        disabled={!newItemName.trim()}
                        style={{
                          padding: "0.48rem 0.9rem",
                          borderRadius: "10px",
                          border: "none",
                          background: newItemName.trim() ? C.gold : "rgba(0,0,0,0.06)",
                          color: newItemName.trim() ? "#FDFCFA" : C.charcoalLight,
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          cursor: newItemName.trim() ? "pointer" : "default",
                        }}
                      >
                        追加
                      </button>
                    </div>

                    {/* 登録済み購入物一覧 */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                      {items.length === 0 ? (
                        <span style={{ fontSize: "0.72rem", color: C.charcoalLight }}>登録された購入物はありません</span>
                      ) : (
                        items.map((it) => (
                          <span
                            key={it.id}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.35rem",
                              background: "var(--bg-card-solid)",
                              padding: "0.25rem 0.6rem",
                              borderRadius: "8px",
                              fontSize: "0.75rem",
                              color: C.charcoal,
                              boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                            }}
                          >
                            <span>{it.itemName}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(it.id)}
                              style={{
                                background: "none",
                                border: "none",
                                padding: 0,
                                cursor: "pointer",
                                color: C.charcoalLight,
                                display: "flex",
                                alignItems: "center",
                              }}
                            >
                              <X size={12} />
                            </button>
                          </span>
                        ))
                      )}
                    </div>
                  </div>

                  {/* 関連ノート登録 */}
                  <div>
                    <label style={{ display: "block", fontSize: "0.7rem", fontWeight: 700, color: C.charcoalLight, marginBottom: "0.3rem" }}>
                      関連ノート（マニュアル・作業記録）
                    </label>
                    <select
                      value={noteId}
                      onChange={(e) => setNoteId(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "0.5rem 0.7rem",
                        borderRadius: "10px",
                        border: "none",
                        background: "var(--bg-card-solid)",
                        fontSize: "0.8rem",
                        color: C.charcoal,
                        outline: "none",
                      }}
                    >
                      <option value="">関連ノートなし</option>
                      {notesList.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.title || "(無題ノート)"}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* 4. 過去のログ（実績表示） */}
                <div
                  style={{
                    background: "rgba(0, 0, 0, 0.02)",
                    borderRadius: "16px",
                    padding: "1.2rem",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.6rem",
                  }}
                >
                  <h3 style={{ margin: 0, fontSize: "0.82rem", fontWeight: 700, color: C.charcoalMid }}>
                    過去の実施ログ（{logs.length}件）
                  </h3>

                  {logs.length === 0 ? (
                    <p style={{ margin: "0.4rem 0", fontSize: "0.72rem", color: C.charcoalLight }}>
                      実施履歴はまだありません
                    </p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                      {logs.map((log) => {
                        const hasDiff = log.diffMinutes !== null && log.diffMinutes !== undefined;
                        const diffStr = hasDiff
                          ? log.diffMinutes! > 0
                            ? `+${log.diffMinutes}分`
                            : log.diffMinutes! < 0
                            ? `${log.diffMinutes}分`
                            : "±0分"
                          : null;

                        return (
                          <div
                            key={log.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              padding: "0.4rem 0.65rem",
                              borderRadius: "8px",
                              background: "rgba(0,0,0,0.02)",
                              fontSize: "0.72rem",
                              color: C.charcoalMid,
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                              <span style={{ fontWeight: 650, color: C.charcoal }}>
                                {log.date || (log.completedAt ? log.completedAt.slice(0, 10) : "")}
                              </span>
                              <span>
                                {log.startedAt
                                  ? `${log.startedAt.slice(11, 16) || log.startedAt} 〜 ${log.completedAt.slice(11, 16) || log.completedAt}`
                                  : `完了: ${log.completedAt.slice(11, 16) || log.completedAt}`}
                              </span>
                            </div>

                            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                              {log.actualMinutes !== null && log.actualMinutes !== undefined && (
                                <span style={{ fontWeight: 600 }}>
                                  実測: {log.actualMinutes}分
                                </span>
                              )}
                              {diffStr && (
                                <span
                                  style={{
                                    fontWeight: 700,
                                    color: (log.diffMinutes || 0) > 0 ? "#C05621" : C.sage,
                                  }}
                                >
                                  ({diffStr})
                                </span>
                              )}
                              <span
                                style={{
                                  fontSize: "0.68rem",
                                  padding: "0.1rem 0.35rem",
                                  borderRadius: "4px",
                                  background: "rgba(82, 121, 111, 0.12)",
                                  color: C.sage,
                                  fontWeight: 650,
                                }}
                              >
                                全タスク完了
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

              </div>
            )}
          </div>
        </div>

        {/* ─── 独自削除確認モーダル (ConfirmModal) ─── */}
        <ConfirmModal
          isOpen={!!deletingMaster}
          title="台帳の削除確認"
          message={`「${deletingMaster?.title || ""}」を削除してもよろしいですか？この操作は取り消せません。`}
          confirmLabel="削除する"
          cancelLabel="キャンセル"
          isDestructive={true}
          onConfirm={confirmDeleteMaster}
          onCancel={() => setDeletingMaster(null)}
          overlayTestId="pm-delete-confirm-overlay"
          cancelTestId="pm-cancel-delete-btn"
          confirmTestId="pm-confirm-delete-btn"
        />
      </div>
    </div>
  );
}

export default PMMasterModal;
