/**
 * src/components/notes/MemoModal.tsx
 * Arca — メモ専用 ポップアップモーダル (Apple HIG 準拠)
 *
 * 設計原則:
 * - 画面遷移せず、画面中央にゆったり浮き上がるポップアップモーダル (max-w-3xl, h-[70vh], rounded-3xl, 二重シャドウ)
 * - タイトルと本文をサッと書いてモーダル外クリックや閉じるボタンで即時保存・完了
 * - 絵文字は使用せず、すべて Lucide SVG アイコンで統一
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import { X, Image as ImageIcon, Trash2, Check } from "lucide-react";
import type { NoteItem } from "../../types";
import { C } from "../../lib/designSystem";
import { NoteEditor, type NoteEditorHandles } from "./NoteEditor";

interface MemoModalProps {
  note: NoteItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (id: string, patch: Partial<NoteItem>) => void;
  onDelete?: (note: NoteItem) => void;
  onToastMessage?: (msg: string) => void;
}

export function MemoModal({
  note,
  isOpen,
  onClose,
  onSave,
  onDelete,
  onToastMessage,
}: MemoModalProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const isSourceMode = false;
  const editorRef = useRef<NoteEditorHandles>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const modalContentRef = useRef<HTMLDivElement>(null);

  // ノート初期化
  useEffect(() => {
    if (note) {
      setTitle(note.title || "");
      setContent(note.content || "");
      setTagsInput(note.tags?.join(", ") || "");
    } else {
      setTitle("");
      setContent("");
      setTagsInput("");
    }
  }, [note?.id]);

  // モーダルが開いた時にタイトル入力欄へフォーカス（新規時）
  useEffect(() => {
    if (isOpen && note && !note.title.trim()) {
      setTimeout(() => {
        titleInputRef.current?.focus();
      }, 80);
    }
  }, [isOpen, note?.id]);

  // 即時保存ヘルパー
  const commitChanges = useCallback(() => {
    if (!note) return;
    const parsedTags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    onSave(note.id, {
      title,
      content,
      tags: parsedTags,
    });
  }, [note, title, content, tagsInput, onSave]);

  const handleClose = useCallback(() => {
    commitChanges();
    onClose();
  }, [commitChanges, onClose]);

  // Escape キーで保存して閉じる
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleClose]);

  // 画像ファイル挿入
  const handleImageSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (editorRef.current) {
      await editorRef.current.insertImage(file);
      onToastMessage?.(`画像「${file.name}」を挿入しました`);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  if (!isOpen || !note) return null;

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center p-3 sm:p-6"
      style={{
        background: "rgba(30, 26, 20, 0.35)",
        backdropFilter: "blur(12px) saturate(180%)",
        WebkitBackdropFilter: "blur(12px) saturate(180%)",
        animation: "arca-fade-in 0.18s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
      onClick={(e) => {
        // 背景クリックで閉じる＆保存
        if (e.target === e.currentTarget) {
          handleClose();
        }
      }}
      data-testid="memo-modal-backdrop"
    >
      {/* 非表示の画像アップロードinput */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageSelected}
        style={{ display: "none" }}
      />

      <div
        ref={modalContentRef}
        className="w-full max-w-3xl flex flex-col overflow-hidden"
        style={{
          height: "min(70vh, 720px)",
          minHeight: "420px",
          background: "var(--bg-card-solid)",
          borderRadius: "28px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px var(--border-subtle)",
          position: "relative",
          animation: "arca-scale-up 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
        onClick={(e) => e.stopPropagation()}
        data-testid="memo-modal-content"
      >
        {/* ヘッダー: タイトル・タグ・閉じるボタン */}
        <div
          className="p-5 sm:px-7 sm:pt-6 sm:pb-3 flex flex-col gap-2 shrink-0"
          style={{ borderBottom: "1px solid rgba(0,0,0,0.04)" }}
        >
          <div className="flex items-center justify-between gap-3">
            <input
              ref={titleInputRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="メモのタイトル…"
              className="appearance-none w-full bg-transparent border-none outline-none font-bold text-xl sm:text-2xl text-stone-900 dark:text-stone-100 placeholder-stone-400"
              style={{ letterSpacing: "-0.02em" }}
            />

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="画像を挿入"
                aria-label="画像を挿入"
                className="appearance-none shrink-0 p-2 rounded-xl text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
              >
                <ImageIcon size={18} />
              </button>

              {onDelete && (
                <button
                  type="button"
                  onClick={() => {
                    onDelete(note);
                    onClose();
                  }}
                  title="メモを削除"
                  aria-label="メモを削除"
                  className="appearance-none shrink-0 p-2 rounded-xl text-stone-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                >
                  <Trash2 size={18} />
                </button>
              )}

              <button
                type="button"
                onClick={handleClose}
                title="閉じる"
                aria-label="閉じる"
                className="appearance-none shrink-0 p-2 rounded-xl text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* タグ入力 */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="タグを追加（カンマ区切り）…"
              className="appearance-none bg-transparent border-none outline-none text-xs text-amber-700 dark:text-amber-400 placeholder-stone-400 w-full"
            />
          </div>
        </div>

        {/* 本文エディタエリア (Tiptap) */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-7 py-4 arca-scroll">
          <NoteEditor
            ref={editorRef}
            content={content}
            attachments={note.attachments}
            onChange={(val) => setContent(val)}
            isSourceMode={isSourceMode}
          />
        </div>

        {/* フッター: 文字数・完了ボタン */}
        <div
          className="px-6 py-3.5 flex items-center justify-between shrink-0"
          style={{
            borderTop: "1px solid rgba(0,0,0,0.04)",
            background: "rgba(0,0,0,0.015)",
          }}
        >
          <span className="text-xs text-stone-400">
            {content.trim().length.toLocaleString()} 文字
          </span>

          <button
            type="button"
            onClick={handleClose}
            className="appearance-none whitespace-nowrap shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl font-semibold text-xs transition-all cursor-pointer"
            style={{
              background: C.goldFaint2,
              color: C.goldDark,
              border: "none",
            }}
          >
            <Check size={14} />
            <span>完了</span>
          </button>
        </div>
      </div>
    </div>
  );
}
