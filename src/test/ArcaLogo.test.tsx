/**
 * src/test/ArcaLogo.test.tsx
 * ArcaLogo コンポーネントの単体テスト
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ArcaLogo } from "../components/common/ArcaLogo";
import { ThemeProvider } from "../context/ThemeContext";

describe("ArcaLogo コンポーネント", () => {
  it("ライトモード時は black のロゴ画像が使用される", () => {
    render(<ArcaLogo variant="wordmark" isDark={false} alt="Arca Brand" />);
    const img = screen.getByAltText("Arca Brand") as HTMLImageElement;
    expect(img).toBeInTheDocument();
    expect(img.src).toContain("black");
  });

  it("ダークモード時は whilte のロゴ画像が使用される", () => {
    render(<ArcaLogo variant="wordmark" isDark={true} alt="Arca Brand Dark" />);
    const img = screen.getByAltText("Arca Brand Dark") as HTMLImageElement;
    expect(img).toBeInTheDocument();
    expect(img.src).toContain("whilte");
  });

  it("ロゴ画像には透過PNGのみが使用される（SVG不使用）", () => {
    render(<ArcaLogo variant="wordmark" isDark={false} alt="Arca PNG Light" />);
    const lightImg = screen.getByAltText("Arca PNG Light") as HTMLImageElement;
    expect(lightImg.src).toContain("black_trans");
    expect(lightImg.src).not.toContain(".svg");

    render(<ArcaLogo variant="wordmark" isDark={true} alt="Arca PNG Dark" />);
    const darkImg = screen.getByAltText("Arca PNG Dark") as HTMLImageElement;
    expect(darkImg.src).toContain("whilte_trans");
    expect(darkImg.src).not.toContain(".svg");
  });

  it("variant='symbol' のときはアプリアイコンマークがレンダリングされる", () => {
    render(<ArcaLogo variant="symbol" size={28} alt="Arca App Icon" />);
    const img = screen.getByAltText("Arca App Icon") as HTMLImageElement;
    expect(img).toBeInTheDocument();
    expect(img.src).toContain("Arca_icon");
    expect(img.style.width).toBe("28px");
    expect(img.style.height).toBe("28px");
  });

  it("variant='combined' のときはシンボルとワードマークの両方がレンダリングされる", () => {
    const { container } = render(<ArcaLogo variant="combined" size={30} alt="Arca Combined" isDark={false} />);
    const images = container.querySelectorAll("img");
    expect(images).toHaveLength(2);
    expect(images[0].src).toContain("Arca_icon");
    expect(images[1].src).toContain("black");
  });

  it("ThemeProvider 配下で自動的にテーマに応じたロゴが選択される", () => {
    render(
      <ThemeProvider>
        <ArcaLogo variant="wordmark" alt="Arca Auto Theme" />
      </ThemeProvider>
    );
    const img = screen.getByAltText("Arca Auto Theme") as HTMLImageElement;
    expect(img).toBeInTheDocument();
  });
});
