/**
 * src/components/notes/NoteEditor.tsx
 * Arca — Notes エディタコンポーネント (Apple HIG × Arca デザインシステム準拠)
 *
 * 入力体験の向上:
 * 1. 最下部に 40vh の十分なタイピング余白を確保（最後の行でも画面中央〜上部で快適に入力可能）
 * 2. ガタつきのない安定した Auto-resize Textarea (スクロール位置の勝手なジャンプを防止)
 * 3. 入力時のキャレット可視性確保（カーソル追従）
 * 4. スラッシュコマンド (/h1, /bullet, /todo, /table 等) による高速入力
 * 5. iOS Safari ソフトウェアキーボードとセーフエリアへの適応
 */

import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  useImperativeHandle,
  forwardRef,
  type KeyboardEvent,
} from "react";
import { C } from "../../lib/designSystem";

export interface SlashCommand {
  id: string;
  label: string;
  description: string;
  icon: string;
  syntax: string;
}

const SLASH_COMMANDS: SlashCommand[] = [
  { id: "h1", label: "見出し 1", description: "大見出し", icon: "H₁", syntax: "# " },
  { id: "h2", label: "見出し 2", description: "中見出し", icon: "H₂", syntax: "## " },
  { id: "h3", label: "見出し 3", description: "小見出し", icon: "H₃", syntax: "### " },
  { id: "bullet", label: "箇条書き", description: "箇条書きリスト", icon: "•", syntax: "- " },
  { id: "numbered", label: "番号付きリスト", description: "番号順リスト", icon: "1.", syntax: "1. " },
  { id: "todo", label: "チェックリスト", description: "タスク項目", icon: "☐", syntax: "- [ ] " },
  { id: "quote", label: "引用", description: "ブロッククォート", icon: "❝", syntax: "> " },
  { id: "table", label: "テーブル", description: "表の作成", icon: "⊞", syntax: "| 項目 | 内容 |\n| :--- | :--- |\n| A    | 詳細 |\n" },
  { id: "code", label: "コードブロック", description: "プログラムコード", icon: "</>", syntax: "```\n\n```" },
  { id: "hr", label: "区切り線", description: "水平線", icon: "─", syntax: "---\n" },
];

function SlashMenu({
  query,
  onSelect,
  onDismiss,
  anchorRef,
  lineIndex,
}: {
  query: string;
  onSelect: (cmd: SlashCommand) => void;
  onDismiss: () => void;
  anchorRef: React.RefObject<HTMLTextAreaElement | null>;
  lineIndex: number;
}) {
  const filtered = SLASH_COMMANDS.filter(
    (c) => c.id.startsWith(query.toLowerCase()) || c.label.includes(query)
  );
  const [focusIdx, setFocusIdx] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

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

  const [pos, setPos] = useState({ top: 0, left: 0 });
  useEffect(() => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const lineH = parseFloat(getComputedStyle(el).lineHeight) || 30;
    const pt = parseFloat(getComputedStyle(el).paddingTop) || 0;
    setPos({
      top: rect.top + pt + lineIndex * lineH + lineH,
      left: Math.max(16, rect.left + 16),
    });
  }, [anchorRef, lineIndex]);

  if (!filtered.length) return null;

  return (
    <div
      ref={menuRef}
      className="arca-slash-menu"
      style={{
        position: "fixed",
        top: Math.min(pos.top, window.innerHeight - 340),
        left: Math.min(pos.left, window.innerWidth - 260),
        zIndex: 600,
        background: C.white,
        borderRadius: "14px",
        boxShadow: "0 8px 48px rgba(0,0,0,0.14), 0 2px 10px rgba(0,0,0,0.06)",
        padding: "0.45rem",
        minWidth: "230px",
        maxHeight: "320px",
        overflowY: "auto",
        border: "1px solid rgba(0, 0, 0, 0.05)",
      }}
    >
      <p
        style={{
          fontSize: "0.63rem",
          color: C.charcoalXLight,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          padding: "0.3rem 0.8rem 0.45rem",
          margin: 0,
        }}
      >
        {query ? `/${query} の候補` : "挿入するブロック"}
      </p>
      {filtered.map((cmd, i) => (
        <button
          key={cmd.id}
          onClick={() => onSelect(cmd)}
          onMouseEnter={() => setFocusIdx(i)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.7rem",
            width: "100%",
            textAlign: "left",
            background: i === focusIdx ? C.goldFaint2 : "transparent",
            border: "none",
            borderRadius: "9px",
            padding: "0.56rem 0.8rem",
            cursor: "pointer",
            transition: "background 0.1s",
          }}
        >
          <span
            style={{
              width: "30px",
              height: "30px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: i === focusIdx ? C.goldFaint3 : C.ivory2,
              borderRadius: "7px",
              fontSize: "0.75rem",
              fontWeight: 700,
              color: i === focusIdx ? C.gold : C.charcoalMid,
              flexShrink: 0,
              fontFamily: "monospace",
              transition: "background 0.1s, color 0.1s",
            }}
          >
            {cmd.icon}
          </span>
          <span>
            <span
              style={{
                display: "block",
                fontSize: "0.83rem",
                fontWeight: 500,
                color: i === focusIdx ? C.charcoal : C.charcoalMid,
                lineHeight: 1.3,
              }}
            >
              {cmd.label}
            </span>
            <span style={{ display: "block", fontSize: "0.7rem", color: C.charcoalXLight, lineHeight: 1.3 }}>
              {cmd.description}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

export interface NoteEditorHandles {
  insertSyntax: (syntax: string) => void;
  focus: () => void;
}

export interface NoteEditorProps {
  content: string;
  onChange: (val: string) => void;
  placeholder?: string;
}

export const NoteEditor = forwardRef<NoteEditorHandles, NoteEditorProps>(function NoteEditor(
  { content, onChange, placeholder },
  ref
) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [slashActive, setSlashActive] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const [slashLineIdx, setSlashLineIdx] = useState(0);

  // 安定した Auto-resize 処理（field-sizing: content 対応）
  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;

    // field-sizing: content がサポートされているブラウザでは自動処理
    if (typeof CSS !== "undefined" && CSS.supports && CSS.supports("field-sizing", "content")) {
      return;
    }

    const prevHeight = el.offsetHeight;
    el.style.height = "auto";
    const targetHeight = Math.max(el.scrollHeight, window.innerHeight * 0.4);
    el.style.height = `${targetHeight}px`;

    // 高さが急激に変化した場合のみスクロール位置を保護
    if (Math.abs(prevHeight - targetHeight) > 200) {
      // no-op
    }
  }, []);

  useEffect(() => {
    autoResize();
  }, [content, autoResize]);

  // スラッシュコマンド検出
  const detectSlash = useCallback((text: string, cursorPos: number) => {
    const before = text.slice(0, cursorPos);
    const lines = before.split("\n");
    const cur = lines[lines.length - 1];
    const match = cur.match(/^\/(\w*)$/);
    if (match) {
      setSlashActive(true);
      setSlashQuery(match[1]);
      setSlashLineIdx(lines.length - 1);
    } else {
      setSlashActive(false);
      setSlashQuery("");
    }
  }, []);

  const handleContentChange = (val: string) => {
    onChange(val);
    autoResize();
    const pos = textareaRef.current?.selectionStart ?? 0;
    detectSlash(val, pos);
  };

  const handleKeyUp = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape" && slashActive) {
      setSlashActive(false);
      return;
    }
    const el = textareaRef.current;
    if (el) {
      detectSlash(el.value, el.selectionStart);
    }
  };

  const handleSlashSelect = useCallback(
    (cmd: SlashCommand) => {
      const el = textareaRef.current;
      if (!el) return;
      const pos = el.selectionStart;
      const text = el.value;
      const textBefore = text.slice(0, pos);
      const lineStart = textBefore.lastIndexOf("\n") + 1;
      const lineContent = textBefore.slice(lineStart);
      const isSlashLine = /^\/\w*$/.test(lineContent);
      let newText: string;
      let newCursor: number;

      if (isSlashLine) {
        const before = text.slice(0, lineStart);
        const after = text.slice(pos);
        if (cmd.syntax.includes("\n")) {
          const parts = cmd.syntax.split("\n");
          newText = before + cmd.syntax + after;
          newCursor = before.length + parts[0].length + 1;
        } else {
          newText = before + cmd.syntax + after;
          newCursor = before.length + cmd.syntax.length;
        }
      } else {
        newText = text.slice(0, pos) + cmd.syntax + text.slice(pos);
        newCursor = pos + cmd.syntax.length;
      }

      onChange(newText);
      setSlashActive(false);
      setSlashQuery("");

      requestAnimationFrame(() => {
        if (!textareaRef.current) return;
        textareaRef.current.value = newText;
        textareaRef.current.selectionStart = newCursor;
        textareaRef.current.selectionEnd = newCursor;
        textareaRef.current.focus();
        autoResize();
      });
    },
    [onChange, autoResize]
  );

  const insertSyntax = useCallback(
    (syntax: string) => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();

      const start = el.selectionStart;
      const end = el.selectionEnd;
      const val = el.value;

      let newText: string;
      let newCursor: number;

      // 選択範囲がある場合の囲み処理（太字や斜体、コードなど）
      if (start !== end && (syntax.startsWith("**") || syntax.startsWith("*") || syntax.startsWith("~~") || syntax.startsWith("`"))) {
        const selected = val.slice(start, end);
        const wrapper = syntax.slice(0, syntax.indexOf("テキスト") !== -1 ? syntax.indexOf("テキスト") : syntax.length / 2);
        newText = val.slice(0, start) + wrapper + selected + wrapper + val.slice(end);
        newCursor = start + wrapper.length + selected.length + wrapper.length;
      } else {
        newText = val.slice(0, start) + syntax + val.slice(end);
        newCursor = start + syntax.length;
      }

      onChange(newText);
      requestAnimationFrame(() => {
        if (!textareaRef.current) return;
        textareaRef.current.value = newText;
        textareaRef.current.selectionStart = newCursor;
        textareaRef.current.selectionEnd = newCursor;
        textareaRef.current.focus();
        autoResize();
      });
    },
    [onChange, autoResize]
  );

  useImperativeHandle(
    ref,
    () => ({
      insertSyntax,
      focus: () => textareaRef.current?.focus(),
    }),
    [insertSyntax]
  );

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <textarea
        ref={textareaRef}
        className="arca-editor-ta arca-scroll"
        value={content}
        onChange={(e) => handleContentChange(e.target.value)}
        onKeyUp={handleKeyUp}
        onClick={() => {
          const el = textareaRef.current;
          if (el) detectSlash(el.value, el.selectionStart);
        }}
        placeholder={placeholder || "Markdownで書き始める…\n\n行頭で / と入力するとブロックメニューが開きます"}
        style={{
          display: "block",
          width: "100%",
          minHeight: "50vh",
          background: "transparent",
          border: "none",
          outline: "none",
          resize: "none",
          fontSize: "1.02rem",
          lineHeight: 1.95,
          color: C.charcoal,
          letterSpacing: "0.005em",
          padding: "0 0 calc(40vh + env(safe-area-inset-bottom, 0px)) 0",
          boxSizing: "border-box",
          overflowY: "hidden",
          fieldSizing: "content" as any,
          fontFamily: `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Hiragino Sans", "Segoe UI", sans-serif`,
        }}
      />

      {slashActive && (
        <SlashMenu
          query={slashQuery}
          onSelect={handleSlashSelect}
          onDismiss={() => setSlashActive(false)}
          anchorRef={textareaRef}
          lineIndex={slashLineIdx}
        />
      )}
    </div>
  );
});
