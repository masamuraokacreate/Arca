/**
 * src/test/TransactionModal.test.tsx
 * Arca — TransactionModal コンポーネント単体テスト
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TransactionModal } from "../components/finance/TransactionModal";
import type { ExpenseTransaction } from "../types/finance";

describe("TransactionModal コンポーネント - レシート拡大プレビュー機能", () => {
  const mockTransactionWithReceipt: ExpenseTransaction = {
    id: "tx-test-1",
    date: "2026-09-20",
    title: "スーパーマルエツ",
    totalAmount: 1580,
    category: "食料品",
    paymentMethod: "Oliveカード",
    items: [
      { id: "item-1", name: "牛乳", amount: 250, category: "食料品", quantity: 1 },
      { id: "item-2", name: "卵", amount: 280, category: "食料品", quantity: 1 },
    ],
    isReconciled: false,
    receiptImageUrl: "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
    memo: "テストメモ",
    createdAt: "2026-09-20T00:00:00.000Z",
    updatedAt: "2026-09-20T00:00:00.000Z",
  };

  it("receiptImageUrl がある場合、サムネイルと拡大ボタンが表示される", () => {
    render(
      <TransactionModal
        isOpen={true}
        initialTransaction={mockTransactionWithReceipt}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText("📷 レシートOCR解析")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "クリックしてレシート写真を拡大表示" })).toBeInTheDocument();
    expect(screen.getByText("拡大")).toBeInTheDocument();
  });

  it("拡大ボタンをクリックすると、ライトボックスプレビューモーダルがポップアップ表示される", () => {
    render(
      <TransactionModal
        isOpen={true}
        initialTransaction={mockTransactionWithReceipt}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );

    // 最初は拡大モーダルは表示されていない
    expect(screen.queryByText("レシート写真プレビュー")).not.toBeInTheDocument();

    // 拡大ボタンをクリック
    const zoomButton = screen.getByRole("button", { name: "クリックしてレシート写真を拡大表示" });
    fireEvent.click(zoomButton);

    // 拡大プレビューが表示される
    expect(screen.getByText("レシート写真プレビュー")).toBeInTheDocument();
    expect(screen.getByText("(スーパーマルエツ)")).toBeInTheDocument();
    const previewImg = screen.getByAltText("レシート写真");
    expect(previewImg).toBeInTheDocument();
    expect(previewImg).toHaveAttribute("src", "data:image/jpeg;base64,/9j/4AAQSkZJRg==");
  });

  it("ライトボックス内の「閉じる」ボタンをクリックすると拡大モーダルが閉じる", () => {
    render(
      <TransactionModal
        isOpen={true}
        initialTransaction={mockTransactionWithReceipt}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const zoomButton = screen.getByRole("button", { name: "クリックしてレシート写真を拡大表示" });
    fireEvent.click(zoomButton);
    expect(screen.getByText("レシート写真プレビュー")).toBeInTheDocument();

    // 「プレビューを閉じる」ボタンをクリック
    const closeBtns = screen.getAllByRole("button", { name: "プレビューを閉じる" });
    expect(closeBtns.length).toBeGreaterThan(0);
    fireEvent.click(closeBtns[0]);

    // 拡大モーダルが消える
    expect(screen.queryByText("レシート写真プレビュー")).not.toBeInTheDocument();
  });

  it("Escキーを押すと拡大モーダルが閉じる", () => {
    render(
      <TransactionModal
        isOpen={true}
        initialTransaction={mockTransactionWithReceipt}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const zoomButton = screen.getByRole("button", { name: "クリックしてレシート写真を拡大表示" });
    fireEvent.click(zoomButton);
    expect(screen.getByText("レシート写真プレビュー")).toBeInTheDocument();

    // Escape キーを押下
    fireEvent.keyDown(window, { key: "Escape" });

    // 拡大モーダルが消える
    expect(screen.queryByText("レシート写真プレビュー")).not.toBeInTheDocument();
  });

  it("保存処理でエラーが発生した場合、エラーバナーが表示されモーダルが閉じないこと", async () => {
    const onSaveError = vi.fn().mockRejectedValue(new Error("Firestore ドキュメントサイズ超過"));
    const onClose = vi.fn();

    render(
      <TransactionModal
        isOpen={true}
        initialTransaction={mockTransactionWithReceipt}
        onSave={onSaveError}
        onClose={onClose}
      />
    );

    const submitBtn = screen.getByRole("button", { name: "変更を保存" });
    fireEvent.click(submitBtn);

    // エラーバナーが表示される
    expect(await screen.findByText("保存に失敗しました")).toBeInTheDocument();
    expect(screen.getByText("Firestore ドキュメントサイズ超過")).toBeInTheDocument();
    expect(screen.getByText(/入力内容は保持されています/)).toBeInTheDocument();

    // モーダルが閉じられていないこと（入力データ保護）
    expect(onClose).not.toHaveBeenCalled();
  });
});
