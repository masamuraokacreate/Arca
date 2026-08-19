/**
 * src/test/useNetworkStatus.test.ts
 * useNetworkStatus カスタムフックの単体テスト
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useNetworkStatus } from "../hooks/useNetworkStatus";

describe("useNetworkStatus", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("初期状態で navigator.onLine の値を返す", () => {
    const { result } = renderHook(() => useNetworkStatus());
    expect(typeof result.current.isOnline).toBe("boolean");
  });

  it("offline イベント時に isOnline が false になる", () => {
    const { result } = renderHook(() => useNetworkStatus());

    act(() => {
      window.dispatchEvent(new Event("offline"));
    });

    expect(result.current.isOnline).toBe(false);
  });

  it("online イベント時に isOnline が true に戻る", () => {
    const { result } = renderHook(() => useNetworkStatus());

    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(result.current.isOnline).toBe(false);

    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(result.current.isOnline).toBe(true);
  });
});
