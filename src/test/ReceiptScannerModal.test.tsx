/**
 * src/test/ReceiptScannerModal.test.tsx
 * Arca — ReceiptScannerModal コンポーネント単体テスト
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ReceiptScannerModal } from "../components/finance/ReceiptScannerModal";
import * as receiptOcrService from "../services/receiptOcrService";

describe("ReceiptScannerModal コンポーネント", () => {
  it("モーダルが閉じているときは何もレンダリングされない", () => {
    const { container } = render(
      <ReceiptScannerModal isOpen={false} onClose={vi.fn()} onScanComplete={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("モーダルが開いたときカメラ起動ボタンと写真ライブラリ選択ボタンが表示される", () => {
    render(
      <ReceiptScannerModal isOpen={true} onClose={vi.fn()} onScanComplete={vi.fn()} />
    );

    expect(screen.getByText("レシートをカメラで読み取る")).toBeInTheDocument();
    expect(screen.getByText("カメラを起動して撮影")).toBeInTheDocument();
    expect(screen.getByText("写真ライブラリから選択")).toBeInTheDocument();
    expect(screen.getByText("💡 レシート撮影のコツ")).toBeInTheDocument();
    expect(screen.getByText(/「店名（一番上）」から「合計金額（外税・請求額）」までが全て入るように/)).toBeInTheDocument();
  });

  it("カメラ用 input 要素に capture='environment' と accept='image/*' が設定されている", () => {
    const { container } = render(
      <ReceiptScannerModal isOpen={true} onClose={vi.fn()} onScanComplete={vi.fn()} />
    );

    const inputs = container.querySelectorAll("input[type='file']");
    expect(inputs.length).toBe(2);

    const cameraInput = Array.from(inputs).find(
      (input) => input.getAttribute("capture") === "environment"
    );
    expect(cameraInput).toBeDefined();
    expect(cameraInput?.getAttribute("accept")).toBe("image/*");
  });

  it("画像ファイル選択時にOCR解析が実行され onScanComplete が呼ばれる", async () => {
    const mockScanComplete = vi.fn();
    vi.spyOn(receiptOcrService, "compressReceiptImage").mockResolvedValue({
      base64: "mock-base64",
      mimeType: "image/jpeg",
      dataUrl: "data:image/jpeg;base64,mock-base64",
    });

    vi.spyOn(receiptOcrService, "parseReceiptWithGemini").mockResolvedValue({
      storeName: "テストスーパー",
      date: "2026-08-25",
      totalAmount: 1500,
      paymentMethod: "現金",
      items: [{ name: "テスト品目", amount: 1500, category: "食料品" }],
    });

    const { container } = render(
      <ReceiptScannerModal isOpen={true} onClose={vi.fn()} onScanComplete={mockScanComplete} />
    );

    const fileInput = container.querySelector("input[type='file']") as HTMLInputElement;
    const dummyFile = new File(["dummy content"], "receipt.jpg", { type: "image/jpeg" });

    fireEvent.change(fileInput, { target: { files: [dummyFile] } });

    await waitFor(() => {
      expect(mockScanComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          storeName: "テストスーパー",
          totalAmount: 1500,
        }),
        "data:image/jpeg;base64,mock-base64"
      );
    });
  });
});
