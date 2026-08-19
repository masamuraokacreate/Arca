/**
 * src/test/BackupModal.test.tsx
 * BackupModal コンポーネントのテスト（シームレス認証・401リトライ・エクスポート・復元）
 */
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BackupModal from "../components/BackupModal";
import * as backupService from "../services/backupService";
import { useGoogleAuth } from "../hooks/useGoogleAuth";

describe("BackupModal コンポーネント", () => {
  const mockOnClose = vi.fn();
  const mockRequestAccessToken = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    mockRequestAccessToken.mockResolvedValue("mock-token");
    (useGoogleAuth as Mock).mockReturnValue({
      accessToken: "mock-token",
      isSignedIn: true,
      isReady: true,
      signIn: vi.fn(),
      signOut: vi.fn(),
      requestAccessToken: mockRequestAccessToken,
    });
  });

  it("isOpen=false のときは何も描画されないこと", () => {
    const { container } = render(<BackupModal isOpen={false} onClose={mockOnClose} />);
    expect(container.firstChild).toBeNull();
  });

  it("isOpen=true のときにタイトルと各セクションが描画されること", () => {
    render(<BackupModal isOpen={true} onClose={mockOnClose} />);

    expect(screen.getByText("データ保護 ＆ 完全バックアップ")).toBeInTheDocument();
    expect(screen.getByText("Google Drive クラウド保存")).toBeInTheDocument();
    expect(screen.getByText("手元にJSONファイルを保存")).toBeInTheDocument();
    expect(screen.getByText("バックアップから復元")).toBeInTheDocument();
  });

  it("Google Drive保存ボタンをクリックすると requestAccessToken から backupToGoogleDrive が呼ばれること", async () => {
    const user = userEvent.setup();
    const driveSpy = vi.spyOn(backupService, "backupToGoogleDrive").mockResolvedValue({
      fileName: "arca_backup_20260819_1700.json",
      uploadedAt: "2026-08-19T08:00:00.000Z",
      fileId: "drive-123",
      counts: { lists: 2, tasks: 3, events: 1, notes: 4 },
    });

    render(<BackupModal isOpen={true} onClose={mockOnClose} />);

    const driveBtn = screen.getByRole("button", { name: /Google Driveに今すぐバックアップ/i });
    await user.click(driveBtn);

    expect(mockRequestAccessToken).toHaveBeenCalledWith(false);
    expect(driveSpy).toHaveBeenCalledWith("mock-token");
    expect(await screen.findByText(/Google Driveにバックアップを保存しました/)).toBeInTheDocument();
  });

  it("401 (UNAUTHENTICATED) エラー発生時に自動で再認証を行いリトライすること", async () => {
    const user = userEvent.setup();
    mockRequestAccessToken
      .mockResolvedValueOnce("expired-token")
      .mockResolvedValueOnce("fresh-token");

    const authError = new Error("Google Driveへのアップロードに失敗しました (401): Invalid Credentials");
    (authError as Error & { status: number }).status = 401;

    const driveSpy = vi.spyOn(backupService, "backupToGoogleDrive")
      .mockRejectedValueOnce(authError)
      .mockResolvedValueOnce({
        fileName: "arca_backup_20260819_1700.json",
        uploadedAt: "2026-08-19T08:00:00.000Z",
        fileId: "drive-123",
        counts: { lists: 2, tasks: 3, events: 1, notes: 4 },
      });

    render(<BackupModal isOpen={true} onClose={mockOnClose} />);

    const driveBtn = screen.getByRole("button", { name: /Google Driveに今すぐバックアップ/i });
    await user.click(driveBtn);

    // 1回目の失敗と2回目のforce consent再取得
    expect(mockRequestAccessToken).toHaveBeenNthCalledWith(1, false);
    expect(mockRequestAccessToken).toHaveBeenNthCalledWith(2, true);
    expect(driveSpy).toHaveBeenNthCalledWith(1, "expired-token");
    expect(driveSpy).toHaveBeenNthCalledWith(2, "fresh-token");
    expect(await screen.findByText(/Google Driveにバックアップを保存しました/)).toBeInTheDocument();
  });

  it("認証ポップアップがキャンセルされた場合に「Google認証を完了してください」と通知されること", async () => {
    const user = userEvent.setup();
    mockRequestAccessToken.mockRejectedValueOnce(new Error("ユーザーによってキャンセルされました"));

    render(<BackupModal isOpen={true} onClose={mockOnClose} />);

    const driveBtn = screen.getByRole("button", { name: /Google Driveに今すぐバックアップ/i });
    await user.click(driveBtn);

    expect(await screen.findByText("Google認証を完了してください。")).toBeInTheDocument();
  });

  it("JSONダウンロードボタンをクリックすると exportToJsonFile が呼ばれること", async () => {
    const user = userEvent.setup();
    const exportSpy = vi.spyOn(backupService, "exportToJsonFile").mockResolvedValue({
      fileName: "arca_backup_20260819_1700.json",
      uploadedAt: "2026-08-19T08:00:00.000Z",
      counts: { lists: 2, tasks: 3, events: 1, notes: 4 },
    });

    render(<BackupModal isOpen={true} onClose={mockOnClose} />);

    const localBtn = screen.getByRole("button", { name: /JSONファイルをダウンロード/i });
    await user.click(localBtn);

    expect(exportSpy).toHaveBeenCalled();
    expect(await screen.findByText(/バックアップをダウンロードしました/)).toBeInTheDocument();
  });

  it("閉じるボタンをクリックすると onClose が呼ばれること", async () => {
    const user = userEvent.setup();
    render(<BackupModal isOpen={true} onClose={mockOnClose} />);

    const closeBtn = screen.getByRole("button", { name: "閉じる" });
    await user.click(closeBtn);

    expect(mockOnClose).toHaveBeenCalled();
  });
});
