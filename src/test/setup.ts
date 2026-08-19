/**
 * src/test/setup.ts
 * Vitest グローバルセットアップ
 */
import "@testing-library/jest-dom";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// ─── 各テスト後に DOM をクリーンアップ ───
afterEach(() => {
  cleanup();
});


// ─── Firebase モック ───
vi.mock("../lib/firebase", () => ({
  db: {},
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn(),
  onSnapshot: vi.fn(() => vi.fn()),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  serverTimestamp: vi.fn(() => ({ seconds: 0, nanoseconds: 0 })),
  Timestamp: { now: vi.fn() },
}));

vi.mock("../lib/aetherCore", () => ({
  suggestCategory: vi.fn().mockResolvedValue(null),
}));

vi.mock("../lib/googleTasks", () => ({
  getTaskLists: vi.fn().mockResolvedValue([]),
  getTasks: vi.fn().mockResolvedValue([]),
  addTask: vi.fn().mockResolvedValue("google-task-id-mock"),
  updateTaskStatus: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../hooks/useGoogleAuth", () => ({
  useGoogleAuth: vi.fn(() => ({
    accessToken: null,
    isSignedIn: false,
    isReady: true,
    signIn: vi.fn(),
    signOut: vi.fn(),
  })),
}));

// window.matchMedia モック（jsdom にない）
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// ─── vi.resetAllMocks() 対応: リセット後も useGoogleAuth が正しく動くよう
//     afterEach ではなく beforeEach フックでも再設定できるよう
//     各テストファイル側で必要なら追加設定する ───
