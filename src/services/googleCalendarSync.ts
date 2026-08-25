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
  getDocs,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import type { CalendarEvent } from "../types";

const CALENDAR_API_ROOT = "https://www.googleapis.com/calendar/v3";
const CALENDAR_BASE_URL = "https://www.googleapis.com/calendar/v3/calendars/primary";

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
    throw new Error(`Google Calendar API error ${res.status}: ${text}`);
  }

  if (res.status === 204) {
    return {} as T;
  }

  const text = await res.text();
  return text ? (JSON.parse(text) as T) : ({} as T);
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
    const [startH, startM] = event.startTime.split(":");
    const startIso = `${event.date}T${startH.padStart(2, "0")}:${startM.padStart(2, "0")}:00`;

    let endIso = startIso;
    if (event.endTime && /^\d{1,2}:\d{2}$/.test(event.endTime)) {
      const [endH, endM] = event.endTime.split(":");
      endIso = `${event.date}T${endH.padStart(2, "0")}:${endM.padStart(2, "0")}:00`;
    }

    return {
      summary: title,
      description,
      start: { dateTime: new Date(startIso).toISOString(), timeZone },
      end: { dateTime: new Date(endIso).toISOString(), timeZone },
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
  const defaultMin = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const defaultMax = new Date(now.getFullYear(), now.getMonth() + 4, 0).toISOString();

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
  }
): Promise<void> {
  const body = formatToGoogleEventBody(event);
  await calendarFetch<GoogleCalendarApiEvent>(
    token,
    `/events/${encodeURIComponent(googleEventId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    }
  );
}

/**
 * Google カレンダーの予定を削除する
 */
export async function deleteGoogleCalendarEvent(
  token: string,
  googleEventId: string
): Promise<void> {
  await calendarFetch<void>(
    token,
    `/events/${encodeURIComponent(googleEventId)}`,
    {
      method: "DELETE",
    }
  );
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

    // 4. Upsert 処理
    for (const item of fetchedEventsWithFlag) {
      const gEvent = item.event;
      const isShiftOnly = item.isShiftOnly;

      const { date, startTime, endTime } = parseGoogleEventDateTime(
        gEvent.start,
        gEvent.end
      );
      const title = (gEvent.summary || "(無題)").trim();
      const note = (gEvent.description || "").trim();

      // 1) googleEventId が完全一致する既存予定
      const matchById = existingEvents.find(
        (e) => e.googleEventId === gEvent.id
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
          });
          matchById.title = title;
          matchById.date = date;
          matchById.startTime = startTime;
          matchById.endTime = endTime;
          matchById.note = note;
          matchById.isShiftOnly = isShiftOnly;
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

      // 3) どちらにも該当しない場合のみ新規追加
      const docRef = await addDoc(collection(db, "events"), {
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
        id: docRef.id,
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

    return { added, updated };
  } finally {
    isCalendarSyncInProgress = false;
  }
}
