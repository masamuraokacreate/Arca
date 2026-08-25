/**
 * src/lib/financeStorage.ts
 * Arca — Finance（家計・支出管理）Firestore 永続化 ＆ 同期モジュール
 *
 * 設計原則:
 * - ローカル即時反映 ＋ Firestore（finance_transactions コレクション）リアルタイム同期
 * - オフライン完全対応
 * - 親決済と品目内訳（1対N）の安全なシリアライズと undefined 除去
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
import type {
  ExpenseCategory,
  ExpenseItem,
  ExpenseTransaction,
  PaymentMethod,
} from "../types/finance";

const COLLECTION_NAME = "finance_transactions";

/**
 * 品目リストの安全なシリアライズ（undefined を防ぐ）
 */
function sanitizeExpenseItems(items: ExpenseItem[] | undefined): ExpenseItem[] {
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    id: item.id || `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: item.name?.trim() || "",
    amount: Number(item.amount) || 0,
    category: item.category || "その他",
    quantity: item.quantity !== undefined ? Number(item.quantity) : 1,
  }));
}

/**
 * Firestore 保存用データ正規化（新規作成用）
 */
function sanitizeForFirestore(
  tx: Partial<Omit<ExpenseTransaction, "id">>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  out.date = tx.date?.trim() || new Date().toISOString().slice(0, 10);
  out.title = tx.title?.trim() || "支出";
  out.totalAmount = Number(tx.totalAmount) || 0;
  out.category = tx.category || "その他";
  out.paymentMethod = tx.paymentMethod || "その他";
  out.items = sanitizeExpenseItems(tx.items);
  out.isReconciled = Boolean(tx.isReconciled);
  out.matchedCsvRowId = typeof tx.matchedCsvRowId === "string" ? tx.matchedCsvRowId : "";
  out.receiptImageUrl = typeof tx.receiptImageUrl === "string" ? tx.receiptImageUrl : "";
  out.memo = typeof tx.memo === "string" ? tx.memo : "";
  out.createdAt = tx.createdAt || new Date().toISOString();
  out.updatedAt = tx.updatedAt || new Date().toISOString();
  out.isDeleted = Boolean(tx.isDeleted);

  return out;
}

/**
 * Firestore 部分更新用データ正規化
 */
function sanitizePatchForFirestore(
  patch: Partial<Omit<ExpenseTransaction, "id" | "createdAt">> & { updatedAt: string }
): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  if ("date" in patch) out.date = patch.date?.trim() || "";
  if ("title" in patch) out.title = patch.title?.trim() || "支出";
  if ("totalAmount" in patch) out.totalAmount = Number(patch.totalAmount) || 0;
  if ("category" in patch) out.category = patch.category || "その他";
  if ("paymentMethod" in patch) out.paymentMethod = patch.paymentMethod || "その他";
  if ("items" in patch) out.items = sanitizeExpenseItems(patch.items);
  if ("isReconciled" in patch) out.isReconciled = Boolean(patch.isReconciled);
  if ("matchedCsvRowId" in patch) out.matchedCsvRowId = typeof patch.matchedCsvRowId === "string" ? patch.matchedCsvRowId : "";
  if ("receiptImageUrl" in patch) out.receiptImageUrl = typeof patch.receiptImageUrl === "string" ? patch.receiptImageUrl : "";
  if ("memo" in patch) out.memo = typeof patch.memo === "string" ? patch.memo : "";
  if ("updatedAt" in patch) out.updatedAt = patch.updatedAt;
  if ("isDeleted" in patch) out.isDeleted = Boolean(patch.isDeleted);

  return out;
}

/** 新規品目の空オブジェクトを生成 */
export function createEmptyExpenseItem(category: ExpenseCategory = "食費"): ExpenseItem {
  return {
    id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: "",
    amount: 0,
    category,
    quantity: 1,
  };
}

/** 新規支出取引の初期ひな形 */
export function createDefaultTransaction(dateStr?: string): Omit<ExpenseTransaction, "id"> {
  const nowStr = new Date().toISOString();
  const today = dateStr || nowStr.slice(0, 10);
  return {
    date: today,
    title: "",
    totalAmount: 0,
    category: "食費",
    paymentMethod: "Oliveカード",
    items: [],
    isReconciled: false,
    matchedCsvRowId: "",
    memo: "",
    createdAt: nowStr,
    updatedAt: nowStr,
    isDeleted: false,
  };
}

/**
 * Firestore の finance_transactions コレクションを購読する
 */
export function subscribeExpenseTransactions(
  onUpdate: (transactions: ExpenseTransaction[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const q = query(collection(db, COLLECTION_NAME), orderBy("date", "desc"));

  return onSnapshot(
    q,
    (snapshot) => {
      const transactions: ExpenseTransaction[] = [];
      const docsList = snapshot?.docs || [];

      if (docsList.length > 0 || (snapshot && Array.isArray(snapshot.docs))) {
        docsList.forEach((docSnap: any) => {
          const data = typeof docSnap.data === "function" ? docSnap.data() : (docSnap.data || {});
          transactions.push({
            id: docSnap.id,
            date: data.date || "",
            title: data.title || "",
            totalAmount: Number(data.totalAmount) || 0,
            category: (data.category as ExpenseCategory) || "その他",
            paymentMethod: (data.paymentMethod as PaymentMethod) || "その他",
            items: Array.isArray(data.items) ? data.items : [],
            isReconciled: Boolean(data.isReconciled),
            matchedCsvRowId: data.matchedCsvRowId || undefined,
            receiptImageUrl: data.receiptImageUrl || undefined,
            memo: data.memo || undefined,
            createdAt: typeof data.createdAt === "string" ? data.createdAt : new Date().toISOString(),
            updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : new Date().toISOString(),
            isDeleted: Boolean(data.isDeleted),
          });
        });
      } else if (typeof snapshot?.forEach === "function") {
        snapshot.forEach((docSnap: any) => {
          const data = typeof docSnap.data === "function" ? docSnap.data() : (docSnap.data || {});
          transactions.push({
            id: docSnap.id,
            date: data.date || "",
            title: data.title || "",
            totalAmount: Number(data.totalAmount) || 0,
            category: (data.category as ExpenseCategory) || "その他",
            paymentMethod: (data.paymentMethod as PaymentMethod) || "その他",
            items: Array.isArray(data.items) ? data.items : [],
            isReconciled: Boolean(data.isReconciled),
            matchedCsvRowId: data.matchedCsvRowId || undefined,
            receiptImageUrl: data.receiptImageUrl || undefined,
            memo: data.memo || undefined,
            createdAt: typeof data.createdAt === "string" ? data.createdAt : new Date().toISOString(),
            updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : new Date().toISOString(),
            isDeleted: Boolean(data.isDeleted),
          });
        });
      }
      onUpdate(transactions);
    },
    (err) => {
      console.error("[Finance] Subscribe error:", err);
      onError?.(err);
    }
  );
}

/**
 * 支出取引を新規作成する
 */
export async function createExpenseTransaction(
  tx: Omit<ExpenseTransaction, "id">
): Promise<string> {
  const now = new Date().toISOString();
  const sanitized = sanitizeForFirestore({
    ...tx,
    title: tx.title?.trim() || "支出",
    createdAt: tx.createdAt || now,
    updatedAt: now,
    isDeleted: false,
  });

  const docRef = await addDoc(collection(db, COLLECTION_NAME), sanitized);
  return docRef.id;
}

/**
 * 支出取引を更新する
 */
export async function updateExpenseTransaction(
  id: string,
  patch: Partial<Omit<ExpenseTransaction, "id" | "createdAt">>
): Promise<void> {
  const docRef = doc(db, COLLECTION_NAME, id);
  const now = new Date().toISOString();
  const sanitized = sanitizePatchForFirestore({
    ...patch,
    updatedAt: now,
  });
  await updateDoc(docRef, sanitized);
}

/**
 * 支出取引の突合ステータスを更新する
 */
export async function setTransactionReconciled(
  id: string,
  isReconciled: boolean,
  matchedCsvRowId?: string
): Promise<void> {
  await updateExpenseTransaction(id, {
    isReconciled,
    matchedCsvRowId: isReconciled ? (matchedCsvRowId || "") : "",
  });
}

/**
 * 支出取引を論理削除する
 */
export async function deleteExpenseTransaction(id: string): Promise<void> {
  const docRef = doc(db, COLLECTION_NAME, id);
  await updateDoc(docRef, {
    isDeleted: true,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * 支出取引を復元する（Undo用）
 */
export async function restoreExpenseTransaction(id: string): Promise<void> {
  const docRef = doc(db, COLLECTION_NAME, id);
  await updateDoc(docRef, {
    isDeleted: false,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * 支出取引を完全削除する
 */
export async function permanentlyDeleteExpenseTransaction(id: string): Promise<void> {
  const docRef = doc(db, COLLECTION_NAME, id);
  await deleteDoc(docRef);
}
