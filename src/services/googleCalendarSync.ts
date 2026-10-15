/**
 * src/services/googleCalendarSync.ts
 * Google カレンダー双方向同期サービス (マイカレンダー 'primary' 限定)
 *
 * 設計原則 (Core/Rules.md / Core/Kernel.md):
 * - Arcaがマスター/ローカルファースト、AIや同期は裏方で静かに支える
 * - 重複のない厳密な冪等性（googleEventId による Upsert）
 * - primary カレンダー以外は一切触れない安全性
 */

import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  getDocs,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { clearSavedToken } from "./googleAuth";
import type { CalendarEvent } from "../types";
import { isWorkEvent, saveShiftOverride } from "./pmCycleService";

const CALENDAR_API_ROOT = "https://www.googleapis.com/calendar/v3";
const CALENDAR_BASE_URL = "https://www.googleapis.com/calendar/v3/calendars/primary";

/** Google Calendar API カスタムエラー */
export class GoogleCalendarApiError extends Error {
  status: number;
  endpoint: string;
  errorData?: any;

  constructor(status: number, endpoint: string, message: string, errorData?: any) {
    super(`Google Calendar API error ${status} at ${endpoint}: ${message}`);
    this.name = "GoogleCalendarApiError";
    this.status = status;
    this.endpoint = endpoint;
    this.errorData = errorData;
  }

  /** スコープ不足エラー (403 ACCESS_TOKEN_SCOPE_INSUFFICIENT) */
  isScopeInsufficient(): boolean {
    return this.status === 403;
  }

  /** 認証切れ・無効トークン (401 Unauthorized) */
  isUnauthorized(): boolean {
    return this.status === 401;
  }
}

export interface GoogleCalendarListItem {
  id: string;
  summary: string;
  primary?: boolean;
  description?: string;
}

export interface GoogleCalendarListResponse {
  items?: GoogleCalendarListItem[];
}

export interface GoogleCalendarApiEvent {
  id: string;
  summary?: string;
  description?: string;
  start?: {
    date?: string; // "YYYY-MM-DD"
    dateTime?: string; // ISO 8601
    timeZone?: string;
  };
  end?: {
    date?: string;
    dateTime?: string;
    timeZone?: string;
  };
  status?: string; // "confirmed" | "tentative" | "cancelled"
}

export interface GoogleCalendarEventsResponse {
  items?: GoogleCalendarApiEvent[];
  nextPageToken?: string;
}

/** 共通の認証付き Google Calendar API フェッチ関数 */
async function calendarFetch<T>(
  token: string,
  urlOrPath: string,
  options?: RequestInit
): Promise<T> {
  const url = urlOrPath.startsWith("http") ? urlOrPath : `${CALENDAR_BASE_URL}${urlOrPath}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    let errorData: any;
    try {
      errorData = JSON.parse(text);
    } catch {
      errorData = text;
    }

    // 401 (認証切れ) または 403 (スコープ不足等) の場合、無効なトークンを自動破棄
    if (res.status === 401 || res.status === 403) {
      clearSavedToken();
      const reason =
        res.status === 403
          ? "スコープ権限不足 (ACCESS_TOKEN_SCOPE_INSUFFICIENT) のため、再同意・再認証が必要です。"
          : "認証有効期限切れのため、再認証が必要です。";
      console.error(
        `[Google Calendar Error] ${res.status} at ${url}: ${reason}\n詳細:`,
        errorData
      );
    } else {
      console.error(`[Google Calendar Error] ${res.status} at ${url}:`, errorData);
    }

    throw new GoogleCalendarApiError(
      res.status,
      url,
      typeof errorData === "object" ? JSON.stringify(errorData) : text,
      errorData
    );
  }

  if (res.status === 204) {
    return {} as T;
  }

  const text = await res.text();
  return text ? (JSON.parse(text) as T) : ({} as T);
}

/** 時刻文字列 ("HH:MM") に指定分数（デフォルト510分 = 8時間30分）を加算した時刻文字列 ("HH:MM") を返す */
export function addMinutesToTime(timeStr: string, minutesToAdd: number = 510): string {
  if (!timeStr || !/^\d{1,2}:\d{2}$/.test(timeStr)) {
    return timeStr || "";
  }
  const [h, m] = timeStr.split(":").map(Number);
  const totalMinutes = (h * 60 + m + minutesToAdd) % (24 * 60);
  const normalizedMinutes = totalMinutes < 0 ? totalMinutes + 24 * 60 : totalMinutes;
  const newH = Math.floor(normalizedMinutes / 60);
  const newM = normalizedMinutes % 60;
  return `${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}`;
}

/** ISO文字列または日付文字列から Arca 形式の date ("YYYY-MM-DD") と time ("HH:MM") を抽出 */
export function parseGoogleEventDateTime(
  start?: { date?: string; dateTime?: string },
  end?: { date?: string; dateTime?: string }
): { date: string; startTime: string; endTime: string } {
  if (start?.dateTime) {
    const startDate = new Date(start.dateTime);
    const date = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, "0")}-${String(startDate.getDate()).padStart(2, "0")}`;
    const startTime = `${String(startDate.getHours()).padStart(2, "0")}:${String(startDate.getMinutes()).padStart(2, "0")}`;

    let endTime = "";
    if (end?.dateTime) {
      const endDate = new Date(end.dateTime);
      endTime = `${String(endDate.getHours()).padStart(2, "0")}:${String(endDate.getMinutes()).padStart(2, "0")}`;
    }

    return { date, startTime, endTime };
  }

  if (start?.date) {
    return {
      date: start.date,
      startTime: "",
      endTime: "",
    };
  }

  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return { date: today, startTime: "", endTime: "" };
}

/** Arca の予定データから Google Calendar API 用のリクエストボディを作成 */
export function formatToGoogleEventBody(event: {
  title: string;
  date: string;
  startTime?: string;
  endTime?: string;
  note?: string;
}): {
  summary: string;
  description: string;
  start: { date?: string; dateTime?: string; timeZone?: string };
  end: { date?: string; dateTime?: string; timeZone?: string };
} {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Tokyo";
  const title = event.title || "(無題)";
  const description = event.note || "";

  if (event.startTime && /^\d{1,2}:\d{2}$/.test(event.startTime)) {
    const [startY, startMonth, startDay] = event.date.split("-").map(Number);
    const [startH, startM] = event.startTime.split(":").map(Number);
    const startDate = new Date(startY, startMonth - 1, startDay, startH, startM, 0);

    let endDate = new Date(startDate);
    if (event.endTime && /^\d{1,2}:\d{2}$/.test(event.endTime)) {
      const [endH, endM] = event.endTime.split(":").map(Number);
      if (endH >= 24) {
        // 24:00 や 24:30 などの翌日表記
        endDate = new Date(startY, startMonth - 1, startDay + 1, endH - 24, endM, 0);
      } else if (endH < startH || (endH === startH && endM < startM)) {
        // 日跨ぎ（終了時刻が開始時刻より前、例: 16:00〜00:30）
        endDate = new Date(startY, startMonth - 1, startDay + 1, endH, endM, 0);
      } else {
        endDate = new Date(startY, startMonth - 1, startDay, endH, endM, 0);
      }
    }

    return {
      summary: title,
      description,
      start: { dateTime: startDate.toISOString(), timeZone },
      end: { dateTime: endDate.toISOString(), timeZone },
    };
  }

  // 終日イベント
  return {
    summary: title,
    description,
    start: { date: event.date },
    end: { date: event.date },
  };
}

/**
 * ユーザーのカレンダー一覧を取得する
 */
export async function fetchUserCalendarList(
  token: string
): Promise<GoogleCalendarListItem[]> {
  try {
    const data = await calendarFetch<GoogleCalendarListResponse>(
      token,
      `${CALENDAR_API_ROOT}/users/me/calendarList`
    );
    return data.items || [];
  } catch (err) {
    // 401 (認証切れ) または 403 (スコープ不足) の場合は上位に再スローして再同意を促す
    if (err instanceof GoogleCalendarApiError && (err.isUnauthorized() || err.isScopeInsufficient())) {
      throw err;
    }
    console.warn("fetchUserCalendarList failed, fallback to primary:", err);
    return [{ id: "primary", summary: "Primary", primary: true }];
  }
}

/**
 * 指定したカレンダー ID からイベントを取得する
 */
export async function fetchEventsFromCalendar(
  token: string,
  calendarId: string,
  timeMin?: string,
  timeMax?: string
): Promise<GoogleCalendarApiEvent[]> {
  const now = new Date();
  // 当月1日の1ヶ月前 (前月1日 00:00:00)
  const defaultMin = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0).toISOString();
  // 当月末日の1ヶ月後 (翌月末日 23:59:59.999 = 翌々月0日)
  const defaultMax = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59, 999).toISOString();

  const min = timeMin || defaultMin;
  const max = timeMax || defaultMax;

  const params = new URLSearchParams({
    timeMin: min,
    timeMax: max,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });

  const data = await calendarFetch<GoogleCalendarEventsResponse>(
    token,
    `${CALENDAR_API_ROOT}/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`
  );

  return (data.items || []).filter(
    (item) => item.status !== "cancelled" && item.id
  );
}

/**
 * マイカレンダー ('primary') から指定期間のイベントを取得する（後方互換対応）
 */
export async function fetchPrimaryCalendarEvents(
  token: string,
  timeMin?: string,
  timeMax?: string
): Promise<GoogleCalendarApiEvent[]> {
  return fetchEventsFromCalendar(token, "primary", timeMin, timeMax);
}

/**
 * Google カレンダーに予定を新規作成し、Google Event ID を返す
 */
export async function createGoogleCalendarEvent(
  token: string,
  event: {
    title: string;
    date: string;
    startTime?: string;
    endTime?: string;
    note?: string;
  }
): Promise<string> {
  const body = formatToGoogleEventBody(event);
  const created = await calendarFetch<GoogleCalendarApiEvent>(token, "/events", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return created.id;
}

/**
 * Google カレンダーの予定を更新する
 */
export async function updateGoogleCalendarEvent(
  token: string,
  googleEventId: string,
  event: {
    title: string;
    date: string;
    startTime?: string;
    endTime?: string;
    note?: string;
  },
  calendarId: string = "primary"
): Promise<void> {
  const body = formatToGoogleEventBody(event);
  await calendarFetch<GoogleCalendarApiEvent>(
    token,
    `${CALENDAR_API_ROOT}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(googleEventId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    }
  );
}

/**
 * 複数日（4連勤ワンシフト等）の出勤イベントを一括更新・作成する
 *
 * 各対象日について:
 * 1. 既存の出勤イベントが存在する場合:
 *    - Google 連携中かつ googleEventId があれば updateGoogleCalendarEvent を実行（404時は新規作成へフォールバック）
 *    - Google 連携中で googleEventId が未紐付けの場合は createGoogleCalendarEvent を実行してIDを紐付け
 *    - Firestore ドキュメントを updateDoc で更新
 * 2. 既存の出勤イベントが存在しない場合:
 *    - Google 連携中なら createGoogleCalendarEvent で Google イベントを作成
 *    - Firestore ドキュメントを addDoc で新規追加
 *
 * @param token Google Access Token (未ログイン時は null)
 * @param dates 対象日配列（例: 4日間の日付配列）
 * @param shiftData タイトル、開始時刻、終了時刻、メモ
 * @param existingEvents 既存の CalendarEvent 配列
 */
export async function batchUpdateShiftEvents(
  token: string | null | undefined,
  dates: string[],
  shiftData: {
    title: string;
    startTime: string;
    endTime: string;
    note?: string;
  },
  existingEvents: CalendarEvent[]
): Promise<void> {
  for (const date of dates) {
    const existingWork = existingEvents.find(
      (e) => e.date === date && isWorkEvent(e.title)
    );

    if (existingWork) {
      // 1. 既存イベントの更新
      let currentGoogleId = existingWork.googleEventId;

      if (token) {
        if (currentGoogleId) {
          try {
            await updateGoogleCalendarEvent(token, currentGoogleId, {
              title: shiftData.title,
              date,
              startTime: shiftData.startTime,
              endTime: shiftData.endTime,
              note: shiftData.note ?? existingWork.note,
            });
          } catch (gErr) {
            console.error(`[Google Calendar Sync] Failed to update event on ${date}:`, gErr);
            // 404（Google側で削除されたなど）の場合は新規作成へフォールバック
            if (gErr instanceof GoogleCalendarApiError && gErr.status === 404) {
              try {
                const recreatedId = await createGoogleCalendarEvent(token, {
                  title: shiftData.title,
                  date,
                  startTime: shiftData.startTime,
                  endTime: shiftData.endTime,
                  note: shiftData.note ?? existingWork.note,
                });
                if (recreatedId) currentGoogleId = recreatedId;
              } catch (cErr) {
                console.error(`[Google Calendar Sync] Fallback creation failed on ${date}:`, cErr);
              }
            }
          }
        } else {
          // Google イベント ID が未紐付けの場合は新規作成して紐付け
          try {
            const newGId = await createGoogleCalendarEvent(token, {
              title: shiftData.title,
              date,
              startTime: shiftData.startTime,
              endTime: shiftData.endTime,
              note: shiftData.note ?? existingWork.note,
            });
            if (newGId) currentGoogleId = newGId;
          } catch (gErr) {
            console.error(`[Google Calendar Sync] Failed to create unlinked event on ${date}:`, gErr);
          }
        }
      }

      await updateDoc(doc(db, "events", existingWork.id), {
        title: shiftData.title,
        startTime: shiftData.startTime,
        endTime: shiftData.endTime,
        ...(shiftData.note !== undefined ? { note: shiftData.note } : {}),
        googleEventId: currentGoogleId || null,
      });
    } else {
      // 2. 新規イベントの作成
      let newGoogleId: string | undefined;
      if (token) {
        try {
          newGoogleId = await createGoogleCalendarEvent(token, {
            title: shiftData.title,
            date,
            startTime: shiftData.startTime,
            endTime: shiftData.endTime,
            note: shiftData.note || "",
          });
        } catch (gErr) {
          console.error(`[Google Calendar Sync] Failed to create event on ${date}:`, gErr);
        }
      }

      await addDoc(collection(db, "events"), {
        title: shiftData.title,
        date,
        startTime: shiftData.startTime,
        endTime: shiftData.endTime,
        note: shiftData.note || "",
        googleEventId: newGoogleId || null,
        createdAt: serverTimestamp(),
      });
    }
  }
}

/**
 * シフト名から標準的な勤務開始・終了時刻を決定するヘルパー（デフォルト拘束時間: 8.5時間 / 510分）
 */
export function resolveShiftTimes(
  shiftName?: string,
  userStart?: string,
  userEnd?: string
): { startTime: string; endTime: string } {
  if (userStart && userEnd) {
    return { startTime: userStart, endTime: userEnd };
  }
  const name = (shiftName || "").trim();
  if (/早番/i.test(name)) {
    return { startTime: "06:00", endTime: "14:30" };
  }
  if (/遅番.*16/i.test(name)) {
    return { startTime: "16:00", endTime: "00:30" };
  }
  if (/遅番/i.test(name)) {
    return { startTime: "15:00", endTime: "23:30" };
  }
  if (/日勤/i.test(name)) {
    return { startTime: "08:30", endTime: "17:00" };
  }
  if (/当直|夜勤/i.test(name)) {
    return { startTime: "16:00", endTime: "09:00" };
  }
  return {
    startTime: userStart || "06:00",
    endTime: userEnd || (userStart ? addMinutesToTime(userStart, 510) : "14:30"),
  };
}

export interface ApplyShiftStatusParams {
  date: string; // "YYYY-MM-DD"
  type: "work" | "holiday";
  streakNumber?: number;
  shiftName?: string;
  startTime?: string;
  endTime?: string;
  isReset?: boolean;
}

/**
 * 出勤ステータス手動調整を Google カレンダーおよび Firestore に反映する
 *
 * 1. isReset === true（自動判定に戻す場合）:
 *    - Firestore の手動オーバーライドを解除 (saveShiftOverride(date, null))
 * 2. type === "holiday"（休日に設定する場合）:
 *    - 該当日の既存出勤予定（isWorkEvent）を Google カレンダーから削除
 *    - Firestore の events コレクションからも削除
 *    - Firestore の手動オーバーライドを「休日」として保存
 * 3. type === "work"（出勤に設定する場合）:
 *    - シフト名に応じた開始・終了時刻を決定（デフォルト8.5時間 / 510分）
 *    - 該当日に既存の出勤予定があれば Google カレンダー更新＆Firestore 更新（404時は新規作成フォールバック）
 *    - 該当日に出勤予定がなければ Google カレンダー新規作成＆Firestore 新規作成
 *    - Firestore の手動オーバーライドを「出勤」として保存
 */
export async function applyShiftStatusToGoogleCalendar(
  token: string | null | undefined,
  params: ApplyShiftStatusParams,
  existingEvents: CalendarEvent[]
): Promise<{ success: boolean; eventId?: string }> {
  // 1. 自動判定へのリセット
  if (params.isReset) {
    await saveShiftOverride(params.date, null);
    return { success: true };
  }

  // 2. 休日への変更
  if (params.type === "holiday") {
    const workEvents = existingEvents.filter(
      (e) => e.date === params.date && isWorkEvent(e.title)
    );

    for (const ev of workEvents) {
      if (token && ev.googleEventId) {
        try {
          await deleteGoogleCalendarEvent(token, ev.googleEventId);
        } catch (err) {
          console.error(`[Google Calendar Sync] Failed to delete event on ${params.date}:`, err);
        }
      }
      try {
        await deleteDoc(doc(db, "events", ev.id));
      } catch (err) {
        console.error(`[Firestore] Failed to delete event ${ev.id}:`, err);
      }
    }

    await saveShiftOverride(params.date, {
      type: "holiday",
      streakNumber: params.streakNumber || 1,
    });

    return { success: true };
  }

  // 3. 出勤への変更
  const title = (params.shiftName || "出勤").trim();
  const { startTime, endTime } = resolveShiftTimes(
    params.shiftName,
    params.startTime,
    params.endTime
  );

  const existingWork = existingEvents.find(
    (e) => e.date === params.date && isWorkEvent(e.title)
  );

  let targetEventId: string | undefined;

  if (existingWork) {
    targetEventId = existingWork.id;
    let googleId = existingWork.googleEventId;

    if (token) {
      if (googleId) {
        try {
          await updateGoogleCalendarEvent(token, googleId, {
            title,
            date: params.date,
            startTime,
            endTime,
          });
        } catch (gErr) {
          console.error(`[Google Calendar Sync] Failed to update event on ${params.date}:`, gErr);
          // 404時は新規作成へフォールバック
          if (gErr instanceof GoogleCalendarApiError && gErr.status === 404) {
            try {
              const newGId = await createGoogleCalendarEvent(token, {
                title,
                date: params.date,
                startTime,
                endTime,
              });
              if (newGId) googleId = newGId;
            } catch (cErr) {
              console.error(`[Google Calendar Sync] Fallback creation failed on ${params.date}:`, cErr);
            }
          }
        }
      } else {
        // Google イベント ID が未紐付けの場合は新規作成して紐付け
        try {
          const newGId = await createGoogleCalendarEvent(token, {
            title,
            date: params.date,
            startTime,
            endTime,
          });
          if (newGId) {
            googleId = newGId;
          }
        } catch (gErr) {
          console.error(`[Google Calendar Sync] Failed to create event on ${params.date}:`, gErr);
        }
      }
    }

    await updateDoc(doc(db, "events", existingWork.id), {
      title,
      startTime,
      endTime,
      googleEventId: googleId || null,
    });
  } else {
    let newGoogleId: string | undefined;
    if (token) {
      try {
        newGoogleId = await createGoogleCalendarEvent(token, {
          title,
          date: params.date,
          startTime,
          endTime,
        });
      } catch (gErr) {
        console.error(`[Google Calendar Sync] Failed to create event on ${params.date}:`, gErr);
      }
    }

    const docRef = await addDoc(collection(db, "events"), {
      title,
      date: params.date,
      startTime,
      endTime,
      note: "",
      googleEventId: newGoogleId || null,
      createdAt: serverTimestamp(),
    });
    targetEventId = docRef.id;
  }

  await saveShiftOverride(params.date, {
    type: "work",
    streakNumber: params.streakNumber || 1,
    shiftName: title,
  });

  return { success: true, eventId: targetEventId };
}

/**
 * Google カレンダーの予定を削除する（すでに削除済みの 410/404 は正常終了として扱う）
 */
export async function deleteGoogleCalendarEvent(
  token: string,
  googleEventId: string
): Promise<void> {
  try {
    await calendarFetch<void>(
      token,
      `/events/${encodeURIComponent(googleEventId)}`,
      {
        method: "DELETE",
      }
    );
  } catch (err) {
    // 410 (Gone: Resource has been deleted) または 404 (Not Found) の場合はすでにGoogle側で削除済みなので正常完了とする
    if (err instanceof GoogleCalendarApiError && (err.status === 410 || err.status === 404)) {
      console.info(`[Google Calendar] Event ${googleEventId} is already deleted on Google.`);
      return;
    }
    throw err;
  }
}

/**
 * Firestore内の重複イベントを安全にクレンジングする（Google APIへの削除は一切行わない）
 */
export async function cleanDuplicateEvents(
  existingEvents: CalendarEvent[]
): Promise<CalendarEvent[]> {
  const seenGoogleIds = new Set<string>();
  const seenTitleDateTimes = new Set<string>();
  const uniqueEvents: CalendarEvent[] = [];
  const duplicatesToDelete: CalendarEvent[] = [];

  for (const event of existingEvents) {
    let isDuplicate = false;

    if (event.googleEventId) {
      if (seenGoogleIds.has(event.googleEventId)) {
        isDuplicate = true;
      } else {
        seenGoogleIds.add(event.googleEventId);
      }
    } else {
      const key = `${event.title.trim()}__${event.date}__${event.startTime || ""}`;
      if (seenTitleDateTimes.has(key)) {
        isDuplicate = true;
      } else {
        seenTitleDateTimes.add(key);
      }
    }

    if (isDuplicate) {
      duplicatesToDelete.push(event);
    } else {
      uniqueEvents.push(event);
    }
  }

  // 重複ドキュメントを Firestore から安全に削除（Google側には一切触らない）
  if (duplicatesToDelete.length > 0) {
    console.info(`[Google Calendar Sync] Cleaning up ${duplicatesToDelete.length} duplicate events in Firestore.`);
    for (const dup of duplicatesToDelete) {
      try {
        await deleteDoc(doc(db, "events", dup.id));
      } catch (delErr) {
        console.warn(`Failed to cleanup duplicate event document ${dup.id}:`, delErr);
      }
    }
  }

  return uniqueEvents;
}

// 同期多重実行防止用フラグ
let isCalendarSyncInProgress = false;

/**
 * Google カレンダーから Arca (Firestore) への双方向 Upsert 同期
 * 
 * 1) ユーザーのカレンダー一覧を取得（プライマリ ＆ 「出勤予定」別カレンダー）
 * 2) 各カレンダーから直近の予定を取得
 *    - プライマリ: isShiftOnly = false（通常の予定としてカレンダーに表示）
 *    - 「出勤予定」別カレンダー: isShiftOnly = true（シフト計算専用、カレンダー非表示）
 * 3) 既存の Arca 予定と照合して Upsert (Insert / Update)
 */
export async function syncGoogleCalendarToArca(
  token: string,
  providedExistingEvents?: CalendarEvent[]
): Promise<{ added: number; updated: number }> {
  if (isCalendarSyncInProgress) {
    return { added: 0, updated: 0 };
  }
  isCalendarSyncInProgress = true;

  try {
    // 1. カレンダー一覧の取得
    const calendarList = await fetchUserCalendarList(token);

    // プライマリカレンダーの特定
    const primaryCal = calendarList.find((c) => c.primary) || { id: "primary", summary: "Primary" };

    // 「出勤予定」別カレンダーの特定（タイトルが「出勤予定」「出勤」「シフト」などに一致するサブカレンダー）
    const shiftCal = calendarList.find(
      (c) =>
        !c.primary &&
        (c.summary === "出勤予定" || /出勤|シフト/i.test(c.summary))
    );

    // 2. 対象カレンダーからイベント取得
    const fetchTargets: Array<{ id: string; isShiftOnly: boolean }> = [
      { id: primaryCal.id || "primary", isShiftOnly: false },
    ];

    if (shiftCal && shiftCal.id !== primaryCal.id) {
      fetchTargets.push({ id: shiftCal.id, isShiftOnly: true });
    }

    const fetchedEventsWithFlag: Array<{ event: GoogleCalendarApiEvent; isShiftOnly: boolean }> = [];

    for (const target of fetchTargets) {
      try {
        const events = await fetchEventsFromCalendar(token, target.id);
        for (const e of events) {
          fetchedEventsWithFlag.push({ event: e, isShiftOnly: target.isShiftOnly });
        }
      } catch (err) {
        console.warn(`Failed to fetch events from calendar ${target.id}:`, err);
      }
    }

    let added = 0;
    let updated = 0;

    // 3. 既存の Arca 予定の取得
    let existingEvents: CalendarEvent[] = [];
    if (providedExistingEvents && providedExistingEvents.length > 0) {
      existingEvents = [...providedExistingEvents];
    } else {
      try {
        const snap = await getDocs(collection(db, "events"));
        existingEvents = snap?.docs
          ? snap.docs.map((d) => {
              const rawData = typeof d.data === "function" ? d.data() : d.data;
              return {
                id: d.id,
                ...(rawData as Omit<CalendarEvent, "id">),
              };
            })
          : [];
      } catch {
        existingEvents = [];
      }
    }

    // 既存の重複ドキュメントを安全に自動クレンジング（Google側は一切触らない）
    existingEvents = await cleanDuplicateEvents(existingEvents);

    // 4. Upsert 処理（Googleマスター：ドキュメントIDを Google Event ID に決定論的統一）
    const fetchedGoogleIdSet = new Set<string>();

    for (const item of fetchedEventsWithFlag) {
      const gEvent = item.event;
      const isShiftOnly = item.isShiftOnly;
      fetchedGoogleIdSet.add(gEvent.id);

      const { date, startTime, endTime } = parseGoogleEventDateTime(
        gEvent.start,
        gEvent.end
      );
      const title = (gEvent.summary || "(無題)").trim();
      const note = (gEvent.description || "").trim();

      // 1) googleEventId または docId が完全一致する既存予定
      const matchById = existingEvents.find(
        (e) => e.googleEventId === gEvent.id || e.id === gEvent.id
      );

      if (matchById) {
        const hasDiff =
          matchById.title.trim() !== title ||
          matchById.date !== date ||
          (matchById.startTime || "") !== startTime ||
          (matchById.endTime || "") !== endTime ||
          (matchById.note || "").trim() !== note ||
          matchById.isShiftOnly !== isShiftOnly;

        if (hasDiff) {
          await updateDoc(doc(db, "events", matchById.id), {
            title,
            date,
            startTime,
            endTime,
            note,
            isShiftOnly,
            googleEventId: gEvent.id,
          });
          matchById.title = title;
          matchById.date = date;
          matchById.startTime = startTime;
          matchById.endTime = endTime;
          matchById.note = note;
          matchById.isShiftOnly = isShiftOnly;
          matchById.googleEventId = gEvent.id;
          updated++;
        }
        continue;
      }

      // 2) googleEventId が未設定で、タイトルと日付が同一の既存予定
      const matchByTitleAndDate = existingEvents.find(
        (e) =>
          !e.googleEventId &&
          e.title.trim() === title &&
          e.date === date
      );

      if (matchByTitleAndDate) {
        await updateDoc(doc(db, "events", matchByTitleAndDate.id), {
          googleEventId: gEvent.id,
          startTime: startTime || matchByTitleAndDate.startTime || "",
          endTime: endTime || matchByTitleAndDate.endTime || "",
          note: note || matchByTitleAndDate.note || "",
          isShiftOnly,
        });
        matchByTitleAndDate.googleEventId = gEvent.id;
        matchByTitleAndDate.isShiftOnly = isShiftOnly;
        updated++;
        continue;
      }

      // 3) どちらにも該当しない新規追加：ドキュメントIDを Google Event ID に統一（setDoc）
      // これにより物理的に同一イベントの重複作成が絶対に発生しない
      await setDoc(doc(db, "events", gEvent.id), {
        title,
        date,
        startTime,
        endTime,
        note,
        googleEventId: gEvent.id,
        isShiftOnly,
        createdAt: serverTimestamp(),
      });
      existingEvents.push({
        id: gEvent.id,
        title,
        date,
        startTime,
        endTime,
        note,
        googleEventId: gEvent.id,
        isShiftOnly,
        createdAt: null,
      });
      added++;
    }

    // 5. Google カレンダー側で削除された予定の追従ミラーリング（Reconciliation）
    // 取得対象期間（前月1日〜翌月末日）に属するイベントで、Googleに存在しなくなったものをFirestoreから削除
    const now = new Date();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const minDateStr = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, "0")}-01`;
    const nextMonthEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0);
    const maxDateStr = `${nextMonthEnd.getFullYear()}-${String(nextMonthEnd.getMonth() + 1).padStart(2, "0")}-${String(nextMonthEnd.getDate()).padStart(2, "0")}`;

    for (const ev of existingEvents) {
      if (!ev.googleEventId) continue;
      if (ev.date >= minDateStr && ev.date <= maxDateStr) {
        if (!fetchedGoogleIdSet.has(ev.googleEventId)) {
          try {
            await deleteDoc(doc(db, "events", ev.id));
          } catch (delErr) {
            console.warn(`Failed to cleanup removed Google event ${ev.id}:`, delErr);
          }
        }
      }
    }

    return { added, updated };
  } catch (err) {
    console.error("[Google Calendar Sync Error] Googleカレンダー同期中にエラーが発生しました:", err);
    throw err;
  } finally {
    isCalendarSyncInProgress = false;
  }
}
