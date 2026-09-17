/**
 * src/components/notes/extensions/BookmarkNode.tsx
 * Arca — Tiptap カスタム Node: Webブックマークカード (Notion風スマートカード)
 *
 * 特長:
 * 1. ブロック要素（group: "block", atom: true）として動作
 * 2. URL からホスト名と Google Favicon API によるファビコンを自動解決
 * 3. エディタ内でもリアルタイムに美しいカード形式で表示
 * 4. クリックで外部リンクを開き、右上の削除ボタンで即座に削除可能
 * 5. tiptap-markdown と連携し [bookmark:URL] 構文で保存・復元
 */

import React from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { ExternalLink, X, Globe } from "lucide-react";

export const BookmarkComponent: React.FC<NodeViewProps> = (props) => {
  const url = (props.node.attrs.url as string) || "";

  let hostname = "";
  try {
    hostname = new URL(url).hostname;
  } catch {
    hostname = url;
  }

  const handleCardClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    props.deleteNode?.();
  };

  return (
    <NodeViewWrapper
      as="div"
      className="my-3 select-none"
      data-bookmark-node={url}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={handleCardClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleCardClick(e as any);
          }
        }}
        className="group relative flex items-center justify-between gap-3 p-3.5 rounded-xl border border-stone-200/80 dark:border-stone-700/80 bg-white/80 dark:bg-stone-800/80 hover:bg-stone-50 dark:hover:bg-stone-750 transition-all duration-200 shadow-2xs hover:shadow-xs cursor-pointer max-w-xl"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {hostname ? (
            <img
              src={`https://www.google.com/s2/favicons?domain=${hostname}&sz=32`}
              alt=""
              className="w-5 h-5 rounded shrink-0 object-contain"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <Globe className="w-5 h-5 text-amber-500/80 shrink-0" />
          )}
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-xs font-semibold text-charcoal dark:text-stone-200 truncate group-hover:text-[#B58D3D] transition-colors">
              {hostname || url}
            </span>
            <span className="text-[0.7rem] text-charcoal-light dark:text-stone-400 truncate">
              {url}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <ExternalLink className="w-3.5 h-3.5 text-charcoal-light dark:text-stone-400 group-hover:text-[#B58D3D] transition-colors" />
          <button
            type="button"
            onClick={handleDelete}
            className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded flex items-center justify-center text-stone-400 hover:text-red-500 hover:bg-stone-200/50 dark:hover:bg-stone-700/50 transition-all cursor-pointer border-none bg-transparent"
            title="ブックマークを削除"
            aria-label="ブックマークを削除"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>
    </NodeViewWrapper>
  );
};

export const BookmarkNode = Node.create({
  name: "bookmark",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      url: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-url") || "",
        renderHTML: (attributes) => ({
          "data-url": attributes.url,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="bookmark"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes({ "data-type": "bookmark" }, HTMLAttributes)];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          state.write(`[bookmark:${node.attrs.url}]\n\n`);
        },
        parse: {
          updateDOM(element: HTMLElement) {
            const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
            const nodesToReplace: { node: Text; parent: ParentNode; newNodes: globalThis.Node[] }[] = [];
            let currentNode = walker.nextNode();
            while (currentNode) {
              const textNode = currentNode as Text;
              const val = textNode.nodeValue || "";
              if (val.includes("[bookmark:")) {
                const regex = /\[bookmark:(https?:\/\/[^\]]+)\]/g;
                let lastIndex = 0;
                let match: RegExpExecArray | null;
                const newNodes: globalThis.Node[] = [];
                while ((match = regex.exec(val)) !== null) {
                  if (match.index > lastIndex) {
                    newNodes.push(document.createTextNode(val.substring(lastIndex, match.index)));
                  }
                  const div = document.createElement("div");
                  div.setAttribute("data-type", "bookmark");
                  div.setAttribute("data-url", match[1]);
                  newNodes.push(div);
                  lastIndex = match.index + match[0].length;
                }
                if (lastIndex < val.length) {
                  newNodes.push(document.createTextNode(val.substring(lastIndex)));
                }
                if (textNode.parentNode) {
                  nodesToReplace.push({ node: textNode, parent: textNode.parentNode, newNodes });
                }
              }
              currentNode = walker.nextNode();
            }
            nodesToReplace.forEach(({ node, parent, newNodes }) => {
              newNodes.forEach((n) => parent.insertBefore(n, node));
              parent.removeChild(node);
            });
          },
        },
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(BookmarkComponent);
  },
});
