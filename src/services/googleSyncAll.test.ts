/**
 * src/services/googleSyncAll.test.ts
 * Google データ一括同期（Calendar & Tasks）のテスト
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { syncAllGoogleData, getSavedToken, loadSavedToken, saveToken, clearSavedToken } from "./googleAuth";
import * as calendarSync from "./googleCalendarSync";
import * as tasksSync from "./googleTasksSync";

describe("syncAllGoogleData", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearSavedToken();
  });

  it("getSavedToken は loadSavedToken と同一の関数であること", () => {
    expect(getSavedToken).toBe(loadSavedToken);
  });

  it("トークン保存と読み出しが正しく動作すること", () => {
    expect(getSavedToken()).toBeNull();
    saveToken("test-token-xyz", 3600);
    expect(getSavedToken()).toBe("test-token-xyz");
    clearSavedToken();
    expect(getSavedToken()).toBeNull();
  });

  it("カレンダーとタスクの同期関数が並行して呼び出され、集計結果を返すこと", async () => {
    const calSpy = vi
      .spyOn(calendarSync, "syncGoogleCalendarToArca")
      .mockResolvedValue({ added: 2, updated: 1 });
    const tasksSpy = vi
      .spyOn(tasksSync, "syncAllGoogleTasks")
      .mockResolvedValue({ added: 3, updated: 0 });

    const res = await syncAllGoogleData("valid-token");

    expect(calSpy).toHaveBeenCalledWith("valid-token");
    expect(tasksSpy).toHaveBeenCalledWith("valid-token");
    expect(res).toEqual({
      calendar: { added: 2, updated: 1 },
      tasks: { added: 3, updated: 0 },
    });
  });

  it("片方の同期が例外を投げても、もう片方は継続し、アプリがクラッシュしないこと (Promise.allSettled)", async () => {
    vi.spyOn(calendarSync, "syncGoogleCalendarToArca").mockRejectedValue(
      new Error("Calendar API 403 Forbidden")
    );
    vi.spyOn(tasksSync, "syncAllGoogleTasks").mockResolvedValue({ added: 4, updated: 2 });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const res = await syncAllGoogleData("valid-token");

    expect(res).toEqual({
      calendar: { added: 0, updated: 0 },
      tasks: { added: 4, updated: 2 },
    });
    expect(warnSpy).toHaveBeenCalled();
  });

  it("インフライトガードにより、実行中の多重呼び出しはスキップされること", async () => {
    let resolveCal: (val: any) => void;
    const slowCalPromise = new Promise<{ added: number; updated: number }>((resolve) => {
      resolveCal = resolve;
    });

    vi.spyOn(calendarSync, "syncGoogleCalendarToArca").mockReturnValue(slowCalPromise);
    vi.spyOn(tasksSync, "syncAllGoogleTasks").mockResolvedValue({ added: 1, updated: 0 });

    // 1回目の呼び出しを開始（未完了状態）
    const firstCallPromise = syncAllGoogleData("token-1");

    // 2回目の呼び出し（インフライト中）
    const secondCallRes = await syncAllGoogleData("token-2");
    expect(secondCallRes).toEqual({
      calendar: { added: 0, updated: 0 },
      tasks: { added: 0, updated: 0 },
    });

    // 1回目を完了させる
    resolveCal!({ added: 5, updated: 2 });
    const firstCallRes = await firstCallPromise;
    expect(firstCallRes).toEqual({
      calendar: { added: 5, updated: 2 },
      tasks: { added: 1, updated: 0 },
    });
  });
});
