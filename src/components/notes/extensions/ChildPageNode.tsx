/**
 * src/components/notes/extensions/ChildPageNode.tsx
 * Arca — Tiptap カスタム Node: 子ページインラインボタン (Apple HIG 準拠)
 *
 * 特長:
 * 1. インライン Atom 要素（group: "inline", inline: true）として動作
 *    - ボタンの左右にキャレットを置いてタイピング・改行（Enter）が可能
 * 2. pageId のみを保持し、allNotes から最新のタイトルとカスタムSVGアイコンを解決
 * 3. e.preventDefault() & e.stopPropagation() により、SPA内部でのシームレスな画面遷移を実現
 * 4. tiptap-markdown と完全連携し、インライン [child-page:pageId] 構文での入出力をサポート
 */

import React, { useContext, useEffect } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { FileText, ChevronRight } from "lucide-react";
import { NoteEditorContext } from "../NoteEditorContext";
import { NoteIcon } from "../NoteIconPickerModal";

export const ChildPageComponent: React.FC<NodeViewProps> = (props) => {
  const { allNotes, onSelectNote } = useContext(NoteEditorContext);
  const pageId = (props.node.attrs.pageId as string) || "";
  const targetNote = allNotes.find((n) => n.id === pageId);
  const title = targetNote?.title?.trim() || "無題のページ";

  // 有効なノート一覧が存在し、targetNote が見つからない（削除済み）場合はエディタからノードを除去
  useEffect(() => {
    if (allNotes.length > 0 && !targetNote && props.deleteNode) {
      props.deleteNode();
    }
  }, [allNotes.length, targetNote, props.deleteNode]);

  // 削除済みまたは存在しない子ページは画面上にゴースト表示しない
  if (allNotes.length > 0 && !targetNote) {
    return null;
  }

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (pageId && onSelectNote) {
      onSelectNote(pageId);
    }
  };

  return (
    <NodeViewWrapper
      as="span"
      className="inline-flex items-center align-middle mx-1 my-1 select-none"
      data-child-page-node={pageId}
    >
      <span
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            handleClick(e as any);
          }
        }}
        className="group inline-flex items-center justify-between w-64 sm:w-72 h-[42px] px-3.5 rounded-xl bg-stone-100/80 dark:bg-stone-800/80 hover:bg-stone-200/90 dark:hover:bg-stone-700/90 border border-black/[0.04] dark:border-white/[0.06] transition-all duration-150 cursor-pointer shadow-2xs hover:shadow-xs select-none align-middle"
        title="子ページを開く"
      >
        <span className="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
          <span className="w-6 h-6 rounded-lg bg-amber-500/10 text-[#B58D3D] flex items-center justify-center shrink-0">
            <NoteIcon
              icon={targetNote?.icon}
              defaultIcon={<FileText className="w-3.5 h-3.5 stroke-[2]" />}
              className="w-3.5 h-3.5 stroke-[2]"
            />
          </span>
          <span className="text-sm font-medium text-charcoal group-hover:text-[#B58D3D] transition-colors truncate">
            {title}
          </span>
        </span>
        <ChevronRight className="w-4 h-4 text-charcoal-light group-hover:text-charcoal group-hover:translate-x-0.5 transition-all shrink-0" />
      </span>
    </NodeViewWrapper>
  );
};

export const ChildPageNode = Node.create({
  name: "childPage",
  group: "inline",
  inline: true,
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      pageId: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-page-id") || "",
        renderHTML: (attributes) => ({
          "data-page-id": attributes.pageId,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="child-page"]',
      },
      {
        tag: 'div[data-type="child-page"]',
      },
      {
        tag: 'a[href^="note:"]',
        getAttrs: (element) => {
          if (typeof element === "string") return false;
          const href = element.getAttribute("href") || "";
          const pageId = href.replace(/^note:/, "");
          return { pageId };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes({ "data-type": "child-page" }, HTMLAttributes)];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          state.write(`[child-page:${node.attrs.pageId}]`);
        },
        parse: {
          updateDOM(element: HTMLElement) {
            // 1. テキストノード内の [child-page:xxxx] を <span> に置換
            const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
            const nodesToReplace: { node: Text; parent: ParentNode; newNodes: globalThis.Node[] }[] = [];
            let currentNode = walker.nextNode();
            while (currentNode) {
              const textNode = currentNode as Text;
              const val = textNode.nodeValue || "";
              if (val.includes("[child-page:")) {
                const regex = /\[child-page:([a-zA-Z0-9_-]+)\]/g;
                let lastIndex = 0;
                let match: RegExpExecArray | null;
                const newNodes: globalThis.Node[] = [];
                while ((match = regex.exec(val)) !== null) {
                  if (match.index > lastIndex) {
                    newNodes.push(document.createTextNode(val.substring(lastIndex, match.index)));
                  }
                  const span = document.createElement("span");
                  span.setAttribute("data-type", "child-page");
                  span.setAttribute("data-page-id", match[1]);
                  newNodes.push(span);
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

            // 2. 既存の a[href^="note:"] も span[data-type="child-page"] に置換
            const links = Array.from(element.querySelectorAll('a[href^="note:"]'));
            links.forEach((a) => {
              const href = a.getAttribute("href") || "";
              const pageId = href.replace(/^note:/, "");
              const span = document.createElement("span");
              span.setAttribute("data-type", "child-page");
              span.setAttribute("data-page-id", pageId);
              a.parentNode?.replaceChild(span, a);
            });

            // 3. 過去の div[data-type="child-page"] があれば span に置換
            const divs = Array.from(element.querySelectorAll('div[data-type="child-page"]'));
            divs.forEach((div) => {
              const pageId = div.getAttribute("data-page-id") || "";
              const span = document.createElement("span");
              span.setAttribute("data-type", "child-page");
              span.setAttribute("data-page-id", pageId);
              div.parentNode?.replaceChild(span, div);
            });
          },
        },
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ChildPageComponent);
  },
});
