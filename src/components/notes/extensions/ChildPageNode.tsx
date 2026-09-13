/**
 * src/components/notes/extensions/ChildPageNode.tsx
 * Arca — Tiptap カスタム Node: 子ページリンクカード (Apple HIG 準拠)
 *
 * 特長:
 * 1. インラインテキストリンクを廃止し、独立した Atom ブロック要素として動作
 * 2. pageId のみを保持し、allNotes から最新のタイトルをリアクティブに解決
 * 3. e.preventDefault() & e.stopPropagation() により、SPA内部でのシームレスな画面遷移を実現
 * 4. tiptap-markdown と完全連携し、[child-page:pageId] 構文での入出力をサポート
 */

import React, { useContext, useEffect } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { FileText, ChevronRight } from "lucide-react";
import { NoteEditorContext } from "../NoteEditorContext";

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
    <NodeViewWrapper className="my-2 select-none" data-child-page-node={pageId}>
      <div
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
        className="group flex items-center justify-between gap-2.5 max-w-md px-3.5 py-2.5 rounded-xl bg-stone-100/70 dark:bg-stone-800/70 hover:bg-stone-200/80 dark:hover:bg-stone-700/80 transition-all duration-150 cursor-pointer shadow-2xs hover:shadow-xs select-none"
        title="子ページを開く"
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="w-6 h-6 rounded-lg bg-amber-500/10 text-[#B58D3D] flex items-center justify-center shrink-0">
            <FileText className="w-3.5 h-3.5 stroke-[2]" />
          </div>
          <span className="text-sm font-medium text-charcoal group-hover:text-[#B58D3D] transition-colors truncate">
            {title}
          </span>
        </div>
        <ChevronRight className="w-4 h-4 text-charcoal-light group-hover:text-charcoal group-hover:translate-x-0.5 transition-all shrink-0" />
      </div>
    </NodeViewWrapper>
  );
};

export const ChildPageNode = Node.create({
  name: "childPage",
  group: "block",
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
    return ["div", mergeAttributes({ "data-type": "child-page" }, HTMLAttributes)];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          state.write(`[child-page:${node.attrs.pageId}]`);
          state.closeBlock(node);
        },
        parse: {
          updateDOM(element: HTMLElement) {
            // 1. <p> 要素を走査し、[child-page:id] を含む段落を独立したブロック div に置換
            const paragraphs = Array.from(element.querySelectorAll("p"));
            paragraphs.forEach((p) => {
              const text = p.textContent || "";
              if (!text.includes("[child-page:")) return;

              const regex = /\[child-page:([a-zA-Z0-9_-]+)\]/g;
              const matches: { pageId: string; index: number; length: number }[] = [];
              let m: RegExpExecArray | null;
              while ((m = regex.exec(text)) !== null) {
                matches.push({ pageId: m[1], index: m.index, length: m[0].length });
              }
              if (matches.length === 0) return;

              const fragment = document.createDocumentFragment();
              let lastIdx = 0;
              matches.forEach((match) => {
                const before = text.substring(lastIdx, match.index).trim();
                if (before) {
                  const subP = document.createElement("p");
                  subP.textContent = before;
                  fragment.appendChild(subP);
                }
                const div = document.createElement("div");
                div.setAttribute("data-type", "child-page");
                div.setAttribute("data-page-id", match.pageId);
                fragment.appendChild(div);
                lastIdx = match.index + match.length;
              });
              const after = text.substring(lastIdx).trim();
              if (after) {
                const subP = document.createElement("p");
                subP.textContent = after;
                fragment.appendChild(subP);
              }

              p.parentNode?.replaceChild(fragment, p);
            });

            // 2. 残存するテキストノード（<p> 以外のコンテキスト）内の [child-page:xxxx] を置換
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
                  const div = document.createElement("div");
                  div.setAttribute("data-type", "child-page");
                  div.setAttribute("data-page-id", match[1]);
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

            // 3. 既存の a[href^="note:"] も独立した div[data-type="child-page"] に置換
            const links = Array.from(element.querySelectorAll('a[href^="note:"]'));
            links.forEach((a) => {
              const href = a.getAttribute("href") || "";
              const pageId = href.replace(/^note:/, "");
              const div = document.createElement("div");
              div.setAttribute("data-type", "child-page");
              div.setAttribute("data-page-id", pageId);

              const parentP = a.closest("p");
              if (parentP && parentP.textContent?.trim() === a.textContent?.trim()) {
                parentP.parentNode?.replaceChild(div, parentP);
              } else {
                a.parentNode?.replaceChild(div, a);
              }
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
