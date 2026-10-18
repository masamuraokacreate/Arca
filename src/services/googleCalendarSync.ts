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
import {
  getValidAccessToken,
  resolveValidAccessToken,
  wasGoogleConnected,
} from "./googleAuthService";
import type { CalendarEvent, CalendarMutationPayload, SyncErrorState } from "../types";
import { isWorkEvent, saveShiftOverride, formatShiftTitleWithTime } from "./pmCycleService";
import {
  CALENDAR_API_ROOT,
  GoogleCalendarApiError,
  requestGoogleCalendarApi,
  listGoogleEvents,
  createGoogleEvent,
  updateGoogleEvent,
  deleteGoogleEvent,
  toSyncErrorState,
  REQUIRED_SCOPE,
  type GoogleCalendarListItem,
  type GoogleCalendarListResponse,
  type GoogleCalendarApiEvent,
  type GoogleCalendarEventsResponse,
} from "./googleCalendarClient";

export {
  CALENDAR_API_ROOT,
  GoogleCalendarApiError,
  listGoogleEvents,
  createGoogleEvent,
  updateGoogleEvent,
  deleteGoogleEvent,
  toSyncErrorState,
  REQUIRED_SCOPE,
  type CalendarMutationPayload,
  type SyncErrorState,
  type GoogleCalendarListItem,
  type GoogleCalendarListResponse,
  type GoogleCalendarApiEvent,
  type GoogleCalendarEventsResponse,
};

const CALENDAR_BASE_URL = "https://www.googleapis.com/calendar/v3/calendars/primary";

/** 共通の認証付き Google Calendar API フェッチ関数 */
async function calendarFetch<T>(
  token: string,
  urlOrPath: string,
  options?: RequestInit
): Promise<T> {
  const url = urlOrPath.startsWith("http") ? urlOrPath : `${CALENDAR_BASE_URL}${urlOrPath}`;
  return requestGoogleCalendarApi<T>(url, options, token);
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

/** Arca の予定データから Google Calendar API 用のリクエストボディ (CalendarMutationPayload) を作成 */
export function formatToGoogleEventBody(event: {
  title: string;
  date: string;
  startTime?: string;
  endTime?: string;
  note?: string;
  location?: string;
}): CalendarMutationPayload & {
  summary: string;
  description: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
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
      ...(event.location ? { location: event.location } : {}),
      start: { dateTime: startDate.toISOString(), timeZone },
      end: { dateTime: endDate.toISOString(), timeZone },
    };
  }

  // 終日イベント
  return {
    summary: title,
    description,
    ...(event.location ? { location: event.location } : {}),
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
 * 「出勤予定」等のサブカレンダーが存在する場合、そのカレンダーIDを解決する（なければ "primary"）
 */
async function resolveShiftCalendarId(token: string): Promise<string> {
  const calendarList = await fetchUserCalendarList(token);
  const shiftCal = calendarList.find(
    (c) =>
      !c.primary &&
      (c.summary === "出勤予定" || /出勤|シフト/i.test(c.summary))
  );
  if (shiftCal?.id) {
    return shiftCal.id;
  }
  return "primary";
}

/**
 * 指定したカレンダー ID からイベントを取得する (singleEvents=true 必須)
 */
export async function fetchEventsFromCalendar(
  token: string,
  calendarId: string,
  timeMin?: string,
  timeMax?: string
): Promise<GoogleCalendarApiEvent[]> {
  return listGoogleEvents(calendarId, timeMin, timeMax, token);
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
 * Google カレンダーに予定を新規作成し、Google Event ID を返す (POST)
 */
export async function createGoogleCalendarEvent(
  token: string,
  event: {
    title: string;
    date: string;
    startTime?: string;
    endTime?: string;
    note?: string;
  },
  calendarId: string = "primary"
): Promise<string> {
  const body = formatToGoogleEventBody(event);
  const created = await createGoogleEvent(body, calendarId, token);
  return created.id;
}

/**
 * Google カレンダーの予定を部分更新する (PATCH)
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
  await updateGoogleEvent(googleEventId, body, calendarId, token);
}

/**
 * Google カレンダーの予定を削除する (DELETE)
 * ※ 低レベル関数 deleteGoogleEvent は 404/410 を throw するが、同期ヘルパーでは 404/410 を冪等に完了扱いとする
 */
export async function deleteGoogleCalendarEvent(
  token: string,
  googleEventId: string,
  calendarId: string = "primary"
): Promise<void> {
  try {
    await deleteGoogleEvent(googleEventId, calendarId, token);
  } catch (err) {
    if (err instanceof GoogleCalendarApiError && err.isNotFoundOrGone()) {
      return;
    }
    throw err;
  }
}

/**
 * 複数日（4連勤ワンシフト等）の出勤イベントを一括更新・作成する
 *
 * ※ 通信エラー（401/403 等）発生時はエラーを握り潰さず上位へ throw し、
 *    呼び出し元（CalendarView / Calendar）で状態ロールバックと SyncToast 表示を行う。
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
  const activeToken = await resolveValidAccessToken(token);
  const hasLinkedEvents = dates.some((date) =>
    existingEvents.some((e) => e.date === date && isWorkEvent(e.title) && Boolean(e.googleEventId))
  );

  // 過去にGoogle連携していた、またはGoogle紐付け済みの予定を編集しようとしているのにトークンが切れている場合は 401 を throw
  if (!activeToken && (wasGoogleConnected() || hasLinkedEvents)) {
    throw new GoogleCalendarApiError(
      401,
      `${CALENDAR_BASE_URL}/events`,
      "Google認証の有効期限が切れています。再認証してください。"
    );
  }

  const formattedTitle =
    formatShiftTitleWithTime(shiftData.title, shiftData.startTime, true) || shiftData.title;

  for (const date of dates) {
    // 対象日の出勤予定をすべて抽出（プライマリ・サブカレンダー両方に対応）
    const matchingWorkEvents = existingEvents.filter(
      (e) => e.date === date && isWorkEvent(e.title)
    );

    if (matchingWorkEvents.length > 0) {
      for (const existingWork of matchingWorkEvents) {
        let currentGoogleId = existingWork.googleEventId;
        let targetCalId = existingWork.googleCalendarId || "primary";

        if (activeToken) {
          if (!existingWork.googleCalendarId && existingWork.isShiftOnly) {
            targetCalId = await resolveShiftCalendarId(activeToken);
          }

          if (currentGoogleId) {
            try {
              await updateGoogleCalendarEvent(
                activeToken,
                currentGoogleId,
                {
                  title: formattedTitle,
                  date,
                  startTime: shiftData.startTime,
                  endTime: shiftData.endTime,
                  note: shiftData.note ?? existingWork.note,
                },
                targetCalId
              );
            } catch (gErr) {
              // 404/410 の場合：Google側で削除されていた場合は新規作成へフォールバックしてIDを再紐付け
              if (gErr instanceof GoogleCalendarApiError && gErr.isNotFoundOrGone()) {
                const recreatedId = await createGoogleCalendarEvent(
                  activeToken,
                  {
                    title: formattedTitle,
                    date,
                    startTime: shiftData.startTime,
                    endTime: shiftData.endTime,
                    note: shiftData.note ?? existingWork.note,
                  },
                  targetCalId
                );
                if (recreatedId) currentGoogleId = recreatedId;
              } else {
                // 401 / 403 / ネットワークエラー等はロールバック＆トースト表示のため必ず再スロー
                throw gErr;
              }
            }
          } else {
            // Google イベント ID が未紐付けの場合は新規作成して紐付け
            const newGId = await createGoogleCalendarEvent(
              activeToken,
              {
                title: formattedTitle,
                date,
                startTime: shiftData.startTime,
                endTime: shiftData.endTime,
                note: shiftData.note ?? existingWork.note,
              },
              targetCalId
            );
            if (newGId) currentGoogleId = newGId;
          }
        }

        await updateDoc(doc(db, "events", existingWork.id), {
          title: formattedTitle,
          startTime: shiftData.startTime,
          endTime: shiftData.endTime,
          ...(shiftData.note !== undefined ? { note: shiftData.note } : {}),
          googleEventId: currentGoogleId || null,
          googleCalendarId: targetCalId,
        });
      }
    } else {
      // 対象日に出勤イベントがまだ存在しない場合は新規作成
      let newGoogleId: string | undefined;
      const targetCalId = "primary";

      if (activeToken) {
        newGoogleId = await createGoogleCalendarEvent(
          activeToken,
          {
            title: formattedTitle,
            date,
            startTime: shiftData.startTime,
            endTime: shiftData.endTime,
            note: shiftData.note || "",
          },
          targetCalId
        );
      }

      await addDoc(collection(db, "events"), {
        title: formattedTitle,
        date,
        startTime: shiftData.startTime,
        endTime: shiftData.endTime,
        note: shiftData.note || "",
        googleEventId: newGoogleId || null,
        googleCalendarId: targetCalId,
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
 * ※ Google API で 401/403 等のエラーが発生した場合は握り潰さず throw し、
 *    呼び出し元で状態ロールバックと SyncToast 表示を行う。
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

  const activeToken = await resolveValidAccessToken(token);
  const workEvents = existingEvents.filter(
    (e) => e.date === params.date && isWorkEvent(e.title)
  );
  const hasLinkedWorkEvent = workEvents.some((e) => Boolean(e.googleEventId));

  if (!activeToken && (wasGoogleConnected() || hasLinkedWorkEvent)) {
    throw new GoogleCalendarApiError(
      401,
      `${CALENDAR_BASE_URL}/events`,
      "Google認証の有効期限が切れています。再認証が必要です。"
    );
  }

  // 2. 休日への変更
  if (params.type === "holiday") {
    for (const ev of workEvents) {
      if (activeToken && ev.googleEventId) {
        let targetCalId = ev.googleCalendarId || "primary";
        if (!ev.googleCalendarId && ev.isShiftOnly) {
          targetCalId = await resolveShiftCalendarId(activeToken);
        }
        try {
          await deleteGoogleCalendarEvent(activeToken, ev.googleEventId, targetCalId);
        } catch (err) {
          // 既に削除済み (404/410) の場合はもし別カレンダーにある可能性があればそちらも削除試行し、なければ正常進行
          if (err instanceof GoogleCalendarApiError && err.isNotFoundOrGone()) {
            const fallbackCalId =
              targetCalId === "primary" ? await resolveShiftCalendarId(activeToken) : "primary";
            if (fallbackCalId !== targetCalId) {
              try {
                await deleteGoogleCalendarEvent(activeToken, ev.googleEventId, fallbackCalId);
              } catch (fallbackErr) {
                if (
                  fallbackErr instanceof GoogleCalendarApiError &&
                  !fallbackErr.isNotFoundOrGone()
                ) {
                  throw fallbackErr;
                }
              }
            }
          } else {
            throw err;
          }
        }
      }
      await deleteDoc(doc(db, "events", ev.id));
    }

    await saveShiftOverride(params.date, {
      type: "holiday",
      streakNumber: params.streakNumber || 1,
    });

    return { success: true };
  }

  // 3. 出勤への変更
  const rawTitle = (params.shiftName || "出勤").trim();
  const { startTime, endTime } = resolveShiftTimes(
    params.shiftName,
    params.startTime,
    params.endTime
  );
  const title = formatShiftTitleWithTime(rawTitle, startTime, true) || rawTitle;

  let targetEventId: string | undefined;

  if (workEvents.length > 0) {
    for (const existingWork of workEvents) {
      targetEventId = existingWork.id;
      let googleId = existingWork.googleEventId;
      let targetCalId = existingWork.googleCalendarId || "primary";

      if (activeToken) {
        if (!existingWork.googleCalendarId && existingWork.isShiftOnly) {
          targetCalId = await resolveShiftCalendarId(activeToken);
        }

        if (googleId) {
          try {
            await updateGoogleCalendarEvent(
              activeToken,
              googleId,
              {
                title,
                date: params.date,
                startTime,
                endTime,
              },
              targetCalId
            );
          } catch (gErr) {
            if (gErr instanceof GoogleCalendarApiError && gErr.isNotFoundOrGone()) {
              const newGId = await createGoogleCalendarEvent(
                activeToken,
                {
                  title,
                  date: params.date,
                  startTime,
                  endTime,
                },
                targetCalId
              );
              if (newGId) googleId = newGId;
            } else {
              throw gErr;
            }
          }
        } else {
          const newGId = await createGoogleCalendarEvent(
            activeToken,
            {
              title,
              date: params.date,
              startTime,
              endTime,
            },
            targetCalId
          );
          if (newGId) {
            googleId = newGId;
          }
        }
      }

      await updateDoc(doc(db, "events", existingWork.id), {
        title,
        startTime,
        endTime,
        googleEventId: googleId || null,
        googleCalendarId: targetCalId,
      });
    }
  } else {
    let newGoogleId: string | undefined;
    const targetCalId = "primary";

    if (activeToken) {
      newGoogleId = await createGoogleCalendarEvent(
        activeToken,
        {
          title,
          date: params.date,
          startTime,
          endTime,
        },
        targetCalId
      );
    }

    const docRef = await addDoc(collection(db, "events"), {
      title,
      date: params.date,
      startTime,
      endTime,
      note: "",
      googleEventId: newGoogleId || null,
      googleCalendarId: targetCalId,
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

export { getValidAccessToken };

/**
 * Google カレンダーから Arca (Firestore) への双方向 Upsert 同期
 */
export async function syncGoogleCalendarToArca(
  token?: string | null,
  providedExistingEvents?: CalendarEvent[]
): Promise<{ added: number; updated: number }> {
  if (isCalendarSyncInProgress) {
    return { added: 0, updated: 0 };
  }
  isCalendarSyncInProgress = true;

  try {
    const activeToken = (await resolveValidAccessToken(token)) || "";
    // 1. カレンダー一覧の取得
    const calendarList = await fetchUserCalendarList(activeToken);

    // プライマリカレンダーの特定
    const primaryCal = calendarList.find((c) => c.primary) || { id: "primary", summary: "Primary" };

    // 「出勤予定」別カレンダーの特定（タイトルが「出勤予定」「出勤」「シフト」などに一致するサブカレンダー）
    const shiftCal = calendarList.find(
      (c) =>
        !c.primary &&
        (c.summary === "出勤予定" || /出勤|シフト/i.test(c.summary))
    );

    // 2. 対象カレンダーからイベント取得
    const fetchTargets: Array<{ id: string; calendarKey: string; isShiftOnly: boolean }> = [
      { id: primaryCal.id || "primary", calendarKey: "primary", isShiftOnly: false },
    ];

    if (shiftCal && shiftCal.id !== primaryCal.id) {
      fetchTargets.push({ id: shiftCal.id, calendarKey: shiftCal.id, isShiftOnly: true });
    }

    const fetchedEventsWithFlag: Array<{
      event: GoogleCalendarApiEvent;
      calendarId: string;
      isShiftOnly: boolean;
    }> = [];

    for (const target of fetchTargets) {
      try {
        const events = await fetchEventsFromCalendar(activeToken, target.id);
        for (const e of events) {
          fetchedEventsWithFlag.push({
            event: e,
            calendarId: target.calendarKey,
            isShiftOnly: target.isShiftOnly,
          });
        }
      } catch (err) {
        if (
          err instanceof GoogleCalendarApiError &&
          (err.isUnauthorized() || err.isScopeInsufficient())
        ) {
          throw err;
        }
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
      const googleCalendarId = item.calendarId;
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
          matchById.isShiftOnly !== isShiftOnly ||
          matchById.googleCalendarId !== googleCalendarId;

        if (hasDiff) {
          await updateDoc(doc(db, "events", matchById.id), {
            title,
            date,
            startTime,
            endTime,
            note,
            isShiftOnly,
            googleEventId: gEvent.id,
            googleCalendarId,
          });
          matchById.title = title;
          matchById.date = date;
          matchById.startTime = startTime;
          matchById.endTime = endTime;
          matchById.note = note;
          matchById.isShiftOnly = isShiftOnly;
          matchById.googleEventId = gEvent.id;
          matchById.googleCalendarId = googleCalendarId;
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
          googleCalendarId,
          startTime: startTime || matchByTitleAndDate.startTime || "",
          endTime: endTime || matchByTitleAndDate.endTime || "",
          note: note || matchByTitleAndDate.note || "",
          isShiftOnly,
        });
        matchByTitleAndDate.googleEventId = gEvent.id;
        matchByTitleAndDate.googleCalendarId = googleCalendarId;
        matchByTitleAndDate.isShiftOnly = isShiftOnly;
        updated++;
        continue;
      }

      // 3) どちらにも該当しない新規追加：ドキュメントIDを Google Event ID に統一（setDoc）
      await setDoc(doc(db, "events", gEvent.id), {
        title,
        date,
        startTime,
        endTime,
        note,
        googleEventId: gEvent.id,
        googleCalendarId,
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
        googleCalendarId,
        isShiftOnly,
        createdAt: null,
      });
      added++;
    }

    // 5. Google カレンダー側で削除された予定の追従ミラーリング（Reconciliation）
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
