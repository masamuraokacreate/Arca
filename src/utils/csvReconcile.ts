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
  ReconcilePreviewItem,
  ReconcilePreviewResult,
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
 * コア店舗名抽出（付加語句や店舗名サフィックスの除去）
 * 例:
 * "ヤオコー MARKETPLACE" -> "ヤオコー"
 * "セブン-イレブン 渋谷店" -> "セブンイレブン"
 * "イオンモール 幕張新都心店" -> "イオン"
 */
export function extractCoreStoreName(title: string): string {
  if (!title) return "";
  let str = title.trim();

  // 括弧内の注記等を除去
  str = str.replace(/（[^）]+）|\([^)]+\)/g, "");

  // スペース区切りの店舗名サフィックスを除去（例: 「セブン-イレブン 渋谷店」->「セブン-イレブン」）
  str = str.replace(/[\s\u3000]+[^\s\u3000]{1,10}(?:店|支店|号店)$/g, "");

  // 一般的な付加語句・業態表記を除去（大文字小文字無視）
  str = str.replace(/(marketplace|マーケットプレイス|スーパーマーケット|スーパー|ストア|モール|ショッピングセンター|ショッピング|ショップ)/gi, "");

  let norm = normalizeJapaneseText(str);

  // 末尾に残った単独サフィックスを除去
  norm = norm.replace(/(\d+号店|\d+店|支店|店舗|店)$/g, "").trim();

  return norm;
}

/**
 * 2つの店舗名が実質的に同一または関連店舗とみなせるか柔軟に判定する
 */
export function isStoreNameSimilar(a: string, b: string): boolean {
  if (!a || !b) return false;
  const normA = normalizeJapaneseText(a);
  const normB = normalizeJapaneseText(b);
  if (normA === normB) return true;
  if (normA.includes(normB) || normB.includes(normA)) return true;

  const coreA = extractCoreStoreName(a);
  const coreB = extractCoreStoreName(b);
  if (coreA && coreB) {
    if (coreA === coreB) return true;
    if (coreA.includes(coreB) || coreB.includes(coreA)) return true;
  }

  return calculateTitleSimilarity(a, b) >= 0.45;
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

  const coreA = extractCoreStoreName(a);
  const coreB = extractCoreStoreName(b);
  if (coreA && coreB) {
    if (coreA === coreB) return 0.95;
    if (coreA.includes(coreB) || coreB.includes(coreA)) return 0.85;
  }

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
 * CSV バッファ (ArrayBuffer / Uint8Array) のエンコーディングを自動判定し、文字列として安全にデコードする
 * UTF-8 および 日本の各社クレジットカードCSVで標準的な Shift-JIS (windows-31j / CP932) に完全対応
 */
export function decodeCsvBuffer(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  // 1. まず UTF-8 としてデコードを試みる (fatal: true でバイト不整合を検出)
  try {
    const utf8Decoder = new TextDecoder("utf-8", { fatal: true });
    const text = utf8Decoder.decode(bytes);
    if (!text.includes("\uFFFD")) {
      return text.replace(/^\uFEFF/, ""); // BOM 除去
    }
  } catch {
    // UTF-8 デコード例外発生時は Shift-JIS にフォールバック
  }

  // 2. Shift-JIS (windows-31j / CP932) としてデコード
  try {
    const sjisDecoder = new TextDecoder("shift-jis", { fatal: false });
    const text = sjisDecoder.decode(bytes);
    return text.replace(/^\uFEFF/, "");
  } catch {
    try {
      const fallbackDecoder = new TextDecoder("windows-31j");
      return fallbackDecoder.decode(bytes).replace(/^\uFEFF/, "");
    } catch {
      const defaultDecoder = new TextDecoder();
      return defaultDecoder.decode(bytes).replace(/^\uFEFF/, "");
    }
  }
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
 * CSV行ごとに固有のフィンガープリントを生成する
 * 形式: `${paymentMethod}_${date}_${cleanTitle}_${amount}_row${rowIndex}`
 */
export function generateCsvRowFingerprint(
  paymentMethod: PaymentMethod,
  date: string,
  title: string,
  amount: number,
  rowIndex: number
): string {
  const cleanTitle = title.replace(/[\s\u3000]+/g, "");
  return `${paymentMethod}_${date}_${cleanTitle}_${amount}_row${rowIndex}`;
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
      const rowIndex = resultRows.length;
      const fp = generateCsvRowFingerprint(detectedMethod, date, title, amount, rowIndex);
      resultRows.push({
        rowId: `csv-row-${r}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        date,
        title,
        amount,
        paymentMethod: detectedMethod,
        fingerprint: fp,
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

/**
 * CSV行リストと既存取引リストから、二重取込防止 ＆ 1対1ペアリング消費モデルに基づく照合プレビュー結果を生成する
 */
export function buildReconcilePreview(
  csvRows: CreditCardCsvRow[],
  transactions: ExpenseTransaction[],
  targetPaymentMethod?: PaymentMethod
): ReconcilePreviewResult {
  const activeTransactions = transactions.filter((t) => !t.isDeleted);
  
  // 1. 既に確定・紐付け済みの CSV 行フィンガープリント / matchedCsvRowId のセットを構築
  const committedFingerprints = new Set<string>();
  for (const t of activeTransactions) {
    if (t.isReconciled) {
      if (t.matchedCsvRowId) committedFingerprints.add(t.matchedCsvRowId);
      if (t.csvRowFingerprint) committedFingerprints.add(t.csvRowFingerprint);
    }
  }

  // 2. 未突合の既存取引プールを作成（1対1ペアリング消費用）
  const unreconciledPool: ExpenseTransaction[] = activeTransactions.filter(
    (t) => !t.isReconciled
  );

  const previewItems: ReconcilePreviewItem[] = [];
  const affectedMonthsSet = new Set<string>();
  let matchedCount = 0;
  let createdCount = 0;
  let skippedCount = 0;

  const defaultMethod = targetPaymentMethod || (csvRows[0]?.paymentMethod) || "Oliveカード";

  for (let i = 0; i < csvRows.length; i++) {
    const row = csvRows[i];
    const fp = row.fingerprint || generateCsvRowFingerprint(row.paymentMethod || defaultMethod, row.date, row.title, row.amount, i);
    const rowWithFp = { ...row, fingerprint: fp, paymentMethod: row.paymentMethod || defaultMethod };

    if (row.date && row.date.length >= 7) {
      affectedMonthsSet.add(row.date.slice(0, 7));
    }

    // A. 既に確定済みのフィンガープリントが存在する場合 -> スキップ (二重取込防止)
    if (committedFingerprints.has(fp)) {
      previewItems.push({
        csvRow: rowWithFp,
        action: "skip",
        matchReason: "既に確定・登録済みです（二重取込防止）",
      });
      skippedCount++;
      continue;
    }

    // B. 未突合プールから最善のペアリング候補を探索
    let bestMatchIndex = -1;
    let bestScore = -1;
    let bestEval: { confidence: ReconcileConfidence; score: number; reason: string; daysDiff: number } | null = null;

    for (let p = 0; p < unreconciledPool.length; p++) {
      const candidateTx = unreconciledPool[p];
      const evalResult = evaluateMatchCandidate(rowWithFp, candidateTx);

      // 完全一致(exact)または高信頼度(high)または中信頼度(medium)
      if (evalResult.confidence !== "none" && evalResult.score > bestScore) {
        bestScore = evalResult.score;
        bestMatchIndex = p;
        bestEval = evalResult;
      }
    }

    if (bestMatchIndex !== -1 && bestEval && (bestEval.confidence === "exact" || bestEval.confidence === "high" || bestEval.confidence === "medium")) {
      const matchedTx = unreconciledPool[bestMatchIndex];
      // ★ 1対1ペアリング消費：プールから除外
      unreconciledPool.splice(bestMatchIndex, 1);

      previewItems.push({
        csvRow: rowWithFp,
        action: "match",
        matchedTransaction: matchedTx,
        confidence: bestEval.confidence,
        matchReason: bestEval.reason,
      });
      matchedCount++;
    } else {
      // C. 一致する未突合レコードがない場合 -> 新規作成
      previewItems.push({
        csvRow: rowWithFp,
        action: "create",
        matchReason: "新規支出として登録",
      });
      createdCount++;
    }
  }

  return {
    items: previewItems,
    matchedCount,
    createdCount,
    skippedCount,
    totalCsvRows: csvRows.length,
    paymentMethod: defaultMethod,
    affectedMonths: Array.from(affectedMonthsSet).sort(),
  };
}
