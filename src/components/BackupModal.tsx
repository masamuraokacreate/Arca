/**
 * src/components/BackupModal.tsx
 * Arca — Apple HIG準拠のデータ保護＆完全バックアップ管理モーダル
 *
 * 設計原則 (Core/Kernel.md & Core/Rules.md):
 *  - 「10年分のデータを失わない」データ自己所有の保証
 *  - Apple システム設定風のグループ化カードレイアウト、フロストガラス、上品なマイクロインタラクション
 *  - Google Drive 連携直接アップロード、ローカルJSON保存、ドラッグ＆ドロップ復元
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { C } from "../lib/designSystem";
import {
  exportToJsonFile,
  backupToGoogleDrive,
  restoreFromJson,
  getLastBackupInfo,
  type LastBackupInfo,
  type BackupData,
} from "../services/backupService";
import { useGoogleAuth } from "../hooks/useGoogleAuth";

// ─── アイコン定義 ───

function ShieldCheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.8} stroke="currentColor" style={{ width: "1.25rem", height: "1.25rem", color: C.goldDark }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
    </svg>
  );
}

function CloudUploadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.8} stroke="currentColor" style={{ width: "1.1rem", height: "1.1rem", flexShrink: 0 }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z" />
    </svg>
  );
}

function ArrowDownTrayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.8} stroke="currentColor" style={{ width: "1.1rem", height: "1.1rem", flexShrink: 0 }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
  );
}

function ArrowPathIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.8} stroke="currentColor" style={{ width: "1.1rem", height: "1.1rem", flexShrink: 0 }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
    </svg>
  );
}

function SparklesIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.8} stroke="currentColor" style={{ width: "0.95rem", height: "0.95rem", color: C.gold, flexShrink: 0 }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
    </svg>
  );
}

function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg
      style={{
        width: `${size}px`,
        height: `${size}px`,
        animation: "spin 0.8s linear infinite",
        flexShrink: 0,
      }}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ─── モーダルコンポーネント ───

export interface BackupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function BackupModal({ isOpen, onClose }: BackupModalProps) {
  const { isSignedIn, requestAccessToken } = useGoogleAuth();

  const [lastBackup, setLastBackup] = useState<LastBackupInfo | null>(null);
  const [isBackingUpDrive, setIsBackingUpDrive] = useState(false);
  const [isExportingLocal, setIsExportingLocal] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  // 復元用ファイル関連
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedBackup, setParsedBackup] = useState<BackupData | null>(null);
  const [restoreMode, setRestoreMode] = useState<"merge" | "overwrite">("merge");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // マウント時に最終バックアップ情報を取得
  useEffect(() => {
    if (isOpen) {
      setLastBackup(getLastBackupInfo());
      setStatusMessage(null);
      setSelectedFile(null);
      setParsedBackup(null);
    }
  }, [isOpen]);

  // ─── Google Drive バックアップ実行（シームレス認証 ＆ 401自動リトライ） ───
  const handleDriveBackup = async () => {
    setIsBackingUpDrive(true);
    setStatusMessage(null);
    try {
      // 1. アクセストークンを確保（未接続・期限切れ時は自動でポップアップ認証）
      let token: string;
      try {
        token = await requestAccessToken(false);
      } catch (authErr: unknown) {
        const msg = authErr instanceof Error ? authErr.message : "Google認証を完了してください。";
        setStatusMessage({
          type: "info",
          text: msg.includes("キャンセル") || msg.includes("初期化") ? "Google認証を完了してください。" : msg,
        });
        setIsBackingUpDrive(false);
        return;
      }

      // 2. Google Drive API へアップロード（401/403 時は同意プロンプト付きで再認証リトライ）
      let res;
      try {
        res = await backupToGoogleDrive(token);
      } catch (uploadErr: unknown) {
        const e = uploadErr as Error & { status?: number };
        const isAuthError =
          e.status === 401 ||
          e.status === 403 ||
          e.message?.includes("401") ||
          e.message?.includes("403");

        if (isAuthError) {
          console.warn("Drive upload returned 401/403. Re-authenticating with consent prompt...");
          const freshToken = await requestAccessToken(true);
          res = await backupToGoogleDrive(freshToken);
        } else {
          throw uploadErr;
        }
      }

      setLastBackup(getLastBackupInfo());
      setStatusMessage({
        type: "success",
        text: `Google Driveにバックアップを保存しました: ${res.fileName} (合計 ${res.counts.lists + res.counts.tasks + res.counts.events + res.counts.notes}件)`,
      });
    } catch (e: unknown) {
      console.error("Drive backup failed", e);
      setStatusMessage({
        type: "error",
        text: e instanceof Error ? e.message : "Google Driveへの保存に失敗しました。",
      });
    } finally {
      setIsBackingUpDrive(false);
    }
  };

  // ─── ローカル JSON ダウンロード実行 ───
  const handleLocalExport = async () => {
    setIsExportingLocal(true);
    setStatusMessage(null);
    try {
      const res = await exportToJsonFile();
      setLastBackup(getLastBackupInfo());
      setStatusMessage({
        type: "success",
        text: `バックアップをダウンロードしました: ${res.fileName}`,
      });
    } catch (e: unknown) {
      console.error("Local export failed", e);
      setStatusMessage({
        type: "error",
        text: e instanceof Error ? e.message : "ファイルのダウンロードに失敗しました。",
      });
    } finally {
      setIsExportingLocal(false);
    }
  };

  // ─── ファイル読み込み ───
  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    setStatusMessage(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const json = JSON.parse(text) as BackupData;
        if (!json.data) {
          throw new Error("データ構造が無効です。");
        }
        setParsedBackup(json);
      } catch {
        setParsedBackup(null);
        setStatusMessage({
          type: "error",
          text: "有効なArcaバックアップJSONファイルではありません。",
        });
      }
    };
    reader.readAsText(file);
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  }, []);

  // ─── 復元実行 ───
  const handleRestore = async () => {
    if (!parsedBackup) return;

    if (restoreMode === "overwrite") {
      const ok = window.confirm(
        "【警告】「完全上書き」を選択しています。\n現在のすべてのデータが削除され、バックアップの内容で置き換えられます。\n本当に復元を実行しますか？"
      );
      if (!ok) return;
    }

    setIsRestoring(true);
    setStatusMessage(null);
    try {
      const res = await restoreFromJson(parsedBackup, restoreMode);
      setStatusMessage({
        type: "success",
        text: `データを正常に復元しました（買い物: ${res.importedCounts.lists}件, タスク: ${res.importedCounts.tasks}件, 予定: ${res.importedCounts.events}件, ノート: ${res.importedCounts.notes}件）`,
      });
      setSelectedFile(null);
      setParsedBackup(null);
    } catch (e: unknown) {
      console.error("Restore failed", e);
      setStatusMessage({
        type: "error",
        text: e instanceof Error ? e.message : "復元中にエラーが発生しました。",
      });
    } finally {
      setIsRestoring(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "calc(1.5rem + env(safe-area-inset-top, 0px)) 1rem calc(1.5rem + env(safe-area-inset-bottom, 0px))",
        background: "rgba(0, 0, 0, 0.35)",
        backdropFilter: "blur(20px) saturate(160%)",
        WebkitBackdropFilter: "blur(20px) saturate(160%)",
        boxSizing: "border-box",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="arca-card"
        style={{
          width: "100%",
          maxWidth: "540px",
          maxHeight: "88vh",
          display: "flex",
          flexDirection: "column",
          borderRadius: "24px",
          background: "rgba(253, 252, 250, 0.94)",
          boxShadow: "0 24px 48px -12px rgba(0, 0, 0, 0.14), 0 1px 4px rgba(0, 0, 0, 0.04)",
          overflow: "hidden",
          animation: "arca-module-in 0.24s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* ── ヘッダー ── */}
        <div
          style={{
            padding: "1.4rem 1.6rem 1rem",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            borderBottom: `1px solid ${C.ivory2}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "10px",
                background: "rgba(197, 160, 89, 0.12)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <ShieldCheckIcon />
            </div>
            <div>
              <h2
                style={{
                  fontSize: "1.15rem",
                  fontWeight: 750,
                  color: C.charcoal,
                  margin: 0,
                  letterSpacing: "-0.01em",
                }}
              >
                データ保護 ＆ 完全バックアップ
              </h2>
              <p
                style={{
                  fontSize: "0.74rem",
                  color: C.charcoalLight,
                  margin: "0.2rem 0 0",
                  letterSpacing: "0.01em",
                }}
              >
                10年分の全データを安全に保管し、いつでも復元できます
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="閉じる"
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: "0.35rem",
              borderRadius: "50%",
              color: C.charcoalLight,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "background 0.15s ease",
            }}
            title="閉じる"
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(0, 0, 0, 0.05)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "transparent";
            }}
          >
            ✕
          </button>
        </div>

        {/* ── メインスクロール領域 ── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "1.2rem 1.6rem 1.8rem" }}>
          {/* 最終バックアップ情報バッジ */}
          <div
            style={{
              marginBottom: "1.2rem",
              padding: "0.65rem 0.9rem",
              borderRadius: "12px",
              background: "rgba(0, 0, 0, 0.025)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: "0.74rem",
            }}
          >
            <span style={{ color: C.charcoalMid, fontWeight: 550 }}>
              {lastBackup ? (
                <>
                  最終バックアップ: {new Date(lastBackup.time).toLocaleString("ja-JP")} (
                  {lastBackup.target === "drive" ? "Google Drive" : "ローカルJSON"})
                </>
              ) : (
                "バックアップ履歴はまだありません"
              )}
            </span>
            <span style={{ color: C.goldDark, fontWeight: 650, fontSize: "0.7rem", letterSpacing: "0.03em" }}>
              ローカルファースト保護
            </span>
          </div>

          {/* ステータス / エラー / 成功通知 */}
          {statusMessage && (
            <div
              style={{
                marginBottom: "1.2rem",
                padding: "0.7rem 0.9rem",
                borderRadius: "10px",
                fontSize: "0.76rem",
                lineHeight: 1.4,
                fontWeight: 500,
                background:
                  statusMessage.type === "success"
                    ? "rgba(107, 142, 111, 0.12)"
                    : statusMessage.type === "error"
                    ? "rgba(224, 86, 74, 0.1)"
                    : "rgba(197, 160, 89, 0.1)",
                color:
                  statusMessage.type === "success"
                    ? "#3A5C3D"
                    : statusMessage.type === "error"
                    ? C.danger
                    : C.goldDark,
              }}
            >
              {statusMessage.text}
            </div>
          )}

          {/* ── セクション1: Google Drive 保存 ── */}
          <div
            style={{
              marginBottom: "1.4rem",
              padding: "1.1rem 1.25rem",
              borderRadius: "16px",
              background: "rgba(255, 255, 255, 0.8)",
              boxShadow: "0 1px 4px rgba(0, 0, 0, 0.03)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                <SparklesIcon />
                <span style={{ fontSize: "0.88rem", fontWeight: 700, color: C.charcoal }}>
                  Google Drive クラウド保存
                </span>
              </div>
              <span style={{ fontSize: "0.7rem", color: isSignedIn ? "#466B4A" : C.charcoalLight, fontWeight: 600 }}>
                {isSignedIn ? "● Drive連携済み" : "未接続"}
              </span>
            </div>
            <p style={{ margin: "0 0 0.85rem", fontSize: "0.74rem", color: C.charcoalLight, lineHeight: 1.45 }}>
              マイドライブ内に日付入りの構造化バックアップJSONを直接保存します。
            </p>
            <button
              type="button"
              onClick={handleDriveBackup}
              disabled={isBackingUpDrive}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.45rem",
                padding: "0.55rem 1.1rem",
                borderRadius: "10px",
                background: C.gold,
                color: "#FDFCFA",
                border: "none",
                fontSize: "0.8rem",
                fontWeight: 650,
                cursor: isBackingUpDrive ? "default" : "pointer",
                boxShadow: "0 2px 10px rgba(197, 160, 89, 0.3)",
                transition: "all 0.18s ease",
              }}
            >
              {isBackingUpDrive ? (
                <>
                  <Spinner size={14} />
                  <span>Google Driveへ保存中…</span>
                </>
              ) : (
                <>
                  <CloudUploadIcon />
                  <span>{isSignedIn ? "Google Driveに今すぐバックアップ" : "Google連携してDriveに保存"}</span>
                </>
              )}
            </button>
          </div>

          {/* ── セクション2: ローカル JSON ダウンロード ── */}
          <div
            style={{
              marginBottom: "1.4rem",
              padding: "1.1rem 1.25rem",
              borderRadius: "16px",
              background: "rgba(255, 255, 255, 0.8)",
              boxShadow: "0 1px 4px rgba(0, 0, 0, 0.03)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", marginBottom: "0.5rem" }}>
              <span style={{ fontSize: "0.88rem", fontWeight: 700, color: C.charcoal }}>
                手元にJSONファイルを保存
              </span>
            </div>
            <p style={{ margin: "0 0 0.85rem", fontSize: "0.74rem", color: C.charcoalLight, lineHeight: 1.45 }}>
              お使いの端末に全データのバックアップファイル（.json）をダウンロードします。
            </p>
            <button
              type="button"
              onClick={handleLocalExport}
              disabled={isExportingLocal}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.45rem",
                padding: "0.55rem 1.1rem",
                borderRadius: "10px",
                background: "rgba(0, 0, 0, 0.05)",
                color: C.charcoal,
                border: "none",
                fontSize: "0.8rem",
                fontWeight: 600,
                cursor: isExportingLocal ? "default" : "pointer",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                if (!isExportingLocal) (e.currentTarget as HTMLButtonElement).style.background = "rgba(0, 0, 0, 0.08)";
              }}
              onMouseLeave={(e) => {
                if (!isExportingLocal) (e.currentTarget as HTMLButtonElement).style.background = "rgba(0, 0, 0, 0.05)";
              }}
            >
              {isExportingLocal ? (
                <>
                  <Spinner size={14} />
                  <span>生成中…</span>
                </>
              ) : (
                <>
                  <ArrowDownTrayIcon />
                  <span>JSONファイルをダウンロード</span>
                </>
              )}
            </button>
          </div>

          {/* ── セクション3: バックアップから復元 ── */}
          <div
            style={{
              padding: "1.1rem 1.25rem",
              borderRadius: "16px",
              background: "rgba(255, 255, 255, 0.8)",
              boxShadow: "0 1px 4px rgba(0, 0, 0, 0.03)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", marginBottom: "0.5rem" }}>
              <span style={{ fontSize: "0.88rem", fontWeight: 700, color: C.charcoal }}>
                バックアップから復元
              </span>
            </div>
            <p style={{ margin: "0 0 0.85rem", fontSize: "0.74rem", color: C.charcoalLight, lineHeight: 1.45 }}>
              以前保存したJSONファイルを読み込み、データを復元します。
            </p>

            {/* ドロップゾーン */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              style={{ display: "none" }}
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFileSelect(e.target.files[0]);
                }
              }}
            />

            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              style={{
                border: `2px dashed ${isDragging ? C.gold : "rgba(0, 0, 0, 0.12)"}`,
                borderRadius: "12px",
                padding: "1.2rem",
                textAlign: "center",
                cursor: "pointer",
                background: isDragging ? "rgba(197, 160, 89, 0.06)" : "rgba(0, 0, 0, 0.015)",
                transition: "all 0.18s ease",
                marginBottom: "0.9rem",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.35rem" }}>
                <ArrowPathIcon />
                <span style={{ fontSize: "0.78rem", fontWeight: 600, color: C.charcoal }}>
                  {selectedFile ? selectedFile.name : "JSONファイルを選択またはドラッグ＆ドロップ"}
                </span>
                <span style={{ fontSize: "0.68rem", color: C.charcoalLight }}>
                  クリックしてファイルを選択
                </span>
              </div>
            </div>

            {/* パース済みバックアップ情報のプレビュー */}
            {parsedBackup && (
              <div
                style={{
                  marginBottom: "1rem",
                  padding: "0.75rem 0.9rem",
                  borderRadius: "10px",
                  background: "rgba(197, 160, 89, 0.08)",
                  fontSize: "0.74rem",
                }}
              >
                <div style={{ fontWeight: 650, color: C.charcoal, marginBottom: "0.3rem" }}>
                  検出されたデータ（{parsedBackup.exportedAt ? new Date(parsedBackup.exportedAt).toLocaleString("ja-JP") : "日時不明"}）:
                </div>
                <div style={{ color: C.charcoalMid, display: "flex", gap: "0.8rem", flexWrap: "wrap" }}>
                  <span>買い物: {parsedBackup.data?.lists?.length || 0}件</span>
                  <span>タスク: {parsedBackup.data?.tasks?.length || 0}件</span>
                  <span>カレンダー: {parsedBackup.data?.events?.length || 0}件</span>
                  <span>ノート: {parsedBackup.data?.notes?.length || 0}件</span>
                </div>

                {/* 復元モード選択 */}
                <div style={{ marginTop: "0.75rem", paddingTop: "0.6rem", borderTop: "1px solid rgba(0, 0, 0, 0.06)" }}>
                  <div style={{ fontSize: "0.72rem", fontWeight: 600, color: C.charcoal, marginBottom: "0.35rem" }}>
                    復元方法:
                  </div>
                  <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "0.3rem", cursor: "pointer", fontSize: "0.74rem", color: C.charcoal }}>
                      <input
                        type="radio"
                        name="restoreMode"
                        value="merge"
                        checked={restoreMode === "merge"}
                        onChange={() => setRestoreMode("merge")}
                      />
                      マージ（既存データを保持）
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: "0.3rem", cursor: "pointer", fontSize: "0.74rem", color: C.danger }}>
                      <input
                        type="radio"
                        name="restoreMode"
                        value="overwrite"
                        checked={restoreMode === "overwrite"}
                        onChange={() => setRestoreMode("overwrite")}
                      />
                      完全上書き（置き換え）
                    </label>
                  </div>
                </div>

                {/* 復元実行ボタン */}
                <div style={{ marginTop: "0.85rem" }}>
                  <button
                    type="button"
                    onClick={handleRestore}
                    disabled={isRestoring}
                    style={{
                      padding: "0.5rem 1.1rem",
                      borderRadius: "8px",
                      background: restoreMode === "overwrite" ? C.danger : C.gold,
                      color: "#FDFCFA",
                      border: "none",
                      fontSize: "0.78rem",
                      fontWeight: 650,
                      cursor: isRestoring ? "default" : "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.4rem",
                    }}
                  >
                    {isRestoring ? (
                      <>
                        <Spinner size={13} />
                        <span>復元中…</span>
                      </>
                    ) : (
                      <span>データを復元する</span>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
