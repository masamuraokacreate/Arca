/**
 * src/services/gmailFinanceService.ts
 * Arca — Gmail クレジットカード利用速報メール自動取得 & 即時下書き生成エンジン
 *
 * Sprint 10.10:
 * - 直近14日以内の各社（三井住友/Olive、dカード、イオンカード、Viewカード）速報メールを取得・解析
 * - messageId および同日(±1日)・同額・同カード判定による重複排除・既存未突合レコードへのバインド
 * - 新規決済の下書き（source: "email_notice"）自動生成
 */

import type {
  ExpenseCategory,
  ExpenseTransaction,
  ParsedEmailTransaction,
  PaymentMethod,
} from "../types/finance";
import {
  createExpenseTransaction,
  updateExpenseTransaction,
  deleteExpenseTransaction,
} from "../lib/financeStorage";
import {
  collection,
  getDocs,
  writeBatch,
  doc,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import {
  normalizeAmountNumber,
  normalizeDateString,
} from "../utils/csvReconcile";

/**
 * Gmail カード利用速報検索クエリ生成ヘルパー (指定日数)
 * @param days 検索対象日数（デフォルト: 30日）
 */
export function buildGmailCardNoticeQuery(days: number = 30): string {
  return (
    '((from:(vpass.ne.jp OR smbc-card.com) ("カードご利用のお知らせ" OR "ご利用のお知らせ")) OR ' +
    '(from:(dcard.docomo.ne.jp OR docomo.ne.jp) "ご利用速報") OR ' +
    '(from:(aeon.co.jp) "カードご利用確認") OR ' +
    '(from:(viewsnet.jp) "ご利用のお知らせ")) ' +
    `newer_than:${days}d`
  );
}

/**
 * 対象月（デフォルト: 今月）の利用速報メール検索クエリ生成ヘルパー
 * 今月1日以降のメールをすべて対象にする (after:YYYY/MM/DD)
 * @param targetMonth 対象年月 "YYYY-MM"（省略時は今月）
 */
export function buildGmailCardNoticeQueryForMonth(targetMonth?: string): string {
  let ym = targetMonth;
  if (!ym) {
    const now = new Date();
    const jstYear = now.getFullYear();
    const jstMonth = String(now.getMonth() + 1).padStart(2, "0");
    ym = `${jstYear}-${jstMonth}`;
  }

  const [yearStr, monthStr] = ym.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  // 日本時間（JST = UTC+9）の月初のメールを取りこぼさないよう、UTCタイムゾーン差を考慮して前月最終日を指定
  const firstDay = new Date(year, month - 1, 1);
  const prevDay = new Date(firstDay);
  prevDay.setDate(prevDay.getDate() - 1);
  const afterStr = `${prevDay.getFullYear()}/${String(prevDay.getMonth() + 1).padStart(2, "0")}/${String(prevDay.getDate()).padStart(2, "0")}`;

  return (
    '((from:(vpass.ne.jp OR smbc-card.com) ("カードご利用のお知らせ" OR "ご利用のお知らせ")) OR ' +
    '(from:(dcard.docomo.ne.jp OR docomo.ne.jp) "ご利用速報") OR ' +
    '(from:(aeon.co.jp) "カードご利用確認") OR ' +
    '(from:(viewsnet.jp) "ご利用のお知らせ")) ' +
    `after:${afterStr}`
  );
}

/** 検索対象クエリ (デフォルト: 今月分すべて) */
export const GMAIL_CARD_NOTICE_QUERY = buildGmailCardNoticeQueryForMonth();

/**
 * Base64URL デコード関数 (UTF-8 対応)
 */
export function decodeBase64Url(base64UrlStr: string): string {
  if (!base64UrlStr) return "";
  try {
    const base64 = base64UrlStr.replace(/-/g, "+").replace(/_/g, "/");
    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    try {
      return decodeURIComponent(escape(atob(base64UrlStr.replace(/-/g, "+").replace(/_/g, "/"))));
    } catch {
      return "";
    }
  }
}

/**
 * 店舗名・利用先名から簡易カテゴリを推論する (Sprint 10.13: 12分類対応)
 */
export function inferCategoryFromTitle(title: string): ExpenseCategory {
  const t = title.toLowerCase();

  // 外食
  if (
    t.includes("マクドナルド") ||
    t.includes("スターバックス") ||
    t.includes("スタバ") ||
    t.includes("ドトール") ||
    t.includes("コメダ") ||
    t.includes("すき家") ||
    t.includes("松屋") ||
    t.includes("吉野家") ||
    t.includes("サイゼリヤ") ||
    t.includes("ガスト") ||
    t.includes("バーミヤン") ||
    t.includes("レストラン") ||
    t.includes("食堂") ||
    t.includes("カフェ") ||
    t.includes("居酒屋") ||
    t.includes("ケンタッキー") ||
    t.includes("モスバーガー")
  ) {
    return "外食";
  }

  // 食料品
  if (
    t.includes("スーパー") ||
    t.includes("イオン") ||
    t.includes("ライフ") ||
    t.includes("セブン") ||
    t.includes("ローソン") ||
    t.includes("ファミリーマート") ||
    t.includes("ファミマ") ||
    t.includes("成城石井") ||
    t.includes("カルディ") ||
    t.includes("業務スーパー") ||
    t.includes("サミット") ||
    t.includes("西友") ||
    t.includes("マルエツ") ||
    t.includes("ヤオコー") ||
    t.includes("オーケー")
  ) {
    return "食料品";
  }

  // 日用品・消耗品
  if (
    t.includes("マツモトキヨシ") ||
    t.includes("マツキヨ") ||
    t.includes("ウエルシア") ||
    t.includes("サンドラッグ") ||
    t.includes("ツルハ") ||
    t.includes("スギ薬局") ||
    t.includes("ダイソー") ||
    t.includes("セリア") ||
    t.includes("キャンドゥ") ||
    t.includes("ニトリ") ||
    t.includes("無印良品") ||
    t.includes("カインズ") ||
    t.includes("コーナン") ||
    t.includes("ドラッグ")
  ) {
    return "日用品・消耗品";
  }

  // 衣服
  if (
    t.includes("ユニクロ") ||
    t.includes("uniqlo") ||
    t.includes("ジーユー") ||
    t.includes("gu") ||
    t.includes("zara") ||
    t.includes("しまむら") ||
    t.includes("abcマート") ||
    t.includes("美容院") ||
    t.includes("美容室") ||
    t.includes("理容")
  ) {
    return "衣服";
  }

  // ゲーム
  if (
    t.includes("steam") ||
    t.includes("任天堂") ||
    t.includes("nintendo") ||
    t.includes("playstation") ||
    t.includes("psn") ||
    t.includes("epic games") ||
    t.includes("ソシャゲ")
  ) {
    return "ゲーム";
  }

  // 推し活・配信
  if (
    t.includes("super chat") ||
    t.includes("スーパーチャット") ||
    t.includes("スパチャ") ||
    t.includes("membership") ||
    t.includes("booth") ||
    t.includes("fanbox") ||
    t.includes("ファンクラブ")
  ) {
    return "推し活・配信";
  }

  // イベント・旅行
  if (
    t.includes("じゃらん") ||
    t.includes("楽天トラベル") ||
    t.includes("一休") ||
    t.includes("ホテル") ||
    t.includes("旅館") ||
    t.includes("ディズニー") ||
    t.includes("usj") ||
    t.includes("チケットぴあ") ||
    t.includes("ローチケ") ||
    t.includes("e+")
  ) {
    return "イベント・旅行";
  }

  // 交通・移動
  if (
    t.includes("suica") ||
    t.includes("pasmo") ||
    t.includes("icoca") ||
    t.includes("モバイルsuica") ||
    t.includes("jr") ||
    t.includes("メトロ") ||
    t.includes("地下鉄") ||
    t.includes("タクシー") ||
    t.includes("goタクシー") ||
    t.includes("タイムズ") ||
    t.includes("eneos") ||
    t.includes("出光") ||
    t.includes("コスモ石油") ||
    t.includes("ガソリン") ||
    t.includes("etc")
  ) {
    return "交通・移動";
  }

  // サブスク・固定費
  if (
    t.includes("netflix") ||
    t.includes("spotify") ||
    t.includes("youtube") ||
    t.includes("apple.com/bill") ||
    t.includes("amazon prime") ||
    t.includes("icloud") ||
    t.includes("通信費") ||
    t.includes("docomo") ||
    t.includes("kddi") ||
    t.includes("softbank")
  ) {
    return "サブスク・固定費";
  }

  // 光熱費・住居
  if (
    t.includes("電力") ||
    t.includes("ガス") ||
    t.includes("水道") ||
    t.includes("家賃")
  ) {
    return "光熱費・住居";
  }

  // 大型出費
  if (
    t.includes("ビックカメラ") ||
    t.includes("ヨドバシ") ||
    t.includes("ヤマダデンキ") ||
    t.includes("apple store")
  ) {
    return "大型出費";
  }

  return "その他";
}

/**
 * メールヘッダーから From / Subject / Date を抽出
 */
export function getHeaderValue(headers: Array<{ name: string; value: string }>, name: string): string {
  const found = headers.find((h) => h.name.toLowerCase() === name.toLowerCase());
  return found ? found.value : "";
}

/**
 * Gmail メッセージ payload からプレーンテキストまたはHTML本文を取得
 */
export function extractBodyFromPayload(payload: any): string {
  if (!payload) return "";

  // 1. 直下に body.data がある場合
  if (payload.body && payload.body.data) {
    return decodeBase64Url(payload.body.data);
  }

  // 2. parts に分かれている場合 (再帰探索)
  if (Array.isArray(payload.parts)) {
    // まず text/plain を探す
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body && part.body.data) {
        return decodeBase64Url(part.body.data);
      }
    }
    // なければ text/html
    for (const part of payload.parts) {
      if (part.mimeType === "text/html" && part.body && part.body.data) {
        const html = decodeBase64Url(part.body.data);
        return html.replace(/<[^>]+>/g, " "); // 簡易タグ除去
      }
    }
    // 入れ子の parts
    for (const part of payload.parts) {
      const nested = extractBodyFromPayload(part);
      if (nested) return nested;
    }
  }

  return "";
}

/**
 * 単一の速報メールから取引データを解析 (ルールベース & 正規表現)
 */
export function parseCardNoticeEmail(
  messageId: string,
  subject: string,
  from: string,
  bodyText: string,
  snippet?: string
): ParsedEmailTransaction | null {
  const text = `${subject}\n${bodyText}\n${snippet || ""}`;
  const fromLower = from.toLowerCase();
  const subjectLower = subject.toLowerCase();

  let paymentMethod: PaymentMethod = "Oliveカード";
  let isTargetMail = false;

  // 1. カード会社の判別
  if (
    fromLower.includes("smbc-card.com") ||
    fromLower.includes("vpass.ne.jp") ||
    subjectLower.includes("カードご利用のお知らせ") ||
    text.includes("三井住友") ||
    text.includes("オリーブ") ||
    text.includes("Olive")
  ) {
    paymentMethod = "Oliveカード";
    isTargetMail = true;
  } else if (
    fromLower.includes("dcard.docomo.ne.jp") ||
    fromLower.includes("docomo.ne.jp") ||
    subjectLower.includes("ご利用速報") ||
    text.includes("ｄカード") ||
    text.includes("dカード")
  ) {
    paymentMethod = "dカード";
    isTargetMail = true;
  } else if (
    fromLower.includes("aeon.co.jp") ||
    subjectLower.includes("カードご利用確認") ||
    text.includes("イオンカード")
  ) {
    paymentMethod = "イオンカード";
    isTargetMail = true;
  } else if (
    fromLower.includes("viewsnet.jp") ||
    subjectLower.includes("ご利用のお知らせ") ||
    text.includes("ビューカード") ||
    text.includes("View")
  ) {
    paymentMethod = "交通系IC";
    isTargetMail = true;
  }

  if (!isTargetMail) {
    return null;
  }

  // 2. 利用日の抽出
  let rawDate = "";
  // パターン1: 2026/08/30 15:42 または 2026-08-30 または 2026年08月30日
  const dateMatch =
    text.match(/(?:利用日時|利用日|ご利用日時|ご利用日|ご利用年月日)[：:\s]+(\d{4}[/-]\d{1,2}[/-]\d{1,2})/i) ||
    text.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/);

  if (dateMatch) {
    if (dateMatch[1] && dateMatch[2] && dateMatch[3]) {
      const y = dateMatch[1];
      const m = dateMatch[2].padStart(2, "0");
      const d = dateMatch[3].padStart(2, "0");
      rawDate = `${y}-${m}-${d}`;
    } else if (dateMatch[1]) {
      rawDate = normalizeDateString(dateMatch[1]);
    }
  }

  if (!rawDate) {
    // 日付が見つからない場合は今日の日付をフォールバックとしない（誤認識を防ぐため）
    return null;
  }

  // 3. 金額および店舗名のブロック形式探索 (三井住友/Olive新形式: 利用日時の直後に店舗名、その直後に金額)
  const blockMatch = text.match(
    /(?:利用日時|ご利用日時)[：:\s]+[^\r\n]+(?:\r?\n\s*)+([^\r\n]+?)(?:\r?\n\s*)+([0-9,]+)\s*円/
  );

  // 3. 金額の抽出
  let rawAmount = 0;
  // パターン: 利用金額：5,400円 または ￥5,400 または 金額: 5400
  const amountMatch =
    text.match(/(?:利用金額|ご利用金額|お支払金額|金額)[：:\s]+[¥\\￥]?\s*([0-9,]+)\s*円?/i) ||
    text.match(/[¥\\￥]\s*([0-9,]+)/);

  if (amountMatch && amountMatch[1]) {
    rawAmount = normalizeAmountNumber(amountMatch[1]);
  } else if (blockMatch && blockMatch[2]) {
    rawAmount = normalizeAmountNumber(blockMatch[2]);
  } else {
    // 単独行の金額 (例: 397円)
    const singleAmountMatch = text.match(/(?:^|\r?\n)\s*([0-9,]+)\s*円\s*(?:\r?\n|$)/);
    if (singleAmountMatch && singleAmountMatch[1]) {
      rawAmount = normalizeAmountNumber(singleAmountMatch[1]);
    }
  }

  if (rawAmount <= 0) {
    return null;
  }

  // 4. 店舗名 / 利用先の抽出
  let rawTitle = "";
  const titleMatch =
    text.match(/(?:利用加盟店|ご利用先など|ご利用先|利用先|利用店名|ご利用店舗|加盟店名|加盟店)[：:\s]+([^\r\n]+)/i) ||
    text.match(/【利用先】\s*([^\r\n]+)/i);

  if (titleMatch && titleMatch[1]) {
    let t = titleMatch[1].trim();
    // 記号や不要な接頭辞・接尾辞のクリーンアップ
    t = t.replace(/^[\s◇◆・■□:：]+/, "").replace(/[\s◇◆・■□]+$/, "").trim();
    // 括弧注記等の除去
    t = t.replace(/（[^）]+）|\([^)]+\)/g, "").trim();
    rawTitle = t;
  } else if (blockMatch && blockMatch[1]) {
    let t = blockMatch[1].trim();
    t = t.replace(/^[\s◇◆・■□:：]+/, "").replace(/[\s◇◆・■□]+$/, "").trim();
    t = t.replace(/（[^）]+）|\([^)]+\)/g, "").trim();
    if (t && !t.includes("本メールは") && !t.includes("ご利用内容") && !t.includes("注意事項")) {
      rawTitle = t;
    }
  }

  if (!rawTitle) {
    rawTitle = `${paymentMethod}利用`;
  }

  const category = inferCategoryFromTitle(rawTitle);

  return {
    messageId,
    date: rawDate,
    title: rawTitle,
    totalAmount: rawAmount,
    paymentMethod,
    category,
    rawSnippet: snippet,
  };
}

export interface FetchCardNoticeOptions {
  days?: number;
  /** 対象年月 "YYYY-MM" (省略時は今月) */
  targetMonth?: string;
  /** 対象月に厳密にフィルタリングするか (デフォルト: targetMonth指定時または月検索時 true) */
  filterByMonth?: boolean;
}

/**
 * Gmail から利用速報メールを取得・解析し、Finance取引に反映する
 *
 * 【今月分すべて取得】
 * - デフォルトで今月（または指定年月）のメールをすべて対象にする
 * - nextPageToken による全ページ取得に対応し、上限（最大500件）まで漏れなく取得
 * - 重複判定（冪等性）の唯一の基準: emailMessageId の完全一致
 *
 * @param token 有効な Google アクセストークン
 * @param existingTransactions ローカルの既存取引一覧
 * @param optionsOrDays 検索対象日数、またはオプション（targetMonth, days等）
 */
export async function fetchAndProcessCardNoticeEmails(
  token: string,
  existingTransactions: ExpenseTransaction[],
  optionsOrDays?: number | FetchCardNoticeOptions
): Promise<{
  createdCount: number;
  linkedCount: number;
  skippedCount: number;
  totalFound: number;
}> {
  if (!token) {
    throw new Error("有効なGoogleアクセストークンがありません。");
  }

  // オプション解析
  const isDaysNumber = typeof optionsOrDays === "number";
  const options: FetchCardNoticeOptions = isDaysNumber
    ? { days: optionsOrDays }
    : optionsOrDays || {};

  const targetMonth = options.targetMonth;
  const query = options.days
    ? buildGmailCardNoticeQuery(options.days)
    : buildGmailCardNoticeQueryForMonth(targetMonth);

  // 1. メッセージID一覧を検索（今月分すべてを取得するため nextPageToken を辿る）
  const messages: Array<{ id: string; threadId: string }> = [];
  let pageToken: string | undefined = undefined;
  let pageCount = 0;
  const maxPages = 5; // 最大500件まで安全取得

  do {
    const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(
      query
    )}&maxResults=100${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`;

    const listRes = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!listRes.ok) {
      if (listRes.status === 401 || listRes.status === 403) {
        throw new Error("Gmailの読み取り権限が未認可または期限切れです。再認証してください。");
      }
      throw new Error(`Gmail APIエラー: ${listRes.status} ${listRes.statusText}`);
    }

    const listData = await listRes.json();
    if (listData.messages && Array.isArray(listData.messages)) {
      messages.push(...listData.messages);
    }

    pageToken = listData.nextPageToken;
    pageCount++;
  } while (pageToken && pageCount < maxPages);

  if (messages.length === 0) {
    return { createdCount: 0, linkedCount: 0, skippedCount: 0, totalFound: 0 };
  }

  let createdCount = 0;
  let linkedCount = 0;
  let skippedCount = 0;

  // 既存取引（削除済みも含む）の emailMessageId セット
  const existingMessageIds = new Set<string>();
  for (const t of existingTransactions) {
    if (t.emailMessageId && typeof t.emailMessageId === "string" && t.emailMessageId.trim() !== "") {
      existingMessageIds.add(t.emailMessageId.trim());
    }
  }

  // Firestore の実データからも最新の全件（isDeleted: true 含む）を照合してマージ
  try {
    const snap = await getDocs(collection(db, "finance_transactions"));
    if (!snap.empty) {
      snap.docs.forEach((d) => {
        const data = d.data() as any;
        const emailMsgId = data?.emailMessageId;
        if (typeof emailMsgId === "string" && emailMsgId.trim() !== "") {
          existingMessageIds.add(emailMsgId.trim());
        }
      });
    }
  } catch {
    // オフラインまたはテスト環境でのフォールバック（引数をそのまま使用）
  }

  // 2. 各メッセージの詳細を取得・パース
  for (const msg of messages) {
    // 既に取得済みの messageId はスキップ (第1防衛線)
    if (existingMessageIds.has(msg.id)) {
      skippedCount++;
      continue;
    }

    try {
      const msgUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`;
      const msgRes = await fetch(msgUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!msgRes.ok) continue;

      const msgData = await msgRes.json();
      const headers = msgData.payload?.headers || [];
      const subject = getHeaderValue(headers, "Subject");
      const from = getHeaderValue(headers, "From");
      const bodyText = extractBodyFromPayload(msgData.payload);
      const snippet = msgData.snippet || "";

      const parsed = parseCardNoticeEmail(msg.id, subject, from, bodyText, snippet);
      if (!parsed) {
        skippedCount++;
        continue;
      }

      // パースされた messageId が既に存在する場合も確実にスキップ (第2防衛線)
      if (existingMessageIds.has(parsed.messageId)) {
        skippedCount++;
        continue;
      }

      // 【要件 A】重複判定の唯一の基準: emailMessageId の完全一致のみ
      // 同日・同額によるスキップ判定は完全に撤廃し、正当な決済として正常に取り込む
      const now = new Date().toISOString();
      const newTxData: Omit<ExpenseTransaction, "id"> = {
        date: parsed.date,
        title: parsed.title,
        totalAmount: parsed.totalAmount,
        category: parsed.category,
        paymentMethod: parsed.paymentMethod,
        items: [],
        isReconciled: false,
        matchedCsvRowId: "",
        emailMessageId: parsed.messageId,
        source: "email_notice",
        memo: "Gmail利用速報より自動登録",
        createdAt: now,
        updatedAt: now,
        isDeleted: false,
      };

      await createExpenseTransaction(newTxData);
      existingMessageIds.add(parsed.messageId);
      createdCount++;
    } catch (e) {
      console.warn(`[gmailFinanceService] Failed to process message ${msg.id}:`, e);
    }
  }

  return {
    createdCount,
    linkedCount,
    skippedCount,
    totalFound: messages.length,
  };
}

/**
 * 2つの重複・突合候補レコードを品目内訳を保持して1つの確定済みレコードに統合する
 * @param targetTx 統合先（基本的には呼び出し元カード、または内訳保持側）
 * @param sourceTx 統合元（統合後に論理削除される側）
 */
export async function mergeExpenseTransactions(
  targetTx: ExpenseTransaction,
  sourceTx: ExpenseTransaction
): Promise<ExpenseTransaction> {
  const hasTargetItems = Array.isArray(targetTx.items) && targetTx.items.length > 0;
  const hasSourceItems = Array.isArray(sourceTx.items) && sourceTx.items.length > 0;

  // 内訳（items）を保持する側を決定（片方に内訳があればそれを引き継ぐ）
  const primaryItems = hasTargetItems
    ? targetTx.items
    : hasSourceItems
    ? sourceTx.items
    : [];

  // 店舗名: プレースホルダーでなく、より具体的な方を採用
  let primaryTitle = targetTx.title;
  if (
    (primaryTitle === "レシート支出" || primaryTitle === "支出") &&
    sourceTx.title &&
    sourceTx.title !== "レシート支出" &&
    sourceTx.title !== "支出"
  ) {
    primaryTitle = sourceTx.title;
  }

  // 支払方法: メール速報（Oliveカード等）などのカード種別を優先、なければ targetTx
  let primaryPaymentMethod = targetTx.paymentMethod;
  if (
    (primaryPaymentMethod === "現金" || primaryPaymentMethod === "その他") &&
    sourceTx.paymentMethod &&
    sourceTx.paymentMethod !== "現金" &&
    sourceTx.paymentMethod !== "その他"
  ) {
    primaryPaymentMethod = sourceTx.paymentMethod;
  }

  // 各種メタデータの引き継ぎ
  const emailMessageId = targetTx.emailMessageId || sourceTx.emailMessageId;
  const receiptImageUrl = targetTx.receiptImageUrl || sourceTx.receiptImageUrl;
  const matchedCsvRowId = targetTx.matchedCsvRowId || sourceTx.matchedCsvRowId;
  const csvRowFingerprint = targetTx.csvRowFingerprint || sourceTx.csvRowFingerprint;

  // メモの引き継ぎ
  const memos = [targetTx.memo, sourceTx.memo].filter(Boolean);
  const memo = memos.length > 0 ? memos.join(" / ") : undefined;

  // 更新パッチ
  const patch: Partial<ExpenseTransaction> = {
    title: primaryTitle,
    items: primaryItems,
    paymentMethod: primaryPaymentMethod,
    isReconciled: true, // 統合により確定ステータスへ
    emailMessageId,
    receiptImageUrl,
    matchedCsvRowId,
    csvRowFingerprint,
    memo,
    updatedAt: new Date().toISOString(),
  };

  // 1. targetTx を確定レコードに更新
  await updateExpenseTransaction(targetTx.id, patch);

  // 2. sourceTx を論理削除
  await deleteExpenseTransaction(sourceTx.id);

  return {
    ...targetTx,
    ...patch,
  };
}

// ═══════════════════════════════════════════════════════════
// 既存重複レコードの一括クリーンアップ (同一 emailMessageId の多重登録排除)
// ═══════════════════════════════════════════════════════════

export interface CleanupDuplicateResult {
  deletedCount: number;
  duplicateIds: string[];
}

/**
 * 既存の重複支出レコード（同一 emailMessageId を持つ2件目以降）を一括クリーンアップする
 * 作成日時（createdAt）が最も古い1件を正規データとして残し、2件目以降を Firestore から削除する
 *
 * @param fallbackTransactions オプション: テストやローカル参照用トランザクション一覧
 */
export async function cleanupDuplicateExpenses(
  fallbackTransactions?: ExpenseTransaction[]
): Promise<CleanupDuplicateResult> {
  try {
    let allDocs: Array<{ id: string; emailMessageId?: string; createdAt?: string }> = [];

    try {
      const snap = await getDocs(collection(db, "finance_transactions"));
      if (!snap.empty) {
        snap.docs.forEach((d) => {
          const data = d.data() as any;
          let cAt = "";
          if (typeof data.createdAt === "string") {
            cAt = data.createdAt;
          } else if (data.createdAt?.toDate) {
            cAt = data.createdAt.toDate().toISOString();
          }
          allDocs.push({
            id: d.id,
            emailMessageId: data.emailMessageId,
            createdAt: cAt,
          });
        });
      }
    } catch (e) {
      console.warn("[cleanupDuplicateExpenses] Failed to read from Firestore directly, using fallback:", e);
    }

    // fallbackTransactions が渡されており、allDocs が空の場合はフォールバックを使用
    if (allDocs.length === 0 && fallbackTransactions && fallbackTransactions.length > 0) {
      allDocs = fallbackTransactions.map((t) => ({
        id: t.id,
        emailMessageId: t.emailMessageId,
        createdAt: typeof t.createdAt === "string" ? t.createdAt : "",
      }));
    }

    if (allDocs.length === 0) {
      return { deletedCount: 0, duplicateIds: [] };
    }

    // emailMessageId ごとにグルーピング
    const groupedByEmail = new Map<string, Array<{ id: string; createdAt: string }>>();

    for (const docItem of allDocs) {
      const emailId = docItem.emailMessageId;
      if (typeof emailId === "string" && emailId.trim() !== "") {
        const key = emailId.trim();
        const list = groupedByEmail.get(key) || [];
        list.push({ id: docItem.id, createdAt: docItem.createdAt || "" });
        groupedByEmail.set(key, list);
      }
    }

    const duplicateIds: string[] = [];

    for (const [_emailId, items] of groupedByEmail.entries()) {
      if (items.length <= 1) continue;

      // createdAt 昇順ソート（最古が index 0）
      items.sort((a, b) => {
        if (!a.createdAt && !b.createdAt) return a.id.localeCompare(b.id);
        if (!a.createdAt) return 1;
        if (!b.createdAt) return -1;
        const cmp = a.createdAt.localeCompare(b.createdAt);
        if (cmp !== 0) return cmp;
        return a.id.localeCompare(b.id);
      });

      // index 1 以降を重複削除対象に
      for (let i = 1; i < items.length; i++) {
        duplicateIds.push(items[i].id);
      }
    }

    if (duplicateIds.length === 0) {
      return { deletedCount: 0, duplicateIds: [] };
    }

    // writeBatch で一括物理削除 (450件区切り)
    const BATCH_SIZE = 450;
    for (let i = 0; i < duplicateIds.length; i += BATCH_SIZE) {
      const batch = writeBatch(db);
      const chunk = duplicateIds.slice(i, i + BATCH_SIZE);
      chunk.forEach((id) => {
        batch.delete(doc(db, "finance_transactions", id));
      });
      await batch.commit();
    }

    return {
      deletedCount: duplicateIds.length,
      duplicateIds,
    };
  } catch (err) {
    console.error("[cleanupDuplicateExpenses] Error occurred:", err);
    return { deletedCount: 0, duplicateIds: [] };
  }
}

/** エイリアス */
export const cleanupDuplicateTransactions = cleanupDuplicateExpenses;

