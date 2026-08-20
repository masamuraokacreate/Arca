/**
 * src/lib/recipeStorage.ts
 * Arca — Recipes データ永続化 ＆ 同期 ＆ 画像最適化
 *
 * 設計原則:
 * - ローカル即時反映 ＋ Firestore（recipes コレクション）リアルタイム同期
 * - オフライン完全動作
 * - 画像はクライアント側で自動リサイズ・圧縮（最大1200px, JPEG品質0.82）
 */

import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import type { Recipe, IngredientItem, RecipeStep } from "../types/recipe";

const COLLECTION_NAME = "recipes";

/** 新規材料アイテムの空オブジェクトを生成 */
export function createEmptyIngredient(): IngredientItem {
  return {
    id: `ing-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: "",
    amount: "",
  };
}

/** 新規調理手順の空オブジェクトを生成 */
export function createEmptyStep(): RecipeStep {
  return {
    id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    text: "",
  };
}

/** 新規レシピの初期ひな形 */
export function createDefaultRecipe(): Omit<Recipe, "id"> {
  const now = Date.now();
  return {
    title: "",
    sourceUrl: "",
    imageUrl: "",
    servings: "1人前",
    ingredients: [createEmptyIngredient(), createEmptyIngredient()],
    steps: [createEmptyStep()],
    notes: "",
    tags: [],
    favorite: false,
    createdAt: now,
    updatedAt: now,
    isDeleted: false,
  };
}

/**
 * Firestore の recipes コレクションを購読する
 * @param onUpdate レシピ一覧更新コールバック
 * @param onError エラーコールバック
 * @returns Unsubscribe 関数
 */
export function subscribeRecipes(
  onUpdate: (recipes: Recipe[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const q = query(collection(db, COLLECTION_NAME), orderBy("updatedAt", "desc"));

  return onSnapshot(
    q,
    (snapshot) => {
      const recipes: Recipe[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        recipes.push({
          id: docSnap.id,
          title: data.title || "",
          sourceUrl: data.sourceUrl || undefined,
          imageUrl: data.imageUrl || undefined,
          servings: data.servings || undefined,
          ingredients: Array.isArray(data.ingredients) ? data.ingredients : [],
          steps: Array.isArray(data.steps) ? data.steps : [],
          notes: data.notes || undefined,
          tags: Array.isArray(data.tags) ? data.tags : [],
          favorite: !!data.favorite,
          createdAt: typeof data.createdAt === "number" ? data.createdAt : Date.now(),
          updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : Date.now(),
          isDeleted: !!data.isDeleted,
        });
      });
      onUpdate(recipes);
    },
    (err) => {
      console.error("[Recipes] Subscribe error:", err);
      onError?.(err);
    }
  );
}

/**
 * レシピを新規作成する
 */
export async function createRecipe(recipe: Omit<Recipe, "id">): Promise<string> {
  const now = Date.now();
  const cleanRecipe = {
    ...recipe,
    title: recipe.title.trim() || "無題のレシピ",
    createdAt: recipe.createdAt || now,
    updatedAt: now,
    isDeleted: false,
  };

  const docRef = await addDoc(collection(db, COLLECTION_NAME), cleanRecipe);
  return docRef.id;
}

/**
 * レシピを更新する
 */
export async function updateRecipe(
  id: string,
  patch: Partial<Omit<Recipe, "id" | "createdAt">>
): Promise<void> {
  const docRef = doc(db, COLLECTION_NAME, id);
  const now = Date.now();
  await updateDoc(docRef, {
    ...patch,
    updatedAt: now,
  });
}

/**
 * レシピをお気に入りトグルする
 */
export async function toggleFavoriteRecipe(id: string, currentFavorite: boolean): Promise<void> {
  await updateRecipe(id, { favorite: !currentFavorite });
}

/**
 * レシピを論理削除する
 */
export async function deleteRecipe(id: string): Promise<void> {
  const docRef = doc(db, COLLECTION_NAME, id);
  await updateDoc(docRef, {
    isDeleted: true,
    updatedAt: Date.now(),
  });
}

/**
 * レシピを復元する（Undo用）
 */
export async function restoreRecipe(id: string): Promise<void> {
  const docRef = doc(db, COLLECTION_NAME, id);
  await updateDoc(docRef, {
    isDeleted: false,
    updatedAt: Date.now(),
  });
}

/**
 * レシピを完全削除する（ごみ箱からの完全消去用）
 */
export async function permanentlyDeleteRecipe(id: string): Promise<void> {
  const docRef = doc(db, COLLECTION_NAME, id);
  await deleteDoc(docRef);
}

/**
 * 画像ファイルを読み込み、最大幅・高さ1200pxに自動リサイズ・JPEG圧縮してBase64文字列を返す
 * @param file アップロードされた画像ファイル
 * @param maxDimension 最大幅または高さ（px, デフォルト: 1200）
 * @param quality JPEG圧縮品質（0.0 〜 1.0, デフォルト: 0.82）
 */
export async function compressRecipeImage(
  file: File,
  maxDimension = 1200,
  quality = 0.82
): Promise<string> {
  return new Promise((resolve, reject) => {
    // 画像形式チェック
    if (!file.type.startsWith("image/")) {
      reject(new Error("選択されたファイルは画像ではありません"));
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // リサイズ計算（アスペクト比維持）
        if (width > height) {
          if (width > maxDimension) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          }
        } else {
          if (height > maxDimension) {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas contextを取得できませんでした"));
          return;
        }

        // 高画質描画
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, width, height);

        // JPEG Base64出力
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        resolve(dataUrl);
      };

      img.onerror = () => {
        reject(new Error("画像の読み込みに失敗しました"));
      };

      img.src = e.target?.result as string;
    };

    reader.onerror = () => {
      reject(new Error("ファイルの読み取りに失敗しました"));
    };

    reader.readAsDataURL(file);
  });
}
