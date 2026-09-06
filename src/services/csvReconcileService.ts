/**
 * src/services/csvReconcileService.ts
 * Arca — Finance 月次×カード別 CSV照合ステータス永続化 & 同期サービス
 */

import {
  collection,
  doc,
  setDoc,
  onSnapshot,
  query,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import type { MonthlyCardReconcileStatus, PaymentMethod, ReconcilePreviewResult } from "../types/finance";
import {
  createExpenseTransaction,
  updateExpenseTransaction,
} from "../lib/financeStorage";
import { inferCategoryFromTitle } from "./gmailFinanceService";

const COLLECTION_NAME = "finance_monthly_reconcile_status";

/**
 * 月度（YYYY-MM）と支払方法から一意なステータスIDを生成する
 */
export function getMonthlyReconcileStatusId(
  month: string,
  paymentMethod: PaymentMethod
): string {
  return `${month}_${paymentMethod}`;
}

/**
 * 月次×カード別照合ステータスコレクションのリアルタイム購読
 */
export function subscribeMonthlyReconcileStatuses(
  onUpdate: (statuses: MonthlyCardReconcileStatus[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const q = query(collection(db, COLLECTION_NAME));

  return onSnapshot(
    q,
    (snapshot) => {
      const statuses: MonthlyCardReconcileStatus[] = [];
      const docsList = snapshot?.docs || [];

      if (docsList.length > 0 || (snapshot && Array.isArray(snapshot.docs))) {
        docsList.forEach((docSnap: any) => {
          const data = typeof docSnap.data === "function" ? docSnap.data() : (docSnap.data || {});
          statuses.push({
            id: docSnap.id,
            month: data.month || "",
            paymentMethod: data.paymentMethod || "その他",
            isReconciled: Boolean(data.isReconciled),
            reconciledAt: data.reconciledAt || undefined,
            matchedCount: typeof data.matchedCount === "number" ? data.matchedCount : undefined,
          });
        });
      } else if (typeof snapshot?.forEach === "function") {
        snapshot.forEach((docSnap: any) => {
          const data = typeof docSnap.data === "function" ? docSnap.data() : (docSnap.data || {});
          statuses.push({
            id: docSnap.id,
            month: data.month || "",
            paymentMethod: data.paymentMethod || "その他",
            isReconciled: Boolean(data.isReconciled),
            reconciledAt: data.reconciledAt || undefined,
            matchedCount: typeof data.matchedCount === "number" ? data.matchedCount : undefined,
          });
        });
      }
      onUpdate(statuses);
    },
    (err) => {
      console.error("[csvReconcileService] Subscribe error:", err);
      onError?.(err);
    }
  );
}

/**
 * 月次×カード別の照合ステータスを保存・更新する
 */
export async function setMonthlyCardReconcileStatus(
  status: Omit<MonthlyCardReconcileStatus, "id"> & { id?: string }
): Promise<void> {
  const id = status.id || getMonthlyReconcileStatusId(status.month, status.paymentMethod);
  const docRef = doc(db, COLLECTION_NAME, id);

  const payload: Record<string, unknown> = {
    month: status.month,
    paymentMethod: status.paymentMethod,
    isReconciled: Boolean(status.isReconciled),
    reconciledAt: status.reconciledAt || new Date().toISOString(),
  };

  if (status.matchedCount !== undefined) {
    payload.matchedCount = Number(status.matchedCount);
  }

  await setDoc(docRef, payload, { merge: true });
}

/**
 * 照合完了時のステータス自動反映
 */
export async function markMonthCardReconciled(
  month: string,
  paymentMethod: PaymentMethod,
  matchedCount?: number
): Promise<void> {
  await setMonthlyCardReconcileStatus({
    month,
    paymentMethod,
    isReconciled: true,
    reconciledAt: new Date().toISOString(),
    matchedCount,
  });
}

/**
 * 照合ステータスの手動トグル（切り替え）
 */
export async function toggleMonthlyCardReconcile(
  month: string,
  paymentMethod: PaymentMethod,
  currentIsReconciled = false
): Promise<void> {
  const nextIsReconciled = !currentIsReconciled;
  await setMonthlyCardReconcileStatus({
    month,
    paymentMethod,
    isReconciled: nextIsReconciled,
    reconciledAt: nextIsReconciled ? new Date().toISOString() : undefined,
  });
}

/**
 * 照合プレビュー結果を一括コミット（ペアリング更新 & 新規作成 & 月度照合ステータス更新）
 */
export async function commitBatchReconcile(
  previewResult: ReconcilePreviewResult
): Promise<{
  matchedCount: number;
  createdCount: number;
  skippedCount: number;
  totalCommitted: number;
}> {
  let matchedCount = 0;
  let createdCount = 0;

  for (const item of previewResult.items) {
    if (item.action === "match" && item.matchedTransaction) {
      // 既存取引に突合情報とフィンガープリントをバインド
      await updateExpenseTransaction(item.matchedTransaction.id, {
        isReconciled: true,
        matchedCsvRowId: item.csvRow.fingerprint || item.csvRow.rowId,
        csvRowFingerprint: item.csvRow.fingerprint || item.csvRow.rowId,
      });
      matchedCount++;
    } else if (item.action === "create") {
      // 新規レコードを作成（確定済みとして登録）
      const category = inferCategoryFromTitle(item.csvRow.title);
      const now = new Date().toISOString();
      await createExpenseTransaction({
        date: item.csvRow.date,
        title: item.csvRow.title,
        totalAmount: item.csvRow.amount,
        category,
        paymentMethod: item.csvRow.paymentMethod || previewResult.paymentMethod,
        items: [],
        isReconciled: true,
        matchedCsvRowId: item.csvRow.fingerprint || item.csvRow.rowId,
        csvRowFingerprint: item.csvRow.fingerprint || item.csvRow.rowId,
        source: "csv",
        memo: "クレジットカード明細CSVより一括取り込み",
        createdAt: now,
        updatedAt: now,
      });
      createdCount++;
    }
  }

  // 影響を受ける各月度×支払方法の照合ステータスを「✓ 照合済み」に更新
  for (const month of previewResult.affectedMonths) {
    await markMonthCardReconciled(month, previewResult.paymentMethod);
  }

  return {
    matchedCount,
    createdCount,
    skippedCount: previewResult.skippedCount,
    totalCommitted: matchedCount + createdCount,
  };
}

