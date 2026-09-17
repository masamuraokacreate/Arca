/**
 * src/components/recipes/RecipeEditor.tsx
 * Arca — レシピ構造化エディタ (Apple HIG 準拠)
 *
 * レイアウト順序 (Sprint 8.0 Refinement):
 * 1. [ヘッダー]: キャンセル、お気に入り（1行・水平並び）、削除（編集時・「削除」テキスト付き）、保存する
 * 2. 【完成写真アップロード】: 一番上（ヒーロー位置）で写真選択・自動圧縮プレビュー・削除
 * 3. [タイトル & タグ]: 料理名入力 ＋ その直下にゴールドのタグ編集（Notesモジュール準拠）
 * 4. [参考元URL]: URL入力 ＋ プレビューカード
 * 5. [分量 & 材料エディタ]: 分量（初期値「1人前」） ＋ 材料の行追加/削除/並び替え
 * 6. [手順エディタ]: ステップの追加/削除/並び替え ＆ キーボードショートカット（Ctrl+B: 太字, Ctrl+U: 下線）
 * 7. 【Chef's Review】: 次回の改善点・知見・アレンジメモ
 */

import React, { useState, useRef } from "react";
import { createPortal } from "react-dom";
import type { Recipe, IngredientItem, RecipeStep } from "../../types/recipe";
import {
  createEmptyIngredient,
  createEmptyStep,
  compressRecipeImage,
} from "../../lib/recipeStorage";
import { parseRecipeWithGemini, type ParsedRecipeResult } from "../../services/recipeParser";
import { C } from "../../lib/designSystem";

// ── アイコン定義 ──
const ChevronLeftIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="m15 18-6-6 6-6" />
  </svg>
);

const SparklesIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: "currentColor" }}>
    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
    <path d="M5 3v4" />
    <path d="M19 17v4" />
    <path d="M3 5h4" />
    <path d="M17 19h4" />
  </svg>
);

const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="M3 6h18" />
    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
  </svg>
);

const PlusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const GripVerticalIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0, color: C.charcoalLight }}>
    <circle cx="9" cy="12" r="1.5" />
    <circle cx="9" cy="5" r="1.5" />
    <circle cx="9" cy="19" r="1.5" />
    <circle cx="15" cy="12" r="1.5" />
    <circle cx="15" cy="5" r="1.5" />
    <circle cx="15" cy="19" r="1.5" />
  </svg>
);

const ArrowUpIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m18 15-6-6-6 6" />
  </svg>
);

const ArrowDownIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m6 9 6 6 6-6" />
  </svg>
);

const CameraIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
    <circle cx="12" cy="13" r="3" />
  </svg>
);


const StarFilledIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1" style={{ color: "#E0A838", flexShrink: 0 }}>
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

const StarOutlineIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: C.charcoalLight, flexShrink: 0 }}>
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

const ExternalLinkIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

export interface RecipeEditorProps {
  initialRecipe?: Recipe;
  onSave: (recipeData: Omit<Recipe, "id">) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => void;
}

export function RecipeEditor({
  initialRecipe,
  onSave,
  onCancel,
  onDelete,
}: RecipeEditorProps) {
  const [title, setTitle] = useState(initialRecipe?.title || "");
  const [servings, setServings] = useState(initialRecipe?.servings || "1人前");
  const [sourceUrl, setSourceUrl] = useState(initialRecipe?.sourceUrl || "");
  const [imageUrl, setImageUrl] = useState(initialRecipe?.imageUrl || "");
  const [notes, setNotes] = useState(initialRecipe?.notes || "");
  const [tagsInput, setTagsInput] = useState(initialRecipe?.tags?.join(", ") || "");
  const [favorite, setFavorite] = useState(!!initialRecipe?.favorite);

  const [ingredients, setIngredients] = useState<IngredientItem[]>(
    initialRecipe?.ingredients && initialRecipe.ingredients.length > 0
      ? initialRecipe.ingredients
      : [createEmptyIngredient(), createEmptyIngredient()]
  );

  const [steps, setSteps] = useState<RecipeStep[]>(
    initialRecipe?.steps && initialRecipe.steps.length > 0
      ? initialRecipe.steps
      : [createEmptyStep()]
  );

  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── AI レシピ自動抽出関連 State ──
  const [isParsingRecipe, setIsParsingRecipe] = useState(false);
  const [showAiInputModal, setShowAiInputModal] = useState(false);
  const [aiInputText, setAiInputText] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);
  const [pendingParsedData, setPendingParsedData] = useState<ParsedRecipeResult | null>(null);

  // トースト表示タイマー（メッセージ長に応じた十分な表示時間を確保）
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage(msg);
    const duration = Math.max(3500, Math.min(6000, msg.length * 80));
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
    }, duration);
  };

  // ── 画像アップロード ──
  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingImage(true);
    try {
      const compressedDataUrl = await compressRecipeImage(file, 1200, 0.82);
      setImageUrl(compressedDataUrl);
    } catch (err) {
      console.error("Image upload failed", err);
      alert("画像の圧縮・読み込みに失敗しました");
    } finally {
      setIsUploadingImage(false);
      e.target.value = "";
    }
  };

  // ── ステップごとの写真アップロード ──
  const stepFileInputRef = useRef<HTMLInputElement>(null);
  const [targetStepIdForUpload, setTargetStepIdForUpload] = useState<string | null>(null);

  const triggerStepImageUpload = (stepId: string) => {
    setTargetStepIdForUpload(stepId);
    stepFileInputRef.current?.click();
  };

  const handleStepFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !targetStepIdForUpload) return;
    try {
      const compressed = await compressRecipeImage(file, 1200, 0.82);
      setSteps((prev) =>
        prev.map((s) => (s.id === targetStepIdForUpload ? { ...s, imageUrl: compressed } : s))
      );
      showToast("手順に写真を追加しました");
    } catch (err) {
      console.error("Step image upload failed", err);
      showToast("画像の圧縮・読み込みに失敗しました");
    } finally {
      setTargetStepIdForUpload(null);
      e.target.value = "";
    }
  };

  const handleUpdateStepImage = (stepId: string, imgUrl?: string) => {
    setSteps((prev) =>
      prev.map((s) => (s.id === stepId ? { ...s, imageUrl: imgUrl } : s))
    );
  };

  // ── クリップボード画像ペースト（Ctrl+V / Command+V）検知 ──
  const [pasteCandidateImage, setPasteCandidateImage] = useState<string | null>(null);

  const handleContainerPaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items || items.length === 0) return;

    let imageFile: File | null = null;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        const file = items[i].getAsFile();
        if (file) {
          imageFile = file;
          break;
        }
      }
    }

    if (!imageFile) return;

    // 画像ペーストの場合はデフォルト（意図しないテキスト貼り付け等）を抑止して貼り付け先選択モーダルを開く
    e.preventDefault();
    try {
      const compressed = await compressRecipeImage(imageFile, 1200, 0.82);
      setPasteCandidateImage(compressed);
    } catch (err) {
      console.error("Paste image compression failed", err);
      showToast("画像の圧縮・読み込みに失敗しました");
    }
  };

  // ── 画像の貼り付け先を適用 ──
  const handleApplyPasteTarget = (target: "cover" | { stepId: string } | "newStep") => {
    if (!pasteCandidateImage) return;

    if (target === "cover") {
      setImageUrl(pasteCandidateImage);
      showToast("完成写真に画像を貼り付けました");
    } else if (target === "newStep") {
      const newStep: RecipeStep = {
        ...createEmptyStep(),
        imageUrl: pasteCandidateImage,
      };
      setSteps((prev) => [...prev, newStep]);
      showToast("新しい手順ステップに画像を貼り付けました");
    } else {
      const stepIdx = steps.findIndex((s) => s.id === target.stepId);
      setSteps((prev) =>
        prev.map((s) =>
          s.id === target.stepId ? { ...s, imageUrl: pasteCandidateImage } : s
        )
      );
      showToast(`ステップ ${stepIdx + 1} に画像を貼り付けました`);
    }

    setPasteCandidateImage(null);
  };

  // ── 画像ファイルのドラッグ＆ドロップ ──
  const handleCoverDrop = async (e: React.DragEvent) => {
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      const compressed = await compressRecipeImage(file, 1200, 0.82);
      setImageUrl(compressed);
      showToast("完成写真に画像を設定しました");
    } catch (err) {
      console.error("Cover drop failed", err);
      showToast("画像の圧縮・読み込みに失敗しました");
    }
  };

  const handleStepImageDrop = async (e: React.DragEvent, stepId: string, index: number) => {
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      const compressed = await compressRecipeImage(file, 1200, 0.82);
      handleUpdateStepImage(stepId, compressed);
      showToast(`ステップ ${index + 1} に画像を設定しました`);
    } catch (err) {
      console.error("Step image drop failed", err);
      showToast("画像の圧縮・読み込みに失敗しました");
    }
  };

  // ── 材料の操作 ──
  const handleAddIngredient = () => {
    setIngredients((prev) => [...prev, createEmptyIngredient()]);
  };

  const handleUpdateIngredient = (id: string, field: "name" | "amount", value: string) => {
    setIngredients((prev) =>
      prev.map((ing) => (ing.id === id ? { ...ing, [field]: value } : ing))
    );
  };

  const handleRemoveIngredient = (id: string) => {
    setIngredients((prev) => prev.filter((ing) => ing.id !== id));
  };

  const handleMoveIngredient = (index: number, direction: "up" | "down") => {
    if (
      (direction === "up" && index === 0) ||
      (direction === "down" && index === ingredients.length - 1)
    ) {
      return;
    }
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    const newItems = [...ingredients];
    const temp = newItems[index];
    newItems[index] = newItems[targetIdx];
    newItems[targetIdx] = temp;
    setIngredients(newItems);
  };

  // ── 手順の操作 ──
  const handleAddStep = () => {
    setSteps((prev) => [...prev, createEmptyStep()]);
  };

  const handleUpdateStep = (id: string, text: string) => {
    setSteps((prev) =>
      prev.map((step) => (step.id === id ? { ...step, text } : step))
    );
  };

  const handleRemoveStep = (id: string) => {
    setSteps((prev) => prev.filter((step) => step.id !== id));
  };

  // ── 手順のドラッグ＆ドロップ操作 ──
  const [draggedStepIndex, setDraggedStepIndex] = useState<number | null>(null);
  const [dragOverStepIndex, setDragOverStepIndex] = useState<number | null>(null);

  const handleStepDragStart = (e: React.DragEvent, index: number) => {
    setDraggedStepIndex(index);
    e.dataTransfer.effectAllowed = "move";
    if (e.dataTransfer.setData) {
      e.dataTransfer.setData("text/plain", `${index}`);
    }
  };

  const handleStepDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverStepIndex !== index) {
      setDragOverStepIndex(index);
    }
  };

  const handleStepDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedStepIndex === null || draggedStepIndex === targetIndex) {
      setDraggedStepIndex(null);
      setDragOverStepIndex(null);
      return;
    }

    const newSteps = [...steps];
    const [moved] = newSteps.splice(draggedStepIndex, 1);
    newSteps.splice(targetIndex, 0, moved);
    setSteps(newSteps);

    setDraggedStepIndex(null);
    setDragOverStepIndex(null);
  };

  const handleStepDragEnd = () => {
    setDraggedStepIndex(null);
    setDragOverStepIndex(null);
  };

  // ── 手順入力欄のキーボードショートカット (Ctrl+B / Ctrl+U) ──
  const handleStepKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
    stepId: string,
    currentText: string
  ) => {
    const isCtrlOrCmd = e.ctrlKey || e.metaKey;
    if (!isCtrlOrCmd) return;

    if (e.key === "b" || e.key === "B") {
      e.preventDefault();
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selected = currentText.slice(start, end);
      const replacement = selected ? `**${selected}**` : "****";
      const nextText =
        currentText.slice(0, start) + replacement + currentText.slice(end);
      handleUpdateStep(stepId, nextText);

      setTimeout(() => {
        textarea.focus();
        if (selected) {
          textarea.setSelectionRange(start + 2, end + 2);
        } else {
          textarea.setSelectionRange(start + 2, start + 2);
        }
      }, 0);
    } else if (e.key === "u" || e.key === "U") {
      e.preventDefault();
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selected = currentText.slice(start, end);
      const replacement = selected ? `<u>${selected}</u>` : "<u></u>";
      const nextText =
        currentText.slice(0, start) + replacement + currentText.slice(end);
      handleUpdateStep(stepId, nextText);

      setTimeout(() => {
        textarea.focus();
        if (selected) {
          textarea.setSelectionRange(start + 3, end + 3);
        } else {
          textarea.setSelectionRange(start + 3, start + 3);
        }
      }, 0);
    }
  };

  // ── AI レシピデータのフォーム反映 ──
  const applyParsedData = (data: ParsedRecipeResult) => {
    if (data.title) setTitle(data.title);
    if (data.servings) setServings(data.servings);
    if (data.tags && data.tags.length > 0) setTagsInput(data.tags.join(", "));
    if (data.notes) setNotes(data.notes);

    if (data.ingredients && data.ingredients.length > 0) {
      setIngredients(
        data.ingredients.map((ing) => ({
          id: crypto.randomUUID(),
          name: ing.name,
          amount: ing.amount,
        }))
      );
    }

    if (data.steps && data.steps.length > 0) {
      setSteps(
        data.steps.map((st) => ({
          id: crypto.randomUUID(),
          text: st,
        }))
      );
    }

    showToast("✨ レシピ情報を自動入力しました");
  };

  // ── AI レシピ抽出の実行 ──
  const handleRunAiParser = async (overrideText?: string) => {
    const targetInput = (overrideText !== undefined ? overrideText : (sourceUrl || aiInputText)).trim();

    if (!targetInput) {
      // 入力がない場合はモーダルを開いてユーザーに入力を促す
      setShowAiInputModal(true);
      return;
    }

    setIsParsingRecipe(true);
    try {
      const result = await parseRecipeWithGemini(targetInput);
      if (!result || (result.ingredients.length === 0 && result.steps.length === 0)) {
        showToast("レシピ情報を自動抽出できませんでした。材料と手順のテキストを直接貼り付けてお試しください");
        setShowAiInputModal(true);
        return;
      }

      // すでにタイトルや材料が入っている場合は上書き確認を挟む
      const hasExistingData =
        title.trim() !== "" ||
        ingredients.some((i) => i.name.trim()) ||
        steps.some((s) => s.text.trim());

      if (hasExistingData) {
        setPendingParsedData(result);
        setShowOverwriteConfirm(true);
        setShowAiInputModal(false);
      } else {
        applyParsedData(result);
        setShowAiInputModal(false);
        setAiInputText("");
      }
    } catch (err) {
      console.error("AI recipe parsing failed:", err);
      // プロキシ取得失敗など、ユーザーへの指示を含む専用メッセージの場合はそのまま表示
      if (err instanceof Error && err.message) {
        showToast(err.message);
      } else {
        showToast("解析エラーが発生しました。テキストを貼り付けてお試しください");
      }
      // プロキシ失敗の場合はテキスト貼り付けを促すためモーダルを開く
      setShowAiInputModal(true);
    } finally {
      setIsParsingRecipe(false);
    }
  };

  // ── 保存実行（バリデーション緩和：全項目任意） ──
  const handleSubmit = async () => {
    if (isSaving) return;
    setIsSaving(true);

    const parsedTags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    // 空行は除去するが、材料や手順が0件でも保存可能
    const cleanIngredients = ingredients.filter(
      (ing) => ing.name.trim() || ing.amount.trim()
    );

    const cleanSteps = steps.filter((s) => s.text.trim() || s.imageUrl);

    const now = Date.now();
    // Firestore は undefined 値を拒否するため、オプショナル項目は空文字列に正規化する
    const recipeData: Omit<Recipe, "id"> = {
      title: title.trim() || "無題のレシピ",
      servings: servings.trim() || "1人前",
      sourceUrl: sourceUrl.trim() || "",
      imageUrl: imageUrl || "",
      notes: notes.trim() || "",
      tags: parsedTags,
      favorite: Boolean(favorite),
      ingredients: cleanIngredients,
      steps: cleanSteps,
      createdAt: initialRecipe?.createdAt || now,
      updatedAt: now,
      isDeleted: false,
    };


    try {
      await onSave(recipeData);
    } catch (err) {
      console.error("Save error", err);
      setIsSaving(false);
    }
  };

  // 参考URLのドメイン名取得
  let sourceDomain = "";
  if (sourceUrl.trim()) {
    try {
      const parsed = new URL(sourceUrl);
      sourceDomain = parsed.hostname.replace(/^www\./, "");
    } catch {
      sourceDomain = sourceUrl;
    }
  }

  return (
    <div
      data-testid="recipe-editor-container"
      className="arca-view-in"
      onPaste={handleContainerPaste}
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        width: "100%",
      }}
    >
      {/* ────── 1. ヘッダー (Sticky / Apple HIG 準拠 / ボタンUI統一) ────── */}
      <header className="arca-toolbar">
        {/* 左: キャンセル */}
        <button
          onClick={onCancel}
          className="arca-tb-btn"
          title="編集をキャンセル"
          style={{ paddingLeft: "0.2rem" }}
        >
          <ChevronLeftIcon />
          <span>キャンセル</span>
        </button>

        {/* 右: お気に入り ＆ 削除 ＆ 保存（水平1行レイアウト） */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {/* お気に入りトグル（アイコンとテキストが水平に1行で並ぶ） */}
          <button
            type="button"
            onClick={() => setFavorite((f) => !f)}
            className="arca-tb-btn"
            title={favorite ? "お気に入りを解除" : "お気に入りに追加"}
            style={{ color: favorite ? C.goldDark : C.charcoalMid }}
          >
            {favorite ? <StarFilledIcon /> : <StarOutlineIcon />}
            <span>お気に入り</span>
          </button>

          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="arca-tb-btn arca-tb-btn-delete"
              title="このレシピを削除"
            >
              <TrashIcon />
              <span>削除</span>
            </button>
          )}

          <button
            onClick={handleSubmit}
            disabled={isSaving}
            style={{
              padding: "0 1.15rem",
              height: "32px",
              borderRadius: "8px",
              background: C.gold,
              color: "#FDFCFA",
              border: "none",
              cursor: isSaving ? "default" : "pointer",
              fontSize: "0.82rem",
              fontWeight: 650,
              boxShadow: "0 2px 8px rgba(197, 160, 89, 0.35)",
              transition: "transform 0.15s, opacity 0.15s",
              opacity: isSaving ? 0.7 : 1,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            onMouseEnter={(e) => {
              if (!isSaving) e.currentTarget.style.transform = "translateY(-1px)";
            }}
            onMouseLeave={(e) => {
              if (!isSaving) e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            {isSaving ? "保存中..." : "保存する"}
          </button>
        </div>
      </header>

      {/* ────── 構造化エディタフォーム ────── */}
      <div
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "center",
          padding: "2.5rem clamp(1rem, 4vw, 3rem) calc(40vh + env(safe-area-inset-bottom, 0px))",
          boxSizing: "border-box",
        }}
      >
        <div
          className="arca-layout-container"
          style={{
            width: "100%",
            maxWidth: "840px",
            background: "var(--bg-surface-glass)",
            backdropFilter: "blur(20px) saturate(180%)",
            WebkitBackdropFilter: "blur(20px) saturate(180%)",
            borderRadius: "24px",
            boxShadow: "var(--shadow-modal)",
            border: "1px solid var(--border-subtle)",
            padding: "3.2rem clamp(1.5rem, 5vw, 4rem) 4.5rem",
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            gap: "2.2rem",
          }}
        >
          {/* ── 2. 【完成写真アップロード】: 一番上にヒーロー位置で配置 ── */}
          <section style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            <label style={{ fontSize: "0.82rem", fontWeight: 700, color: C.charcoalMid, letterSpacing: "0.03em" }}>
              完成写真
            </label>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              style={{ display: "none" }}
              data-testid="recipe-image-input"
            />

            {imageUrl ? (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "copy";
                }}
                onDrop={handleCoverDrop}
                style={{
                  position: "relative",
                  width: "100%",
                  maxHeight: "360px",
                  borderRadius: "18px",
                  overflow: "hidden",
                  boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
                }}
              >
                <img
                  src={imageUrl}
                  alt="Preview"
                  style={{ width: "100%", maxHeight: "360px", objectFit: "cover", display: "block" }}
                />
                <div
                  style={{
                    position: "absolute",
                    bottom: "1rem",
                    right: "1rem",
                    display: "flex",
                    gap: "0.5rem",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      background: "rgba(44, 44, 46, 0.75)",
                      backdropFilter: "blur(8px)",
                      color: C.white,
                      border: "none",
                      borderRadius: "8px",
                      padding: "0.45rem 0.8rem",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    写真を変更
                  </button>
                  <button
                    type="button"
                    onClick={() => setImageUrl("")}
                    style={{
                      background: "rgba(192, 97, 74, 0.85)",
                      backdropFilter: "blur(8px)",
                      color: C.white,
                      border: "none",
                      borderRadius: "8px",
                      padding: "0.45rem 0.8rem",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    削除
                  </button>
                </div>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "copy";
                }}
                onDrop={handleCoverDrop}
                style={{
                  width: "100%",
                  height: "140px",
                  border: `2px dashed ${C.ivory2}`,
                  borderRadius: "18px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.45rem",
                  cursor: "pointer",
                  background: "rgba(0, 0, 0, 0.01)",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = C.gold;
                  e.currentTarget.style.background = C.goldFaint;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = C.ivory2;
                  e.currentTarget.style.background = "rgba(0, 0, 0, 0.01)";
                }}
              >
                <div
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "50%",
                    background: C.goldFaint,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: C.goldDark,
                  }}
                >
                  <CameraIcon />
                </div>
                <span style={{ fontSize: "0.84rem", fontWeight: 600, color: C.charcoalMid }}>
                  {isUploadingImage ? "画像を圧縮中..." : "完成写真を追加（タップで選択 / ドラッグ＆ドロップ）"}
                </span>
                <span style={{ fontSize: "0.72rem", color: C.charcoalLight }}>
                  JPEG / PNG / WebP（ペーストまたはファイル選択で設定可能）
                </span>
              </div>
            )}
          </section>

          {/* ── 3. タイトル & タグ (Notesモジュール準拠) ── */}
          <section style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="料理名を入力（例: 極上ポークソテー）..."
              style={{
                width: "100%",
                fontSize: "1.8rem",
                fontWeight: 750,
                color: C.charcoal,
                border: "none",
                outline: "none",
                background: "transparent",
                letterSpacing: "-0.025em",
                lineHeight: 1.25,
                padding: "0.2rem 0",
                boxSizing: "border-box",
              }}
            />

            {/* タイトル直下のゴールドタグ編集 */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                paddingBottom: "0.8rem",
                borderBottom: "1px solid rgba(0,0,0,0.06)",
              }}
            >
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="タグを追加（カンマ区切り 例: 和食, 定番, 時短）"
                style={{
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  fontSize: "0.78rem",
                  color: C.gold,
                  fontWeight: 500,
                  width: "100%",
                  letterSpacing: "0.03em",
                }}
              />
            </div>
          </section>

          {/* ── 4. 参考元URL入力 ＆ AI自動抽出 ── */}
          <section style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <label style={{ fontSize: "0.75rem", fontWeight: 600, color: C.charcoalMid }}>
                参考元URL（クラシル、クックパッド、YouTube、Webレシピ等）
              </label>
              <button
                type="button"
                onClick={() => setShowAiInputModal(true)}
                style={{
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  fontSize: "0.72rem",
                  color: C.goldDark,
                  cursor: "pointer",
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.25rem",
                }}
              >
                <span>テキスト貼り付けで抽出</span>
              </button>
            </div>

            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <input
                type="url"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://..."
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: "0.6rem 0.85rem",
                  borderRadius: "10px",
                  border: "1px solid var(--border-subtle)",
                  background: C.white,
                  fontSize: "0.85rem",
                  color: C.charcoal,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
              <button
                type="button"
                onClick={() => handleRunAiParser()}
                disabled={isParsingRecipe}
                data-testid="recipe-ai-extract-btn"
                style={{
                  background: C.gold,
                  color: "#FDFCFA",
                  border: "none",
                  borderRadius: "10px",
                  padding: "0.6rem 1.05rem",
                  fontSize: "0.78rem",
                  fontWeight: 650,
                  cursor: isParsingRecipe ? "default" : "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                  boxShadow: "0 2px 8px rgba(197, 160, 89, 0.25)",
                  transition: "all 0.15s ease",
                  opacity: isParsingRecipe ? 0.8 : 1,
                }}
                title="URLからレシピ情報をAIで自動抽出"
              >
                {isParsingRecipe ? (
                  <>
                    <span style={{ display: "inline-flex", gap: "2px", alignItems: "center" }}>
                      {[0, 1, 2].map((i) => (
                        <span
                          key={i}
                          style={{
                            width: "3px",
                            height: "3px",
                            borderRadius: "50%",
                            backgroundColor: "#FDFCFA",
                            display: "inline-block",
                            animation: `aether-pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                          }}
                        />
                      ))}
                    </span>
                    <span>解析中…</span>
                  </>
                ) : (
                  <>
                    <SparklesIcon />
                    <span>✨ AI自動抽出</span>
                  </>
                )}
              </button>
            </div>

            {sourceDomain && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.45rem 0.75rem",
                  borderRadius: "8px",
                  background: C.ivory,
                  fontSize: "0.74rem",
                  color: C.charcoalMid,
                  marginTop: "0.2rem",
                }}
              >
                <ExternalLinkIcon />
                <span>リンク先: {sourceDomain}</span>
              </div>
            )}
          </section>

          {/* ── 5. 分量 & 材料エディタ ── */}
          <section style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                borderBottom: `2px solid ${C.ivory2}`,
                paddingBottom: "0.6rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.8rem" }}>
                <h2 style={{ fontSize: "1.2rem", fontWeight: 700, color: C.charcoal, margin: 0 }}>
                  材料・調味料
                </h2>
                {/* 分量（目安） */}
                <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                  <span style={{ fontSize: "0.78rem", color: C.charcoalLight }}>分量:</span>
                  <input
                    type="text"
                    value={servings}
                    onChange={(e) => setServings(e.target.value)}
                    placeholder="例: 1人前, 2人前"
                    style={{
                      width: "80px",
                      padding: "0.25rem 0.5rem",
                      borderRadius: "6px",
                      border: "1px solid var(--border-subtle)",
                      background: C.white,
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      color: C.charcoal,
                      outline: "none",
                    }}
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={handleAddIngredient}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.3rem",
                  background: C.goldFaint2,
                  color: C.goldDark,
                  border: "none",
                  borderRadius: "8px",
                  padding: "0.35rem 0.75rem",
                  fontSize: "0.78rem",
                  fontWeight: 650,
                  cursor: "pointer",
                }}
              >
                <PlusIcon />
                <span>行を追加</span>
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {ingredients.map((ing, index) => (
                <div
                  key={ing.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  {/* 並び替え上下ボタン */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    <button
                      type="button"
                      onClick={() => handleMoveIngredient(index, "up")}
                      disabled={index === 0}
                      aria-label="材料を上へ移動"
                      style={{
                        background: "transparent",
                        border: "none",
                        cursor: index === 0 ? "default" : "pointer",
                        color: index === 0 ? C.charcoalXLight : C.charcoalMid,
                        padding: "1px",
                        lineHeight: 1,
                      }}
                    >
                      <ArrowUpIcon />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMoveIngredient(index, "down")}
                      disabled={index === ingredients.length - 1}
                      aria-label="材料を下へ移動"
                      style={{
                        background: "transparent",
                        border: "none",
                        cursor: index === ingredients.length - 1 ? "default" : "pointer",
                        color: index === ingredients.length - 1 ? C.charcoalXLight : C.charcoalMid,
                        padding: "1px",
                        lineHeight: 1,
                      }}
                    >
                      <ArrowDownIcon />
                    </button>
                  </div>

                  {/* 材料名 */}
                  <input
                    type="text"
                    value={ing.name}
                    onChange={(e) => handleUpdateIngredient(ing.id, "name", e.target.value)}
                    placeholder="材料名（例: 豚肩ロース肉）"
                    style={{
                      flex: "2 1 180px",
                      padding: "0.55rem 0.8rem",
                      borderRadius: "8px",
                      border: "1px solid var(--border-subtle)",
                      background: C.white,
                      fontSize: "0.9rem",
                      color: C.charcoal,
                      outline: "none",
                    }}
                  />

                  {/* 分量 */}
                  <input
                    type="text"
                    value={ing.amount}
                    onChange={(e) => handleUpdateIngredient(ing.id, "amount", e.target.value)}
                    placeholder="分量（例: 300g, 大さじ2）"
                    style={{
                      flex: "1 1 120px",
                      padding: "0.55rem 0.8rem",
                      borderRadius: "8px",
                      border: "1px solid var(--border-subtle)",
                      background: C.white,
                      fontSize: "0.9rem",
                      color: C.charcoal,
                      outline: "none",
                    }}
                  />

                  {/* 削除ボタン */}
                  <button
                    type="button"
                    onClick={() => handleRemoveIngredient(ing.id)}
                    aria-label="材料を削除"
                    style={{
                      background: "transparent",
                      border: "none",
                      color: C.charcoalLight,
                      cursor: "pointer",
                      padding: "0.4rem",
                      borderRadius: "6px",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = C.danger;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = C.charcoalLight;
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* ── 6. 手順エディタ (太字・下線ショートカット対応) ── */}
          <section style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                borderBottom: `2px solid ${C.ivory2}`,
                paddingBottom: "0.6rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: "0.6rem" }}>
                <h2 style={{ fontSize: "1.2rem", fontWeight: 700, color: C.charcoal, margin: 0 }}>
                  作り方・調理手順
                </h2>
                <span style={{ fontSize: "0.72rem", color: C.charcoalLight }}>
                  Ctrl+B: 太字 / Ctrl+U: 下線
                </span>
              </div>
              <button
                type="button"
                onClick={handleAddStep}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.3rem",
                  background: C.goldFaint2,
                  color: C.goldDark,
                  border: "none",
                  borderRadius: "8px",
                  padding: "0.35rem 0.75rem",
                  fontSize: "0.78rem",
                  fontWeight: 650,
                  cursor: "pointer",
                }}
              >
                <PlusIcon />
                <span>ステップを追加</span>
              </button>
            </div>

            <input
              ref={stepFileInputRef}
              type="file"
              accept="image/*"
              onChange={handleStepFileChange}
              style={{ display: "none" }}
              data-testid="recipe-step-image-input"
            />

            <div style={{ display: "flex", flexDirection: "column", gap: "0.8rem" }}>
              {steps.map((step, index) => {
                const isDragging = draggedStepIndex === index;
                const isDragOver = dragOverStepIndex === index && !isDragging;

                return (
                  <div
                    key={step.id}
                    draggable
                    onDragStart={(e) => handleStepDragStart(e, index)}
                    onDragOver={(e) => {
                      if (e.dataTransfer.types.includes("Files")) {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "copy";
                      } else {
                        handleStepDragOver(e, index);
                      }
                    }}
                    onDrop={(e) => {
                      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                        handleStepImageDrop(e, step.id, index);
                      } else {
                        handleStepDrop(e, index);
                      }
                    }}
                    onDragEnd={handleStepDragEnd}
                    style={{
                      display: "flex",
                      gap: "0.75rem",
                      alignItems: "flex-start",
                      padding: "0.5rem 0.6rem",
                      borderRadius: "12px",
                      background: isDragOver ? C.goldFaint2 : isDragging ? "rgba(0,0,0,0.02)" : "transparent",
                      border: isDragOver ? `1.5px dashed ${C.gold}` : "1.5px solid transparent",
                      opacity: isDragging ? 0.45 : 1,
                      transition: "background 0.15s ease, border-color 0.15s ease",
                    }}
                  >
                    {/* ドラッグハンドル ＆ ステップ番号 */}
                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginTop: "0.35rem" }}>
                      <div
                        title="ドラッグして並び替え"
                        aria-label="手順をドラッグして並び替え"
                        style={{
                          cursor: "grab",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: "0.2rem",
                          borderRadius: "4px",
                          color: C.charcoalLight,
                          userSelect: "none",
                        }}
                      >
                        <GripVerticalIcon />
                      </div>

                      <span
                        style={{
                          width: "24px",
                          height: "24px",
                          borderRadius: "50%",
                          background: C.gold,
                          color: "#FDFCFA",
                          fontSize: "0.78rem",
                          fontWeight: 700,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        {index + 1}
                      </span>
                    </div>

                    {/* 手順テキスト入力 ＆ ステップ写真エリア */}
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.5rem", minWidth: 0 }}>
                      <textarea
                        value={step.text}
                        onChange={(e) => handleUpdateStep(step.id, e.target.value)}
                        onKeyDown={(e) => handleStepKeyDown(e, step.id, step.text)}
                        placeholder={`ステップ ${index + 1} の手順を入力（Ctrl+Bで太字、Ctrl+Uで下線）...`}
                        rows={2}
                        style={{
                          width: "100%",
                          boxSizing: "border-box",
                          padding: "0.65rem 0.85rem",
                          borderRadius: "10px",
                          border: "1px solid var(--border-subtle)",
                          background: C.white,
                          fontSize: "0.92rem",
                          lineHeight: 1.6,
                          color: C.charcoal,
                          outline: "none",
                          resize: "vertical",
                          fontFamily: "inherit",
                        }}
                      />

                      {/* ステップ写真のプレビューまたは追加ボタン */}
                      {step.imageUrl ? (
                        <div
                          style={{
                            position: "relative",
                            display: "inline-flex",
                            alignItems: "flex-start",
                            maxWidth: "240px",
                            borderRadius: "12px",
                            overflow: "hidden",
                            border: "1px solid var(--border-subtle)",
                            background: "rgba(0,0,0,0.02)",
                            boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                          }}
                        >
                          <img
                            src={step.imageUrl}
                            alt={`Step ${index + 1} photo`}
                            style={{
                              width: "100%",
                              maxHeight: "150px",
                              objectFit: "cover",
                              display: "block",
                            }}
                          />
                          <div
                            style={{
                              position: "absolute",
                              bottom: "0.4rem",
                              right: "0.4rem",
                              display: "flex",
                              gap: "0.3rem",
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => triggerStepImageUpload(step.id)}
                              style={{
                                background: "rgba(44, 44, 46, 0.75)",
                                backdropFilter: "blur(6px)",
                                color: "#fff",
                                border: "none",
                                borderRadius: "6px",
                                padding: "0.25rem 0.55rem",
                                fontSize: "0.7rem",
                                fontWeight: 600,
                                cursor: "pointer",
                              }}
                            >
                              変更
                            </button>
                            <button
                              type="button"
                              onClick={() => handleUpdateStepImage(step.id, undefined)}
                              style={{
                                background: "rgba(192, 97, 74, 0.85)",
                                backdropFilter: "blur(6px)",
                                color: "#fff",
                                border: "none",
                                borderRadius: "6px",
                                padding: "0.25rem 0.55rem",
                                fontSize: "0.7rem",
                                fontWeight: 600,
                                cursor: "pointer",
                              }}
                            >
                              削除
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <button
                            type="button"
                            onClick={() => triggerStepImageUpload(step.id)}
                            title="このステップに写真を追加"
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.35rem",
                              background: "transparent",
                              border: "1px dashed var(--border-subtle)",
                              borderRadius: "8px",
                              padding: "0.28rem 0.65rem",
                              fontSize: "0.74rem",
                              color: C.charcoalLight,
                              cursor: "pointer",
                              transition: "all 0.15s ease",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.borderColor = C.gold;
                              e.currentTarget.style.color = C.goldDark;
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.borderColor = "var(--border-subtle)";
                              e.currentTarget.style.color = C.charcoalLight;
                            }}
                          >
                            <CameraIcon />
                            <span>写真を追加</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* 削除ボタン */}
                    <button
                      type="button"
                      onClick={() => handleRemoveStep(step.id)}
                      aria-label="手順を削除"
                      style={{
                        background: "transparent",
                        border: "none",
                        color: C.charcoalLight,
                        cursor: "pointer",
                        padding: "0.4rem",
                        borderRadius: "6px",
                        marginTop: "0.2rem",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = C.danger;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = C.charcoalLight;
                      }}
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── 7. 【Chef's Review】（最下部セクション） ── */}
          <section
            style={{
              background: "var(--accent-gold-faint)",
              border: "1px solid var(--accent-gold-faint3)",
              borderRadius: "16px",
              padding: "1.4rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.6rem",
            }}
          >
            <label style={{ fontSize: "0.82rem", fontWeight: 700, color: C.goldDark, letterSpacing: "0.03em" }}>
              Chef's Review（次回の改善点・知見・アレンジメモ）
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="例: 火加減は中弱火でじっくり焼く。生姜はすりおろしと千切りの両方を入れると香りが引き立つ..."
              rows={3}
              style={{
                width: "100%",
                padding: "0.7rem 0.9rem",
                borderRadius: "10px",
                border: "1px solid var(--accent-gold-faint3)",
                background: C.white,
                fontSize: "0.9rem",
                lineHeight: 1.6,
                color: C.charcoal,
                outline: "none",
                resize: "vertical",
                boxSizing: "border-box",
                fontFamily: "inherit",
              }}
            />
          </section>
        </div>
      </div>

      {/* ─── AI自動抽出モーダルシート ─── */}
      {showAiInputModal && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1100,
            background: "rgba(0, 0, 0, 0.4)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
            animation: "arca-fade-in 0.2s ease",
          }}
          onClick={() => {
            if (!isParsingRecipe) setShowAiInputModal(false);
          }}
        >
          <div
            className="arca-card"
            style={{
              width: "100%",
              maxWidth: "540px",
              background: "var(--bg-card-solid)",
              borderRadius: "24px",
              border: "1px solid var(--border-subtle)",
              padding: "1.8rem clamp(1.2rem, 4vw, 2rem)",
              boxShadow: "var(--shadow-modal)",
              display: "flex",
              flexDirection: "column",
              gap: "1.2rem",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* ヘッダー */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ fontSize: "1.15rem", color: C.goldDark }}>✦</span>
                <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 750, color: C.charcoal }}>
                  AI レシピ自動抽出
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAiInputModal(false)}
                disabled={isParsingRecipe}
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: "1.2rem",
                  color: C.charcoalLight,
                  cursor: "pointer",
                  padding: "0.2rem 0.5rem",
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>

            <p style={{ margin: 0, fontSize: "0.82rem", color: C.charcoalMid, lineHeight: 1.5 }}>
              WebサイトのURLまたは、レシピのテキスト（材料や手順のコピー）を貼り付けてください。Gemini APIが自動で料理名、材料、分量、手順、タグを構造化してセットします。
            </p>

            {/* 入力テキストエリア */}
            <textarea
              value={aiInputText}
              onChange={(e) => setAiInputText(e.target.value)}
              placeholder="ここにURL（https://...）またはレシピの文章を貼り付け..."
              rows={6}
              disabled={isParsingRecipe}
              style={{
                width: "100%",
                padding: "0.85rem 1rem",
                borderRadius: "14px",
                border: "1px solid var(--border-subtle)",
                background: C.white,
                fontSize: "0.88rem",
                lineHeight: 1.6,
                color: C.charcoal,
                outline: "none",
                resize: "vertical",
                boxSizing: "border-box",
                fontFamily: "inherit",
              }}
            />

            {/* フッターアクションボタン */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "0.2rem" }}>
              <button
                type="button"
                onClick={() => setShowAiInputModal(false)}
                disabled={isParsingRecipe}
                style={{
                  background: "var(--bg-nav-track)",
                  border: "none",
                  borderRadius: "11px",
                  padding: "0.6rem 1.1rem",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  color: C.charcoalMid,
                  cursor: "pointer",
                }}
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => handleRunAiParser(aiInputText)}
                disabled={isParsingRecipe || !aiInputText.trim()}
                data-testid="ai-modal-submit-btn"
                style={{
                  background: C.gold,
                  border: "none",
                  borderRadius: "11px",
                  padding: "0.6rem 1.4rem",
                  fontSize: "0.82rem",
                  fontWeight: 650,
                  color: "#FDFCFA",
                  cursor: isParsingRecipe || !aiInputText.trim() ? "default" : "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  opacity: !aiInputText.trim() || isParsingRecipe ? 0.65 : 1,
                  boxShadow: "0 2px 8px rgba(197, 160, 89, 0.25)",
                }}
              >
                {isParsingRecipe ? (
                  <>
                    <span style={{ display: "inline-flex", gap: "2px", alignItems: "center" }}>
                      {[0, 1, 2].map((i) => (
                        <span
                          key={i}
                          style={{
                            width: "3px",
                            height: "3px",
                            borderRadius: "50%",
                            backgroundColor: "#FDFCFA",
                            display: "inline-block",
                            animation: `aether-pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                          }}
                        />
                      ))}
                    </span>
                    <span>AI解析中…</span>
                  </>
                ) : (
                  <>
                    <SparklesIcon />
                    <span>抽出を実行</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── 上書き確認モーダル ─── */}
      {showOverwriteConfirm && pendingParsedData && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1200,
            background: "rgba(0, 0, 0, 0.4)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
            animation: "arca-fade-in 0.2s ease",
          }}
          onClick={() => setShowOverwriteConfirm(false)}
        >
          <div
            className="arca-card"
            style={{
              width: "100%",
              maxWidth: "440px",
              background: "var(--bg-card-solid)",
              borderRadius: "20px",
              border: "1px solid var(--border-subtle)",
              padding: "1.8rem clamp(1.2rem, 4vw, 1.8rem)",
              boxShadow: "var(--shadow-modal)",
              display: "flex",
              flexDirection: "column",
              gap: "1.2rem",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 750, color: C.charcoal }}>
              入力内容を上書きしますか？
            </h3>
            <p style={{ margin: 0, fontSize: "0.85rem", color: C.charcoalMid, lineHeight: 1.6 }}>
              現在エディタに入力されているレシピ内容を、AIで抽出した「{pendingParsedData.title}」の情報で上書きします。
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.65rem", marginTop: "0.4rem" }}>
              <button
                type="button"
                onClick={() => {
                  setShowOverwriteConfirm(false);
                  setPendingParsedData(null);
                }}
                style={{
                  background: "rgba(0, 0, 0, 0.05)",
                  border: "none",
                  borderRadius: "10px",
                  padding: "0.55rem 1rem",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  color: C.charcoalMid,
                  cursor: "pointer",
                }}
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => {
                  applyParsedData(pendingParsedData);
                  setShowOverwriteConfirm(false);
                  setPendingParsedData(null);
                  setAiInputText("");
                }}
                style={{
                  background: C.gold,
                  border: "none",
                  borderRadius: "10px",
                  padding: "0.55rem 1.25rem",
                  fontSize: "0.82rem",
                  fontWeight: 650,
                  color: "#FDFCFA",
                  cursor: "pointer",
                  boxShadow: "0 2px 8px rgba(197, 160, 89, 0.25)",
                }}
              >
                上書きする
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── クリップボード画像 貼り付け先選択モーダル ─── */}
      {pasteCandidateImage &&
        createPortal(
          <div
            className="arca-modal-overlay"
            data-testid="paste-target-modal"
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 2000,
              background: "rgba(0, 0, 0, 0.45)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "1rem",
              boxSizing: "border-box",
            }}
            onClick={() => setPasteCandidateImage(null)}
          >
            <div
              className="arca-card"
              style={{
                width: "100%",
                maxWidth: "460px",
                background: "var(--bg-card-solid)",
                borderRadius: "24px",
                border: "1px solid var(--border-subtle)",
                boxShadow: "var(--shadow-modal)",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                animation: "arca-modal-pop 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* モーダルヘッダー */}
              <div
                style={{
                  padding: "1.4rem 1.6rem 1rem",
                  borderBottom: "1px solid var(--border-subtle)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <h3
                    style={{
                      margin: 0,
                      fontSize: "1.05rem",
                      fontWeight: 750,
                      color: C.charcoal,
                      letterSpacing: "-0.01em",
                    }}
                  >
                    画像の貼り付け先を選択
                  </h3>
                  <p
                    style={{
                      margin: "0.25rem 0 0",
                      fontSize: "0.76rem",
                      color: C.charcoalLight,
                    }}
                  >
                    この画像をどの箇所に貼り付けますか？
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPasteCandidateImage(null)}
                  style={{
                    background: "none",
                    border: "none",
                    padding: "0.4rem",
                    cursor: "pointer",
                    color: C.charcoalLight,
                    borderRadius: "8px",
                  }}
                  aria-label="閉じる"
                >
                  ✕
                </button>
              </div>

              {/* 貼り付け候補画像のプレビュー */}
              <div
                style={{
                  padding: "0.8rem 1.6rem",
                  background: "rgba(0, 0, 0, 0.02)",
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  borderBottom: "1px solid var(--border-subtle)",
                }}
              >
                <img
                  src={pasteCandidateImage}
                  alt="Paste preview"
                  data-testid="paste-image-preview"
                  style={{
                    maxHeight: "130px",
                    maxWidth: "100%",
                    borderRadius: "12px",
                    objectFit: "contain",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                  }}
                />
              </div>

              {/* 選択肢リスト（スクロール可能） */}
              <div
                style={{
                  padding: "0.8rem 1.2rem",
                  maxHeight: "300px",
                  overflowY: "auto",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.45rem",
                }}
              >
                {/* 1. 完成写真 */}
                <button
                  type="button"
                  onClick={() => handleApplyPasteTarget("cover")}
                  data-testid="paste-target-cover"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.85rem",
                    padding: "0.75rem 0.9rem",
                    borderRadius: "14px",
                    border: "1px solid var(--border-subtle)",
                    background: C.white,
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = C.gold;
                    e.currentTarget.style.background = C.goldFaint;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--border-subtle)";
                    e.currentTarget.style.background = C.white;
                  }}
                >
                  <div
                    style={{
                      width: "34px",
                      height: "34px",
                      borderRadius: "10px",
                      background: C.goldFaint,
                      color: C.goldDark,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <CameraIcon />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "0.85rem", fontWeight: 700, color: C.charcoal }}>
                      完成写真（メイン画像）
                    </div>
                    <div style={{ fontSize: "0.72rem", color: C.charcoalLight, marginTop: "1px" }}>
                      {imageUrl ? "現在の完成写真を置き換えます" : "料理のメイン写真として設定します"}
                    </div>
                  </div>
                  {imageUrl && (
                    <span
                      style={{
                        fontSize: "0.68rem",
                        padding: "0.15rem 0.45rem",
                        borderRadius: "6px",
                        background: C.goldFaint2,
                        color: C.goldDark,
                        fontWeight: 600,
                        flexShrink: 0,
                      }}
                    >
                      置換
                    </span>
                  )}
                </button>

                {/* 2. 各手順（ステップ） */}
                {steps.map((step, idx) => (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => handleApplyPasteTarget({ stepId: step.id })}
                    data-testid={`paste-target-step-${idx}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.85rem",
                      padding: "0.75rem 0.9rem",
                      borderRadius: "14px",
                      border: "1px solid var(--border-subtle)",
                      background: C.white,
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "all 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = C.gold;
                      e.currentTarget.style.background = C.goldFaint;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "var(--border-subtle)";
                      e.currentTarget.style.background = C.white;
                    }}
                  >
                    <div
                      style={{
                        width: "34px",
                        height: "34px",
                        borderRadius: "10px",
                        background: C.gold,
                        color: "#fff",
                        fontSize: "0.85rem",
                        fontWeight: 700,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {idx + 1}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "0.85rem", fontWeight: 700, color: C.charcoal }}>
                        ステップ {idx + 1}
                      </div>
                      <div
                        style={{
                          fontSize: "0.72rem",
                          color: C.charcoalLight,
                          marginTop: "1px",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {step.text.trim() || "（手順テキスト未入力）"}
                      </div>
                    </div>
                    {step.imageUrl && (
                      <span
                        style={{
                          fontSize: "0.68rem",
                          padding: "0.15rem 0.45rem",
                          borderRadius: "6px",
                          background: C.goldFaint2,
                          color: C.goldDark,
                          fontWeight: 600,
                          flexShrink: 0,
                        }}
                      >
                        写真あり
                      </span>
                    )}
                  </button>
                ))}

                {/* 3. 新しいステップを追加して設定 */}
                <button
                  type="button"
                  onClick={() => handleApplyPasteTarget("newStep")}
                  data-testid="paste-target-new-step"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.85rem",
                    padding: "0.75rem 0.9rem",
                    borderRadius: "14px",
                    border: "1.5px dashed var(--border-subtle)",
                    background: "rgba(0,0,0,0.01)",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = C.gold;
                    e.currentTarget.style.background = C.goldFaint;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--border-subtle)";
                    e.currentTarget.style.background = "rgba(0,0,0,0.01)";
                  }}
                >
                  <div
                    style={{
                      width: "34px",
                      height: "34px",
                      borderRadius: "10px",
                      background: C.goldFaint2,
                      color: C.goldDark,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <PlusIcon />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "0.85rem", fontWeight: 700, color: C.goldDark }}>
                      ＋ 新しいステップを追加して設定
                    </div>
                    <div style={{ fontSize: "0.72rem", color: C.charcoalLight, marginTop: "1px" }}>
                      新しい手順を作成し、そこに写真を登録します
                    </div>
                  </div>
                </button>
              </div>

              {/* モーダルフッター */}
              <div
                style={{
                  padding: "0.8rem 1.6rem 1.2rem",
                  borderTop: "1px solid var(--border-subtle)",
                  display: "flex",
                  justifyContent: "flex-end",
                }}
              >
                <button
                  type="button"
                  data-testid="paste-modal-cancel"
                  onClick={() => setPasteCandidateImage(null)}
                  style={{
                    background: "rgba(0, 0, 0, 0.05)",
                    border: "none",
                    borderRadius: "10px",
                    padding: "0.55rem 1.2rem",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    color: C.charcoalMid,
                    cursor: "pointer",
                  }}
                >
                  キャンセル
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ─── ピル型トースト通知 ─── */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="arca-toast"
          style={{
            position: "fixed",
            bottom: "2.5rem",
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(36, 36, 38, 0.95)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            color: "#FDFCFA",
            padding: "0.75rem 1.4rem",
            borderRadius: "16px",
            fontSize: "0.82rem",
            fontWeight: 550,
            lineHeight: 1.5,
            textAlign: "center",
            maxWidth: "min(90vw, 560px)",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.22)",
            zIndex: 1300,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.6rem",
            pointerEvents: "none",
            letterSpacing: "0.01em",
            animation: "arca-toast-in 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
