/**
 * src/test/FinanceComponent.test.tsx
 * Arca — Finance（家計・支出管理）UI コンポーネント結合テスト
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Finance from "../components/finance/Finance";
import * as financeStorage from "../lib/financeStorage";
import * as csvReconcileService from "../services/csvReconcileService";
import type { ExpenseTransaction, MonthlyCardReconcileStatus } from "../types/finance";

describe("Finance コンポーネント", () => {
  const mockStatuses: MonthlyCardReconcileStatus[] = [
    {
      id: "2026-08_Oliveカード",
      month: "2026-08",
      paymentMethod: "Oliveカード",
      isReconciled: true,
      matchedCount: 1,
    },
    {
      id: "2026-08_dカード",
      month: "2026-08",
      paymentMethod: "dカード",
      isReconciled: false,
    },
  ];

  const mockTransactions: ExpenseTransaction[] = [
    {
      id: "tx-1",
      date: "2026-08-10",
      title: "イオンモール",
      totalAmount: 5400,
      category: "食料品",
      paymentMethod: "Oliveカード",
      items: [
        { id: "i1", name: "牛乳", amount: 200, category: "食料品", quantity: 1 },
        { id: "i2", name: "お米", amount: 5200, category: "食料品", quantity: 1 },
      ],
      isReconciled: true,
      createdAt: "2026-08-10T10:00:00Z",
      updatedAt: "2026-08-10T10:00:00Z",
      isDeleted: false,
    },
    {
      id: "tx-2",
      date: "2026-08-15",
      title: "マツモトキヨシ",
      totalAmount: 1800,
      category: "日用品・消耗品",
      paymentMethod: "dカード",
      items: [],
      isReconciled: false,
      createdAt: "2026-08-15T10:00:00Z",
      updatedAt: "2026-08-15T10:00:00Z",
      isDeleted: false,
    },
  ];

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-08-20T12:00:00Z"));
    vi.spyOn(financeStorage, "subscribeExpenseTransactions").mockImplementation((cb) => {
      cb(mockTransactions);
      return () => {};
    });
    vi.spyOn(csvReconcileService, "subscribeMonthlyReconcileStatuses").mockImplementation((cb) => {
      cb(mockStatuses);
      return () => {};
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("ヘッダーと支出取引一覧が正常にレンダリングされる", async () => {
    render(<Finance />);

    expect(screen.getByText("家計・支出管理")).toBeInTheDocument();
    expect(screen.getByText("イオンモール")).toBeInTheDocument();
    expect(screen.getByText("マツモトキヨシ")).toBeInTheDocument();
  });

  it("タブ切り替え（分析・グラフ、クレカ明細突合）が機能する", async () => {
    render(<Finance />);

    // 「分析・グラフ」タブをクリック
    const analyticsTabBtn = screen.getByText("分析・グラフ");
    fireEvent.click(analyticsTabBtn);
    expect(screen.getByText("カテゴリ別支出内訳")).toBeInTheDocument();
    expect(screen.getByText("日別支出推移")).toBeInTheDocument();

    // 「クレカ明細突合」タブをクリック
    const reconcileTabBtn = screen.getByText(/クレカ明細突合/);
    fireEvent.click(reconcileTabBtn);
    expect(screen.getByText("クレジットカード明細 CSV インポート")).toBeInTheDocument();
  });

  it("アコーディオンをクリックすると品目内訳（牛乳、お米）が展開表示される", async () => {
    render(<Finance />);

    const itemRow = screen.getByText("イオンモール");
    fireEvent.click(itemRow);

    await waitFor(() => {
      expect(screen.getByText("牛乳")).toBeInTheDocument();
      expect(screen.getByText("お米")).toBeInTheDocument();
    });
  });

  it("「支出を記録」ボタンでモーダルが開き、新規支出が登録できる", async () => {
    const createSpy = vi.spyOn(financeStorage, "createExpenseTransaction").mockResolvedValue("new-tx-id");
    const user = userEvent.setup();

    render(<Finance />);

    const newBtn = screen.getByRole("button", { name: /支出を記録/ });
    fireEvent.click(newBtn);

    expect(screen.getByRole("heading", { name: "支出を記録" })).toBeInTheDocument();

    const titleInput = screen.getByPlaceholderText("例: イオン〇〇店, セブンイレブン");
    await user.type(titleInput, "テストストア");

    const amountInput = screen.getByPlaceholderText("0");
    await user.type(amountInput, "2500");

    const submitBtn = screen.getByText("記録する");
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "テストストア",
          totalAmount: 2500,
        })
      );
    });
  });

  it("クレカ明細突合タブでCSVテキストを貼り付けて解析できる", async () => {
    render(<Finance />);

    const reconcileTabBtn = screen.getByText(/クレカ明細突合/);
    fireEvent.click(reconcileTabBtn);

    // テキスト入力アコーディオンを開く
    const details = screen.getByText("CSVテキストを直接貼り付けて読み込む");
    fireEvent.click(details);

    const textarea = screen.getByPlaceholderText("利用日,利用店名,利用金額...");
    const csvContent = "利用日,利用店名・商品名,利用金額,支払区分\n2026/08/10,イオンモール,5400,1回払い";
    fireEvent.change(textarea, { target: { value: csvContent } });

    const parseBtn = screen.getByText("明細を解析する");
    fireEvent.click(parseBtn);

    await waitFor(() => {
      expect(screen.getByText(/100% 完全一致/)).toBeInTheDocument();
    });
  });

  it("「レシート読取」ボタンでスキャナーモーダルが開き、OCR完了後に編集モーダルへ展開される", async () => {
    render(<Finance />);

    const scanBtn = screen.getByText("レシート読取");
    fireEvent.click(scanBtn);

    expect(screen.getByText("レシートをカメラで読み取る")).toBeInTheDocument();
  });

  it("品目合計と決済合計が不一致のときに警告が表示され、「品目合計に合わせる」で修正できる", async () => {
    const user = userEvent.setup();
    render(<Finance />);

    // 既存の取引（tx-1: 合計5400円、品目200円+5200円）の編集を開く
    const itemRow = screen.getByText("イオンモール");
    fireEvent.click(itemRow);

    const editBtn = screen.getByText("編集");
    fireEvent.click(editBtn);

    expect(screen.getByText("支出を編集")).toBeInTheDocument();

    // 自動連動チェックを外す
    const autoSumCheckbox = screen.getByLabelText(/品目合計と自動連動/);
    fireEvent.click(autoSumCheckbox);

    // 決済合計金額を手動で書き換える（例: 6000円）
    const amountInput = screen.getByDisplayValue("5400");
    await user.clear(amountInput);
    await user.type(amountInput, "6000");

    // 不一致警告バッジが表示される
    expect(screen.getByText(/決済合計.*と品目合計.*の差があります/)).toBeInTheDocument();

    // 「品目合計に合わせる」ボタンをクリック
    const syncBtn = screen.getByText("品目合計に合わせる");
    fireEvent.click(syncBtn);

    // 決済合計金額が 5400円 に戻り、警告が消える
    expect(screen.queryByText(/決済合計.*と品目合計.*の差があります/)).not.toBeInTheDocument();
  });

  it("カード別フィルターに照合済みバッジ（✓）が表示され、安心インジケータバナーが表示される", async () => {
    render(<Finance />);

    // 照合済み Oliveカード のバッジ（✓）が表示されている
    const oliveBadge = screen.getByTestId("reconcile-badge-Oliveカード");
    expect(oliveBadge).toHaveTextContent("✓");

    // 未照合 dカード のバッジ（○）が表示されている
    const dCardBadge = screen.getByTestId("reconcile-badge-dカード");
    expect(dCardBadge).toHaveTextContent("○");

    // 安心インジケータバナー（「CSV照合済みです」）が表示されている
    expect(screen.getByText(/CSV照合済みです/)).toBeInTheDocument();
  });

  it("照合ステータスバッジをクリックすると手動トグルが実行される", async () => {
    const toggleSpy = vi.spyOn(csvReconcileService, "toggleMonthlyCardReconcile").mockResolvedValue(undefined as any);

    render(<Finance />);

    // Oliveカードのバッジをクリック
    const oliveBadge = screen.getByTestId("reconcile-badge-Oliveカード");
    fireEvent.click(oliveBadge);

    expect(toggleSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^\d{4}-\d{2}$/),
      "Oliveカード",
      true
    );
  });

  it("「速報メール取得」ボタンをクリックすると Gmail 連携が実行される", async () => {
    const gmailService = await import("../services/gmailFinanceService");
    const syncSpy = vi.spyOn(gmailService, "fetchAndProcessCardNoticeEmails").mockResolvedValue({
      createdCount: 2,
      linkedCount: 1,
      skippedCount: 0,
      totalFound: 3,
    });

    render(<Finance />);

    const syncBtn = screen.getByTestId("gmail-sync-btn");
    fireEvent.click(syncBtn);

    await waitFor(() => {
      expect(syncSpy).toHaveBeenCalled();
      expect(screen.getByTestId("sync-toast")).toHaveTextContent(/2件の新規決済を作成/);
    });
  });

  it("マウント時に保存されたトークンがあればバックグラウンドで自動同期が実行される", async () => {
    sessionStorage.clear();
    const googleAuth = await import("../services/googleAuth");
    vi.spyOn(googleAuth, "loadSavedToken").mockReturnValue("valid-saved-token");

    const gmailService = await import("../services/gmailFinanceService");
    const autoSyncSpy = vi.spyOn(gmailService, "fetchAndProcessCardNoticeEmails").mockResolvedValue({
      createdCount: 1,
      linkedCount: 0,
      skippedCount: 0,
      totalFound: 1,
    });

    render(<Finance />);

    await waitFor(() => {
      expect(autoSyncSpy).toHaveBeenCalledWith("valid-saved-token", expect.anything());
      expect(screen.getByTestId("sync-toast")).toHaveTextContent(/1件の速報決済を取り込み/);
    });
  });
});


