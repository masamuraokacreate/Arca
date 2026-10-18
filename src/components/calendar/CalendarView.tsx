/**
 * src/components/calendar/CalendarView.tsx
 * カレンダー操作イベントから Google Calendar API クライアント (POST / PATCH / DELETE) を呼び出し、
 * エラー時にロールバックおよび SyncToast を表示するビュー・コントローラモジュール
 */

import Calendar, { CalendarView } from "../Calendar";
import {
  createGoogleEvent,
  updateGoogleEvent,
  deleteGoogleEvent,
  toSyncErrorState,
  GoogleCalendarApiError,
  type CalendarMutationPayload,
  type SyncErrorState,
} from "../../services/googleCalendarClient";
import {
  REQUIRED_SCOPE,
  requestWritePermission,
  hasWritePermission,
} from "../../services/googleAuthService";
import { SyncToast } from "../common/SyncToast";

export {
  CalendarView,
  SyncToast,
  REQUIRED_SCOPE,
  requestWritePermission,
  hasWritePermission,
  createGoogleEvent,
  updateGoogleEvent,
  deleteGoogleEvent,
  toSyncErrorState,
  GoogleCalendarApiError,
  type CalendarMutationPayload,
  type SyncErrorState,
};

export default Calendar;
