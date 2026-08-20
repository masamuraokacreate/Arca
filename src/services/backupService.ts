/**
 * src/services/backupService.ts
 * Arca — 10年分のデータを守る Google Drive 連携 ＆ 完全バックアップ（エクスポート／インポート）
 *
 * 設計原則 (Core/Kernel.md & Core/Rules.md):
 *  - 「データは最重要資産」「10年分のデータを失わない」「データ自己所有の保証」
 *  - Lists, Tasks, Calendar, Notes の全データを完全構造化してJSON集約
 *  - Google Drive API v3 (Multipart Upload) への直接アップロード ＆ ローカル保存
 *  - 整合性バリデーション付きの復元（マージ / 完全上書き）
 */

import {
  collection,
  getDocs,
  doc,
  writeBatch,
  Timestamp,
} from "firebase/firestore";
import { db, auth } from "../lib/firebase";

// ─────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────

export interface BackupCounts {
  lists: number;
  tasks: number;
  events: number;
  notes: number;
  recipes?: number;
}

export interface BackupData {
  version: string;
  exportedAt: string;
  owner: string;
  counts: BackupCounts;
  data: {
    lists: Record<string, unknown>[];
    tasks: Record<string, unknown>[];
    events: Record<string, unknown>[];
    notes: Record<string, unknown>[];
    recipes?: Record<string, unknown>[];
  };
}

export interface BackupResult {
  fileName: string;
  uploadedAt: string;
  fileId?: string;
  counts: BackupCounts;
}

export interface RestoreResult {
  success: boolean;
  importedCounts: BackupCounts;
  mode: "merge" | "overwrite";
}

export interface LastBackupInfo {
  time: string;
  target: "drive" | "local";
  fileName: string;
  fileId?: string;
  counts?: BackupCounts;
}

const LS_LAST_BACKUP = "arca_last_backup_info";

// ─────────────────────────────────────────
// ユーティリティ
// ─────────────────────────────────────────

function formatDateTimeForFileName(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}${m}${day}_${hh}${mm}`;
}

/** Firestore ドキュメントの日時型フィールドなどを安全にシリアライズ */
function sanitizeDocData(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate: () => Date }).toDate === "function") {
      result[key] = (value as { toDate: () => Date }).toDate().toISOString();
    } else if (value && typeof value === "object" && "seconds" in value && "nanoseconds" in value) {
      const ts = value as { seconds: number; nanoseconds: number };
      result[key] = new Date(ts.seconds * 1000).toISOString();
    } else {
      result[key] = value;
    }
  }
  return result;
}

/** 復元時に日付フィールドを Firestore Timestamp に復元 */
function restoreDocData(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...data };
  delete result.id; // idはドキュメントキーとして使用

  for (const dateField of ["createdAt", "updatedAt"]) {
    if (result[dateField] && typeof result[dateField] === "string") {
      const date = new Date(result[dateField] as string);
      if (!isNaN(date.getTime())) {
        result[dateField] = Timestamp.fromDate(date);
      }
    }
  }
  return result;
}

// ─────────────────────────────────────────
// 最終バックアップ情報の永続化
// ─────────────────────────────────────────

export function getLastBackupInfo(): LastBackupInfo | null {
  try {
    const raw = localStorage.getItem(LS_LAST_BACKUP);
    if (!raw) return null;
    return JSON.parse(raw) as LastBackupInfo;
  } catch {
    return null;
  }
}

export function saveLastBackupInfo(info: LastBackupInfo): void {
  try {
    localStorage.setItem(LS_LAST_BACKUP, JSON.stringify(info));
  } catch (e) {
    console.warn("Failed to save last backup info to localStorage", e);
  }
}

// ─────────────────────────────────────────
// 1. バックアップデータ集約生成
// ─────────────────────────────────────────

/** 全モジュール（Lists, Tasks, Events, Notes, Recipes）の全データをFirestoreから集約 */
export async function generateBackupData(): Promise<BackupData> {
  const [listsSnap, tasksSnap, eventsSnap, notesSnap, recipesSnap] = await Promise.all([
    getDocs(collection(db, "lists")),
    getDocs(collection(db, "tasks")),
    getDocs(collection(db, "events")),
    getDocs(collection(db, "notes")),
    getDocs(collection(db, "recipes")),
  ]);

  const lists = listsSnap.docs.map((d) => ({
    id: d.id,
    ...sanitizeDocData(d.data()),
  }));

  const tasks = tasksSnap.docs.map((d) => ({
    id: d.id,
    ...sanitizeDocData(d.data()),
  }));

  const events = eventsSnap.docs.map((d) => ({
    id: d.id,
    ...sanitizeDocData(d.data()),
  }));

  const notes = notesSnap.docs.map((d) => ({
    id: d.id,
    ...sanitizeDocData(d.data()),
  }));

  const recipes = recipesSnap.docs.map((d) => ({
    id: d.id,
    ...sanitizeDocData(d.data()),
  }));

  const counts: BackupCounts = {
    lists: lists.length,
    tasks: tasks.length,
    events: events.length,
    notes: notes.length,
    recipes: recipes.length,
  };

  return {
    version: "1.0",
    exportedAt: new Date().toISOString(),
    owner: auth.currentUser?.email || "unknown",
    counts,
    data: {
      lists,
      tasks,
      events,
      notes,
      recipes,
    },
  };
}

// ─────────────────────────────────────────
// 2. ローカルダウンロード関数
// ─────────────────────────────────────────

/** ブラウザのファイルダウンロード機能で arca_backup_YYYYMMDD_HHmm.json を保存 */
export async function exportToJsonFile(preloadedData?: BackupData): Promise<BackupResult> {
  const backup = preloadedData || (await generateBackupData());
  const dateStr = formatDateTimeForFileName(new Date(backup.exportedAt));
  const fileName = `arca_backup_${dateStr}.json`;
  const jsonStr = JSON.stringify(backup, null, 2);

  const blob = new Blob([jsonStr], { type: "application/json;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  const result: BackupResult = {
    fileName,
    uploadedAt: backup.exportedAt,
    counts: backup.counts,
  };

  saveLastBackupInfo({
    time: backup.exportedAt,
    target: "local",
    fileName,
    counts: backup.counts,
  });

  return result;
}

// ─────────────────────────────────────────
// 3. Google Drive フォルダ管理 ＆ アップロード関数
// ─────────────────────────────────────────

/** 指定した親フォルダ内に指定名のフォルダが存在するか検索、なければ作成して folderId を返す */
export async function getOrCreateFolder(
  accessToken: string,
  folderName: string,
  parentFolderId: string = "root"
): Promise<string> {
  const query = `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and '${parentFolderId}' in parents and trashed = false`;
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id, name)&spaces=drive`;

  const searchRes = await fetch(searchUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!searchRes.ok) {
    const errorText = await searchRes.text().catch(() => "");
    const error = new Error(`Google Driveフォルダ検索に失敗しました (${searchRes.status}): ${errorText}`);
    (error as Error & { status: number }).status = searchRes.status;
    throw error;
  }

  const searchData = (await searchRes.json()) as { files?: { id: string; name: string }[] };
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  // 存在しない場合は新規作成
  const createRes = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentFolderId],
    }),
  });

  if (!createRes.ok) {
    const errorText = await createRes.text().catch(() => "");
    const error = new Error(`Google Driveフォルダ作成に失敗しました (${createRes.status}): ${errorText}`);
    (error as Error & { status: number }).status = createRes.status;
    throw error;
  }

  const createData = (await createRes.json()) as { id: string };
  return createData.id;
}

/** バックアップ保存用フォルダ（/800_Arca/810_バックアップ）を取得または自動作成 */
export async function getOrCreateBackupFolder(accessToken: string): Promise<string> {
  const arcaFolderId = await getOrCreateFolder(accessToken, "800_Arca", "root");
  const backupFolderId = await getOrCreateFolder(accessToken, "810_バックアップ", arcaFolderId);
  return backupFolderId;
}

/** Google Drive API v3 の Multipart Upload を使用してバックアップファイルを直接保存 */
export async function backupToGoogleDrive(
  accessToken: string,
  preloadedData?: BackupData
): Promise<BackupResult> {
  if (!accessToken) {
    throw new Error("Google Driveのアクセストークンが見つかりません。再接続してください。");
  }

  // 保存先フォルダ（/800_Arca/810_バックアップ）を取得または作成
  const backupFolderId = await getOrCreateBackupFolder(accessToken);

  const backup = preloadedData || (await generateBackupData());
  const dateStr = formatDateTimeForFileName(new Date(backup.exportedAt));
  const fileName = `arca_backup_${dateStr}.json`;
  const jsonStr = JSON.stringify(backup, null, 2);

  const boundary = "arca_backup_boundary_" + Date.now();
  const metadata = {
    name: fileName,
    mimeType: "application/json",
    description: `Arca OS Complete Backup (${backup.exportedAt})`,
    parents: [backupFolderId],
  };

  const multipartBody =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${jsonStr}\r\n` +
    `--${boundary}--`;

  const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body: multipartBody,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    const error = new Error(`Google Driveへのアップロードに失敗しました (${response.status}): ${errorText}`);
    (error as Error & { status: number }).status = response.status;
    throw error;
  }

  const data = (await response.json()) as { id: string; name: string };

  const result: BackupResult = {
    fileName: data.name || fileName,
    uploadedAt: backup.exportedAt,
    fileId: data.id,
    counts: backup.counts,
  };

  saveLastBackupInfo({
    time: backup.exportedAt,
    target: "drive",
    fileName: result.fileName,
    fileId: result.fileId,
    counts: backup.counts,
  });

  return result;
}

// ─────────────────────────────────────────
// 4. データ復元・インポート関数
// ─────────────────────────────────────────

/** JSON形式のバリデーションとFirestoreへの一括反映 */
export async function restoreFromJson(
  jsonInput: string | BackupData,
  mode: "merge" | "overwrite" = "merge"
): Promise<RestoreResult> {
  let backup: BackupData;

  if (typeof jsonInput === "string") {
    try {
      backup = JSON.parse(jsonInput) as BackupData;
    } catch {
      throw new Error("JSONの構文が正しくありません。正しいバックアップファイルを選択してください。");
    }
  } else {
    backup = jsonInput;
  }

  // 構造チェック
  if (!backup || typeof backup !== "object" || !backup.data) {
    throw new Error("Arcaのバックアップ形式として認識できません。");
  }

  const listsData = Array.isArray(backup.data.lists) ? backup.data.lists : [];
  const tasksData = Array.isArray(backup.data.tasks) ? backup.data.tasks : [];
  const eventsData = Array.isArray(backup.data.events) ? backup.data.events : [];
  const notesData = Array.isArray(backup.data.notes) ? backup.data.notes : [];
  const recipesData = Array.isArray(backup.data.recipes) ? backup.data.recipes : [];

  // 完全上書きモードの場合は既存データを削除
  if (mode === "overwrite") {
    const collectionsToClear = ["lists", "tasks", "events", "notes", "recipes"];
    for (const colName of collectionsToClear) {
      const snap = await getDocs(collection(db, colName));
      const chunks: typeof snap.docs[] = [];
      for (let i = 0; i < snap.docs.length; i += 450) {
        chunks.push(snap.docs.slice(i, i + 450));
      }

      for (const chunk of chunks) {
        const deleteBatch = writeBatch(db);
        chunk.forEach((d) => deleteBatch.delete(d.ref));
        await deleteBatch.commit();
      }
    }
  }

  // 各コレクションの書き込み
  const writeCollection = async (
    colName: string,
    items: Record<string, unknown>[]
  ) => {
    const chunks: Record<string, unknown>[][] = [];
    for (let i = 0; i < items.length; i += 450) {
      chunks.push(items.slice(i, i + 450));
    }

    for (const chunk of chunks) {
      const batch = writeBatch(db);
      for (const rawItem of chunk) {
        const itemId = (rawItem.id as string) || doc(collection(db, colName)).id;
        const cleanedData = restoreDocData(rawItem);
        const docRef = doc(db, colName, itemId);
        batch.set(docRef, cleanedData, { merge: mode === "merge" });
      }
      await batch.commit();
    }
  };

  await Promise.all([
    writeCollection("lists", listsData),
    writeCollection("tasks", tasksData),
    writeCollection("events", eventsData),
    writeCollection("notes", notesData),
    writeCollection("recipes", recipesData),
  ]);

  return {
    success: true,
    importedCounts: {
      lists: listsData.length,
      tasks: tasksData.length,
      events: eventsData.length,
      notes: notesData.length,
      recipes: recipesData.length,
    },
    mode,
  };
}
