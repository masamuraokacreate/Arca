/**
 * src/components/notes/extensions/CustomImageNode.tsx
 * Arca — Tiptap カスタム Node: 画像リサイズ（10%刻み）＆ 横並び2分割対応 (Apple HIG 準拠)
 *
 * 特長:
 * 1. 10%刻み（20%〜100%）での直感的なサイズ変更
 * 2. 50%設定時に2枚の画像が綺麗に左右横並び（2カラム並列）に配置
 * 3. 画像選択・ホバー時にすりガラス調の操作バーが追従表示
 * 4. tiptap-markdown と連携し ![alt|width=50%](url) 構文で保存・復元
 */

import React, { useState } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { Minus, Plus, Columns2, Maximize2, Trash2 } from "lucide-react";

export const CustomImageComponent: React.FC<NodeViewProps> = (props) => {
  const [isHovered, setIsHovered] = useState(false);
  const src = (props.node.attrs.src as string) || "";
  const alt = (props.node.attrs.alt as string) || "";
  const rawWidth = (props.node.attrs.width as string) || "100%";
  const isSelected = props.selected;

  // 幅パーセントの数値を抽出（デフォルト100）
  const widthPercent = parseInt(rawWidth.replace("%", ""), 10) || 100;
  const isFullWidth = widthPercent >= 98;
  const isHalfWidth = widthPercent >= 45 && widthPercent <= 52;

  // 標準幅表示（max-w-4xl、本文実幅約800px）を基準とした最大幅
  // 全画面表示に切り替えても画像が巨大化せず、標準幅表示時と完全に同一のサイズを維持
  const standardBaseWidth = 800;
  const computedMaxWidth = Math.round((standardBaseWidth * widthPercent) / 100);

  const handleResize = (delta: number) => {
    const nextPercent = Math.max(20, Math.min(100, widthPercent + delta));
    props.updateAttributes({
      width: `${nextPercent}%`,
    });
  };

  const handleSetWidth = (percent: number) => {
    props.updateAttributes({
      width: `${percent}%`,
    });
  };

  const handleDelete = () => {
    props.deleteNode?.();
  };

  return (
    <NodeViewWrapper
      as="span"
      className={`relative inline-block align-top transition-all duration-200 select-none group ${
        isFullWidth ? "w-full my-4 block" : "my-2"
      }`}
      style={{
        width: isFullWidth ? "100%" : `${widthPercent}%`,
        maxWidth: `min(100%, ${computedMaxWidth}px)`,
        padding: isFullWidth ? "0" : "0 0.4%",
        boxSizing: "border-box",
        margin: isFullWidth ? "1rem auto" : undefined,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      data-image-node={src}
    >
      <div className="relative rounded-2xl overflow-hidden group/img">
        <img
          src={src}
          alt={alt}
          className={`w-full h-auto object-cover rounded-2xl transition-all duration-150 block shadow-card ${
            isSelected || isHovered
              ? "ring-2 ring-amber-500/70 dark:ring-amber-400/70 ring-offset-2 ring-offset-transparent"
              : ""
          }`}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.opacity = "0.5";
          }}
        />

        {/* フローティングツールバー（ホバー時または選択時に表示） */}
        {(isHovered || isSelected) && (
          <div
            className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-white/20 dark:border-stone-700/60 shadow-modal transition-all animate-in fade-in zoom-in-95 duration-150"
            style={{
              background: "rgba(24, 24, 27, 0.82)",
              backdropFilter: "blur(16px) saturate(180%)",
              WebkitBackdropFilter: "blur(16px) saturate(180%)",
              color: "#EDE8DF",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* -10% ボタン */}
            <button
              type="button"
              disabled={widthPercent <= 20}
              onClick={() => handleResize(-10)}
              className="w-6 h-6 rounded-lg flex items-center justify-center text-stone-300 hover:text-white hover:bg-white/15 disabled:opacity-30 disabled:hover:bg-transparent transition-all cursor-pointer border-none bg-transparent"
              title="10%縮小"
              aria-label="10%縮小"
            >
              <Minus size={13} />
            </button>

            {/* 幅パーセント表示 */}
            <span className="text-[0.72rem] font-bold text-amber-400 px-1 min-w-[2.6rem] text-center select-none">
              {widthPercent}%
            </span>

            {/* +10% ボタン */}
            <button
              type="button"
              disabled={widthPercent >= 100}
              onClick={() => handleResize(10)}
              className="w-6 h-6 rounded-lg flex items-center justify-center text-stone-300 hover:text-white hover:bg-white/15 disabled:opacity-30 disabled:hover:bg-transparent transition-all cursor-pointer border-none bg-transparent"
              title="10%拡大"
              aria-label="10%拡大"
            >
              <Plus size={13} />
            </button>

            <div className="w-[1px] h-3.5 bg-white/20 mx-0.5" />

            {/* 50%（横並び2分割）プリセット */}
            <button
              type="button"
              onClick={() => handleSetWidth(isHalfWidth ? 100 : 49)}
              className={`px-2 py-1 rounded-lg flex items-center gap-1 text-[0.7rem] font-medium transition-all cursor-pointer border-none ${
                isHalfWidth
                  ? "bg-amber-500/25 text-amber-300 font-semibold"
                  : "bg-transparent text-stone-300 hover:text-white hover:bg-white/15"
              }`}
              title="横並び表示（約50%幅で前後の画像と左右に並ぶ）"
            >
              <Columns2 size={12} />
              <span>横並び</span>
            </button>

            {/* 100%（全幅）プリセット */}
            <button
              type="button"
              onClick={() => handleSetWidth(100)}
              className={`px-2 py-1 rounded-lg flex items-center gap-1 text-[0.7rem] font-medium transition-all cursor-pointer border-none ${
                isFullWidth
                  ? "bg-amber-500/25 text-amber-300 font-semibold"
                  : "bg-transparent text-stone-300 hover:text-white hover:bg-white/15"
              }`}
              title="全幅表示（100%）"
            >
              <Maximize2 size={12} />
              <span>全幅</span>
            </button>

            <div className="w-[1px] h-3.5 bg-white/20 mx-0.5" />

            {/* 削除ボタン */}
            <button
              type="button"
              onClick={handleDelete}
              className="w-6 h-6 rounded-lg flex items-center justify-center text-stone-400 hover:text-red-400 hover:bg-red-500/20 transition-all cursor-pointer border-none bg-transparent"
              title="画像を削除"
              aria-label="画像を削除"
            >
              <Trash2 size={13} />
            </button>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    image: {
      /**
       * Add an image
       */
      setImage: (options: {
        src: string;
        alt?: string;
        title?: string;
        width?: string;
      }) => ReturnType;
    };
  }
}

export const CustomImageNode = Node.create({
  name: "image",
  group: "inline",
  inline: true,
  draggable: true,

  addCommands() {
    return {
      setImage:
        (options) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: options,
          });
        },
    };
  },

  addAttributes() {
    return {
      src: {
        default: null,
      },
      alt: {
        default: null,
      },
      title: {
        default: null,
      },
      width: {
        default: "100%",
        parseHTML: (element) => element.getAttribute("data-width") || element.style.width || "100%",
        renderHTML: (attributes) => ({
          "data-width": attributes.width,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "img[src]",
        getAttrs: (element) => {
          const el = element as HTMLImageElement;
          return {
            src: el.getAttribute("src"),
            alt: el.getAttribute("alt"),
            title: el.getAttribute("title"),
            width: el.getAttribute("data-width") || el.style.width || "100%",
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["img", mergeAttributes({ class: "arca-tiptap-image" }, HTMLAttributes)];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          const alt = node.attrs.alt || "";
          const width = node.attrs.width;
          const altWithWidth = width && width !== "100%" ? `${alt}|width=${width}` : alt;
          state.write(`![${altWithWidth}](${node.attrs.src})`);
        },
        parse: {
          updateDOM(element: HTMLElement) {
            const images = Array.from(element.querySelectorAll("img"));
            images.forEach((img) => {
              const alt = img.getAttribute("alt") || "";
              const match = alt.match(/\|width=([0-9]+%)/);
              if (match) {
                img.setAttribute("data-width", match[1]);
                img.setAttribute("alt", alt.replace(/\|width=[0-9]+%/, ""));
              }
            });
          },
        },
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(CustomImageComponent);
  },
});
