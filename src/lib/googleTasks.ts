/**
 * Google Tasks REST API クライアント
 * ドキュメント: https://developers.google.com/tasks/reference/rest
 *
 * すべての関数はアクセストークンを受け取り、認証済みリクエストを行う。
 * 状態管理は行わず、純粋な非同期関数として定義する。
 */

const BASE_URL = "https://tasks.googleapis.com/tasks/v1";

// ---------- 型定義 ----------

export interface GTaskList {
  id: string;
  title: string;
}

export interface GTask {
  id: string;
  title: string;
  status: "needsAction" | "completed";
  due?: string; // RFC 3339 (e.g. "2026-08-20T00:00:00.000Z")
  notes?: string; // 詳細メモ
  completed?: string; // ISO 8601
  parent?: string; // 親タスクID（サブタスクの場合）
}

// ---------- ヘルパー ----------

async function gFetch<T>(
  token: string,
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Tasks API error ${res.status}: ${text}`);
  }

  // 204 No Content などボディなしのレスポンスに対応
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : ({} as T);
}

// ---------- タスクリスト ----------

/** ユーザーのタスクリスト一覧を取得する */
export async function getTaskLists(token: string): Promise<GTaskList[]> {
  const data = await gFetch<{ items?: GTaskList[] }>(
    token,
    "/users/@me/lists?maxResults=20"
  );
  return data.items ?? [];
}

/** 新しいタスクリストを作成する */
export async function addTaskList(
  token: string,
  title: string
): Promise<GTaskList> {
  return await gFetch<GTaskList>(token, "/users/@me/lists", {
    method: "POST",
    body: JSON.stringify({ title }),
  });
}

/** タスクリストの名前を変更する */
export async function updateTaskList(
  token: string,
  tasklistId: string,
  title: string
): Promise<GTaskList> {
  return await gFetch<GTaskList>(
    token,
    `/users/@me/lists/${encodeURIComponent(tasklistId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ title }),
    }
  );
}

/** タスクリストを削除する */
export async function deleteTaskList(
  token: string,
  tasklistId: string
): Promise<void> {
  await gFetch<void>(
    token,
    `/users/@me/lists/${encodeURIComponent(tasklistId)}`,
    {
      method: "DELETE",
    }
  );
}

/** 指定タスクリストのタスク一覧を取得する（ページネーション & 隠しタスク対応） */
export async function getTasks(
  token: string,
  tasklistId: string
): Promise<GTask[]> {
  const allTasks: GTask[] = [];
  let pageToken: string | undefined = undefined;

  do {
    const queryParams = new URLSearchParams({
      showCompleted: "true",
      showHidden: "true",
      maxResults: "100",
    });
    if (pageToken) {
      queryParams.set("pageToken", pageToken);
    }

    const data = await gFetch<{ items?: GTask[]; nextPageToken?: string }>(
      token,
      `/lists/${encodeURIComponent(tasklistId)}/tasks?${queryParams.toString()}`
    );

    if (data.items && data.items.length > 0) {
      allTasks.push(...data.items);
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return allTasks;
}

/** 新しいタスクをタスクリストに追加し、生成されたIDを返す */
export async function addTask(
  token: string,
  tasklistId: string,
  title: string,
  dueDate?: string, // "YYYY-MM-DD"
  notes?: string
): Promise<string> {
  const body: { title: string; due?: string; notes?: string } = { title };
  if (dueDate && /^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    body.due = `${dueDate}T00:00:00.000Z`;
  }
  if (notes !== undefined) {
    body.notes = notes;
  }

  const task = await gFetch<GTask>(
    token,
    `/lists/${encodeURIComponent(tasklistId)}/tasks`,
    {
      method: "POST",
      body: JSON.stringify(body),
    }
  );
  return task.id;
}

/** 新しいサブタスクを親タスクの配下に追加し、生成されたIDを返す */
export async function addSubTask(
  token: string,
  tasklistId: string,
  parentTaskId: string,
  title: string
): Promise<string> {
  const task = await gFetch<GTask>(
    token,
    `/lists/${encodeURIComponent(tasklistId)}/tasks?parent=${encodeURIComponent(parentTaskId)}`,
    {
      method: "POST",
      body: JSON.stringify({ title }),
    }
  );
  return task.id;
}

/** タスクの完了状態を更新する */
export async function updateTaskStatus(
  token: string,
  tasklistId: string,
  taskId: string,
  completed: boolean
): Promise<void> {
  await gFetch<GTask>(
    token,
    `/lists/${encodeURIComponent(tasklistId)}/tasks/${encodeURIComponent(taskId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        status: completed ? "completed" : "needsAction",
        ...(completed ? {} : { completed: null }),
      }),
    }
  );
}

/** タスクのタイトルや期限日、メモを更新する */
export async function updateTask(
  token: string,
  tasklistId: string,
  taskId: string,
  patch: {
    title?: string;
    completed?: boolean;
    dueDate?: string | null; // "YYYY-MM-DD" or null to clear
    notes?: string | null;
  }
): Promise<void> {
  const body: Record<string, unknown> = {};
  if (patch.title !== undefined) body.title = patch.title;
  if (patch.completed !== undefined) {
    body.status = patch.completed ? "completed" : "needsAction";
    if (!patch.completed) body.completed = null;
  }
  if (patch.dueDate !== undefined) {
    if (patch.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(patch.dueDate)) {
      body.due = `${patch.dueDate}T00:00:00.000Z`;
    } else {
      body.due = null;
    }
  }
  if (patch.notes !== undefined) {
    body.notes = patch.notes;
  }

  await gFetch<GTask>(
    token,
    `/lists/${encodeURIComponent(tasklistId)}/tasks/${encodeURIComponent(taskId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    }
  );
}

/** タスクを削除する */
export async function deleteTask(
  token: string,
  tasklistId: string,
  taskId: string
): Promise<void> {
  try {
    await gFetch<void>(
      token,
      `/lists/${encodeURIComponent(tasklistId)}/tasks/${encodeURIComponent(taskId)}`,
      {
        method: "DELETE",
      }
    );
  } catch (err: any) {
    // すでにGoogle側で削除済みの場合はエラーとせず正常終了
    if (err?.message && (err.message.includes("404") || err.message.includes("410"))) {
      console.info(`[Google Tasks] Task ${taskId} is already deleted on Google.`);
      return;
    }
    throw err;
  }
}
