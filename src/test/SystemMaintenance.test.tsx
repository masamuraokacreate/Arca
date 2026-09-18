/**
 * src/test/SystemMaintenance.test.tsx
 * システム保守・診断コンソール（Arca Inspector & Loggingモード）の単体・統合テスト
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { logger } from "../services/loggerService";
import SystemMaintenanceModal from "../components/maintenance/SystemMaintenanceModal";
import { DbInspectorTab } from "../components/maintenance/DbInspectorTab";
import { LogTracerTab } from "../components/maintenance/LogTracerTab";
import { SchemaLegendCard } from "../components/maintenance/SchemaLegendCard";
import { createExpenseTransaction, deleteExpenseTransaction } from "../lib/financeStorage";
import { ThemeProvider } from "../context/ThemeContext";
import * as firestore from "firebase/firestore";
import App from "../App";

// ─── navigator.clipboard モック ───
const originalClipboard = navigator.clipboard;
const mockClipboard = {
  writeText: vi.fn().mockResolvedValue(undefined),
};

describe("システム保守・診断コンソール (System Maintenance)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    logger.setLoggingEnabled(true);
    logger.clearLogs();
    Object.defineProperty(navigator, "clipboard", {
      value: mockClipboard,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: originalClipboard,
      configurable: true,
      writable: true,
    });
  });

  // ─────────────────────────────────────────
  // 1. LoggerService 単体テスト
  // ─────────────────────────────────────────
  describe("LoggerService", () => {
    it("ログを記録し、getLogs() で取得できること", () => {
      logger.info("finance", "テストログ1", { amount: 1000 });
      logger.warn("calendar", "テスト警告", { eventId: "evt-1" });
      logger.error("ocr", "テストエラー", new Error("OCR Failed"));

      const logs = logger.getLogs();
      expect(logs).toHaveLength(3);
      expect(logs[0].message).toBe("テストエラー");
      expect(logs[0].level).toBe("error");
      expect(logs[1].message).toBe("テスト警告");
      expect(logs[1].level).toBe("warn");
      expect(logs[2].message).toBe("テストログ1");
      expect(logs[2].level).toBe("info");
      expect(logs[2].category).toBe("finance");
    });

    it("最大100件のリングバッファとして動作すること", () => {
      for (let i = 0; i < 110; i++) {
        logger.info("app", `Log ${i}`);
      }
      const logs = logger.getLogs();
      expect(logs).toHaveLength(100);
      expect(logs[0].message).toBe("Log 109");
      expect(logs[99].message).toBe("Log 10");
    });

    it("setLoggingEnabled(false) で記録が無効化されること", () => {
      logger.setLoggingEnabled(false);
      logger.clearLogs();
      logger.info("app", "これは記録されないはず");
      expect(logger.getLogs()).toHaveLength(0);

      logger.setLoggingEnabled(true);
      logger.info("app", "これは記録される");
      expect(logger.getLogs().some((l) => l.message === "これは記録される")).toBe(true);
    });

    it("clearLogs() でログが全削除されること", () => {
      logger.info("app", "残らないログ");
      expect(logger.getLogs().length).toBeGreaterThan(0);

      logger.clearLogs();
      expect(logger.getLogs()).toHaveLength(0);
    });

    it("subscribe() でログ追加がリアルタイム通知されること", () => {
      const listener = vi.fn();
      const unsub = logger.subscribe(listener);

      logger.info("app", "通知テスト");
      expect(listener).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ message: "通知テスト" })])
      );

      unsub();
    });

    it("formatForAi() で Markdown 形式の文字列が生成されること", () => {
      logger.info("finance", "取引読み込み成功", { count: 5 });
      const md = logger.formatForAi();

      expect(md).toContain("# Arca System Diagnostic Log Dump");
      expect(md).toContain("FINANCE");
      expect(md).toContain("取引読み込み成功");
      expect(md).toContain('"count": 5');
    });
  });

  // ─────────────────────────────────────────
  // 2. DbInspectorTab 単体テスト
  // ─────────────────────────────────────────
  describe("DbInspectorTab", () => {
    it("コレクション選択ピルが表示され、切り替えができること", async () => {
      const user = userEvent.setup();
      render(<DbInspectorTab />);

      expect(screen.getByText(/カレンダー \(events\)/)).toBeInTheDocument();
      expect(screen.queryByText(/シフト設定/)).not.toBeInTheDocument();
      expect(screen.getByText(/支出・家計 \(finance_transactions\)/)).toBeInTheDocument();

      // 支出・家計に切り替え
      const financeTab = screen.getByText(/支出・家計/);
      await user.click(financeTab);
      expect(screen.getByText(/finance_transactions/)).toBeInTheDocument();
    });

    it("Firestore ドキュメントが一覧表示され、生JSONが展開・コピーできること", async () => {
      const mockDocs = [
        {
          id: "tx-test-1",
          data: () => ({
            title: "スターバックス コーヒー",
            totalAmount: 650,
            category: "カフェ",
            isReconciled: true,
            createdAt: "2026-09-18T10:00:00Z",
          }),
        },
      ];

      vi.spyOn(firestore, "onSnapshot").mockImplementation((_query: unknown, callback: unknown) => {
        if (typeof callback === "function") {
          callback({
            docs: mockDocs,
            size: mockDocs.length,
            forEach: (fn: (d: unknown) => void) => mockDocs.forEach(fn),
          });
        }
        return vi.fn() as any;
      });

      const user = userEvent.setup();
      Object.defineProperty(navigator, "clipboard", {
        value: mockClipboard,
        configurable: true,
        writable: true,
      });
      render(<DbInspectorTab />);

      // 初期表示は events なので、支出・家計に切り替える
      const financeTab = screen.getByText(/支出・家計/);
      await user.click(financeTab);

      // タイトルが表示されている
      expect(await screen.findByText("スターバックス コーヒー")).toBeInTheDocument();
      expect(screen.getByText("¥650")).toBeInTheDocument();
      expect(screen.getByText("照合済")).toBeInTheDocument();

      // カードをクリックして展開
      const cardTitle = screen.getByText("スターバックス コーヒー");
      await user.click(cardTitle);

      // 生JSONコード領域が表示される
      expect(await screen.findByText("Firestore Raw Document")).toBeInTheDocument();
      expect(screen.getByText(/"title": "スターバックス コーヒー"/)).toBeInTheDocument();

      // JSONコピーボタンをクリック
      const copyBtn = screen.getByTitle("生JSONをクリップボードにコピー");
      fireEvent.click(copyBtn);
      await waitFor(() => {
        expect(mockClipboard.writeText).toHaveBeenCalled();
      });
    });

    it("検索バーによる絞り込みができること", async () => {
      const mockDocs = [
        {
          id: "tx-1",
          data: () => ({ title: "ランチ定食", totalAmount: 1000 }),
        },
        {
          id: "tx-2",
          data: () => ({ title: "スーパー買い物", totalAmount: 3500 }),
        },
      ];

      vi.spyOn(firestore, "onSnapshot").mockImplementation((_query: unknown, callback: unknown) => {
        if (typeof callback === "function") {
          callback({
            docs: mockDocs,
            size: mockDocs.length,
            forEach: (fn: (d: unknown) => void) => mockDocs.forEach(fn),
          });
        }
        return vi.fn() as any;
      });

      const user = userEvent.setup();
      render(<DbInspectorTab />);

      expect(await screen.findByText("ランチ定食")).toBeInTheDocument();
      expect(screen.getByText("スーパー買い物")).toBeInTheDocument();

      // 検索入力
      const searchInput = screen.getByPlaceholderText(/タイトル・ID・店名/i);
      await user.type(searchInput, "ランチ");

      expect(screen.getByText("ランチ定食")).toBeInTheDocument();
      expect(screen.queryByText("スーパー買い物")).not.toBeInTheDocument();
    });
  });

  // ─────────────────────────────────────────
  // 3. LogTracerTab 単体テスト
  // ─────────────────────────────────────────
  describe("LogTracerTab", () => {
    it("ロギングのON/OFFトグルが切り替えられること", async () => {
      const user = userEvent.setup();
      render(<LogTracerTab />);

      const toggleBtn = screen.getByText(/Logging モード: 有効/);
      expect(toggleBtn).toBeInTheDocument();

      await user.click(toggleBtn);
      expect(logger.getLoggingEnabled()).toBe(false);
      expect(screen.getByText(/Logging モード: 停止中/)).toBeInTheDocument();
    });

    it("ログエントリが一覧表示され、AI用コピーができること", async () => {
      logger.info("auth", "ユーザーログイン成功", { uid: "user-123" });

      const user = userEvent.setup();
      render(<LogTracerTab />);

      expect(screen.getByText("ユーザーログイン成功")).toBeInTheDocument();
      expect(screen.getByText("AUTH")).toBeInTheDocument();

      // AI解析用コピーボタン
      const copyAllBtn = screen.getByText("全ログをコピー");
      await user.click(copyAllBtn);
      expect(await screen.findByText("コピー完了")).toBeInTheDocument();
    });

    it("ログクリアボタンでログが消去されること", async () => {
      logger.info("app", "クリアされるログ");

      const user = userEvent.setup();
      render(<LogTracerTab />);

      expect(screen.getByText("クリアされるログ")).toBeInTheDocument();

      const clearBtn = screen.getByText("ログをクリア");
      await user.click(clearBtn);

      expect(screen.getByText("ログは記録されていません")).toBeInTheDocument();
      expect(logger.getLogs()).toHaveLength(0);
    });
  });

  // ─────────────────────────────────────────
  // 4. SystemMaintenanceModal 統合テスト
  // ─────────────────────────────────────────
  describe("SystemMaintenanceModal", () => {
    it("isOpen=false のときは描画されないこと", () => {
      const { container } = render(<SystemMaintenanceModal isOpen={false} onClose={vi.fn()} />);
      expect(container.firstChild).toBeNull();
    });

    it("isOpen=true のときにモーダルが開き、タブ切り替えができること", async () => {
      const user = userEvent.setup();
      const mockClose = vi.fn();
      render(<SystemMaintenanceModal isOpen={true} onClose={mockClose} />);

      expect(screen.getByText("システム保守・診断コンソール")).toBeInTheDocument();
      expect(screen.getByTestId("maint-tab-db")).toBeInTheDocument();
      expect(screen.getByTestId("maint-tab-tracer")).toBeInTheDocument();
      expect(screen.getByTestId("maint-tab-backup")).toBeInTheDocument();

      // Log Tracer タブに切り替え
      const logTab = screen.getByTestId("maint-tab-tracer");
      await user.click(logTab);
      expect(screen.getByText("全ログをコピー")).toBeInTheDocument();

      // バックアップ・保守 タブに切り替え
      const backupTab = screen.getByTestId("maint-tab-backup");
      await user.click(backupTab);
      expect(screen.getByText("Google Drive に保存")).toBeInTheDocument();

      // ✕ボタンで閉じる
      const closeBtn = screen.getByLabelText("閉じる");
      await user.click(closeBtn);
      expect(mockClose).toHaveBeenCalledTimes(1);
    });
  });

  // ─────────────────────────────────────────
  // 5. App ヘッダー連携テスト（保守ボタン・長押し）
  // ─────────────────────────────────────────
  describe("App ヘッダー連携", () => {
    it("Arca ロゴを2秒長押しすると SystemMaintenanceModal が開くこと", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      try {
        render(
          <ThemeProvider>
            <App />
          </ThemeProvider>
        );

        // ヘッダーの「保守」ボタンは削除されていること
        expect(screen.queryByTestId("header-maint-btn-desktop")).not.toBeInTheDocument();
        expect(screen.queryByTestId("header-maint-btn-mobile")).not.toBeInTheDocument();

        const logo = screen.getByTitle("ホーム（2秒長押しでシステム保守・診断コンソール）");
        expect(logo).toBeInTheDocument();

        // 2秒長押し開始
        fireEvent.pointerDown(logo);
        // 2000ms タイマー進行
        act(() => {
          vi.advanceTimersByTime(2100);
        });

        expect(screen.getByText("システム保守・診断コンソール")).toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });

    it("Arca ロゴを短時間タップしたときはダッシュボード遷移のみが行われ、長押しタイマーは解除されること", async () => {
      render(
        <ThemeProvider>
          <App />
        </ThemeProvider>
      );

      const logo = screen.getByTitle("ホーム（2秒長押しでシステム保守・診断コンソール）");
      expect(logo).toBeInTheDocument();

      // タップ（pointerdown -> pointerup < 2秒）
      fireEvent.pointerDown(logo);
      fireEvent.pointerUp(logo);
      fireEvent.click(logo);

      // モーダルは開かない
      expect(screen.queryByText("システム保守・診断コンソール")).not.toBeInTheDocument();
    });
  });

  // ─────────────────────────────────────────
  // 6. スキーマ凡例（SchemaLegendCard）＆ モーダルサイズ固定
  // ─────────────────────────────────────────
  describe("スキーマ凡例 ＆ モーダルウィンドウサイズ固定", () => {
    it("SystemMaintenanceModal のウィンドウコンテナが 90vh / maxWidth: 960px のサイズスタイルを持つこと", () => {
      render(<SystemMaintenanceModal isOpen={true} onClose={vi.fn()} />);
      const modal = screen.getByTestId("system-maintenance-modal");
      expect(modal.style.height).toBe("90vh");
      expect(modal.style.maxHeight).toBe("920px");
      expect(modal.style.minHeight).toBe("560px");
      expect(modal.style.maxWidth).toBe("960px");
    });

    it("DbInspectorTab で「データ仕様」ボタンをクリックするとスキーマ凡例が表示され、フィールド定義が確認できること", async () => {
      const user = userEvent.setup();
      Object.defineProperty(navigator, "clipboard", {
        value: mockClipboard,
        configurable: true,
        writable: true,
      });
      render(<DbInspectorTab />);

      // 初期状態では凡例は表示されていない
      expect(screen.queryByText("カレンダー (events) スキーマ凡例")).not.toBeInTheDocument();

      // 「データ仕様」ボタンをクリック
      const legendBtn = screen.getByTestId("toggle-schema-legend-btn");
      await user.click(legendBtn);

      // スキーマ凡例カードが表示される
      expect(screen.getByText("カレンダー (events) スキーマ凡例")).toBeInTheDocument();
      expect(screen.getByText("googleEventId")).toBeInTheDocument();
      expect(screen.getByText("isShiftOnly")).toBeInTheDocument();

      // フィールドコピーボタンをクリックしてコピー
      const copyBtn = screen.getByTitle('"googleEventId" をコピー');
      fireEvent.click(copyBtn);
      await waitFor(() => {
        expect(mockClipboard.writeText).toHaveBeenCalledWith("googleEventId");
      });

      // 閉じるボタンで非表示になる
      const closeBtn = screen.getByTestId("close-schema-legend-btn");
      await user.click(closeBtn);
      expect(screen.queryByText("カレンダー (events) スキーマ凡例")).not.toBeInTheDocument();
    });

    it("SchemaLegendCard 単体で finance_transactions のフィールド定義が正しく描画されること", () => {
      render(<SchemaLegendCard collection="finance_transactions" onClose={vi.fn()} />);
      expect(screen.getByText("支出・家計 (finance_transactions) スキーマ凡例")).toBeInTheDocument();
      expect(screen.getByText("isReconciled")).toBeInTheDocument();
      expect(screen.getByText("matchedCsvRowId")).toBeInTheDocument();
      expect(screen.getByText(/"Oliveカード"/)).toBeInTheDocument();
    });
  });

  // ─────────────────────────────────────────
  // 7. ユーザー操作の網羅的ロギング検証 (Logging Mode Hooks)
  // ─────────────────────────────────────────
  describe("ユーザー操作の網羅的ロギングフック", () => {
    it("支出取引の作成・削除を行うと logger に記録されること", async () => {
      vi.spyOn(firestore, "addDoc").mockResolvedValue({ id: "mock-tx-123" } as any);
      vi.spyOn(firestore, "updateDoc").mockResolvedValue(undefined as any);

      logger.clearLogs();
      logger.setLoggingEnabled(true);

      // 支出作成
      const newId = await createExpenseTransaction({
        title: "コンビニおにぎり",
        totalAmount: 320,
        date: "2026-09-18",
        category: "食料品",
        paymentMethod: "Oliveカード",
        items: [],
        isReconciled: false,
        createdAt: "2026-09-18T12:00:00Z",
        updatedAt: "2026-09-18T12:00:00Z",
        isDeleted: false,
      });

      expect(newId).toBe("mock-tx-123");
      const logsAfterCreate = logger.getLogs();
      expect(logsAfterCreate.some((l) => l.message.includes('Finance: Created transaction "コンビニおにぎり"'))).toBe(true);

      // 支出削除
      await deleteExpenseTransaction("mock-tx-123");
      const logsAfterDelete = logger.getLogs();
      expect(logsAfterDelete.some((l) => l.message.includes("Finance: Moved transaction to trash (ID: mock-tx-123)"))).toBe(true);
    });
  });
});
