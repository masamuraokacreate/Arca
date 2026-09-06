/**
 * src/types/finance.ts
 * Arca — Finance（家計・支出管理）モジュール型定義
 *
 * Sprint 10: 純粋な支出記録・レシート品目内訳（1対N）・クレジットカードCSV自動突合
 */

export type ExpenseCategory =
  | "食料品"
  | "外食"
  | "日用品・消耗品"
  | "衣服"
  | "ゲーム"
  | "推し活・配信"
  | "イベント・旅行"
  | "交通・移動"
  | "サブスク・固定費"
  | "光熱費・住居"
  | "大型出費"
  | "その他";

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  "食料品",
  "外食",
  "日用品・消耗品",
  "衣服",
  "ゲーム",
  "推し活・配信",
  "イベント・旅行",
  "交通・移動",
  "サブスク・固定費",
  "光熱費・住居",
  "大型出費",
  "その他",
];

/** 分類ガイド用のメタデータ定義 (Sprint 10.13) */
export interface CategoryGuideItem {
  category: ExpenseCategory;
  description: string;
  examples: string[];
  color: string;
}

export const CATEGORY_GUIDE_DATA: CategoryGuideItem[] = [
  {
    category: "食料品",
    description: "自炊用の食材や日々の飲食料品",
    examples: ["スーパーの食材", "牛乳・卵・調味料", "パン・お米", "コンビニの軽食・お茶"],
    color: "#E07A5F",
  },
  {
    category: "外食",
    description: "飲食店での食事やカフェ、テイクアウト",
    examples: ["友人との食事", "カフェ・スタバ", "ファストフード", "居酒屋・外食ランチ"],
    color: "#F28E2B",
  },
  {
    category: "日用品・消耗品",
    description: "生活に必要な消耗雑貨・ドラッグストア購入品",
    examples: ["洗剤・ティッシュ", "シャンプー・歯ブラシ", "ゴミ袋", "文房具・100均雑貨"],
    color: "#4D908E",
  },
  {
    category: "衣服",
    description: "衣類・ファッションアイテムや身だしなみ",
    examples: ["洋服・下着", "靴・バッグ", "美容院・理髪店", "コスメ・スキンケア"],
    color: "#DDA15E",
  },
  {
    category: "ゲーム",
    description: "ゲーム関連の購入・課金・ハードウェア",
    examples: ["ソシャゲ課金", "Steam・任天堂ストア", "ゲームソフト", "周辺機器・コントローラー"],
    color: "#8B85C1",
  },
  {
    category: "推し活・配信",
    description: "配信者・VTuber・推しに関する支出",
    examples: ["YouTubeメンバーシップ", "スーパーチャット", "公式グッズ・アクスタ", "配信チケット・ファンクラブ"],
    color: "#D4729B",
  },
  {
    category: "イベント・旅行",
    description: "旅行・お出かけ・レジャー施設・大型イベント",
    examples: ["ホテル・旅館宿泊費", "新幹線・航空券・レンタカー", "ディズニー・テーマパーク", "ライブ・フェス・アクティビティ"],
    color: "#606C38",
  },
  {
    category: "交通・移動",
    description: "日常の移動や交通手段にかかる費用",
    examples: ["電車・バス運賃", "Suica/PASMOチャージ", "タクシー代", "ガソリン代・高速料金"],
    color: "#52796F",
  },
  {
    category: "サブスク・固定費",
    description: "月額/年額の定額サービスや定期契約",
    examples: ["YouTube Premium", "iCloud・クラウドストレージ", "通信費・スマホ代", "月額定期購読"],
    color: "#817F75",
  },
  {
    category: "光熱費・住居",
    description: "水道光熱費や住まいに関する費用",
    examples: ["電気代", "ガス代", "水道代", "家賃・共益費"],
    color: "#4A6B82",
  },
  {
    category: "大型出費",
    description: "年に数回レベルの高額な買い物や機材投資",
    examples: ["家電製品・PC", "家具・寝具", "冠婚葬祭", "大型設備・機材"],
    color: "#9C6644",
  },
  {
    category: "その他",
    description: "上記のどれにも当てはまらない支出や一時調整",
    examples: ["証明書発行手数料", "使途不明・調整分", "立替精算"],
    color: "#A8A29E",
  },
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

export type TransactionSource = "manual" | "ocr" | "csv" | "email_notice";

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
  csvRowFingerprint?: string; // CSV行固有フィンガープリント (二重取込防止用)
  
  // Gmail 利用速報メール連携
  emailMessageId?: string; // 取得元の Gmail messageId
  source?: TransactionSource; // トランザクション生成元
  
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
  fingerprint?: string;  // 行固有フィンガープリント
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

/** CSV 照合プレビュー行アイテム (Sprint 10.12) */
export interface ReconcilePreviewItem {
  csvRow: CreditCardCsvRow;
  action: "match" | "create" | "skip";
  matchedTransaction?: ExpenseTransaction;
  confidence?: ReconcileConfidence;
  matchReason?: string;
}

/** CSV 照合プレビュー結果 (Sprint 10.12) */
export interface ReconcilePreviewResult {
  items: ReconcilePreviewItem[];
  matchedCount: number;
  createdCount: number;
  skippedCount: number;
  totalCsvRows: number;
  paymentMethod: PaymentMethod;
  affectedMonths: string[]; // 対象月 (YYYY-MM)
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

/** 月次×カード別の照合メタデータ */
export interface MonthlyCardReconcileStatus {
  id: string;              // 例: "2026-05_Oliveカード"
  month: string;           // YYYY-MM
  paymentMethod: PaymentMethod;
  isReconciled: boolean;   // CSV照合完了フラグ
  reconciledAt?: string;   // 照合実行日時 (ISO文字列)
  matchedCount?: number;   // 突合された件数
}

/** Gmail 利用速報メール解析結果 (Sprint 10.10) */
export interface ParsedEmailTransaction {
  messageId: string;
  date: string;          // YYYY-MM-DD
  title: string;         // 加盟店名 / 利用先
  totalAmount: number;   // 利用金額
  paymentMethod: PaymentMethod;
  category: ExpenseCategory;
  rawSnippet?: string;
}
