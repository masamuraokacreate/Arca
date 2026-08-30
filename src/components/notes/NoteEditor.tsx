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
 * 8. 最下部 35vh 余白 & Apple風タイポグラフィ
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
import { Image } from "@tiptap/extension-image";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import { Markdown } from "tiptap-markdown";
import { Extension } from "@tiptap/core";
import { C } from "../../lib/designSystem";
import { uploadNoteImage } from "../../services/imageUploadService";

/**
 * Markdown 出力時の不要な過剰エスケープ（\*, \_, &lt;, &gt; 等）を正規化・クレンジングする
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
    // 単独のバックスラッシュエスケープ（\* や \_）を復元
    .replace(/\\([*_~`])/g, "$1");
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

export interface SlashCommand {
  id: string;
  label: string;
  description: string;
  icon: string;
  action: (editor: any, triggers?: { openImageDialog?: () => void }) => void;
}

export const SLASH_COMMANDS: SlashCommand[] = [
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
        setFocusIdx((i) => (i + 1) % filtered.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIdx((i) => (i - 1 + filtered.length) % filtered.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        onSelect(filtered[focusIdx]);
      } else if (e.key === "Escape") {
        onDismiss();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
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
        background: "rgba(255, 255, 255, 0.94)",
        backdropFilter: "blur(24px) saturate(180%)",
        WebkitBackdropFilter: "blur(24px) saturate(180%)",
        borderRadius: "16px",
        boxShadow: "0 10px 40px rgba(0,0,0,0.12), 0 2px 10px rgba(0,0,0,0.06)",
        padding: "0.45rem",
        width: "250px",
        maxHeight: "320px",
        overflowY: "auto",
        border: "1px solid rgba(255, 255, 255, 0.8)",
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
  focus: () => void;
}

export interface NoteEditorProps {
  content: string;
  onChange: (val: string) => void;
  attachments?: Record<string, string>;
  onAttachmentsChange?: (attachments: Record<string, string>) => void;
  placeholder?: string;
  isSourceMode?: boolean;
}

export const NoteEditor = forwardRef<NoteEditorHandles, NoteEditorProps>(function NoteEditor(
  { content, onChange, placeholder, isSourceMode = false },
  ref
) {
  const [slashActive, setSlashActive] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const [slashCoords, setSlashCoords] = useState<{ top: number; left: number } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const isComposingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Tiptap エディタ初期化
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: { HTMLAttributes: { class: "arca-tiptap-code-block" } },
        blockquote: { HTMLAttributes: { class: "arca-tiptap-blockquote" } },
        bulletList: { HTMLAttributes: { class: "arca-tiptap-bullet-list" } },
        orderedList: { HTMLAttributes: { class: "arca-tiptap-ordered-list" } },
        horizontalRule: { HTMLAttributes: { class: "arca-tiptap-hr" } },
      }),
      Underline,
      ClearMarksOnEnter,
      Placeholder.configure({
        placeholder:
          placeholder ||
          "Markdownで書き始める…\n\n行頭で # や - または / を入力するとスタイルが適用されます",
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
      TaskItem.configure({
        nested: false,
        HTMLAttributes: { class: "arca-tiptap-task-item" },
      }),
      Image.configure({
        inline: true,
        allowBase64: true,
        HTMLAttributes: {
          class: "arca-tiptap-image rounded-2xl",
        },
      }),
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
        paste: (_view, event) => {
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
    if (!editor || isComposingRef.current) return;
    const currentMd = (editor.storage as any).markdown?.getMarkdown?.();
    const cleanCurrent = normalizeMarkdown(currentMd);
    const cleanProp = normalizeMarkdown(content);
    if (cleanProp !== cleanCurrent && !editor.isFocused) {
      editor.commands.setContent(content || "");
    }
  }, [content, editor]);

  // Firebase Storage へのアップロード ＆ URL 挿入
  const handleUploadAndInsert = useCallback(
    async (file: File) => {
      if (!editor) return;
      setIsUploading(true);
      try {
        const result = await uploadNoteImage(file);
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
        if (!editor) return;
        if (syntax.startsWith("# ")) editor.chain().focus().toggleHeading({ level: 1 }).run();
        else if (syntax.startsWith("## ")) editor.chain().focus().toggleHeading({ level: 2 }).run();
        else if (syntax.startsWith("### ")) editor.chain().focus().toggleHeading({ level: 3 }).run();
        else if (syntax.startsWith("- [ ] ")) editor.chain().focus().toggleTaskList().run();
        else if (syntax.startsWith("- ")) editor.chain().focus().toggleBulletList().run();
        else if (syntax.startsWith("1. ")) editor.chain().focus().toggleOrderedList().run();
        else if (syntax.startsWith("> ")) editor.chain().focus().toggleBlockquote().run();
        else if (syntax.startsWith("```")) editor.chain().focus().toggleCodeBlock().run();
        else if (syntax.startsWith("---")) editor.chain().focus().setHorizontalRule().run();
        else editor.chain().focus().insertContent(syntax).run();
      },
      insertImage: async (file: File) => {
        await handleUploadAndInsert(file);
      },
      focus: () => {
        editor?.commands.focus();
      },
    }),
    [editor, handleUploadAndInsert]
  );

  const handleSlashSelect = (cmd: SlashCommand) => {
    if (!editor) return;
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
    });
  };

  // ソースモード（生Markdownテキストエリア）
  if (isSourceMode) {
    return (
      <div
        style={{
          position: "relative",
          width: "100%",
          minHeight: "350px",
          paddingBottom: "35vh",
        }}
      >
        <div
          style={{
            fontSize: "0.75rem",
            fontWeight: 600,
            color: C.goldDark,
            background: C.goldFaint,
            padding: "0.3rem 0.8rem",
            borderRadius: "6px",
            display: "inline-block",
            marginBottom: "0.8rem",
          }}
        >
          Markdown ソース編集モード
        </div>
        <textarea
          value={content}
          onChange={(e) => onChange(normalizeMarkdown(e.target.value))}
          placeholder={placeholder || "Markdownで書き始める…"}
          className="arca-scroll"
          style={{
            display: "block",
            width: "100%",
            minHeight: "380px",
            background: "transparent",
            border: "none",
            outline: "none",
            resize: "none",
            fontSize: "0.95rem",
            lineHeight: 1.85,
            color: C.charcoal,
            fontFamily: `"SF Mono", Menlo, Monaco, Consolas, monospace`,
            padding: 0,
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
        minHeight: "350px",
        paddingBottom: "35vh",
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

      <EditorContent editor={editor} />

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

      {/* Tiptap / Apple HIG スタイル定義 */}
      <style>{`
        .arca-tiptap-prose {
          outline: none;
          min-height: 280px;
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Hiragino Sans", "Segoe UI", sans-serif;
          font-size: 1.02rem;
          line-height: 1.9;
          color: ${C.charcoal};
          letter-spacing: 0.005em;
        }

        /* プレースホルダー */
        .arca-tiptap-prose p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: ${C.charcoalXLight};
          pointer-events: none;
          height: 0;
          white-space: pre-wrap;
          line-height: 1.8;
        }

        /* 見出し（リアルタイム文字拡大） */
        .arca-tiptap-prose h1 {
          font-size: 1.95rem;
          font-weight: 750;
          color: ${C.charcoal};
          letter-spacing: -0.03em;
          line-height: 1.25;
          margin: 1.6rem 0 0.8rem;
        }
        .arca-tiptap-prose h2 {
          font-size: 1.45rem;
          font-weight: 700;
          color: ${C.charcoal};
          letter-spacing: -0.02em;
          line-height: 1.32;
          margin: 1.35rem 0 0.65rem;
        }
        .arca-tiptap-prose h3 {
          font-size: 1.15rem;
          font-weight: 650;
          color: ${C.charcoal};
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
        }

        /* タスクリスト（チェックボックス） */
        .arca-tiptap-prose ul[data-type="taskList"] {
          list-style: none;
          padding-left: 0.2rem;
        }
        .arca-tiptap-prose li[data-type="taskItem"] {
          display: flex;
          align-items: flex-start;
          gap: 0.6rem;
          margin-bottom: 0.4rem;
        }
        .arca-tiptap-prose li[data-type="taskItem"] > label {
          margin-top: 0.3rem;
          user-select: none;
        }
        .arca-tiptap-prose li[data-type="taskItem"] > label input[type="checkbox"] {
          cursor: pointer;
          accent-color: ${C.gold};
          width: 15px;
          height: 15px;
          border-radius: 4px;
        }
        .arca-tiptap-prose li[data-type="taskItem"][data-checked="true"] > div {
          text-decoration: line-through;
          color: ${C.charcoalLight};
        }

        /* 引用ブロック */
        .arca-tiptap-blockquote {
          border-left: 3px solid ${C.gold};
          background: ${C.goldFaint};
          padding: 0.75rem 1.25rem;
          border-radius: 0 10px 10px 0;
          font-style: italic;
          color: ${C.charcoalMid};
          margin: 1.2rem 0;
        }

        /* インラインコード */
        .arca-tiptap-prose code:not(pre code) {
          font-family: "SF Mono", Menlo, Monaco, Consolas, monospace;
          font-size: 0.88em;
          background: rgba(0, 0, 0, 0.05);
          color: #b54a3d;
          padding: 0.15em 0.35em;
          border-radius: 5px;
        }

        /* コードブロック */
        .arca-tiptap-code-block {
          background: #242220;
          color: #EDE8DF;
          padding: 1rem 1.25rem;
          border-radius: 12px;
          font-family: "SF Mono", Menlo, Monaco, Consolas, monospace;
          font-size: 0.88rem;
          line-height: 1.7;
          overflow-x: auto;
          margin: 1.2rem 0;
        }

        /* リンク */
        .arca-tiptap-link {
          color: ${C.goldDark};
          text-decoration: underline;
          text-underline-offset: 3px;
          transition: color 0.15s;
        }
        .arca-tiptap-link:hover {
          color: ${C.gold};
        }

        /* 水平線 */
        .arca-tiptap-hr {
          border: none;
          border-top: 1px solid rgba(0, 0, 0, 0.08);
          margin: 2rem 0;
        }

        /* 画像 */
        .arca-tiptap-image {
          max-width: 100%;
          border-radius: 16px;
          margin: 1.2rem auto;
          display: block;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06);
        }
      `}</style>
    </div>
  );
});
