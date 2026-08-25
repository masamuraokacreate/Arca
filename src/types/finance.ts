/**
 * src/types/finance.ts
 * Arca — Finance（家計・支出管理）モジュール型定義
 *
 * Sprint 10: 純粋な支出記録・レシート品目内訳（1対N）・クレジットカードCSV自動突合
 */

export type ExpenseCategory =
  | "食費"
  | "日用品"
  | "交通費"
  | "被服"
  | "交際費"
  | "娯楽費"
  | "特別費"
  | "通信費"
  | "光熱費"
  | "サブスク"
  | "車両係"
  | "その他";

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  "食費",
  "日用品",
  "交通費",
  "被服",
  "交際費",
  "娯楽費",
  "特別費",
  "通信費",
  "光熱費",
  "サブスク",
  "車両係",
  "その他",
];

export type PaymentMethod =
  | "Oliveカード"
  | "dカード"
  | "イオンカード"
  | "交通系IC"
  | "PayPay"
  | "現金"
  | "その他";

export const PAYMENT_METHODS: PaymentMethod[] = [
  "Oliveカード",
  "dカード",
  "イオンカード",
  "交通系IC",
  "PayPay",
  "現金",
  "その他",
];

export interface ExpenseItem {
  id: string;
  name: string;          // 品目名（例: 牛乳, 卵, 豚バラ肉）
  amount: number;        // 単価 / 小計
  category: ExpenseCategory;
  quantity?: number;
}

export interface ExpenseTransaction {
  id: string;
  date: string;          // YYYY-MM-DD (決済日 / 利用日)
  title: string;         // 店舗名・支払先（例: イオン〇〇店, セブンイレブン）
  totalAmount: number;   // 決済合計金額（品目合計と自動連動または手動入力）
  category: ExpenseCategory; // メインカテゴリ
  paymentMethod: PaymentMethod;
  items: ExpenseItem[];  // 内訳品目リスト（アコーディオン/展開ビューで表示）
  
  // クレジットカード突合ステータス
  isReconciled: boolean; // CSV明細と突合・紐付け確認済みフラグ
  matchedCsvRowId?: string; // 突合したCSV行の識別子
  
  receiptImageUrl?: string; // レシート画像（サムネイルDataURL）
  memo?: string;
  createdAt: string;     // ISO 8601 またはミリ秒
  updatedAt: string;     // ISO 8601 またはミリ秒
  isDeleted?: boolean;   // 論理削除フラグ（Undo用）
}

export interface CategoryStat {
  amount: number;
  percentage: number;
}

export interface MonthlyFinanceSummary {
  month: string;         // YYYY-MM
  totalExpense: number;  // 支出合計
  transactionCount: number; // 月の取引件数
  dailyAverage: number;  // 平均支出/日
  maxExpense: {
    amount: number;
    title: string;
    date: string;
  };
  categoryBreakdown: Record<ExpenseCategory, CategoryStat>;
  dailyExpenses: Record<number, number>; // 日付(1〜31) -> 当日支出合計
}

export interface CreditCardCsvRow {
  rowId: string;
  date: string;          // YYYY-MM-DD
  title: string;         // 利用店名・品名
  amount: number;        // 利用金額
  paymentMethod: PaymentMethod;
  matchedTransactionId?: string; // 紐付いたArca決済ID
}

/** 突合マッチングの信頼度スコア */
export type ReconcileConfidence = "exact" | "high" | "medium" | "low" | "none";

/** 突合候補情報 */
export interface ReconcileCandidate {
  csvRow: CreditCardCsvRow;
  matchedTransaction?: ExpenseTransaction;
  confidence: ReconcileConfidence;
  matchReason: string;
  daysDifference: number;
}

/** レシート OCR 解析結果 (Sprint 10.5) */
export interface ReceiptOcrResult {
  date?: string;         // YYYY-MM-DD (レシート発行日)
  storeName?: string;    // 店舗名
  totalAmount?: number;  // 支払総額（税込合計）
  paymentMethod?: PaymentMethod; // 推定支払方法
  items: Array<{
    name: string;
    amount: number;
    category?: ExpenseCategory;
    quantity?: number;
  }>;
  rawText?: string;
}

/** Finance モジュール画面の表示タブ */
export type FinanceViewTab = "transactions" | "analytics" | "reconcile";
