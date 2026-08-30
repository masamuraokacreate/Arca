/**
 * src/test/noteHierarchy.test.ts
 * Arca — Notes 階層トラバース・パンくず・子孫収集 単体テスト
 */

import { describe, it, expect } from "vitest";
import type { NoteItem } from "../types";
import {
  getBreadcrumbs,
  getChildNotes,
  getChildCount,
  getDescendantNoteIds,
  canMoveNoteTo,
  getHierarchyTreeOptions,
} from "../utils/noteHierarchy";

describe("noteHierarchy ユーティリティ", () => {
  const sampleNotes: NoteItem[] = [
    {
      id: "root-1",
      title: "プロジェクト構想",
      content: "プロジェクト全体の構想メモ",
      tags: ["仕事"],
      createdAt: "2026-08-01T10:00:00.000Z",
      updatedAt: "2026-08-01T10:00:00.000Z",
      parentId: null,
    },
    {
      id: "root-2",
      title: "お買い物リスト",
      content: "日用品など",
      tags: ["個人"],
      createdAt: "2026-08-01T11:00:00.000Z",
      updatedAt: "2026-08-01T11:00:00.000Z",
      parentId: null,
    },
    {
      id: "child-1-1",
      title: "技術選定メモ",
      content: "React + Tailwind + Vite",
      tags: ["技術"],
      createdAt: "2026-08-02T10:00:00.000Z",
      updatedAt: "2026-08-02T10:00:00.000Z",
      parentId: "root-1",
    },
    {
      id: "child-1-2",
      title: "デザインガイドライン",
      content: "Apple HIG 準拠",
      tags: ["デザイン"],
      createdAt: "2026-08-02T11:00:00.000Z",
      updatedAt: "2026-08-02T11:00:00.000Z",
      parentId: "root-1",
    },
    {
      id: "grandchild-1-1-1",
      title: "状態管理の比較",
      content: "Zustand vs Redux Toolkit",
      tags: ["技術"],
      createdAt: "2026-08-03T10:00:00.000Z",
      updatedAt: "2026-08-03T10:00:00.000Z",
      parentId: "child-1-1",
    },
    {
      id: "deleted-child",
      title: "削除済み子ノート",
      content: "ゴミ箱に入っている",
      tags: [],
      createdAt: "2026-08-03T12:00:00.000Z",
      updatedAt: "2026-08-03T12:00:00.000Z",
      parentId: "root-1",
      isDeleted: true,
    },
  ];

  describe("getBreadcrumbs", () => {
    it("currentNoteId が null の場合はトップの「Notes」のみを返す", () => {
      const breadcrumbs = getBreadcrumbs(sampleNotes, null);
      expect(breadcrumbs).toEqual([{ id: null, title: "Notes" }]);
    });

    it("ルート階層ノートの場合は [Notes, ノートタイトル] を返す", () => {
      const breadcrumbs = getBreadcrumbs(sampleNotes, "root-1");
      expect(breadcrumbs).toEqual([
        { id: null, title: "Notes" },
        { id: "root-1", title: "プロジェクト構想" },
      ]);
    });

    it("深い階層のノート（孫ノート）の場合は再帰的にルートから現在地までの経路を返す", () => {
      const breadcrumbs = getBreadcrumbs(sampleNotes, "grandchild-1-1-1");
      expect(breadcrumbs).toEqual([
        { id: null, title: "Notes" },
        { id: "root-1", title: "プロジェクト構想" },
        { id: "child-1-1", title: "技術選定メモ" },
        { id: "grandchild-1-1-1", title: "状態管理の比較" },
      ]);
    });

    it("タイトルが空文字の場合は「（タイトルなし）」として返す", () => {
      const notesWithEmptyTitle: NoteItem[] = [
        {
          id: "empty-1",
          title: "   ",
          content: "内容のみ",
          tags: [],
          createdAt: "2026-08-01T10:00:00.000Z",
          updatedAt: "2026-08-01T10:00:00.000Z",
          parentId: null,
        },
      ];
      const breadcrumbs = getBreadcrumbs(notesWithEmptyTitle, "empty-1");
      expect(breadcrumbs).toEqual([
        { id: null, title: "Notes" },
        { id: "empty-1", title: "（タイトルなし）" },
      ]);
    });

    it("循環参照（A -> B -> A）がある場合でも無限ループにならず安全に終了する", () => {
      const circularNotes: NoteItem[] = [
        {
          id: "node-a",
          title: "Node A",
          content: "",
          tags: [],
          createdAt: "2026-08-01T10:00:00.000Z",
          updatedAt: "2026-08-01T10:00:00.000Z",
          parentId: "node-b",
        },
        {
          id: "node-b",
          title: "Node B",
          content: "",
          tags: [],
          createdAt: "2026-08-01T10:00:00.000Z",
          updatedAt: "2026-08-01T10:00:00.000Z",
          parentId: "node-a",
        },
      ];
      const breadcrumbs = getBreadcrumbs(circularNotes, "node-a");
      expect(breadcrumbs.length).toBeGreaterThanOrEqual(2);
      expect(breadcrumbs[0]).toEqual({ id: null, title: "Notes" });
    });
  });

  describe("getChildNotes", () => {
    it("parentId が null の場合はルート階層のアクティブノートのみを返す", () => {
      const rootNotes = getChildNotes(sampleNotes, null);
      expect(rootNotes.map((n) => n.id)).toEqual(["root-1", "root-2"]);
    });

    it("指定した parentId のアクティブな子ノートのみを返し、論理削除済みは除外する", () => {
      const childrenOfRoot1 = getChildNotes(sampleNotes, "root-1");
      expect(childrenOfRoot1.map((n) => n.id)).toEqual(["child-1-1", "child-1-2"]);
    });

    it("子ノートが存在しない場合は空配列を返す", () => {
      const childrenOfRoot2 = getChildNotes(sampleNotes, "root-2");
      expect(childrenOfRoot2).toEqual([]);
    });
  });

  describe("getChildCount", () => {
    it("直接のアクティブ子ノート件数を正確に返す", () => {
      expect(getChildCount(sampleNotes, "root-1")).toBe(2); // child-1-1, child-1-2 (deleted-childは除外)
      expect(getChildCount(sampleNotes, "child-1-1")).toBe(1); // grandchild-1-1-1
      expect(getChildCount(sampleNotes, "root-2")).toBe(0);
    });
  });

  describe("getDescendantNoteIds", () => {
    it("子を持たないノートの場合は自身のみのID配列を返す", () => {
      const ids = getDescendantNoteIds(sampleNotes, "root-2");
      expect(ids).toEqual(["root-2"]);
    });

    it("子・孫ノートを持つ親ノートの場合は自身と配下の全子孫ノートIDを再帰的に返す", () => {
      const ids = getDescendantNoteIds(sampleNotes, "root-1");
      expect(ids).toContain("root-1");
      expect(ids).toContain("child-1-1");
      expect(ids).toContain("child-1-2");
      expect(ids).toContain("grandchild-1-1-1");
      expect(ids).toContain("deleted-child");
      expect(ids.length).toBe(5);
    });
  });

  describe("canMoveNoteTo（循環参照防止判定）", () => {
    it("ルート（null）への移動は常に許可される", () => {
      expect(canMoveNoteTo(sampleNotes, "child-1-1", null)).toBe(true);
      expect(canMoveNoteTo(sampleNotes, "grandchild-1-1-1", null)).toBe(true);
    });

    it("自分自身への移動は拒否される", () => {
      expect(canMoveNoteTo(sampleNotes, "root-1", "root-1")).toBe(false);
      expect(canMoveNoteTo(sampleNotes, "child-1-1", "child-1-1")).toBe(false);
    });

    it("自身の子孫ノートへの移動は循環参照となるため拒否される", () => {
      // root-1 をその子 child-1-1 や孫 grandchild-1-1-1 配下に移動しようとすると拒否される
      expect(canMoveNoteTo(sampleNotes, "root-1", "child-1-1")).toBe(false);
      expect(canMoveNoteTo(sampleNotes, "root-1", "grandchild-1-1-1")).toBe(false);
      expect(canMoveNoteTo(sampleNotes, "child-1-1", "grandchild-1-1-1")).toBe(false);
    });

    it("独立した別のノートへの移動は許可される", () => {
      // child-1-1 を root-2 配下へ移動
      expect(canMoveNoteTo(sampleNotes, "child-1-1", "root-2")).toBe(true);
      // grandchild-1-1-1 を child-1-2 配下へ移動
      expect(canMoveNoteTo(sampleNotes, "grandchild-1-1-1", "child-1-2")).toBe(true);
    });
  });

  describe("getHierarchyTreeOptions", () => {
    it("階層順に深さ depth と選択可否 isSelectable を付与した配列を返す", () => {
      const options = getHierarchyTreeOptions(sampleNotes, "child-1-1");

      // 移動対象自身（child-1-1）とその子（grandchild-1-1-1）は選択不可
      const selfOpt = options.find((o) => o.note.id === "child-1-1");
      const childOpt = options.find((o) => o.note.id === "grandchild-1-1-1");
      const otherOpt = options.find((o) => o.note.id === "root-2");

      expect(selfOpt?.isSelectable).toBe(false);
      expect(selfOpt?.disabledReason).toContain("自身");

      expect(childOpt?.isSelectable).toBe(false);
      expect(childOpt?.disabledReason).toContain("循環参照");

      expect(otherOpt?.isSelectable).toBe(true);
    });
  });
});
