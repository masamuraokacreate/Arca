/**
 * src/services/pmTaskAiService.ts
 * Arca — PM タスク手順 AI 自動要約・丸番号生成サービス (Gemini API)
 *
 * 説明文・作業マニュアル・メモテキスト等から、PM保全用のチェックリスト手順を丸番号（①, ②, ③...）付きで自動抽出・生成する。
 */

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
const MODEL = "gemini-flash-lite-latest";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

/** 丸数字定数配列 */
const CIRCLED_NUMBERS = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩", "⑪", "⑫", "⑬", "⑭", "⑮", "⑯", "⑰", "⑱", "⑲", "⑳"];

/**
 * 自由入力されたマニュアル・メモテキストから、PM作業用チェックリスト（丸番号付き）を自動生成する
 * @param inputText 作業説明・マニュアル・メモ等のテキスト
 * @returns 丸番号付きの各手順文字列の配列 (例: ["① パネルを開けてフィルターを取り外す", ...])
 */
export async function generatePMTasksWithAI(inputText: string): Promise<string[]> {
  const trimmed = inputText.trim();
  if (!trimmed) return [];

  if (!API_KEY) {
    throw new Error("Gemini APIキーが設定されていません。.envのVITE_GEMINI_API_KEYを確認してください。");
  }

  const prompt = `
あなたは定期保全・清掃・機器メンテナンス・家事タスク（PM）の作業手順設計専門家です。
以下の入力テキスト（作業マニュアル、メモ、説明文、雑多な指示など）を読み解き、
実際に作業を進める際にチェックリストとして1つずつ完了していけるような、具体的かつ簡潔な手順リスト（3〜8ステップ程度）に要約・分割してください。

【厳格な要件】
1. 手順の各行の先頭には、必ず丸数字（①、②、③、④、⑤、⑥、⑦、⑧、⑨、⑩）を付けてください。
2. 各手順は1つの明確な作業アクションとし、無駄な修飾語を省いて簡潔明瞭にしてください。
3. 挨拶や導入文、説明文は一切含めず、純粋なJSONオブジェクトのみを出力してください。

【出力フォーマット】
{
  "tasks": [
    "① パネルを開けてフィルターを取り外す",
    "② 掃除機でホコリを吸い取り水洗いする",
    "③ 日陰で完全に乾燥させて元に戻す"
  ]
}

【入力テキスト】
${trimmed.slice(0, 4000)}
`.trim();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  try {
    const res = await fetch(`${ENDPOINT}?key=${API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 1024,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!res.ok) {
      throw new Error(`Gemini API通信エラー (HTTP ${res.status})`);
    }

    const data = await res.json();
    const rawText: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) return [];

    const cleaned = rawText
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed?.tasks)) {
      const items = parsed.tasks
        .filter((t: unknown): t is string => typeof t === "string" && t.trim().length > 0)
        .map((t: string, idx: number) => {
          let text = t.trim();
          // もし丸数字が抜けている場合は補完する
          const startsWithCircled = /^[\u2460-\u2473\u3251-\u325f]/.test(text);
          if (!startsWithCircled) {
            const circle = CIRCLED_NUMBERS[idx] || `(${idx + 1})`;
            text = `${circle} ${text.replace(/^[\d\s.\-、・)\]]+/, "").trim()}`;
          }
          return text;
        });
      return items;
    }
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}
