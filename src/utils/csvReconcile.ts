/**
 * src/utils/csvReconcile.ts
 * Arca — クレジットカード明細CSV解析 ＆ 自動突合（Reconciliation）エンジン
 *
 * 対応カード形式:
 * - 三井住友カード
 * - dカード
 * - イオンカード
 * - Viewカード
 * - 汎用CSV（日付・店舗名・金額自動検出）
 */

import type {
  CreditCardCsvRow,
  ExpenseTransaction,
  PaymentMethod,
  ReconcileCandidate,
  ReconcileConfidence,
} from "../types/finance";

/**
 * 全角英数記号・半角カナの正規化
 */
export function normalizeJapaneseText(text: string): string {
  if (!text) return "";
  let str = text.trim();

  // 全角英数を半角に変換
  str = str.replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));

  // 半角カナを全角カナに変換
  const kanaMap: Record<string, string> = {
    ｶﾞ: "ガ", ｷﾞ: "ギ", ｸﾞ: "グ", ｹﾞ: "ゲ", ｺﾞ: "ゴ",
    ｻﾞ: "ザ", ｼﾞ: "ジ", ｽﾞ: "ズ", ｾﾞ: "ゼ", ｿﾞ: "ゾ",
    ﾀﾞ: "ダ", ﾁﾞ: "ヂ", ﾂﾞ: "ヅ", ﾃﾞ: "デ", ﾄﾞ: "ド",
    ﾊﾞ: "バ", ﾋﾞ: "ビ", ﾌﾞ: "ブ", ﾍﾞ: "ベ", ﾎﾞ: "ボ",
    ﾊﾟ: "パ", ﾋﾟ: "ピ", ﾌﾟ: "プ", ﾍﾟ: "ペ", ﾎﾟ: "ポ",
    ｳﾞ: "ヴ", ﾜﾞ: "ヷ", ｦﾞ: "ヺ",
    ｱ: "ア", ｲ: "イ", ｳ: "ウ", ｴ: "エ", ｵ: "オ",
    ｶ: "カ", ｷ: "キ", ｸ: "ク", ｹ: "ケ", ｺ: "コ",
    ｻ: "サ", ｼ: "シ", ｽ: "ス", ｾ: "セ", ｿ: "ソ",
    ﾀ: "タ", ﾁ: "チ", ﾂ: "ツ", ﾃ: "テ", ﾄ: "ト",
    ﾅ: "ナ", ﾆ: "ニ", ﾇ: "ヌ", ﾈ: "ネ", ﾉ: "ノ",
    ﾊ: "ハ", ﾋ: "ヒ", ﾌ: "フ", ﾍ: "ヘ", ﾎ: "ホ",
    ﾏ: "マ", ﾐ: "ミ", ﾑ: "ム", ﾒ: "メ", ﾓ: "モ",
    ﾔ: "ヤ", ﾕ: "ユ", ﾖ: "ヨ",
    ﾗ: "ラ", ﾘ: "リ", ﾙ: "ル", ﾚ: "レ", ﾛ: "ロ",
    ﾜ: "ワ", ｦ: "ヲ", ﾝ: "ン",
    ｧ: "ァ", ｨ: "ィ", ｩ: "ゥ", ｪ: "ェ", ｫ: "ォ",
    ｯ: "ッ", ｬ: "ャ", ｭ: "ュ", ｮ: "ョ",
    ｰ: "ー", "･": "・",
  };

  const reg = new RegExp(Object.keys(kanaMap).join("|"), "g");
  str = str.replace(reg, (match) => kanaMap[match] || match);

  // 株式会社、(株)、決済プレフィックス等の除去
  str = str
    .replace(/(株式会社|（株）|\(株\)|合同会社|有限会社|カブシキガイシャ|ｶﾌﾞｼｷｶﾞｲｼｬ|ｶ\)|カ\))/g, "")
    .replace(/[\s\u3000]+/g, "")
    .toLowerCase();

  return str;
}

/**
 * 簡易レーベンシュタイン距離または部分一致による文字列類似度算出 (0.0〜1.0)
 */
export function calculateTitleSimilarity(a: string, b: string): number {
  const normA = normalizeJapaneseText(a);
  const normB = normalizeJapaneseText(b);

  if (!normA || !normB) return 0;
  if (normA === normB) return 1;
  if (normA.includes(normB) || normB.includes(normA)) return 0.85;

  // 簡易2-gram 類似度
  const getBigrams = (s: string) => {
    const bigrams = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) {
      bigrams.add(s.slice(i, i + 2));
    }
    return bigrams;
  };

  const bigramsA = getBigrams(normA);
  const bigramsB = getBigrams(normB);

  if (bigramsA.size === 0 || bigramsB.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const item of bigramsA) {
    if (bigramsB.has(item)) intersection++;
  }

  return (2.0 * intersection) / (bigramsA.size + bigramsB.size);
}

/**
 * 日付文字列の正規化 (YYYY-MM-DD 形式へ変換)
 */
export function normalizeDateString(dateStr: string): string {
  if (!dateStr) return "";
  const cleaned = dateStr.trim().replace(/\//g, "-").replace(/\./g, "-");

  // YYYY-MM-DD
  const m1 = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m1) {
    const y = m1[1];
    const m = m1[2].padStart(2, "0");
    const d = m1[3].padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // YYYYMMDD
  const m2 = cleaned.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m2) {
    return `${m2[1]}-${m2[2]}-${m2[3]}`;
  }

  return cleaned;
}

/**
 * 金額文字列の正規化 (整数値へ変換)
 */
export function normalizeAmountNumber(amountStr: string | number): number {
  if (typeof amountStr === "number") return Math.round(amountStr);
  if (!amountStr) return 0;

  const cleaned = String(amountStr).replace(/[¥\\,\s"]/g, "").trim();
  const num = parseInt(cleaned, 10);
  return isNaN(num) ? 0 : Math.abs(num);
}

/**
 * CSVテキストを行・列に安全に分割（クォート内のカンマや改行を考慮）
 */
export function parseCsvToGrid(csvText: string): string[][] {
  const cleanText = csvText.replace(/^\uFEFF/, ""); // BOM除去
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;

  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];
    const nextChar = cleanText[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          currentCell += '"';
          i++; // エスケープされたダブルクォートをスキップ
        } else {
          inQuotes = false;
        }
      } else {
        currentCell += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        currentRow.push(currentCell.trim());
        currentCell = "";
      } else if (char === "\r") {
        if (nextChar === "\n") i++;
        currentRow.push(currentCell.trim());
        rows.push(currentRow);
        currentRow = [];
        currentCell = "";
      } else if (char === "\n") {
        currentRow.push(currentCell.trim());
        rows.push(currentRow);
        currentRow = [];
        currentCell = "";
      } else {
        currentCell += char;
      }
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    rows.push(currentRow);
  }

  return rows.filter((r) => r.length > 0 && r.some((cell) => cell.length > 0));
}

/**
 * CSVヘッダーからカード会社やカラム位置を自動推論してパース
 */
export function parseCreditCardCsv(
  csvText: string,
  preferredMethod: PaymentMethod = "Oliveカード"
): { rows: CreditCardCsvRow[]; detectedMethod: PaymentMethod } {
  const grid = parseCsvToGrid(csvText);
  if (grid.length === 0) {
    return { rows: [], detectedMethod: preferredMethod };
  }

  let headerIndex = -1;
  let dateCol = -1;
  let titleCol = -1;
  let amountCol = -1;
  let detectedMethod = preferredMethod;

  // ヘッダー行の検索
  for (let r = 0; r < Math.min(10, grid.length); r++) {
    const row = grid[r];
    for (let c = 0; c < row.length; c++) {
      const h = row[c].trim();
      if (
        h.includes("利用日") ||
        h.includes("利用年月日") ||
        h.includes("ご利用年月日") ||
        h.includes("年月日") ||
        h.toLowerCase().includes("date")
      ) {
        dateCol = c;
      }
      if (
        h.includes("利用店名") ||
        h.includes("利用先") ||
        h.includes("ご利用先") ||
        h.includes("ご利用箇所") ||
        h.includes("商品名") ||
        h.includes("品名") ||
        h.includes("摘要") ||
        h.toLowerCase().includes("summary") ||
        h.toLowerCase().includes("store")
      ) {
        titleCol = c;
      }
      if (
        h.includes("利用金額") ||
        h.includes("ご利用金額") ||
        h.includes("金額") ||
        h.includes("利用額") ||
        h.toLowerCase().includes("amount") ||
        h.toLowerCase().includes("price")
      ) {
        amountCol = c;
      }
    }

    if (dateCol !== -1 && titleCol !== -1 && amountCol !== -1) {
      headerIndex = r;
      // カード種類の推論
      const rowStr = row.join(" ");
      if (rowStr.includes("ご利用箇所") || rowStr.includes("ビュー") || rowStr.includes("View")) {
        detectedMethod = "交通系IC";
      } else if (rowStr.includes("ご利用先など") || rowStr.includes("ご利用年月日") || rowStr.includes("dカード")) {
        detectedMethod = "dカード";
      } else if (rowStr.includes("利用先") && !rowStr.includes("利用店名")) {
        detectedMethod = "イオンカード";
      } else if (rowStr.includes("利用店名・商品名") || rowStr.includes("三井住友") || rowStr.includes("Olive") || rowStr.includes("SMBC")) {
        detectedMethod = "Oliveカード";
      } else if (rowStr.includes("PayPay") || rowStr.includes("ペイペイ")) {
        detectedMethod = "PayPay";
      }
      break;
    }
  }

  // ヘッダーが見つからなかった場合のフォールバック（第1行をヘッダーと仮定、または0, 1, 2列目を使用）
  if (headerIndex === -1) {
    headerIndex = 0;
    dateCol = 0;
    titleCol = 1;
    amountCol = 2;
  }

  const resultRows: CreditCardCsvRow[] = [];
  const startRow = headerIndex + 1;

  for (let r = startRow; r < grid.length; r++) {
    const row = grid[r];
    if (row.length <= Math.max(dateCol, titleCol, amountCol)) continue;

    const rawDate = row[dateCol];
    const rawTitle = row[titleCol];
    const rawAmount = row[amountCol];

    const date = normalizeDateString(rawDate);
    const title = rawTitle ? rawTitle.trim() : "";
    const amount = normalizeAmountNumber(rawAmount);

    // 金額が0以上かつ有効な日付と店名がある行のみ採用
    if (date && title && amount > 0) {
      resultRows.push({
        rowId: `csv-row-${r}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        date,
        title,
        amount,
        paymentMethod: detectedMethod,
      });
    }
  }

  return { rows: resultRows, detectedMethod };
}

/**
 * 日付差（日数）を計算
 */
export function getDaysDifference(dateStr1: string, dateStr2: string): number {
  if (!dateStr1 || !dateStr2) return 999;
  const d1 = new Date(dateStr1).getTime();
  const d2 = new Date(dateStr2).getTime();
  if (isNaN(d1) || isNaN(d2)) return 999;
  return Math.abs(Math.round((d1 - d2) / (1000 * 60 * 60 * 24)));
}

/**
 * 単一の CSV 行に対する最適な Arca 支出取引のマッチング評価
 */
export function evaluateMatchCandidate(
  csvRow: CreditCardCsvRow,
  transaction: ExpenseTransaction
): { confidence: ReconcileConfidence; score: number; reason: string; daysDiff: number } {
  const daysDiff = getDaysDifference(csvRow.date, transaction.date);
  const amountMatches = csvRow.amount === transaction.totalAmount;
  const similarity = calculateTitleSimilarity(csvRow.title, transaction.title);

  // 1. 完全一致 (Exact): 金額一致 ＋ 同日 ＋ (店名類似度高 または カード会社一致)
  if (amountMatches && daysDiff === 0) {
    if (similarity >= 0.5) {
      return { confidence: "exact", score: 100, reason: "金額・利用日・店名が完全に一致", daysDiff };
    }
    return { confidence: "high", score: 90, reason: "金額および利用日が一致", daysDiff };
  }

  // 2. 高信頼度 (High): 金額一致 ＋ 利用日差2日以内 ＋ 店名類似
  if (amountMatches && daysDiff <= 2) {
    if (similarity >= 0.4) {
      return { confidence: "high", score: 85, reason: `金額一致・日付差${daysDiff}日・店名類似`, daysDiff };
    }
    return { confidence: "medium", score: 75, reason: `金額一致・利用日差${daysDiff}日`, daysDiff };
  }

  // 3. 中信頼度 (Medium): 金額一致 ＋ 日付差5日以内
  if (amountMatches && daysDiff <= 5) {
    if (similarity >= 0.5) {
      return { confidence: "medium", score: 65, reason: `金額一致・日付差${daysDiff}日・店名一致`, daysDiff };
    }
    return { confidence: "low", score: 50, reason: `金額一致・利用日差${daysDiff}日`, daysDiff };
  }

  // 4. 低信頼度 (Low): 店名が酷似しているが日付や金額がわずかにズレている
  if (similarity >= 0.8 && daysDiff <= 3) {
    return { confidence: "low", score: 40, reason: `店名が一致（金額差あり: ¥${Math.abs(csvRow.amount - transaction.totalAmount)}）`, daysDiff };
  }

  return { confidence: "none", score: 0, reason: "一致する条件が見つかりません", daysDiff };
}

/**
 * CSV明細リストとArca取引リストの自動照合（Reconciliation）を実行
 */
export function runAutoReconcile(
  csvRows: CreditCardCsvRow[],
  transactions: ExpenseTransaction[]
): {
  candidates: ReconcileCandidate[];
  reconciledCount: number;
  unmatchedCsvRows: CreditCardCsvRow[];
} {
  const activeTransactions = transactions.filter((t) => !t.isDeleted);
  const usedTransactionIds = new Set<string>();
  
  // 既に紐付け済みの取引をマーク
  for (const t of activeTransactions) {
    if (t.isReconciled && t.matchedCsvRowId) {
      usedTransactionIds.add(t.id);
    }
  }

  const candidates: ReconcileCandidate[] = [];
  let reconciledCount = 0;

  for (const row of csvRows) {
    // 既にマッチ済みの行はスキップ
    if (row.matchedTransactionId) {
      const matched = activeTransactions.find((t) => t.id === row.matchedTransactionId);
      candidates.push({
        csvRow: row,
        matchedTransaction: matched,
        confidence: "exact",
        matchReason: "既に突合済み",
        daysDifference: matched ? getDaysDifference(row.date, matched.date) : 0,
      });
      continue;
    }

    let bestCandidate: {
      transaction: ExpenseTransaction;
      confidence: ReconcileConfidence;
      score: number;
      reason: string;
      daysDiff: number;
    } | null = null;

    for (const t of activeTransactions) {
      if (usedTransactionIds.has(t.id)) continue;

      const evalResult = evaluateMatchCandidate(row, t);
      if (evalResult.confidence !== "none") {
        if (!bestCandidate || evalResult.score > bestCandidate.score) {
          bestCandidate = {
            transaction: t,
            confidence: evalResult.confidence,
            score: evalResult.score,
            reason: evalResult.reason,
            daysDiff: evalResult.daysDiff,
          };
        }
      }
    }

    if (bestCandidate && (bestCandidate.confidence === "exact" || bestCandidate.confidence === "high")) {
      usedTransactionIds.add(bestCandidate.transaction.id);
      reconciledCount++;
      candidates.push({
        csvRow: row,
        matchedTransaction: bestCandidate.transaction,
        confidence: bestCandidate.confidence,
        matchReason: bestCandidate.reason,
        daysDifference: bestCandidate.daysDiff,
      });
    } else if (bestCandidate && bestCandidate.confidence === "medium") {
      candidates.push({
        csvRow: row,
        matchedTransaction: bestCandidate.transaction,
        confidence: "medium",
        matchReason: bestCandidate.reason,
        daysDifference: bestCandidate.daysDiff,
      });
    } else {
      candidates.push({
        csvRow: row,
        matchedTransaction: undefined,
        confidence: "none",
        matchReason: "該当するArca支出が見つかりませんでした",
        daysDifference: 999,
      });
    }
  }

  const unmatchedCsvRows = candidates
    .filter((c) => !c.matchedTransaction || c.confidence === "none")
    .map((c) => c.csvRow);

  return {
    candidates,
    reconciledCount,
    unmatchedCsvRows,
  };
}
