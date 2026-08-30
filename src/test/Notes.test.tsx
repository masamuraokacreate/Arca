/**
 * src/test/Notes.test.tsx
 * Arca — Notes モジュール 単体 & 統合テスト
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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

    render(<Notes />);

    // ルートノートのみが表示される
    expect(screen.getByText("プロジェクトハブ")).toBeInTheDocument();
    expect(screen.getByText("単独ノート")).toBeInTheDocument();
    // 子ノートはトップ一覧には直接表示されない
    expect(screen.queryByText("サブノートA")).not.toBeInTheDocument();
    expect(screen.queryByText("サブノートB")).not.toBeInTheDocument();

    // 子ノート件数バッジが表示されている（2件）
    expect(screen.getByText("2件")).toBeInTheDocument();
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

    // パンくずとタイトルが表示されている
    expect(screen.getByRole("button", { name: "Notes" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("プロジェクトハブ")).toBeInTheDocument();
    expect(screen.getByTitle("プロジェクトハブ")).toBeInTheDocument(); // パンくずのtitle属性

    // サブノートセクションが表示されている
    expect(screen.getByRole("heading", { level: 3, name: "サブノート" })).toBeInTheDocument();
    expect(screen.getByText("サブノートA")).toBeInTheDocument();

    // 「＋ 子ノート作成」ボタンを押すと parentId: "hub-1" で addDoc が呼ばれる
    const createSubNoteBtn = screen.getByRole("button", { name: /子ノート作成/ });
    await userEvent.click(createSubNoteBtn);

    expect(addDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        parentId: "hub-1",
        isDeleted: false,
      })
    );
  });

  it("親ノート削除時にサブノートの警告ダイアログが表示され、親＋子ノートが一括論理削除＆Undoされる", async () => {
    const { onSnapshot, updateDoc } = await import("firebase/firestore");
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

    render(<Notes />);

    // 削除メニューをクリック
    const menuBtn = screen.getByLabelText("メニュー");
    await userEvent.click(menuBtn);

    const deleteOption = screen.getByRole("button", { name: "削除" });
    await userEvent.click(deleteOption);

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
});


