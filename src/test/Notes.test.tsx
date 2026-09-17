/**
 * src/test/Notes.test.tsx
 * Arca — Notes モジュール 単体 & 統合テスト
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MarkdownViewer } from "../components/notes/MarkdownViewer";
import { MarkdownGuideModal } from "../components/notes/MarkdownGuideModal";
import { NoteEditor } from "../components/notes/NoteEditor";
import { NoteToolbar } from "../components/notes/NoteToolbar";
import { ConfirmModal } from "../components/notes/ConfirmModal";
import { NoteBreadcrumbs } from "../components/notes/NoteBreadcrumbs";
import { MoveNoteModal } from "../components/notes/MoveNoteModal";
import type { NoteItem } from "../types";
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

  it("1回の改行（remark-breaks）で閲覧モードでも改行（br）される", () => {
    const breakMd = "1行目のテキスト\n2行目のテキスト";
    const { container } = render(<MarkdownViewer content={breakMd} />);
    const br = container.querySelector("br");
    expect(br).toBeInTheDocument();
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
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextMock },
      configurable: true,
      writable: true,
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

    expect(screen.getByText("構文ガイド")).toBeInTheDocument();
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
    await userEvent.type(searchInput, "引用");

    expect(screen.getByText("引用")).toBeInTheDocument();
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
  it("NoteEditor が Tiptap インラインエディタとして正常にレンダリングされる", () => {
    const handleChange = vi.fn();
    const { container } = render(<NoteEditor content="テスト内容" onChange={handleChange} />);

    const editorEl = container.querySelector(".tiptap.ProseMirror");
    expect(editorEl).toBeInTheDocument();
    expect(editorEl).toHaveAttribute("contenteditable", "true");
    expect(editorEl).toHaveTextContent("テスト内容");
  });

  it("見出し Markdown（# 見出し）が H1 タグとしてリアルタイム描画される", () => {
    const handleChange = vi.fn();
    const { container } = render(<NoteEditor content="# 見出しテキスト" onChange={handleChange} />);

    const h1El = container.querySelector("h1");
    expect(h1El).toBeInTheDocument();
    expect(h1El).toHaveTextContent("見出しテキスト");
  });

  it("区切り線（水平線）Markdown が hr タグとしてインライン描画される", () => {
    const handleChange = vi.fn();
    const { container } = render(<NoteEditor content="---" onChange={handleChange} />);

    const hrEl = container.querySelector("hr");
    expect(hrEl).toBeInTheDocument();
  });

  it("日本語IME入力時（compositionstart ➔ update ➔ compositionend）に安全にイベントが処理される", () => {
    const handleChange = vi.fn();
    const { container } = render(<NoteEditor content="" onChange={handleChange} />);
    const editorEl = container.querySelector(".tiptap.ProseMirror")!;

    fireEvent.compositionStart(editorEl);
    fireEvent.compositionUpdate(editorEl, { data: "わーくすぺーす" });
    fireEvent.compositionEnd(editorEl, { data: "ワークスペース" });

    expect(editorEl).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────
// 6. NoteToolbar コンポーネントのテスト
// ─────────────────────────────────────────

describe("NoteToolbar", () => {
  it("各ボタン（画像・エクスポート・インポート・ガイド・全画面・目次・削除）がクリックされたときに適切なコールバックが実行される", async () => {
    const onBack = vi.fn();
    const onInsertImage = vi.fn();
    const onExtract = vi.fn();
    const onDownloadMarkdown = vi.fn();
    const onImportMarkdown = vi.fn();
    const onOpenGuide = vi.fn();
    const onToggleFullWidth = vi.fn();
    const onToggleToc = vi.fn();
    const onDelete = vi.fn();

    render(
      <NoteToolbar
        onBack={onBack}
        onInsertImage={onInsertImage}
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

    // 画像ボタン
    const imageBtn = screen.getByTitle("画像を挿入（貼り付け・ファイル選択）");
    await userEvent.click(imageBtn);
    expect(onInsertImage).toHaveBeenCalled();

    // エクスポート (↑)
    const downloadBtn = screen.getByTitle("Markdownファイル (.md) としてエクスポート");
    await userEvent.click(downloadBtn);
    expect(onDownloadMarkdown).toHaveBeenCalled();

    // インポート (↓)
    const importBtn = screen.getByTitle("Markdownファイル (.md / .txt) をインポート");
    await userEvent.click(importBtn);
    expect(onImportMarkdown).toHaveBeenCalled();

    // ガイド
    const guideBtn = screen.getByTitle("構文ガイドを確認");
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

  it("MarkdownViewer が attachment:img_id トークンを attachments マップから解決してレンダリングする", () => {
    const attachments = {
      img_test_123: "data:image/webp;base64,UklGRmYAAABXRUJQVlA4WAoAAAAQAAAAAQAA",
    };
    const content = "![テスト画像|medium](attachment:img_test_123)";
    const { container } = render(
      <MarkdownViewer content={content} attachments={attachments} />
    );

    const img = container.querySelector("img");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", attachments.img_test_123);
    expect(img).toHaveAttribute("alt", "テスト画像");
  });

  it("デバッグロガーはコンソール出力を行わない安全な no-op である", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const { isNotesDebug, logNoteEdit, logNoteImage, logNoteIME } = await import("../utils/debugLogger");
    expect(isNotesDebug()).toBe(false);

    logNoteEdit(100, "testing");
    logNoteImage("img_123", "50 KB", "image/webp");
    logNoteIME(true, "テスト");

    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("NoteToolbar でソースモード（Markdown生文）切替ボタンが動作する", async () => {
    const onToggleSourceMode = vi.fn();
    render(
      <NoteToolbar
        onBack={vi.fn()}
        onExtract={vi.fn()}
        isExtracting={false}
        canExtract={true}
        onDownloadMarkdown={vi.fn()}
        onOpenGuide={vi.fn()}
        isFullWidth={false}
        onToggleFullWidth={vi.fn()}
        showToc={false}
        onToggleToc={vi.fn()}
        onDelete={vi.fn()}
        isSourceMode={false}
        onToggleSourceMode={onToggleSourceMode}
      />
    );

    const sourceBtn = screen.getByTitle(/テキストモード/);
    expect(sourceBtn).toBeInTheDocument();
    await userEvent.click(sourceBtn);
    expect(onToggleSourceMode).toHaveBeenCalled();
  });

  it("NoteEditor で isSourceMode=true のときに生の Markdown テキストエリアが表示される", async () => {
    const handleChange = vi.fn();
    const { container } = render(
      <NoteEditor
        content={"# タイトル\n\n本文テキスト"}
        onChange={handleChange}
        isSourceMode={true}
      />
    );

    expect(screen.getByText("Markdown ソース編集モード")).toBeInTheDocument();
    const textarea = container.querySelector("textarea");
    expect(textarea).toBeInTheDocument();
    expect(textarea).toHaveValue("# タイトル\n\n本文テキスト");

    await userEvent.type(textarea!, "追記");
    expect(handleChange).toHaveBeenCalled();
  });

  it("ごみ箱モーダルで「完全に削除」および「ごみ箱を空にする」が動作する", async () => {
    const { onSnapshot, deleteDoc } = await import("firebase/firestore");
    const Notes = (await import("../components/Notes")).default;

    (onSnapshot as any).mockImplementation((_q: any, callback: any) => {
      callback({
        forEach: (fn: any) => {
          fn({
            id: "del-1",
            data: () => ({
              title: "ごみ箱のノート1",
              content: "内容1",
              isDeleted: true,
            }),
          });
          fn({
            id: "del-2",
            data: () => ({
              title: "ごみ箱のノート2",
              content: "内容2",
              isDeleted: true,
            }),
          });
        },
      });
      return vi.fn();
    });

    localStorage.setItem("arca_notes_active_space", "memo");
    try {
      render(<Notes />);

      // ごみ箱ボタンをクリック
      const trashBtn = screen.getByRole("button", { name: "ごみ箱" });
      await userEvent.click(trashBtn);

      // ごみ箱モーダルが開く
      expect(screen.getByRole("heading", { name: "ごみ箱" })).toBeInTheDocument();
      expect(screen.getByText("ごみ箱のノート1")).toBeInTheDocument();

      // 完全に削除ボタンをクリック
      const deleteBtns = screen.getAllByRole("button", { name: "完全に削除" });
      await userEvent.click(deleteBtns[0]);
      expect(deleteDoc).toHaveBeenCalled();

      // ごみ箱を空にするボタンをクリック
      const emptyTrashBtn = screen.getByRole("button", { name: "ごみ箱を空にする" });
      await userEvent.click(emptyTrashBtn);
      expect(deleteDoc).toHaveBeenCalled();
    } finally {
      localStorage.clear();
    }
  });
});

// ─────────────────────────────────────────
// 7. NoteBreadcrumbs コンポーネントのテスト
// ─────────────────────────────────────────

describe("NoteBreadcrumbs", () => {
  it("空のパンくず配列の場合は何も描画しない", () => {
    const { container } = render(
      <NoteBreadcrumbs breadcrumbs={[]} onSelectBreadcrumb={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("ルート階層のみの場合は「Notes」が表示され、クリックできない（カレントページ）", () => {
    render(
      <NoteBreadcrumbs
        breadcrumbs={[{ id: null, title: "Notes" }]}
        onSelectBreadcrumb={vi.fn()}
      />
    );
    const current = screen.getByText("Notes");
    expect(current).toBeInTheDocument();
    expect(current.getAttribute("aria-current")).toBe("page");
  });

  it("階層がある場合に親ノートボタンと現在地が表示され、クリックで onSelectBreadcrumb が呼ばれる", async () => {
    const handleSelect = vi.fn();
    render(
      <NoteBreadcrumbs
        breadcrumbs={[
          { id: null, title: "Notes" },
          { id: "parent-1", title: "親ノート" },
          { id: "child-1", title: "子ノート" },
        ]}
        onSelectBreadcrumb={handleSelect}
      />
    );

    expect(screen.getByRole("button", { name: "Notes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "親ノート" })).toBeInTheDocument();
    expect(screen.getByText("子ノート")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "親ノート" }));
    expect(handleSelect).toHaveBeenCalledWith("parent-1");

    await userEvent.click(screen.getByRole("button", { name: "Notes" }));
    expect(handleSelect).toHaveBeenCalledWith(null);
  });
});

// ─────────────────────────────────────────
// 8. Notes 階層化・ハブ＆カード（Parent-Child Hub）統合テスト
// ─────────────────────────────────────────

describe("Notes 階層化・ハブ＆カード（Parent-Child Hub）統合テスト", () => {
  it("トップ一覧でルートノートのみが表示され、子ノート件数バッジ（📁 N件）が表示される", async () => {
    const { onSnapshot } = await import("firebase/firestore");
    const Notes = (await import("../components/Notes")).default;

    (onSnapshot as any).mockImplementation((_q: any, callback: any) => {
      callback({
        forEach: (fn: any) => {
          // 親ノート
          fn({
            id: "hub-1",
            data: () => ({
              title: "プロジェクトハブ",
              content: "ハブの概要",
              tags: ["仕事"],
              parentId: null,
              isDeleted: false,
            }),
          });
          // 子ノート1
          fn({
            id: "sub-1",
            data: () => ({
              title: "サブノートA",
              content: "サブAの内容",
              tags: [],
              parentId: "hub-1",
              isDeleted: false,
            }),
          });
          // 子ノート2
          fn({
            id: "sub-2",
            data: () => ({
              title: "サブノートB",
              content: "サブBの内容",
              tags: [],
              parentId: "hub-1",
              isDeleted: false,
            }),
          });
          // ルートノート（子なし）
          fn({
            id: "solo-1",
            data: () => ({
              title: "単独ノート",
              content: "サブなし",
              tags: [],
              parentId: null,
              isDeleted: false,
            }),
          });
        },
      });
      return vi.fn();
    });

    const { container } = render(<Notes />);
    const sidebar = container.querySelector("aside")!;

    // ルートノートが表示される（サイドバー内）
    expect(within(sidebar).getByText("プロジェクトハブ")).toBeInTheDocument();
    expect(within(sidebar).getByText("単独ノート")).toBeInTheDocument();
    // 子ノートはツリー展開前には表示されない
    expect(within(sidebar).queryByText("サブノートA")).not.toBeInTheDocument();
    expect(within(sidebar).queryByText("サブノートB")).not.toBeInTheDocument();

    // 展開ボタンをクリックすると子ノートが表示される
    const expandBtns = within(sidebar).getAllByRole("button", { name: "展開する" });
    const visibleExpandBtn = expandBtns.find((b) => !b.classList.contains("pointer-events-none")) || expandBtns[0];
    await userEvent.click(visibleExpandBtn);
    expect(within(sidebar).getByText("サブノートA")).toBeInTheDocument();
    expect(within(sidebar).getByText("サブノートB")).toBeInTheDocument();
  });

  it("親ノートを開くとパンくずとサブノート一覧が表示され、子ノート作成ができる", async () => {
    const { onSnapshot, addDoc } = await import("firebase/firestore");
    const Notes = (await import("../components/Notes")).default;

    (onSnapshot as any).mockImplementation((_q: any, callback: any) => {
      callback({
        forEach: (fn: any) => {
          fn({
            id: "hub-1",
            data: () => ({
              title: "プロジェクトハブ",
              content: "ハブの本文",
              tags: [],
              parentId: null,
              isDeleted: false,
            }),
          });
          fn({
            id: "sub-1",
            data: () => ({
              title: "サブノートA",
              content: "サブAの本文",
              tags: [],
              parentId: "hub-1",
              isDeleted: false,
            }),
          });
        },
      });
      return vi.fn();
    });

    render(<Notes initialNoteId="hub-1" />);

    // パンくずからPagesが削除され、親ページが先頭に表示されている
    expect(screen.queryByText("Pages")).toBeNull();
    expect(screen.getByDisplayValue("プロジェクトハブ")).toBeInTheDocument();
    expect(screen.getAllByTitle("プロジェクトハブ")[0]).toBeInTheDocument(); // パンくずのtitle属性

    // 「＋ 子ページ」ボタンを押すと parentId: "hub-1" で addDoc が呼ばれる
    const createChildPageBtns = screen.getAllByRole("button", { name: /子ページ/ });
    await userEvent.click(createChildPageBtns[0]);

    expect(addDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        parentId: "hub-1",
        isDeleted: false,
      })
    );
  });

  it("Notion風インライン子ページボタン: 本文中の [タイトル](note:childId) が FileText アイコン付きインラインボタンとしてレンダリングされる", async () => {
    const { MarkdownViewer } = await import("../components/notes/MarkdownViewer");
    const onSelectNote = vi.fn();
    render(
      <MarkdownViewer
        content={"親ノートの本文です。\n\n[子ページリンク](note:sub-child-1)\n\n続きの本文"}
        onSelectNote={onSelectNote}
      />
    );

    const childLinkBtn = screen.getByRole("button", { name: /子ページリンク/ });
    expect(childLinkBtn).toBeInTheDocument();
    await userEvent.click(childLinkBtn);
    expect(onSelectNote).toHaveBeenCalledWith("sub-child-1");
  });

  it("エディタのスラッシュコマンドに /page（子ページ作成・挿入）が含まれている", async () => {
    const { SLASH_COMMANDS } = await import("../components/notes/NoteEditor");
    const pageCommand = SLASH_COMMANDS.find((cmd) => cmd.id === "page");
    expect(pageCommand).toBeDefined();
    expect(pageCommand?.label).toBe("子ページ");
  });

  it("親ノート削除時にサブノートの警告ダイアログが表示され、親＋子ノートが一括論理削除＆Undoされる", async () => {
    const { onSnapshot, updateDoc } = await import("firebase/firestore");
    (updateDoc as any).mockClear();
    const Notes = (await import("../components/Notes")).default;

    (onSnapshot as any).mockImplementation((_q: any, callback: any) => {
      callback({
        forEach: (fn: any) => {
          fn({
            id: "hub-1",
            data: () => ({
              title: "親ノート",
              content: "本文",
              tags: [],
              parentId: null,
              isDeleted: false,
            }),
          });
          fn({
            id: "sub-1",
            data: () => ({
              title: "子ノート1",
              content: "子1本文",
              tags: [],
              parentId: "hub-1",
              isDeleted: false,
            }),
          });
          fn({
            id: "sub-2",
            data: () => ({
              title: "子ノート2",
              content: "子2本文",
              tags: [],
              parentId: "hub-1",
              isDeleted: false,
            }),
          });
        },
      });
      return vi.fn();
    });

    render(<Notes initialNoteId="hub-1" />);

    // ツールバーの削除ボタンをクリック
    const deleteBtn = screen.getByTitle("このノートを削除");
    await userEvent.click(deleteBtn);

    // カスケード削除の警告ダイアログが表示される
    expect(screen.getByText("ノートとサブノートをごみ箱に移動しますか？")).toBeInTheDocument();
    expect(screen.getByText(/2件のサブノートが含まれています/)).toBeInTheDocument();

    // 削除を実行
    const confirmBtn = screen.getByRole("button", { name: "削除する" });
    await userEvent.click(confirmBtn);

    // 親ノートおよび子ノート2件（計3件）が updateDoc で isDeleted: true になる
    expect(updateDoc).toHaveBeenCalledTimes(3);

    // Undoトーストが表示される
    expect(screen.getByText(/サブノート 2件をごみ箱に移動しました/)).toBeInTheDocument();

    // Undoボタンをクリックして一括復元
    const undoBtn = screen.getByRole("button", { name: "元に戻す" });
    await userEvent.click(undoBtn);

    // 復元処理（isDeleted: false）が3件に対して実行される
    expect(updateDoc).toHaveBeenCalledTimes(6);
  });

  // ─────────────────────────────────────────
  // 9. 親ノート移動モーダル（MoveNoteModal）単体テスト
  // ─────────────────────────────────────────
  describe("MoveNoteModal コンポーネント", () => {
    const mockNotes: NoteItem[] = [
      {
        id: "target-1",
        title: "移動対象ノート",
        content: "内容",
        tags: [],
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z",
        parentId: null,
      },
      {
        id: "child-of-target",
        title: "移動対象の子ノート",
        content: "内容",
        tags: [],
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z",
        parentId: "target-1",
      },
      {
        id: "other-parent",
        title: "別の親ノート",
        content: "内容",
        tags: [],
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z",
        parentId: null,
      },
    ];

    it("階層ツリーとトップ階層の選択肢を正しく表示する", () => {
      render(
        <MoveNoteModal
          targetNote={mockNotes[0]}
          allNotes={mockNotes}
          isOpen={true}
          onClose={vi.fn()}
          onMove={vi.fn()}
        />
      );

      expect(screen.getByText("ノートの移動先を選択")).toBeInTheDocument();
      expect(screen.getByText("トップ階層（All Notes）")).toBeInTheDocument();
      expect(screen.getByText("別の親ノート")).toBeInTheDocument();
      expect(screen.getByText("現在の場所")).toBeInTheDocument();
    });

    it("循環参照となる自身および子ノートは disabled になる", () => {
      render(
        <MoveNoteModal
          targetNote={mockNotes[0]}
          allNotes={mockNotes}
          isOpen={true}
          onClose={vi.fn()}
          onMove={vi.fn()}
        />
      );

      // 移動対象自身と配下の子ノートが無効化されていることを確認
      expect(screen.getByText(/移動対象のノート自身/)).toBeInTheDocument();
      expect(screen.getByText(/循環参照防止/)).toBeInTheDocument();
    });

    it("移動先を選択して確定ボタンを押すと onMove が正しい引数で呼ばれる", async () => {
      const onMoveMock = vi.fn();
      const onCloseMock = vi.fn();

      render(
        <MoveNoteModal
          targetNote={mockNotes[0]}
          allNotes={mockNotes}
          isOpen={true}
          onClose={onCloseMock}
          onMove={onMoveMock}
        />
      );

      // 「別の親ノート」をクリック
      const targetParentOption = screen.getByText("別の親ノート");
      await userEvent.click(targetParentOption);

      // 移動確定ボタンをクリック
      const moveBtn = screen.getByRole("button", { name: "移動する" });
      await userEvent.click(moveBtn);

      expect(onMoveMock).toHaveBeenCalledWith("target-1", "other-parent");
      expect(onCloseMock).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────
  // 10. 画像装飾（MarkdownViewer / NoteImage）テスト
  // ─────────────────────────────────────────
  describe("画像カスタムレンダラー（NoteImage）", () => {
    it("小・中・大のサイズ切り替えボタンを表示し、クリックで Markdown 本文が更新される", async () => {
      const onContentChangeMock = vi.fn();
      const initialMarkdown = "本文テキスト\n\n![サンプル画像|medium](https://example.com/img.png)\n\n続きのテキスト";

      render(
        <MarkdownViewer
          content={initialMarkdown}
          onContentChange={onContentChangeMock}
        />
      );

      // 画像とサイズ切り替えピルが表示されている
      const img = screen.getByAltText("サンプル画像");
      expect(img).toBeInTheDocument();

      const smallBtn = screen.getByRole("button", { name: "小" });
      await userEvent.click(smallBtn);

      expect(onContentChangeMock).toHaveBeenCalledWith(
        expect.stringContaining("![サンプル画像|small](https://example.com/img.png)")
      );
    });

    it("画像クリックで Lightbox モーダルが開き、拡大表示される", async () => {
      const markdown = "![拡大テスト|medium](https://example.com/photo.png)";
      render(<MarkdownViewer content={markdown} />);

      const img = screen.getByAltText("拡大テスト");
      await userEvent.click(img);

      // Lightbox 拡大表示が開く
      expect(screen.getByRole("dialog")).toBeInTheDocument();

      // 閉じるボタンまたはダイアログ外クリックで閉じる
      const closeBtn = screen.getByLabelText("閉じる");
      await userEvent.click(closeBtn);

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  // ─────────────────────────────────────────
  // 11. NoteEditor Tiptap リッチ構造テスト
  // ─────────────────────────────────────────
  // ─────────────────────────────────────────
  // 11. NoteEditor Tiptap リッチ構造テスト
  // ─────────────────────────────────────────
  describe("NoteEditor Tiptap リッチ構造テスト", () => {
    it("番号付きリストが ol / li として正しく描画される", () => {
      const onChangeMock = vi.fn();
      const { container } = render(
        <NoteEditor
          content={"1. 第一項目\n\n2. 第二項目"}
          onChange={onChangeMock}
        />
      );

      const ol = container.querySelector("ol");
      expect(ol).toBeInTheDocument();
      const items = container.querySelectorAll("ol li");
      expect(items.length).toBe(2);
      expect(items[0]).toHaveTextContent("第一項目");
      expect(items[1]).toHaveTextContent("第二項目");
    });

    it("箇条書きリストが ul / li として正しく描画される", () => {
      const onChangeMock = vi.fn();
      const { container } = render(
        <NoteEditor
          content={"- 項目A\n\n- 項目B"}
          onChange={onChangeMock}
        />
      );

      const ul = container.querySelector("ul");
      expect(ul).toBeInTheDocument();
      const items = container.querySelectorAll("ul li");
      expect(items.length).toBe(2);
      expect(items[0]).toHaveTextContent("項目A");
      expect(items[1]).toHaveTextContent("項目B");
    });

    it("コードブロックが pre / code として正しく描画される", () => {
      const onChangeMock = vi.fn();
      const { container } = render(
        <NoteEditor
          content={"```\nconst a = 1;\n```"}
          onChange={onChangeMock}
        />
      );

      const pre = container.querySelector("pre");
      expect(pre).toBeInTheDocument();
      expect(pre).toHaveTextContent("const a = 1;");
    });

    it("normalizeMarkdown で HTML エンティティや Markdown エスケープ文字が正常に正規化される", async () => {
      const { normalizeMarkdown } = await import("../components/notes/NoteEditor");

      // 1. 特殊文字のエスケープ解除
      expect(normalizeMarkdown("これは \\*太字\\* と \\_斜体\\_ です")).toBe(
        "これは *太字* と _斜体_ です"
      );

      // 2. HTML エンティティの解除
      expect(normalizeMarkdown("&lt;div&gt; &amp; テキスト")).toBe(
        "<div> & テキスト"
      );

      // 3. 画像URL内のエスケープ解除
      expect(
        normalizeMarkdown("![画像](https://firebasestorage.googleapis.com/notes\\_images/123/img\\_test.webp)")
      ).toBe("![画像](https://firebasestorage.googleapis.com/notes_images/123/img_test.webp)");
    });

    it("SLASH_COMMANDS に主要ブロック（見出し、リスト、チェックリスト、画像、コード等）が定義されている", async () => {
      const { SLASH_COMMANDS } = await import("../components/notes/NoteEditor");
      const ids = SLASH_COMMANDS.map((c) => c.id);

      expect(ids).toContain("h1");
      expect(ids).toContain("h2");
      expect(ids).toContain("h3");
      expect(ids).toContain("bullet");
      expect(ids).toContain("ordered");
      expect(ids).toContain("todo");
      expect(ids).toContain("image");
      expect(ids).toContain("quote");
      expect(ids).toContain("code");
      expect(ids).toContain("divider");
      expect(ids).not.toContain("table");
    });
  });

  // ─────────────────────────────────────────
  // 17. メモスペース ツールバーアクションテスト
  // ─────────────────────────────────────────
  describe("メモスペース ツールバーアクション", () => {
    it("メモスペースのアクションボタン（新しいメモ、ごみ箱、インポート）が正しく配置・表示されている", async () => {
      const Notes = (await import("../components/Notes")).default;
      localStorage.setItem("arca_notes_active_space", "memo");
      try {
        render(<Notes />);

        const newBtn = screen.getByRole("button", { name: /新しいメモ/ });
        const trashBtn = screen.getByRole("button", { name: "ごみ箱" });
        const importBtn = screen.getByRole("button", { name: "インポート" });

        expect(newBtn).toBeInTheDocument();
        expect(trashBtn).toBeInTheDocument();
        expect(importBtn).toBeInTheDocument();
      } finally {
        localStorage.clear();
      }
    });
  });

  // ─────────────────────────────────────────
  // 18. ノート（Pages）グリッド撤廃 ＆ エクスプローラー風レイアウトテスト
  // ─────────────────────────────────────────
  describe("ノート（Pages）エクスプローラー風レイアウト", () => {
    it("ノート（Pages）スペースではグリッド表示・リスト表示切り替えボタンが存在せず、階層サイドバーが表示される", async () => {
      const { onSnapshot } = await import("firebase/firestore");
      const Notes = (await import("../components/Notes")).default;

      (onSnapshot as any).mockImplementation((_q: any, callback: any) => {
        callback({
          docs: [
            {
              id: "note-1",
              data: () => ({
                title: "テストノート1",
                content: "テスト内容1",
                tags: ["仕事"],
                parentId: null,
                createdAt: "2026-08-30T10:00:00Z",
                updatedAt: "2026-08-30T10:00:00Z",
                isDeleted: false,
                spaceType: "document",
              }),
            },
          ],
          forEach: function (fn: any) {
            this.docs.forEach(fn);
          },
        });
        return vi.fn();
      });

      render(<Notes />);

      // グリッド表示ボタンやリスト表示ボタンは存在しない
      expect(screen.queryByRole("button", { name: "グリッド表示" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "リスト表示" })).not.toBeInTheDocument();

      // サイドバーの「ドキュメント」見出しが表示されている
      expect(screen.getByText("ドキュメント")).toBeInTheDocument();
    });
  });

  // ─────────────────────────────────────────
  // 19. サブノート固定表示撤廃のテスト
  // ─────────────────────────────────────────
  describe("サブノート固定表示撤廃", () => {
    it("ノートを開いたとき、最下部に固定サブノートセクションやリスト・カード切り替えピルが存在しない", async () => {
      const { onSnapshot } = await import("firebase/firestore");
      const Notes = (await import("../components/Notes")).default;

      (onSnapshot as any).mockImplementation((_q: any, callback: any) => {
        callback({
          forEach: (fn: any) => {
            fn({
              id: "hub-parent-1",
              data: () => ({
                title: "プロジェクト親ノート",
                content: "ドキュメント管理",
                tags: ["Docs"],
                parentId: null,
                isDeleted: false,
                childViewMode: "list",
                spaceType: "document",
              }),
            });
            fn({
              id: "child-doc-1",
              data: () => ({
                title: "設計仕様書",
                content: "詳細設計",
                tags: ["Docs"],
                parentId: "hub-parent-1",
                isDeleted: false,
                spaceType: "document",
              }),
            });
          },
        });
        return vi.fn();
      });

      render(<Notes initialNoteId="hub-parent-1" />);

      // 固定サブノート見出しや切り替えピルは存在しない
      expect(screen.queryByRole("heading", { level: 3, name: "サブノート" })).not.toBeInTheDocument();
      expect(screen.queryByRole("radio", { name: "リスト表示" })).not.toBeInTheDocument();
      expect(screen.queryByRole("radio", { name: "カード表示" })).not.toBeInTheDocument();
    });
  });

  // ─────────────────────────────────────────
  // 20. Notes 3大スペース分離（メモ・ノート・日記）テスト
  // ─────────────────────────────────────────
  describe("Notes 3大スペース分離（メモ・ノート・日記）", () => {
    it("メモ・ノート・日記で作成したノートが他スペースに混ざって表示されない（完全データ分離）", async () => {
      const { onSnapshot } = await import("firebase/firestore");
      const Notes = (await import("../components/Notes")).default;

      (onSnapshot as any).mockImplementation((_q: any, callback: any) => {
        callback({
          forEach: (fn: any) => {
            fn({
              id: "memo-isolated-1",
              data: () => ({
                title: "メモ専用データ",
                content: "アイデアメモ",
                tags: ["Memo"],
                spaceType: "memo",
                isDeleted: false,
              }),
            });
            fn({
              id: "doc-isolated-1",
              data: () => ({
                title: "ノート専用データ",
                content: "プロジェクト文書",
                tags: ["Docs"],
                spaceType: "document",
                isDeleted: false,
              }),
            });
            fn({
              id: "journal-isolated-1",
              data: () => ({
                title: "2026-09-06 のジャーナル",
                content: "日記専用データ",
                tags: ["ジャーナル"],
                spaceType: "journal",
                journalDate: "2026-09-06",
                isDeleted: false,
              }),
            });
          },
        });
        return vi.fn();
      });

      render(<Notes />);

      // 初期はノート（document）スペース：ノート専用データのみ表示され（サイドバーとダッシュボード）、メモ・日記は表示されない
      expect(screen.getAllByText("ノート専用データ").length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByText("メモ専用データ")).not.toBeInTheDocument();
      expect(screen.queryByText("日記専用データ")).not.toBeInTheDocument();

      // メモスペースへ切り替え
      const memoTab = screen.getByRole("tab", { name: "メモスペース" });
      await userEvent.click(memoTab);

      expect(screen.getByText("メモ専用データ")).toBeInTheDocument();
      expect(screen.queryByText("ノート専用データ")).not.toBeInTheDocument();
      expect(screen.queryByText("日記専用データ")).not.toBeInTheDocument();

      // 日記スペースへ切り替え
      const journalTab = screen.getByRole("tab", { name: "日記スペース" });
      await userEvent.click(journalTab);

      expect(screen.getByText("日記専用データ")).toBeInTheDocument();
      expect(screen.queryByText("メモ専用データ")).not.toBeInTheDocument();
      expect(screen.queryByText("ノート専用データ")).not.toBeInTheDocument();
    });
  });

  // ─────────────────────────────────────────
  // 20. ジャーナル統合（クイック作成、MoodPicker、足跡取り込み）
  // ─────────────────────────────────────────
  describe("ジャーナル統合（クイック作成、MoodPicker、足跡取り込み）", () => {
    it("日記スペースで「今日のジャーナルを書く」をクリックすると、新規ジャーナルが作成され画面が開く", async () => {
      const { onSnapshot, addDoc } = await import("firebase/firestore");
      (addDoc as any).mockClear();
      (addDoc as any).mockResolvedValue({ id: "new-today-j-id" });
      const Notes = (await import("../components/Notes")).default;

      (onSnapshot as any).mockImplementation((_q: any, callback: any) => {
        callback({
          forEach: (_fn: any) => {},
        });
        return vi.fn();
      });

      render(<Notes />);

      // 下中央フローティングDockの日記タブをクリック
      const journalTab = screen.getByRole("tab", { name: "日記スペース" });
      await userEvent.click(journalTab);

      const quickWriteBtn = screen.getByTestId("quick-today-journal-btn");
      await userEvent.click(quickWriteBtn);

      // addDoc で当日のジャーナルノート（spaceType: "journal"）が作成される
      expect(addDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          spaceType: "journal",
          tags: ["ジャーナル"],
          title: expect.stringMatching(/のジャーナル$/),
          journalDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        })
      );
    });

    it("ジャーナルノート表示時に MoodPicker と「今日の足跡を取り込む」が表示され、Mood選択が即時保存される", async () => {
      const { onSnapshot, updateDoc } = await import("firebase/firestore");
      (updateDoc as any).mockClear();
      const Notes = (await import("../components/Notes")).default;

      (onSnapshot as any).mockImplementation((_q: any, callback: any) => {
        callback({
          forEach: (fn: any) => {
            fn({
              id: "journal-entry-1",
              data: () => ({
                title: "2026-09-06 のジャーナル",
                content: "朝の散歩をした。",
                tags: ["ジャーナル"],
                parentId: null,
                isDeleted: false,
                journalDate: "2026-09-06",
                mood: "neutral",
              }),
            });
          },
        });
        return vi.fn();
      });

      render(<Notes initialNoteId="journal-entry-1" />);

      // ジャーナルメタバーが表示されている
      expect(screen.getByTestId("journal-meta-bar")).toBeInTheDocument();
      expect(screen.getByText("今日の気分")).toBeInTheDocument();

      // MoodPicker の各ボタンが存在する（role="radio"）
      const greatMoodBtn = screen.getByRole("radio", { name: /最高/ });
      expect(greatMoodBtn).toBeInTheDocument();

      // 最高 (great) を選択
      await userEvent.click(greatMoodBtn);

      // updateDoc で mood: "great" が即時保存される
      expect(updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          mood: "great",
        })
      );
    });

    it("「今日の足跡を取り込む」をクリックすると、当日のタスクと予定が取得され、本文末尾にMarkdown形式で追記される", async () => {
      const { onSnapshot, updateDoc, getDocs } = await import("firebase/firestore");
      (updateDoc as any).mockClear();
      const Notes = (await import("../components/Notes")).default;

      // getDocs でタスクと予定を返すようモック
      (getDocs as any).mockImplementation((q: any) => {
        const colId = q?.id || q?.path || "";
        if (colId.includes("tasks")) {
          return Promise.resolve({
            docs: [
              {
                id: "t-1",
                data: () => ({
                  title: "デザインシステム設計完了",
                  completed: true,
                  dueDate: "2026-09-06",
                }),
              },
            ],
            forEach(fn: any) {
              this.docs.forEach(fn);
            },
          });
        }
        if (colId.includes("events")) {
          return Promise.resolve({
            docs: [
              {
                id: "e-1",
                data: () => ({
                  title: "スプリントレビュー",
                  date: "2026-09-06",
                  startTime: "15:00",
                  endTime: "16:00",
                }),
              },
            ],
            forEach(fn: any) {
              this.docs.forEach(fn);
            },
          });
        }
        return Promise.resolve({ docs: [], forEach: vi.fn() });
      });

      (onSnapshot as any).mockImplementation((_q: any, callback: any) => {
        callback({
          forEach: (fn: any) => {
            fn({
              id: "journal-entry-footprint",
              data: () => ({
                title: "2026-09-06 のジャーナル",
                content: "今日はいろいろ進んだ。",
                tags: ["ジャーナル"],
                parentId: null,
                isDeleted: false,
                journalDate: "2026-09-06",
                mood: "good",
              }),
            });
          },
        });
        return vi.fn();
      });

      render(<Notes initialNoteId="journal-entry-footprint" />);

      const importBtn = screen.getByTestId("import-footprint-btn");
      expect(importBtn).toBeInTheDocument();

      // 足跡取り込みボタンをクリック
      await userEvent.click(importBtn);

      // contextSnapshot が保存され、本文が更新される
      expect(updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          contextSnapshot: {
            completedTasks: ["デザインシステム設計完了"],
            events: ["15:00〜16:00 スプリントレビュー"],
          },
        })
      );
    });
  });

  // ─────────────────────────────────────────
  // 21. Sprint 4.8: Notes 3大スペース分離（メモ・ノート・日記）統合テスト
  // ─────────────────────────────────────────
  describe("Sprint 4.8: Notes 3大スペース分離（メモ・ノート・日記）", () => {
    beforeEach(() => {
      localStorage.clear();
    });

    it("最上部に『メモ』『ノート』『日記』の3大スペースセグメントが表示され、切り替えができる", async () => {
      const Notes = (await import("../components/Notes")).default;
      render(<Notes />);

      const memoTab = screen.getByRole("tab", { name: "メモスペース" });
      const docTab = screen.getByRole("tab", { name: "ノートスペース" });
      const journalTab = screen.getByRole("tab", { name: "日記スペース" });

      expect(memoTab).toBeInTheDocument();
      expect(docTab).toBeInTheDocument();
      expect(journalTab).toBeInTheDocument();

      // 初期状態はノートスペースが選択されている
      expect(docTab).toHaveAttribute("aria-selected", "true");
      expect(memoTab).toHaveAttribute("aria-selected", "false");

      // メモスペースに切り替え
      await userEvent.click(memoTab);
      expect(screen.getByRole("tab", { name: "メモスペース" })).toHaveAttribute("aria-selected", "true");
      expect(screen.getByRole("tab", { name: "ノートスペース" })).toHaveAttribute("aria-selected", "false");
      expect(screen.getByText("新しいメモ")).toBeInTheDocument();

      // 日記スペースに切り替え
      await userEvent.click(screen.getByRole("tab", { name: "日記スペース" }));
      expect(screen.getByRole("tab", { name: "日記スペース" })).toHaveAttribute("aria-selected", "true");
      expect(screen.getByTestId("quick-today-journal-btn")).toBeInTheDocument();
    });

    it("メモスペースで『新しいメモ』をクリックすると、画面遷移せずMemoModalがポップアップ表示される", async () => {
      const { addDoc } = await import("firebase/firestore");
      (addDoc as any).mockResolvedValue({ id: "new-memo-id" });

      const Notes = (await import("../components/Notes")).default;
      render(<Notes />);

      // メモスペースへ切り替え
      const memoTab = screen.getByRole("tab", { name: "メモスペース" });
      await userEvent.click(memoTab);

      const newMemoBtn = screen.getByRole("button", { name: "新しいメモ" });
      await userEvent.click(newMemoBtn);

      // addDoc が spaceType: "memo" で呼ばれる
      expect(addDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ spaceType: "memo" })
      );

      // MemoModal のタイトル入力欄が表示される
      const titleInput = await screen.findByPlaceholderText("メモのタイトル…");
      expect(titleInput).toBeInTheDocument();

      // 完了ボタンをクリックするとモーダルが閉じる
      const closeBtn = screen.getByRole("button", { name: "完了" });
      await userEvent.click(closeBtn);

      expect(screen.queryByPlaceholderText("メモのタイトル…")).not.toBeInTheDocument();
    });

    it("ノートスペースでサイドバー折りたたみボタンをクリックすると、サイドバーが開閉する", async () => {
      const Notes = (await import("../components/Notes")).default;
      render(<Notes />);

      // サイドバーの「サイドバーを閉じる」ボタンが存在する
      const closeSidebarBtn = screen.getByRole("button", { name: "サイドバーを閉じる" });
      expect(closeSidebarBtn).toBeInTheDocument();

      // サイドバーを閉じる
      await userEvent.click(closeSidebarBtn);

      // サイドバーを再度開くボタンが表示される
      const openSidebarBtn = screen.getByRole("button", { name: "ページ一覧を開く" });
      expect(openSidebarBtn).toBeInTheDocument();

      // 再び開く
      await userEvent.click(openSidebarBtn);
      expect(screen.getByRole("button", { name: "サイドバーを閉じる" })).toBeInTheDocument();
    });

    it("ノート編集画面でタグが単一バッジとして表示され、入力欄に重複表示されない。またジャーナル化ボタンや簡易構文バーは存在しない", async () => {
      const Notes = (await import("../components/Notes")).default;
      const { onSnapshot } = await import("firebase/firestore");

      (onSnapshot as any).mockImplementation((_query: any, callback: any) => {
        callback({
          forEach: (fn: any) => {
            fn({
              id: "test-note-single-tag",
              data: () => ({
                title: "タグ検証ノート",
                content: "テスト本文",
                tags: ["Game"],
                parentId: null,
                isDeleted: false,
                spaceType: "document",
              }),
            });
          },
        });
        return vi.fn();
      });

      render(<Notes initialNoteId="test-note-single-tag" />);

      // タグバッジ #Game が1つだけ表示される
      expect(screen.getByRole("button", { name: "#Game" })).toBeInTheDocument();

      // タグ入力欄のプレースホルダーは "+ タグ追加" であり、値は空（重複して "Game" が入っていない）
      const tagInput = screen.getByPlaceholderText("+ タグ追加") as HTMLInputElement;
      expect(tagInput).toBeInTheDocument();
      expect(tagInput.value).toBe("");

      // 「＋ ジャーナル化」ボタンが存在しない
      expect(screen.queryByText(/ジャーナル化/)).not.toBeInTheDocument();

      // 簡易構文バーのボタン（H2, Table など）が存在しない
      expect(screen.queryByRole("button", { name: "H2" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Table" })).not.toBeInTheDocument();
    });

    it("階層ツリーでノート項目を右クリックするとカスタムコンテキストメニューが表示される", async () => {
      const Notes = (await import("../components/Notes")).default;
      const { onSnapshot } = await import("firebase/firestore");
      const { fireEvent } = await import("@testing-library/react");

      (onSnapshot as any).mockImplementation((_query: any, callback: any) => {
        callback({
          forEach: (fn: any) => {
            fn({
              id: "test-note-context-menu",
              data: () => ({
                title: "コンテキストメニュー検証ノート",
                content: "右クリックの検証本文",
                tags: ["テスト"],
                parentId: null,
                isDeleted: false,
                spaceType: "document",
              }),
            });
          },
        });
        return vi.fn();
      });

      render(<Notes />);

      // 右クリック前はコンテキストメニューが表示されていない
      expect(screen.queryByRole("menuitem", { name: "名前を変更" })).not.toBeInTheDocument();

      // サイドバーのノート項目を右クリック
      const noteItem = screen.getAllByText("コンテキストメニュー検証ノート")[0];
      fireEvent.contextMenu(noteItem);

      // コンテキストメニュー項目が表示される
      expect(screen.getByRole("menuitem", { name: "名前の変更" })).toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: "子ページを作成" })).toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: "移動..." })).toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: "削除" })).toBeInTheDocument();
    });

    it("初期画面で ExplorerHomeView（クイックアクセス・最近のページ）が表示され、戻るボタンが存在しない", async () => {
      const { onSnapshot } = await import("firebase/firestore");
      (onSnapshot as any).mockImplementation((_query: any, callback: any) => {
        callback({
          forEach: (fn: any) => {
            fn({
              id: "home-test-note",
              data: () => ({
                title: "重要ドキュメント",
                content: "ホーム画面の検証",
                tags: [],
                parentId: null,
                isDeleted: false,
                pinned: true,
                spaceType: "document",
                updatedAt: "2026-09-13T12:00:00.000Z",
              }),
            });
          },
        });
        return vi.fn();
      });

      const Notes = (await import("../components/Notes")).default;
      render(<Notes />);

      // エクスプローラーホームのヘッダーとクイックアクセスが表示される
      expect(screen.getByText("ホーム")).toBeInTheDocument();
      expect(screen.queryByText("Pages ホーム")).not.toBeInTheDocument();
      expect(screen.queryByText("ドキュメントのクイックアクセスと最近使用したページ一覧")).not.toBeInTheDocument();
      expect(screen.queryByText(/全 \d+ ページ/)).not.toBeInTheDocument();
      expect(screen.queryByText("Pages")).not.toBeInTheDocument();
      expect(screen.getByText("クイックアクセス")).toBeInTheDocument();
      expect(screen.getByText("最近使用したページ")).toBeInTheDocument();
      expect(screen.getAllByText("重要ドキュメント").length).toBeGreaterThan(0);

      // 「＜ノート一覧」戻るボタンは存在しない
      expect(screen.queryByTitle("ノート一覧に戻る")).not.toBeInTheDocument();
    });

    it("構文ガイドにスラッシュコマンドセクション（/page, /todo等）が表示される", async () => {
      const { MarkdownGuideModal } = await import("../components/notes/MarkdownGuideModal");
      render(<MarkdownGuideModal isOpen={true} onClose={vi.fn()} onInsert={vi.fn()} />);

      expect(screen.getByText("構文ガイド")).toBeInTheDocument();
      expect(screen.getByRole("heading", { level: 3, name: "スラッシュコマンド ( / )" })).toBeInTheDocument();
      expect(screen.getAllByText("/page").length).toBeGreaterThan(0);
      expect(screen.getAllByText("/todo").length).toBeGreaterThan(0);
    });

    it("MarkdownViewer が [child-page:id] を検出し、allNotes から最新タイトルを解決してカードを描画し、クリックで onSelectNote を呼ぶ", () => {
      const mockSelectNote = vi.fn();
      const mockNotes: NoteItem[] = [
        {
          id: "child-123",
          title: "動的に変更された子ページタイトル",
          content: "子ページ本文",
          tags: [],
          parentId: "parent-1",
          isDeleted: false,
          spaceType: "document",
          createdAt: "2026-09-13T12:00:00.000Z",
          updatedAt: "2026-09-13T12:00:00.000Z",
        },
      ];

      const content = "親ノートのテキスト\n\n[child-page:child-123]\n\n続きのテキスト";

      const { rerender } = render(
        <MarkdownViewer
          content={content}
          allNotes={mockNotes}
          onSelectNote={mockSelectNote}
        />
      );

      // 最新のタイトルでカードが表示されていること
      const childCard = screen.getByText("動的に変更された子ページタイトル");
      expect(childCard).toBeInTheDocument();

      // カードをクリックしたときに onSelectNote('child-123') が呼ばれること
      const cardButton = screen.getByTitle("子ページを開く");
      fireEvent.click(cardButton);
      expect(mockSelectNote).toHaveBeenCalledWith("child-123");

      // 子ページのタイトルが変更された場合、カードの表示がリアルタイムに更新されること
      const updatedNotes: NoteItem[] = [
        {
          ...mockNotes[0],
          title: "さらに更新された最新タイトル",
        },
      ];

      rerender(
        <MarkdownViewer
          content={content}
          allNotes={updatedNotes}
          onSelectNote={mockSelectNote}
        />
      );

      expect(screen.getByText("さらに更新された最新タイトル")).toBeInTheDocument();
      expect(screen.queryByText("動的に変更された子ページタイトル")).not.toBeInTheDocument();
    });

    it("MarkdownViewer が過去の a[href^='note:'] 形式のリンクも同様にカードとしてレンダリングする", () => {
      const mockSelectNote = vi.fn();
      const mockNotes: NoteItem[] = [
        {
          id: "legacy-child-456",
          title: "レガシーリンクの子ページ",
          content: "本文",
          tags: [],
          parentId: "parent-1",
          isDeleted: false,
          spaceType: "document",
          createdAt: "2026-09-13T12:00:00.000Z",
          updatedAt: "2026-09-13T12:00:00.000Z",
        },
      ];

      const content = "過去のノート\n\n[📄 （タイトルなし）](note:legacy-child-456)\n\n続き";

      render(
        <MarkdownViewer
          content={content}
          allNotes={mockNotes}
          onSelectNote={mockSelectNote}
        />
      );

      // 固定タイトル「（タイトルなし）」ではなく、allNotes の「レガシーリンクの子ページ」が表示されること
      expect(screen.getByText("レガシーリンクの子ページ")).toBeInTheDocument();

      const cardButton = screen.getByTitle("子ページを開く");
      fireEvent.click(cardButton);
      expect(mockSelectNote).toHaveBeenCalledWith("legacy-child-456");
    });

    it("NoteEditor の insertChildPageNode ハンドラによって childPage ノードが挿入される", async () => {
      let editorRefInstance: any = null;
      const handleChange = vi.fn();

      render(
        <NoteEditor
          ref={(ref) => {
            editorRefInstance = ref;
          }}
          content=""
          onChange={handleChange}
          allNotes={[]}
        />
      );

      expect(editorRefInstance).toBeTruthy();
      expect(typeof editorRefInstance.insertChildPageNode).toBe("function");

      // insertChildPageNode を実行
      editorRefInstance.insertChildPageNode("new-child-789");

      // コンテンツが更新され、[child-page:new-child-789] が含まれること
      expect(handleChange).toHaveBeenCalled();
      const lastCallContent = handleChange.mock.calls[handleChange.mock.calls.length - 1][0];
      expect(lastCallContent).toContain("child-page:new-child-789");
    });

    it("NoteEditor で insertChildPageNode を連続で呼び出しても、前のノードが上書きされず複数の子ページノードが共存する", async () => {
      let editorRefInstance: any = null;
      const handleChange = vi.fn();

      render(
        <NoteEditor
          ref={(ref) => {
            editorRefInstance = ref;
          }}
          content=""
          onChange={handleChange}
          allNotes={[]}
        />
      );

      // 1つ目の子ページを挿入
      editorRefInstance.insertChildPageNode("child-111");
      // 2つ目の子ページを連続挿入
      editorRefInstance.insertChildPageNode("child-222");

      expect(handleChange).toHaveBeenCalled();
      const lastCallContent = handleChange.mock.calls[handleChange.mock.calls.length - 1][0];

      // 両方の子ページIDがMarkdown本文に含まれていること
      expect(lastCallContent).toContain("child-page:child-111");
      expect(lastCallContent).toContain("child-page:child-222");
    });

    it("削除された子ページ（allNotes に存在しない）は MarkdownViewer でゴースト表示されない（非表示になる）", () => {
      const mockSelectNote = vi.fn();
      // 有効な子ノートは "active-child" のみ（"deleted-child" は存在しない）
      const mockNotes: NoteItem[] = [
        {
          id: "active-child",
          title: "有効な子ページ",
          content: "本文",
          tags: [],
          parentId: "parent-1",
          isDeleted: false,
          spaceType: "document",
          createdAt: "2026-09-13T12:00:00.000Z",
          updatedAt: "2026-09-13T12:00:00.000Z",
        },
      ];

      // 親ノートの本文に削除済み子ページと有効な子ページの両方が記載されている状態
      const content = "親ノート\n\n[child-page:deleted-child]\n\n[child-page:active-child]";

      render(
        <MarkdownViewer
          content={content}
          allNotes={mockNotes}
          onSelectNote={mockSelectNote}
        />
      );

      // 有効な子ページは表示される
      expect(screen.getByText("有効な子ページ")).toBeInTheDocument();
      // 削除された子ページは「無題のページ」等としてゴースト表示されない
      expect(screen.queryByText("無題のページ")).not.toBeInTheDocument();
      expect(screen.queryByText("deleted-child")).not.toBeInTheDocument();
    });

    it("子ノート削除時に親ノートの本文から該当子ページのリンク [child-page:id] が除去される", async () => {
      vi.clearAllMocks();
      const { updateDoc } = await import("firebase/firestore");
      const { onSnapshot } = await import("firebase/firestore");

      const parentNoteData = {
        id: "parent-doc-1",
        title: "親ノート",
        content: "親ノートのテキスト\n\n[child-page:child-to-delete]\n\n残るテキスト",
        tags: [],
        parentId: null,
        isDeleted: false,
        spaceType: "document",
        createdAt: "2026-09-13T12:00:00.000Z",
        updatedAt: "2026-09-13T12:00:00.000Z",
      };

      const childNoteData = {
        id: "child-to-delete",
        title: "削除予定の子ページ",
        content: "子ページ本文",
        tags: [],
        parentId: "parent-doc-1",
        isDeleted: false,
        spaceType: "document",
        createdAt: "2026-09-13T12:00:00.000Z",
        updatedAt: "2026-09-13T12:00:00.000Z",
      };

      (onSnapshot as any).mockImplementation((_query: any, callback: any) => {
        callback({
          forEach: (fn: any) => {
            fn({ id: parentNoteData.id, data: () => parentNoteData });
            fn({ id: childNoteData.id, data: () => childNoteData });
          },
        });
        return vi.fn();
      });

      const Notes = (await import("../components/Notes")).default;
      render(<Notes />);

      // ツリーの親ノートを展開
      const expandButton = screen.getByRole("button", { name: "展開する" });
      fireEvent.click(expandButton);

      // 展開された子ノートをクリックして開く
      const childItems = screen.getAllByText("削除予定の子ページ");
      fireEvent.click(childItems[0]);

      // 子ページのツールバーの削除ボタンをクリック
      const deleteButton = screen.getByTitle("このノートを削除");
      fireEvent.click(deleteButton);

      // 削除確認モーダルで「削除する」をクリック
      const confirmButton = screen.getByRole("button", { name: "削除する" });
      fireEvent.click(confirmButton);

      // 非同期で updateDoc が呼ばれ、親ノートの content から child-to-delete が除去されていること
      await vi.waitFor(() => {
        const calls = (updateDoc as any).mock.calls;
        const parentUpdateCall = calls.find((call: any) => call[1]?.content !== undefined);
        expect(parentUpdateCall).toBeTruthy();
        expect(parentUpdateCall[1].content).not.toContain("child-page:child-to-delete");
        expect(parentUpdateCall[1].content).toContain("残るテキスト");
      });
    });
  });
});
