/**
 * src/test/RecipeImagePlacement.test.tsx
 * レシピの画像貼り付け先選択（完成写真、各調理手順、新規手順）およびステップ写真の単体テスト
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Recipe } from "../types/recipe";
import { RecipeEditor } from "../components/recipes/RecipeEditor";
import { RecipeDetail } from "../components/recipes/RecipeDetail";
import * as storage from "../lib/recipeStorage";

const mockRecipe: Recipe = {
  id: "recipe-img-test",
  title: "画像貼り付けテストレシピ",
  servings: "2人前",
  tags: ["テスト"],
  favorite: false,
  ingredients: [{ id: "ing-1", name: "テスト食材", amount: "100g" }],
  steps: [
    { id: "step-1", text: "ステップ1の手順です。" },
    { id: "step-2", text: "ステップ2の手順です。" },
  ],
  createdAt: Date.now(),
  updatedAt: Date.now(),
  isDeleted: false,
};

describe("レシピ画像配置機能 (RecipeImagePlacement)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(storage, "compressRecipeImage").mockImplementation(async () => "data:image/jpeg;base64,mockBase64");
  });

  it("エディタ内で画像がペーストされたとき、貼り付け先選択モーダルが表示される", async () => {
    render(
      <RecipeEditor
        initialRecipe={mockRecipe}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const editorContainer = screen.getByTestId("recipe-editor-container");
    const dummyFile = new File(["dummy image"], "test.png", { type: "image/png" });

    // ペーストイベントの発火
    fireEvent.paste(editorContainer, {
      clipboardData: {
        files: [dummyFile],
        items: [{ type: "image/png", getAsFile: () => dummyFile }],
      },
    });

    // モーダルの表示確認
    expect(await screen.findByTestId("paste-target-modal")).toBeInTheDocument();
    expect(screen.getByText("画像の貼り付け先を選択")).toBeInTheDocument();
    expect(screen.getByTestId("paste-target-cover")).toBeInTheDocument();
    expect(screen.getByTestId("paste-target-step-0")).toBeInTheDocument();
    expect(screen.getByTestId("paste-target-step-1")).toBeInTheDocument();
    expect(screen.getByTestId("paste-target-new-step")).toBeInTheDocument();
  });

  it("ペースト先モーダルで「完成写真」を選択すると、メイン画像に設定されてモーダルが閉じる", async () => {
    const handleSave = vi.fn();
    render(
      <RecipeEditor
        initialRecipe={mockRecipe}
        onSave={handleSave}
        onCancel={vi.fn()}
      />
    );

    const editorContainer = screen.getByTestId("recipe-editor-container");
    const dummyFile = new File(["dummy image"], "cover.jpg", { type: "image/jpeg" });

    fireEvent.paste(editorContainer, {
      clipboardData: {
        files: [dummyFile],
        items: [{ type: "image/jpeg", getAsFile: () => dummyFile }],
      },
    });

    const coverTargetBtn = await screen.findByTestId("paste-target-cover");
    await userEvent.click(coverTargetBtn);

    // モーダルが閉じる
    expect(screen.queryByTestId("paste-target-modal")).not.toBeInTheDocument();

    // 保存して imageUrl が反映されたことを確認
    const saveBtn = screen.getByRole("button", { name: "保存する" });
    await userEvent.click(saveBtn);

    expect(handleSave).toHaveBeenCalledWith(
      expect.objectContaining({
        imageUrl: "data:image/jpeg;base64,mockBase64",
      })
    );
  });

  it("ペースト先モーダルで「ステップ 1」を選択すると、ステップ1の画像に設定されてモーダルが閉じる", async () => {
    const handleSave = vi.fn();
    render(
      <RecipeEditor
        initialRecipe={mockRecipe}
        onSave={handleSave}
        onCancel={vi.fn()}
      />
    );

    const editorContainer = screen.getByTestId("recipe-editor-container");
    const dummyFile = new File(["dummy image"], "step1.jpg", { type: "image/jpeg" });

    fireEvent.paste(editorContainer, {
      clipboardData: {
        files: [dummyFile],
        items: [{ type: "image/jpeg", getAsFile: () => dummyFile }],
      },
    });

    const step0TargetBtn = await screen.findByTestId("paste-target-step-0");
    await userEvent.click(step0TargetBtn);

    // モーダルが閉じる
    expect(screen.queryByTestId("paste-target-modal")).not.toBeInTheDocument();

    // 保存して steps[0].imageUrl が反映されたことを確認
    const saveBtn = screen.getByRole("button", { name: "保存する" });
    await userEvent.click(saveBtn);

    expect(handleSave).toHaveBeenCalledWith(
      expect.objectContaining({
        steps: expect.arrayContaining([
          expect.objectContaining({
            id: "step-1",
            imageUrl: "data:image/jpeg;base64,mockBase64",
          }),
        ]),
      })
    );
  });

  it("ペースト先モーダルで「新しいステップを追加して設定」を選択すると、新ステップが作成され画像が設定される", async () => {
    const handleSave = vi.fn();
    render(
      <RecipeEditor
        initialRecipe={mockRecipe}
        onSave={handleSave}
        onCancel={vi.fn()}
      />
    );

    const editorContainer = screen.getByTestId("recipe-editor-container");
    const dummyFile = new File(["dummy image"], "newstep.jpg", { type: "image/jpeg" });

    fireEvent.paste(editorContainer, {
      clipboardData: {
        files: [dummyFile],
        items: [{ type: "image/jpeg", getAsFile: () => dummyFile }],
      },
    });

    const newStepTargetBtn = await screen.findByTestId("paste-target-new-step");
    await userEvent.click(newStepTargetBtn);

    // モーダルが閉じる
    expect(screen.queryByTestId("paste-target-modal")).not.toBeInTheDocument();

    // 保存してステップ数が3になり、最後のステップに画像が設定されていることを確認
    const saveBtn = screen.getByRole("button", { name: "保存する" });
    await userEvent.click(saveBtn);

    const savedRecipe = handleSave.mock.calls[0][0] as Recipe;
    expect(savedRecipe.steps.length).toBe(3);
    expect(savedRecipe.steps[2].imageUrl).toBe("data:image/jpeg;base64,mockBase64");
  });

  it("モーダルでキャンセルボタンを押すと画像は適用されずにモーダルが閉じる", async () => {
    render(
      <RecipeEditor
        initialRecipe={mockRecipe}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const editorContainer = screen.getByTestId("recipe-editor-container");
    const dummyFile = new File(["dummy image"], "cancel.jpg", { type: "image/jpeg" });

    fireEvent.paste(editorContainer, {
      clipboardData: {
        files: [dummyFile],
        items: [{ type: "image/jpeg", getAsFile: () => dummyFile }],
      },
    });

    expect(await screen.findByTestId("paste-target-modal")).toBeInTheDocument();

    const cancelBtn = screen.getByTestId("paste-modal-cancel");
    await userEvent.click(cancelBtn);

    expect(screen.queryByTestId("paste-target-modal")).not.toBeInTheDocument();
  });

  it("ステップの画像削除ボタンをクリックするとステップ画像が削除される", async () => {
    const recipeWithStepImg: Recipe = {
      ...mockRecipe,
      steps: [
        { id: "step-1", text: "手順1", imageUrl: "data:image/jpeg;base64,existingStepImg" },
      ],
    };

    const handleSave = vi.fn();
    render(
      <RecipeEditor
        initialRecipe={recipeWithStepImg}
        onSave={handleSave}
        onCancel={vi.fn()}
      />
    );

    // 「削除」ボタンをクリック
    const deleteImgBtn = screen.getByRole("button", { name: "削除" });
    await userEvent.click(deleteImgBtn);

    // 「写真を追加」ボタンが表示される
    expect(screen.getByRole("button", { name: /写真を追加/ })).toBeInTheDocument();

    // 保存して steps[0].imageUrl が undefined になっていることを確認
    const saveBtn = screen.getByRole("button", { name: "保存する" });
    await userEvent.click(saveBtn);

    const savedRecipe = handleSave.mock.calls[0][0] as Recipe;
    expect(savedRecipe.steps[0].imageUrl).toBeUndefined();
  });

  it("RecipeDetail でステップ写真をクリックすると拡大モーダルが表示され、閉じるボタンで閉じられる", async () => {
    const recipeWithStepImg: Recipe = {
      ...mockRecipe,
      steps: [
        { id: "step-1", text: "手順1", imageUrl: "data:image/jpeg;base64,stepImagePreview" },
      ],
    };

    render(
      <RecipeDetail
        recipe={recipeWithStepImg}
        onBack={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onToggleFavorite={vi.fn()}
      />
    );

    const stepImg = screen.getByAltText("Step 1");
    await userEvent.click(stepImg);

    // 拡大モーダルが表示される
    const previewModal = await screen.findByTestId("recipe-image-preview-modal");
    expect(previewModal).toBeInTheDocument();

    // 閉じるボタンをクリック
    const closeBtn = screen.getByRole("button", { name: "閉じる" });
    await userEvent.click(closeBtn);

    expect(screen.queryByTestId("recipe-image-preview-modal")).not.toBeInTheDocument();
  });
});
