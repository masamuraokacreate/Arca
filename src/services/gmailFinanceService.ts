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
} from "../lib/financeStorage";
import {
  normalizeAmountNumber,
  normalizeDateString,
  getDaysDifference,
} from "../utils/csvReconcile";

/** 検索対象クエリ (直近14日以内) */
export const GMAIL_CARD_NOTICE_QUERY =
  '((from:(vpass.ne.jp OR smbc-card.com) "カードご利用のお知らせ") OR ' +
  '(from:(dcard.docomo.ne.jp OR docomo.ne.jp) "ご利用速報") OR ' +
  '(from:(aeon.co.jp) "カードご利用確認") OR ' +
  '(from:(viewsnet.jp) "ご利用のお知らせ")) newer_than:14d';

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

  // 3. 金額の抽出
  let rawAmount = 0;
  // パターン: 利用金額：5,400円 または ￥5,400 または 金額: 5400
  const amountMatch =
    text.match(/(?:利用金額|ご利用金額|お支払金額|金額)[：:\s]+[¥\\￥]?\s*([0-9,]+)\s*円?/i) ||
    text.match(/[¥\\￥]\s*([0-9,]+)/);

  if (amountMatch && amountMatch[1]) {
    rawAmount = normalizeAmountNumber(amountMatch[1]);
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

/**
 * Gmail から利用速報メールを取得・解析し、Finance取引に反映する
 */
export async function fetchAndProcessCardNoticeEmails(
  token: string,
  existingTransactions: ExpenseTransaction[]
): Promise<{
  createdCount: number;
  linkedCount: number;
  skippedCount: number;
  totalFound: number;
}> {
  if (!token) {
    throw new Error("有効なGoogleアクセストークンがありません。");
  }

  // 1. メッセージID一覧を検索
  const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(
    GMAIL_CARD_NOTICE_QUERY
  )}&maxResults=50`;

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
  const messages: Array<{ id: string; threadId: string }> = listData.messages || [];

  if (messages.length === 0) {
    return { createdCount: 0, linkedCount: 0, skippedCount: 0, totalFound: 0 };
  }

  let createdCount = 0;
  let linkedCount = 0;
  let skippedCount = 0;

  // 既存取引の messageId セット & 未突合リスト
  const existingMessageIds = new Set<string>();
  const activeTransactions = existingTransactions.filter((t) => !t.isDeleted);

  for (const t of activeTransactions) {
    if (t.emailMessageId) {
      existingMessageIds.add(t.emailMessageId);
    }
  }

  // 2. 各メッセージの詳細を取得・パース
  for (const msg of messages) {
    // 既に取得済みの messageId はスキップ
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

      // 3. 重複排除・バインド判定
      // 同日 (±1日)・同額・同一支払方法の未突合レコードが存在するか確認
      const matchingExistingTx = activeTransactions.find(
        (t) =>
          !t.isReconciled &&
          !t.emailMessageId &&
          t.paymentMethod === parsed.paymentMethod &&
          t.totalAmount === parsed.totalAmount &&
          getDaysDifference(t.date, parsed.date) <= 1
      );

      if (matchingExistingTx) {
        // 新規作成せず既存レコードに emailMessageId をバインド
        await updateExpenseTransaction(matchingExistingTx.id, {
          emailMessageId: parsed.messageId,
          updatedAt: new Date().toISOString(),
        });
        existingMessageIds.add(parsed.messageId);
        matchingExistingTx.emailMessageId = parsed.messageId;
        linkedCount++;
      } else {
        // 新規下書きレコードを作成
        const now = new Date().toISOString();
        await createExpenseTransaction({
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
        });
        existingMessageIds.add(parsed.messageId);
        createdCount++;
      }
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
