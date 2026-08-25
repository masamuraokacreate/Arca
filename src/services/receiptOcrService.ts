/**
 * src/services/receiptOcrService.ts
 * Arca — Gemini Vision レシートOCR解析 ＆ 画像最適化サービス
 *
 * Sprint 10.5:
 * - クライアント側Canvas画像圧縮（長辺最大1600px, JPEG品質0.82）
 * - Gemini Multimodal Vision API による印字忠実なOCR抽出
 * - 外税（消費税）・値引きの独立品目化による親子決済合計の完全整合
 */

import {
  EXPENSE_CATEGORIES,
  PAYMENT_METHODS,
  type ExpenseCategory,
  type PaymentMethod,
  type ReceiptOcrResult,
} from "../types/finance";

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
const MODEL = "gemini-flash-lite-latest";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

/**
 * レシート画像をクライアント側でリサイズ・圧縮し、Base64文字列とDataURLを生成
 * @param file アップロード・撮影された画像ファイル
 * @param maxDimension 最大幅または高さ（px, デフォルト: 1600）
 * @param quality JPEG品質 (0.0〜1.0, デフォルト: 0.82)
 */
export async function compressReceiptImage(
  file: File,
  maxDimension = 1600,
  quality = 0.82
): Promise<{ base64: string; mimeType: string; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("選択されたファイルは画像ではありません"));
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // アスペクト比を維持して長辺を maxDimension に収める
        if (width > height) {
          if (width > maxDimension) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          }
        } else {
          if (height > maxDimension) {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvasコンテキストを取得できませんでした"));
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, width, height);

        const mimeType = "image/jpeg";
        const dataUrl = canvas.toDataURL(mimeType, quality);
        const base64 = dataUrl.replace(/^data:image\/[a-z]+;base64,/, "");

        resolve({ base64, mimeType, dataUrl });
      };

      img.onerror = () => reject(new Error("画像の読み込みに失敗しました"));
      img.src = e.target?.result as string;
    };

    reader.onerror = () => reject(new Error("ファイルの読み取りに失敗しました"));
    reader.readAsDataURL(file);
  });
}

const OCR_PROMPT = `
あなたは高精度な日本のレシートOCR解析エンジンです。
提供されたレシート画像から、印字されている文字・数値をそのまま忠実に読み取り、以下のJSON形式のみを出力してください。意訳・要約・商品名の改変は絶対に行わないでください。

【抽出ルール】
1. storeName: レシート最上部等に印字された店舗名・企業名（例: "イオン〇〇店", "セブン-イレブン"）。
2. date: レシート発行日・利用日を "YYYY-MM-DD" 形式で抽出（年が省略されている場合は印字の和暦や今年から推論）。
3. totalAmount: 最終支払合計金額（税込総額・請求額の整数値）。
4. paymentMethod: 支払方法の推定（"Oliveカード", "dカード", "イオンカード", "交通系IC", "PayPay", "現金", "その他" から選択。クレジットカード記載でブランド不明時は"Oliveカード"、PayPay記載時は"PayPay"、Suica/Pasmo/IC記載時は"交通系IC"、現金記載時は"現金"、不明時は"その他"）。
5. items: 印字されている品目を上から順に配列で抽出。
   - name: 印字された商品名そのまま（例: "ｺｸｳﾏ ｷﾑﾁ 300G", "明治 おいしい牛乳"）。
   - amount: その品目の小計・金額（整数値）。
   - category: "食費", "日用品", "交通費", "被服", "交際費", "娯楽費", "特別費", "通信費", "光熱費", "サブスク", "車両係", "その他" の中から最も適切なもの。
6. 【外税・値引きの重要ルール】:
   - 外税（「外税8%」「外税10%」「消費税」など、合計金額に含まれる税金行が別行として印字されている場合）は、品目リスト（items）の末尾に独立した品目として追加してください（name: "消費税" または "外税8%" など、amount: 税額、category: "食費" または "その他"）。
   - 値引き・割引（「値引」「割引」「クーポン」など）がある場合は、負の整数（例: amount: -50）として品目リストに追加してください。
   - これにより、itemsの全amountの合計が totalAmount と一致するようにしてください。

【出力JSONフォーマット】
{
  "storeName": "店舗名",
  "date": "YYYY-MM-DD",
  "totalAmount": 1234,
  "paymentMethod": "現金",
  "items": [
    { "name": "牛乳", "amount": 238, "category": "食費" },
    { "name": "値引き", "amount": -30, "category": "食費" },
    { "name": "外税8%", "amount": 16, "category": "食費" }
  ]
}
`.trim();

/**
 * Gemini Vision API を呼び出してレシート画像を構造化OCR解析する
 * @param base64Data Base64エンコードされた画像データ
 * @param mimeType 画像のMIMEタイプ (デフォルト: image/jpeg)
 */
export async function parseReceiptWithGemini(
  base64Data: string,
  mimeType = "image/jpeg"
): Promise<ReceiptOcrResult | null> {
  if (!API_KEY) {
    console.warn("[ReceiptOCR] VITE_GEMINI_API_KEY が設定されていません");
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000); // 20秒タイムアウト

  try {
    const res = await fetch(`${ENDPOINT}?key=${API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: base64Data,
                },
              },
              {
                text: OCR_PROMPT,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 2048,
          responseMimeType: "application/json",
        },
      }),
    });

    clearTimeout(timer);

    if (!res.ok) {
      const errText = await res.text().catch(() => "(no body)");
      console.warn(`[ReceiptOCR] API error ${res.status}:`, errText);
      return null;
    }

    const data = await res.json();
    const rawText: string | undefined =
      data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) return null;

    return sanitizeOcrResult(rawText);
  } catch (err) {
    clearTimeout(timer);
    console.warn("[ReceiptOCR] API呼び出しエラー:", err);
    return null;
  }
}

/**
 * 品目名から先頭の店舗固有分類コード（例: "13*", "01-", "8.", "10 "）や記号（"*", "・", "■" 等）を除去してクレンジング
 */
export function cleanItemName(rawName: string): string {
  if (!rawName) return "";
  return rawName
    // 先頭の数字＋記号（例: "13*", "01-", "8.", "10 " など）を除去
    .replace(/^[\d０-９]+[-*.\s・:]+/, "")
    // 先頭の単独記号（例: "*", "・", "■" など）を除去
    .replace(/^[-*.\s・:■※]+/, "")
    // 前後の不要な空白を除去
    .trim();
}

/**
 * Gemini の JSON 出力を安全にパース・正規化する
 */
export function sanitizeOcrResult(rawJsonText: string): ReceiptOcrResult | null {
  try {
    let clean = rawJsonText.trim();
    if (clean.startsWith("```")) {
      clean = clean.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const parsed = JSON.parse(clean);
    if (!parsed || typeof parsed !== "object") return null;

    // 店舗名
    const storeName = typeof parsed.storeName === "string" ? parsed.storeName.trim() : undefined;

    // 日付 (YYYY-MM-DD)
    let date = typeof parsed.date === "string" ? parsed.date.trim() : undefined;
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      // 正規化試行
      const m = date.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
      if (m) {
        date = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
      } else {
        date = new Date().toISOString().slice(0, 10);
      }
    }

    // 支払方法
    let paymentMethod: PaymentMethod = "現金";
    if (parsed.paymentMethod && PAYMENT_METHODS.includes(parsed.paymentMethod as PaymentMethod)) {
      paymentMethod = parsed.paymentMethod as PaymentMethod;
    }

    // 品目リスト
    const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
    const items = rawItems
      .filter((it: any) => it && typeof it === "object")
      .map((it: any) => {
        const rawName = String(it.name || "品目").trim();
        const name = cleanItemName(rawName) || rawName;
        const amount = typeof it.amount === "number" ? it.amount : parseInt(String(it.amount || 0), 10) || 0;
        let category: ExpenseCategory = "その他";
        if (it.category && EXPENSE_CATEGORIES.includes(it.category as ExpenseCategory)) {
          category = it.category as ExpenseCategory;
        } else if (name.includes("外税") || name.includes("消費税")) {
          category = "その他";
        } else {
          category = "食費";
        }
        return {
          name,
          amount,
          category,
          quantity: 1,
        };
      });

    // 支払総額
    let totalAmount = typeof parsed.totalAmount === "number" ? parsed.totalAmount : parseInt(String(parsed.totalAmount || 0), 10) || 0;
    if (totalAmount === 0 && items.length > 0) {
      totalAmount = items.reduce((sum: number, it: { amount: number }) => sum + it.amount, 0);
    }

    return {
      storeName,
      date,
      totalAmount,
      paymentMethod,
      items,
      rawText: rawJsonText,
    };
  } catch (err) {
    console.warn("[ReceiptOCR] JSONパース失敗:", err);
    return null;
  }
}
