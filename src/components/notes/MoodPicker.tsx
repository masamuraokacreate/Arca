/**
 * src/components/notes/MoodPicker.tsx
 * Arca — ジャーナル用 Mood（コンディション/気分）ピッカー & バッジ
 *
 * 設計原則:
 * - 絵文字を完全排除し、Lucide React SVG アイコンで統一
 * - Apple HIG: 44px 以上のタップ領域、枠線なし、微細シャドウ
 * - マットゴールドと落ち着いたアースカラー
 */

import { Sparkles, Sun, Cloud, Coffee, Moon } from "lucide-react";
import type { JournalMood } from "../../types";

export interface MoodConfig {
  id: JournalMood;
  label: string;
  icon: typeof Sparkles;
  activeColor: string;
  activeBg: string;
}

export const MOOD_CONFIGS: Record<JournalMood, MoodConfig> = {
  great: {
    id: "great",
    label: "最高",
    icon: Sparkles,
    activeColor: "text-amber-700 dark:text-amber-300",
    activeBg: "bg-amber-100/80 dark:bg-amber-950/50 shadow-xs",
  },
  good: {
    id: "good",
    label: "良い",
    icon: Sun,
    activeColor: "text-orange-700 dark:text-orange-300",
    activeBg: "bg-orange-100/80 dark:bg-orange-950/50 shadow-xs",
  },
  neutral: {
    id: "neutral",
    label: "普通",
    icon: Cloud,
    activeColor: "text-stone-700 dark:text-stone-300",
    activeBg: "bg-stone-200/80 dark:bg-stone-800/80 shadow-xs",
  },
  tired: {
    id: "tired",
    label: "疲れ気味",
    icon: Coffee,
    activeColor: "text-amber-800 dark:text-amber-400",
    activeBg: "bg-amber-200/50 dark:bg-amber-950/40 shadow-xs",
  },
  low: {
    id: "low",
    label: "低調",
    icon: Moon,
    activeColor: "text-indigo-700 dark:text-indigo-300",
    activeBg: "bg-indigo-100/80 dark:bg-indigo-950/50 shadow-xs",
  },
};

export const MOOD_ORDER: JournalMood[] = ["great", "good", "neutral", "tired", "low"];

interface MoodPickerProps {
  currentMood?: JournalMood;
  onChange: (mood: JournalMood) => void;
  className?: string;
}

/**
 * Mood（コンディション）選択ピル
 */
export function MoodPicker({ currentMood, onChange, className = "" }: MoodPickerProps) {
  return (
    <div
      role="radiogroup"
      aria-label="コンディション選択"
      className={`inline-flex items-center gap-1 p-1 bg-stone-200/40 dark:bg-stone-800/40 rounded-xl ${className}`}
    >
      {MOOD_ORDER.map((moodKey) => {
        const conf = MOOD_CONFIGS[moodKey];
        const Icon = conf.icon;
        const isSelected = currentMood === moodKey;

        return (
          <button
            key={moodKey}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={`コンディション: ${conf.label}`}
            title={conf.label}
            onClick={() => onChange(moodKey)}
            className={`appearance-none whitespace-nowrap shrink-0 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg cursor-pointer transition-all duration-150 text-xs font-medium min-h-[44px] min-w-[44px] sm:min-w-0 ${
              isSelected
                ? `${conf.activeBg} ${conf.activeColor} font-semibold`
                : "bg-transparent text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 hover:bg-stone-100/50 dark:hover:bg-stone-800/50"
            }`}
          >
            <Icon size={16} strokeWidth={isSelected ? 2.2 : 1.9} />
            <span className="hidden sm:inline">{conf.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * タイムラインカード等で表示する控えめな Mood バッジ
 */
export function MoodBadge({ mood }: { mood?: JournalMood }) {
  if (!mood || !MOOD_CONFIGS[mood]) return null;
  const conf = MOOD_CONFIGS[mood];
  const Icon = conf.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${conf.activeBg} ${conf.activeColor}`}
      title={`コンディション: ${conf.label}`}
    >
      <Icon size={13} strokeWidth={2.2} />
      <span>{conf.label}</span>
    </span>
  );
}
