/**
 * src/services/merchantCategoryService.ts
 * Arca — 店舗名・取引名に基づく支出カテゴリ自動学習 ＆ 推論エンジン
 *
 * 特徴:
 * - ユーザーが手動でカテゴリを変更・登録した履歴を学習し、次回以降同じ店舗名・取引名に自動適用
 * - 「その他」が安易に割り当てられるのを防止
 * - 内部データベース（Firestore: merchant_categories ＆ localStorage）で自動完結
 * - ユーザーへのトースト・通知などのフィードバックは一切行わず、完全サイレントに動作
 */

import { doc, setDoc, getDocs, collection } from "firebase/firestore";
import { db } from "../lib/firebase";
import type { ExpenseCategory, ExpenseTransaction } from "../types/finance";
import { EXPENSE_CATEGORIES } from "../types/finance";
import { migrateLegacyCategory } from "../lib/financeStorage";

const STORAGE_KEY = "arca_merchant_category_map_v1";
const FIRESTORE_COLLECTION = "merchant_categories";

// インメモリキャッシュ
const memoryMap: Map<string, ExpenseCategory> = new Map();
let isInitialized = false;

/**
 * 店舗名・取引名の正規化
 * - 全角英数記号の半角化
 * - 小文字化
 * - 連続空白・前後の空白トリム
 */
export function normalizeMerchantKey(raw: string): string {
  if (!raw || typeof raw !== "string") return "";

  let s = raw.trim().toLowerCase();

  // 全角英数を半角に変換
  s = s.replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
  // 全角スペースを半角スペースに
  s = s.replace(/　/g, " ");
  // 連続する空白を1つに
  s = s.replace(/\s+/g, " ");

  return s;
}

/**
 * ローカルストレージからのロード
 */
function loadFromLocalStorage(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, string>;
      for (const [k, v] of Object.entries(parsed)) {
        if (EXPENSE_CATEGORIES.includes(v as ExpenseCategory)) {
          memoryMap.set(k, v as ExpenseCategory);
        }
      }
    }
  } catch {
    // localStorage 読み込み失敗時は無視
  }
}

/**
 * ローカルストレージへの保存
 */
function saveToLocalStorage(): void {
  try {
    const obj: Record<string, string> = {};
    for (const [k, v] of memoryMap.entries()) {
      obj[k] = v;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {
    // localStorage 保存失敗時は無視
  }
}

/**
 * Firestore から全マッピングを取得してキャッシュに同期（サイレント）
 */
export async function syncMerchantCategoriesFromFirestore(): Promise<void> {
  try {
    const snap = await getDocs(collection(db, FIRESTORE_COLLECTION));
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      if (data && typeof data.category === "string" && typeof data.merchantKey === "string") {
        const cat = migrateLegacyCategory(data.category);
        if (cat !== "その他") {
          memoryMap.set(data.merchantKey, cat);
        }
      }
    });
    saveToLocalStorage();
  } catch (err) {
    // サイレントに握りつぶす（フィードバック不要）
  }
}

/**
 * 過去の取引一覧から辞書を自動学習・初期化
 * ユーザーが過去に登録した「その他」以外のカテゴリを学習マップに蓄積する
 */
export function initMerchantCategoriesFromTransactions(transactions: ExpenseTransaction[]): void {
  loadFromLocalStorage();

  // 日付の新しい順に走査し、最新の手動変更カテゴリを優先学習
  const sorted = [...transactions].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  for (const tx of sorted) {
    if (!tx.title || tx.isDeleted) continue;
    const key = normalizeMerchantKey(tx.title);
    if (!key) continue;

    const cat = migrateLegacyCategory(tx.category);
    // 「その他」は学習しない
    if (cat === "その他") continue;

    // まだ未登録なら過去取引から学習
    if (!memoryMap.has(key)) {
      memoryMap.set(key, cat);
    }
  }

  saveToLocalStorage();
  isInitialized = true;
}

/**
 * 店舗名 ⇄ カテゴリの学習
 * ユーザーが手動でカテゴリを選択・変更した際に呼び出される
 */
export async function learnMerchantCategory(
  merchantTitle: string,
  category: ExpenseCategory
): Promise<void> {
  const key = normalizeMerchantKey(merchantTitle);
  if (!key) return;

  const validCategory = migrateLegacyCategory(category);
  // 「その他」への変更は辞書登録しない（以前学習した適切なカテゴリを保持するため）
  if (validCategory === "その他") return;

  // キャッシュ＆ローカルストレージ更新
  memoryMap.set(key, validCategory);
  saveToLocalStorage();

  // Firestore に非同期サイレント保存（ユーザーフィードバック不要）
  try {
    const safeDocId = encodeURIComponent(key).slice(0, 120);
    const docRef = doc(db, FIRESTORE_COLLECTION, safeDocId);
    await setDoc(
      docRef,
      {
        merchantKey: key,
        merchantTitle: merchantTitle.trim(),
        category: validCategory,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch {
    // オフラインまたは失敗時は無視（内部で完結）
  }
}

/**
 * ルールベースのフォールバック推論（店名に含まれるキーワードから推測）
 */
function inferCategoryByKeywords(title: string): ExpenseCategory | null {
  const t = title.toLowerCase();

  // 食料品 / スーパー
  if (
    t.includes("スーパー") ||
    t.includes("マート") ||
    t.includes("イオン") ||
    t.includes("生協") ||
    t.includes("coop") ||
    t.includes("セブン") ||
    t.includes("ローソン") ||
    t.includes("ファミマ") ||
    t.includes("ファミリーマート") ||
    t.includes("まいばすけっと") ||
    t.includes("業務スーパー") ||
    t.includes("成城石井") ||
    t.includes("ライフ") ||
    t.includes("西友") ||
    t.includes("イトーヨーカ堂") ||
    t.includes("肉のハナマサ")
  ) {
    return "食料品";
  }

  // 外食 / カフェ
  if (
    t.includes("カフェ") ||
    t.includes("cafe") ||
    t.includes("coffee") ||
    t.includes("珈琲") ||
    t.includes("スターバックス") ||
    t.includes("ドトール") ||
    t.includes("タリーズ") ||
    t.includes("マクドナルド") ||
    t.includes("モスバーガー") ||
    t.includes("すき家") ||
    t.includes("吉野家") ||
    t.includes("松屋") ||
    t.includes("サイゼリヤ") ||
    t.includes("ガスト") ||
    t.includes("バーミヤン") ||
    t.includes("ラーメン") ||
    t.includes("食堂") ||
    t.includes("レストラン") ||
    t.includes("酒場") ||
    t.includes("居酒屋") ||
    t.includes("焼肉") ||
    t.includes("寿司") ||
    t.includes("くら寿司") ||
    t.includes("スシロー")
  ) {
    return "外食";
  }

  // 日用品・消耗品 / ドラッグストア
  if (
    t.includes("薬") ||
    t.includes("ドラッグ") ||
    t.includes("マツモトキヨシ") ||
    t.includes("ウエルシア") ||
    t.includes("ツルハ") ||
    t.includes("サンドラッグ") ||
    t.includes("スギ薬局") ||
    t.includes("ココカラファイン") ||
    t.includes("ダイソー") ||
    t.includes("セリア") ||
    t.includes("キャンドゥ") ||
    t.includes("無印良品") ||
    t.includes("ニトリ") ||
    t.includes("カインズ") ||
    t.includes("コーナン")
  ) {
    return "日用品・消耗品";
  }

  // 交通・移動
  if (
    t.includes("suica") ||
    t.includes("pasmo") ||
    t.includes("icoca") ||
    t.includes("地下鉄") ||
    t.includes("メトロ") ||
    t.includes("jr") ||
    t.includes("鉄道") ||
    t.includes("バス") ||
    t.includes("タクシー") ||
    t.includes("taxi") ||
    t.includes("タイムズ") ||
    t.includes("駐車場") ||
    t.includes("高速道路") ||
    t.includes("etc") ||
    t.includes("ガソリン") ||
    t.includes("エネオス") ||
    t.includes("eneos") ||
    t.includes("出光") ||
    t.includes("シェル")
  ) {
    return "交通・移動";
  }

  // サブスク・固定費
  if (
    t.includes("netflix") ||
    t.includes("spotify") ||
    t.includes("apple.com") ||
    t.includes("google") ||
    t.includes("youtube") ||
    t.includes("amazon prime") ||
    t.includes("amazon web services") ||
    t.includes("aws") ||
    t.includes("ntt") ||
    t.includes("kddi") ||
    t.includes("ソフトバンク") ||
    t.includes("docomo") ||
    t.includes("ドコモ")
  ) {
    return "サブスク・固定費";
  }

  // 光熱費・住居
  if (
    t.includes("電力") ||
    t.includes("ガス") ||
    t.includes("水道") ||
    t.includes("東京ガス") ||
    t.includes("東京電力") ||
    t.includes("関西電力") ||
    t.includes("家賃")
  ) {
    return "光熱費・住居";
  }

  // ゲーム / 娯楽
  if (
    t.includes("steam") ||
    t.includes("playstation") ||
    t.includes("nintendo") ||
    t.includes("任天堂") ||
    t.includes("ソニー")
  ) {
    return "ゲーム";
  }

  return null;
}

/**
 * 店舗名・取引名から最適なカテゴリを推論・自動補完する
 * 1. 過去の手動変更・学習辞書（完全一致）
 * 2. 過去の手動変更・学習辞書（部分一致・類似一致）
 * 3. キーワードベースの推論
 * 4. 指定のデフォルト（デフォルト: "食料品"）
 */
export function predictCategory(
  merchantTitle: string,
  fallback: ExpenseCategory = "食料品"
): ExpenseCategory {
  if (!isInitialized && memoryMap.size === 0) {
    loadFromLocalStorage();
  }

  const key = normalizeMerchantKey(merchantTitle);
  if (!key) return fallback;

  // 1. 完全一致
  if (memoryMap.has(key)) {
    return memoryMap.get(key)!;
  }

  // 2. 部分一致（辞書内のキーが店名に含まれる、または店名が辞書内のキーに含まれる）
  for (const [storedKey, category] of memoryMap.entries()) {
    if (storedKey.length >= 3 && (key.includes(storedKey) || storedKey.includes(key))) {
      return category;
    }
  }

  // 3. キーワード推論
  const keywordInferred = inferCategoryByKeywords(merchantTitle);
  if (keywordInferred) {
    return keywordInferred;
  }

  return fallback;
}
