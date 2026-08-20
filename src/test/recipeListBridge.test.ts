/**
 * src/test/recipeListBridge.test.ts
 * Recipes ➔ Lists クロスモジュール連携（Aether Link）の単体テスト
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  formatIngredientForList,
  addIngredientToList,
  addIngredientsToList,
} from "../lib/recipeListBridge";
import { addDoc, writeBatch } from "firebase/firestore";

describe("recipeListBridge ユーティリティ", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("formatIngredientForList", () => {
    it("材料名と分量を連結して整形する", () => {
      expect(
        formatIngredientForList({ id: "1", name: "合挽き肉", amount: "300g" })
      ).toBe("合挽き肉 300g");
    });

    it("分量が空の場合は材料名のみを返す", () => {
      expect(
        formatIngredientForList({ id: "2", name: "塩コショウ", amount: "" })
      ).toBe("塩コショウ");
    });

    it("材料名が空の場合は空文字列を返す", () => {
      expect(
        formatIngredientForList({ id: "3", name: "   ", amount: "大さじ1" })
      ).toBe("");
    });
  });

  describe("addIngredientToList", () => {
    it("単一の材料を Lists コレクションに addDoc で保存する", async () => {
      const mockDocId = "list-doc-123";
      (addDoc as any).mockResolvedValueOnce({ id: mockDocId });

      const id = await addIngredientToList("特製ハンバーグ", {
        id: "ing-1",
        name: "玉ねぎ",
        amount: "1個",
      });

      expect(id).toBe(mockDocId);
      expect(addDoc).toHaveBeenCalledTimes(1);
      expect(addDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          text: "玉ねぎ 1個",
          completed: false,
          category: "食材",
          note: "📎 レシピ: 特製ハンバーグ",
        })
      );
    });

    it("材料名が空の場合は addDoc を呼び出さず空文字を返す", async () => {
      const id = await addIngredientToList("特製ハンバーグ", {
        id: "ing-2",
        name: "",
        amount: "",
      });

      expect(id).toBe("");
      expect(addDoc).not.toHaveBeenCalled();
    });
  });

  describe("addIngredientsToList", () => {
    it("複数材料を writeBatch を使用して一括追加する", async () => {
      const mockSet = vi.fn();
      const mockCommit = vi.fn().mockResolvedValueOnce(undefined);
      (writeBatch as any).mockReturnValueOnce({
        set: mockSet,
        commit: mockCommit,
      });

      const ingredients = [
        { id: "1", name: "豚肉", amount: "200g" },
        { id: "2", name: "玉ねぎ", amount: "1個" },
        { id: "3", name: "", amount: "" }, // 空のためスキップ
      ];

      const count = await addIngredientsToList("生姜焼き", ingredients);

      expect(count).toBe(2);
      expect(mockSet).toHaveBeenCalledTimes(2);
      expect(mockCommit).toHaveBeenCalledTimes(1);
      expect(mockSet).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          text: "豚肉 200g",
          completed: false,
          category: "食材",
          note: "📎 レシピ: 生姜焼き",
        })
      );
    });

    it("有効な材料が 0件の場合はバッチ処理を実行せず 0 を返す", async () => {
      const count = await addIngredientsToList("生姜焼き", [
        { id: "1", name: "", amount: "" },
      ]);

      expect(count).toBe(0);
      expect(writeBatch).not.toHaveBeenCalled();
    });
  });
});
