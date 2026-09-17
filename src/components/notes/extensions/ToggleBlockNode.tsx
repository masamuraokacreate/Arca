/**
 * src/components/notes/extensions/ToggleBlockNode.tsx
 * Arca — Tiptap カスタム Node: トグルリスト / 折りたたみブロック (Apple HIG 準拠)
 *
 * 特長:
 * 1. クリックで開閉（展開 / 折りたたみ）できる Notion 風トグルブロック
 * 2. 開閉矢印のスムーズな回転アニメーション（ChevronRight）
 * 3. インラインでのトグルタイトル編集 ＆ 削除機能
 * 4. NodeViewContent により、トグル内部に任意のブロック（段落、リスト等）を自由にネスト可能
 * 5. <details open><summary>タイトル</summary>\n\n本文\n\n</details> 構文で保存・復元
 */

import React, { useState } from "react";
import { Node, mergeAttributes, InputRule } from "@tiptap/core";
import {
  ReactNodeViewRenderer,
  NodeViewWrapper,
  NodeViewContent,
  type NodeViewProps,
} from "@tiptap/react";
import { ChevronRight, Trash2 } from "lucide-react";

export const ToggleBlockComponent: React.FC<NodeViewProps> = (props) => {
  const isOpen = props.node.attrs.isOpen ?? true;
  const title = (props.node.attrs.title as string) ?? "トグル";
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(title);

  const handleToggleOpen = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    props.updateAttributes({
      isOpen: !isOpen,
    });
  };

  const handleTitleBlur = () => {
    setIsEditingTitle(false);
    props.updateAttributes({
      title: titleValue.trim() || "トグル",
    });
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "Escape") {
      e.preventDefault();
      handleTitleBlur();
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    props.deleteNode?.();
  };

  return (
    <NodeViewWrapper
      className="my-3 rounded-2xl border border-stone-200/70 dark:border-stone-800/80 bg-stone-50/50 dark:bg-stone-900/30 transition-all duration-150 overflow-hidden shadow-2xs group/toggle"
      data-toggle-block=""
    >
      {/* ── トグルヘッダー行 ── */}
      <div
        className="flex items-center justify-between gap-2 px-3 py-2 bg-stone-100/60 dark:bg-stone-800/50 hover:bg-stone-150/70 dark:hover:bg-stone-800/80 transition-colors select-none cursor-pointer border-b border-black/[0.03] dark:border-white/[0.04]"
        onClick={handleToggleOpen}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {/* 開閉シェブロンアイコン（回転アニメーション） */}
          <button
            type="button"
            onClick={handleToggleOpen}
            className="w-6 h-6 rounded-lg flex items-center justify-center text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200 hover:bg-black/5 dark:hover:bg-white/10 transition-all cursor-pointer border-none bg-transparent shrink-0"
            title={isOpen ? "折りたたむ" : "展開する"}
            aria-label={isOpen ? "折りたたむ" : "展開する"}
          >
            <ChevronRight
              size={15}
              className={`transition-transform duration-200 ${
                isOpen ? "rotate-90 text-[#B58D3D]" : "rotate-0 text-stone-400"
              }`}
            />
          </button>

          {/* タイトル表示 / 編集 */}
          {isEditingTitle ? (
            <input
              type="text"
              value={titleValue}
              onChange={(e) => setTitleValue(e.target.value)}
              onBlur={handleTitleBlur}
              onKeyDown={handleTitleKeyDown}
              autoFocus
              onClick={(e) => e.stopPropagation()}
              className="flex-1 min-w-0 text-sm font-semibold px-1.5 py-0.5 rounded bg-white dark:bg-stone-800 border border-amber-500/60 outline-none text-charcoal dark:text-stone-100 shadow-2xs"
            />
          ) : (
            <span
              onClick={(e) => {
                e.stopPropagation();
                setIsEditingTitle(true);
              }}
              className="text-sm font-semibold text-charcoal dark:text-stone-200 truncate cursor-text hover:text-[#B58D3D] transition-colors py-0.5 px-1 rounded hover:bg-black/5 dark:hover:bg-white/5"
              title="クリックしてタイトルを編集"
            >
              {title}
            </span>
          )}
        </div>

        {/* 削除ボタン（ホバー時に表示） */}
        <button
          type="button"
          onClick={handleDelete}
          className="w-6 h-6 rounded-lg flex items-center justify-center text-stone-400 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover/toggle:opacity-100 transition-all cursor-pointer border-none bg-transparent shrink-0"
          title="トグルブロックを削除"
          aria-label="トグルブロックを削除"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* ── ネストコンテンツ領域 ── */}
      <div
        className={`px-4 py-2 transition-all duration-200 ${
          isOpen ? "block opacity-100" : "hidden opacity-0"
        }`}
      >
        <NodeViewContent className="outline-none min-h-[32px] prose dark:prose-invert max-w-none text-stone-800 dark:text-stone-200" />
      </div>
    </NodeViewWrapper>
  );
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    toggleBlock: {
      /**
       * Insert a toggle block
       */
      insertToggleBlock: (options?: {
        title?: string;
        isOpen?: boolean;
      }) => ReturnType;
    };
  }
}

export const ToggleBlockNode = Node.create({
  name: "toggleBlock",
  group: "block",
  content: "block+",
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      title: {
        default: "トグル",
        parseHTML: (element) => {
          const summary = element.querySelector("summary");
          return summary?.textContent || "トグル";
        },
      },
      isOpen: {
        default: true,
        parseHTML: (element) => element.hasAttribute("open"),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "details[data-toggle-block]",
      },
      {
        tag: "details",
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "details",
      mergeAttributes(HTMLAttributes, {
        "data-toggle-block": "",
        ...(node.attrs.isOpen ? { open: "" } : {}),
      }),
      ["summary", node.attrs.title || "トグル"],
      ["div", { class: "toggle-content" }, 0],
    ];
  },

  addCommands() {
    return {
      insertToggleBlock:
        (options) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: {
              title: options?.title || "トグル",
              isOpen: options?.isOpen ?? true,
            },
            content: [
              {
                type: "paragraph",
              },
            ],
          });
        },
    };
  },

  addInputRules() {
    return [
      new InputRule({
        find: /^\s*<(?:\s+(.*))?\s$/,
        handler: ({ range, match, chain }) => {
          const rawTitle = match[1]?.trim();
          const title = rawTitle || "トグル";
          chain()
            .deleteRange(range)
            .insertToggleBlock({ title, isOpen: true })
            .run();
        },
      }),
    ];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          const title = node.attrs.title || "トグル";
          const openAttr = node.attrs.isOpen ? " open" : "";
          state.write(`<details${openAttr}><summary>${title}</summary>\n\n`);
          state.renderContent(node);
          state.write(`\n\n</details>\n`);
        },
        parse: {
          updateDOM(element: HTMLElement) {
            const details = Array.from(element.querySelectorAll("details"));
            details.forEach((d) => {
              d.setAttribute("data-toggle-block", "");
            });
          },
        },
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ToggleBlockComponent);
  },
});
