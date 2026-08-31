/**
 * src/services/googleTasksSync.test.ts
 * Google Tasks 買い物リスト・タスクリスト双方向同期サービスの単体テスト
 */

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import {
  findShoppingTaskList,
  findDefaultTaskList,
  syncGoogleTasksToArca,
  syncGoogleTasksForList,
  syncAllGoogleTasks,
  pushTaskToGoogleTasks,
  pushTaskStatusToGoogleTasks,
  pushTaskUpdateToGoogleTasks,
  removeTaskFromGoogleTasks,
  createGoogleTaskList,
  renameGoogleTaskList,
  deleteGoogleTaskList,
  pushItemToGoogleTasks,
  pushStatusToGoogleTasks,
  removeItemFromGoogleTasks,
} from "./googleTasksSync";
import {
  getTaskLists,
  getTasks,
  addTask,
  updateTask,
  updateTaskStatus,
  deleteTask,
  addTaskList,
  updateTaskList,
  deleteTaskList,
} from "../lib/googleTasks";
import {
  collection,
  addDoc,
  updateDoc,
  doc,
} from "firebase/firestore";
import type { ListItem, TaskItem } from "../types";

vi.mock("../lib/googleTasks", () => ({
  getTaskLists: vi.fn(),
  getTasks: vi.fn(),
  addTask: vi.fn(),
  updateTask: vi.fn(),
  updateTaskStatus: vi.fn(),
  deleteTask: vi.fn(),
  addTaskList: vi.fn(),
  updateTaskList: vi.fn(),
  deleteTaskList: vi.fn(),
}));

describe("googleTasksSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (collection as Mock).mockImplementation((_db, path) => path);
    (doc as Mock).mockImplementation((_db, path, id) => `${path}/${id}`);
    (addDoc as Mock).mockResolvedValue({ id: "new-firestore-id" });
    (updateDoc as Mock).mockResolvedValue(undefined);
  });

  describe("findShoppingTaskList & findDefaultTaskList", () => {
    it("「買い物リスト」というタイトルのリストを優先して返す", async () => {
      (getTaskLists as Mock).mockResolvedValue([
        { id: "list-1", title: "My Tasks" },
        { id: "list-2", title: "買い物リスト" },
      ]);

      const list = await findShoppingTaskList("test-token");
      expect(list?.id).toBe("list-2");
      expect(list?.title).toBe("買い物リスト");
    });

    it("「マイタスク」または「My Tasks」のデフォルトリストを特定できる", async () => {
      (getTaskLists as Mock).mockResolvedValue([
        { id: "list-my", title: "My Tasks" },
        { id: "list-shop", title: "買い物リスト" },
      ]);

      const list = await findDefaultTaskList("test-token");
      expect(list?.id).toBe("list-my");
    });
  });

  describe("syncGoogleTasksForList (Tasksコレクション同期)", () => {
    it("googleTaskId 一致のタスクで差分があれば updateDoc を実行する", async () => {
      (getTasks as Mock).mockResolvedValue([
        { id: "g10", title: "レポート修正", status: "completed", due: "2026-09-01T00:00:00.000Z" },
      ]);

      const existing: TaskItem[] = [
        {
          id: "task-10",
          title: "レポート",
          completed: false,
          dueDate: null,
          listId: "default",
          googleTaskId: "g10",
          createdAt: null,
        },
      ];

      const res = await syncGoogleTasksForList("token", "list-default", "default", existing);
      expect(res.updated).toBe(1);
      expect(res.added).toBe(0);
      expect(updateDoc).toHaveBeenCalledTimes(1);
      const patch = (updateDoc as Mock).mock.calls[0][1];
      expect(patch.title).toBe("レポート修正");
      expect(patch.completed).toBe(true);
      expect(patch.dueDate).toBe("2026-09-01");
    });

    it("新規Googleタスクの場合は addDoc で Tasks コレクションに追加する", async () => {
      (getTasks as Mock).mockResolvedValue([
        { id: "g20", title: "新規プロジェクトタスク", status: "needsAction" },
      ]);

      const res = await syncGoogleTasksForList("token", "list-custom", "custom-1", []);
      expect(res.added).toBe(1);
      expect(addDoc).toHaveBeenCalledTimes(1);
      const callArg = (addDoc as Mock).mock.calls[0][1];
      expect(callArg.title).toBe("新規プロジェクトタスク");
      expect(callArg.listId).toBe("custom-1");
      expect(callArg.googleTaskId).toBe("g20");
    });

    it("syncAllGoogleTasks が全タスクリストを順次同期する", async () => {
      (getTaskLists as Mock).mockResolvedValue([
        { id: "gl-my", title: "My Tasks" },
        { id: "gl-shop", title: "買い物リスト" },
      ]);
      (getTasks as Mock).mockImplementation((_token, listId) => {
        if (listId === "gl-my") {
          return Promise.resolve([{ id: "t-1", title: "仕事タスク", status: "needsAction" }]);
        }
        return Promise.resolve([{ id: "t-2", title: "卵", status: "completed" }]);
      });

      const res = await syncAllGoogleTasks("token");
      expect(res.added).toBe(2);
      expect(addDoc).toHaveBeenCalledTimes(2);
    });
  });

  describe("タスク・リストのCRUD操作連動", () => {
    it("pushTaskToGoogleTasks が addTask を正しく呼ぶ", async () => {
      (addTask as Mock).mockResolvedValue("gtask-123");
      const id = await pushTaskToGoogleTasks("token", "list-1", "タスクA", "2026-08-30");
      expect(addTask).toHaveBeenCalledWith("token", "list-1", "タスクA", "2026-08-30");
      expect(id).toBe("gtask-123");
    });

    it("pushTaskStatusToGoogleTasks が updateTaskStatus を正しく呼ぶ", async () => {
      await pushTaskStatusToGoogleTasks("token", "list-1", "gtask-1", true);
      expect(updateTaskStatus).toHaveBeenCalledWith("token", "list-1", "gtask-1", true);
    });

    it("pushTaskUpdateToGoogleTasks が updateTask を正しく呼ぶ", async () => {
      await pushTaskUpdateToGoogleTasks("token", "list-1", "gtask-1", { title: "更新名", dueDate: "2026-09-05" });
      expect(updateTask).toHaveBeenCalledWith("token", "list-1", "gtask-1", { title: "更新名", dueDate: "2026-09-05" });
    });

    it("removeTaskFromGoogleTasks が deleteTask を正しく呼ぶ", async () => {
      await removeTaskFromGoogleTasks("token", "list-1", "gtask-1");
      expect(deleteTask).toHaveBeenCalledWith("token", "list-1", "gtask-1");
    });

    it("createGoogleTaskList / renameGoogleTaskList / deleteGoogleTaskList が正しく呼ぶ", async () => {
      (addTaskList as Mock).mockResolvedValue({ id: "gl-1", title: "旅行" });
      (updateTaskList as Mock).mockResolvedValue({ id: "gl-1", title: "旅行計画" });

      const created = await createGoogleTaskList("token", "旅行");
      expect(addTaskList).toHaveBeenCalledWith("token", "旅行");
      expect(created.id).toBe("gl-1");

      const updated = await renameGoogleTaskList("token", "gl-1", "旅行計画");
      expect(updateTaskList).toHaveBeenCalledWith("token", "gl-1", "旅行計画");
      expect(updated.title).toBe("旅行計画");

      await deleteGoogleTaskList("token", "gl-1");
      expect(deleteTaskList).toHaveBeenCalledWith("token", "gl-1");
    });
  });

  describe("買い物リスト後方互換テスト", () => {
    it("pushItemToGoogleTasks が addTask を正しく呼び出す", async () => {
      (addTask as Mock).mockResolvedValue("gtask-999");
      const id = await pushItemToGoogleTasks("token", "list-1", "牛乳");
      expect(addTask).toHaveBeenCalledWith("token", "list-1", "牛乳");
      expect(id).toBe("gtask-999");
    });

    it("pushStatusToGoogleTasks が updateTaskStatus を正しく呼び出す", async () => {
      await pushStatusToGoogleTasks("token", "list-1", "gtask-1", true);
      expect(updateTaskStatus).toHaveBeenCalledWith("token", "list-1", "gtask-1", true);
    });

    it("removeItemFromGoogleTasks が deleteTask を正しく呼び出す", async () => {
      await removeItemFromGoogleTasks("token", "list-1", "gtask-1");
      expect(deleteTask).toHaveBeenCalledWith("token", "list-1", "gtask-1");
    });

    it("syncGoogleTasksToArca が動作する", async () => {
      (getTasks as Mock).mockResolvedValue([
        { id: "g1", title: "たまご", status: "completed" },
      ]);
      const existing: ListItem[] = [
        { id: "item-1", text: "たまご", completed: false, googleTaskId: "g1", createdAt: null },
      ];
      const res = await syncGoogleTasksToArca("token", "list-1", existing);
      expect(res.updated).toBe(1);
    });
  });
});
