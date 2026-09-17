/**
 * src/test/NoteEnhancements.test.tsx
 * Note改修・改良（SVGアイコン選択、保存ステータス単独バッジ、ヘッダー統合、子ページインライン化）のテスト
 */

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NoteIcon, NoteIconPickerModal } from "../components/notes/NoteIconPickerModal";
import { NoteToolbar } from "../components/notes/NoteToolbar";
import { ChildPageComponent } from "../components/notes/extensions/ChildPageNode";
import { DocumentTreeSidebar } from "../components/notes/DocumentTreeSidebar";
import { ExplorerHomeView } from "../components/notes/ExplorerHomeView";
import { NoteEditorContext } from "../components/notes/NoteEditorContext";
import type { NoteItem } from "../types";

describe("NoteEnhancements: SVGアイコン選択 & NoteIcon", () => {
  it("NoteIcon: アイコン未指定時は defaultIcon または FileText が表示される", () => {
    const { container } = render(<NoteIcon icon={undefined} />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("NoteIcon: 指定したLucideアイコン（例: 'book', 'star'）が表示される", () => {
    const { container } = render(<NoteIcon icon="book" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg?.classList.contains("lucide-book")).toBe(true);
  });

  it("NoteIcon: カスタムSVGコード文字列が渡された場合にインラインSVGとして描画される", () => {
    const customSvg = `<svg width="16" height="16" data-testid="custom-svg"><circle cx="8" cy="8" r="5" /></svg>`;
    render(<NoteIcon icon={customSvg} />);
    expect(screen.getByTestId("custom-svg")).toBeInTheDocument();
  });

  it("NoteIconPickerModal: モーダルが開いてアイコンをクリックすると onSelectIcon が呼ばれる", async () => {
    const onSelectIcon = vi.fn();
    const onClose = vi.fn();

    render(
      <NoteIconPickerModal
        isOpen={true}
        onClose={onClose}
        onSelectIcon={onSelectIcon}
        noteTitle="テストノート"
      />
    );

    expect(screen.getByText("アイコンを選択")).toBeInTheDocument();
    expect(screen.getByText("テストノート")).toBeInTheDocument();

    // 「ブック」アイコンをクリック
    const bookBtn = screen.getByTitle("ブック (book)");
    await userEvent.click(bookBtn);

    expect(onSelectIcon).toHaveBeenCalledWith("book");
    expect(onClose).toHaveBeenCalled();
  });

  it("NoteIconPickerModal: 「デフォルトに戻す」をクリックすると null で onSelectIcon が呼ばれる", async () => {
    const onSelectIcon = vi.fn();
    const onClose = vi.fn();

    render(
      <NoteIconPickerModal
        isOpen={true}
        onClose={onClose}
        onSelectIcon={onSelectIcon}
      />
    );

    const resetBtn = screen.getByRole("button", { name: /デフォルトに戻す/ });
    await userEvent.click(resetBtn);

    expect(onSelectIcon).toHaveBeenCalledWith(null);
    expect(onClose).toHaveBeenCalled();
  });
});

describe("NoteEnhancements: NoteToolbar 統合ヘッダー", () => {
  it("leftSlot が提供された場合、左側にパンくずスロットがレンダリングされ、ツールバーにアイコン変更ボタンが表示されないこと", async () => {
    const onExtract = vi.fn();
    const onDownloadMarkdown = vi.fn();
    const onDelete = vi.fn();

    render(
      <NoteToolbar
        leftSlot={<div data-testid="test-breadcrumb-slot">Pages &gt; 親ノート</div>}
        onExtract={onExtract}
        isExtracting={false}
        canExtract={true}
        onDownloadMarkdown={onDownloadMarkdown}
        onOpenGuide={vi.fn()}
        isFullWidth={false}
        onToggleFullWidth={vi.fn()}
        showToc={false}
        onToggleToc={vi.fn()}
        onDelete={onDelete}
      />
    );

    // 左側パンくずスロット
    expect(screen.getByTestId("test-breadcrumb-slot")).toBeInTheDocument();
    expect(screen.getByText(/Pages > 親ノート/)).toBeInTheDocument();

    // 編集タブ（ツールバー）からアイコン変更ボタンは削除され、表題側のみで管理されること
    expect(screen.queryByTitle("ページのアイコンを選択・変更")).toBeNull();
  });

  it("統合ヘッダーパンくず: Pagesボタンが表示されず、開いているノートの最上位親から始まること", () => {
    // breadcrumbSlot 内の描画ロジックをテスト
    const crumbs = [
      { id: "parent-doc", title: "親ドキュメント" },
      { id: "child-doc", title: "子ドキュメント" },
    ];
    const onSelectNote = vi.fn();

    render(
      <div className="flex items-center gap-1 text-xs font-medium text-charcoal-light truncate">
        {crumbs.map((crumb, idx) => {
          const isLast = idx === crumbs.length - 1;
          return (
            <span key={crumb.id} className="flex items-center">
              {idx > 0 && <span data-testid="crumb-separator">&gt;</span>}
              <button
                type="button"
                onClick={() => onSelectNote(crumb.id)}
                className={isLast ? "font-semibold text-charcoal" : "text-charcoal-light"}
              >
                {crumb.title}
              </button>
            </span>
          );
        })}
      </div>
    );

    // 「Pages」というテキストはパンくず内に存在しないこと
    expect(screen.queryByText("Pages")).toBeNull();
    // 最上位の親ドキュメントが先頭に表示されていること
    expect(screen.getByText("親ドキュメント")).toBeInTheDocument();
    expect(screen.getByText("子ドキュメント")).toBeInTheDocument();
    // 最初の要素の前にはセパレータがなく、2番目の要素の前にのみセパレータが存在すること
    const separators = screen.getAllByTestId("crumb-separator");
    expect(separators).toHaveLength(1);
  });
});

describe("NoteEnhancements: ChildPageNode インライン化 & アイコン対応", () => {
  it("ChildPageComponent がインラインボタンとして描画され、カスタムアイコンが表示される", async () => {
    const mockNotes: NoteItem[] = [
      {
        id: "child-123",
        title: "子ページタイトル",
        content: "本文",
        tags: [],
        icon: "star",
        createdAt: "2026-09-17T00:00:00Z",
        updatedAt: "2026-09-17T00:00:00Z",
      },
    ];
    const onSelectNote = vi.fn();

    const mockProps: any = {
      node: {
        attrs: {
          pageId: "child-123",
        },
      },
      updateAttributes: vi.fn(),
      deleteNode: vi.fn(),
    };

    render(
      <NoteEditorContext.Provider value={{ allNotes: mockNotes, onSelectNote }}>
        <ChildPageComponent {...mockProps} />
      </NoteEditorContext.Provider>
    );

    // タイトルが表示されている
    expect(screen.getByText("子ページタイトル")).toBeInTheDocument();

    // star アイコンが表示されている
    const starIcon = document.querySelector(".lucide-star");
    expect(starIcon).toBeInTheDocument();

    // ボタンクリックで onSelectNote が呼ばれる
    const btn = screen.getByTitle("子ページを開く");
    expect(btn.className).toContain("w-64");
    expect(btn.className).toContain("h-[42px]");
    await userEvent.click(btn);
    expect(onSelectNote).toHaveBeenCalledWith("child-123");
  });

  it("ChildPageComponent: 長いタイトルでも固定幅かつ truncate される", () => {
    const longTitle = "あ".repeat(100);
    const mockNotes: NoteItem[] = [
      {
        id: "child-long",
        title: longTitle,
        content: "本文",
        tags: [],
        createdAt: "2026-09-17T00:00:00Z",
        updatedAt: "2026-09-17T00:00:00Z",
      },
    ];

    const mockProps: any = {
      node: { attrs: { pageId: "child-long" } },
      updateAttributes: vi.fn(),
      deleteNode: vi.fn(),
    };

    render(
      <NoteEditorContext.Provider value={{ allNotes: mockNotes, onSelectNote: vi.fn() }}>
        <ChildPageComponent {...mockProps} />
      </NoteEditorContext.Provider>
    );

    const btn = screen.getByTitle("子ページを開く");
    expect(btn.className).toContain("w-64");
    expect(btn.className).toContain("h-[42px]");
    const titleSpan = screen.getByText(longTitle);
    expect(titleSpan.className).toContain("truncate");
  });
});

describe("NoteEnhancements: ゲームコントローラーアイコン", () => {
  it("NoteIconPickerModal にゲームアイコン（gamepad-2）が存在し、選択できる", async () => {
    const onSelectIcon = vi.fn();
    const onClose = vi.fn();

    render(
      <NoteIconPickerModal
        isOpen={true}
        onClose={onClose}
        onSelectIcon={onSelectIcon}
      />
    );

    const gameBtn = screen.getByTitle("ゲーム (gamepad-2)");
    expect(gameBtn).toBeInTheDocument();
    await userEvent.click(gameBtn);

    expect(onSelectIcon).toHaveBeenCalledWith("gamepad-2");
    expect(onClose).toHaveBeenCalled();
  });
});

describe("NoteEnhancements: DocumentTreeSidebar 最下部のごみ箱フォルダー", () => {
  it("最下部にごみ箱ボタンが表示され、件数バッジが表示され、クリックで onOpenTrash が呼ばれる", async () => {
    const onOpenTrash = vi.fn();

    render(
      <DocumentTreeSidebar
        notes={[]}
        activeNoteId={null}
        onSelectNote={vi.fn()}
        onCreateRootNote={vi.fn()}
        onCreateChildNote={vi.fn()}
        onMoveNote={vi.fn()}
        onOpenTrash={onOpenTrash}
        deletedCount={5}
      />
    );

    const trashBtn = screen.getByTitle("ごみ箱を開く");
    expect(trashBtn).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();

    await userEvent.click(trashBtn);
    expect(onOpenTrash).toHaveBeenCalled();
  });
});

describe("NoteEnhancements: モーダル全画面ぼかし (createPortal & z-[200])", () => {
  it("NoteIconPickerModal が document.body 直下にポータル描画され、z-[200] を持つ", () => {
    render(
      <NoteIconPickerModal
        isOpen={true}
        onClose={vi.fn()}
        onSelectIcon={vi.fn()}
      />
    );

    const overlay = document.body.querySelector(".fixed.inset-0");
    expect(overlay).toBeInTheDocument();
    expect(overlay?.classList.contains("z-[200]")).toBe(true);
  });
});

describe("NoteEnhancements: ドキュメント配置の固定 & orderソート", () => {
  it("DocumentTreeSidebar: ノートの表示順序が updatedAt ではなく order / createdAt で固定される", () => {
    // note1 は後から更新（updatedAtが最新）されたが、order は 1（2番目）
    // note2 は更新が古いが、order は 0（1番目）
    const mockNotes: NoteItem[] = [
      {
        id: "note-1",
        title: "2番目のノート",
        content: "",
        tags: [],
        order: 1,
        createdAt: "2026-09-17T01:00:00Z",
        updatedAt: "2026-09-17T12:00:00Z", // 最新
      },
      {
        id: "note-2",
        title: "1番目のノート",
        content: "",
        tags: [],
        order: 0,
        createdAt: "2026-09-17T02:00:00Z",
        updatedAt: "2026-09-17T02:00:00Z", // 古い
      },
    ];

    render(
      <DocumentTreeSidebar
        notes={mockNotes}
        activeNoteId={null}
        onSelectNote={vi.fn()}
        onCreateRootNote={vi.fn()}
        onCreateChildNote={vi.fn()}
        onMoveNote={vi.fn()}
      />
    );

    const titles = screen.getAllByText(/番目のノート/);
    // updatedAt に依らず order 順（1番目 -> 2番目）に並んでいる
    expect(titles[0].textContent).toBe("1番目のノート");
    expect(titles[1].textContent).toBe("2番目のノート");
  });

  it("ExplorerHomeView: 「最近使用したページ」は updatedAt 降順（更新順）で表示される", () => {
    const mockNotes: NoteItem[] = [
      {
        id: "note-a",
        title: "ノートB（後更新・最新）",
        content: "",
        tags: [],
        order: 1,
        createdAt: "2026-09-17T01:00:00Z",
        updatedAt: "2026-09-17T12:00:00Z", // 最新更新
      },
      {
        id: "note-b",
        title: "ノートA（先頭order・古い更新）",
        content: "",
        tags: [],
        order: 0,
        createdAt: "2026-09-17T02:00:00Z",
        updatedAt: "2026-09-17T02:00:00Z", // 古い更新
      },
    ];

    render(
      <ExplorerHomeView
        notes={mockNotes}
        onSelectNote={vi.fn()}
        onCreateNewPage={vi.fn()}
      />
    );

    const noteTitles = screen.getAllByText(/ノート[AB]（/);
    // order に依らず、最近使用したページは更新日時順（最新のノートBが先頭）
    expect(noteTitles[0].textContent).toBe("ノートB（後更新・最新）");
    expect(noteTitles[1].textContent).toBe("ノートA（先頭order・古い更新）");
  });
});

describe("NoteEnhancements: URLペースト選択 & バックスラッシュ過剰エスケープ防止 & 目次右端配置", () => {
  it("isValidUrl: 完全なHTTP/HTTPS URLを正しく識別し、改行やスペースを含むテキストは除外する", async () => {
    const { isValidUrl } = await import("../components/notes/NoteEditor");
    expect(isValidUrl("https://example.com")).toBe(true);
    expect(isValidUrl("http://localhost:3000/notes")).toBe(true);
    expect(isValidUrl("https://github.com/google/arca?foo=bar#hash")).toBe(true);
    expect(isValidUrl("こんにちは")).toBe(false);
    expect(isValidUrl("https://example.com テキスト")).toBe(false);
    expect(isValidUrl("https://example.com\nhttps://example.org")).toBe(false);
    expect(isValidUrl("ftp://files.example.com")).toBe(false);
  });

  it("normalizeMarkdown: 不要なバックスラッシュ過剰エスケープ（\\[, \\], \\#, \\-, \\+, \\>, \\| 等）を正規化・復元する", async () => {
    const { normalizeMarkdown } = await import("../components/notes/NoteEditor");
    // 角括弧、見出し記号、リスト記号などの過剰エスケープが消えること
    expect(normalizeMarkdown("これは \\[重要\\] なメモです")).toBe("これは [重要] なメモです");
    expect(normalizeMarkdown("\\# 見出し")).toBe("# 見出し");
    expect(normalizeMarkdown("1\\. 項目")).toBe("1. 項目");
    expect(normalizeMarkdown("\\- リスト項目")).toBe("- リスト項目");
    expect(normalizeMarkdown("\\> 引用テキスト")).toBe("> 引用テキスト");
    expect(normalizeMarkdown("a \\| b \\| c")).toBe("a | b | c");
    // 太字・斜体や画像・HTMLエンティティの正常動作も維持されること
    expect(normalizeMarkdown("これは \\*太字\\* です")).toBe("これは *太字* です");
    expect(normalizeMarkdown("&lt;b&gt;&amp;&lt;/b&gt;")).toBe("<b>&</b>");
  });

  it("NoteEditor: URLペースト選択メニュー（UrlPasteMenu）が表示されたとき、3つの選択肢が正しく選べる", async () => {
    const { NoteEditor } = await import("../components/notes/NoteEditor");
    const onChange = vi.fn();
    const { container } = render(
      <NoteEditor
        content="テスト本文"
        onChange={onChange}
      />
    );

    const editorEl = container.querySelector(".arca-tiptap-prose");
    expect(editorEl).toBeInTheDocument();

    // paste イベントを発火
    const pasteEvent = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(pasteEvent, "clipboardData", {
      value: {
        items: [],
        getData: (format: string) => (format === "text/plain" ? "https://example.com/test-article" : ""),
      },
    });

    editorEl?.dispatchEvent(pasteEvent);

    // ポップアップ（UrlPasteMenu）が表示されること
    const menu = await screen.findByTestId("url-paste-menu");
    expect(menu).toBeInTheDocument();
    expect(screen.getByText("Webブックマークを作成")).toBeInTheDocument();
    expect(screen.getByText("リンクとして貼り付け")).toBeInTheDocument();
    expect(screen.getByText("テキストのみ貼り付け")).toBeInTheDocument();

    // 「Webブックマークを作成」をクリック
    await userEvent.click(screen.getByTestId("url-paste-opt-bookmark"));
    expect(screen.queryByTestId("url-paste-menu")).toBeNull();
  });

  it("NoteToolbar: Undo/Redoおよびトグル挿入ボタンはツールバーに表示されないこと", () => {
    render(
      <NoteToolbar
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
      />
    );

    // Undo / Redo ボタンはツールバーに表示されないこと
    expect(screen.queryByTitle("元に戻す (Ctrl+Z)")).toBeNull();
    expect(screen.queryByTitle("やり直す (Ctrl+Y / Ctrl+Shift+Z)")).toBeNull();

    // トグル挿入ボタンもツールバーから削除されていること
    expect(screen.queryByTitle("折りたたみトグルブロックを挿入")).toBeNull();
    expect(screen.queryByText("トグル")).toBeNull();
  });

  it("BookmarkComponent: Webブックマークカードがドメイン名、URL、削除ボタン付きで描画される", async () => {
    const { BookmarkComponent } = await import("../components/notes/extensions/BookmarkNode");
    const mockDelete = vi.fn();
    const mockProps: any = {
      node: {
        attrs: {
          url: "https://github.com/google/arca",
        },
      },
      deleteNode: mockDelete,
    };

    render(<BookmarkComponent {...mockProps} />);

    // ホスト名（github.com）とURLが表示されていること
    expect(screen.getByText("github.com")).toBeInTheDocument();
    expect(screen.getByText("https://github.com/google/arca")).toBeInTheDocument();

    // 削除ボタン
    const deleteBtn = screen.getByTitle("ブックマークを削除");
    expect(deleteBtn).toBeInTheDocument();
    await userEvent.click(deleteBtn);
    expect(mockDelete).toHaveBeenCalled();
  });

  it("CustomImageComponent: 画像サイズ変更（-10% / +10%）および横並びボタンが存在し、全画面時でも800px基準の最大幅が適用される", async () => {
    const { CustomImageComponent } = await import("../components/notes/extensions/CustomImageNode");
    const mockUpdateAttrs = vi.fn();
    const mockDelete = vi.fn();
    const mockProps: any = {
      node: {
        attrs: {
          src: "https://example.com/test.png",
          alt: "テスト画像",
          width: "100%",
        },
      },
      selected: true, // ツールバー常時表示
      updateAttributes: mockUpdateAttrs,
      deleteNode: mockDelete,
    };

    const { container } = render(<CustomImageComponent {...mockProps} />);

    // 100% の表示
    expect(screen.getByText("100%")).toBeInTheDocument();

    // 800px基準の最大幅（min(100%, 800px)）が適用されていること
    const wrapper = container.querySelector("[data-image-node]");
    expect(wrapper).toHaveStyle("max-width: min(100%, 800px)");

    // 10% 縮小ボタン
    const minusBtn = screen.getByTitle("10%縮小");
    expect(minusBtn).toBeInTheDocument();
    await userEvent.click(minusBtn);
    expect(mockUpdateAttrs).toHaveBeenCalledWith({ width: "90%" });

    // 横並びボタン
    const halfBtn = screen.getByTitle("横並び表示（約50%幅で前後の画像と左右に並ぶ）");
    expect(halfBtn).toBeInTheDocument();
    await userEvent.click(halfBtn);
    expect(mockUpdateAttrs).toHaveBeenCalledWith({ width: "49%" });
  });

  it("ToggleBlockComponent: トグルカードが描画され、開閉クリック・タイトル編集・削除ができる", async () => {
    const { ToggleBlockComponent } = await import("../components/notes/extensions/ToggleBlockNode");
    const mockUpdateAttrs = vi.fn();
    const mockDelete = vi.fn();
    const mockProps: any = {
      node: {
        attrs: {
          title: "折りたたみ見出し",
          isOpen: true,
        },
      },
      updateAttributes: mockUpdateAttrs,
      deleteNode: mockDelete,
    };

    render(<ToggleBlockComponent {...mockProps} />);

    // タイトルが表示されていること
    expect(screen.getByText("折りたたみ見出し")).toBeInTheDocument();

    // 開閉ボタンをクリック
    const toggleBtn = screen.getByTitle("折りたたむ");
    await userEvent.click(toggleBtn);
    expect(mockUpdateAttrs).toHaveBeenCalledWith({ isOpen: false });

    // 削除ボタンをクリック
    const deleteBtn = screen.getByTitle("トグルブロックを削除");
    await userEvent.click(deleteBtn);
    expect(mockDelete).toHaveBeenCalled();
  });

  it("MarkdownViewer: <details><summary> がトグルカードとして開閉可能に描画される", async () => {
    const { MarkdownViewer } = await import("../components/notes/MarkdownViewer");
    const md = `
# ノート見出し

<details open><summary>重要なメモ</summary>

トグル内部のテキストです。

</details>

通常段落
`;

    render(<MarkdownViewer content={md} />);

    expect(screen.getByText("重要なメモ")).toBeInTheDocument();
    expect(screen.getByText("トグル内部のテキストです。")).toBeInTheDocument();
    expect(screen.getByText("通常段落")).toBeInTheDocument();

    // クリックで折りたためること
    const summaryBtn = screen.getByText("重要なメモ").closest("button");
    expect(summaryBtn).toBeInTheDocument();
    await userEvent.click(summaryBtn!);

    // 折りたたまれ、コンテンツが非表示になること
    expect(screen.queryByText("トグル内部のテキストです。")).toBeNull();
  });
});

describe("NoteEnhancements: パンくずPages削除、最近使用したページ灰色アイコン、ピン留め機能", () => {
  it("ExplorerHomeView: 「最近使用したページ」のアイコンが灰色（text-stone-400）で表示される", () => {
    const mockNotes: NoteItem[] = [
      {
        id: "note-recent",
        title: "最近のノート",
        content: "内容",
        tags: [],
        createdAt: "2026-09-17T00:00:00Z",
        updatedAt: "2026-09-17T12:00:00Z",
      },
    ];

    render(
      <ExplorerHomeView
        notes={mockNotes}
        onSelectNote={vi.fn()}
        onCreateNewPage={vi.fn()}
      />
    );

    // 「最近使用したページ」セクションのヘッダーアイコン（FolderTree）を取得
    const recentHeading = screen.getByText("最近使用したページ");
    const headingContainer = recentHeading.closest("div");
    const folderTreeSvg = headingContainer?.querySelector("svg");
    expect(folderTreeSvg).toBeInTheDocument();
    // ゴールド（text-[#B58D3D]）ではなく灰色（text-stone-400）クラスを持つこと
    expect(folderTreeSvg?.getAttribute("class")).toContain("text-stone-400");
    expect(folderTreeSvg?.getAttribute("class")).not.toContain("text-[#B58D3D]");
  });

  it("NoteToolbar: ピン留めボタンが表示され、クリックで onTogglePin が呼ばれる", async () => {
    const onTogglePin = vi.fn();

    const { rerender } = render(
      <NoteToolbar
        isPinned={false}
        onTogglePin={onTogglePin}
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
      />
    );

    const pinBtn = screen.getByTitle("ピン留め");
    expect(pinBtn).toBeInTheDocument();
    await userEvent.click(pinBtn);
    expect(onTogglePin).toHaveBeenCalledTimes(1);

    // ピン留め済みの場合のツールチップとスタイルの検証
    rerender(
      <NoteToolbar
        isPinned={true}
        onTogglePin={onTogglePin}
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
      />
    );

    expect(screen.getByTitle("ピン留めを解除")).toBeInTheDocument();
  });

  it("DocumentTreeSidebar: ノート行にピン留めボタンがあり、ピン留めされたノートが上部セクションに表示される", async () => {
    const mockNotes: NoteItem[] = [
      {
        id: "note-pinned",
        title: "ピン留めされた親ノート",
        content: "ピン留め本文",
        tags: [],
        pinned: true,
        order: 0,
        createdAt: "2026-09-17T00:00:00Z",
        updatedAt: "2026-09-17T00:00:00Z",
      },
      {
        id: "note-normal",
        title: "通常のノート",
        content: "通常本文",
        tags: [],
        pinned: false,
        order: 1,
        createdAt: "2026-09-17T01:00:00Z",
        updatedAt: "2026-09-17T01:00:00Z",
      },
    ];

    const onTogglePin = vi.fn();
    const onSelectNote = vi.fn();

    render(
      <DocumentTreeSidebar
        notes={mockNotes}
        activeNoteId={null}
        onSelectNote={onSelectNote}
        onCreateRootNote={vi.fn()}
        onCreateChildNote={vi.fn()}
        onMoveNote={vi.fn()}
        onTogglePin={onTogglePin}
      />
    );

    // 上部に「ピン留め」セクションが存在すること
    expect(screen.getByText("ピン留め")).toBeInTheDocument();
    // ピン留めセクション内に「ピン留めされた親ノート」が表示されていること
    const pinnedSection = screen.getByText("ピン留め").closest("div")?.parentElement;
    expect(pinnedSection).toHaveTextContent("ピン留めされた親ノート");

    // 通常のノートのピン留めボタン（title="ピン留め"）をクリック
    const pinButtons = screen.getAllByTitle("ピン留め");
    expect(pinButtons.length).toBeGreaterThan(0);
    await userEvent.click(pinButtons[0]);
    expect(onTogglePin).toHaveBeenCalledWith("note-normal", true);

    // ピン留め済みノートの解除ボタン（title="ピン留めを解除"）をクリック
    const unpinButtons = screen.getAllByTitle("ピン留めを解除");
    expect(unpinButtons.length).toBeGreaterThan(0);
    await userEvent.click(unpinButtons[0]);
    expect(onTogglePin).toHaveBeenCalledWith("note-pinned", false);
  });

  it("MarkdownGuideModal: /toggle と トグル（折りたたみ）が掲載され、クリックで < 構文が挿入される", async () => {
    const { MarkdownGuideModal } = await import("../components/notes/MarkdownGuideModal");
    const onInsert = vi.fn();

    render(<MarkdownGuideModal isOpen={true} onClose={vi.fn()} onInsert={onInsert} />);

    // スラッシュコマンドおよびトグル項目の存在確認
    expect(screen.getByText("/toggle")).toBeInTheDocument();
    expect(screen.getByText("トグル（折りたたみ）")).toBeInTheDocument();

    // トグルカードをクリックすると onInsert("< ") が呼ばれる
    const toggleItem = screen.getByText("トグル（折りたたみ）").closest("div[role='button']");
    expect(toggleItem).not.toBeNull();
    if (toggleItem) {
      await userEvent.click(toggleItem);
      expect(onInsert).toHaveBeenCalledWith("< ");
    }
  });

  it("NoteEditor: insertSyntax('< ') を呼び出すとトグルブロックがエディタに挿入される", async () => {
    const { NoteEditor } = await import("../components/notes/NoteEditor");
    const ref = React.createRef<any>();

    render(<NoteEditor ref={ref} content="" onChange={vi.fn()} />);

    act(() => {
      ref.current?.insertSyntax("< ");
    });

    // トグルブロック（タイトル「トグル」）が表示されること
    expect(await screen.findByText("トグル")).toBeInTheDocument();
    expect(screen.getByTitle("折りたたむ")).toBeInTheDocument();
  });

  describe("Notes: モバイル・デスクトップ最適化＆ナビゲーション順序", () => {
    it("NoteToolbar: 左端の並び順が sidebarToggleSlot → onBack → leftSlot であること", () => {
      const onBack = vi.fn();
      render(
        <NoteToolbar
          sidebarToggleSlot={<button data-testid="test-sidebar-toggle">Sidebar</button>}
          onBack={onBack}
          leftSlot={<span data-testid="test-breadcrumb">Breadcrumb</span>}
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
        />
      );

      const toggle = screen.getByTestId("test-sidebar-toggle");
      const back = screen.getByTitle("一覧に戻る");
      const breadcrumb = screen.getByTestId("test-breadcrumb");

      // DOM順序の検証: toggle が back より前、back が breadcrumb より前
      expect(toggle.compareDocumentPosition(back) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(back.compareDocumentPosition(breadcrumb) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("NoteToolbar: 編集タブに短縮ラベル（抽出・画像・ピン留め・移動・ガイド）が存在し、パンくずヘッダー右端に赤文字のごみ箱ボタンが存在すること", () => {
      render(
        <NoteToolbar
          onExtract={vi.fn()}
          isExtracting={false}
          canExtract={true}
          onInsertImage={vi.fn()}
          onTogglePin={vi.fn()}
          isPinned={false}
          onMoveNote={vi.fn()}
          onOpenGuide={vi.fn()}
          onDownloadMarkdown={vi.fn()}
          isFullWidth={false}
          onToggleFullWidth={vi.fn()}
          showToc={false}
          onToggleToc={vi.fn()}
          onDelete={vi.fn()}
        />
      );

      // モバイル短縮ラベルの検証
      expect(screen.getByText("抽出")).toHaveClass("arca-btn-label-mobile");
      expect(screen.getAllByText("画像").some((el) => el.classList.contains("arca-btn-label-mobile"))).toBe(true);
      expect(screen.getAllByText("ピン留め").some((el) => el.classList.contains("arca-btn-label-mobile"))).toBe(true);
      expect(screen.getAllByText("移動").some((el) => el.classList.contains("arca-btn-label-mobile"))).toBe(true);
      expect(screen.getAllByText("ガイド").some((el) => el.classList.contains("arca-btn-label-mobile"))).toBe(true);

      // ごみ箱ボタンが赤文字（text-red-500）であり、パンくずヘッダー右端に配置されていること
      const trashBtn = screen.getByTitle("このノートを削除");
      expect(trashBtn).toHaveClass("text-red-500");
      expect(screen.getByText("ごみ箱")).toHaveClass("arca-btn-label-mobile");
      expect(trashBtn).toContainElement(screen.getByText("ごみ箱"));

      // デスクトップ用ラベルの検証
      expect(screen.getByText("✦ Aether 抽出")).toHaveClass("arca-btn-label-desktop");
      expect(screen.getByText("エクスポート")).toHaveClass("arca-btn-label-desktop");
      expect(screen.getByText("削除")).toHaveClass("arca-btn-label-desktop");
    });

    it("DocumentTreeSidebar: 「ピン留め」と「ノート一覧」の見出しが表示されること", () => {
      const mockNotes: any[] = [
        {
          id: "note-1",
          title: "ピン留めされたノート",
          content: "内容",
          pinned: true,
          isDeleted: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: "note-2",
          title: "通常のルートノート",
          content: "内容",
          pinned: false,
          isDeleted: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      render(
        <DocumentTreeSidebar
          notes={mockNotes}
          activeNoteId="note-1"
          onSelectNote={vi.fn()}
          onCreateChildNote={vi.fn()}
          onCreateRootNote={vi.fn()}
          onMoveNote={vi.fn()}
          onDeleteNote={vi.fn()}
        />
      );

      expect(screen.getByText("ピン留め")).toBeInTheDocument();
      expect(screen.getByText("ノート一覧")).toBeInTheDocument();
    });

    it("NoteDashboard: グリッド/リスト表示切替ボタンがダークモード用クラス（dark:bg-stone-800, dark:bg-white/[0.08]）を持つこと", async () => {
      const { NoteDashboard } = await import("../components/Notes");
      render(
        <NoteDashboard
          notes={[]}
          allNotes={[]}
          onSelectNote={vi.fn()}
          onNewNote={vi.fn()}
          onDeleteNote={vi.fn()}
          onDownloadNote={vi.fn()}
          onTriggerImport={vi.fn()}
          onOpenTrash={vi.fn()}
        />
      );

      const gridBtn = screen.getByLabelText("グリッド表示");
      const listBtn = screen.getByLabelText("リスト表示");

      expect(gridBtn).toBeInTheDocument();
      expect(listBtn).toBeInTheDocument();

      // アクティブなボタンが dark:bg-stone-800 を持つこと
      expect(gridBtn).toHaveClass("dark:bg-stone-800");
      // コンテナが dark:bg-white/[0.08] を持つこと
      const container = gridBtn.parentElement;
      expect(container?.className).toContain("dark:bg-white/[0.08]");
    });
  });
});


