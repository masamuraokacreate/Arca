/**
 * src/test/recipeStorage.test.ts
 * Recipes ストレージ＆画像ユーティリティの単体テスト
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createEmptyIngredient,
  createEmptyStep,
  createDefaultRecipe,
  createRecipe,
  updateRecipe,
  toggleFavoriteRecipe,
  deleteRecipe,
  restoreRecipe,
  permanentlyDeleteRecipe,
  compressRecipeImage,
} from "../lib/recipeStorage";
import { addDoc, updateDoc, deleteDoc } from "firebase/firestore";

describe("recipeStorage ユーティリティ", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createEmptyIngredient が一意なidと空フィールドを持つオブジェクトを返す", () => {
    const ing1 = createEmptyIngredient();
    const ing2 = createEmptyIngredient();
    expect(ing1.id).toBeDefined();
    expect(ing1.name).toBe("");
    expect(ing1.amount).toBe("");
    expect(ing1.id).not.toBe(ing2.id);
  });

  it("createEmptyStep が一意なidと空テキストを持つオブジェクトを返す", () => {
    const step1 = createEmptyStep();
    const step2 = createEmptyStep();
    expect(step1.id).toBeDefined();
    expect(step1.text).toBe("");
    expect(step1.id).not.toBe(step2.id);
  });

  it("createDefaultRecipe が有効な初期ひな形を生成する", () => {
    const template = createDefaultRecipe();
    expect(template.title).toBe("");
    expect(template.servings).toBe("1人前");
    expect(template.ingredients).toHaveLength(2);
    expect(template.steps).toHaveLength(1);
    expect(template.favorite).toBe(false);
    expect(template.isDeleted).toBe(false);
  });

  it("createRecipe が Firestore に addDoc を呼び出し id を返す", async () => {
    const mockId = "new-recipe-123";
    (addDoc as any).mockResolvedValueOnce({ id: mockId });

    const recipeData = createDefaultRecipe();
    recipeData.title = "極上ハンバーグ";

    const id = await createRecipe(recipeData);
    expect(id).toBe(mockId);
    expect(addDoc).toHaveBeenCalledTimes(1);
  });

  it("updateRecipe が updateDoc を呼び出す", async () => {
    await updateRecipe("rec-1", { title: "更新されたタイトル" });
    expect(updateDoc).toHaveBeenCalledTimes(1);
  });

  it("toggleFavoriteRecipe が反転したfavorite値で更新する", async () => {
    await toggleFavoriteRecipe("rec-1", false);
    expect(updateDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ favorite: true })
    );

    await toggleFavoriteRecipe("rec-1", true);
    expect(updateDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ favorite: false })
    );
  });

  it("deleteRecipe が isDeleted=true で論理削除する", async () => {
    await deleteRecipe("rec-1");
    expect(updateDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ isDeleted: true })
    );
  });

  it("restoreRecipe が isDeleted=false で復元する", async () => {
    await restoreRecipe("rec-1");
    expect(updateDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ isDeleted: false })
    );
  });

  it("permanentlyDeleteRecipe が deleteDoc を呼び出す", async () => {
    await permanentlyDeleteRecipe("rec-1");
    expect(deleteDoc).toHaveBeenCalledTimes(1);
  });

  it("compressRecipeImage が画像以外のファイルの場合エラーを投げる", async () => {
    const textFile = new File(["dummy text"], "dummy.txt", { type: "text/plain" });
    await expect(compressRecipeImage(textFile)).rejects.toThrow("画像ではありません");
  });
});
