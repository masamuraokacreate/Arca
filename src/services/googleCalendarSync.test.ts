/**
 * src/services/googleCalendarSync.test.ts
 * Google Calendar 双方向同期サービスの単体テスト
 */

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import {
  parseGoogleEventDateTime,
  formatToGoogleEventBody,
  fetchPrimaryCalendarEvents,
  createGoogleCalendarEvent,
  updateGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  cleanDuplicateEvents,
  syncGoogleCalendarToArca,
  batchUpdateShiftEvents,
  resolveShiftTimes,
  applyShiftStatusToGoogleCalendar,
  addMinutesToTime,
  GoogleCalendarApiError,
} from "./googleCalendarSync";
import {
  collection,
  addDoc,
  updateDoc,
  setDoc,
  deleteDoc,
  doc,
} from "firebase/firestore";
import type { CalendarEvent } from "../types";

function createMockEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "test-id",
    title: "テスト予定",
    date: "2026-08-21",
    startTime: "",
    endTime: "",
    note: "",
    createdAt: null,
    ...overrides,
  };
}

describe("googleCalendarSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (collection as Mock).mockImplementation((_db, path) => path);
    (doc as Mock).mockImplementation((_db, path, id) => `${path}/${id}`);
    (addDoc as Mock).mockResolvedValue({ id: "new-firestore-id" });
    (setDoc as Mock).mockResolvedValue(undefined);
    (deleteDoc as Mock).mockResolvedValue(undefined);
    (updateDoc as Mock).mockResolvedValue(undefined);
  });

  describe("addMinutesToTime", () => {
    it("開始時刻にデフォルト510分（8時間30分）を加算した終了時刻を正しく計算する", () => {
      expect(addMinutesToTime("06:00")).toBe("14:30");
      expect(addMinutesToTime("08:30")).toBe("17:00");
      expect(addMinutesToTime("15:00")).toBe("23:30");
      expect(addMinutesToTime("16:00")).toBe("00:30");
    });

    it("カスタム分数を加算できる", () => {
      expect(addMinutesToTime("09:00", 60)).toBe("10:00");
      expect(addMinutesToTime("23:30", 60)).toBe("00:30");
    });
  });

  describe("parseGoogleEventDateTime", () => {
    it("日時指定のイベントから date, startTime, endTime を正しくパースする", () => {
      const start = { dateTime: "2026-08-21T10:00:00+09:00" };
      const end = { dateTime: "2026-08-21T11:30:00+09:00" };

      const res = parseGoogleEventDateTime(start, end);
      expect(res.date).toBe("2026-08-21");
      expect(res.startTime).toBe("10:00");
      expect(res.endTime).toBe("11:30");
    });

    it("終日イベント（dateのみ）を正しくパースする", () => {
      const start = { date: "2026-08-25" };
      const end = { date: "2026-08-26" };

      const res = parseGoogleEventDateTime(start, end);
      expect(res.date).toBe("2026-08-25");
      expect(res.startTime).toBe("");
      expect(res.endTime).toBe("");
    });
  });

  describe("formatToGoogleEventBody", () => {
    it("時間指定のイベントを Google Calendar 用の dateTime 形式に変換する", () => {
      const event = {
        title: "ミーティング",
        date: "2026-08-21",
        startTime: "14:00",
        endTime: "15:00",
        note: "アジェンダ確認",
      };

      const body = formatToGoogleEventBody(event);
      expect(body.summary).toBe("ミーティング");
      expect(body.description).toBe("アジェンダ確認");
      expect(body.start.dateTime).toBeDefined();
      expect(body.end.dateTime).toBeDefined();
    });

    it("終日イベントを Google Calendar 用の date 形式に変換する", () => {
      const event = {
        title: "休暇",
        date: "2026-08-22",
      };

      const body = formatToGoogleEventBody(event);
      expect(body.summary).toBe("休暇");
      expect(body.start.date).toBe("2026-08-22");
      expect(body.end.date).toBe("2026-08-22");
    });

    it("23:30終了の遅番シフトの場合、終了日時が正しくISO変換され差分が8.5時間（510分）となる", () => {
      const event = {
        title: "遅番",
        date: "2026-09-15",
        startTime: "15:00",
        endTime: "23:30",
      };

      const body = formatToGoogleEventBody(event);
      const startDate = new Date(body.start.dateTime!);
      const endDate = new Date(body.end.dateTime!);

      expect(endDate.getTime()).toBeGreaterThan(startDate.getTime());
      // 差分が8.5時間（510分 = 510 * 60 * 1000 ms）
      expect(endDate.getTime() - startDate.getTime()).toBe(510 * 60 * 1000);
    });

    it("16:00〜00:30 の日跨ぎ遅番シフトの場合、終了日時が翌日00:30として正しくISO変換され差分が8.5時間となる", () => {
      const event = {
        title: "遅番",
        date: "2026-09-15",
        startTime: "16:00",
        endTime: "00:30",
      };

      const body = formatToGoogleEventBody(event);
      const startDate = new Date(body.start.dateTime!);
      const endDate = new Date(body.end.dateTime!);

      expect(endDate.getTime()).toBeGreaterThan(startDate.getTime());
      // 差分が8.5時間（510分 = 510 * 60 * 1000 ms）
      expect(endDate.getTime() - startDate.getTime()).toBe(510 * 60 * 1000);
    });

    it("24:00終了の遅番シフトの場合、終了日時が翌日00:00として正しくISO変換される", () => {
      const event = {
        title: "遅番",
        date: "2026-09-15",
        startTime: "15:00",
        endTime: "24:00",
      };

      const body = formatToGoogleEventBody(event);
      const startDate = new Date(body.start.dateTime!);
      const endDate = new Date(body.end.dateTime!);

      expect(endDate.getTime()).toBeGreaterThan(startDate.getTime());
      expect(endDate.getTime() - startDate.getTime()).toBe(9 * 3600 * 1000);
    });
  });

  describe("fetchPrimaryCalendarEvents", () => {
    it("primaryカレンダーのエンドポイントを呼び出し、キャンセル済み以外の予定を返す", async () => {
      const mockItems = [
        { id: "g1", summary: "予定1", status: "confirmed" },
        { id: "g2", summary: "キャンセル予定", status: "cancelled" },
      ];

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ items: mockItems }),
      });

      const events = await fetchPrimaryCalendarEvents("test-token");
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("https://www.googleapis.com/calendar/v3/calendars/primary/events"),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer test-token",
          }),
        })
      );
      expect(events).toHaveLength(1);
      expect(events[0].id).toBe("g1");
    });
  });

  describe("createGoogleCalendarEvent", () => {
    it("POST /calendars/primary/events を呼び出して新しいIDを返す", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: "created-gid-123" }),
      });

      const id = await createGoogleCalendarEvent("test-token", {
        title: "新規予定",
        date: "2026-08-21",
      });

      expect(id).toBe("created-gid-123");
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer test-token",
          }),
        })
      );
    });
  });

  describe("updateGoogleCalendarEvent", () => {
    it("PATCH /calendars/primary/events/{id} を呼び出す", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: "g-update-id" }),
      });

      await updateGoogleCalendarEvent("test-token", "g-update-id", {
        title: "更新予定",
        date: "2026-08-21",
      });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events/g-update-id",
        expect.objectContaining({
          method: "PATCH",
        })
      );
    });
  });

  describe("deleteGoogleCalendarEvent", () => {
    it("DELETE /calendars/primary/events/{id} を呼び出す", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
        text: async () => "",
      });

      await deleteGoogleCalendarEvent("test-token", "g-delete-id");

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events/g-delete-id",
        expect.objectContaining({
          method: "DELETE",
        })
      );
    });

    it("410 Gone または 404 Not Found の場合はエラーにせず正常終了する", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 410,
        text: async () => JSON.stringify({ error: { message: "Resource has been deleted" } }),
      });

      await expect(
        deleteGoogleCalendarEvent("test-token", "g-already-deleted")
      ).resolves.toBeUndefined();
    });
  });

  describe("cleanDuplicateEvents", () => {
    it("同一 googleEventId の重複を検出し、1件のみ残して余分なドキュメントを deleteDoc で安全に削除する", async () => {
      const existingEvents: CalendarEvent[] = [
        createMockEvent({
          id: "doc-1",
          title: "会議",
          date: "2026-08-21",
          startTime: "10:00",
          endTime: "11:00",
          googleEventId: "same-google-id",
        }),
        createMockEvent({
          id: "doc-2",
          title: "会議 (複製)",
          date: "2026-08-21",
          startTime: "10:00",
          endTime: "11:00",
          googleEventId: "same-google-id",
        }),
      ];

      const result = await cleanDuplicateEvents(existingEvents);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("doc-1");
      expect(deleteDoc).toHaveBeenCalledTimes(1);
    });

    it("同一タイトル・日付・開始時刻の未連携重複もクレンジングする", async () => {
      const existingEvents: CalendarEvent[] = [
        createMockEvent({
          id: "doc-a",
          title: "ランチ",
          date: "2026-08-22",
          startTime: "12:00",
        }),
        createMockEvent({
          id: "doc-b",
          title: "ランチ",
          date: "2026-08-22",
          startTime: "12:00",
        }),
      ];

      const result = await cleanDuplicateEvents(existingEvents);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("doc-a");
      expect(deleteDoc).toHaveBeenCalledTimes(1);
    });
  });

  describe("syncGoogleCalendarToArca (双方向 Upsert)", () => {
    it("googleEventId が一致する既存予定に差分があれば updateDoc を実行する", async () => {
      const gEvents = [
        {
          id: "g1",
          summary: "変更後のタイトル",
          start: { date: "2026-08-21" },
          end: { date: "2026-08-21" },
          status: "confirmed",
        },
      ];

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ items: gEvents }),
      });

      const existingEvents: CalendarEvent[] = [
        {
          id: "local-1",
          title: "変更前のタイトル",
          date: "2026-08-21",
          startTime: "",
          endTime: "",
          note: "",
          googleEventId: "g1",
          createdAt: null,
        },
      ];

      const result = await syncGoogleCalendarToArca("test-token", existingEvents);
      expect(result.updated).toBe(1);
      expect(result.added).toBe(0);
      expect(updateDoc).toHaveBeenCalledTimes(1);
      expect((updateDoc as Mock).mock.calls[0][1].title).toBe("変更後のタイトル");
    });

    it("googleEventId 未設定で同一タイトル・日時の予定がある場合は googleEventId を紐付ける", async () => {
      const gEvents = [
        {
          id: "g2",
          summary: "同じ予定",
          start: { date: "2026-08-21" },
          end: { date: "2026-08-21" },
          status: "confirmed",
        },
      ];

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ items: gEvents }),
      });

      const existingEvents: CalendarEvent[] = [
        {
          id: "local-2",
          title: "同じ予定",
          date: "2026-08-21",
          startTime: "",
          endTime: "",
          note: "",
          createdAt: null,
        },
      ];

      const result = await syncGoogleCalendarToArca("test-token", existingEvents);
      expect(result.updated).toBe(1);
      expect(result.added).toBe(0);
      expect(updateDoc).toHaveBeenCalledTimes(1);
      expect((updateDoc as Mock).mock.calls[0][1].googleEventId).toBe("g2");
    });

    it("新規予定の場合は setDoc で Google Event ID をキーにして Arca に追加する", async () => {
      const gEvents = [
        {
          id: "g3",
          summary: "完全新規の予定",
          start: { date: "2026-08-23" },
          end: { date: "2026-08-23" },
          status: "confirmed",
        },
      ];

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ items: gEvents }),
      });

      const existingEvents: CalendarEvent[] = [];

      const result = await syncGoogleCalendarToArca("test-token", existingEvents);
      expect(result.added).toBe(1);
      expect(result.updated).toBe(0);
      expect(setDoc).toHaveBeenCalledTimes(1);
      expect((setDoc as Mock).mock.calls[0][1].title).toBe("完全新規の予定");
      expect((setDoc as Mock).mock.calls[0][1].googleEventId).toBe("g3");
    });

    it("「出勤予定」別カレンダーの予定は isShiftOnly: true として同期される", async () => {
      // 1) calendarList リクエスト ➔ primary と 出勤予定 カレンダーを返す
      // 2) 各カレンダーの events リクエスト ➔ それぞれの予定を返す
      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("/calendarList")) {
          return {
            ok: true,
            status: 200,
            text: async () =>
              JSON.stringify({
                items: [
                  { id: "primary", summary: "マイカレンダー", primary: true },
                  { id: "shift-cal-id", summary: "出勤予定", primary: false },
                ],
              }),
          };
        }
        if (url.includes("/calendars/shift-cal-id/events")) {
          return {
            ok: true,
            status: 200,
            text: async () =>
              JSON.stringify({
                items: [
                  {
                    id: "shift-event-1",
                    summary: "遅番(15時)",
                    start: { date: "2026-08-23" },
                    end: { date: "2026-08-23" },
                    status: "confirmed",
                  },
                ],
              }),
          };
        }
        // primary events
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              items: [
                {
                  id: "main-event-1",
                  summary: "友達とランチ",
                  start: { date: "2026-08-24" },
                  end: { date: "2026-08-24" },
                  status: "confirmed",
                },
              ],
            }),
        };
      });

      const existingEvents: CalendarEvent[] = [];
      const result = await syncGoogleCalendarToArca("test-token", existingEvents);

      expect(result.added).toBe(2);
      expect(setDoc).toHaveBeenCalledTimes(2);

      // プライマリ予定は isShiftOnly: false
      const addedCalls = (setDoc as Mock).mock.calls;
      const mainCall = addedCalls.find((c) => c[1].googleEventId === "main-event-1");
      expect(mainCall?.[1].isShiftOnly).toBe(false);

      // 出勤予定カレンダーの予定は isShiftOnly: true
      const shiftCall = addedCalls.find((c) => c[1].googleEventId === "shift-event-1");
      expect(shiftCall?.[1].isShiftOnly).toBe(true);
      expect(shiftCall?.[1].title).toBe("遅番(15時)");
    });

    it("Googleカレンダー側で削除された予定はArca側でも追従削除される (Reconciliation)", async () => {
      // Google API の返却予定（空配列 = Google上で予定が削除された）
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ items: [] }),
      });

      const today = new Date();
      const currentMonthDateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-15`;

      const existingEvents: CalendarEvent[] = [
        createMockEvent({
          id: "deleted-on-google",
          title: "削除された予定",
          date: currentMonthDateStr,
          googleEventId: "g-deleted-1",
        }),
      ];

      await syncGoogleCalendarToArca("test-token", existingEvents);

      // Googleに存在しないため deleteDoc で削除される
      expect(deleteDoc).toHaveBeenCalledWith("events/deleted-on-google");
    });

    it("403 ACCESS_TOKEN_SCOPE_INSUFFICIENT の場合にトークンを破棄して GoogleCalendarApiError をスローする", async () => {
      localStorage.setItem("arca_g_token", "invalid-scope-token");

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: async () =>
          JSON.stringify({
            error: {
              code: 403,
              message: "Request had insufficient authentication scopes.",
              status: "PERMISSION_DENIED",
            },
          }),
      });

      await expect(syncGoogleCalendarToArca("invalid-scope-token")).rejects.toThrow(GoogleCalendarApiError);
      // トークンが自動破棄されていること
      expect(localStorage.getItem("arca_g_token")).toBeNull();
    });

    it("401 Unauthorized の場合にトークンを破棄して GoogleCalendarApiError をスローする", async () => {
      localStorage.setItem("arca_g_token", "expired-token");

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () =>
          JSON.stringify({
            error: {
              code: 401,
              message: "Invalid Credentials",
              status: "UNAUTHENTICATED",
            },
          }),
      });

      await expect(syncGoogleCalendarToArca("expired-token")).rejects.toThrow(GoogleCalendarApiError);
      // トークンが自動破棄されていること
      expect(localStorage.getItem("arca_g_token")).toBeNull();
    });
  });

  describe("batchUpdateShiftEvents", () => {
    it("複数日の出勤イベント（Google Event 含む）を一括で更新する", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: "updated" }),
      });

      const existingEvents: CalendarEvent[] = [
        {
          id: "ev-1",
          title: "早番",
          date: "2026-09-01",
          startTime: "06:00",
          endTime: "14:30",
          note: "",
          googleEventId: "gid-1",
          createdAt: null,
        },
        {
          id: "ev-2",
          title: "早番",
          date: "2026-09-02",
          startTime: "06:00",
          endTime: "14:30",
          note: "",
          googleEventId: "gid-2",
          createdAt: null,
        },
      ];

      await batchUpdateShiftEvents(
        "mock-token",
        ["2026-09-01", "2026-09-02"],
        {
          title: "遅番",
          startTime: "15:00",
          endTime: "23:30",
        },
        existingEvents
      );

      // Google Calendar API への PATCH が2回呼ばれること
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
      expect(updateDoc).toHaveBeenCalledTimes(2);
    });

    it("既存出勤イベントに googleEventId が未設定の場合、Google カレンダーに新規作成してIDを紐付ける", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: "new-gid-from-unlinked" }),
      });

      const existingEvents: CalendarEvent[] = [
        {
          id: "ev-unlinked",
          title: "出勤",
          date: "2026-09-05",
          startTime: "06:00",
          endTime: "14:30",
          note: "",
          googleEventId: undefined,
          createdAt: null,
        },
      ];

      await batchUpdateShiftEvents(
        "mock-token",
        ["2026-09-05"],
        {
          title: "遅番",
          startTime: "15:00",
          endTime: "23:30",
        },
        existingEvents
      );

      // Google Calendar API への POST（新規作成）が呼ばれること
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      const fetchCall = (globalThis.fetch as Mock).mock.calls[0];
      expect(fetchCall[1].method).toBe("POST");

      // Firestore の updateDoc で googleEventId が紐付けられて更新されること
      expect(updateDoc).toHaveBeenCalledWith(
        "events/ev-unlinked",
        expect.objectContaining({
          title: "遅番",
          startTime: "15:00",
          endTime: "23:30",
          googleEventId: "new-gid-from-unlinked",
        })
      );
    });

    it("既存イベントの更新時に 404 エラーとなった場合、新規作成へフォールバックしてIDを再紐付けする", async () => {
      // 1回目 (PATCH) は 404、2回目 (POST fallback) は成功
      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          text: async () => JSON.stringify({ error: { message: "Not Found" } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ id: "recreated-gid-404" }),
        });

      const existingEvents: CalendarEvent[] = [
        {
          id: "ev-404",
          title: "出勤",
          date: "2026-09-06",
          startTime: "06:00",
          endTime: "14:30",
          note: "",
          googleEventId: "deleted-gid",
          createdAt: null,
        },
      ];

      await batchUpdateShiftEvents(
        "mock-token",
        ["2026-09-06"],
        {
          title: "遅番",
          startTime: "15:00",
          endTime: "23:30",
        },
        existingEvents
      );

      // PATCH (404) -> POST (新規作成) で2回呼び出し
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
      expect(updateDoc).toHaveBeenCalledWith(
        "events/ev-404",
        expect.objectContaining({
          googleEventId: "recreated-gid-404",
        })
      );
    });

    it("既存の出勤イベントが存在しない日には新規作成を行う", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: "new-gid-created" }),
      });

      await batchUpdateShiftEvents(
        "mock-token",
        ["2026-09-10"],
        {
          title: "早番",
          startTime: "06:00",
          endTime: "14:30",
        },
        []
      );

      // Google Calendar API への POST
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      // Firestore への addDoc
      expect(addDoc).toHaveBeenCalledTimes(1);
    });
  });

  describe("resolveShiftTimes", () => {
    it("指定されたカスタム時間を最優先で返す", () => {
      const times = resolveShiftTimes("早番", "07:00", "16:00");
      expect(times).toEqual({ startTime: "07:00", endTime: "16:00" });
    });

    it("早番キーワードから 06:00〜14:30 を導出する（8.5時間 / 510分）", () => {
      const times = resolveShiftTimes("早番(5時)");
      expect(times.startTime).toBe("06:00");
      expect(times.endTime).toBe("14:30");
    });

    it("遅番キーワードから 15:00〜23:30 を導出する（8.5時間 / 510分）", () => {
      const times = resolveShiftTimes("遅番");
      expect(times.startTime).toBe("15:00");
      expect(times.endTime).toBe("23:30");
    });

    it("遅番16キーワードから 16:00〜00:30 を導出する（8.5時間 / 510分）", () => {
      const times = resolveShiftTimes("遅番16");
      expect(times.startTime).toBe("16:00");
      expect(times.endTime).toBe("00:30");
    });

    it("日勤キーワードから 08:30〜17:00 を導出する（8.5時間 / 510分）", () => {
      const times = resolveShiftTimes("日勤");
      expect(times.startTime).toBe("08:30");
      expect(times.endTime).toBe("17:00");
    });

    it("userStart のみ指定された場合、自動で +510分（8.5時間）の終了時刻を導出する", () => {
      const times = resolveShiftTimes(undefined, "07:00");
      expect(times.startTime).toBe("07:00");
      expect(times.endTime).toBe("15:30");
    });
  });

  describe("applyShiftStatusToGoogleCalendar", () => {
    it("isReset === true の場合はオーバーライドを解除する", async () => {
      const res = await applyShiftStatusToGoogleCalendar(
        "mock-token",
        {
          date: "2026-10-05",
          type: "holiday",
          isReset: true,
        },
        []
      );

      expect(res.success).toBe(true);
      expect(setDoc).toHaveBeenCalled();
    });

    it("休日に変更時、既存の出勤イベントを Google カレンダーおよび Firestore から削除する", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
        text: async () => "",
      });

      const existingEvent = createMockEvent({
        id: "work-doc-1",
        date: "2026-10-05",
        title: "早番",
        googleEventId: "gid-work-1",
      });

      const res = await applyShiftStatusToGoogleCalendar(
        "mock-token",
        {
          date: "2026-10-05",
          type: "holiday",
          streakNumber: 1,
        },
        [existingEvent]
      );

      expect(res.success).toBe(true);
      // Google Calendar DELETE が呼ばれる
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      const call = (globalThis.fetch as Mock).mock.calls[0];
      expect(call[1].method).toBe("DELETE");
      expect(deleteDoc).toHaveBeenCalledWith("events/work-doc-1");
    });

    it("出勤に変更時、既存イベントがなければ Google カレンダー新規作成 & Firestore addDoc", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: "new-google-event-id" }),
      });

      const res = await applyShiftStatusToGoogleCalendar(
        "mock-token",
        {
          date: "2026-10-05",
          type: "work",
          shiftName: "早番",
          streakNumber: 1,
        },
        []
      );

      expect(res.success).toBe(true);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      const call = (globalThis.fetch as Mock).mock.calls[0];
      expect(call[1].method).toBe("POST");
      expect(addDoc).toHaveBeenCalledTimes(1);
    });

    it("出勤に変更時、既存イベントがあれば Google カレンダー PATCH & Firestore updateDoc", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: "gid-exist" }),
      });

      const existingEvent = createMockEvent({
        id: "work-doc-2",
        date: "2026-10-05",
        title: "出勤",
        googleEventId: "gid-exist",
      });

      const res = await applyShiftStatusToGoogleCalendar(
        "mock-token",
        {
          date: "2026-10-05",
          type: "work",
          shiftName: "遅番",
          streakNumber: 2,
        },
        [existingEvent]
      );

      expect(res.success).toBe(true);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      const call = (globalThis.fetch as Mock).mock.calls[0];
      expect(call[1].method).toBe("PATCH");
      expect(updateDoc).toHaveBeenCalledTimes(1);
    });
  });
});

