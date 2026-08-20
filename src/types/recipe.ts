/**
 * src/types/recipe.ts
 * Arca — Recipes（料理レシピ）モジュール 型定義
 *
 * 設計原則:
 * - 料理名・参考URL・完成写真・分量・材料・手順・知見（Chef's Review）の完全構造化
 * - ローカルファースト & クラウド同期に最適化されたミリ秒タイムスタンプ
 */

/** レシピの材料1件 */
export interface IngredientItem {
  id: string;
  name: string;
  amount: string;
}

/** レシピの調理手順1件 */
export interface RecipeStep {
  id: string;
  text: string;
  imageUrl?: string;
}

/** レシピ本体 */
export interface Recipe {
  /** UUID / Firestore ドキュメントID */
  id: string;
  /** 料理名 */
  title: string;
  /** 参考レシピ/YouTube/ブログ等のURL */
  sourceUrl?: string;
  /** 完成写真・サムネイル (Base64またはURL) */
  imageUrl?: string;
  /** 分量 (例: 「2人前」, 「4個分」) */
  servings?: string;
  /** 材料・調味料リスト */
  ingredients: IngredientItem[];
  /** 手順リスト */
  steps: RecipeStep[];
  /** 次回の改善点・知見・Chef's Review */
  notes?: string;
  /** カテゴリ/タグ（例: "和食", "中華", "定番", "時短", "おもてなし"） */
  tags: string[];
  /** お気に入りフラグ */
  favorite: boolean;
  /** 作成日時 (ミリ秒タイムスタンプ) */
  createdAt: number;
  /** 最終更新日時 (ミリ秒タイムスタンプ) */
  updatedAt: number;
  /** 論理削除フラグ（ごみ箱・Undo用） */
  isDeleted?: boolean;
}

/** レシピの並び順オプション */
export type RecipeSortOption = "updatedDesc" | "createdDesc" | "titleAsc" | "favoriteFirst";

/** レシピの表示ビューモード */
export type RecipeViewMode = "list" | "detail" | "edit";
