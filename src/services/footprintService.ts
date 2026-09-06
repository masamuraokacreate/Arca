/**
 * src/services/footprintService.ts
 * Arca — ジャーナル用「今日の足跡（Moments）」抽出＆整形サービス
 *
 * 設計原則:
 * - 主体性 (Agency): 勝手な書き換えを行わず、ユーザーの明示操作でのみ抽出・追記
 * - Apple HIG / Arca: 静謐でミニマルな Markdown 引用・チェックリスト形式
 */

import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import type { NoteContextSnapshot, TaskItem, CalendarEvent } from "../types";

export interface DailyFootprintResult {
  completedTasks: string[];
  events: string[];
}

/**
 * タスクおよび予定の生データから当日の足跡スナップショットを構築する純粋関数
 */
export function buildFootprintFromData(
  tasks: Array<Partial<TaskItem>>,
  events: Array<Partial<CalendarEvent>>,
  targetDate: string
): DailyFootprintResult {
  // 1. 当日の完了タスク抽出
  const completedTaskTitles = tasks
    .filter((t) => {
      if (!t.completed) return false;
      if (t.dueDate === targetDate) return true;
      if (!t.dueDate && t.updatedAt && t.updatedAt.startsWith(targetDate)) return true;
      return false;
    })
    .map((t) => t.title?.trim() || "（名称未設定タスク）")
    .filter(Boolean);

  // 2. 当日の予定抽出（出勤専用フラグ isShiftOnly は除外）
  const eventStrings = events
    .filter((e) => e.date === targetDate && !e.isShiftOnly)
    .sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""))
    .map((e) => {
      const timePart =
        e.startTime && e.endTime
          ? `${e.startTime}〜${e.endTime} `
          : e.startTime
          ? `${e.startTime} `
          : "";
      return `${timePart}${e.title?.trim() || "（名称未設定予定）"}`;
    })
    .filter(Boolean);

  return {
    completedTasks: completedTaskTitles,
    events: eventStrings,
  };
}

/**
 * Firestore から指定日（YYYY-MM-DD）の完了タスクおよび予定を取得する
 */
export async function fetchDailyFootprint(targetDate: string): Promise<DailyFootprintResult> {
  try {
    // 1. tasks コレクション取得
    const tasksQuery = query(collection(db, "tasks"));
    const tasksSnap = await getDocs(tasksQuery);
    const tasks: Partial<TaskItem>[] = [];
    tasksSnap.forEach((docSnap) => {
      tasks.push(docSnap.data() as Partial<TaskItem>);
    });

    // 2. events コレクション取得
    const eventsQuery = query(collection(db, "events"), where("date", "==", targetDate));
    const eventsSnap = await getDocs(eventsQuery);
    const events: Partial<CalendarEvent>[] = [];
    eventsSnap.forEach((docSnap) => {
      events.push(docSnap.data() as Partial<CalendarEvent>);
    });

    return buildFootprintFromData(tasks, events, targetDate);
  } catch (error) {
    console.error("[FootprintService] Failed to fetch daily footprint:", error);
    return { completedTasks: [], events: [] };
  }
}

/**
 * 足跡データをジャーナル本文末尾用の Markdown 文字列にフォーマットする
 */
export function formatFootprintMarkdown(
  footprint: NoteContextSnapshot | DailyFootprintResult,
  targetDate: string
): string {
  const events = footprint.events || [];
  const tasks = footprint.completedTasks || [];

  if (events.length === 0 && tasks.length === 0) {
    return `\n\n> 📅 **${targetDate} の足跡**\n> 記録された予定・完了タスクはありません\n`;
  }

  const lines: string[] = [`\n\n> 📅 **${targetDate} の足跡**`];

  if (events.length > 0) {
    lines.push("> \n> **予定:**");
    events.forEach((ev) => lines.push(`> - ${ev}`));
  }

  if (tasks.length > 0) {
    lines.push("> \n> **完了タスク:**");
    tasks.forEach((tk) => lines.push(`> - [x] ${tk}`));
  }

  lines.push("");
  return lines.join("\n");
}
