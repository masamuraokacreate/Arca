/**
 * src/test/AuthGate.test.tsx
 * AuthGate コンポーネントのホワイトリスト厳格認証テスト
 */
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import AuthGate, { logoutUser, isEmailAllowed } from "../components/AuthGate";

describe("AuthGate コンポーネント（ホワイトリスト厳格認証）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("isEmailAllowed がホワイトリスト複数アドレスを正しく判定する", () => {
    expect(isEmailAllowed("masatomuraoka1028@gmail.com")).toBe(true);
    expect(isEmailAllowed(" MasatoMuraoka1028@Gmail.com ")).toBe(true);
    expect(isEmailAllowed("masatomuraoka.create@gmail.com")).toBe(true);
    expect(isEmailAllowed(" MasatoMuraoka.Create@Gmail.com ")).toBe(true);
    expect(isEmailAllowed("other@example.com")).toBe(false);
    expect(isEmailAllowed(null)).toBe(false);
    expect(isEmailAllowed(undefined)).toBe(false);
  });

  it("未ログイン時は洗練されたログイン画面と「Googleアカウントで続ける」を表示する", () => {
    (onAuthStateChanged as Mock).mockImplementation((_auth, callback) => {
      callback(null);
      return vi.fn();
    });

    render(
      <AuthGate>
        <div>メインコンテンツ</div>
      </AuthGate>
    );

    expect(screen.getByText("Arca")).toBeInTheDocument();
    expect(screen.getByText("Personal Operating System")).toBeInTheDocument();
    expect(screen.getByText("Googleアカウントで続ける")).toBeInTheDocument();
    expect(screen.queryByText("メインコンテンツ")).not.toBeInTheDocument();
  });

  it("許可されたアカウント1（masatomuraoka1028@gmail.com）でログイン時はメイン画面を表示する", () => {
    (onAuthStateChanged as Mock).mockImplementation((_auth, callback) => {
      callback({
        uid: "user-owner-1",
        email: "masatomuraoka1028@gmail.com",
        displayName: "Masato Muraoka",
      });
      return vi.fn();
    });

    render(
      <AuthGate>
        <div>メインコンテンツ</div>
      </AuthGate>
    );

    expect(screen.getByText("メインコンテンツ")).toBeInTheDocument();
    expect(screen.queryByText("Googleアカウントで続ける")).not.toBeInTheDocument();
  });

  it("許可されたアカウント2（masatomuraoka.create@gmail.com）でログイン時もメイン画面を表示する", () => {
    (onAuthStateChanged as Mock).mockImplementation((_auth, callback) => {
      callback({
        uid: "user-owner-2",
        email: "masatomuraoka.create@gmail.com",
        displayName: "Masato Muraoka",
      });
      return vi.fn();
    });

    render(
      <AuthGate>
        <div>メインコンテンツ</div>
      </AuthGate>
    );

    expect(screen.getByText("メインコンテンツ")).toBeInTheDocument();
    expect(screen.queryByText("Googleアカウントで続ける")).not.toBeInTheDocument();
  });

  it("大文字混じりの許可メールアドレス（MasatoMuraoka1028@Gmail.com）でも正常に許可される", () => {
    (onAuthStateChanged as Mock).mockImplementation((_auth, callback) => {
      callback({
        uid: "user-owner",
        email: " MasatoMuraoka1028@Gmail.com ",
        displayName: "Masato Muraoka",
      });
      return vi.fn();
    });

    render(
      <AuthGate>
        <div>メインコンテンツ</div>
      </AuthGate>
    );

    expect(screen.getByText("メインコンテンツ")).toBeInTheDocument();
  });

  it("未許可のアカウント（other@example.com）でログイン時は即座に signOut され Access Denied が表示される", () => {
    (onAuthStateChanged as Mock).mockImplementation((_auth, callback) => {
      callback({
        uid: "user-other",
        email: "other@example.com",
        displayName: "Other User",
      });
      return vi.fn();
    });

    render(
      <AuthGate>
        <div>メインコンテンツ</div>
      </AuthGate>
    );

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/アクセス権限がありません/)).toBeInTheDocument();
    expect(screen.queryByText("メインコンテンツ")).not.toBeInTheDocument();
  });

  it("Googleログインボタンをクリックすると signInWithPopup が呼ばれる", async () => {
    (onAuthStateChanged as Mock).mockImplementation((_auth, callback) => {
      callback(null);
      return vi.fn();
    });

    const user = userEvent.setup();
    render(
      <AuthGate>
        <div>メインコンテンツ</div>
      </AuthGate>
    );

    const loginBtn = screen.getByText("Googleアカウントで続ける");
    await user.click(loginBtn);

    expect(signInWithPopup).toHaveBeenCalledTimes(1);
  });

  it("logoutUser を呼び出すと signOut が実行される", async () => {
    await logoutUser();
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
