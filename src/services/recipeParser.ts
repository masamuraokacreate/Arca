/**
 * src/services/recipeParser.ts
 * Arca — Aether Recipe Parser (Gemini レシピ自動抽出エンジン)
 *
 * 料理URLやレシピテキストから、料理名・分量・材料リスト・手順・タグを構造化データとして自動抽出する
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

/**
 * Gemini API を用いて、URLまたはレシピ本文テキストから構造化レシピデータを抽出する
 *
 * @param input レシピURLまたはレシピのテキスト内容
 * @returns 構造化されたレシピデータ、失敗時またはAPIキー未設定時は null
 */
export async function parseRecipeWithGemini(
  input: string
): Promise<ParsedRecipeResult | null> {
  const text = input.trim();
  if (!API_KEY || !text) {
    return null;
  }

  const controller = new AbortController();
  // 最大15秒待機
  const timer = setTimeout(() => controller.abort(), 15000);

  const isUrl = /^https?:\/\//i.test(text);

  const prompt = `
あなたはプロの料理知見アシスタントです。
以下の${isUrl ? "料理レシピURLまたはレシピ情報" : "料理レシピテキスト"}から、料理名、目安分量、材料と分量のペア、つくり方（調理手順）、適切な料理タグ（和食、洋食、定番、時短など）を抽出し、指定のJSON形式で出力してください。

【厳格なルール】
1. 必ず指定のJSONスキーマに準拠してください。
2. 材料名は調味料や具材を1品ずつ分割し、分量（例: "300g", "大さじ1", "少々"）とペアにしてください。
3. つくり方（手順）はステップごとの文字列配列にしてください。
4. 料理タグは短く分かりやすいものを2〜5個付与してください（例: ["和食", "主菜", "定番"]）。
5. 余分なマークダウン（\`\`\`json 等）や説明文は一切含めず、純粋なJSONのみを返してください。

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
${text}
`.trim();

  try {
    const res = await fetch(`${ENDPOINT}?key=${API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
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
    console.warn("[Aether Recipe Parser] Exception:", err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
