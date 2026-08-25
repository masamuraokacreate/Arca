/**
 * src/components/tasks/PMShiftOverrideModal.tsx
 * Arca — 出勤ステータス確認 & 手動調整モーダル
 *
 * 設計原則:
 *  - Apple HIG 準拠、枠線の完全排除、多層シャドウ、マットゴールド #C5A059
 *  - 道具としての静けさと直感的な操作性
 *  - 上部: Googleカレンダー同期状況 & 自動算出結果の可視化
 *  - 区切り線の下: ワンタップで「出勤 ✦ / 休日 🌙」手動調整（1〜6日目、シフト名補正）
 *  - 「自動判定に戻す（リセット）」機能でワンタップ解除
 */

import { useState, useEffect, useRef } from "react";
import type { ShiftInfo, ShiftOverride } from "../../types/pm";
import type { CalendarEvent, SyncStatus } from "../../types";
import { WORK_SHIFT_KEYWORDS, resolveShiftInfo } from "../../services/pmCycleService";
import { C } from "../../lib/designSystem";

export interface PMShiftOverrideModalProps {
  isOpen: boolean;
  targetDate: string; // "YYYY-MM-DD"
  currentShift: ShiftInfo;
  events?: CalendarEvent[];
  googleSyncStatus?: SyncStatus;
  isGoogleSignedIn?: boolean;
  onGoogleSignIn?: () => void;
  onGoogleSync?: () => void;
  onClose: () => void;
  onSave: (override: Omit<ShiftOverride, "date" | "updatedAt"> | null) => Promise<void> | void;
}

const QUICK_SHIFT_NAMES = ["日勤", "早番", "遅番", "当直", "夜勤", "出勤"];
const STREAK_NUMBERS = [1, 2, 3, 4, 5, 6];

export function PMShiftOverrideModal({
  isOpen,
  targetDate,
  currentShift,
  events = [],
  googleSyncStatus = "idle",
  isGoogleSignedIn = false,
  onGoogleSignIn,
  onGoogleSync,
  onClose,
  onSave,
}: PMShiftOverrideModalProps) {
  const [type, setType] = useState<"work" | "holiday">(currentShift.type);
  const [streakNumber, setStreakNumber] = useState<number>(currentShift.streakNumber || 1);
  const [shiftName, setShiftName] = useState<string>(currentShift.shiftName || "");
  const [saving, setSaving] = useState(false);

  // モーダルが開いた瞬間のみ初期化（ユーザーの操作中のリセットを防止）
  const prevOpenRef = useRef(false);
  useEffect(() => {
    if (isOpen && !prevOpenRef.current) {
      setType(currentShift.type);
      setStreakNumber(currentShift.streakNumber || 1);
      setShiftName(currentShift.shiftName || "");
      setSaving(false);
    }
    prevOpenRef.current = isOpen;
  }, [isOpen, currentShift]);

  // Escape キーで閉じる
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // 日付の和風フォーマット
  const dateObj = new Date(`${targetDate}T00:00:00`);
  const formattedDate = dateObj.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });

  // 自動判定結果（オーバーライドを無視した純粋な算出結果）
  const autoShift = resolveShiftInfo(targetDate, events, null);

  // 当日のイベント状況
  const dayEvents = events.filter((e) => e.date === targetDate);
  const workEvents = dayEvents.filter((e) => WORK_SHIFT_KEYWORDS.test(e.title));

  const handleApply = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onSave({
        type,
        streakNumber,
        shiftName: type === "work" ? shiftName.trim() || undefined : undefined,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleResetToAuto = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onSave(null);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(44, 44, 46, 0.38)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        zIndex: 1100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        boxSizing: "border-box",
        animation: "pm-overlay-in 0.18s ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="arca-card"
        style={{
          width: "100%",
          maxWidth: "460px",
          maxHeight: "90vh",
          overflowY: "auto",
          background: C.bgCard,
          boxShadow: C.modalShadow,
          borderRadius: C.radiusModal,
          padding: "1.75rem 1.75rem 1.6rem",
          boxSizing: "border-box",
          animation: "arca-modal-pop 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* ─── ヘッダー ─── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "1.25rem" }}>
          <div>
            <p style={{ margin: 0, fontSize: "0.68rem", fontWeight: 650, color: C.charcoalLight, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              SHIFT STATUS
            </p>
            <h3 style={{ margin: "0.2rem 0 0", fontSize: "1.2rem", fontWeight: 750, color: C.charcoal, letterSpacing: "-0.015em" }}>
              出勤ステータス確認
            </h3>
            <p style={{ margin: "0.25rem 0 0", fontSize: "0.78rem", color: C.goldDark, fontWeight: 600 }}>
              {formattedDate}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: C.charcoalLight,
              fontSize: "1.25rem",
              padding: "0.2rem",
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* ─── 上部セクション: Google同期確認 & 自動算出結果 ─── */}
        <div
          style={{
            background: "rgba(0, 0, 0, 0.025)",
            borderRadius: "14px",
            padding: "0.9rem 1rem",
            marginBottom: "1.25rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.65rem",
          }}
        >
          {/* 自動算出結果 */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.5rem" }}>
            <div>
              <p style={{ margin: 0, fontSize: "0.7rem", fontWeight: 650, color: C.charcoalLight, letterSpacing: "0.04em" }}>
                自動算出ステータス
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", marginTop: "0.2rem" }}>
                <span
                  style={{
                    fontSize: "0.86rem",
                    fontWeight: 700,
                    color: autoShift.type === "holiday" ? C.sage : C.goldDark,
                  }}
                >
                  {autoShift.type === "holiday"
                    ? `🌙 休日 ${autoShift.streakNumber}日目`
                    : `✦ 出勤 ${autoShift.streakNumber}日目${autoShift.shiftName ? ` (${autoShift.shiftName})` : ""}`}
                </span>
                {currentShift.isOverridden && (
                  <span
                    style={{
                      fontSize: "0.65rem",
                      fontWeight: 600,
                      color: C.charcoalLight,
                      background: "rgba(0,0,0,0.06)",
                      padding: "0.1rem 0.4rem",
                      borderRadius: "6px",
                    }}
                  >
                    ※手動上書き中
                  </span>
                )}
              </div>
            </div>

            {/* Google同期状態 & 連携/同期ボタン */}
            <div style={{ textAlign: "right", flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.25rem" }}>
              <p style={{ margin: 0, fontSize: "0.65rem", fontWeight: 600, color: C.charcoalLight }}>
                Google同期
              </p>
              {!isGoogleSignedIn ? (
                onGoogleSignIn ? (
                  <button
                    type="button"
                    onClick={onGoogleSignIn}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.35rem",
                      background: "rgba(255, 255, 255, 0.95)",
                      border: "1px solid rgba(0, 0, 0, 0.12)",
                      borderRadius: "8px",
                      padding: "0.22rem 0.6rem",
                      fontSize: "0.72rem",
                      fontWeight: 650,
                      color: C.charcoal,
                      cursor: "pointer",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                      transition: "all 0.15s ease",
                    }}
                    title="Googleカレンダーと連携して予定を自動取得"
                  >
                    <svg style={{ width: "0.75rem", height: "0.75rem" }} viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z" fill="#4285F4" />
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z" fill="#34A853" />
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62Z" fill="#FBBC05" />
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53Z" fill="#EA4335" />
                    </svg>
                    連携する
                  </button>
                ) : (
                  <span style={{ fontSize: "0.72rem", color: C.charcoalLight }}>未連携</span>
                )
              ) : (
                <div style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                  <span
                    style={{
                      fontSize: "0.72rem",
                      fontWeight: 650,
                      color:
                        googleSyncStatus === "syncing"
                          ? C.goldDark
                          : googleSyncStatus === "error"
                          ? C.danger
                          : C.sage,
                    }}
                  >
                    {googleSyncStatus === "syncing"
                      ? "同期中…"
                      : googleSyncStatus === "error"
                      ? "同期エラー"
                      : "✓ 連携済み"}
                  </span>
                  {onGoogleSync && (
                    <button
                      type="button"
                      onClick={onGoogleSync}
                      disabled={googleSyncStatus === "syncing"}
                      style={{
                        background: "rgba(0,0,0,0.04)",
                        border: "none",
                        borderRadius: "6px",
                        padding: "0.15rem 0.4rem",
                        fontSize: "0.68rem",
                        fontWeight: 600,
                        color: C.charcoal,
                        cursor: googleSyncStatus === "syncing" ? "default" : "pointer",
                        opacity: googleSyncStatus === "syncing" ? 0.6 : 1,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.2rem",
                        transition: "all 0.15s ease",
                      }}
                      title="Googleカレンダーの最新予定を再同期"
                    >
                      <svg
                        style={{
                          width: "0.68rem",
                          height: "0.68rem",
                          animation: googleSyncStatus === "syncing" ? "spin 1s linear infinite" : undefined,
                        }}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                      >
                        <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      同期
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 参照カレンダー予定詳細 */}
          <div
            style={{
              fontSize: "0.72rem",
              color: C.charcoalLight,
              borderTop: "1px solid rgba(0,0,0,0.04)",
              paddingTop: "0.5rem",
              lineHeight: 1.4,
            }}
          >
            {workEvents.length > 0 ? (
              <p style={{ margin: 0 }}>
                <span style={{ color: C.goldDark, fontWeight: 650 }}>参照予定:</span> 「{workEvents[0].title}
                {workEvents[0].startTime ? ` (${workEvents[0].startTime}〜${workEvents[0].endTime})` : ""}」を出勤予定として判定
              </p>
            ) : dayEvents.length > 0 ? (
              <p style={{ margin: 0 }}>
                <span style={{ color: C.sage, fontWeight: 650 }}>参照予定:</span> 当日 {dayEvents.length} 件の予定あり（勤務キーワードなし → 休日判定）
              </p>
            ) : (
              <p style={{ margin: 0 }}>
                <span style={{ color: C.sage, fontWeight: 650 }}>参照予定:</span> 当日の予定なし（仕事予定なし → 休日判定）
              </p>
            )}
          </div>
        </div>

        {/* ─── 区切り線 ─── */}
        <div style={{ height: "1px", background: "rgba(0, 0, 0, 0.07)", margin: "1.25rem 0" }} />

        {/* ─── 下部セクション: 手動調整 ─── */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.85rem" }}>
            <p style={{ margin: 0, fontSize: "0.78rem", fontWeight: 700, color: C.charcoal, letterSpacing: "0.01em" }}>
              手動調整（ステータス上書き）
            </p>
            {currentShift.isOverridden && (
              <span style={{ fontSize: "0.68rem", color: C.goldDark, fontWeight: 600 }}>
                現在: 手動設定適用中
              </span>
            )}
          </div>

          {/* 状態切り替え（出勤 / 休日） */}
          <div style={{ marginBottom: "1.15rem" }}>
            <p style={{ margin: "0 0 0.45rem", fontSize: "0.72rem", fontWeight: 650, color: C.charcoalLight }}>
              シフト状態
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "0.5rem",
                background: "rgba(0, 0, 0, 0.04)",
                padding: "0.3rem",
                borderRadius: "12px",
              }}
            >
              <button
                type="button"
                onClick={() => setType("work")}
                style={{
                  background: type === "work" ? C.bgCard : "transparent",
                  color: type === "work" ? C.goldDark : C.charcoalLight,
                  border: "none",
                  borderRadius: "9999px",
                  padding: "0.55rem 0",
                  fontSize: "0.82rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  boxShadow: type === "work" ? "0 2px 8px rgba(0,0,0,0.06)" : "none",
                  transition: "all 0.15s ease",
                }}
              >
                ✦ 出勤日
              </button>
              <button
                type="button"
                onClick={() => setType("holiday")}
                style={{
                  background: type === "holiday" ? C.bgCard : "transparent",
                  color: type === "holiday" ? C.sage : C.charcoalLight,
                  border: "none",
                  borderRadius: "9999px",
                  padding: "0.55rem 0",
                  fontSize: "0.82rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  boxShadow: type === "holiday" ? "0 2px 8px rgba(0,0,0,0.06)" : "none",
                  transition: "all 0.15s ease",
                }}
              >
                🌙 休日（休み）
              </button>
            </div>
          </div>

          {/* 連続何日目か（日数選択） */}
          <div style={{ marginBottom: "1.15rem" }}>
            <p style={{ margin: "0 0 0.45rem", fontSize: "0.72rem", fontWeight: 650, color: C.charcoalLight }}>
              {type === "work" ? "連勤何日目" : "連休何日目"}
            </p>
            <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
              {STREAK_NUMBERS.map((n) => {
                const active = streakNumber === n;
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setStreakNumber(n)}
                    style={{
                      background: active
                        ? type === "work"
                          ? C.goldFaint
                          : "rgba(82, 121, 111, 0.12)"
                        : "rgba(0,0,0,0.035)",
                      color: active
                        ? type === "work"
                          ? C.goldDark
                          : C.sage
                        : C.charcoal,
                      border: "none",
                      borderRadius: "8px",
                      padding: "0.4rem 0.75rem",
                      fontSize: "0.78rem",
                      fontWeight: active ? 700 : 500,
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    {n}日目
                  </button>
                );
              })}
            </div>
          </div>

          {/* 出勤時のシフト名（任意） */}
          {type === "work" && (
            <div style={{ marginBottom: "1.25rem" }}>
              <p style={{ margin: "0 0 0.45rem", fontSize: "0.72rem", fontWeight: 650, color: C.charcoalLight }}>
                シフト名（任意）
              </p>
              <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
                {QUICK_SHIFT_NAMES.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setShiftName(name)}
                    style={{
                      background: shiftName === name ? C.goldFaint : "rgba(0,0,0,0.03)",
                      color: shiftName === name ? C.goldDark : C.charcoalLight,
                      border: "none",
                      borderRadius: "6px",
                      padding: "0.25rem 0.55rem",
                      fontSize: "0.72rem",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {name}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={shiftName}
                onChange={(e) => setShiftName(e.target.value)}
                placeholder="例: 早番, 遅番, 日勤, 当直"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "0.55rem 0.75rem",
                  borderRadius: "9px",
                  border: "1px solid rgba(0,0,0,0.08)",
                  background: "transparent",
                  outline: "none",
                  fontSize: "0.82rem",
                  color: C.charcoal,
                }}
              />
            </div>
          )}

          {/* ─── フッターボタン ─── */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "1.35rem" }}>
            {currentShift.isOverridden ? (
              <button
                type="button"
                onClick={handleResetToAuto}
                disabled={saving}
                style={{
                  background: "none",
                  border: "none",
                  padding: "0.45rem 0.6rem",
                  fontSize: "0.75rem",
                  color: C.danger,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                ↩ 自動判定に戻す
              </button>
            ) : (
              <div />
            )}

            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  background: "none",
                  border: "none",
                  padding: "0.5rem 0.85rem",
                  fontSize: "0.78rem",
                  color: C.charcoalLight,
                  cursor: "pointer",
                }}
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleApply}
                disabled={saving}
                style={{
                  background: C.gold,
                  color: "#FDFCFA",
                  border: "none",
                  borderRadius: "10px",
                  padding: "0.55rem 1.15rem",
                  fontSize: "0.8rem",
                  fontWeight: 700,
                  cursor: saving ? "default" : "pointer",
                  boxShadow: "0 3px 12px rgba(197, 160, 89, 0.28)",
                  transition: "all 0.15s ease",
                }}
              >
                {saving ? "保存中…" : "手動設定を適用"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
