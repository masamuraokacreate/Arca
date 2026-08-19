/**
 * src/test/Dashboard.test.tsx
 * Dashboard コンポーネントのタブ遷移・ナビゲーション連携 & 文言統一テスト
 */
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { onSnapshot } from "firebase/firestore";
import Dashboard from "../components/Dashboard";

describe("Dashboard コンポーネント", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (onSnapshot as Mock).mockImplementation((_query: unknown, callback: (snap: unknown) => void) => {
      callback({ docs: [] });
      return vi.fn();
    });
  });

  it("各タイルのヘッダーボタン文言が正しく、「を開く」が含まれていないこと", () => {
    render(<Dashboard />);

    // 「を開く」が含まれていないこと
    expect(screen.queryByText(/を開く/)).not.toBeInTheDocument();
    expect(screen.queryByText("リストを開く")).not.toBeInTheDocument();
    expect(screen.queryByText("ノートを開く")).not.toBeInTheDocument();
    expect(screen.queryByText("タスク一覧")).not.toBeInTheDocument();

    // 各ボタンが存在すること
    expect(screen.getByRole("button", { name: /カレンダー/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /タスク/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /買い物リスト/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ノート/i })).toBeInTheDocument();
  });

  it("各タイルのヘッダーボタンクリック時に onNavigate が正しく呼び出されること", async () => {
    const user = userEvent.setup();
    const handleNavigate = vi.fn();

    render(<Dashboard onNavigate={handleNavigate} />);

    // カレンダーボタン
    await user.click(screen.getByRole("button", { name: /カレンダー/i }));
    expect(handleNavigate).toHaveBeenCalledWith("calendar");

    // タスクボタン
    await user.click(screen.getByRole("button", { name: /タスク/i }));
    expect(handleNavigate).toHaveBeenCalledWith("tasks");

    // 買い物リストボタン
    await user.click(screen.getByRole("button", { name: /買い物リスト/i }));
    expect(handleNavigate).toHaveBeenCalledWith("lists");

    // ノートボタン
    await user.click(screen.getByRole("button", { name: /ノート/i }));
    expect(handleNavigate).toHaveBeenCalledWith("notes");
  });

  it("最近のノート行をクリックした際に onSelectNote が正しく noteId で呼び出されること", async () => {
    const user = userEvent.setup();
    const handleSelectNote = vi.fn();

    // ノートのモックデータを返すように設定
    (onSnapshot as Mock).mockImplementation((_q: unknown, callback: (snap: unknown) => void) => {
      // 渡されたクエリまたは全クエリに対して安全に notes を判定するか、コールバックを実行
      callback({
        docs: [
          {
            id: "note-123",
            data: () => ({
              title: "テスト用ノート",
              content: "ノートの本文です",
              tags: ["test"],
              createdAt: { toDate: () => new Date() },
              updatedAt: { toDate: () => new Date() },
            }),
          },
        ],
      });
      return vi.fn();
    });

    render(<Dashboard onSelectNote={handleSelectNote} />);

    // 「最近のノート」セクション内の「テスト用ノート」を取得
    const noteItems = screen.getAllByText("テスト用ノート");
    expect(noteItems.length).toBeGreaterThan(0);

    await user.click(noteItems[noteItems.length - 1]);
    expect(handleSelectNote).toHaveBeenCalledWith("note-123");
  });
});
