/**
 * src/components/tasks/PMSection.tsx
 * Arca — Tasks 画面下部 PM作業セクション
 *
 * 設計原則:
 *  - Apple HIG準拠、枠線の完全排除、多層シャドウ、マットゴールド #C5A059
 *  - 道具としての静けさと主体性
 *  - 今日のDay番号（例: Day 1 / 6）バッジ
 *  - タスクの完了トグル（CheckCircle）およびスキップ理由記録
 *  - 「PM計画表」ボタンから PMSettingsModal を開く
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  collection,
  doc,
  onSnapshot,
  query,
  orderBy,
  where,
  getDoc,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import type { PMSettings, PMTemplateItem, PMLogItem } from "../../types/pm";
import type { CalendarEvent } from "../../types";
import { C } from "../../lib/designSystem";
import {
  todayDateStr,
  calculateDayIndex,
  detectAnchorFromEvents,
  recordPMLog,
  buildLogMapForDate,
  resolveItemStatus,
  savePMSettings,
  savePMTemplate,
  deletePMTemplate,
  resolveShiftInfo,
  saveShiftOverride,
  getActivePMTasksForDate,
  getPMTemplateTimingLabel,
  getPMTemplateCycleLabel,
  DEFAULT_PM_SETTINGS,
} from "../../services/pmCycleService";
import { PMSkipReasonModal } from "./PMSkipReasonModal";
import { PMSettingsModal } from "./PMSettingsModal";
import { ShiftOverrideModal } from "../calendar/ShiftOverrideModal";
import { ShiftBadge } from "../calendar/ShiftBadge";

// ─────────────────────────────────────────
// インライン SVG アイコン
// ─────────────────────────────────────────

function PMCheckCircle({ completed }: { completed: boolean }) {
  if (completed) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth={2}
        style={{ width: "1.25rem", height: "1.25rem", stroke: C.gold, flexShrink: 0 }}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth={1.75}
      style={{ width: "1.25rem", height: "1.25rem", stroke: C.charcoalXLight, flexShrink: 0 }}
    >
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.75} stroke="currentColor" style={{ width: "0.85rem", height: "0.85rem" }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  );
}

function ClockArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.75} stroke="currentColor" style={{ width: "0.85rem", height: "0.85rem" }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  );
}

// ─────────────────────────────────────────
// Props
// ─────────────────────────────────────────

export interface PMSectionProps {
  date?: string;
  events?: CalendarEvent[];
}

export function PMSection({ date, events }: PMSectionProps) {
  const targetDate = date || todayDateStr();

  const [settings, setSettings] = useState<PMSettings | null>(null);
  const [templates, setTemplates] = useState<PMTemplateItem[]>([]);
  const [logs, setLogs] = useState<PMLogItem[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>(events || []);
  const [loading, setLoading] = useState(false);

  const [showSettings, setShowSettings] = useState(false);
  const [showShiftOverrideModal, setShowShiftOverrideModal] = useState(false);
  const [skipTarget, setSkipTarget] = useState<PMTemplateItem | null>(null);

  // ── Firestore リアルタイム同期 ──
  useEffect(() => {
    let isCancelled = false;

    // 設定リアルタイム購読
    const unsubSettings = onSnapshot(doc(db, "shift_settings", "main"), (snap) => {
      if (isCancelled) return;
      if (snap?.exists?.()) {
        setSettings(snap.data() as PMSettings);
      }
      setLoading(false);
    });

    // テンプレート
    const unsubTemplates = onSnapshot(
      query(collection(db, "pm_templates"), orderBy("dayIndex", "asc")),
      (snap) => {
        if (isCancelled) return;
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as PMTemplateItem));
        setTemplates(list);
      }
    );

    // ログ（指定日）
    const unsubLogs = onSnapshot(
      query(collection(db, "pm_logs"), where("date", "==", targetDate)),
      (snap) => {
        if (isCancelled) return;
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as PMLogItem));
        setLogs(list);
      }
    );

    // カレンダーイベント（未提供の場合）
    let unsubEvents = () => {};
    if (!events) {
      unsubEvents = onSnapshot(
        query(collection(db, "events"), orderBy("date", "desc")),
        (snap) => {
          if (isCancelled) return;
          setCalendarEvents(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CalendarEvent)));
        }
      );
    }

    return () => {
      isCancelled = true;
      if (typeof unsubSettings === "function") unsubSettings();
      if (typeof unsubTemplates === "function") unsubTemplates();
      if (typeof unsubLogs === "function") unsubLogs();
      if (typeof unsubEvents === "function") unsubEvents();
    };
  }, [targetDate, events]);

  // モーダルを閉じた後の設定再読み込み
  const wasModalOpenRef = useRef(false);
  useEffect(() => {
    if (wasModalOpenRef.current && !showSettings) {
      const reloadSettings = async () => {
        try {
          const snap = await getDoc(doc(db, "shift_settings", "main"));
          if (snap?.exists?.()) setSettings(snap.data() as PMSettings);
        } catch {
          // ignore
        }
      };
      reloadSettings();
    }
    wasModalOpenRef.current = showSettings;
  }, [showSettings]);

  // シフト状態判定（手動オーバーライド最優先）
  const currentShift = resolveShiftInfo(targetDate, calendarEvents, settings);
  const detectedAnchor = calendarEvents.length > 0 ? detectAnchorFromEvents(calendarEvents)?.anchorDate : undefined;

  // Day 計算（フォールバック用）
  const dayInfo = settings
    ? calculateDayIndex(targetDate, settings, detectedAnchor)
    : { dayIndex: 1, cycleLength: 6, isRestDay: false, isOverridden: false };

  const logMap = buildLogMapForDate(logs, targetDate);

  // 今日の対象テンプレート（シフト連動 or Day番号）
  const todayTemplates = settings
    ? getActivePMTasksForDate(targetDate, templates, calendarEvents, settings)
    : [];

  // 完了・スキップ集計
  const completedCount = todayTemplates.filter((t) => logMap.get(t.id)?.status === "completed").length;
  const skippedCount = todayTemplates.filter((t) => logMap.get(t.id)?.status === "skipped").length;
  const allFinished = todayTemplates.length > 0 && completedCount + skippedCount === todayTemplates.length;

  // ── シフト手動オーバーライド保存（楽観的即時反映） ──
  const handleSaveShiftOverride = useCallback(
    async (override: any) => {
      // 1. ローカルステート即時更新（0ms 反映）
      setSettings((prev) => {
        const current = prev || { ...DEFAULT_PM_SETTINGS };
        const newOverrides = { ...(current.overrides || {}) };
        if (override === null) {
          delete newOverrides[targetDate];
        } else {
          newOverrides[targetDate] = {
            date: targetDate,
            type: override.type,
            streakNumber: override.streakNumber,
            shiftName: override.shiftName,
            updatedAt: new Date().toISOString(),
          };
        }
        return { ...current, overrides: newOverrides };
      });

      // 2. 永続化保存
      try {
        await saveShiftOverride(targetDate, override);
      } catch (err) {
        console.error("Failed to save shift override from PMSection:", err);
      }
    },
    [targetDate]
  );

  // ── 完了トグルハンドラ ──
  const handleToggleComplete = useCallback(
    async (item: PMTemplateItem) => {
      const currentStatus = resolveItemStatus(item, logMap);
      if (currentStatus === "completed") return; // 既に完了

      try {
        await recordPMLog({
          date: targetDate,
          templateId: item.id,
          dayIndex: dayInfo.dayIndex,
          title: item.title,
          status: "completed",
        });
      } catch (err) {
        console.error("PMSection recordPMLog error:", err);
      }
    },
    [targetDate, dayInfo.dayIndex, logMap]
  );

  // ── スキップ確定ハンドラ ──
  const handleConfirmSkip = useCallback(
    async (reason: string) => {
      if (!skipTarget) return;
      const target = skipTarget;
      setSkipTarget(null);

      try {
        await recordPMLog({
          date: targetDate,
          templateId: target.id,
          dayIndex: dayInfo.dayIndex,
          title: target.title,
          status: "skipped",
          skipReason: reason || undefined,
        });
      } catch (err) {
        console.error("Failed to record skipped PM log:", err);
      }
    },
    [skipTarget, targetDate, dayInfo.dayIndex]
  );

  if (loading) return null;

  return (
    <>
      <section
        data-testid="pm-section"
        style={{
          marginTop: "2.5rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.85rem",
        }}
      >
        {/* ─── セクションヘッダー ─── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 0.5rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <span
              style={{
                fontSize: "0.78rem",
                fontWeight: 700,
                color: C.charcoal,
                letterSpacing: "0.04em",
                display: "flex",
                alignItems: "center",
                gap: "0.35rem",
              }}
            >
              <span style={{ color: C.gold }}>✦</span> PM作業
            </span>

            {/* シフト・サイクルピル */}
            {settings && (
              <ShiftBadge
                shift={currentShift}
                onClick={() => setShowShiftOverrideModal(true)}
                testId="pm-shift-badge"
                size="sm"
              />
            )}
          </div>

          {/* 計画表設定ボタン */}
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            data-testid="pm-settings-btn"
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontSize: "0.74rem",
              color: C.charcoalLight,
              display: "flex",
              alignItems: "center",
              gap: "0.3rem",
              padding: "0.25rem 0.5rem",
              borderRadius: "8px",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = C.goldDark;
              e.currentTarget.style.background = C.goldFaint;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = C.charcoalLight;
              e.currentTarget.style.background = "transparent";
            }}
            title="PM計画表・周期を設定"
          >
            <SettingsIcon />
            <span>PM計画表</span>
          </button>
        </div>

        {/* ─── メインカード ─── */}
        <div
          className="arca-card"
          style={{
            padding: "1rem 1.25rem",
            background: C.bgCard,
            boxShadow: C.cardShadow,
            borderRadius: C.radiusCard,
          }}
        >
          {/* 設定未完了ステート */}
          {!settings?.manualAnchorDate && todayTemplates.length === 0 && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "2rem 1rem",
                textAlign: "center",
                gap: "0.75rem",
              }}
            >
              <div
                style={{
                  width: "44px",
                  height: "44px",
                  background: C.goldFaint,
                  borderRadius: "14px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: C.gold,
                  fontSize: "1.2rem",
                }}
              >
                ✦
              </div>
              <div>
                <p style={{ margin: 0, fontSize: "0.88rem", fontWeight: 650, color: C.charcoal }}>
                  PM 計画が未設定です
                </p>
                <p style={{ margin: "0.3rem 0 0", fontSize: "0.76rem", color: C.charcoalLight, lineHeight: 1.5 }}>
                  出勤サイクルや生活周期に合わせたPMタスクを登録できます
                </p>
              </div>
              <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", justifyContent: "center", marginTop: "0.35rem" }}>
                <button
                  type="button"
                  onClick={() => setShowSettings(true)}
                  style={{
                    background: C.gold,
                    color: "#FDFCFA",
                    border: "none",
                    borderRadius: "10px",
                    padding: "0.55rem 1.2rem",
                    fontSize: "0.8rem",
                    fontWeight: 650,
                    cursor: "pointer",
                    boxShadow: "0 3px 12px rgba(197, 160, 89, 0.28)",
                  }}
                >
                  PM計画を設定する
                </button>
              </div>
            </div>
          )}

          {/* 全タスク完了時の演出 */}
          {allFinished && todayTemplates.length > 0 && (
            <div style={{ textAlign: "center", padding: "1.2rem 0" }}>
              <p style={{ margin: 0, fontSize: "0.86rem", color: C.sage, fontWeight: 550 }}>
                本日のPM計画はすべて完了しています。心地よい休息を。
              </p>
            </div>
          )}

          {/* タスクリスト */}
          {todayTemplates.length > 0 && (
            <ul
              style={{
                listStyle: "none",
                margin: 0,
                padding: 0,
                display: "flex",
                flexDirection: "column",
              }}
            >
              {todayTemplates.map((item, index) => {
                const status = resolveItemStatus(item, logMap);
                const log = logMap.get(item.id);
                const isCompleted = status === "completed";
                const isSkipped = status === "skipped";

                return (
                  <li
                    key={item.id}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "0.85rem",
                      padding: "0.75rem 0",
                      borderBottom: index === todayTemplates.length - 1 ? "none" : "1px solid rgba(0, 0, 0, 0.035)",
                      opacity: isCompleted || isSkipped ? 0.6 : 1,
                      transition: "opacity 0.2s ease",
                    }}
                  >
                    {/* 左端: 完了トグル用 CheckCircle */}
                    <button
                      type="button"
                      onClick={() => handleToggleComplete(item)}
                      disabled={isCompleted || isSkipped}
                      data-testid={`pm-complete-btn-${item.id}`}
                      style={{
                        background: "none",
                        border: "none",
                        padding: 0,
                        cursor: isCompleted || isSkipped ? "default" : "pointer",
                        lineHeight: 0,
                        marginTop: "2px",
                      }}
                      title={isCompleted ? "完了済み" : "完了にする"}
                    >
                      <PMCheckCircle completed={isCompleted} />
                    </button>

                    {/* 中央: タイトル & 具体的な内容 */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", marginBottom: "0.2rem", flexWrap: "wrap" }}>
                        <span
                          style={{
                            fontSize: "0.65rem",
                            fontWeight: 650,
                            color: C.goldDark,
                            background: C.goldFaint,
                            padding: "0.08rem 0.45rem",
                            borderRadius: "9999px",
                          }}
                        >
                          ✦ {getPMTemplateTimingLabel(item)}
                        </span>
                        {item.cycleInterval && item.cycleInterval > 1 && (
                          <span
                            style={{
                              fontSize: "0.65rem",
                              fontWeight: 600,
                              color: "#8E6E2E",
                              background: "rgba(197, 160, 89, 0.12)",
                              padding: "0.08rem 0.45rem",
                              borderRadius: "9999px",
                            }}
                          >
                            🔄 {getPMTemplateCycleLabel(item)}
                          </span>
                        )}
                      </div>
                      <p
                        style={{
                          margin: 0,
                          fontSize: "0.88rem",
                          fontWeight: 600,
                          color: isCompleted ? C.charcoalLight : C.charcoal,
                          textDecoration: isCompleted ? "line-through" : "none",
                          letterSpacing: "0.01em",
                          lineHeight: 1.35,
                        }}
                      >
                        {item.title}
                      </p>
                      {item.content && !isCompleted && !isSkipped && (
                        <p
                          style={{
                            margin: "0.2rem 0 0",
                            fontSize: "0.76rem",
                            color: C.charcoalLight,
                            lineHeight: 1.45,
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {item.content}
                        </p>
                      )}
                      {isSkipped && (
                        <p
                          style={{
                            margin: "0.2rem 0 0",
                            fontSize: "0.72rem",
                            color: C.charcoalLight,
                            fontStyle: "italic",
                          }}
                        >
                          見送り理由: {log?.skipReason || "理由なし"}
                        </p>
                      )}
                    </div>

                    {/* 右端: スキップボタン / スキップ済バッジ */}
                    {isSkipped && (
                      <span
                        style={{
                          fontSize: "0.68rem",
                          fontWeight: 500,
                          color: C.charcoalLight,
                          background: "rgba(0,0,0,0.04)",
                          padding: "0.15rem 0.45rem",
                          borderRadius: "6px",
                          flexShrink: 0,
                        }}
                      >
                        スキップ済
                      </span>
                    )}

                    {!isCompleted && !isSkipped && (
                      <button
                        type="button"
                        onClick={() => setSkipTarget(item)}
                        data-testid={`pm-skip-btn-${item.id}`}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "0.25rem",
                          padding: "0.2rem 0.45rem",
                          fontSize: "0.72rem",
                          color: C.charcoalLight,
                          borderRadius: "6px",
                          transition: "all 0.15s ease",
                          flexShrink: 0,
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = C.charcoal;
                          e.currentTarget.style.background = "rgba(0,0,0,0.04)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = C.charcoalLight;
                          e.currentTarget.style.background = "none";
                        }}
                        title="見送り（スキップ）"
                      >
                        <ClockArrowIcon />
                        <span>スキップ</span>
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {/* テンプレートなし */}
          {settings?.manualAnchorDate && todayTemplates.length === 0 && (
            <p style={{ margin: 0, fontSize: "0.82rem", color: C.charcoalLight, textAlign: "center", padding: "1.2rem 0" }}>
              本日予定されているPMタスクはありません。心地よい休息を。
            </p>
          )}
        </div>
      </section>

      {/* ─── スキップ理由モーダル ─── */}
      {skipTarget && (
        <PMSkipReasonModal
          isOpen={Boolean(skipTarget)}
          taskTitle={skipTarget.title}
          onClose={() => setSkipTarget(null)}
          onConfirm={handleConfirmSkip}
        />
      )}

      {/* ─── PM 設定モーダル ─── */}
      {showSettings && (
        <PMSettingsModal
          isOpen={showSettings}
          settings={settings || undefined}
          templates={templates}
          detectedAnchorDate={detectedAnchor}
          onClose={() => setShowSettings(false)}
          onSaveSettings={savePMSettings}
          onSaveTemplate={savePMTemplate}
          onDeleteTemplate={deletePMTemplate}
        />
      )}

      {/* ─── 出勤ステータス確認 & 手動調整モーダル ─── */}
      <ShiftOverrideModal
        isOpen={showShiftOverrideModal}
        targetDate={targetDate}
        currentShift={currentShift}
        events={calendarEvents}
        onClose={() => setShowShiftOverrideModal(false)}
        onSave={handleSaveShiftOverride}
      />
    </>
  );
}
