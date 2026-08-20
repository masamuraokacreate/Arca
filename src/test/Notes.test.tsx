/**
 * src/test/Notes.test.tsx
 * Arca — Notes モジュール 単体 & 統合テスト
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MarkdownViewer } from "../components/notes/MarkdownViewer";
import { MarkdownGuideModal } from "../components/notes/MarkdownGuideModal";
import { NoteEditor } from "../components/notes/NoteEditor";
import { NoteToolbar } from "../components/notes/NoteToolbar";
import { ConfirmModal } from "../components/notes/ConfirmModal";
import {
  sanitizeFileName,
  generateMarkdownFileName,
  downloadMarkdownFile,
  extractTitleFromFileName,
  readMarkdownFile,
} from "../utils/markdownDownload";

// ─────────────────────────────────────────
// 1. markdownDownload / import ユーティリティのテスト
// ─────────────────────────────────────────

describe("markdownDownload ユーティリティ", () => {
  it("ファイル名の禁止文字（\\ / : * ? \" < > |）をアンダースコアにサニタイズする", () => {
    expect(sanitizeFileName('test/note:name*with?illegal"chars<here>|')).toBe("test_note_name_with_illegal_chars_here__");
    expect(sanitizeFileName("  通常タイトル  ")).toBe("通常タイトル");
    expect(sanitizeFileName("...")).toBe("");
  });

  it("タイトルがある場合はサニタイズされたタイトル.mdを生成する", () => {
    expect(generateMarkdownFileName("アイデアメモ")).toBe("アイデアメモ.md");
    expect(generateMarkdownFileName("2026/08/21 議事録")).toBe("2026_08_21 議事録.md");
  });

  it("タイトルが空の場合は arca_note_YYYYMMDD_HHmm.md 形式で生成する", () => {
    const fileName = generateMarkdownFileName("");
    expect(fileName).toMatch(/^arca_note_\d{8}_\d{4}\.md$/);
  });

  it("extractTitleFromFileName が拡張子を除去してタイトルを抽出する", () => {
    expect(extractTitleFromFileName("旅行計画.md")).toBe("旅行計画");
    expect(extractTitleFromFileName("memo.markdown")).toBe("memo");
    expect(extractTitleFromFileName("notes.txt")).toBe("notes");
  });

  it("readMarkdownFile が File オブジェクトからタイトルと本文を読み取る", async () => {
    const file = new File(["# テスト見出し\n本文内容です"], "プロジェクト設計.md", {
      type: "text/markdown",
    });
    const result = await readMarkdownFile(file);
    expect(result.title).toBe("プロジェクト設計");
    expect(result.content).toBe("# テスト見出し\n本文内容です");
  });

  it("downloadMarkdownFile が Blob URL を作成して anchor をクリックする", () => {
    const createObjectURLMock = vi.fn().mockReturnValue("blob:http://localhost/test-uuid");
    const revokeObjectURLMock = vi.fn();
    window.URL.createObjectURL = createObjectURLMock;
    window.URL.revokeObjectURL = revokeObjectURLMock;

    const clickMock = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      const el = originalCreateElement(tagName);
      if (tagName === "a") {
        el.click = clickMock;
      }
      return el;
    });

    const result = downloadMarkdownFile("テストノート", "# 本文コンテンツ");
    expect(result).toBe("テストノート.md");
    expect(createObjectURLMock).toHaveBeenCalled();
    expect(clickMock).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────
// 2. MarkdownViewer コンポーネントのテスト
// ─────────────────────────────────────────

describe("MarkdownViewer", () => {
  it("空のコンテンツの場合は空表示メッセージを表示する", () => {
    render(<MarkdownViewer content="" />);
    expect(screen.getByText(/このノートはまだ空です/)).toBeInTheDocument();
  });

  it("箇条書き（ul / li）と番号付きリスト（ol / li）が正しくレンダリングされる", () => {
    const markdown = `
- 箇条書きアイテム1
- 箇条書きアイテム2

1. 最初のステップ
2. 次のステップ
`;
    const { container } = render(<MarkdownViewer content={markdown} />);
    
    expect(screen.getByText("箇条書きアイテム1")).toBeInTheDocument();
    expect(screen.getByText("箇条書きアイテム2")).toBeInTheDocument();
    expect(screen.getByText("最初のステップ")).toBeInTheDocument();
    expect(screen.getByText("次のステップ")).toBeInTheDocument();

    const uls = container.querySelectorAll("ul");
    const ols = container.querySelectorAll("ol");
    expect(uls.length).toBeGreaterThanOrEqual(1);
    expect(ols.length).toBeGreaterThanOrEqual(1);
  });

  it("テーブル（GFM table）がレンダリングされる", () => {
    const tableMd = `
| 項目 | 内容 |
| :--- | :--- |
| 設計 | Apple HIG |
| 状態 | 完了 |
`;
    const { container } = render(<MarkdownViewer content={tableMd} />);
    expect(screen.getByText("項目")).toBeInTheDocument();
    expect(screen.getByText("内容")).toBeInTheDocument();
    expect(screen.getByText("Apple HIG")).toBeInTheDocument();
    expect(screen.getByText("完了")).toBeInTheDocument();

    const table = container.querySelector("table");
    expect(table).toBeInTheDocument();
  });

  it("コードブロックとコピーボタンが表示され、コピーできる", async () => {
    const codeMd = "```ts\nconst greeting = 'Hello Arca';\n```";
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock },
    });

    render(<MarkdownViewer content={codeMd} />);
    expect(screen.getByText("const greeting = 'Hello Arca';")).toBeInTheDocument();

    const copyBtn = screen.getByRole("button", { name: /コードをコピー/ });
    expect(copyBtn).toBeInTheDocument();

    await userEvent.click(copyBtn);
    expect(writeTextMock).toHaveBeenCalledWith("const greeting = 'Hello Arca';");
  });

  it("タスクリスト（チェックボックス）が表示され、クリックでトグルできる", async () => {
    const taskMd = "- [ ] タスクA\n- [x] タスクB";
    const handleContentChange = vi.fn();

    render(<MarkdownViewer content={taskMd} onContentChange={handleContentChange} />);
    
    expect(screen.getByText("タスクA")).toBeInTheDocument();
    expect(screen.getByText("タスクB")).toBeInTheDocument();

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0]).not.toBeChecked();
    expect(checkboxes[1]).toBeChecked();

    await userEvent.click(checkboxes[0]);
    expect(handleContentChange).toHaveBeenCalledWith(expect.stringContaining("- [x] タスクA"));
  });

  it("見出し（H1〜H3）と引用（blockquote）が正しくレンダリングされる", () => {
    const md = `
# 見出し1
## 見出し2
### 見出し3

> これは引用文です
`;
    const { container } = render(<MarkdownViewer content={md} />);
    expect(screen.getByRole("heading", { level: 1, name: "見出し1" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "見出し2" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "見出し3" })).toBeInTheDocument();

    const quote = container.querySelector("blockquote");
    expect(quote).toBeInTheDocument();
    expect(screen.getByText("これは引用文です")).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────
// 3. MarkdownGuideModal コンポーネントのテスト
// ─────────────────────────────────────────

describe("MarkdownGuideModal", () => {
  it("isOpen=false のときは何も描画されない", () => {
    const { container } = render(
      <MarkdownGuideModal isOpen={false} onClose={vi.fn()} onInsert={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("isOpen=true のときにガイドモーダルが表示され、構文をクリックすると onInsert と「挿入完了 ✓」が表示される", async () => {
    const handleInsert = vi.fn();
    const handleClose = vi.fn();

    render(
      <MarkdownGuideModal isOpen={true} onClose={handleClose} onInsert={handleInsert} />
    );

    expect(screen.getByText("Markdown 構文ガイド")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "基本の装飾" })).toBeInTheDocument();

    // 太字アイテムをクリック
    const boldItem = screen.getByText("太字");
    await userEvent.click(boldItem);
    expect(handleInsert).toHaveBeenCalledWith("**テキスト**");
    expect(screen.getByText("挿入完了 ✓")).toBeInTheDocument();

    // 閉じるボタン
    const closeBtn = screen.getByLabelText("ガイドを閉じる");
    await userEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalled();
  });

  it("検索バーで構文を絞り込める", async () => {
    render(
      <MarkdownGuideModal isOpen={true} onClose={vi.fn()} onInsert={vi.fn()} />
    );

    const searchInput = screen.getByPlaceholderText(/構文を検索/);
    await userEvent.type(searchInput, "テーブル");

    expect(screen.getByText("テーブル（表）")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 3, name: "基本の装飾" })).not.toBeInTheDocument();
  });
});

// ─────────────────────────────────────────
// 4. ConfirmModal コンポーネントのテスト
// ─────────────────────────────────────────

describe("ConfirmModal", () => {
  it("isOpen=false のときは描画されない", () => {
    const { container } = render(
      <ConfirmModal
        isOpen={false}
        title="削除しますか？"
        message="元に戻せません"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("isOpen=true のときにタイトル・本文・ボタンが表示され、確認・キャンセルが動作する", async () => {
    const handleConfirm = vi.fn();
    const handleCancel = vi.fn();

    const { rerender } = render(
      <ConfirmModal
        isOpen={true}
        title="ノートを削除しますか？"
        message="「テスト」をごみ箱に移動します"
        confirmLabel="削除する"
        cancelLabel="キャンセル"
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    );

    expect(screen.getByText("ノートを削除しますか？")).toBeInTheDocument();
    expect(screen.getByText("「テスト」をごみ箱に移動します")).toBeInTheDocument();

    // キャンセルボタン
    const cancelBtn = screen.getByText("キャンセル");
    await userEvent.click(cancelBtn);
    expect(handleCancel).toHaveBeenCalled();

    // 削除ボタン
    rerender(
      <ConfirmModal
        isOpen={true}
        title="ノートを削除しますか？"
        message="「テスト」をごみ箱に移動します"
        confirmLabel="削除する"
        cancelLabel="キャンセル"
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    );
    const confirmBtn = screen.getByText("削除する");
    await userEvent.click(confirmBtn);
    expect(handleConfirm).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────
// 5. NoteEditor コンポーネントのテスト
// ─────────────────────────────────────────

describe("NoteEditor", () => {
  it("テキストエリアに下部40vh余白スタイルが適用されている", () => {
    const handleChange = vi.fn();
    render(<NoteEditor content="テスト内容" onChange={handleChange} />);

    const textarea = screen.getByDisplayValue("テスト内容");
    expect(textarea).toBeInTheDocument();
    expect(textarea.style.padding).toContain("40vh");
  });

  it("テキスト入力で onChange が呼ばれる", async () => {
    const handleChange = vi.fn();
    render(<NoteEditor content="" onChange={handleChange} />);

    const textarea = screen.getByPlaceholderText(/Markdownで書き始める/);
    await userEvent.type(textarea, "# 見出しテキスト");

    expect(handleChange).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────
// 6. NoteToolbar コンポーネントのテスト
// ─────────────────────────────────────────

describe("NoteToolbar", () => {
  it("各ボタン（エクスポート・インポート・ガイド・全画面・目次・削除）がクリックされたときに適切なコールバックが実行される", async () => {
    const onModeChange = vi.fn();
    const onBack = vi.fn();
    const onExtract = vi.fn();
    const onDownloadMarkdown = vi.fn();
    const onImportMarkdown = vi.fn();
    const onOpenGuide = vi.fn();
    const onToggleFullWidth = vi.fn();
    const onToggleToc = vi.fn();
    const onDelete = vi.fn();

    render(
      <NoteToolbar
        mode="read"
        onModeChange={onModeChange}
        onBack={onBack}
        onExtract={onExtract}
        isExtracting={false}
        canExtract={true}
        onDownloadMarkdown={onDownloadMarkdown}
        onImportMarkdown={onImportMarkdown}
        onOpenGuide={onOpenGuide}
        isFullWidth={false}
        onToggleFullWidth={onToggleFullWidth}
        showToc={false}
        onToggleToc={onToggleToc}
        onDelete={onDelete}
      />
    );

    // 編集モード切り替え
    const editBtn = screen.getByTitle("編集モード");
    await userEvent.click(editBtn);
    expect(onModeChange).toHaveBeenCalledWith("edit");

    // エクスポート (↑)
    const downloadBtn = screen.getByTitle("Markdownファイル (.md) としてエクスポート");
    await userEvent.click(downloadBtn);
    expect(onDownloadMarkdown).toHaveBeenCalled();

    // インポート (↓)
    const importBtn = screen.getByTitle("Markdownファイル (.md / .txt) をインポート");
    await userEvent.click(importBtn);
    expect(onImportMarkdown).toHaveBeenCalled();

    // ガイド
    const guideBtn = screen.getByTitle("Markdown 構文ガイドを確認");
    await userEvent.click(guideBtn);
    expect(onOpenGuide).toHaveBeenCalled();

    // 全画面
    const fullWidthBtn = screen.getByTitle("全画面で表示");
    await userEvent.click(fullWidthBtn);
    expect(onToggleFullWidth).toHaveBeenCalled();

    // 目次
    const tocBtn = screen.getByTitle("目次を表示");
    await userEvent.click(tocBtn);
    expect(onToggleToc).toHaveBeenCalled();

    // 削除
    const deleteBtn = screen.getByTitle("このノートを削除");
    await userEvent.click(deleteBtn);
    expect(onDelete).toHaveBeenCalled();
  });
});
