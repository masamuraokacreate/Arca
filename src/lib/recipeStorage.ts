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

/**
 * Firestore に保存する前に、undefined 値を安全なデフォルト値へ正規化する。
 * Firestore は undefined プロパティを受け付けず `Unsupported field value: undefined`
 * エラーを投げるため、すべての書き込みパスでこの関数を通す。
 *
 * 【完全書き込み用】createRecipe で使用。
 * すべてのフィールドを確実に Firestore 安全な値へ正規化する。
 * undefined / null は空文字列 / 空配列 / false へ変換する。
 */
function sanitizeForFirestore(
  recipe: Partial<Omit<Recipe, "id">>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  // 必須項目: キーが存在する場合のみ出力（patch 更新時に使い回しても安全）
  if ("title" in recipe) out.title = recipe.title?.trim() || "無題のレシピ";
  if ("servings" in recipe) out.servings = recipe.servings?.trim() || "1人前";
  if ("favorite" in recipe) out.favorite = Boolean(recipe.favorite);
  if ("createdAt" in recipe) out.createdAt = recipe.createdAt;
  if ("updatedAt" in recipe) out.updatedAt = recipe.updatedAt;
  if ("isDeleted" in recipe) out.isDeleted = Boolean(recipe.isDeleted);

  // オプショナル文字列項目: undefined → 空文字列（完全書き込みでは常に出力）
  out.sourceUrl = typeof recipe.sourceUrl === "string" ? recipe.sourceUrl : "";
  out.imageUrl = typeof recipe.imageUrl === "string" ? recipe.imageUrl : "";
  out.notes = typeof recipe.notes === "string" ? recipe.notes : "";

  // 配列項目: undefined / 非配列 → 空配列（完全書き込みでは常に出力）
  out.ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  out.steps = Array.isArray(recipe.steps) ? recipe.steps : [];
  out.tags = Array.isArray(recipe.tags) ? recipe.tags : [];

  return out;
}

/**
 * 【部分更新用】updateRecipe で使用。
 * patch に含まれるキーのみを対象に undefined → デフォルト値へ正規化する。
 * 渡されていないキーは出力しないため、他フィールドを誤って上書きしない。
 */
function sanitizePatchForFirestore(
  patch: Partial<Omit<Recipe, "id" | "createdAt">> & { updatedAt: number }
): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  // 必須項目（patch に含まれる場合のみ）
  if ("title" in patch) out.title = patch.title?.trim() || "無題のレシピ";
  if ("servings" in patch) out.servings = patch.servings?.trim() || "1人前";
  if ("favorite" in patch) out.favorite = Boolean(patch.favorite);
  if ("updatedAt" in patch) out.updatedAt = patch.updatedAt;
  if ("isDeleted" in patch) out.isDeleted = Boolean(patch.isDeleted);

  // オプショナル文字列項目（patch に含まれる場合のみ、undefined → 空文字列）
  if ("sourceUrl" in patch) out.sourceUrl = typeof patch.sourceUrl === "string" ? patch.sourceUrl : "";
  if ("imageUrl" in patch) out.imageUrl = typeof patch.imageUrl === "string" ? patch.imageUrl : "";
  if ("notes" in patch) out.notes = typeof patch.notes === "string" ? patch.notes : "";

  // 配列項目（patch に含まれる場合のみ、undefined → 空配列）
  if ("ingredients" in patch) out.ingredients = Array.isArray(patch.ingredients) ? patch.ingredients : [];
  if ("steps" in patch) out.steps = Array.isArray(patch.steps) ? patch.steps : [];
  if ("tags" in patch) out.tags = Array.isArray(patch.tags) ? patch.tags : [];

  return out;
}


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
  const sanitized = sanitizeForFirestore({
    ...recipe,
    title: recipe.title?.trim() || "無題のレシピ",
    createdAt: recipe.createdAt || now,
    updatedAt: now,
    isDeleted: false,
  });

  const docRef = await addDoc(collection(db, COLLECTION_NAME), sanitized);
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
  const sanitized = sanitizePatchForFirestore({
    ...patch,
    updatedAt: now,
  });
  await updateDoc(docRef, sanitized);
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
