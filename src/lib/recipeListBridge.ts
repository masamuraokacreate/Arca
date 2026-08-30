/**
 * src/lib/recipeListBridge.ts
 * Arca — Recipes ➔ Lists クロスモジュール連携（Aether Link）
 *
 * レシピの材料データを Lists（買い物リスト）モジュールへシームレスに送信・永続化するブリッジ
 */

import {
  collection,
  addDoc,
  serverTimestamp,
  writeBatch,
  doc,
} from "firebase/firestore";
import { db } from "./firebase";
import type { IngredientItem } from "../types/recipe";

const TASKS_COLLECTION = "tasks";

/**
 * 材料アイテムから買い物リスト用のテキストを生成する
 * 例: { name: "合挽き肉", amount: "300g" } ➔ "合挽き肉 300g"
 */
export function formatIngredientForList(ingredient: IngredientItem): string {
  const name = ingredient.name.trim();
  const amount = ingredient.amount?.trim();
  if (!name) return "";
  return amount ? `${name} ${amount}` : name;
}

/**
 * 単一の材料を買い物リスト（tasksコレクション / listId: "shopping"）に追加する
 * @param recipeTitle レシピのタイトル（任意）
 * @param ingredient 追加する材料アイテム
 * @returns 作成された Firestore ドキュメント ID（空文字の場合はスキップ）
 */
export async function addIngredientToList(
  recipeTitle: string,
  ingredient: IngredientItem
): Promise<string> {
  const text = formatIngredientForList(ingredient);
  if (!text) return "";

  const titleSuffix = recipeTitle && recipeTitle.trim() ? ` (📎 ${recipeTitle.trim()})` : "";
  const finalTitle = `${text}${titleSuffix}`;

  const docData: Record<string, unknown> = {
    title: finalTitle,
    completed: false,
    listId: "shopping",
    googleTaskId: null,
    subtasks: [],
    createdAt: serverTimestamp(),
  };

  const docRef = await addDoc(collection(db, TASKS_COLLECTION), docData);
  return docRef?.id || "mock-id";
}

/**
 * 複数の材料を買い物リスト（tasksコレクション / listId: "shopping"）に一括追加する
 * @param recipeTitle レシピのタイトル
 * @param ingredients 追加する材料アイテムの配列
 * @returns 追加されたアイテム数
 */
export async function addIngredientsToList(
  recipeTitle: string,
  ingredients: IngredientItem[]
): Promise<number> {
  const validItems = ingredients.filter(
    (ing) => !!formatIngredientForList(ing)
  );

  if (validItems.length === 0) return 0;

  // バッチ書き込みでアトミックに追加
  const batch = writeBatch(db);
  const title = recipeTitle?.trim() || "";
  const titleSuffix = title ? ` (📎 ${title})` : "";

  for (const item of validItems) {
    const text = formatIngredientForList(item);
    const newDocRef = doc(collection(db, TASKS_COLLECTION));
    const docData: Record<string, unknown> = {
      title: `${text}${titleSuffix}`,
      completed: false,
      listId: "shopping",
      googleTaskId: null,
      subtasks: [],
      createdAt: serverTimestamp(),
    };
    batch.set(newDocRef, docData);
  }

  await batch.commit();
  return validItems.length;
}
