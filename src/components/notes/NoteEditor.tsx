/**
 * src/components/notes/NoteEditor.tsx
 * Arca — Tiptap リッチテキスト & Markdown ソース統合エディタ (Apple HIG × Arca デザインシステム準拠)
 *
 * 特長:
 * 1. HTML/Markdown エスケープ文字（\*, \_, &lt; 等）の自動正規化 & クレンジング
 * 2. テキスト選択ショートカット (Ctrl+B, Ctrl+I, Ctrl+U, Ctrl+Shift+X) & 手打ちアスタリスク誤変換防止
 * 3. Notion風カーソル追従スラッシュコマンド（/）ガイドメニュー (Apple HIG準拠)
 * 4. Firebase Storage 画像アップロード ＆ URL参照（Notion同等の軽快な画像管理）
 * 5. テキストモード（生Markdownソース）と WYSIWYG ビューのシームレスな切替
 * 6. 太字・斜体・取り消し線の改行時自動解除 (ClearMarksOnEnter)
 * 7. チェックリスト (TaskItem) の安全なテキスト入力 (nested: false)
 * 8. 最適化された余白 & Apple風タイポグラフィ
 */

import {
  useState,
  useCallback,
  useRef,
  useEffect,
  useImperativeHandle,
  forwardRef,
} from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import { Markdown } from "tiptap-markdown";
import { Extension, wrappingInputRule } from "@tiptap/core";
import { Bookmark as BookmarkIcon, Link2, FileText } from "lucide-react";
import { C } from "../../lib/designSystem";
import { uploadNoteImage } from "../../services/imageUploadService";
import { ChildPageNode } from "./extensions/ChildPageNode";
import { BookmarkNode } from "./extensions/BookmarkNode";
import { CustomImageNode } from "./extensions/CustomImageNode";
import { ToggleBlockNode } from "./extensions/ToggleBlockNode";
import { NoteEditorContext } from "./NoteEditorContext";
import type { NoteItem } from "../../types";

/**
 * チェックリスト (TaskItem) 拡張
 * - nested: false (安全なテキスト入力)
 * - [] , [ ] , - [] , - [ ] のいずれの入力でも即座にチェックリストに自動変換
 */
const CustomTaskItem = TaskItem.extend({
  addInputRules() {
    return [
      wrappingInputRule({
        find: /^\s*(- )?(\[([( |x])?\])\s$/,
        type: this.type,
        getAttributes: (match) => ({
          checked: match[match.length - 1] === "x",
        }),
      }),
    ];
  },
});

/**
 * 文字列が有効なHTTP/HTTPS URL単体であるかを判定する
 */
export function isValidUrl(text: string): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (trimmed.includes("\n") || trimmed.includes(" ") || trimmed.includes("\t")) return false;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Markdown 出力時の不要な過剰エスケープ（\*, \_, \[, \], \#, &lt;, &gt; 等）を正規化・クレンジングする
 */
export function normalizeMarkdown(md: string): string {
  if (!md) return "";
  return md
    // 画像URL内のエスケープを復元: ![alt](url)
    .replace(/!\[(.*?)\]\((.*?)\)/g, (_match, alt, url) => {
      const cleanUrl = url.replace(/\\([_*\\])/g, "$1");
      return `![${alt}](${cleanUrl})`;
    })
    // HTML エンティティの不要な露出を復元
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    // 単独のバックスラッシュ過剰エスケープ（\*, \_, \[, \], \#, \-, \+, \>, \=, \., \!, \|, \~ 等）を復元
    .replace(/\\([\\*~_\[\]#\-+>=.|!])/g, "$1");
}

/**
 * 改行時に太字・斜体・打ち消し線・下線・インラインコードを自動解除する拡張
 */
const ClearMarksOnEnter = Extension.create({
  name: "clearMarksOnEnter",
  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        if (
          editor.isActive("bold") ||
          editor.isActive("italic") ||
          editor.isActive("strike") ||
          editor.isActive("underline") ||
          editor.isActive("code")
        ) {
          editor.commands.splitBlock();
          editor.commands.unsetBold();
          editor.commands.unsetItalic();
          editor.commands.unsetStrike();
          editor.commands.unsetUnderline();
          editor.commands.unsetCode();
          return true;
        }
        return false;
      },
    };
  },
});

/**
 * Ctrl+Z (Undo) / Ctrl+Y, Ctrl+Shift+Z (Redo) を確実に実行するキーマップ拡張
 */
const HistoryKeymap = Extension.create({
  name: "historyKeymap",
  addKeyboardShortcuts() {
    return {
      "Mod-z": () => this.editor.commands.undo(),
      "Mod-y": () => this.editor.commands.redo(),
      "Mod-Shift-z": () => this.editor.commands.redo(),
    };
  },
});

export interface SlashCommand {
  id: string;
  label: string;
  description: string;
  icon: string;
  action: (
    editor: any,
    triggers?: {
      openImageDialog?: () => void;
      insertChildPage?: () => void;
    }
  ) => void;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: "page",
    label: "子ページ",
    description: "新しいサブページをここに作成・挿入",
    icon: "📄",
    action: (_editor, triggers) => {
      triggers?.insertChildPage?.();
    },
  },
  {
    id: "h1",
    label: "見出し 1",
    description: "大見出しを挿入",
    icon: "H₁",
    action: (editor) => editor?.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    id: "h2",
    label: "見出し 2",
    description: "中見出しを挿入",
    icon: "H₂",
    action: (editor) => editor?.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    id: "h3",
    label: "見出し 3",
    description: "小見出しを挿入",
    icon: "H₃",
    action: (editor) => editor?.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    id: "bullet",
    label: "箇条書きリスト",
    description: "箇条書きリストを作成",
    icon: "•",
    action: (editor) => editor?.chain().focus().toggleBulletList().run(),
  },
  {
    id: "ordered",
    label: "番号付きリスト",
    description: "番号順リストを作成",
    icon: "1.",
    action: (editor) => editor?.chain().focus().toggleOrderedList().run(),
  },
  {
    id: "todo",
    label: "チェックリスト",
    description: "タスクチェックボックスを作成",
    icon: "☐",
    action: (editor) => editor?.chain().focus().toggleTaskList().run(),
  },
  {
    id: "toggle",
    label: "トグルリスト",
    description: "クリックで開閉できる折りたたみブロック",
    icon: "▶",
    action: (editor) => editor?.chain().focus().insertToggleBlock().run(),
  },
  {
    id: "image",
    label: "画像のアップロード",
    description: "画像ファイルを選択して挿入",
    icon: "🖼",
    action: (_editor, triggers) => {
      triggers?.openImageDialog?.();
    },
  },
  {
    id: "quote",
    label: "引用ブロック",
    description: "目立たせる引用を作成",
    icon: "❝",
    action: (editor) => editor?.chain().focus().toggleBlockquote().run(),
  },
  {
    id: "code",
    label: "コードブロック",
    description: "プログラムコードを入力",
    icon: "</>",
    action: (editor) => editor?.chain().focus().toggleCodeBlock().run(),
  },
  {
    id: "divider",
    label: "区切り線",
    description: "水平線を挿入",
    icon: "─",
    action: (editor) => editor?.chain().focus().setHorizontalRule().run(),
  },
];

export type UrlPasteOption = "bookmark" | "link" | "text";

interface UrlPasteMenuProps {
  url: string;
  coords: { top: number; left: number } | null;
  onSelect: (option: UrlPasteOption) => void;
  onDismiss: () => void;
}

const URL_PASTE_OPTIONS: {
  id: UrlPasteOption;
  label: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    id: "bookmark",
    label: "Webブックマークを作成",
    description: "ドメインとFavicon付きのカード",
    icon: <BookmarkIcon size={15} className="text-[#B58D3D]" />,
  },
  {
    id: "link",
    label: "リンクとして貼り付け",
    description: "インラインテキストリンク",
    icon: <Link2 size={15} className="text-[#B58D3D]" />,
  },
  {
    id: "text",
    label: "テキストのみ貼り付け",
    description: "通常のURL文字列",
    icon: <FileText size={15} className="text-stone-400 dark:text-stone-500" />,
  },
];

function UrlPasteMenu({ url: _url, coords, onSelect, onDismiss }: UrlPasteMenuProps) {
  const [focusIdx, setFocusIdx] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const keyHandler = (e: globalThis.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        setFocusIdx((i) => (i + 1) % URL_PASTE_OPTIONS.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        setFocusIdx((i) => (i - 1 + URL_PASTE_OPTIONS.length) % URL_PASTE_OPTIONS.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        onSelect(URL_PASTE_OPTIONS[focusIdx].id);
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onDismiss();
      }
    };

    const clickOutsideHandler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onDismiss();
      }
    };

    window.addEventListener("keydown", keyHandler, true);
    window.addEventListener("mousedown", clickOutsideHandler);
    return () => {
      window.removeEventListener("keydown", keyHandler, true);
      window.removeEventListener("mousedown", clickOutsideHandler);
    };
  }, [focusIdx, onSelect, onDismiss]);

  const style: React.CSSProperties = coords
    ? {
        position: "fixed",
        top: `${coords.top}px`,
        left: `${coords.left}px`,
      }
    : {
        position: "absolute",
        top: "2.5rem",
        left: "1rem",
      };

  return (
    <div
      ref={menuRef}
      className="arca-slash-menu arca-scroll"
      data-testid="url-paste-menu"
      style={{
        ...style,
        zIndex: 110,
        background: "var(--bg-card-solid)",
        backdropFilter: "blur(24px) saturate(180%)",
        WebkitBackdropFilter: "blur(24px) saturate(180%)",
        borderRadius: "16px",
        boxShadow: "var(--shadow-modal)",
        padding: "0.45rem",
        width: "250px",
        overflowY: "auto",
        border: "1px solid var(--border-subtle)",
        display: "flex",
        flexDirection: "column",
        gap: "2px",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        style={{
          fontSize: "0.69rem",
          fontWeight: 700,
          color: "var(--text-muted)",
          padding: "0.3rem 0.5rem 0.2rem",
          letterSpacing: "0.03em",
        }}
      >
        URLの挿入形式を選択
      </div>
      {URL_PASTE_OPTIONS.map((opt, i) => (
        <button
          key={opt.id}
          type="button"
          data-testid={`url-paste-opt-${opt.id}`}
          onClick={() => onSelect(opt.id)}
          onMouseEnter={() => setFocusIdx(i)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
            padding: "0.45rem 0.65rem",
            borderRadius: "10px",
            border: "none",
            background: i === focusIdx ? "var(--bg-card-hover)" : "transparent",
            cursor: "pointer",
            textAlign: "left",
            width: "100%",
            transition: "background 0.1s ease",
          }}
        >
          <span
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "8px",
              background: i === focusIdx ? "rgba(181, 141, 61, 0.15)" : "rgba(0,0,0,0.04)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "0.95rem",
              flexShrink: 0,
            }}
          >
            {opt.icon}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: "0.82rem",
                fontWeight: 600,
                color: i === focusIdx ? C.goldDark : C.charcoal,
              }}
            >
              {opt.label}
            </div>
            <div
              style={{
                fontSize: "0.68rem",
                color: C.charcoalLight,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {opt.description}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

function SlashMenu({
  query,
  coords,
  onSelect,
  onDismiss,
}: {
  query: string;
  coords: { top: number; left: number } | null;
  onSelect: (cmd: SlashCommand) => void;
  onDismiss: () => void;
}) {
  const filtered = SLASH_COMMANDS.filter(
    (c) =>
      c.id.toLowerCase().startsWith(query.toLowerCase()) ||
      c.label.toLowerCase().includes(query.toLowerCase())
  );
  const [focusIdx, setFocusIdx] = useState(0);

  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if (!filtered.length) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        setFocusIdx((i) => (i + 1) % filtered.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        setFocusIdx((i) => (i - 1 + filtered.length) % filtered.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        onSelect(filtered[focusIdx]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onDismiss();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [filtered, focusIdx, onSelect, onDismiss]);

  useEffect(() => {
    setFocusIdx(0);
  }, [query]);

  if (!filtered.length) return null;

  const style: React.CSSProperties = coords
    ? {
        position: "fixed",
        top: `${coords.top}px`,
        left: `${coords.left}px`,
      }
    : {
        position: "absolute",
        top: "2.5rem",
        left: "1rem",
      };

  return (
    <div
      className="arca-slash-menu arca-scroll"
      style={{
        ...style,
        zIndex: 100,
        background: "var(--bg-card-solid)",
        backdropFilter: "blur(24px) saturate(180%)",
        WebkitBackdropFilter: "blur(24px) saturate(180%)",
        borderRadius: "16px",
        boxShadow: "var(--shadow-modal)",
        padding: "0.45rem",
        width: "250px",
        maxHeight: "320px",
        overflowY: "auto",
        border: "1px solid var(--border-subtle)",
        animation: "slash-in 0.12s cubic-bezier(0, 0, 0.2, 1)",
      }}
    >
      <div
        style={{
          fontSize: "0.68rem",
          fontWeight: 700,
          color: C.charcoalXLight,
          padding: "0.3rem 0.6rem 0.25rem",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}
      >
        ブロックを挿入
      </div>
      {filtered.map((cmd, i) => (
        <button
          key={cmd.id}
          type="button"
          onClick={() => onSelect(cmd)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.65rem",
            width: "100%",
            padding: "0.45rem 0.6rem",
            borderRadius: "10px",
            border: "none",
            background: i === focusIdx ? C.goldFaint : "transparent",
            cursor: "pointer",
            textAlign: "left",
            transition: "background 0.1s ease",
          }}
          onMouseEnter={() => setFocusIdx(i)}
        >
          <span
            style={{
              width: "26px",
              height: "26px",
              borderRadius: "7px",
              background: i === focusIdx ? "rgba(181, 141, 61, 0.15)" : "rgba(0,0,0,0.04)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "0.85rem",
              fontWeight: 700,
              color: i === focusIdx ? C.goldDark : C.charcoalMid,
              flexShrink: 0,
              transition: "all 0.1s ease",
            }}
          >
            {cmd.icon}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: "0.82rem",
                fontWeight: 600,
                color: i === focusIdx ? C.goldDark : C.charcoal,
              }}
            >
              {cmd.label}
            </div>
            <div
              style={{
                fontSize: "0.69rem",
                color: C.charcoalLight,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {cmd.description}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

export interface NoteEditorHandles {
  insertSyntax: (syntax: string) => void;
  insertImage: (file: File) => Promise<void>;
  insertChildPageLink: (noteId: string, title?: string) => void;
  insertChildPageNode: (pageId: string) => void;
  insertBookmarkNode: (url: string) => void;
  insertToggleBlock: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  focus: () => void;
}

export interface NoteEditorProps {
  content: string;
  onChange: (val: string) => void;
  attachments?: Record<string, string>;
  onAttachmentsChange?: (attachments: Record<string, string>) => void;
  placeholder?: string;
  isSourceMode?: boolean;
  onInsertChildPage?: () => void;
  onSelectNote?: (noteId: string) => void;
  allNotes?: NoteItem[];
  noteId?: string;
}

export const NoteEditor = forwardRef<NoteEditorHandles, NoteEditorProps>(function NoteEditor(
  {
    content,
    onChange,
    placeholder,
    isSourceMode = false,
    onInsertChildPage,
    onSelectNote,
    allNotes = [],
    noteId,
  },
  ref
) {
  const [slashActive, setSlashActive] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const [slashCoords, setSlashCoords] = useState<{ top: number; left: number } | null>(null);
  const [urlPasteState, setUrlPasteState] = useState<{
    url: string;
    coords: { top: number; left: number } | null;
    hasSelection: boolean;
    selectedText: string;
    from: number;
    to: number;
  } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const isComposingRef = useRef(false);
  const isInternalChangeRef = useRef(false);
  const currentNoteIdRef = useRef<string | undefined>(noteId);
  const cursorPositionRef = useRef<{ start: number; end: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sourceTextareaRef = useRef<HTMLTextAreaElement>(null);

  // ソースモード時: 画面全体の残り高さを全画面表示スペースとして確保し、コンテンツ量に応じて自動リサイズ & カーソル位置復元
  useEffect(() => {
    if (!isSourceMode || !sourceTextareaRef.current) return;

    const updateHeight = () => {
      if (!sourceTextareaRef.current) return;
      sourceTextareaRef.current.style.height = "auto";
      const scrollH = sourceTextareaRef.current.scrollHeight;
      const viewportAvailableH = typeof window !== "undefined" ? Math.max(360, window.innerHeight - 240) : 480;
      sourceTextareaRef.current.style.height = `${Math.max(viewportAvailableH, scrollH)}px`;

      if (cursorPositionRef.current) {
        const { start, end } = cursorPositionRef.current;
        sourceTextareaRef.current.setSelectionRange(start, end);
      }
    };

    updateHeight();
    window.addEventListener("resize", updateHeight);
    return () => window.removeEventListener("resize", updateHeight);
  }, [content, isSourceMode]);

  // Tiptap エディタ初期化
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: false,
        underline: false,
        heading: { levels: [1, 2, 3] },
        codeBlock: { HTMLAttributes: { class: "arca-tiptap-code-block" } },
        blockquote: { HTMLAttributes: { class: "arca-tiptap-blockquote" } },
        bulletList: { HTMLAttributes: { class: "arca-tiptap-bullet-list" } },
        orderedList: { HTMLAttributes: { class: "arca-tiptap-ordered-list" } },
        horizontalRule: { HTMLAttributes: { class: "arca-tiptap-hr" } },
      }),
      Underline,
      ClearMarksOnEnter,
      HistoryKeymap,
      Placeholder.configure({
        placeholder:
          placeholder ||
          "Markdownで書き始める…（/ でブロック挿入）",
      }),
      Link.configure({
        autolink: true,
        openOnClick: false,
        HTMLAttributes: {
          class: "arca-tiptap-link",
        },
      }),
      TaskList.configure({
        HTMLAttributes: { class: "arca-tiptap-task-list" },
      }),
      CustomTaskItem.configure({
        nested: false,
        HTMLAttributes: { class: "arca-tiptap-task-item" },
      }),
      CustomImageNode,
      ChildPageNode,
      BookmarkNode,
      ToggleBlockNode,
      Markdown.configure({
        html: false,
        tightLists: true,
        bulletListMarker: "-",
        linkify: false,
      }),
    ],
    content: content || "",
    editorProps: {
      attributes: {
        class: "arca-tiptap-prose arca-scroll",
      },
      handleDOMEvents: {
        compositionstart: () => {
          isComposingRef.current = true;
          return false;
        },
        compositionupdate: () => {
          isComposingRef.current = true;
          return false;
        },
        compositionend: () => {
          isComposingRef.current = false;
          return false;
        },
        paste: (view, event) => {
          const items = event.clipboardData?.items;
          if (items) {
            for (let i = 0; i < items.length; i++) {
              if (items[i].type.startsWith("image/")) {
                const file = items[i].getAsFile();
                if (file) {
                  event.preventDefault();
                  handleUploadAndInsert(file);
                  return true;
                }
              }
            }
          }

          // URLペーストの検知とポップアップ選択
          const text = event.clipboardData?.getData("text/plain")?.trim();
          if (text && isValidUrl(text)) {
            event.preventDefault();
            const { from, to } = view.state.selection;
            const hasSelection = from !== to;
            const selectedText = hasSelection ? view.state.doc.textBetween(from, to, " ") : "";

            try {
              const coords = view.coordsAtPos(from);
              const top = coords.bottom + 8;
              const left = Math.max(16, Math.min(coords.left, window.innerWidth - 280));
              setUrlPasteState({
                url: text,
                coords: { top, left },
                hasSelection,
                selectedText,
                from,
                to,
              });
            } catch {
              setUrlPasteState({
                url: text,
                coords: null,
                hasSelection,
                selectedText,
                from,
                to,
              });
            }
            return true;
          }

          return false;
        },
        drop: (_view, event) => {
          const files = event.dataTransfer?.files;
          if (files) {
            for (let i = 0; i < files.length; i++) {
              if (files[i].type.startsWith("image/")) {
                event.preventDefault();
                handleUploadAndInsert(files[i]);
                return true;
              }
            }
          }
          return false;
        },
      },
    },
    onUpdate: ({ editor: ed }) => {
      try {
        isInternalChangeRef.current = true;
        const rawMd = (ed.storage as any).markdown?.getMarkdown?.() ?? ed.getHTML();
        const cleanMd = normalizeMarkdown(rawMd);
        onChange(cleanMd);

        // スラッシュコマンド判定（IME変換中は誤発火しない）
        if (!isComposingRef.current) {
          const { from } = ed.state.selection;
          const textBefore = ed.state.doc.textBetween(Math.max(0, from - 20), from, "\n", " ");
          const match = textBefore.match(/(?:^|\s)\/([\w\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]*)$/);
          if (match) {
            setSlashActive(true);
            setSlashQuery(match[1]);

            try {
              const coords = ed.view.coordsAtPos(from);
              const top = coords.bottom + 8;
              const left = Math.max(16, Math.min(coords.left, window.innerWidth - 260));
              setSlashCoords({ top, left });
            } catch {
              setSlashCoords(null);
            }
          } else {
            setSlashActive(false);
            setSlashCoords(null);
          }
        }
      } catch (err) {
        console.error("Markdown serialization error", err);
      }
    },
  });

  // 外部からの content 変更（別ノートを開いた時やソース切替時）を同期
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;

    // ノートが切り替わった場合（別ノートの表示）
    const isNoteChanged = noteId !== undefined && noteId !== currentNoteIdRef.current;
    if (isNoteChanged) {
      currentNoteIdRef.current = noteId;
      editor.commands.setContent(content || "");
      return;
    }

    // ユーザー自身による入力の直後のエコーバックならsetContentを絶対に呼ばない（カーソル飛び完全防止）
    if (isInternalChangeRef.current) {
      isInternalChangeRef.current = false;
      return;
    }

    // 外部からの明示的な変更かつエディタにフォーカスがない場合のみ安全に同期
    if (!editor.isFocused && !isComposingRef.current) {
      const currentMd = (editor.storage as any).markdown?.getMarkdown?.();
      const cleanCurrent = normalizeMarkdown(currentMd);
      const cleanProp = normalizeMarkdown(content);
      if (cleanProp !== cleanCurrent) {
        editor.commands.setContent(content || "");
      }
    }
  }, [content, editor, noteId]);

  // Firebase Storage へのアップロード ＆ URL 挿入
  const handleUploadAndInsert = useCallback(
    async (file: File) => {
      if (!editor || editor.isDestroyed) return;
      setIsUploading(true);
      try {
        const result = await uploadNoteImage(file);
        if (!editor || editor.isDestroyed) return;
        editor
          .chain()
          .focus()
          .setImage({
            src: result.url,
            alt: result.name,
          })
          .run();
      } catch (err) {
        console.error("画像アップロードに失敗しました:", err);
      } finally {
        setIsUploading(false);
      }
    },
    [editor]
  );

  // 隠しファイル選択 input からの画像挿入
  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await handleUploadAndInsert(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // 外部から呼ばれるハンドル
  useImperativeHandle(
    ref,
    () => ({
      insertSyntax: (syntax: string) => {
        if (!editor || editor.isDestroyed) return;
        if (syntax.startsWith("# ")) editor.chain().focus().toggleHeading({ level: 1 }).run();
        else if (syntax.startsWith("## ")) editor.chain().focus().toggleHeading({ level: 2 }).run();
        else if (syntax.startsWith("### ")) editor.chain().focus().toggleHeading({ level: 3 }).run();
        else if (syntax.startsWith("- [ ] ")) editor.chain().focus().toggleTaskList().run();
        else if (syntax.startsWith("- ")) editor.chain().focus().toggleBulletList().run();
        else if (syntax.startsWith("1. ")) editor.chain().focus().toggleOrderedList().run();
        else if (syntax.startsWith("> ")) editor.chain().focus().toggleBlockquote().run();
        else if (syntax.startsWith("< ")) editor.chain().focus().insertToggleBlock().run();
        else if (syntax.startsWith("```")) editor.chain().focus().toggleCodeBlock().run();
        else if (syntax.startsWith("---")) editor.chain().focus().setHorizontalRule().run();
        else editor.chain().focus().insertContent(syntax).run();
      },
      insertImage: async (file: File) => {
        await handleUploadAndInsert(file);
      },
      insertChildPageNode: (pageId: string) => {
        if (!editor || editor.isDestroyed) return;
        editor
          .chain()
          .focus()
          .insertContent([
            {
              type: "childPage",
              attrs: { pageId },
            },
            {
              type: "paragraph",
            },
          ])
          .run();
      },
      insertChildPageLink: (noteId: string) => {
        if (!editor || editor.isDestroyed) return;
        editor
          .chain()
          .focus()
          .insertContent([
            {
              type: "childPage",
              attrs: { pageId: noteId },
            },
            {
              type: "paragraph",
            },
          ])
          .run();
      },
      insertBookmarkNode: (url: string) => {
        if (!editor || editor.isDestroyed) return;
        editor
          .chain()
          .focus()
          .insertContent([
            {
              type: "bookmark",
              attrs: { url },
            },
            {
              type: "paragraph",
            },
          ])
          .run();
      },
      insertToggleBlock: () => {
        if (!editor || editor.isDestroyed) return;
        editor.chain().focus().insertToggleBlock().run();
      },
      undo: () => {
        if (!editor || editor.isDestroyed) return;
        editor.commands.undo();
      },
      redo: () => {
        if (!editor || editor.isDestroyed) return;
        editor.commands.redo();
      },
      canUndo: () => (!editor || editor.isDestroyed ? false : (editor.can().undo() ?? false)),
      canRedo: () => (!editor || editor.isDestroyed ? false : (editor.can().redo() ?? false)),
      focus: () => {
        if (!editor || editor.isDestroyed) return;
        editor.commands.focus();
      },
    }),
    [editor, handleUploadAndInsert]
  );

  const handleSlashSelect = (cmd: SlashCommand) => {
    if (!editor || editor.isDestroyed) return;
    setSlashActive(false);
    setSlashCoords(null);
    const { from } = editor.state.selection;
    const textBefore = editor.state.doc.textBetween(Math.max(0, from - 20), from, "\n", " ");
    const match = textBefore.match(/(?:^|\s)\/([\w\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]*)$/);
    if (match) {
      const deleteLen = match[0].length;
      editor.chain().focus().deleteRange({ from: from - deleteLen, to: from }).run();
    }
    cmd.action(editor, {
      openImageDialog: () => {
        fileInputRef.current?.click();
      },
      insertChildPage: () => {
        onInsertChildPage?.();
      },
    });
  };

  const handleUrlPasteSelect = (option: UrlPasteOption) => {
    if (!editor || editor.isDestroyed || !urlPasteState) return;
    const { url, hasSelection, from, to } = urlPasteState;
    setUrlPasteState(null);

    if (option === "bookmark") {
      // Webブックマークカード作成: BookmarkNode を挿入
      if (hasSelection) {
        editor.chain().focus().deleteRange({ from, to }).run();
      }
      editor
        .chain()
        .focus()
        .insertContent([
          {
            type: "bookmark",
            attrs: { url },
          },
          {
            type: "paragraph",
          },
        ])
        .run();
    } else if (option === "link") {
      // インラインリンクとして挿入
      if (hasSelection) {
        editor.chain().focus().setLink({ href: url }).run();
      } else {
        editor.chain().focus().insertContent(`[${url}](${url})`).run();
      }
    } else {
      // 通常のテキストとして挿入
      if (hasSelection) {
        editor.chain().focus().deleteRange({ from, to }).run();
      }
      editor.chain().focus().insertContent(url).run();
    }
  };

  // ソースモード（生Markdownテキストエリア）
  const handleSourceChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const target = e.target;
    cursorPositionRef.current = {
      start: target.selectionStart,
      end: target.selectionEnd,
    };
    onChange(target.value);
  };

  if (isSourceMode) {
    return (
      <div
        className="w-full flex-1 flex flex-col min-h-0"
        style={{
          position: "relative",
          width: "100%",
          paddingBottom: "0.5rem",
        }}
      >
        <div className="flex items-center justify-between mb-2.5 shrink-0">
          <div
            style={{
              fontSize: "0.72rem",
              fontWeight: 600,
              color: "var(--accent-gold-dark)",
              background: "var(--accent-gold-faint)",
              padding: "0.25rem 0.75rem",
              borderRadius: "8px",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
            }}
          >
            <span>Markdown ソース編集モード</span>
          </div>
          <span className="text-[0.72rem] text-charcoal-light font-medium">
            文字数: {content.length}
          </span>
        </div>
        <textarea
          ref={sourceTextareaRef}
          value={content}
          onChange={handleSourceChange}
          placeholder={placeholder || "Markdownで書き始める…"}
          className="arca-scroll w-full flex-1 resize-none min-h-[320px]"
          style={{
            display: "block",
            width: "100%",
            minHeight: "calc(100dvh - 240px)",
            background: "transparent",
            border: "none",
            outline: "none",
            fontSize: "0.95rem",
            lineHeight: 1.85,
            color: "var(--text-main)",
            fontFamily: `"SF Mono", Menlo, Monaco, Consolas, monospace`,
            padding: 0,
            paddingBottom: "calc(30vh + 3rem)",
            boxSizing: "border-box",
          }}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        minHeight: "120px",
        paddingBottom: "calc(25vh + 3rem)",
      }}
      onClick={() => {
        if (editor && !editor.isFocused) {
          editor.commands.focus();
        }
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileInputChange}
        style={{ display: "none" }}
      />

      {isUploading && (
        <div
          style={{
            position: "absolute",
            top: "-1.5rem",
            right: 0,
            zIndex: 10,
            fontSize: "0.75rem",
            fontWeight: 600,
            color: C.goldDark,
            background: C.goldFaint,
            padding: "0.25rem 0.65rem",
            borderRadius: "9999px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
            animation: "pulse 1.5s infinite",
          }}
        >
          画像をアップロード中...
        </div>
      )}

      <NoteEditorContext.Provider value={{ allNotes: allNotes || [], onSelectNote }}>
        <EditorContent editor={editor} />
      </NoteEditorContext.Provider>

      {slashActive && (
        <SlashMenu
          query={slashQuery}
          coords={slashCoords}
          onSelect={handleSlashSelect}
          onDismiss={() => {
            setSlashActive(false);
            setSlashCoords(null);
          }}
        />
      )}

      {urlPasteState && (
        <UrlPasteMenu
          url={urlPasteState.url}
          coords={urlPasteState.coords}
          onSelect={handleUrlPasteSelect}
          onDismiss={() => setUrlPasteState(null)}
        />
      )}

      {/* Tiptap / Apple HIG スタイル定義 */}
      <style>{`
        .arca-tiptap-prose {
          outline: none;
          min-height: 100px;
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Hiragino Sans", "Segoe UI", sans-serif;
          font-size: 1.02rem;
          line-height: 1.9;
          color: var(--text-main);
          letter-spacing: 0.005em;
        }

        /* プレースホルダー */
        .arca-tiptap-prose p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: var(--text-xmuted);
          pointer-events: none;
          height: 0;
          white-space: pre-wrap;
          line-height: 1.8;
        }

        /* 見出し（リアルタイム文字拡大） */
        .arca-tiptap-prose h1 {
          font-size: 1.95rem;
          font-weight: 750;
          color: var(--text-main);
          letter-spacing: -0.03em;
          line-height: 1.25;
          margin: 1.6rem 0 0.8rem;
        }
        .arca-tiptap-prose h2 {
          font-size: 1.45rem;
          font-weight: 700;
          color: var(--text-main);
          letter-spacing: -0.02em;
          line-height: 1.32;
          margin: 1.35rem 0 0.65rem;
        }
        .arca-tiptap-prose h3 {
          font-size: 1.15rem;
          font-weight: 650;
          color: var(--text-main);
          letter-spacing: -0.015em;
          line-height: 1.38;
          margin: 1.1rem 0 0.5rem;
        }

        /* リスト */
        .arca-tiptap-prose ul {
          list-style-type: disc;
          padding-left: 1.5rem;
          margin: 0.6rem 0 1rem;
        }
        .arca-tiptap-prose ol {
          list-style-type: decimal;
          padding-left: 1.5rem;
          margin: 0.6rem 0 1rem;
        }
        .arca-tiptap-prose li {
          margin-bottom: 0.35rem;
          line-height: 1.8;
          color: var(--text-main);
        }

        /* タスクリスト（チェックボックス） */
        .arca-tiptap-prose ul[data-type="taskList"],
        .arca-tiptap-prose ul.arca-tiptap-task-list {
          list-style: none !important;
          padding-left: 0.2rem !important;
          margin: 0.5rem 0 !important;
        }
        .arca-tiptap-prose li[data-type="taskItem"],
        .arca-tiptap-prose li.arca-tiptap-task-item {
          display: flex !important;
          flex-direction: row !important;
          align-items: flex-start !important;
          gap: 0.55rem !important;
          margin-bottom: 0.35rem !important;
          list-style: none !important;
        }
        .arca-tiptap-prose li[data-type="taskItem"] > label,
        .arca-tiptap-prose li.arca-tiptap-task-item > label {
          flex: 0 0 auto !important;
          display: inline-flex !important;
          align-items: center !important;
          margin-top: 0.25rem !important;
          user-select: none !important;
          line-height: 1 !important;
        }
        .arca-tiptap-prose li[data-type="taskItem"] > label input[type="checkbox"],
        .arca-tiptap-prose li.arca-tiptap-task-item > label input[type="checkbox"] {
          cursor: pointer;
          accent-color: var(--accent-gold);
          width: 15px;
          height: 15px;
          border-radius: 4px;
          margin: 0 !important;
          vertical-align: middle;
        }
        .arca-tiptap-prose li[data-type="taskItem"] > div,
        .arca-tiptap-prose li.arca-tiptap-task-item > div {
          flex: 1 1 auto !important;
          min-width: 0 !important;
          margin: 0 !important;
          padding: 0 !important;
        }
        /* ★★★ 重要: チェックリスト内の段落マージンを排除して改行状態を解消 ★★★ */
        .arca-tiptap-prose li[data-type="taskItem"] > div > p,
        .arca-tiptap-prose li[data-type="taskItem"] p,
        .arca-tiptap-prose li.arca-tiptap-task-item > div > p,
        .arca-tiptap-prose li.arca-tiptap-task-item p {
          margin: 0 !important;
          padding: 0 !important;
          line-height: 1.6 !important;
          display: block !important;
        }
        .arca-tiptap-prose li[data-type="taskItem"][data-checked="true"] > div,
        .arca-tiptap-prose li.arca-tiptap-task-item[data-checked="true"] > div {
          text-decoration: line-through;
          color: var(--text-muted);
        }

        /* 引用ブロック */
        .arca-tiptap-blockquote {
          border-left: 3px solid var(--accent-gold);
          background: var(--accent-gold-faint);
          padding: 0.75rem 1.25rem;
          border-radius: 0 10px 10px 0;
          font-style: italic;
          color: var(--text-mid);
          margin: 1.2rem 0;
        }

        /* インラインコード */
        .arca-tiptap-prose code:not(pre code) {
          font-family: "SF Mono", Menlo, Monaco, Consolas, monospace;
          font-size: 0.88em;
          background: var(--bg-nav-track);
          color: var(--accent-gold-dark);
          padding: 0.15em 0.35em;
          border-radius: 5px;
        }

        /* コードブロック */
        .arca-tiptap-code-block {
          background: #181A20;
          color: #EDE8DF;
          padding: 1rem 1.25rem;
          border-radius: 12px;
          border: 1px solid var(--border-subtle);
          font-family: "SF Mono", Menlo, Monaco, Consolas, monospace;
          font-size: 0.88rem;
          line-height: 1.7;
          overflow-x: auto;
          margin: 1.2rem 0;
        }

        /* リンク */
        .arca-tiptap-link {
          color: var(--accent-gold-dark);
          text-decoration: underline;
          text-underline-offset: 3px;
          transition: color 0.15s;
        }
        .arca-tiptap-link:hover {
          color: var(--accent-gold);
        }

        /* Notion風インライン子ページリンクボタン */
        .arca-tiptap-prose a[href^="note:"] {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.25rem 0.65rem;
          margin: 0.15rem 0.2rem;
          border-radius: 10px;
          background: rgba(181, 141, 61, 0.1);
          color: var(--accent-gold-dark, #8C6D2D);
          font-weight: 600;
          font-size: 0.9em;
          text-decoration: none;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
          transition: all 0.15s ease;
          cursor: pointer;
        }
        .arca-tiptap-prose a[href^="note:"]:hover {
          background: rgba(181, 141, 61, 0.18);
          color: var(--accent-gold, #B58D3D);
          transform: translateY(-1px);
          box-shadow: 0 3px 8px rgba(0, 0, 0, 0.06);
        }

        /* 水平線 */
        .arca-tiptap-hr {
          border: none;
          border-top: 1px solid var(--border-subtle);
          margin: 2rem 0;
        }

        /* 画像 */
        .arca-tiptap-image {
          max-width: 100%;
          border-radius: 16px;
          margin: 1.2rem auto;
          display: block;
          box-shadow: var(--shadow-card);
        }
      `}</style>
    </div>
  );
});
