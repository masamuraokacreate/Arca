/**
 * Aether Core — Gemini API クライアント
 *
 * 設計方針 (Rules.md 準拠):
 *   - UI 知識を持たない純粋関数のみを公開する
 *   - API キー未設定・エラー時は null を返し、呼び出し元のUIを壊さない
 *   - ユーザーの許可なくデータを書き換える処理は一切持たない
 */

import type { CalendarEvent, TaskItem, ListItem } from "../types";

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;

// Gemini Flash-Lite Latest — 安定版エイリアス（軽量・低レイテンシ）
// models.listで確認済みの利用可能モデル: models/gemini-flash-lite-latest
const MODEL   = "gemini-flash-lite-latest";
const ENDPOINT =
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const PROMPT_TEMPLATE = (item: string) => `
あなたは買い物リストのカテゴリ分類アシスタントです。
以下の買い物アイテムに最も適したカテゴリを、日本語で1語だけ答えてください。

例:
- にんじん → 野菜
- 牛乳 → 乳製品
- シャンプー → 日用品
- 鶏もも肉 → 肉・魚
- りんご → 果物
- トイレットペーパー → 日用品
- コーヒー → 飲料
- チーズ → 乳製品

アイテム: ${item}

カテゴリ（1語のみ、説明不要）:`.trim();

/**
 * 買い物アイテム名からカテゴリを推論する。
 *
 * @returns カテゴリ文字列（例: "野菜"）、または推論不可・エラー時は null
 */
export async function suggestCategory(item: string): Promise<string | null> {
  if (!API_KEY || !item.trim()) return null;

  const controller = new AbortController();
  // 5秒タイムアウト（UXを損なわないための上限）
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(`${ENDPOINT}?key=${API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: PROMPT_TEMPLATE(item) }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 16,
          topP: 0.8,
        },
      }),
    });

    if (!res.ok) {
      // デバッグ用: エラーの詳細をコンソールに出力（UXは壊さない）
      const errText = await res.text().catch(() => "(no body)");
      console.warn(`[Aether Core] API error ${res.status}:`, errText);
      return null;
    }

    const data = await res.json();
    const raw: string | undefined =
      data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!raw) return null;

    // 余分な空白・改行・句読点を除去して1語に正規化
    const normalized = raw.trim().replace(/[。、\n\r]/g, "").slice(0, 20);
    return normalized || null;
  } catch {
    // AbortError（タイムアウト）含むすべてのエラーを静かに握りつぶす
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 現在のデータ状況から Aether Briefing（静的なサジェスト文）を生成する。
 * 将来的にはここを LLM で動的に生成する設計。
 */
export function generateBriefing(
  events: CalendarEvent[],
  tasks: TaskItem[],
  lists: ListItem[]
): string {
  const eventCount = events.length;
  const taskCount = tasks.length;
  const listCount = lists.length;

  if (eventCount === 0 && taskCount === 0 && listCount === 0) {
    return "今日は予定もタスクもありません。心静かな一日をお過ごしください。";
  }

  const parts = [];
  if (eventCount > 0) parts.push(`${eventCount}件の予定`);
  if (taskCount > 0) parts.push(`${taskCount}件のタスク`);
  
  let msg = parts.length > 0 ? `本日は${parts.join("と")}があります。` : "";

  if (listCount > 0) {
    msg += msg ? `買い物リストにも${listCount}件の未購入アイテムがあります。` : `買い物リストに${listCount}件の未購入アイテムがあります。`;
  } else if (taskCount > 0) {
    msg += "一つずつ、自分のペースで進めていきましょう。";
  } else if (eventCount > 0) {
    msg += "次の予定に備えて、少し余白の時間を。";
  }

  return msg || "今日も穏やかな一日を。";
}

