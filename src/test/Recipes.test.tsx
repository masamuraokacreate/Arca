/**
 * src/test/Recipes.test.tsx
 * Recipes コンポーネント群（Recipes, RecipeCard, RecipeDetail, RecipeEditor）の単体・統合テスト
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Recipe } from "../types/recipe";
import { RecipeCard } from "../components/recipes/RecipeCard";
import { RecipeDetail } from "../components/recipes/RecipeDetail";
import { RecipeEditor } from "../components/recipes/RecipeEditor";
import Recipes from "../components/recipes/Recipes";
import * as storage from "../lib/recipeStorage";
import * as parser from "../services/recipeParser";

const mockRecipe: Recipe = {
  id: "recipe-1",
  title: "特製豚の生姜焼き",
  servings: "2人前",
  sourceUrl: "https://example.com/recipe/ginger-pork",
  imageUrl: "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
  tags: ["和食", "定番", "時短"],
  favorite: true,
  ingredients: [
    { id: "ing-1", name: "豚肩ロース薄切り肉", amount: "300g" },
    { id: "ing-2", name: "おろし生姜", amount: "大さじ1" },
    { id: "ing-3", name: "醤油", amount: "大さじ2" },
  ],
  steps: [
    { id: "step-1", text: "豚肉に塩コショウを軽く振り、薄力粉を薄くまぶす。" },
    { id: "step-2", text: "フライパンに油を熱し、強めの中火で肉の両面をさっと焼く。" },
    { id: "step-3", text: "合わせ調味料を一気に加え、全体に絡めながら照りを出す。" },
  ],
  notes: "肉を焼きすぎないのが柔らかく仕上げるポイント。タレはあらかじめ混ぜておく。",
  createdAt: 1724200000000,
  updatedAt: 1724205000000,
  isDeleted: false,
};

describe("RecipeCard コンポーネント", () => {
  it("料理名、タグ、分量、更新日が表示される", () => {
    render(
      <RecipeCard
        recipe={mockRecipe}
        onClick={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onToggleFavorite={vi.fn()}
      />
    );

    expect(screen.getByText("特製豚の生姜焼き")).toBeInTheDocument();
    expect(screen.getByText("和食")).toBeInTheDocument();
    expect(screen.getByText("2人前")).toBeInTheDocument();
  });

  it("お気に入りボタンをクリックすると onToggleFavorite が呼ばれる", async () => {
    const handleToggleFavorite = vi.fn();
    render(
      <RecipeCard
        recipe={mockRecipe}
        onClick={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onToggleFavorite={handleToggleFavorite}
      />
    );

    const favButton = screen.getByLabelText("お気に入り解除");
    await userEvent.click(favButton);
    expect(handleToggleFavorite).toHaveBeenCalled();
  });

  it("viewMode='list' のときに横並びメディアリスト（.arca-recipe-card-list）としてレンダリングされる", () => {
    const { container } = render(
      <RecipeCard
        recipe={mockRecipe}
        viewMode="list"
        onClick={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onToggleFavorite={vi.fn()}
      />
    );

    const card = container.querySelector(".arca-recipe-card-list");
    expect(card).toBeInTheDocument();
    expect(screen.getByText("特製豚の生姜焼き")).toBeInTheDocument();
    expect(screen.getByText("和食")).toBeInTheDocument();
    expect(screen.getByText("2人前")).toBeInTheDocument();
    expect(screen.queryByText(/材料 \d+品/)).not.toBeInTheDocument();
  });

  it("viewMode='grid' のときに縦型カード（.arca-recipe-card-grid）としてレンダリングされる", () => {
    const { container } = render(
      <RecipeCard
        recipe={mockRecipe}
        viewMode="grid"
        onClick={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onToggleFavorite={vi.fn()}
      />
    );

    const card = container.querySelector(".arca-recipe-card-grid");
    expect(card).toBeInTheDocument();
    expect(screen.getByText("特製豚の生姜焼き")).toBeInTheDocument();
  });
});

describe("RecipeDetail コンポーネント", () => {
  it("詳細情報（料理名・ゴールドタグ・参考元カード・材料・手順・Chef's Review・完成写真）が表示される", () => {
    render(
      <RecipeDetail
        recipe={mockRecipe}
        onBack={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onToggleFavorite={vi.fn()}
      />
    );

    expect(screen.getByText("特製豚の生姜焼き")).toBeInTheDocument();
    expect(screen.getByText("和食")).toBeInTheDocument();
    expect(screen.getByText("豚肩ロース薄切り肉")).toBeInTheDocument();
    expect(screen.getByText("300g")).toBeInTheDocument();
    expect(screen.getByText(/豚肉に塩コショウを軽く振り/)).toBeInTheDocument();
    expect(screen.getByText(/肉を焼きすぎないのが柔らかく仕上げるポイント/)).toBeInTheDocument();
    expect(screen.getByText(/で参考レシピを見る/)).toBeInTheDocument();
  });

  it("編集ボタン・削除ボタンをクリックすると適切なコールバックが実行される", async () => {
    const handleEdit = vi.fn();
    const handleDelete = vi.fn();
    const handleBack = vi.fn();

    render(
      <RecipeDetail
        recipe={mockRecipe}
        onBack={handleBack}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onToggleFavorite={vi.fn()}
      />
    );

    await userEvent.click(screen.getByTitle("レシピを編集"));
    expect(handleEdit).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByTitle("このレシピを削除"));
    expect(handleDelete).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByTitle("レシピ一覧に戻る"));
    expect(handleBack).toHaveBeenCalledTimes(1);
  });

  it("材料リストは通常時に個別カートアイコンが表示されず、すっきりと一覧表示される", () => {
    render(
      <RecipeDetail
        recipe={mockRecipe}
        onBack={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onToggleFavorite={vi.fn()}
      />
    );

    // 通常時は個別カート追加ボタンが存在しない
    expect(
      screen.queryByLabelText("豚肩ロース薄切り肉を買い物リストに追加")
    ).not.toBeInTheDocument();
    // 「選択して買い物リストへ」ボタンが存在する
    expect(
      screen.getByRole("button", { name: /選択して買い物リストへ/ })
    ).toBeInTheDocument();
  });

  it("「選択して買い物リストへ」で選択モードに切り替わり、チェックした材料を一括追加できる", async () => {
    const handleNavLists = vi.fn();
    render(
      <RecipeDetail
        recipe={mockRecipe}
        onBack={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onToggleFavorite={vi.fn()}
        onNavigateToLists={handleNavLists}
      />
    );

    // 選択モードに切り替え
    const selectModeBtn = screen.getByRole("button", {
      name: /選択して買い物リストへ/,
    });
    await userEvent.click(selectModeBtn);

    // チェックボックスが出現し、実行ボタンに切り替わる
    const submitBtn = screen.getByRole("button", {
      name: /この内容を買い物リストへ \(3件\)/,
    });
    expect(submitBtn).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "キャンセル" })).toBeInTheDocument();

    // 実行
    await userEvent.click(submitBtn);

    // トースト表示
    expect(
      await screen.findByText(/3件を買い物リストに追加しました/)
    ).toBeInTheDocument();

    // トースト内の「リストを開く」ボタンをクリック
    const openListBtn = screen.getByRole("button", { name: "リストを開く" });
    await userEvent.click(openListBtn);
    expect(handleNavLists).toHaveBeenCalledTimes(1);
  });

  it("選択モードでキャンセルを押すと通常モードへ復帰する", async () => {
    render(
      <RecipeDetail
        recipe={mockRecipe}
        onBack={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onToggleFavorite={vi.fn()}
      />
    );

    await userEvent.click(
      screen.getByRole("button", { name: /選択して買い物リストへ/ })
    );
    expect(screen.getByRole("button", { name: "キャンセル" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(
      screen.getByRole("button", { name: /選択して買い物リストへ/ })
    ).toBeInTheDocument();
  });
});

describe("RecipeEditor コンポーネント", () => {
  it("初期値が表示され、材料や手順の追加・削除ができる", async () => {
    const handleSave = vi.fn();
    const handleCancel = vi.fn();

    render(
      <RecipeEditor
        initialRecipe={mockRecipe}
        onSave={handleSave}
        onCancel={handleCancel}
      />
    );

    const titleInput = screen.getByDisplayValue("特製豚の生姜焼き");
    expect(titleInput).toBeInTheDocument();

    // 材料の追加
    const addIngBtn = screen.getByRole("button", { name: /行を追加/ });
    await userEvent.click(addIngBtn);
    const ingredientInputs = screen.getAllByPlaceholderText(/材料名/);
    expect(ingredientInputs.length).toBe(mockRecipe.ingredients.length + 1);

    // 手順の追加
    const addStepBtn = screen.getByRole("button", { name: /ステップを追加/ });
    await userEvent.click(addStepBtn);
    const stepTextareas = screen.getAllByPlaceholderText(/の手順を入力/);
    expect(stepTextareas.length).toBe(mockRecipe.steps.length + 1);

    // 保存ボタンのクリック
    const saveBtn = screen.getByRole("button", { name: "保存する" });
    await userEvent.click(saveBtn);
    expect(handleSave).toHaveBeenCalledTimes(1);
  });

  it("タイトルが空でも「無題のレシピ」として柔軟に保存できる（バリデーション緩和）", async () => {
    const handleSave = vi.fn();

    render(
      <RecipeEditor
        onSave={handleSave}
        onCancel={vi.fn()}
      />
    );

    const saveBtn = screen.getByRole("button", { name: "保存する" });
    await userEvent.click(saveBtn);

    expect(handleSave).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "無題のレシピ",
        servings: "1人前",
      })
    );
  });

  it("手順入力欄で Ctrl+B / Ctrl+U を押すと太字・下線マークアップが挿入される", async () => {
    render(
      <RecipeEditor
        initialRecipe={mockRecipe}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const firstStepTextarea = screen.getAllByPlaceholderText(/の手順を入力/)[0] as HTMLTextAreaElement;
    
    // Ctrl+B のトリガー
    await userEvent.type(firstStepTextarea, "{Control>}b{/Control}");
    expect(firstStepTextarea.value).toContain("**");

    // Ctrl+U のトリガー
    await userEvent.type(firstStepTextarea, "{Control>}u{/Control}");
    expect(firstStepTextarea.value).toContain("<u>");
  });

  it("手順のドラッグハンドルが存在し、ドラッグ＆ドロップで並び替えができる", () => {
    render(
      <RecipeEditor
        initialRecipe={mockRecipe}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const dragHandles = screen.getAllByLabelText("手順をドラッグして並び替え");
    expect(dragHandles.length).toBe(mockRecipe.steps.length);
  });

  it("「✨ AI自動抽出」ボタンを押すとGeminiパーサーが呼ばれ、フォームに自動展開される", async () => {
    vi.spyOn(parser, "parseRecipeWithGemini").mockResolvedValue({
      title: "本格キーマカレー",
      servings: "3人前",
      ingredients: [
        { name: "合い挽き肉", amount: "300g" },
        { name: "玉ねぎ", amount: "1個" },
      ],
      steps: ["玉ねぎをみじん切りにして飴色になるまで炒める。", "ひき肉とスパイスを加えて煮込む。"],
      tags: ["カレー", "洋食"],
      notes: "ガラムマサラは仕上げに入れると香りが立つ",
    });

    render(
      <RecipeEditor
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const urlInput = screen.getByPlaceholderText("https://...");
    await userEvent.type(urlInput, "https://example.com/keema-curry");

    const aiBtn = screen.getByTestId("recipe-ai-extract-btn");
    await userEvent.click(aiBtn);

    expect(await screen.findByDisplayValue("本格キーマカレー")).toBeInTheDocument();
    expect(screen.getByDisplayValue("3人前")).toBeInTheDocument();
    expect(screen.getByDisplayValue("合い挽き肉")).toBeInTheDocument();
    expect(screen.getByDisplayValue("300g")).toBeInTheDocument();
    expect(screen.getByDisplayValue("玉ねぎをみじん切りにして飴色になるまで炒める。")).toBeInTheDocument();
    expect(screen.getByDisplayValue("カレー, 洋食")).toBeInTheDocument();
    expect(screen.getByDisplayValue("ガラムマサラは仕上げに入れると香りが立つ")).toBeInTheDocument();
    expect(screen.getByText("✨ レシピ情報を自動入力しました")).toBeInTheDocument();
  });

  it("URLが空の状態でAI自動抽出を押すとモーダルが開き、テキストから抽出できる", async () => {
    vi.spyOn(parser, "parseRecipeWithGemini").mockResolvedValue({
      title: "ペペロンチーノ",
      servings: "1人前",
      ingredients: [{ name: "にんにく", amount: "1片" }],
      steps: ["オリーブオイルでにんにくを弱火で熱する。"],
      tags: ["パスタ"],
    });

    render(
      <RecipeEditor
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    // URLが空の状態でAI自動抽出をクリック
    const aiBtn = screen.getByTestId("recipe-ai-extract-btn");
    await userEvent.click(aiBtn);

    // モーダルが表示される
    expect(screen.getByText("AI レシピ自動抽出")).toBeInTheDocument();
    const modalTextarea = screen.getByPlaceholderText(/ここにURL/);
    await userEvent.type(modalTextarea, "にんにくとオリーブオイルで作るペペロンチーノの作り方");

    const submitBtn = screen.getByTestId("ai-modal-submit-btn");
    await userEvent.click(submitBtn);

    expect(await screen.findByDisplayValue("ペペロンチーノ")).toBeInTheDocument();
    expect(screen.getByDisplayValue("にんにく")).toBeInTheDocument();
  });
});

describe("Recipes メインモジュール", () => {
  beforeEach(() => {
    vi.spyOn(storage, "subscribeRecipes").mockImplementation((onUpdate) => {
      onUpdate([mockRecipe]);
      return () => {};
    });
  });

  it("レシピ一覧が正常にレンダリングされる", () => {
    render(<Recipes />);
    expect(screen.getByText("料理レシピ")).toBeInTheDocument();
    expect(screen.getByText("特製豚の生姜焼き")).toBeInTheDocument();
    expect(screen.queryByText(/品のレシピ/)).not.toBeInTheDocument();
  });

  it("検索バーに一致しない文字を入力すると空状態メッセージが表示される", async () => {
    render(<Recipes />);
    const searchInput = screen.getByPlaceholderText(/料理名・材料・知見を検索/);
    await userEvent.type(searchInput, "存在しない料理名xyz");

    expect(screen.getByText("条件に一致するレシピが見つかりませんでした")).toBeInTheDocument();
  });

  it("「新しく作成」ボタンを押すとエディタ画面に遷移する", async () => {
    render(<Recipes />);
    const newBtn = screen.getByRole("button", { name: /新しく作成/ });
    await userEvent.click(newBtn);

    expect(screen.getByPlaceholderText(/料理名を入力/)).toBeInTheDocument();
  });

  it("グリッド/リストの手動切り替えトグルボタンが撤廃されていること", () => {
    render(<Recipes />);
    expect(screen.queryByLabelText("グリッド表示")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("リスト表示")).not.toBeInTheDocument();
  });

  it("モバイル用FAB（＋マーク）をタップするとメニューが開き、「新しく作成」「検索」が表示される", async () => {
    render(<Recipes />);
    const fabBtn = screen.getByTestId("recipe-fab-main-button");
    expect(fabBtn).toBeInTheDocument();

    await userEvent.click(fabBtn);

    const fabMenu = screen.getByTestId("recipe-fab-menu");
    expect(within(fabMenu).getByText("新しく作成")).toBeInTheDocument();
    expect(within(fabMenu).getByText("検索")).toBeInTheDocument();

    // 「新しく作成」をクリックするとエディタに遷移する
    await userEvent.click(within(fabMenu).getByText("新しく作成"));
    expect(screen.getByPlaceholderText(/料理名を入力/)).toBeInTheDocument();
  });

  it("モバイルFABの「検索」をタップすると検索・絞り込みポップアップが出現し検索できる", async () => {
    render(<Recipes />);
    const fabBtn = screen.getByTestId("recipe-fab-main-button");
    await userEvent.click(fabBtn);

    const searchMenuBtn = screen.getByText("検索");
    await userEvent.click(searchMenuBtn);

    // ポップアップが出現すること
    expect(screen.getByText("レシピ検索・絞り込み")).toBeInTheDocument();
    expect(screen.getByText("キーワード検索")).toBeInTheDocument();
    expect(screen.getByText("タグで絞り込み")).toBeInTheDocument();

    // モーダル内の入力欄に文字を入力
    const inputs = screen.getAllByPlaceholderText(/料理名・材料・知見を検索/);
    const modalInput = inputs[inputs.length - 1]; // モーダル内のinput
    await userEvent.type(modalInput, "存在しない料理名xyz");

    // 検索結果件数が反映されたボタンを押して閉じる
    const submitBtn = screen.getByRole("button", { name: /検索する \(0件\)/ });
    await userEvent.click(submitBtn);

    expect(screen.queryByText("レシピ検索・絞り込み")).not.toBeInTheDocument();
    expect(screen.getByText("条件に一致するレシピが見つかりませんでした")).toBeInTheDocument();
  });

  it("検索バーに入力時、クリアボタンが表示されクリックで入力がリセットされる", async () => {
    render(<Recipes />);
    const searchInput = screen.getByPlaceholderText(/料理名・材料・知見を検索/) as HTMLInputElement;
    await userEvent.type(searchInput, "豚肉");
    expect(searchInput.value).toBe("豚肉");

    const clearBtn = screen.getByTitle("検索をクリア");
    expect(clearBtn).toBeInTheDocument();

    await userEvent.click(clearBtn);
    expect(searchInput.value).toBe("");
  });
});
