/**
 * src/services/googleTasksSync.ts
 * タスク（Tasks）・買い物リスト（Lists）と Google Todo（Google Tasks）の相互同期サービス
 *
 * 設計原則 (Core/Rules.md / Core/Kernel.md):
 * - Arcaがマスター/ローカルファースト、AIや同期は裏方で静かに支える
 * - 重複のない厳密な冪等性（googleTaskId による Upsert、タイトルによる既存紐付け）
 * - 複数リスト（マイタスク、買い物リスト、カスタムリスト）の双方向同期
 */

import {
  collection,
  addDoc,
  updateDoc,
  getDocs,
  doc,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import {
  getTaskLists,
  getTasks,
  addTask as gAddTask,
  updateTask as gUpdateTask,
  updateTaskStatus as gUpdateTaskStatus,
  deleteTask as gDeleteTask,
  addTaskList as gAddTaskList,
  updateTaskList as gUpdateTaskList,
  deleteTaskList as gDeleteTaskList,
  type GTaskList,
  type GTask,
} from "../lib/googleTasks";
import type { TaskItem, ListItem } from "../types";

const SHOPPING_LIST_NAMES = ["買い物リスト", "買い物", "お買い物", "Shopping List", "Shopping"];

/**
 * 買い物リスト用の Google TaskList を特定する
 */
export async function findShoppingTaskList(token: string): Promise<GTaskList | null> {
  const lists = await getTaskLists(token);
  if (!lists || lists.length === 0) return null;

  for (const name of SHOPPING_LIST_NAMES) {
    const found = lists.find((l) => l.title.trim() === name);
    if (found) return found;
  }

  const defaultList = lists.find((l) => l.id === "@default");
  return defaultList || lists[0] || null;
}

/**
 * マイタスク用の Google TaskList を特定する
 */
export async function findDefaultTaskList(token: string): Promise<GTaskList | null> {
  const lists = await getTaskLists(token);
  if (!lists || lists.length === 0) return null;

  const myTasks = lists.find((l) => l.title === "My Tasks" || l.title === "マイタスク");
  if (myTasks) return myTasks;

  const defaultList = lists.find((l) => l.id === "@default");
  return defaultList || lists[0] || null;
}

// ─────────────────────────────────────────
// Tasks（tasks コレクション / listId 指定）の双方向同期
// ─────────────────────────────────────────

/**
 * 指定の Google TaskList から Arca (tasks コレクション) への相互同期
 */
export async function syncGoogleTasksForList(
  token: string,
  googleListId: string,
  listId: string = "default",
  providedExistingTasks?: TaskItem[]
): Promise<{ added: number; updated: number }> {
  const gTasks: GTask[] = await getTasks(token, googleListId);
  let added = 0;
  let updated = 0;

  let existingTasks = providedExistingTasks;
  if (existingTasks === undefined) {
    try {
      const snap = await getDocs(query(collection(db, "tasks"), where("listId", "==", listId)));
      existingTasks = snap?.docs ? snap.docs.map((d) => {
        const rawData = typeof d.data === "function" ? d.data() : d.data;
        return {
          id: d.id,
          ...(rawData as Omit<TaskItem, "id">),
        };
      }) : [];
    } catch {
      existingTasks = [];
    }
  }

  for (const gTask of gTasks) {
    const isCompleted = gTask.status === "completed";
    const title = (gTask.title || "").trim();
    if (!title) continue;

    const parsedDue = gTask.due ? gTask.due.split("T")[0] : null;

    // 1) googleTaskId が完全一致するアイテムが存在するか確認
    const matchById = existingTasks.find(
      (item) => item.googleTaskId === gTask.id
    );

    if (matchById) {
      const hasDiff =
        matchById.completed !== isCompleted ||
        matchById.title.trim() !== title ||
        (matchById.dueDate || null) !== parsedDue;

      if (hasDiff) {
        await updateDoc(doc(db, "tasks", matchById.id), {
          completed: isCompleted,
          title,
          dueDate: parsedDue,
          googleListId,
        });
        updated++;
      }
      continue;
    }

    // 2) 同一タイトル（かつ未紐付け）のアイテムが既に存在するか確認
    const matchByTitle = existingTasks.find(
      (item) =>
        !item.googleTaskId &&
        item.title.trim() === title
    );

    if (matchByTitle) {
      await updateDoc(doc(db, "tasks", matchByTitle.id), {
        googleTaskId: gTask.id,
        googleListId,
        completed: isCompleted,
        dueDate: parsedDue || matchByTitle.dueDate || null,
      });
      updated++;
      continue;
    }

    // 3) どちらにも該当しない場合のみ新規追加
    await addDoc(collection(db, "tasks"), {
      title,
      dueDate: parsedDue,
      completed: isCompleted,
      listId,
      googleTaskId: gTask.id,
      googleListId,
      subtasks: [],
      createdAt: serverTimestamp(),
    });
    added++;
  }

  return { added, updated };
}

/**
 * Arca ➔ Google Tasks へタスクを追加し、生成された Google Task ID を返す
 */
export async function pushTaskToGoogleTasks(
  token: string,
  tasklistId: string,
  title: string,
  dueDate?: string | null
): Promise<string> {
  return await gAddTask(token, tasklistId, title, dueDate || undefined);
}

/**
 * Arca ➔ Google Tasks のタスク完了状態を同期
 */
export async function pushTaskStatusToGoogleTasks(
  token: string,
  tasklistId: string,
  googleTaskId: string,
  completed: boolean
): Promise<void> {
  await gUpdateTaskStatus(token, tasklistId, googleTaskId, completed);
}

/**
 * Arca ➔ Google Tasks のタスク内容（タイトル・期限など）を同期
 */
export async function pushTaskUpdateToGoogleTasks(
  token: string,
  tasklistId: string,
  googleTaskId: string,
  patch: {
    title?: string;
    completed?: boolean;
    dueDate?: string | null;
  }
): Promise<void> {
  await gUpdateTask(token, tasklistId, googleTaskId, patch);
}

/**
 * Arca ➔ Google Tasks のタスクを削除
 */
export async function removeTaskFromGoogleTasks(
  token: string,
  tasklistId: string,
  googleTaskId: string
): Promise<void> {
  await gDeleteTask(token, tasklistId, googleTaskId);
}

// ─────────────────────────────────────────
// Google Tasks リスト自体の作成・更新・削除
// ─────────────────────────────────────────

export async function createGoogleTaskList(token: string, title: string): Promise<GTaskList> {
  return await gAddTaskList(token, title);
}

export async function renameGoogleTaskList(token: string, tasklistId: string, title: string): Promise<GTaskList> {
  return await gUpdateTaskList(token, tasklistId, title);
}

export async function deleteGoogleTaskList(token: string, tasklistId: string): Promise<void> {
  await gDeleteTaskList(token, tasklistId);
}

// ─────────────────────────────────────────
// 買い物リスト互換ラッパー (Lists.tsx / 既存テスト用)
// ─────────────────────────────────────────

export async function syncGoogleTasksToArca(
  token: string,
  tasklistId: string,
  providedExistingItems?: ListItem[]
): Promise<{ added: number; updated: number }> {
  const gTasks: GTask[] = await getTasks(token, tasklistId);
  let added = 0;
  let updated = 0;

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

export async function pushItemToGoogleTasks(
  token: string,
  tasklistId: string,
  text: string
): Promise<string> {
  return await gAddTask(token, tasklistId, text);
}

export async function pushStatusToGoogleTasks(
  token: string,
  tasklistId: string,
  googleTaskId: string,
  completed: boolean
): Promise<void> {
  await gUpdateTaskStatus(token, tasklistId, googleTaskId, completed);
}

export async function removeItemFromGoogleTasks(
  token: string,
  tasklistId: string,
  googleTaskId: string
): Promise<void> {
  await gDeleteTask(token, tasklistId, googleTaskId);
}
