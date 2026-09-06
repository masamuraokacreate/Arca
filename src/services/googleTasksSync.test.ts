/**
 * src/services/googleTasksSync.test.ts
 * Google Tasks 買い物リスト・タスクリスト双方向同期サービスの単体テスト
 */

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import {
  findShoppingTaskList,
  findDefaultTaskList,
  parseGoogleTaskNotes,
  formatGoogleTaskNotes,
  cleanDuplicateTasks,
  syncGoogleTasksToArca,
  syncGoogleTasksForList,
  syncAllGoogleTasks,
  pushTaskToGoogleTasks,
  pushTaskStatusToGoogleTasks,
  pushTaskUpdateToGoogleTasks,
  removeTaskFromGoogleTasks,
  batchRemoveTasksFromGoogleTasks,
  pushSubTaskToGoogleTasks,
  pushSubTaskStatusToGoogleTasks,
  pushSubTaskUpdateToGoogleTasks,
  removeSubTaskFromGoogleTasks,
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
  addSubTask,
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
  deleteDoc,
  setDoc,
  doc,
} from "firebase/firestore";
import type { ListItem, TaskItem } from "../types";

vi.mock("../lib/googleTasks", () => ({
  getTaskLists: vi.fn(),
  getTasks: vi.fn(),
  addTask: vi.fn(),
  addSubTask: vi.fn(),
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
    (setDoc as Mock).mockResolvedValue(undefined);
    (deleteDoc as Mock).mockResolvedValue(undefined);
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

  describe("parseGoogleTaskNotes & formatGoogleTaskNotes", () => {
    it("notesから優先度タグを抽出し、本文メモと優先度に分離する", () => {
      const raw = "スーパーで卵を買う\n\n#priority:high";
      const { notes, priority } = parseGoogleTaskNotes(raw);
      expect(notes).toBe("スーパーで卵を買う");
      expect(priority).toBe("high");
    });

    it("[Arca] 形式の優先度タグも正しく抽出できる", () => {
      const raw = "資料作成\n[Arca] priority: low";
      const { notes, priority } = parseGoogleTaskNotes(raw);
      expect(notes).toBe("資料作成");
      expect(priority).toBe("low");
    });

    it("優先度タグがない場合は medium と判定し、メモをそのまま返す", () => {
      const raw = "通常のメモです";
      const { notes, priority } = parseGoogleTaskNotes(raw);
      expect(notes).toBe("通常のメモです");
      expect(priority).toBe("medium");
    });

    it("formatGoogleTaskNotes がメモと優先度を正しく結合する", () => {
      const res = formatGoogleTaskNotes("牛乳を買う", "high");
      expect(res).toBe("牛乳を買う\n\n#priority:high");
    });

    it("優先度が medium の場合はタグを付与せずメモのみを出力する", () => {
      const res = formatGoogleTaskNotes("普通のメモ", "medium");
      expect(res).toBe("普通のメモ");
    });
  });

  describe("cleanDuplicateTasks", () => {
    it("同一 googleTaskId の重複を検出し、1件のみ残して余分なドキュメントを deleteDoc で安全に削除する", async () => {
      const existing: TaskItem[] = [
        {
          id: "doc-1",
          title: "タスクA",
          completed: false,
          googleTaskId: "same-gtask-id",
          createdAt: null,
        },
        {
          id: "doc-2",
          title: "タスクA (複製)",
          completed: false,
          googleTaskId: "same-gtask-id",
          createdAt: null,
        },
      ];

      const res = await cleanDuplicateTasks(existing);
      expect(res).toHaveLength(1);
      expect(res[0].id).toBe("doc-1");
      expect(deleteDoc).toHaveBeenCalledTimes(1);
    });
  });

  describe("syncGoogleTasksForList (Tasksコレクション同期)", () => {
    it("googleTaskId 一致のタスクで差分があれば updateDoc を実行する", async () => {
      (getTasks as Mock).mockResolvedValue([
        { id: "g10", title: "レポート修正", status: "completed", due: "2026-09-01T00:00:00.000Z", notes: "詳細\n#priority:high" },
      ]);

      const existing: TaskItem[] = [
        {
          id: "task-10",
          title: "レポート",
          completed: false,
          dueDate: null,
          notes: "",
          priority: "medium",
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
      expect(patch.notes).toBe("詳細");
      expect(patch.priority).toBe("high");
    });

    it("新規Googleタスクの場合は setDoc で Google Task ID をキーにして Tasks コレクションに追加する", async () => {
      (getTasks as Mock).mockResolvedValue([
        { id: "g20", title: "新規プロジェクトタスク", status: "needsAction", notes: "メモ本文\n#priority:low" },
      ]);

      const res = await syncGoogleTasksForList("token", "list-custom", "custom-1", []);
      expect(res.added).toBe(1);
      expect(setDoc).toHaveBeenCalledTimes(1);
      expect(setDoc).toHaveBeenCalledWith(
        "tasks/g20",
        expect.objectContaining({
          title: "新規プロジェクトタスク",
          listId: "custom-1",
          googleTaskId: "g20",
          notes: "メモ本文",
          priority: "low",
        })
      );
    });

    it("カスタムリストのタスクで listId が古いランダムIDだった場合、Googleの正規 listId に updateDoc で補正される", async () => {
      (getTasks as Mock).mockResolvedValue([
        { id: "g30", title: "カスタムタスク", status: "needsAction" },
      ]);

      const existing: TaskItem[] = [
        {
          id: "task-old-random",
          title: "カスタムタスク",
          completed: false,
          dueDate: null,
          notes: "",
          priority: "medium",
          listId: "list-old-random-id",
          googleTaskId: "g30",
          googleListId: "gl-custom-123",
          createdAt: null,
        },
      ];

      const res = await syncGoogleTasksForList("token", "gl-custom-123", "gl-custom-123", existing);
      expect(res.updated).toBe(1);
      expect(updateDoc).toHaveBeenCalledWith(
        "tasks/task-old-random",
        expect.objectContaining({
          listId: "gl-custom-123",
        })
      );
    });

    it("Google Tasks 側で削除されたタスクは Arca 側でも追従削除される (Reconciliation)", async () => {
      // Google API の返却予定（空配列 = Google上でタスクが削除された）
      (getTasks as Mock).mockResolvedValue([]);

      const existing: TaskItem[] = [
        {
          id: "deleted-task-id",
          title: "削除されたタスク",
          completed: false,
          listId: "default",
          googleTaskId: "g-deleted-1",
          createdAt: null,
        },
      ];

      await syncGoogleTasksForList("token", "list-default", "default", existing);
      expect(deleteDoc).toHaveBeenCalledWith("tasks/deleted-task-id");
    });

    it("Google Tasks からサブタスクを取得して対応する親タスクに正しくマージする", async () => {
      (getTasks as Mock).mockResolvedValue([
        { id: "parent-g1", title: "親タスク", status: "needsAction" },
        { id: "sub-g1", title: "サブタスク1", status: "completed", parent: "parent-g1" },
      ]);

      const existing: TaskItem[] = [
        {
          id: "t-parent",
          title: "親タスク",
          completed: false,
          listId: "default",
          googleTaskId: "parent-g1",
          subtasks: [],
          createdAt: null,
        },
      ];

      const res = await syncGoogleTasksForList("token", "list-default", "default", existing);
      expect(res.updated).toBe(1); // subtasks が更新される
      expect(updateDoc).toHaveBeenCalledWith(
        "tasks/t-parent",
        expect.objectContaining({
          subtasks: expect.arrayContaining([
            expect.objectContaining({
              title: "サブタスク1",
              completed: true,
              googleTaskId: "sub-g1",
            }),
          ]),
        })
      );
    });

    it("Arca側にしかないサブタスクを Google Tasks へプッシュする", async () => {
      (getTasks as Mock).mockResolvedValue([
        { id: "parent-g1", title: "親タスク", status: "needsAction" },
      ]);
      (addSubTask as Mock).mockResolvedValue("new-sub-g-id");

      const existing: TaskItem[] = [
        {
          id: "t-parent",
          title: "親タスク",
          completed: false,
          listId: "default",
          googleTaskId: "parent-g1",
          subtasks: [
            { id: "sub-local-1", title: "ローカル作成サブタスク", completed: false },
          ],
          createdAt: null,
        },
      ];

      const res = await syncGoogleTasksForList("token", "list-default", "default", existing);
      expect(addSubTask).toHaveBeenCalledWith("token", "list-default", "parent-g1", "ローカル作成サブタスク");
      expect(res.updated).toBe(1);
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
      expect(setDoc).toHaveBeenCalledTimes(2);
    });
  });

  describe("サブタスクCRUD操作連動", () => {
    it("pushSubTaskToGoogleTasks が addSubTask を正しく呼ぶ", async () => {
      (addSubTask as Mock).mockResolvedValue("gsub-123");
      const id = await pushSubTaskToGoogleTasks("token", "list-1", "parent-1", "サブタスクA");
      expect(addSubTask).toHaveBeenCalledWith("token", "list-1", "parent-1", "サブタスクA");
      expect(id).toBe("gsub-123");
    });

    it("pushSubTaskStatusToGoogleTasks が updateTaskStatus を正しく呼ぶ", async () => {
      await pushSubTaskStatusToGoogleTasks("token", "list-1", "gsub-1", true);
      expect(updateTaskStatus).toHaveBeenCalledWith("token", "list-1", "gsub-1", true);
    });

    it("pushSubTaskUpdateToGoogleTasks が updateTask を正しく呼ぶ", async () => {
      await pushSubTaskUpdateToGoogleTasks("token", "list-1", "gsub-1", { title: "サブ更新", completed: true });
      expect(updateTask).toHaveBeenCalledWith("token", "list-1", "gsub-1", { title: "サブ更新", completed: true });
    });

    it("removeSubTaskFromGoogleTasks が deleteTask を正しく呼ぶ", async () => {
      await removeSubTaskFromGoogleTasks("token", "list-1", "gsub-1");
      expect(deleteTask).toHaveBeenCalledWith("token", "list-1", "gsub-1");
    });
  });

  describe("タスク・リストのCRUD操作連動", () => {
    it("pushTaskToGoogleTasks が addTask を正しく呼ぶ", async () => {
      (addTask as Mock).mockResolvedValue("gtask-123");
      const id = await pushTaskToGoogleTasks("token", "list-1", "タスクA", "2026-08-30", "メモ本文", "high");
      expect(addTask).toHaveBeenCalledWith("token", "list-1", "タスクA", "2026-08-30", "メモ本文\n\n#priority:high");
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

    it("batchRemoveTasksFromGoogleTasks が複数のタスクを並列チャンクで削除する", async () => {
      (deleteTask as Mock).mockResolvedValue(undefined);
      const tasks = [
        { tasklistId: "list-1", googleTaskId: "g-1" },
        { tasklistId: "list-1", googleTaskId: "g-2" },
        { tasklistId: "list-2", googleTaskId: "g-3" },
      ];
      const results = await batchRemoveTasksFromGoogleTasks("token", tasks, 2);
      expect(deleteTask).toHaveBeenCalledTimes(3);
      expect(results).toHaveLength(3);
      expect(results.every((r) => r.status === "fulfilled")).toBe(true);
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
