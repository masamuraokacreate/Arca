import { describe, it, expect } from "vitest";
import {
  buildFootprintFromData,
  formatFootprintMarkdown,
} from "../services/footprintService";

describe("footprintService", () => {
  describe("buildFootprintFromData", () => {
    it("指定日の完了タスクと予定を正しく抽出し、isShiftOnly予定や未完了タスクを除外する", () => {
      const tasks = [
        { title: "牛乳を買う", dueDate: "2026-09-06", completed: true },
        { title: "レポート提出", dueDate: "2026-09-06", completed: false }, // 未完了
        { title: "別日のタスク", dueDate: "2026-09-07", completed: true }, // 別日
        { title: "当日更新タスク", dueDate: null, updatedAt: "2026-09-06T12:00:00Z", completed: true },
      ];

      const events = [
        { title: "チーム定例", date: "2026-09-06", startTime: "10:00", endTime: "11:00", isShiftOnly: false },
        { title: "ランチミーティング", date: "2026-09-06", startTime: "12:30", endTime: "13:30", isShiftOnly: false },
        { title: "出勤計算用シフト", date: "2026-09-06", startTime: "09:00", endTime: "18:00", isShiftOnly: true }, // 除外対象
        { title: "明日の予定", date: "2026-09-07", startTime: "15:00", endTime: "16:00", isShiftOnly: false },
      ];

      const result = buildFootprintFromData(tasks, events, "2026-09-06");

      expect(result.completedTasks).toEqual(["牛乳を買う", "当日更新タスク"]);
      expect(result.events).toEqual([
        "10:00〜11:00 チーム定例",
        "12:30〜13:30 ランチミーティング",
      ]);
    });

    it("該当データがない場合は空配列を返す", () => {
      const result = buildFootprintFromData([], [], "2026-09-06");
      expect(result.completedTasks).toEqual([]);
      expect(result.events).toEqual([]);
    });
  });

  describe("formatFootprintMarkdown", () => {
    it("予定とタスクがある場合、見やすい引用チェックリストMarkdownを生成する", () => {
      const md = formatFootprintMarkdown(
        {
          completedTasks: ["タスク1", "タスク2"],
          events: ["10:00 会議"],
        },
        "2026-09-06"
      );

      expect(md).toContain("> 📅 **2026-09-06 の足跡**");
      expect(md).toContain("> **予定:**");
      expect(md).toContain("> - 10:00 会議");
      expect(md).toContain("> **完了タスク:**");
      expect(md).toContain("> - [x] タスク1");
      expect(md).toContain("> - [x] タスク2");
    });

    it("空の場合は空状態メッセージを含むMarkdownを返す", () => {
      const md = formatFootprintMarkdown(
        { completedTasks: [], events: [] },
        "2026-09-06"
      );

      expect(md).toContain("記録された予定・完了タスクはありません");
    });
  });
});
