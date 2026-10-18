/**
 * src/services/googleCalendarClient.ts
 * Google Calendar API v3 低レベルクライアント（Events: list / POST / PATCH / DELETE）
 */

import {
  clearSavedToken,
  getValidAccessToken,
  resolveValidAccessToken,
  REQUIRED_SCOPE,
} from "./googleAuthService";
import type { CalendarMutationPayload, SyncErrorState } from "../types";

export { REQUIRED_SCOPE, getValidAccessToken };
export type { CalendarMutationPayload, SyncErrorState };

export const CALENDAR_API_ROOT = "https://www.googleapis.com/calendar/v3";

/** Google Calendar API カスタムエラー（ステータスコード保持） */
export class GoogleCalendarApiError extends Error {
  status: number;
  endpoint: string;
  errorData?: unknown;

  constructor(status: number, endpoint: string, message: string, errorData?: unknown) {
    super(`Google Calendar API error ${status} at ${endpoint}: ${message}`);
    this.name = "GoogleCalendarApiError";
    this.status = status;
    this.endpoint = endpoint;
    this.errorData = errorData;
  }

  /** スコープ不足エラー (403 ACCESS_TOKEN_SCOPE_INSUFFICIENT 等) */
  isScopeInsufficient(): boolean {
    return this.status === 403;
  }

  /** 認証切れ・無効トークン (401 Unauthorized) */
  isUnauthorized(): boolean {
    return this.status === 401;
  }

  /** 他端末等で既に削除済みの予定 (404 Not Found / 410 Gone) */
  isNotFoundOrGone(): boolean {
    return this.status === 404 || this.status === 410;
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
  location?: string;
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

/**
 * 共通の認証付き Google Calendar API リクエスト実行関数
 * response.ok が false の場合はステータスコード (401, 403, 404, 410 等) を含む GoogleCalendarApiError を throw する
 */
export async function requestGoogleCalendarApi<T>(
  url: string,
  options?: RequestInit,
  tokenOverride?: string | null
): Promise<T> {
  const token = await resolveValidAccessToken(tokenOverride);
  if (!token) {
    throw new GoogleCalendarApiError(
      401,
      url,
      "Google認証トークンが存在しないか有効期限が切れています。再認証が必要です。"
    );
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    let errorData: unknown;
    try {
      errorData = JSON.parse(text);
    } catch {
      errorData = text;
    }

    // 401 (認証切れ) または 403 (権限不足) の場合、無効トークンを破棄
    if (response.status === 401 || response.status === 403) {
      clearSavedToken();
    }

    throw new GoogleCalendarApiError(
      response.status,
      url,
      typeof errorData === "object" ? JSON.stringify(errorData) : text,
      errorData
    );
  }

  if (response.status === 204) {
    return {} as T;
  }

  const text = await response.text();
  return text ? (JSON.parse(text) as T) : ({} as T);
}

/**
 * 予定一覧取得 (Events: list)
 * 繰り返し予定を個別編集可能にするため `singleEvents=true` を必須指定する
 */
export async function listGoogleEvents(
  calendarId: string = "primary",
  timeMin?: string,
  timeMax?: string,
  tokenOverride?: string | null
): Promise<GoogleCalendarApiEvent[]> {
  const now = new Date();
  const defaultMin = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0).toISOString();
  const defaultMax = new Date(
    now.getFullYear(),
    now.getMonth() + 2,
    0,
    23,
    59,
    59,
    999
  ).toISOString();

  const params = new URLSearchParams({
    timeMin: timeMin || defaultMin,
    timeMax: timeMax || defaultMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });

  const endpoint = `${CALENDAR_API_ROOT}/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`;
  const data = await requestGoogleCalendarApi<GoogleCalendarEventsResponse>(
    endpoint,
    { method: "GET" },
    tokenOverride
  );

  return (data.items || []).filter((item) => item.status !== "cancelled" && item.id);
}

/**
 * 予定の新規作成 (POST)
 * POST https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events
 */
export async function createGoogleEvent(
  payload: CalendarMutationPayload,
  calendarId: string = "primary",
  tokenOverride?: string | null
): Promise<GoogleCalendarApiEvent> {
  const endpoint = `${CALENDAR_API_ROOT}/calendars/${encodeURIComponent(calendarId)}/events`;
  return requestGoogleCalendarApi<GoogleCalendarApiEvent>(
    endpoint,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    tokenOverride
  );
}

/**
 * 予定の部分変更 (PATCH)
 * PATCH https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events/{eventId}
 * ※ 未編集項目の消失を防ぐため、PUTではなく必ずPATCHメソッドを使用する
 */
export async function updateGoogleEvent(
  eventId: string,
  payload: Partial<CalendarMutationPayload>,
  calendarId: string = "primary",
  tokenOverride?: string | null
): Promise<GoogleCalendarApiEvent> {
  const endpoint = `${CALENDAR_API_ROOT}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
  return requestGoogleCalendarApi<GoogleCalendarApiEvent>(
    endpoint,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
    tokenOverride
  );
}

/**
 * 予定の削除 (DELETE)
 * DELETE https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events/{eventId}
 */
export async function deleteGoogleEvent(
  eventId: string,
  calendarId: string = "primary",
  tokenOverride?: string | null
): Promise<void> {
  const endpoint = `${CALENDAR_API_ROOT}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
  await requestGoogleCalendarApi<void>(
    endpoint,
    {
      method: "DELETE",
    },
    tokenOverride
  );
}

/**
 * エラーオブジェクトから SyncErrorState を構築するヘルパー
 */
export function toSyncErrorState(
  err: unknown,
  defaultMessage: string = "予定の変更を送信できませんでした"
): { state: SyncErrorState; isDeletedRemotely: boolean } {
  const status =
    err instanceof GoogleCalendarApiError
      ? err.status
      : typeof (err as { status?: number })?.status === "number"
      ? (err as { status: number }).status
      : 0;

  if (status === 404 || status === 410) {
    return {
      state: {
        hasError: true,
        message: "この予定は既に削除されています",
        requireReauth: false,
      },
      isDeletedRemotely: true,
    };
  }

  if (status === 401 || status === 403) {
    return {
      state: {
        hasError: true,
        message: defaultMessage,
        requireReauth: true,
      },
      isDeletedRemotely: false,
    };
  }

  return {
    state: {
      hasError: true,
      message: defaultMessage,
      requireReauth: false,
    },
    isDeletedRemotely: false,
  };
}
