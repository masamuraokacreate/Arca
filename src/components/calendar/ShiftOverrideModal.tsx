/**
 * src/components/calendar/ShiftOverrideModal.tsx
 * Arca — 出勤ステータス確認 & 手動調整モーダル
 *
 * 設計原則:
 *  - Apple HIG 準拠、枠線の完全排除、多層シャドウ、マットゴールド #C5A059
 *  - 道具としての静けさと直感的な操作性
 *  - 上部: Googleカレンダー同期状況 & 自動算出結果の可視化
 *  - 区切り線の下: ワンタップで「出勤 / 休日」手動調整（1〜6日目、シフト名補正）
 *  - 「自動判定に戻す（リセット）」機能でワンタップ解除
 */

import { useState, useEffect, useRef } from "react";
import type { ShiftInfo, ShiftOverride } from "../../types/shift";
import type { CalendarEvent, SyncStatus } from "../../types";
import { WORK_SHIFT_KEYWORDS, resolveShiftInfo } from "../../services/pmCycleService";
import { resolveShiftTimes } from "../../services/googleCalendarSync";
import { C } from "../../lib/designSystem";
import { MoonIcon, SunIcon } from "./ShiftBadge";
import { Clock, AlertCircle, Calendar as CalendarIcon, Check } from "lucide-react";
import { useModalAnimation } from "../../hooks/useModalAnimation";

export interface ShiftOverrideModalProps {
  isOpen: boolean;
  targetDate: string; // "YYYY-MM-DD"
  currentShift: ShiftInfo;
  events?: CalendarEvent[];
  googleSyncStatus?: SyncStatus;
  isGoogleSignedIn?: boolean;
  accessToken?: string | null;
  onGoogleSignIn?: () => void;
  onGoogleSync?: () => void;
  onClose: () => void;
  onSave: (
    override: Omit<ShiftOverride, "date" | "updatedAt"> | null,
    details?: { startTime?: string; endTime?: string }
  ) => Promise<void> | void;
}

/** 後方互換用プロパティ型 */
export type PMShiftOverrideModalProps = ShiftOverrideModalProps;

const QUICK_SHIFT_NAMES = ["日勤", "早番", "遅番", "当直", "夜勤", "出勤"];
const STREAK_NUMBERS = [1, 2, 3, 4, 5, 6];

export function ShiftOverrideModal({
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
}: ShiftOverrideModalProps) {
  const [type, setType] = useState<"work" | "holiday">(currentShift.type);
  const [streakNumber, setStreakNumber] = useState<number>(currentShift.streakNumber || 1);
  const [shiftName, setShiftName] = useState<string>(currentShift.shiftName || "");

  // 勤務時間（Googleカレンダー連携用）
  const [startTime, setStartTime] = useState<string>("06:00");
  const [endTime, setEndTime] = useState<string>("15:00");

  // 誤タップ防止用 確認ポップアップステート ("apply" | "reset" | null)
  const [confirmAction, setConfirmAction] = useState<"apply" | "reset" | null>(null);
  const [saving, setSaving] = useState(false);

  // 当日のイベント状況
  const dayEvents = events.filter((e) => e.date === targetDate);
  const workEvents = dayEvents.filter((e) => WORK_SHIFT_KEYWORDS.test(e.title));

  // モーダルが開いた瞬間のみ初期化（ユーザーの操作中のリセットを防止）
  const prevOpenRef = useRef(false);
  useEffect(() => {
    if (isOpen && !prevOpenRef.current) {
      setType(currentShift.type);
      setStreakNumber(currentShift.streakNumber || 1);
      const name = currentShift.shiftName || "";
      setShiftName(name);

      // 既存の当日出勤イベントから時間を抽出、なければシフト名から自動解決
      const existingWork = workEvents[0];
      const defaultTimes = resolveShiftTimes(name);
      setStartTime(existingWork?.startTime || defaultTimes.startTime);
      setEndTime(existingWork?.endTime || defaultTimes.endTime);

      setConfirmAction(null);
      setSaving(false);
    }
    prevOpenRef.current = isOpen;
  }, [isOpen, currentShift, targetDate, workEvents]);

  const { shouldRender, isClosing, handleClose } = useModalAnimation({ isOpen, onClose });

  // Escape キーで閉じる
  useEffect(() => {
    if (!shouldRender || isClosing) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (confirmAction) {
          setConfirmAction(null);
        } else {
          handleClose();
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [shouldRender, isClosing, confirmAction, handleClose]);

  if (!shouldRender) return null;

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

  // クイックシフト選択ハンドラ（名前と連動して時間もセット）
  const handleSelectQuickShift = (name: string) => {
    setShiftName(name);
    const times = resolveShiftTimes(name);
    setStartTime(times.startTime);
    setEndTime(times.endTime);
  };

  // 確認ポップアップを開く
  const handleRequestApply = () => {
    setConfirmAction("apply");
  };

  const handleRequestReset = () => {
    setConfirmAction("reset");
  };

  // 確認ポップアップで承認された時の実行ハンドラ
  const handleExecuteConfirm = async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (confirmAction === "reset") {
        await onSave(null);
      } else if (confirmAction === "apply") {
        await onSave(
          {
            type,
            streakNumber,
            shiftName: type === "work" ? shiftName.trim() || undefined : undefined,
          },
          type === "work" ? { startTime: startTime.trim(), endTime: endTime.trim() } : undefined
        );
      }
      setConfirmAction(null);
      handleClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={handleClose}
      className={`arca-modal-backdrop ${isClosing ? "is-closing" : ""}`}
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
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`arca-card arca-modal-window ${isClosing ? "is-closing" : ""}`}
        style={{
          width: "100%",
          maxWidth: "460px",
          maxHeight: "90vh",
          overflowY: "auto",
          background: "var(--bg-card-solid)",
          boxShadow: "var(--shadow-modal)",
          borderRadius: C.radiusModal,
          border: "1px solid var(--border-subtle)",
          padding: "1.75rem 1.75rem 1.6rem",
          boxSizing: "border-box",
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
            background: "var(--bg-nav-track)",
            borderRadius: "14px",
            border: "1px solid var(--border-subtle)",
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
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.25rem",
                  }}
                >
                  {autoShift.type === "holiday" ? (
                    <>
                      <MoonIcon size="0.85rem" />
                      <span>{`休日 ${autoShift.streakNumber}日目`}</span>
                    </>
                  ) : (
                    <>
                      <SunIcon size="0.85rem" />
                      <span>{`出勤 ${autoShift.streakNumber}日目${autoShift.shiftName ? ` (${autoShift.shiftName})` : ""}`}</span>
                    </>
                  )}
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
                      background: "var(--bg-surface)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "8px",
                      padding: "0.22rem 0.6rem",
                      fontSize: "0.72rem",
                      fontWeight: 650,
                      color: C.charcoal,
                      cursor: "pointer",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                    }}
                  >
                    Google連携
                  </button>
                ) : (
                  <span style={{ fontSize: "0.72rem", color: C.charcoalLight }}>未連携</span>
                )
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <span style={{ fontSize: "0.72rem", color: C.sage, fontWeight: 600 }}>連携済</span>
                  {onGoogleSync && (
                    <button
                      type="button"
                      onClick={onGoogleSync}
                      disabled={googleSyncStatus === "syncing"}
                      style={{
                        background: "none",
                        border: "none",
                        fontSize: "0.72rem",
                        color: C.goldDark,
                        fontWeight: 600,
                        cursor: googleSyncStatus === "syncing" ? "default" : "pointer",
                        padding: 0,
                        textDecoration: "underline",
                      }}
                    >
                      {googleSyncStatus === "syncing" ? "同期中…" : "今すぐ同期"}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* カレンダーイベント検出状況 */}
          <div style={{ borderTop: "1px solid rgba(0,0,0,0.05)", paddingTop: "0.5rem" }}>
            {googleSyncStatus === "error" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                <p style={{ margin: 0, fontSize: "0.68rem", color: "#C05621", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.25rem" }}>
                  <AlertCircle size={13} />
                  <span>Googleカレンダーの同期に失敗しました（権限不足または認証切れ）。</span>
                </p>
                {onGoogleSignIn && (
                  <div>
                    <button
                      type="button"
                      onClick={onGoogleSignIn}
                      style={{
                        background: C.goldFaint,
                        color: C.goldDark,
                        border: "none",
                        borderRadius: "6px",
                        padding: "0.2rem 0.6rem",
                        fontSize: "0.7rem",
                        fontWeight: 650,
                        cursor: "pointer",
                      }}
                    >
                      権限を再同意して再接続
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: "0.68rem", color: C.charcoalLight }}>
                {dayEvents.length === 0
                  ? "カレンダー予定: なし（休日判定）"
                  : workEvents.length > 0
                  ? `検出された勤務予定: 「${workEvents.map((e) => e.title).join("」「")}」`
                  : `予定あり（非勤務予定）: 「${dayEvents.map((e) => e.title).join("」「")}」`}
              </p>
            )}
          </div>
        </div>

        {/* ─── 下部セクション: 手動オーバーライド調整フォーム ─── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <p style={{ margin: 0, fontSize: "0.72rem", fontWeight: 700, color: C.charcoal, letterSpacing: "0.02em" }}>
              手動ステータス調整
            </p>
            {currentShift.isOverridden && (
              <button
                type="button"
                onClick={handleRequestReset}
                disabled={saving}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  fontSize: "0.72rem",
                  color: C.charcoalLight,
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                自動判定に戻す
              </button>
            )}
          </div>

          {/* 出勤 / 休日 切り替えセグメント */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "0.5rem",
              background: "rgba(0, 0, 0, 0.04)",
              padding: "0.25rem",
              borderRadius: "12px",
            }}
          >
            <button
              type="button"
              onClick={() => setType("work")}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.35rem",
                padding: "0.55rem 0",
                borderRadius: "10px",
                border: "none",
                background: type === "work" ? "#FDFCFA" : "transparent",
                color: type === "work" ? C.goldDark : C.charcoalLight,
                fontWeight: type === "work" ? 700 : 500,
                fontSize: "0.85rem",
                cursor: "pointer",
                boxShadow: type === "work" ? "0 2px 6px rgba(0,0,0,0.06)" : "none",
                transition: "all 0.15s ease",
              }}
            >
              <SunIcon size="0.85rem" />
              <span>出勤日</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setType("holiday");
                setShiftName("");
              }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.35rem",
                padding: "0.55rem 0",
                borderRadius: "10px",
                border: "none",
                background: type === "holiday" ? "#FDFCFA" : "transparent",
                color: type === "holiday" ? C.sage : C.charcoalLight,
                fontWeight: type === "holiday" ? 700 : 500,
                fontSize: "0.85rem",
                cursor: "pointer",
                boxShadow: type === "holiday" ? "0 2px 6px rgba(0,0,0,0.06)" : "none",
                transition: "all 0.15s ease",
              }}
            >
              <MoonIcon size="0.85rem" />
              <span>休日（休み）</span>
            </button>
          </div>

          {/* 連続日数（1〜6日目）選択 */}
          <div>
            <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 650, color: C.charcoalMid, marginBottom: "0.4rem" }}>
              {type === "work" ? "連勤日数（出勤 ◯日目）" : "連休日数（休日 ◯日目）"}
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "0.35rem" }}>
              {STREAK_NUMBERS.map((num) => {
                const isSelected = streakNumber === num;
                return (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setStreakNumber(num)}
                    style={{
                      padding: "0.5rem 0",
                      borderRadius: "10px",
                      border: "none",
                      background: isSelected
                        ? type === "work"
                          ? C.gold
                          : C.sage
                        : "rgba(0, 0, 0, 0.04)",
                      color: isSelected ? "#FDFCFA" : C.charcoal,
                      fontSize: "0.85rem",
                      fontWeight: isSelected ? 700 : 500,
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    {num}日目
                  </button>
                );
              })}
            </div>
          </div>

          {/* 出勤時のシフト名（任意入力 & クイック選択 & 時間設定） */}
          {type === "work" && (
            <div>
              <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 650, color: C.charcoalMid, marginBottom: "0.4rem" }}>
                シフト名・区分
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginBottom: "0.45rem" }}>
                {QUICK_SHIFT_NAMES.map((name) => {
                  const isSelected = shiftName === name;
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => handleSelectQuickShift(name)}
                      style={{
                        padding: "0.25rem 0.6rem",
                        borderRadius: "6px",
                        border: "none",
                        background: isSelected ? C.goldFaint : "rgba(0, 0, 0, 0.04)",
                        color: isSelected ? C.goldDark : C.charcoal,
                        fontSize: "0.75rem",
                        fontWeight: isSelected ? 650 : 500,
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
              <input
                type="text"
                value={shiftName}
                onChange={(e) => setShiftName(e.target.value)}
                placeholder="例: 早番、遅番、当直（直接入力も可）"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  background: "transparent",
                  border: "none",
                  borderBottom: `1px solid ${C.gold}`,
                  outline: "none",
                  fontSize: "0.85rem",
                  color: C.charcoal,
                  padding: "0.3rem 0",
                  letterSpacing: "0.01em",
                  marginBottom: "0.85rem",
                }}
              />

              {/* 勤務時間指定（Googleカレンダー連携用） */}
              <div
                style={{
                  background: "rgba(0, 0, 0, 0.025)",
                  borderRadius: "10px",
                  padding: "0.55rem 0.75rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.5rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                  <Clock size={14} color={C.goldDark} />
                  <span style={{ fontSize: "0.72rem", fontWeight: 650, color: C.charcoalMid }}>
                    勤務時間
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    style={{
                      border: "none",
                      background: "var(--bg-card-solid)",
                      padding: "0.25rem 0.4rem",
                      borderRadius: "6px",
                      fontSize: "0.8rem",
                      color: C.charcoal,
                      boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                    }}
                  />
                  <span style={{ fontSize: "0.75rem", color: C.charcoalLight }}>〜</span>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    style={{
                      border: "none",
                      background: "var(--bg-card-solid)",
                      padding: "0.25rem 0.4rem",
                      borderRadius: "6px",
                      fontSize: "0.8rem",
                      color: C.charcoal,
                      boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* 連動動作の事前案内 */}
          <div
            style={{
              padding: "0.45rem 0.65rem",
              borderRadius: "8px",
              background: type === "work" ? "rgba(197, 160, 89, 0.08)" : "rgba(82, 121, 111, 0.08)",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
            }}
          >
            <CalendarIcon size={13} color={type === "work" ? C.goldDark : C.sage} />
            <p
              style={{
                margin: 0,
                fontSize: "0.68rem",
                color: type === "work" ? C.goldDark : C.sage,
                fontWeight: 600,
                lineHeight: 1.35,
              }}
            >
              {isGoogleSignedIn
                ? type === "work"
                  ? "確定時にGoogleカレンダーへ出勤予定を登録・更新します"
                  : "確定時にGoogleカレンダーから該当日の出勤予定を削除します"
                : "※ Google未接続のため、確定時はアプリ内（Arca）のみ変更されます"}
            </p>
          </div>

          {/* ボタンエリア */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.3rem" }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                padding: "0.5rem 0.9rem",
                fontSize: "0.8rem",
                color: C.charcoalLight,
                cursor: "pointer",
              }}
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={handleRequestApply}
              disabled={saving}
              style={{
                background: type === "work" ? C.gold : C.sage,
                color: "#FDFCFA",
                border: "none",
                borderRadius: "10px",
                padding: "0.55rem 1.25rem",
                fontSize: "0.82rem",
                fontWeight: 650,
                cursor: saving ? "default" : "pointer",
                boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
                transition: "opacity 0.15s ease",
                opacity: saving ? 0.7 : 1,
              }}
            >
              変更を確認する
            </button>
          </div>
        </div>
      </div>

      {/* ─── 誤タップ防止 確認ポップアップダイアログ ─── */}
      <ShiftConfirmModal
        confirmAction={confirmAction}
        saving={saving}
        type={type}
        formattedDate={formattedDate}
        shiftName={shiftName}
        startTime={startTime}
        endTime={endTime}
        streakNumber={streakNumber}
        isGoogleSignedIn={isGoogleSignedIn}
        onConfirm={handleExecuteConfirm}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}

interface ShiftConfirmModalProps {
  confirmAction: "apply" | "reset" | null;
  saving: boolean;
  type: "work" | "holiday";
  formattedDate: string;
  shiftName: string;
  startTime: string;
  endTime: string;
  streakNumber: number;
  isGoogleSignedIn: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function ShiftConfirmModal({
  confirmAction,
  saving,
  type,
  formattedDate,
  shiftName,
  startTime,
  endTime,
  streakNumber,
  isGoogleSignedIn,
  onConfirm,
  onCancel,
}: ShiftConfirmModalProps) {
  const { shouldRender, isClosing, handleClose } = useModalAnimation({
    isOpen: !!confirmAction,
    onClose: onCancel,
  });

  useEffect(() => {
    if (!shouldRender || isClosing || saving) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [shouldRender, isClosing, saving, handleClose]);

  if (!shouldRender || !confirmAction) return null;

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        if (!saving) handleClose();
      }}
      className={`arca-modal-backdrop ${isClosing ? "is-closing" : ""}`}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.42)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        zIndex: 1200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        boxSizing: "border-box",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`arca-card arca-modal-window ${isClosing ? "is-closing" : ""}`}
        style={{
          width: "100%",
          maxWidth: "400px",
          background: "var(--bg-card-solid)",
          boxShadow: "0 24px 60px rgba(0,0,0,0.22), 0 4px 16px rgba(0,0,0,0.08)",
          borderRadius: "20px",
          border: "1px solid var(--border-subtle)",
          padding: "1.6rem 1.6rem 1.4rem",
          boxSizing: "border-box",
        }}
      >
        {/* ポップアップ ヘッダー */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.85rem" }}>
          <div
            style={{
              width: "2rem",
              height: "2rem",
              borderRadius: "50%",
              background: confirmAction === "reset" ? "rgba(0,0,0,0.06)" : type === "work" ? C.goldFaint : "rgba(82, 121, 111, 0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {confirmAction === "reset" ? (
              <AlertCircle size={18} color={C.charcoalMid} />
            ) : type === "work" ? (
              <SunIcon size="1.1rem" />
            ) : (
              <MoonIcon size="1.1rem" />
            )}
          </div>
          <h4 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 750, color: C.charcoal, letterSpacing: "-0.01em" }}>
            {confirmAction === "reset"
              ? "自動判定に戻しますか？"
              : type === "work"
              ? "Googleカレンダーに出勤予定を反映しますか？"
              : "Googleカレンダーの出勤予定を削除しますか？"}
          </h4>
        </div>

        {/* ポップアップ 本文サマリー */}
        <div
          style={{
            background: "var(--bg-nav-track)",
            borderRadius: "12px",
            padding: "0.85rem 0.95rem",
            marginBottom: "1rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.45rem",
            fontSize: "0.8rem",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: C.charcoalLight, fontWeight: 600 }}>対象日</span>
            <span style={{ color: C.charcoal, fontWeight: 700 }}>{formattedDate}</span>
          </div>

          {confirmAction === "reset" ? (
            <div style={{ color: C.charcoalMid, lineHeight: 1.4, fontSize: "0.78rem", marginTop: "0.2rem" }}>
              手動上書き設定を解除し、カレンダーからの通常自動判定に戻します。
            </div>
          ) : type === "work" ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: C.charcoalLight, fontWeight: 600 }}>シフト</span>
                <span style={{ color: C.goldDark, fontWeight: 700 }}>
                  {shiftName || "出勤"} ({startTime}〜{endTime})
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: C.charcoalLight, fontWeight: 600 }}>連勤</span>
                <span style={{ color: C.charcoal, fontWeight: 700 }}>{streakNumber}日目</span>
              </div>
              <div style={{ borderTop: "1px solid rgba(0,0,0,0.05)", paddingTop: "0.4rem", marginTop: "0.2rem", fontSize: "0.74rem", color: C.charcoalMid }}>
                {isGoogleSignedIn
                  ? "✓ Googleカレンダーに出勤予定を登録・更新します。"
                  : "※ Google未接続のため、アプリ内のみ反映されます。"}
              </div>
            </>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: C.charcoalLight, fontWeight: 600 }}>設定内容</span>
                <span style={{ color: C.sage, fontWeight: 700 }}>休日（休み） {streakNumber}日目</span>
              </div>
              <div style={{ borderTop: "1px solid rgba(0,0,0,0.05)", paddingTop: "0.4rem", marginTop: "0.2rem", fontSize: "0.74rem", color: C.charcoalMid }}>
                {isGoogleSignedIn
                  ? "✓ Googleカレンダーから該当日の出勤予定を削除します。"
                  : "※ Google未接続のため、アプリ内のみ反映されます。"}
              </div>
            </>
          )}
        </div>

        {/* ポップアップ アクションボタン */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.55rem" }}>
          <button
            type="button"
            onClick={handleClose}
            disabled={saving}
            style={{
              background: "transparent",
              border: "none",
              padding: "0.5rem 0.9rem",
              fontSize: "0.82rem",
              fontWeight: 600,
              color: C.charcoalLight,
              cursor: "pointer",
            }}
          >
            戻る
          </button>
          <button
            type="button"
            data-testid="confirm-shift-btn"
            onClick={onConfirm}
            disabled={saving}
            style={{
              background:
                confirmAction === "reset"
                  ? C.charcoal
                  : type === "work"
                  ? C.gold
                  : C.sage,
              color: "#FDFCFA",
              border: "none",
              borderRadius: "10px",
              padding: "0.55rem 1.3rem",
              fontSize: "0.82rem",
              fontWeight: 700,
              cursor: saving ? "default" : "pointer",
              boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
              opacity: saving ? 0.7 : 1,
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
            }}
          >
            <Check size={14} />
            <span>{saving ? "反映中…" : "変更を反映する"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// 後方互換用エイリアス
export const PMShiftOverrideModal = ShiftOverrideModal;

export default ShiftOverrideModal;

