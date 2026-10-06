/**
 * src/test/IPhoneNavigation.test.tsx
 * iPhone 専用下部グローバルタブバー (HIG 準拠) の動作仕様テスト
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "../context/ThemeContext";
import App from "../App";

// Firestore / GoogleAuth 等のモック
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  onSnapshot: vi.fn((_q, cb) => {
    cb({ docs: [] });
    return vi.fn();
  }),
  doc: vi.fn(),
  updateDoc: vi.fn(),
  addDoc: vi.fn(),
  serverTimestamp: vi.fn(),
}));

vi.mock("../services/googleAuth", () => ({
  getSavedToken: vi.fn(() => null),
  syncAllGoogleData: vi.fn(),
}));

vi.mock("../hooks/useGoogleAuth", () => ({
  useGoogleAuth: vi.fn(() => ({
    isSignedIn: false,
    accessToken: null,
    signIn: vi.fn(),
    requestAccessToken: vi.fn().mockResolvedValue(null),
  })),
}));

describe("iPhone 専用下部グローバルタブバー", () => {
  const originalUserAgent = navigator.userAgent;

  afterEach(() => {
    Object.defineProperty(navigator, "userAgent", {
      value: originalUserAgent,
      configurable: true,
      writable: true,
    });
  });

  it("iPhone の UserAgent の場合、画面下部に専用グローバルタブバーが表示されること", async () => {
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
      configurable: true,
      writable: true,
    });

    render(
      <ThemeProvider>
        <App />
      </ThemeProvider>
    );

    // 下部タブバーが存在すること
    const bottomTabBar = screen.getByTestId("iphone-bottom-tab-bar");
    expect(bottomTabBar).toBeInTheDocument();

    // 6つのタブ（ホーム・タスク・カレンダー・ノート・献立・家計）が存在すること
    expect(screen.getByTestId("iphone-tab-dashboard")).toBeInTheDocument();
    expect(screen.getByTestId("iphone-tab-tasks")).toBeInTheDocument();
    expect(screen.getByTestId("iphone-tab-calendar")).toBeInTheDocument();
    expect(screen.getByTestId("iphone-tab-notes")).toBeInTheDocument();
    expect(screen.getByTestId("iphone-tab-recipes")).toBeInTheDocument();
    expect(screen.getByTestId("iphone-tab-finance")).toBeInTheDocument();
  });

  it("iPhone の下部タブバーでタスクをタップすると Tasks モジュールに切り替わること", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
      configurable: true,
      writable: true,
    });

    render(
      <ThemeProvider>
        <App />
      </ThemeProvider>
    );

    const tasksTab = screen.getByTestId("iphone-tab-tasks");
    await user.click(tasksTab);

    // Tasks 画面の入力欄が表示されること
    expect(screen.getByPlaceholderText(/タスクを追加/)).toBeInTheDocument();
  });

  it("デスクトップ / iPad の UserAgent の場合、下部タブバーは表示されず従来の上部ナビゲーションが表示されること", () => {
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      configurable: true,
      writable: true,
    });

    render(
      <ThemeProvider>
        <App />
      </ThemeProvider>
    );

    // 下部タブバーが存在しないこと
    expect(screen.queryByTestId("iphone-bottom-tab-bar")).not.toBeInTheDocument();

    // 従来の上部スライディングタブバーのボタンが表示されること
    expect(screen.getByRole("button", { name: "Dashboard" })).toBeInTheDocument();
  });
});
