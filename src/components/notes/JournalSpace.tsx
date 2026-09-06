/**
 * src/components/notes/JournalSpace.tsx
 * Arca — 日記（Journal / Memory）専用 ライフログスペース
 *
 * Apple HIG & Core/Rules.md 準拠:
 * - 絵文字不使用（Lucide React SVG アイコン統一）
 * - アイボリー背景、枠線なし、微細多層シャドウ、マットゴールドアクセント
 * - 月別区切りと降順タイムライン
 * - 最上部「今日のジャーナルを書く」クイックバー
 * - 当日のタスク・予定（Footprint）との連携
 */

import React from "react";
import type { NoteItem, NoteSpaceType } from "../../types";
import { JournalTimeline } from "./JournalTimeline";

interface JournalSpaceProps {
  notes: NoteItem[];
  allNotes: NoteItem[];
  onSelectNote: (id: string) => void;
  onNewJournalNote: (targetDate: string) => void;
  onDeleteNote: (note: NoteItem) => void;
  onDownloadNote: (note: NoteItem) => void;
  onMoveNote?: (note: NoteItem) => void;
  onSpaceChange?: (space: NoteSpaceType) => void;
  spaceCounts?: {
    memo: number;
    document: number;
    journal: number;
  };
}

export const JournalSpace: React.FC<JournalSpaceProps> = ({
  notes,
  allNotes,
  onSelectNote,
  onNewJournalNote,
  onDeleteNote,
  onDownloadNote,
  onMoveNote,
  onSpaceChange: _onSpaceChange,
  spaceCounts: _spaceCounts,
}) => {
  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-5 pb-28">
      <JournalTimeline
        childNotes={notes}
        allNotes={allNotes}
        onSelectChildNote={onSelectNote}
        onNewJournalNote={onNewJournalNote}
        onDeleteChildNote={onDeleteNote}
        onDownloadChildNote={onDownloadNote}
        onMoveChildNote={onMoveNote}
      />
    </div>
  );
};
