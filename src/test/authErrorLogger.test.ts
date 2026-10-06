/**
 * src/test/authErrorLogger.test.ts
 * 認証エラーログ記録ユーティリティ (logAuthError) のテスト
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildAuthErrorPayload, logAuthError } from "../services/authErrorLogger";
import * as firestoreModule from "firebase/firestore";

describe("authErrorLogger (認証エラーログ収集ユーティリティ)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("buildAuthErrorPayload", () => {
    it("Firebaseエラーオブジェクトから要件通りの完全なペイロードを構築する", () => {
      const mockError = {
        code: "auth/popup-blocked",
        message: "The popup has been blocked by the browser.",
      };

      const payload = buildAuthErrorPayload(mockError, {
        provider: "google.com",
        authMethod: "signInWithPopup",
      });

      expect(payload.errorCode).toBe("auth/popup-blocked");
      expect(payload.errorMessage).toBe("The popup has been blocked by the browser.");
      expect(payload.provider).toBe("google.com");
      expect(payload.authMethod).toBe("signInWithPopup");
      expect(payload.authDomain).toBe("arca-f3fc6.firebaseapp.com");
      expect(typeof payload.userAgent).toBe("string");
      expect(typeof payload.platform).toBe("string");
      expect(typeof payload.currentUrl).toBe("string");
      expect(payload.currentUrl).toMatch(/^https?:\/\//);
      expect(payload.screen).toBeDefined();
      expect(typeof payload.screen.innerWidth).toBe("number");
      expect(typeof payload.screen.innerHeight).toBe("number");
      expect(typeof payload.screen.devicePixelRatio).toBe("number");
      expect(payload.timestamp).toBeDefined();
    });

    it("エラー情報が不完全（空文字・未定義）な場合でも安全にフォールバックする", () => {
      const payload = buildAuthErrorPayload(null);

      expect(payload.errorCode).toBe("unknown");
      expect(payload.errorMessage).toBe("Unknown authentication error");
      expect(payload.provider).toBe("google.com");
      expect(payload.authMethod).toBe("signInWithPopup");
      expect(payload.currentUrl).toMatch(/^https?:\/\//);
    });

    it("巨大なエラーメッセージや未定義フィールドがあっても安全に制限サイズ内にクランプする", () => {
      const longMessage = "a".repeat(5000);
      const payload = buildAuthErrorPayload({
        code: "x".repeat(300),
        message: longMessage,
      });

      expect(payload.errorCode.length).toBeLessThanOrEqual(100);
      expect(payload.errorMessage.length).toBeLessThanOrEqual(2000);
    });
  });

  describe("logAuthError", () => {
    it("正常時に Firestore の addDoc を呼び出してドキュメントIDを返す", async () => {
      const mockDocRef = { id: "test-auth-log-123" };
      vi.spyOn(firestoreModule, "addDoc").mockResolvedValueOnce(mockDocRef as any);

      const docId = await logAuthError(
        { code: "auth/popup-blocked", message: "Popup blocked by iPad Safari" },
        { provider: "google.com", authMethod: "signInWithPopup" }
      );

      expect(firestoreModule.addDoc).toHaveBeenCalledTimes(1);
      expect(docId).toBe("test-auth-log-123");
    });

    it("Firestore 書き込みが失敗しても例外を投げずに null を返し、安全にフォールバックする", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      vi.spyOn(firestoreModule, "addDoc").mockRejectedValueOnce(new Error("Permission denied"));

      const docId = await logAuthError({ code: "auth/internal-error", message: "Internal error" });

      expect(docId).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });
});
