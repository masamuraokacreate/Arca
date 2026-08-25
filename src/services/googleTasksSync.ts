/**
 * src/services/googleTasksSync.ts
 * 買い物リスト（Lists）と Google Todo（Google Tasks）の相互同期サービス
 *
 * 設計原則 (Core/Rules.md / Core/Kernel.md):
 * - Arcaがマスター/ローカルファースト、AIや同期は裏方で静かに支える
 * - 重複のない厳密な冪等性（googleTaskId による Upsert、タイトルによる既存紐付け）
 * - 「買い物リスト」「買い物」またはデフォルトリストへの確実なアクセス
 */

import {
  collection,
  addDoc,
  updateDoc,
  getDocs,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import {
  getTaskLists,
  getTasks,
  addTask as gAddTask,
  updateTaskStatus as gUpdateTaskStatus,
  deleteTask as gDeleteTask,
  type GTaskList,
  type GTask,
} from "../lib/googleTasks";
import type { ListItem } from "../types";

const TARGET_LIST_NAMES = ["買い物リスト", "買い物", "お買い物", "Shopping List", "Shopping"];

/**
 * 買い物リスト用の Google TaskList を特定する
 * 1. 「買い物リスト」「買い物」等の名前を持つリストを優先検索
 * 2. 見つからない場合は @default または先頭のリストを使用
 */
export async function findShoppingTaskList(token: string): Promise<GTaskList | null> {
  const lists = await getTaskLists(token);
  if (!lists || lists.length === 0) return null;

  for (const name of TARGET_LIST_NAMES) {
    const found = lists.find((l) => l.title.trim() === name);
    if (found) return found;
  }

  // なければデフォルトまたは先頭
  const defaultList = lists.find((l) => l.id === "@default");
  return defaultList || lists[0] || null;
}

/**
 * Google Tasks ➔ Arca (Firestore) 相互同期
 * 
 * 1) Google Tasks のタスク一覧を取得
 * 2) 既存の Arca リスト（Firestoreから直接最新取得、または引数の配列）と照合
 * 3) googleTaskId 一致 ➔ 完了状態やタイトルの差分を更新
 * 4) 未紐付けでタイトル同一 ➔ googleTaskId を紐付け
 * 5) どちらにも非該当 ➔ 新規追加
 */
export async function syncGoogleTasksToArca(
  token: string,
  tasklistId: string,
  providedExistingItems?: ListItem[]
): Promise<{ added: number; updated: number }> {
  const gTasks: GTask[] = await getTasks(token, tasklistId);
  let added = 0;
  let updated = 0;

  // 冪等性担保: 引数が渡されていない場合のみ Firestore を参照
  let existingItems = providedExistingItems;
  if (existingItems === undefined) {
    try {
      const snap = await getDocs(collection(db, "lists"));
      existingItems = snap?.docs ? snap.docs.map((d) => {
        const rawData = typeof d.data === "function" ? d.data() : d.data;
        return {
          id: d.id,
          ...(rawData as Omit<ListItem, "id">),
        };
      }) : [];
    } catch {
      existingItems = [];
    }
  }

  for (const gTask of gTasks) {
    const isCompleted = gTask.status === "completed";
    const title = (gTask.title || "").trim();
    if (!title) continue;

    // 1) googleTaskId が完全一致するアイテムが存在するか確認
    const matchById = existingItems.find(
      (item) => item.googleTaskId === gTask.id
    );

    if (matchById) {
      const hasDiff =
        matchById.completed !== isCompleted ||
        matchById.text.trim() !== title;

      if (hasDiff) {
        await updateDoc(doc(db, "lists", matchById.id), {
          completed: isCompleted,
          text: title,
        });
        updated++;
      }
      continue;
    }

    // 2) 同一テキスト（かつ未紐付け）のアイテムが既に存在するか確認
    const matchByText = existingItems.find(
      (item) =>
        !item.googleTaskId &&
        item.text.trim() === title
    );

    if (matchByText) {
      await updateDoc(doc(db, "lists", matchByText.id), {
        googleTaskId: gTask.id,
        completed: isCompleted,
      });
      updated++;
      continue;
    }

    // 3) どちらにも該当しない場合のみ新規追加
    await addDoc(collection(db, "lists"), {
      text: title,
      completed: isCompleted,
      googleTaskId: gTask.id,
      createdAt: serverTimestamp(),
    });
    added++;
  }

  return { added, updated };
}

/**
 * Arca ➔ Google Tasks へアイテムを追加し、生成された Google Task ID を返す
 */
export async function pushItemToGoogleTasks(
  token: string,
  tasklistId: string,
  text: string
): Promise<string> {
  return await gAddTask(token, tasklistId, text);
}

/**
 * Arca ➔ Google Tasks の完了状態を同期
 */
export async function pushStatusToGoogleTasks(
  token: string,
  tasklistId: string,
  googleTaskId: string,
  completed: boolean
): Promise<void> {
  await gUpdateTaskStatus(token, tasklistId, googleTaskId, completed);
}

/**
 * Arca ➔ Google Tasks のアイテムを削除
 */
export async function removeItemFromGoogleTasks(
  token: string,
  tasklistId: string,
  googleTaskId: string
): Promise<void> {
  await gDeleteTask(token, tasklistId, googleTaskId);
}
