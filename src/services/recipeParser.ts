/**
 * src/services/recipeParser.ts
 * Arca — Aether Recipe Parser (Gemini レシピ自動抽出エンジン)
 *
 * 料理URLやレシピテキストから、料理名・分量・材料リスト・手順・タグを構造化データとして自動抽出する。
 *
 * URL入力時のフロー:
 *   1. CORSプロキシ (allorigins.win → corsproxy.io の順でフォールバック) 経由でHTMLを取得
 *   2. DOMParser でページ本文を整理（script/style 除去、JSON-LD・OGPメタ・本文テキストを抽出）
 *   3. 抽出したページ本文テキストを Gemini API に渡して構造化レシピデータを生成
 *
 * テキスト直接入力時のフロー:
 *   入力テキストをそのまま Gemini API に渡す。
 *
 * エラー時:
 *   プロキシ取得失敗 → PROXY_FETCH_ERROR_MESSAGE メッセージで Error を throw（UIで表示すること）
 *   Gemini API エラー → null を返す
 */

export interface ParsedRecipeResult {
  title: string;
  servings: string;
  ingredients: Array<{ name: string; amount: string }>;
  steps: string[];
  tags: string[];
  notes?: string;
}

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
const MODEL = "gemini-flash-lite-latest";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

/** CORSプロキシ候補（順番にフォールバック） */
const CORS_PROXIES = [
  (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
];

/** プロキシ取得失敗時にUIへ表示するエラーメッセージ */
export const PROXY_FETCH_ERROR_MESSAGE =
  "Webページの内容を取得できませんでした。材料と手順のテキストを直接貼り付けてお試しください";

// ─── HTML → 本文テキスト抽出 ───────────────────────────────────────────────

/**
 * JSON-LD 構造化データからレシピ関連情報を抽出する
 */
function extractJsonLd(doc: Document): string {
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
  const parts: string[] = [];

  scripts.forEach((el) => {
    try {
      const json = JSON.parse(el.textContent ?? "") as Record<string, unknown>;
      const items: Record<string, unknown>[] = Array.isArray(json) ? json : [json];
      for (const item of items) {
        // Recipe スキーマ (@type === "Recipe") のみ抽出
        const type = item["@type"];
        if (
          type === "Recipe" ||
          (Array.isArray(type) && (type as string[]).includes("Recipe"))
        ) {
          parts.push(JSON.stringify(item, null, 2));
        }
      }
    } catch {
      // 解析失敗は無視
    }
  });

  return parts.join("\n\n");
}

/**
 * OGP / meta タグから補助情報を抽出する
 */
function extractMeta(doc: Document): string {
  const parts: string[] = [];

  const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute("content");
  if (ogTitle) parts.push(`タイトル: ${ogTitle}`);

  const ogDesc = doc.querySelector('meta[property="og:description"]')?.getAttribute("content");
  const metaDesc = doc.querySelector('meta[name="description"]')?.getAttribute("content");
  const desc = ogDesc ?? metaDesc;
  if (desc) parts.push(`概要: ${desc}`);

  return parts.join("\n");
}

/**
 * HTMLドキュメントから不要タグを除去し、本文テキストを整理して返す。
 *
 * 優先順位:
 *   1. JSON-LD 構造化データ (Recipe スキーマ)
 *   2. <main> / <article> 内の本文
 *   3. <body> 全体の本文
 */
function extractTextFromHtml(html: string): string {
  let doc: Document;
  try {
    const parser = new DOMParser();
    doc = parser.parseFromString(html, "text/html");
  } catch {
    // DOMParser が使えない環境では正規表現でタグを除去
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s{3,}/g, "\n\n")
      .trim()
      .slice(0, 12000);
  }

  // 1. JSON-LD を最優先で使う
  const jsonLdText = extractJsonLd(doc);
  if (jsonLdText.length > 100) {
    const metaText = extractMeta(doc);
    return [metaText, jsonLdText].filter(Boolean).join("\n\n").slice(0, 12000);
  }

  // 2. <main> / <article> から本文を抽出
  const contentEl =
    doc.querySelector("main") ??
    doc.querySelector("article") ??
    doc.querySelector('[role="main"]') ??
    doc.body;

  if (!contentEl) {
    return html.replace(/<[^>]+>/g, " ").trim().slice(0, 12000);
  }

  // 不要タグを除去
  contentEl
    .querySelectorAll("script, style, noscript, iframe, nav, footer, header, aside, [aria-hidden='true']")
    .forEach((el) => el.remove());

  const bodyText = contentEl.textContent ?? "";
  const metaText = extractMeta(doc);

  return [metaText, bodyText]
    .filter(Boolean)
    .join("\n\n")
    .replace(/[ \t]{2,}/g, " ")   // 連続スペースを圧縮
    .replace(/\n{3,}/g, "\n\n")    // 連続改行を圧縮
    .trim()
    .slice(0, 12000);             // Gemini のコンテキスト上限に合わせてトリミング
}

// ─── CORSプロキシ経由でHTMLを取得 ─────────────────────────────────────────

/**
 * 指定URLのHTMLをCORSプロキシ経由で取得し、本文テキストとして返す。
 * 全プロキシが失敗した場合は PROXY_FETCH_ERROR_MESSAGE メッセージで Error を throw する。
 *
 * @param url 取得対象URL
 * @param signal AbortSignal（タイムアウト制御用）
 */
export async function fetchPageText(url: string, signal?: AbortSignal): Promise<string> {
  let lastError: unknown;

  for (const buildProxy of CORS_PROXIES) {
    const proxyUrl = buildProxy(url);
    try {
      const res = await fetch(proxyUrl, { signal });

      if (!res.ok) {
        lastError = new Error(`HTTP ${res.status}`);
        console.warn(`[Aether Recipe Parser] プロキシ取得失敗 (${res.status}): ${proxyUrl}`);
        continue;
      }

      const html = await res.text();

      // 実際のHTML本文かどうかを簡易チェック
      if (!html || html.trim().length < 50) {
        lastError = new Error("空レスポンス");
        continue;
      }

      return extractTextFromHtml(html);
    } catch (err) {
      if ((err as Error)?.name === "AbortError") throw err;
      lastError = err;
      console.warn(`[Aether Recipe Parser] プロキシエラー: ${proxyUrl}`, err);
    }
  }

  console.error("[Aether Recipe Parser] 全プロキシ失敗:", lastError);
  throw new Error(PROXY_FETCH_ERROR_MESSAGE);
}

// ─── Gemini API 呼び出し ────────────────────────────────────────────────────

/**
 * Gemini API を用いて、URLまたはレシピ本文テキストから構造化レシピデータを抽出する。
 *
 * @param input レシピURLまたはレシピのテキスト内容
 * @returns 構造化されたレシピデータ。APIキー未設定・入力空は null。
 *          プロキシ取得失敗時は PROXY_FETCH_ERROR_MESSAGE で Error を throw する。
 */
export async function parseRecipeWithGemini(
  input: string
): Promise<ParsedRecipeResult | null> {
  const text = input.trim();
  if (!API_KEY || !text) {
    return null;
  }

  const controller = new AbortController();
  // 最大30秒待機（プロキシ + Gemini の合計時間に対応）
  const timer = setTimeout(() => controller.abort(), 30000);

  const isUrl = /^https?:\/\//i.test(text);

  try {
    // ── URLの場合: CORSプロキシ経由でWebページ本文を取得 ──
    let recipeContent: string;
    if (isUrl) {
      // fetchPageText は失敗時に Error を throw する
      recipeContent = await fetchPageText(text, controller.signal);
    } else {
      recipeContent = text;
    }

    const prompt = `
あなたはプロの料理知見アシスタントです。
以下の${isUrl ? "Webページから抽出したレシピ本文テキスト" : "料理レシピテキスト"}から、料理名、目安分量、材料と分量のペア、つくり方（調理手順）、適切な料理タグ（和食、洋食、定番、時短など）を抽出し、指定のJSON形式で出力してください。

【厳格なルール】
1. 必ず指定のJSONスキーマに準拠してください。
2. 材料名は調味料や具材を1品ずつ分割し、分量（例: "300g", "大さじ1", "少々"）とペアにしてください。
3. つくり方（手順）はステップごとの文字列配列にしてください。
4. 料理タグは短く分かりやすいものを2〜5個付与してください（例: ["和食", "主菜", "定番"]）。
5. 余分なマークダウン（\`\`\`json 等）や説明文は一切含めず、純粋なJSONのみを返してください。
6. 以下のテキストに含まれる情報のみを使用し、情報がない項目は空配列・空文字列としてください。想像で補完しないでください。

【出力JSONスキーマ】
{
  "title": "料理名",
  "servings": "目安分量（例: 2人前）",
  "ingredients": [
    { "name": "材料名", "amount": "分量" }
  ],
  "steps": [
    "手順1のテキスト",
    "手順2のテキスト"
  ],
  "tags": ["タグ1", "タグ2"],
  "notes": "調理のコツやポイント（あれば）"
}

【入力レシピ情報】
${recipeContent}
`.trim();

    const res = await fetch(`${ENDPOINT}?key=${API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 2048,
          topP: 0.9,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "(no body)");
      console.warn(`[Aether Recipe Parser] API error ${res.status}:`, errText);
      return null;
    }

    const data = await res.json();
    const rawText: string | undefined =
      data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) return null;

    // コードブロック等のトリミング
    const cleaned = rawText
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const parsed = JSON.parse(cleaned);

    // バリデーション & サニタイズ
    const title = typeof parsed?.title === "string" && parsed.title.trim()
      ? parsed.title.trim()
      : "無題のレシピ";

    const servings = typeof parsed?.servings === "string" && parsed.servings.trim()
      ? parsed.servings.trim()
      : "1人前";

    const ingredients = Array.isArray(parsed?.ingredients)
      ? parsed.ingredients
          .filter(
            (item: unknown): item is { name?: unknown; amount?: unknown } =>
              typeof item === "object" && item !== null
          )
          .map((item: { name?: unknown; amount?: unknown }) => ({
            name: typeof item.name === "string" ? item.name.trim() : "",
            amount: typeof item.amount === "string" ? item.amount.trim() : "",
          }))
          .filter((item: { name: string; amount: string }) => item.name.length > 0)
      : [];

    const steps = Array.isArray(parsed?.steps)
      ? parsed.steps
          .filter((step: unknown): step is string => typeof step === "string")
          .map((step: string) => step.trim())
          .filter((step: string) => step.length > 0)
      : [];

    const tags = Array.isArray(parsed?.tags)
      ? parsed.tags
          .filter((tag: unknown): tag is string => typeof tag === "string")
          .map((tag: string) => tag.trim())
          .filter((tag: string) => tag.length > 0)
      : [];

    const notes = typeof parsed?.notes === "string" && parsed.notes.trim()
      ? parsed.notes.trim()
      : undefined;

    return {
      title,
      servings,
      ingredients,
      steps,
      tags,
      notes,
    };
  } catch (err) {
    // プロキシエラーは呼び出し元へ再 throw（UIでエラーメッセージを表示する）
    if (err instanceof Error && err.message === PROXY_FETCH_ERROR_MESSAGE) {
      throw err;
    }
    // AbortError も再 throw
    if ((err as Error)?.name === "AbortError") {
      throw err;
    }
    console.warn("[Aether Recipe Parser] Exception:", err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
