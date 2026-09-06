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
  updateDoc,
  deleteDoc,
  setDoc,
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
  addSubTask as gAddSubTask,
  updateTask as gUpdateTask,
  updateTaskStatus as gUpdateTaskStatus,
  deleteTask as gDeleteTask,
  addTaskList as gAddTaskList,
  updateTaskList as gUpdateTaskList,
  deleteTaskList as gDeleteTaskList,
  type GTaskList,
  type GTask,
} from "../lib/googleTasks";
import type { TaskItem, ListItem, SubTaskItem } from "../types";

export const SHOPPING_LIST_NAMES = ["買い物リスト", "買い物", "お買い物", "Shopping List", "Shopping"];

/**
 * Google Tasks の notes 文字列から Arca のメモと優先度を抽出する
 */
export function parseGoogleTaskNotes(rawNotes?: string | null): {
  notes: string;
  priority: "low" | "medium" | "high";
} {
  if (!rawNotes) {
    return { notes: "", priority: "medium" };
  }

  let priority: "low" | "medium" | "high" = "medium";
  const lines = rawNotes.split("\n");
  const filteredLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^#priority:(high|medium|low)$/i.test(trimmed)) {
      const match = trimmed.match(/^#priority:(high|medium|low)$/i);
      if (match) {
        priority = match[1].toLowerCase() as "low" | "medium" | "high";
      }
      continue;
    }
    if (/^\[Arca\]\s*priority:\s*(high|medium|low)$/i.test(trimmed)) {
      const match = trimmed.match(/^\[Arca\]\s*priority:\s*(high|medium|low)$/i);
      if (match) {
        priority = match[1].toLowerCase() as "low" | "medium" | "high";
      }
      continue;
    }
    filteredLines.push(line);
  }

  const cleanNotes = filteredLines.join("\n").trim();
  return { notes: cleanNotes, priority };
}

/**
 * Arca のメモと優先度を Google Tasks 用の notes 文字列に結合する
 */
export function formatGoogleTaskNotes(
  notes?: string | null,
  priority?: "low" | "medium" | "high"
): string | undefined {
  const cleanNotes = (notes || "").trim();
  const priorityTag = priority && priority !== "medium" ? `#priority:${priority}` : "";

  if (!cleanNotes && !priorityTag) return undefined;
  if (cleanNotes && priorityTag) return `${cleanNotes}\n\n${priorityTag}`;
  return cleanNotes || priorityTag || undefined;
}

/**
 * Firestore内の重複タスクを安全にクレンジングする（Google APIへの削除は一切行わない）
 */
export async function cleanDuplicateTasks(
  existingTasks: TaskItem[]
): Promise<TaskItem[]> {
  const seenGoogleIds = new Set<string>();
  const seenTitleListIds = new Set<string>();
  const uniqueTasks: TaskItem[] = [];
  const duplicatesToDelete: TaskItem[] = [];

  for (const task of existingTasks) {
    let isDuplicate = false;

    if (task.googleTaskId) {
      if (seenGoogleIds.has(task.googleTaskId)) {
        isDuplicate = true;
      } else {
        seenGoogleIds.add(task.googleTaskId);
      }
    } else {
      const key = `${task.title.trim()}__${task.listId || "default"}`;
      if (seenTitleListIds.has(key)) {
        isDuplicate = true;
      } else {
        seenTitleListIds.add(key);
      }
    }

    if (isDuplicate) {
      duplicatesToDelete.push(task);
    } else {
      uniqueTasks.push(task);
    }
  }

  // 重複ドキュメントを Firestore から安全に削除（Google側には一切触らない）
  if (duplicatesToDelete.length > 0) {
    console.info(`[Google Tasks Sync] Cleaning up ${duplicatesToDelete.length} duplicate tasks in Firestore.`);
    for (const dup of duplicatesToDelete) {
      try {
        await deleteDoc(doc(db, "tasks", dup.id));
      } catch (delErr) {
        console.warn(`Failed to cleanup duplicate task document ${dup.id}:`, delErr);
      }
    }
  }

  return uniqueTasks;
}

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

// 同期多重実行防止用フラグ
let isTasksSyncInProgress = false;

/**
 * 指定の Google TaskList から Arca (tasks コレクション) への相互同期（サブタスク対応・完全クローン）
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

  let existingTasks: TaskItem[] = [];
  if (providedExistingTasks !== undefined) {
    existingTasks = [...providedExistingTasks];
  } else {
    try {
      const snap = await getDocs(query(collection(db, "tasks"), where("listId", "==", listId)));
      const listDocs = snap?.docs ? snap.docs.map((d) => {
        const rawData = typeof d.data === "function" ? d.data() : d.data;
        return {
          id: d.id,
          ...(rawData as Omit<TaskItem, "id">),
        };
      }) : [];

      let googleListDocs: TaskItem[] = [];
      if (googleListId && googleListId !== listId) {
        try {
          const gSnap = await getDocs(query(collection(db, "tasks"), where("googleListId", "==", googleListId)));
          googleListDocs = gSnap?.docs ? gSnap.docs.map((d) => {
            const rawData = typeof d.data === "function" ? d.data() : d.data;
            return {
              id: d.id,
              ...(rawData as Omit<TaskItem, "id">),
            };
          }) : [];
        } catch {
          // ignore
        }
      }

      const mergedMap = new Map<string, TaskItem>();
      for (const t of [...listDocs, ...googleListDocs]) {
        mergedMap.set(t.id, t);
      }
      existingTasks = Array.from(mergedMap.values());
    } catch {
      existingTasks = [];
    }
  }

  // 重複タスクの安全な自動クレンジング
  existingTasks = await cleanDuplicateTasks(existingTasks);

  // Google Tasks をトップレベルタスクとサブタスクに分離
  const topLevelGTasks = gTasks.filter((g) => !g.parent);
  const subGTasks = gTasks.filter((g) => !!g.parent);

  const fetchedGoogleIdSet = new Set<string>();

  // 1. トップレベルタスクの同期（Googleマスター・完全クローン）
  for (const gTask of topLevelGTasks) {
    fetchedGoogleIdSet.add(gTask.id);
    const isCompleted = gTask.status === "completed";
    const title = (gTask.title || "").trim();
    if (!title) continue;

    const parsedDue = gTask.due ? gTask.due.split("T")[0] : null;
    const { notes, priority } = parseGoogleTaskNotes(gTask.notes);

    // 1) googleTaskId または docId が完全一致するアイテムが存在するか確認
    const matchById = existingTasks.find(
      (item) => item.googleTaskId === gTask.id || item.id === gTask.id
    );

    if (matchById) {
      const hasDiff =
        matchById.completed !== isCompleted ||
        matchById.title.trim() !== title ||
        (matchById.dueDate || null) !== parsedDue ||
        (matchById.notes || "") !== notes ||
        (matchById.priority || "medium") !== priority ||
        (matchById.listId || "default") !== listId;

      if (hasDiff) {
        await updateDoc(doc(db, "tasks", matchById.id), {
          completed: isCompleted,
          title,
          dueDate: parsedDue,
          notes,
          priority,
          listId,
          googleTaskId: gTask.id,
          googleListId,
        });
        matchById.completed = isCompleted;
        matchById.title = title;
        matchById.dueDate = parsedDue;
        matchById.notes = notes;
        matchById.priority = priority;
        matchById.listId = listId;
        matchById.googleTaskId = gTask.id;
        matchById.googleListId = googleListId;
        updated++;
      }
      continue;
    }

    // 2) 同一タイトル（かつ未紐付け）のアイテムが同一リスト内に既に存在するか確認（初回紐付け）
    const matchByTitle = existingTasks.find(
      (item) =>
        !item.googleTaskId &&
        (item.listId || "default") === listId &&
        item.title.trim() === title
    );

    if (matchByTitle) {
      await updateDoc(doc(db, "tasks", matchByTitle.id), {
        googleTaskId: gTask.id,
        googleListId,
        completed: isCompleted,
        dueDate: parsedDue || matchByTitle.dueDate || null,
        notes: notes || matchByTitle.notes || "",
        priority: priority !== "medium" ? priority : (matchByTitle.priority || "medium"),
      });
      matchByTitle.googleTaskId = gTask.id;
      matchByTitle.googleListId = googleListId;
      matchByTitle.completed = isCompleted;
      if (parsedDue) matchByTitle.dueDate = parsedDue;
      if (notes) matchByTitle.notes = notes;
      updated++;
      continue;
    }

    // 3) どちらにも該当しない場合：ドキュメントIDを Google Task ID に固定して setDoc（決定論的クローン）
    await setDoc(doc(db, "tasks", gTask.id), {
      title,
      dueDate: parsedDue,
      completed: isCompleted,
      notes,
      priority,
      listId,
      googleTaskId: gTask.id,
      googleListId,
      subtasks: [],
      createdAt: serverTimestamp(),
    });
    existingTasks.push({
      id: gTask.id,
      title,
      dueDate: parsedDue,
      completed: isCompleted,
      notes,
      priority,
      listId,
      googleTaskId: gTask.id,
      googleListId,
      subtasks: [],
      createdAt: null,
    });
    added++;
  }

  // 2. サブタスクの相互同期
  const parentTasksToUpdate = new Set<TaskItem>();

  // 2-1: Google側のサブタスクを対応する親タスクにマージ
  for (const gSub of subGTasks) {
    const subTitle = (gSub.title || "").trim();
    if (!subTitle) continue;
    const isSubCompleted = gSub.status === "completed";

    // 過去の同期等で独立したメインタスクとして Firestore に誤登録されていた場合は自動クレンジング
    const orphanTaskIndex = existingTasks.findIndex((t) => t.googleTaskId === gSub.id);
    if (orphanTaskIndex !== -1) {
      const orphanTask = existingTasks[orphanTaskIndex];
      try {
        await deleteDoc(doc(db, "tasks", orphanTask.id));
        existingTasks.splice(orphanTaskIndex, 1);
      } catch (delErr) {
        console.warn(`Failed to cleanup orphan subtask document ${orphanTask.id}:`, delErr);
      }
    }

    // 親タスクを特定
    const parentTask = existingTasks.find((t) => t.googleTaskId === gSub.parent);
    if (!parentTask) continue;

    if (!parentTask.subtasks) {
      parentTask.subtasks = [];
    }

    // サブタスクのIDまたはタイトルでマッチング
    const matchSub = parentTask.subtasks.find(
      (st) => st.googleTaskId === gSub.id || (!st.googleTaskId && st.title.trim() === subTitle)
    );

    if (matchSub) {
      const hasSubDiff =
        matchSub.completed !== isSubCompleted ||
        matchSub.title.trim() !== subTitle ||
        matchSub.googleTaskId !== gSub.id;

      if (hasSubDiff) {
        matchSub.completed = isSubCompleted;
        matchSub.title = subTitle;
        matchSub.googleTaskId = gSub.id;
        parentTasksToUpdate.add(parentTask);
      }
    } else {
      // Google側で新しく追加されたサブタスク
      const newSub: SubTaskItem = {
        id: "sub-" + Math.random().toString(36).slice(2, 9),
        title: subTitle,
        completed: isSubCompleted,
        googleTaskId: gSub.id,
      };
      parentTask.subtasks.push(newSub);
      parentTasksToUpdate.add(parentTask);
    }
  }

  // 2-2: Arca 側にあって Google 側にまだないサブタスクを Google Tasks へプッシュ
  for (const task of existingTasks) {
    if (!task.googleTaskId || !task.subtasks || task.subtasks.length === 0) continue;

    for (const st of task.subtasks) {
      if (!st.googleTaskId) {
        try {
          const newGSubId = await gAddSubTask(token, googleListId, task.googleTaskId, st.title);
          st.googleTaskId = newGSubId;
          if (st.completed) {
            await gUpdateTaskStatus(token, googleListId, newGSubId, true);
          }
          parentTasksToUpdate.add(task);
        } catch (gSubErr) {
          console.warn(`Failed to push subtask "${st.title}" to Google Tasks:`, gSubErr);
        }
      }
    }
  }

  // 2-3: サブタスクに変更があった親タスクを Firestore に一括保存
  for (const parentTask of parentTasksToUpdate) {
    await updateDoc(doc(db, "tasks", parentTask.id), {
      subtasks: parentTask.subtasks || [],
    });
    updated++;
  }

  // 3. Google Tasks 側で削除されたタスクの追従削除（Reconciliation）
  // そのリストに属するタスクのうち、Googleの取得結果に含まれないものをFirestoreから削除
  for (const task of existingTasks) {
    if (task.googleTaskId && !fetchedGoogleIdSet.has(task.googleTaskId)) {
      try {
        await deleteDoc(doc(db, "tasks", task.id));
      } catch (delErr) {
        console.warn(`Failed to cleanup removed Google task ${task.id}:`, delErr);
      }
    }
  }

  return { added, updated };
}

/**
 * 全Google Tasksリスト（マイタスク、買い物リスト、カスタムリスト）を一括同期
 */
export async function syncAllGoogleTasks(
  token: string
): Promise<{ added: number; updated: number }> {
  if (isTasksSyncInProgress) {
    return { added: 0, updated: 0 };
  }
  isTasksSyncInProgress = true;

  try {
    const lists = await getTaskLists(token);
    if (!lists || lists.length === 0) {
      return { added: 0, updated: 0 };
    }

    let totalAdded = 0;
    let totalUpdated = 0;

    for (const gl of lists) {
      const isMyTasks = gl.title === "My Tasks" || gl.title === "マイタスク" || gl.id === "@default";
      const isShop = SHOPPING_LIST_NAMES.some((name) => gl.title.trim() === name);

      let listId = gl.id;
      if (isMyTasks) {
        listId = "default";
      } else if (isShop) {
        listId = "shopping";
      }

      try {
        const res = await syncGoogleTasksForList(token, gl.id, listId);
        totalAdded += res.added;
        totalUpdated += res.updated;
      } catch (err) {
        console.warn(`Failed to sync Google Tasks list ${gl.title} (${gl.id}):`, err);
      }
    }

    return { added: totalAdded, updated: totalUpdated };
  } finally {
    isTasksSyncInProgress = false;
  }
}

/**
 * Arca ➔ Google Tasks へタスクを追加し、生成された Google Task ID を返す
 */
export async function pushTaskToGoogleTasks(
  token: string,
  tasklistId: string,
  title: string,
  dueDate?: string | null,
  notes?: string | null,
  priority?: "low" | "medium" | "high"
): Promise<string> {
  const formattedNotes = formatGoogleTaskNotes(notes, priority);
  return await gAddTask(token, tasklistId, title, dueDate || undefined, formattedNotes);
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
 * Arca ➔ Google Tasks のタスク内容（タイトル・期限・メモ・優先度など）を同期
 */
export async function pushTaskUpdateToGoogleTasks(
  token: string,
  tasklistId: string,
  googleTaskId: string,
  patch: {
    title?: string;
    completed?: boolean;
    dueDate?: string | null;
    notes?: string | null;
    priority?: "low" | "medium" | "high";
  }
): Promise<void> {
  const formattedNotes =
    patch.notes !== undefined || patch.priority !== undefined
      ? formatGoogleTaskNotes(patch.notes, patch.priority)
      : undefined;

  await gUpdateTask(token, tasklistId, googleTaskId, {
    title: patch.title,
    completed: patch.completed,
    dueDate: patch.dueDate,
    ...(formattedNotes !== undefined ? { notes: formattedNotes } : {}),
  });
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

/**
 * 複数の Google Task を適切な並列度（デフォルト5件同時）でバックグラウンド並列削除
 */
export async function batchRemoveTasksFromGoogleTasks(
  token: string,
  tasks: Array<{ tasklistId: string; googleTaskId: string }>,
  concurrency: number = 5
): Promise<PromiseSettledResult<void>[]> {
  const results: PromiseSettledResult<void>[] = [];
  for (let i = 0; i < tasks.length; i += concurrency) {
    const chunk = tasks.slice(i, i + concurrency);
    const chunkResults = await Promise.allSettled(
      chunk.map((item) => removeTaskFromGoogleTasks(token, item.tasklistId, item.googleTaskId))
    );
    results.push(...chunkResults);
  }
  return results;
}

/**
 * Arca ➔ Google Tasks へサブタスクを追加し、生成された Google Task ID を返す
 */
export async function pushSubTaskToGoogleTasks(
  token: string,
  tasklistId: string,
  parentTaskId: string,
  title: string
): Promise<string> {
  return await gAddSubTask(token, tasklistId, parentTaskId, title);
}

/**
 * Arca ➔ Google Tasks のサブタスク完了状態を同期
 */
export async function pushSubTaskStatusToGoogleTasks(
  token: string,
  tasklistId: string,
  googleSubTaskId: string,
  completed: boolean
): Promise<void> {
  await gUpdateTaskStatus(token, tasklistId, googleSubTaskId, completed);
}

/**
 * Arca ➔ Google Tasks のサブタスク内容を更新
 */
export async function pushSubTaskUpdateToGoogleTasks(
  token: string,
  tasklistId: string,
  googleSubTaskId: string,
  patch: {
    title?: string;
    completed?: boolean;
  }
): Promise<void> {
  await gUpdateTask(token, tasklistId, googleSubTaskId, patch);
}

/**
 * Arca ➔ Google Tasks のサブタスクを削除
 */
export async function removeSubTaskFromGoogleTasks(
  token: string,
  tasklistId: string,
  googleSubTaskId: string
): Promise<void> {
  await gDeleteTask(token, tasklistId, googleSubTaskId);
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
// 買い物リスト互換ラッパー (tasks コレクションへ一本化)
// ─────────────────────────────────────────

export async function syncGoogleTasksToArca(
  token: string,
  tasklistId: string,
  providedExistingItems?: (ListItem | TaskItem)[]
): Promise<{ added: number; updated: number }> {
  // tasks コレクションの "shopping" リストとして同期実行
  const tasks = providedExistingItems
    ? providedExistingItems.map((item) => ({
        id: item.id,
        title: "title" in item ? item.title : (item as any).text,
        completed: item.completed,
        googleTaskId: item.googleTaskId,
        listId: "shopping",
      })) as TaskItem[]
    : undefined;
  return await syncGoogleTasksForList(token, tasklistId, "shopping", tasks);
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
