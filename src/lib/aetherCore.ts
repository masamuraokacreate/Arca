/**
 * Aether Core — Gemini API クライアント
 *
 * 設計方針 (Rules.md 準拠):
 *   - UI 知識を持たない純粋関数のみを公開する
 *   - API キー未設定・エラー時は null / 空データを返し、呼び出し元のUIを壊さない
 *   - ユーザーの許可なくデータを書き換える処理は一切持たない
 */

import type { CalendarEvent, TaskItem, ListItem, ExtractedActionableItems } from "../types";

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;

// Gemini Flash-Lite Latest — 安定版エイリアス（軽量・低レイテンシ）
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
 * 複数アイテムのカテゴリを一括でスーパー動線カテゴリに分類・推論する。
 *
 * @param items 未分類のアイテム名リスト
 * @returns アイテム名をキー、カテゴリ名を値とするオブジェクト
 */
export async function categorizeItems(
  items: string[]
): Promise<Record<string, string>> {
  const validItems = items.filter((i) => i.trim().length > 0);
  if (!API_KEY || validItems.length === 0) return {};

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  const prompt = `あなたはスーパーマーケットの買い物最適化アシスタントです。
以下のアイテムリストについて、それぞれのアイテムが属するスーパーの売り場カテゴリを判定してください。

【許容カテゴリ（必ずこの6つのいずれかから選択）】
- 野菜・果物
- 肉・魚
- 乳製品・卵・調味料
- お惣菜・パン
- 冷凍食品
- 日用品・その他

【出力形式】
JSONオブジェクトのみを出力してください。キーは入力されたアイテム名、値は上記カテゴリ名です。
例:
{
  "玉ねぎ": "野菜・果物",
  "豚バラ肉": "肉・魚",
  "牛乳": "乳製品・卵・調味料",
  "食パン": "お惣菜・パン",
  "冷凍餃子": "冷凍食品",
  "洗剤": "日用品・その他"
}

アイテムリスト:
${JSON.stringify(validItems)}`;

  try {
    const res = await fetch(`${ENDPOINT}?key=${API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 1024,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!res.ok) {
      console.warn(`[Aether Core] Batch categorize error ${res.status}`);
      return {};
    }

    const data = await res.json();
    const rawText: string | undefined =
      data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) return {};

    const cleaned = rawText
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const parsed = JSON.parse(cleaned);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      const result: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === "string" && v.trim()) {
          result[k] = v.trim();
        }
      }
      return result;
    }
    return {};
  } catch (err) {
    console.warn("[Aether Core] Batch categorize failed:", err);
    return {};
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 現在の買い物リストから、買い忘れや一緒に買われやすい関連アイテムを最大3〜4件提案する。
 *
 * @param currentItems 現在リストにあるアイテム名一覧
 * @returns 提案アイテム名の配列
 */
export async function suggestRelatedItems(
  currentItems: string[]
): Promise<string[]> {
  const validItems = currentItems.filter((i) => i.trim().length > 0);
  if (!API_KEY || validItems.length === 0) return [];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);

  const prompt = `あなたは静かで気配りのできる生活OSのアシスタントです。
以下の現在の買い物リストを見て、作ろうとしている料理や生活シーンをインテリジェントに推測し、買い忘れそうな食材や一緒に必要になる関連アイテムを最大3〜4件提案してください。

【ルール】
- 既にリストにあるアイテムは提案に含めないこと。
- 日本語の一般的なアイテム名（1語）で出力すること。
- 出力は純粋なJSON文字列配列のみ（例: ["じゃがいも", "にんじん", "福神漬け"]）。

現在の買い物リスト:
${JSON.stringify(validItems)}`;

  try {
    const res = await fetch(`${ENDPOINT}?key=${API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 256,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!res.ok) return [];

    const data = await res.json();
    const rawText: string | undefined =
      data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) return [];

    const cleaned = rawText
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map((item) => item.trim())
        .slice(0, 4);
    }
    return [];
  } catch (err) {
    console.warn("[Aether Core] Suggest related items failed:", err);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 抽象的または大きなタスクから、具体的で実行可能な3〜5個のサブタスク（ステップ）を分解・生成する。
 *
 * @param taskTitle タスク名
 * @returns サブタスク文字列の配列
 */
export async function breakdownTask(
  taskTitle: string
): Promise<string[]> {
  if (!API_KEY || !taskTitle.trim()) return [];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);

  const prompt = `あなたは個人の知的OS「Arca」のタスク分解アシスタントです。
以下のタスクを実行するために必要な、具体的で行動しやすい3〜5個のサブタスク（ステップ）を時系列または論理的な順序で生成してください。

【ルール】
- 各サブタスクは簡潔で実行可能な行動の表現（例: "書類をスキャンして保存する"）にする。
- 出力は純粋なJSON文字列配列のみ（例: ["ステップ1", "ステップ2", "ステップ3"]）。
- 前後の解説やMarkdown記法は含めない。

タスク: ${taskTitle}`;

  try {
    const res = await fetch(`${ENDPOINT}?key=${API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 512,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!res.ok) return [];

    const data = await res.json();
    const rawText: string | undefined =
      data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) return [];

    const cleaned = rawText
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map((item) => item.trim())
        .slice(0, 5);
    }
    return [];
  } catch (err) {
    console.warn("[Aether Core] Task breakdown failed:", err);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * ノート本文から買い物リスト・タスク候補を横断抽出・分類する。
 *
 * @param noteContent ノート本文 (Markdown またはプレーンテキスト)
 * @returns 抽出されたアイテム群、または抽出不可・エラー時は null
 */
export async function extractActionableItems(
  noteContent: string
): Promise<ExtractedActionableItems | null> {
  if (!API_KEY || !noteContent.trim()) return null;

  const controller = new AbortController();
  // 10秒タイムアウト
  const timer = setTimeout(() => controller.abort(), 10000);

  const prompt = `あなたは静寂で知的な個人OSのアシスタント「Aether Core」です。
以下のノート本文（レシピ、旅行計画、買い物メモ、議事録、日記、ToDoメモ等）を読み解き、以下の2種類のアクション候補をインテリジェントに抽出・分類してください。

【抽出ルール】
1. lists: 買い物リストに追加すべき食材・調味料・日用品・物品などのアイテム
   - title: 物品・食材名（例: "トマト缶", "牛乳", "パスポートケース"）
   - category: 分類カテゴリ（例: "野菜", "肉・魚", "調味料", "乳製品", "日用品", "飲料", "その他"）
2. tasks: 実行すべきToDo・具体的なアクション・予定
   - title: 行動を表すタスク名（例: "新幹線のチケットを予約する", "ホテルにチェックイン時間を連絡する"）
   - priority: 優先度（"low" | "medium" | "high"）
   - dueDate: 本文から推測または明示されている日付があれば "YYYY-MM-DD" 形式。なければ省略

【出力形式】
必ず以下の構造の純粋なJSONオブジェクトのみを出力してください。Markdownのコードフェンス(\`\`\`json)や前後の説明文は出力しないでください。
{
  "lists": [
    { "title": "...", "category": "..." }
  ],
  "tasks": [
    { "title": "...", "priority": "medium", "dueDate": "YYYY-MM-DD" }
  ]
}
※ 該当項目がない場合はそれぞれ空配列 [] にしてください。

ノート本文:
${noteContent}`;

  try {
    const res = await fetch(`${ENDPOINT}?key=${API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 1024,
          topP: 0.9,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "(no body)");
      console.warn(`[Aether Core] Extract API error ${res.status}:`, errText);
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

    const lists = Array.isArray(parsed?.lists)
      ? parsed.lists
          .filter((item: unknown): item is { title: string; category?: string } => {
            return typeof item === "object" && item !== null && typeof (item as { title?: unknown }).title === "string" && (item as { title: string }).title.trim().length > 0;
          })
          .map((item: { title: string; category?: string }) => ({
            title: item.title.trim(),
            category: typeof item.category === "string" && item.category.trim() ? item.category.trim() : undefined,
          }))
      : [];

    const tasks = Array.isArray(parsed?.tasks)
      ? parsed.tasks
          .filter((item: unknown): item is { title: string; priority?: unknown; dueDate?: unknown } => {
            return typeof item === "object" && item !== null && typeof (item as { title?: unknown }).title === "string" && (item as { title: string }).title.trim().length > 0;
          })
          .map((item: { title: string; priority?: unknown; dueDate?: unknown }) => {
            const validPriority: "low" | "medium" | "high" =
              item.priority === "high" || item.priority === "low" ? item.priority : "medium";
            const validDueDate =
              typeof item.dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.dueDate)
                ? item.dueDate
                : undefined;
            return {
              title: item.title.trim(),
              priority: validPriority,
              dueDate: validDueDate,
            };
          })
      : [];

    return { lists, tasks };
  } catch (err) {
    console.warn("[Aether Core] Extract exception:", err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 現在のデータ状況から Aether Briefing（静的なフォールバック用サジェスト文）を生成する。
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

/**
 * Gemini API を用いて、今日の一日をサポートする知的な日次ブリーフィング（60〜100文字程度）を動的に生成する。
 *
 * @returns 生成されたテキスト、または失敗時は null
 */
export async function generateDailyBriefing(params: {
  events: { title: string; startTime?: string; note?: string }[];
  tasks: { title: string; dueDate?: string | null; priority?: string }[];
  listsCount: number;
}): Promise<string | null> {
  if (!API_KEY) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);

  const eventsSummary =
    params.events.length > 0
      ? params.events.map((e) => `${e.startTime ? e.startTime + " " : ""}${e.title}`).join("、")
      : "なし";
  const tasksSummary =
    params.tasks.length > 0
      ? params.tasks.map((t) => `${t.title}${t.priority === "high" ? "（優先）" : ""}`).join("、")
      : "なし";

  const systemInstruction = `あなたは洗練された知的なパーソナルアシスタント（静かな執事）です。
ユーザーの一日の予定・未完了タスク・買い物リストの件数から、今日一日の行動を静かにサポートする簡潔で品のあるメッセージを日本語で作成してください。

【制約】
- 長さは60〜100文字程度（1〜2文）
- 過剰な絵文字や装飾、大げさな挨拶は避け、端的に行動の優先順位や準備事項を提示する
- マークダウンや説明は含めず、メッセージ本文のみを出力する`;

  const prompt = `【今日の情報】
- 予定: ${eventsSummary}
- タスク: ${tasksSummary}
- 買い物リスト: ${params.listsCount}件の未完了アイテム`;

  try {
    const res = await fetch(`${ENDPOINT}?key=${API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 120,
        },
      }),
    });

    if (!res.ok) {
      console.warn(`[Aether Core] Daily Briefing API error ${res.status}`);
      return null;
    }

    const data = await res.json();
    const raw: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) return null;

    return raw.trim().replace(/^["「』]|["」』]$/g, "");
  } catch (err) {
    console.warn("[Aether Core] Daily Briefing exception:", err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 入力された自然言語からタスクのタイトル・期日・優先度を抽出・JSON変換する。
 *
 * 例:
 *  "明日15時に書類提出" → { title: "書類提出", dueDate: "2026-08-20", priority: "medium" }
 *  "来週金曜までに買い物 #高" → { title: "買い物", dueDate: "2026-08-28", priority: "high" }
 */
export async function parseTaskInput(
  text: string,
  baseDate?: string
): Promise<{ title: string; dueDate?: string; priority?: "low" | "medium" | "high" } | null> {
  const trimmed = text.trim();
  if (!API_KEY || !trimmed || trimmed.length < 2) return null;

  const todayStr = baseDate || new Date().toISOString().split("T")[0];
  const now = new Date();
  const dayOfWeek = ["日", "月", "火", "水", "木", "金", "土"][now.getDay()];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);

  const systemInstruction = `あなたはタスク管理の自然言語パーサーです。
ユーザーの自然言語入力から、純粋なタスク名（title）、期限日（dueDate: YYYY-MM-DD形式）、優先度（priority: low | medium | high）を抽出してください。

基準日: ${todayStr}（${dayOfWeek}曜日）

【抽出ルール】
1. "明日", "明後日", "来週月曜", "今週金曜", "8/25", "8月25日", "今日" などの相対的/絶対的な日付表現を YYYY-MM-DD に変換する。
2. 時刻や日付表現、タグ記号（#高、#重要、#急ぎ等）を title から取り除き、クリーンなタスク名にする。
3. "急ぎ", "重要", "優先", "#高", "至急" などが含まれる場合は priority: "high"、"あとで", "低", "#低" などは priority: "low"、それ以外は "medium"。
4. 日付表現が見つからない場合は dueDate は省略（null または未定義）にする。
5. 出力は必ず以下の JSON 形式のみで行う（説明不要）:
{
  "title": string,
  "dueDate": string | null,
  "priority": "low" | "medium" | "high"
}`;

  try {
    const res = await fetch(`${ENDPOINT}?key=${API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ parts: [{ text: `入力: "${trimmed}"` }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 100,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!res.ok) return null;

    const data = await res.json();
    const raw: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.title !== "string" || !parsed.title.trim()) return null;

    const priority: "low" | "medium" | "high" =
      parsed.priority === "high" || parsed.priority === "low" ? parsed.priority : "medium";
    const dueDate =
      typeof parsed.dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.dueDate)
        ? parsed.dueDate
        : undefined;

    return {
      title: parsed.title.trim(),
      dueDate,
      priority,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

