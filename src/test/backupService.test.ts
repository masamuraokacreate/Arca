/**
 * src/test/backupService.test.ts
 * backupService の単体テスト（集約・エクスポート・Google Driveアップロード・フォルダ自動作成・復元）
 */
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import {
  getDocs,
  writeBatch,
} from "firebase/firestore";
import {
  generateBackupData,
  exportToJsonFile,
  backupToGoogleDrive,
  getOrCreateFolder,
  getOrCreateBackupFolder,
  restoreFromJson,
  getLastBackupInfo,
  type BackupData,
} from "../services/backupService";

describe("backupService", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();

    // Firestore getDocs モック
    (getDocs as Mock).mockImplementation((colRef: { id?: string }) => {
      const colId = colRef?.id || "mockCol";
      if (colId === "lists") {
        return Promise.resolve({
          docs: [
            {
              id: "list-1",
              data: () => ({ text: "牛乳", completed: false, category: "食料品" }),
            },
          ],
        });
      }
      if (colId === "tasks") {
        return Promise.resolve({
          docs: [
            {
              id: "task-1",
              data: () => ({ title: "報告書作成", completed: false, priority: "high" }),
            },
          ],
        });
      }
      if (colId === "events") {
        return Promise.resolve({
          docs: [
            {
              id: "event-1",
              data: () => ({ title: "ミーティング", date: "2026-08-19", startTime: "10:00" }),
            },
          ],
        });
      }
      if (colId === "notes") {
        return Promise.resolve({
          docs: [
            {
              id: "note-1",
              data: () => ({ title: "設計ノート", content: "アイデアメモ", tags: ["tech"] }),
            },
          ],
        });
      }
      return Promise.resolve({ docs: [] });
    });

    // writeBatch モック
    const mockBatch = {
      set: vi.fn(),
      delete: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
    };
    (writeBatch as Mock).mockReturnValue(mockBatch);
  });

  describe("generateBackupData", () => {
    it("全コレクションのデータを集約し、構造化されたBackupDataを生成する", async () => {
      const backup = await generateBackupData();

      expect(backup.version).toBe("1.0");
      expect(backup.exportedAt).toBeDefined();
      expect(backup.counts).toEqual({
        lists: 1,
        tasks: 1,
        events: 1,
        notes: 1,
      });
      expect(backup.data.lists[0]).toMatchObject({ id: "list-1", text: "牛乳" });
      expect(backup.data.tasks[0]).toMatchObject({ id: "task-1", title: "報告書作成" });
      expect(backup.data.events[0]).toMatchObject({ id: "event-1", title: "ミーティング" });
      expect(backup.data.notes[0]).toMatchObject({ id: "note-1", title: "設計ノート" });
    });
  });

  describe("exportToJsonFile", () => {
    it("ブラウザのダウンロードを発火し、最終バックアップ情報をlocalStorageに保存する", async () => {
      const clickSpy = vi.fn();
      const createElementOrig = document.createElement.bind(document);
      vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
        const el = createElementOrig(tagName);
        if (tagName === "a") {
          el.click = clickSpy;
        }
        return el;
      });

      globalThis.URL.createObjectURL = vi.fn().mockReturnValue("blob:mock-url");
      globalThis.URL.revokeObjectURL = vi.fn();

      const result = await exportToJsonFile();

      expect(result.fileName).toMatch(/^arca_backup_\d{8}_\d{4}\.json$/);
      expect(clickSpy).toHaveBeenCalled();

      const lastBackup = getLastBackupInfo();
      expect(lastBackup).not.toBeNull();
      expect(lastBackup?.target).toBe("local");
      expect(lastBackup?.fileName).toBe(result.fileName);
    });
  });

  describe("getOrCreateFolder & getOrCreateBackupFolder", () => {
    it("フォルダが既存の場合はそのIDを返す", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ files: [{ id: "existing-folder-id", name: "800_Arca" }] }),
      });
      globalThis.fetch = mockFetch;

      const folderId = await getOrCreateFolder("mock-token", "800_Arca", "root");
      expect(folderId).toBe("existing-folder-id");
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("フォルダが存在しない場合は新規作成してIDを返す", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ files: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: "created-folder-id" }),
        });
      globalThis.fetch = mockFetch;

      const folderId = await getOrCreateFolder("mock-token", "800_Arca", "root");
      expect(folderId).toBe("created-folder-id");
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("getOrCreateBackupFolder で 800_Arca と 810_バックアップ の階層を作成・取得する", async () => {
      const mockFetch = vi
        .fn()
        // 1. 800_Arca 検索 -> 存在
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ files: [{ id: "arca-root-id", name: "800_Arca" }] }),
        })
        // 2. 810_バックアップ 検索 -> なし
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ files: [] }),
        })
        // 3. 810_バックアップ 作成
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: "backup-subfolder-id" }),
        });
      globalThis.fetch = mockFetch;

      const backupFolderId = await getOrCreateBackupFolder("mock-token");
      expect(backupFolderId).toBe("backup-subfolder-id");
    });
  });

  describe("backupToGoogleDrive", () => {
    it("アクセストークンがない場合はエラーを投げる", async () => {
      await expect(backupToGoogleDrive("")).rejects.toThrow("アクセストークンが見つかりません");
    });

    it("フォルダ階層を取得し、parentsにバックアップフォルダIDを指定してMultipartアップロードする", async () => {
      const mockFetch = vi
        .fn()
        // 1. 800_Arca 検索
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ files: [{ id: "arca-folder-id", name: "800_Arca" }] }),
        })
        // 2. 810_バックアップ 検索
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ files: [{ id: "backup-folder-id", name: "810_バックアップ" }] }),
        })
        // 3. Multipart アップロード
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: "drive-file-123", name: "arca_backup_20260819_1700.json" }),
        });
      globalThis.fetch = mockFetch;

      const result = await backupToGoogleDrive("test-access-token");

      expect(mockFetch).toHaveBeenNthCalledWith(
        3,
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer test-access-token",
            "Content-Type": expect.stringContaining("multipart/related; boundary="),
          }),
          body: expect.stringContaining('"parents":["backup-folder-id"]'),
        })
      );

      expect(result.fileId).toBe("drive-file-123");
      const lastBackup = getLastBackupInfo();
      expect(lastBackup?.target).toBe("drive");
      expect(lastBackup?.fileId).toBe("drive-file-123");
    });
  });

  describe("restoreFromJson", () => {
    const mockBackup: BackupData = {
      version: "1.0",
      exportedAt: "2026-08-19T08:00:00.000Z",
      owner: "test@example.com",
      counts: { lists: 1, tasks: 1, events: 1, notes: 1 },
      data: {
        lists: [{ id: "l-1", text: "リンゴ", completed: false }],
        tasks: [{ id: "t-1", title: "買い物", completed: false }],
        events: [{ id: "e-1", title: "予定A", date: "2026-08-20" }],
        notes: [{ id: "n-1", title: "メモA", content: "内容" }],
      },
    };

    it("無効なJSONフォーマットの場合はエラーを投げる", async () => {
      await expect(restoreFromJson("invalid json")).rejects.toThrow();
      await expect(restoreFromJson({} as BackupData)).rejects.toThrow("バックアップ形式として認識できません");
    });

    it("マージモードで正常にFirestoreへ反映する", async () => {
      const res = await restoreFromJson(mockBackup, "merge");

      expect(res.success).toBe(true);
      expect(res.importedCounts).toEqual({
        lists: 1,
        tasks: 1,
        events: 1,
        notes: 1,
      });
      expect(res.mode).toBe("merge");
    });

    it("完全上書きモードで既存データを削除してから復元する", async () => {
      const res = await restoreFromJson(mockBackup, "overwrite");

      expect(res.success).toBe(true);
      expect(res.mode).toBe("overwrite");
    });
  });
});
