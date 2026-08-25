/**
 * src/test/ThemeContext.test.tsx
 * Arca — テーマ管理 & ThemeModal 単体・結合テスト
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, fireEvent, renderHook, act } from "@testing-library/react";
import { ThemeProvider, useTheme } from "../context/ThemeContext";
import ThemeModal from "../components/ThemeModal";

describe("ThemeContext", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
    document.documentElement.removeAttribute("data-theme");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("デフォルト状態で初期テーマが正しく設定される", () => {
    const { result } = renderHook(() => useTheme(), {
      wrapper: ThemeProvider,
    });

    expect(result.current.theme).toBe("system");
    expect(["ivory", "dark"]).toContain(result.current.resolvedTheme);
  });

  it("setTheme で dark を設定すると data-theme='dark' と .dark クラスが付与され localStorage に保存される", () => {
    const { result } = renderHook(() => useTheme(), {
      wrapper: ThemeProvider,
    });

    act(() => {
      result.current.setTheme("dark");
    });

    expect(result.current.theme).toBe("dark");
    expect(result.current.resolvedTheme).toBe("dark");
    expect(result.current.isDark).toBe(true);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("arca_theme")).toBe("dark");
  });

  it("setTheme で ivory を設定すると .dark クラスが除去される", () => {
    const { result } = renderHook(() => useTheme(), {
      wrapper: ThemeProvider,
    });

    act(() => {
      result.current.setTheme("dark");
    });
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    act(() => {
      result.current.setTheme("ivory");
    });

    expect(result.current.theme).toBe("ivory");
    expect(result.current.resolvedTheme).toBe("ivory");
    expect(result.current.isDark).toBe(false);
    expect(document.documentElement.getAttribute("data-theme")).toBe("ivory");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem("arca_theme")).toBe("ivory");
  });

  it("setTheme で sand（ウォームサンド）を設定できる", () => {
    const { result } = renderHook(() => useTheme(), {
      wrapper: ThemeProvider,
    });

    act(() => {
      result.current.setTheme("sand");
    });

    expect(result.current.theme).toBe("sand");
    expect(result.current.resolvedTheme).toBe("sand");
    expect(result.current.isDark).toBe(false);
    expect(document.documentElement.getAttribute("data-theme")).toBe("sand");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("setTheme で sage（ミッドナイトセージ）を設定するとダーク判定となる", () => {
    const { result } = renderHook(() => useTheme(), {
      wrapper: ThemeProvider,
    });

    act(() => {
      result.current.setTheme("sage");
    });

    expect(result.current.theme).toBe("sage");
    expect(result.current.resolvedTheme).toBe("sage");
    expect(result.current.isDark).toBe(true);
    expect(document.documentElement.getAttribute("data-theme")).toBe("sage");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});

describe("ThemeModal コンポーネント", () => {
  it("モーダルが開き、各テーマカードをクリックしてテーマを変更できる", () => {
    const handleClose = vi.fn();

    render(
      <ThemeProvider>
        <ThemeModal isOpen={true} onClose={handleClose} />
      </ThemeProvider>
    );

    // ヘッダーが表示される
    expect(screen.getByText("外観・テーマ設定")).toBeInTheDocument();

    // 各パレットのカードが存在する
    expect(screen.getAllByText("アイボリー").length).toBeGreaterThan(0);
    expect(screen.getAllByText("ディープスペース").length).toBeGreaterThan(0);
    expect(screen.getAllByText("ウォームサンド").length).toBeGreaterThan(0);
    expect(screen.getAllByText("ミッドナイトセージ").length).toBeGreaterThan(0);

    // 「ディープスペース」をクリック
    fireEvent.click(screen.getAllByText("ディープスペース")[0]);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

    // 「ウォームサンド」をクリック
    fireEvent.click(screen.getAllByText("ウォームサンド")[0]);
    expect(document.documentElement.getAttribute("data-theme")).toBe("sand");

    // 完了ボタンをクリックして閉じる
    fireEvent.click(screen.getByText("完了"));
    expect(handleClose).toHaveBeenCalled();
  });
});
