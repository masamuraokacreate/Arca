/**
 * src/utils/markdownDownload.ts
 * Arca — Markdownファイルのサニタイズ & ダウンロードユーティリティ
 *
 * 設計思想 (Core/Rules.md):
 * - 「アプリは作り直せても、10年分のデータは失わない」
 * - 安全でポータブルなファイル名とエンコーディングでローカルに保存
 */

/**
 * ファイル名に使用できないOS禁止文字をサニタイズ
 * 対象: \ / : * ? " < > | および 制御文字
 */
export function sanitizeFileName(name: string): string {
  // 禁止文字をアンダースコアに置換し、制御文字を除去
  const sanitized = name
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim();

  // 空文字またはドットのみの場合は空文字を返す
  return sanitized.replace(/^\.+$/, "");
}

/**
 * ノートタイトルと現在日時から適切な .md ファイル名を生成
 */
export function generateMarkdownFileName(title?: string): string {
  const trimmed = title?.trim() || "";
  const sanitized = sanitizeFileName(trimmed);

  if (sanitized.length > 0) {
    return `${sanitized}.md`;
  }

  // タイトル未設定時のフォールバック: arca_note_YYYYMMDD_HHmm.md
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");

  return `arca_note_${yyyy}${mm}${dd}_${hh}${min}.md`;
}

/**
 * ノートのタイトルとコンテンツから .md ファイルを生成し、ブラウザ上でダウンロード実行
 * @returns ダウンロードしたファイル名
 */
export function downloadMarkdownFile(title: string, content: string): string {
  const fileName = generateMarkdownFileName(title);

  // UTF-8 BOM付き Blob または標準 UTF-8 Blob
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();

  setTimeout(() => {
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, 150);

  return fileName;
}

/**
 * ファイル名からタイトルを抽出（拡張子 .md, .markdown, .txt を除去）
 */
export function extractTitleFromFileName(fileName: string): string {
  return fileName.replace(/\.(md|markdown|txt)$/i, "").trim();
}

/**
 * 読み込んだMarkdownファイルの内容をパースし、タイトルと本文を取得
 */
export async function readMarkdownFile(file: File): Promise<{ title: string; content: string }> {
  const text = await file.text();
  const title = extractTitleFromFileName(file.name);
  return {
    title,
    content: text,
  };
}

