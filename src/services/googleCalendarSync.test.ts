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
  syncGoogleCalendarToArca,
  GoogleCalendarApiError,
} from "./googleCalendarSync";
import {
  collection,
  addDoc,
  updateDoc,
  doc,
} from "firebase/firestore";
import type { CalendarEvent } from "../types";

describe("googleCalendarSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (collection as Mock).mockImplementation((_db, path) => path);
    (doc as Mock).mockImplementation((_db, path, id) => `${path}/${id}`);
    (addDoc as Mock).mockResolvedValue({ id: "new-firestore-id" });
    (updateDoc as Mock).mockResolvedValue(undefined);
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

    it("新規予定の場合は addDoc で Arca に追加する", async () => {
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
      expect(addDoc).toHaveBeenCalledTimes(1);
      expect((addDoc as Mock).mock.calls[0][1].title).toBe("完全新規の予定");
      expect((addDoc as Mock).mock.calls[0][1].googleEventId).toBe("g3");
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
      expect(addDoc).toHaveBeenCalledTimes(2);

      // プライマリ予定は isShiftOnly: false
      const addedCalls = (addDoc as Mock).mock.calls;
      const mainCall = addedCalls.find((c) => c[1].googleEventId === "main-event-1");
      expect(mainCall?.[1].isShiftOnly).toBe(false);

      // 出勤予定カレンダーの予定は isShiftOnly: true
      const shiftCall = addedCalls.find((c) => c[1].googleEventId === "shift-event-1");
      expect(shiftCall?.[1].isShiftOnly).toBe(true);
      expect(shiftCall?.[1].title).toBe("遅番(15時)");
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
});

