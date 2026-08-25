/**
 * src/test/setup.ts
 * Vitest グローバルセットアップ
 */
import "@testing-library/jest-dom";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import * as firestore from "firebase/firestore";
import { useGoogleAuth } from "../hooks/useGoogleAuth";

// ─── 各テスト後に DOM をクリーンアップ ───
afterEach(() => {
  cleanup();
});

// ─── Firebase モック ───
vi.mock("firebase/app", () => ({
  initializeApp: vi.fn(() => ({})),
  getApps: vi.fn(() => [{}]),
  getApp: vi.fn(() => ({})),
}));

vi.mock("../lib/firebase", () => ({
  db: {},
  auth: {},
}));

// JSDOM 不足メソッドのポリフィル
if (typeof Element !== "undefined") {
  Element.prototype.scrollIntoView = vi.fn();
}
if (typeof window !== "undefined") {
  window.scrollTo = vi.fn();
}

vi.mock("firebase/auth", () => {
  return {
    getAuth: vi.fn(() => ({})),
    onAuthStateChanged: vi.fn((_auth, callback) => {
      callback(null);
      return vi.fn();
    }),
    signInWithPopup: vi.fn().mockResolvedValue({}),
    signOut: vi.fn().mockResolvedValue(undefined),
    GoogleAuthProvider: class {
      setCustomParameters = vi.fn();
    },
  };
});

vi.mock("firebase/firestore", () => ({
  initializeFirestore: vi.fn(() => ({})),
  persistentLocalCache: vi.fn(() => ({})),
  persistentMultipleTabManager: vi.fn(() => ({})),
  collection: vi.fn((_db: unknown, path: string) => ({ id: path, path })),
  addDoc: vi.fn().mockResolvedValue({ id: "mock-doc-id" }),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  deleteDoc: vi.fn().mockResolvedValue(undefined),
  setDoc: vi.fn().mockResolvedValue(undefined),
  writeBatch: vi.fn(() => ({
    set: vi.fn(),
    delete: vi.fn(),
    commit: vi.fn().mockResolvedValue(undefined),
  })),
  getDoc: vi.fn().mockResolvedValue({ exists: () => false, data: () => undefined }),
  getDocs: vi.fn().mockResolvedValue({ docs: [] }),
  doc: vi.fn((_db?: unknown, col?: string, id?: string) => ({ id: id || "mock-doc-id", path: `${col || "mock-col"}/${id || "mock-doc-id"}` })),
  query: vi.fn((col: unknown) => (typeof col === "object" && col !== null ? col : {})),
  onSnapshot: vi.fn((_q: unknown, cb: unknown) => {
    if (typeof cb === "function") {
      cb({
        docs: [],
        exists: () => false,
        data: () => ({}),
      });
    }
    return vi.fn();
  }),
  where: vi.fn(),
  orderBy: vi.fn(),
  serverTimestamp: vi.fn(() => ({ seconds: 0, nanoseconds: 0 })),
  Timestamp: {
    now: vi.fn(),
    fromDate: vi.fn((d: Date) => ({ toDate: () => d, seconds: Math.floor(d.getTime() / 1000) })),
  },
}));

vi.mock("../lib/aetherCore", () => ({
  suggestCategory: vi.fn().mockResolvedValue(null),
  categorizeItems: vi.fn().mockResolvedValue({}),
  suggestRelatedItems: vi.fn().mockResolvedValue([]),
  breakdownTask: vi.fn().mockResolvedValue([]),
  extractActionableItems: vi.fn().mockResolvedValue(null),
  generateBriefing: vi.fn().mockReturnValue(""),
  generateDailyBriefing: vi.fn().mockResolvedValue(null),
  parseTaskInput: vi.fn().mockResolvedValue(null),
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
    requestAccessToken: vi.fn().mockResolvedValue("mock-token"),
  })),
}));

// window.matchMedia モック（jsdom にない）
if (typeof window !== "undefined") {
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
}

// ─── beforeEach でデフォルト実装を常に再設定 ───
beforeEach(() => {
  if (vi.isMockFunction(firestore.getDoc)) {
    vi.mocked(firestore.getDoc).mockResolvedValue({ exists: () => false, data: () => undefined } as unknown as firestore.DocumentSnapshot);
  }
  if (vi.isMockFunction(firestore.getDocs)) {
    vi.mocked(firestore.getDocs).mockResolvedValue({ docs: [] } as unknown as firestore.QuerySnapshot);
  }
  if (vi.isMockFunction(firestore.addDoc)) {
    vi.mocked(firestore.addDoc).mockResolvedValue({ id: "mock-doc-id" } as unknown as firestore.DocumentReference);
  }
  if (vi.isMockFunction(firestore.setDoc)) {
    vi.mocked(firestore.setDoc).mockResolvedValue(undefined);
  }
  if (vi.isMockFunction(firestore.updateDoc)) {
    vi.mocked(firestore.updateDoc).mockResolvedValue(undefined);
  }
  if (vi.isMockFunction(firestore.deleteDoc)) {
    vi.mocked(firestore.deleteDoc).mockResolvedValue(undefined);
  }
  if (vi.isMockFunction(firestore.doc)) {
    vi.mocked(firestore.doc).mockImplementation((_db?: unknown, col?: string, id?: string) => ({ id: id || "mock-doc-id", path: `${col || "mock-col"}/${id || "mock-doc-id"}` } as unknown as firestore.DocumentReference));
  }
  if (vi.isMockFunction(firestore.collection)) {
    vi.mocked(firestore.collection).mockImplementation((_db: unknown, path: string) => ({ id: path, path } as unknown as firestore.CollectionReference));
  }
  if (vi.isMockFunction(firestore.onSnapshot)) {
    vi.mocked(firestore.onSnapshot).mockImplementation((_q: unknown, cb: unknown) => {
      if (typeof cb === "function") {
        cb({ docs: [] });
      }
      return vi.fn();
    });
  }
  if (vi.isMockFunction(useGoogleAuth)) {
    vi.mocked(useGoogleAuth).mockReturnValue({
      accessToken: null,
      isSignedIn: false,
      isReady: true,
      signIn: vi.fn(),
      signOut: vi.fn(),
      requestAccessToken: vi.fn().mockResolvedValue("mock-token"),
    });
  }
});
