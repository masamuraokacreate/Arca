/**
 * src/services/googleTasksSync.test.ts
 * Google Tasks 買い物リスト双方向同期サービスの単体テスト
 */

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import {
  findShoppingTaskList,
  syncGoogleTasksToArca,
  pushItemToGoogleTasks,
  pushStatusToGoogleTasks,
  removeItemFromGoogleTasks,
} from "./googleTasksSync";
import {
  getTaskLists,
  getTasks,
  addTask,
  updateTaskStatus,
  deleteTask,
} from "../lib/googleTasks";
import {
  collection,
  addDoc,
  updateDoc,
  doc,
} from "firebase/firestore";
import type { ListItem } from "../types";

vi.mock("../lib/googleTasks", () => ({
  getTaskLists: vi.fn(),
  getTasks: vi.fn(),
  addTask: vi.fn(),
  updateTaskStatus: vi.fn(),
  deleteTask: vi.fn(),
}));

describe("googleTasksSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (collection as Mock).mockImplementation((_db, path) => path);
    (doc as Mock).mockImplementation((_db, path, id) => `${path}/${id}`);
    (addDoc as Mock).mockResolvedValue({ id: "new-firestore-id" });
    (updateDoc as Mock).mockResolvedValue(undefined);
  });

  describe("findShoppingTaskList", () => {
    it("「買い物リスト」というタイトルのリストを優先して返す", async () => {
      (getTaskLists as Mock).mockResolvedValue([
        { id: "list-1", title: "My Tasks" },
        { id: "list-2", title: "買い物リスト" },
      ]);

      const list = await findShoppingTaskList("test-token");
      expect(list?.id).toBe("list-2");
      expect(list?.title).toBe("買い物リスト");
    });

    it("「買い物」というタイトルのリストも探索して返す", async () => {
      (getTaskLists as Mock).mockResolvedValue([
        { id: "list-1", title: "Default" },
        { id: "list-3", title: "買い物" },
      ]);

      const list = await findShoppingTaskList("test-token");
      expect(list?.id).toBe("list-3");
    });

    it("特定の買い物リストが存在しない場合は @default リストまたは先頭のリストを返す", async () => {
      (getTaskLists as Mock).mockResolvedValue([
        { id: "@default", title: "デフォルト" },
        { id: "list-9", title: "その他" },
      ]);

      const list = await findShoppingTaskList("test-token");
      expect(list?.id).toBe("@default");
    });
  });

  describe("pushItemToGoogleTasks / pushStatusToGoogleTasks / removeItemFromGoogleTasks", () => {
    it("pushItemToGoogleTasks が addTask を正しく呼び出す", async () => {
      (addTask as Mock).mockResolvedValue("gtask-999");

      const id = await pushItemToGoogleTasks("token", "list-1", "牛乳");
      expect(addTask).toHaveBeenCalledWith("token", "list-1", "牛乳");
      expect(id).toBe("gtask-999");
    });

    it("pushStatusToGoogleTasks が updateTaskStatus を正しく呼び出す", async () => {
      (updateTaskStatus as Mock).mockResolvedValue(undefined);

      await pushStatusToGoogleTasks("token", "list-1", "gtask-1", true);
      expect(updateTaskStatus).toHaveBeenCalledWith("token", "list-1", "gtask-1", true);
    });

    it("removeItemFromGoogleTasks が deleteTask を正しく呼び出す", async () => {
      (deleteTask as Mock).mockResolvedValue(undefined);

      await removeItemFromGoogleTasks("token", "list-1", "gtask-1");
      expect(deleteTask).toHaveBeenCalledWith("token", "list-1", "gtask-1");
    });
  });

  describe("syncGoogleTasksToArca", () => {
    it("googleTaskId が一致する既存アイテムのステータスに差分があれば updateDoc を実行する", async () => {
      (getTasks as Mock).mockResolvedValue([
        { id: "g1", title: "たまご", status: "completed" },
      ]);

      const existing: ListItem[] = [
        {
          id: "item-1",
          text: "たまご",
          completed: false,
          googleTaskId: "g1",
          createdAt: null,
        },
      ];

      const res = await syncGoogleTasksToArca("token", "list-1", existing);
      expect(res.updated).toBe(1);
      expect(res.added).toBe(0);
      expect(updateDoc).toHaveBeenCalledTimes(1);
      expect((updateDoc as Mock).mock.calls[0][1].completed).toBe(true);
    });

    it("未紐付けで同一テキストのアイテムがある場合は googleTaskId を紐付ける", async () => {
      (getTasks as Mock).mockResolvedValue([
        { id: "g2", title: "パン", status: "needsAction" },
      ]);

      const existing: ListItem[] = [
        {
          id: "item-2",
          text: "パン",
          completed: false,
          createdAt: null,
        },
      ];

      const res = await syncGoogleTasksToArca("token", "list-1", existing);
      expect(res.updated).toBe(1);
      expect(res.added).toBe(0);
      expect(updateDoc).toHaveBeenCalledTimes(1);
      expect((updateDoc as Mock).mock.calls[0][1].googleTaskId).toBe("g2");
    });

    it("新規タスクの場合は addDoc で Arca に追加する", async () => {
      (getTasks as Mock).mockResolvedValue([
        { id: "g3", title: "納豆", status: "needsAction" },
      ]);

      const existing: ListItem[] = [];

      const res = await syncGoogleTasksToArca("token", "list-1", existing);
      expect(res.added).toBe(1);
      expect(res.updated).toBe(0);
      expect(addDoc).toHaveBeenCalledTimes(1);
      expect((addDoc as Mock).mock.calls[0][1].text).toBe("納豆");
      expect((addDoc as Mock).mock.calls[0][1].googleTaskId).toBe("g3");
    });
  });
});
