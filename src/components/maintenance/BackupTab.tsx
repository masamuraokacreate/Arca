/**
 * src/components/maintenance/BackupTab.tsx
 * Arca — データ保護 ＆ 完全バックアップ管理タブ（SystemMaintenanceModal 内統合）
 *
 * 準拠ガイドライン:
 * - Core/Rules.md: 主体性、データ保護（Local First）、絵文字完全排除、枠線排除
 * - references/apple_hig_master.md: 洗練されたSVGアイコン、二重シャドウ、44pxタップ領域
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { C } from "../../lib/designSystem";
import {
  exportToJsonFile,
  backupToGoogleDrive,
  restoreFromJson,
  getLastBackupInfo,
  type LastBackupInfo,
  type BackupData,
} from "../../services/backupService";
import { useGoogleAuth } from "../../hooks/useGoogleAuth";
import { logger } from "../../services/loggerService";
import {
  UploadCloud,
  Download,
  RotateCcw,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  FileText,
  Clock,
  HardDrive,
} from "lucide-react";

export function BackupTab() {
  const { requestAccessToken } = useGoogleAuth();

  const [lastBackup, setLastBackup] = useState<LastBackupInfo | null>(null);
  const [isBackingUpDrive, setIsBackingUpDrive] = useState(false);
  const [isExportingLocal, setIsExportingLocal] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  // 復元用ファイル関連
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedBackup, setParsedBackup] = useState<BackupData | null>(null);
  const [restoreMode, setRestoreMode] = useState<"merge" | "overwrite">("merge");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLastBackup(getLastBackupInfo());
  }, []);

  // Google Drive バックアップ実行
  const handleDriveBackup = async () => {
    setIsBackingUpDrive(true);
    setStatusMessage(null);
    logger.info("google_api", "Backup: Starting Google Drive backup");

    try {
      let token: string;
      try {
        token = await requestAccessToken(false);
      } catch (authErr: unknown) {
        const msg =
          authErr instanceof Error ? authErr.message : "Google認証を完了してください。";
        setStatusMessage({
          type: "info",
          text:
            msg.includes("キャンセル") || msg.includes("初期化")
              ? "Google認証を完了してください。"
              : msg,
        });
        setIsBackingUpDrive(false);
        return;
      }

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
          logger.warn("auth", "Backup: Google Drive token expired. Attempting refresh...");
          const freshToken = await requestAccessToken(true);
          res = await backupToGoogleDrive(freshToken);
        } else {
          throw uploadErr;
        }
      }

      setLastBackup(getLastBackupInfo());
      const totalCount =
        res.counts.lists +
        res.counts.tasks +
        res.counts.events +
        res.counts.notes +
        (res.counts.recipes || 0) +
        (res.counts.pmTemplates || 0) +
        (res.counts.pmLogs || 0);

      setStatusMessage({
        type: "success",
        text: `Google Driveにバックアップを保存しました: ${res.fileName} (合計 ${totalCount}件)`,
      });
      logger.success("google_api", `Backup: Successfully backed up to Google Drive: ${res.fileName}`);
    } catch (e: unknown) {
      console.error("Drive backup failed", e);
      const msg = e instanceof Error ? e.message : "Google Driveへの保存に失敗しました。";
      setStatusMessage({ type: "error", text: msg });
      logger.error("google_api", "Backup: Failed to backup to Google Drive", msg);
    } finally {
      setIsBackingUpDrive(false);
    }
  };

  // ローカル JSON ダウンロード実行
  const handleLocalExport = async () => {
    setIsExportingLocal(true);
    setStatusMessage(null);
    logger.info("app", "Backup: Starting local JSON backup export");

    try {
      const res = await exportToJsonFile();
      setLastBackup(getLastBackupInfo());
      setStatusMessage({
        type: "success",
        text: `バックアップをダウンロードしました: ${res.fileName}`,
      });
      logger.success("app", `Backup: Successfully exported local JSON backup: ${res.fileName}`);
    } catch (e: unknown) {
      console.error("Local export failed", e);
      const msg = e instanceof Error ? e.message : "ファイルのダウンロードに失敗しました。";
      setStatusMessage({ type: "error", text: msg });
      logger.error("app", "Backup: Failed to export local JSON backup", msg);
    } finally {
      setIsExportingLocal(false);
    }
  };

  // ファイル読み込み
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
        logger.info("app", `Backup: Parsed backup file: ${file.name}`);
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

  // 復元実行
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
    logger.info("app", `Backup: Starting restore (mode: ${restoreMode})`);

    try {
      const res = await restoreFromJson(parsedBackup, restoreMode);
      setStatusMessage({
        type: "success",
        text: `データを正常に復元しました（買い物: ${res.importedCounts.lists}件, タスク: ${res.importedCounts.tasks}件, 予定: ${res.importedCounts.events}件, ノート: ${res.importedCounts.notes}件）`,
      });
      logger.success("app", "Backup: Restore completed successfully");
      setSelectedFile(null);
      setParsedBackup(null);
    } catch (e: unknown) {
      console.error("Restore failed", e);
      const msg = e instanceof Error ? e.message : "復元中にエラーが発生しました。";
      setStatusMessage({ type: "error", text: msg });
      logger.error("app", "Backup: Restore failed", msg);
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem", width: "100%" }}>
      {/* ── ステータス通知 ── */}
      {statusMessage && (
        <div
          style={{
            padding: "0.6rem 0.95rem",
            borderRadius: "10px",
            background:
              statusMessage.type === "success"
                ? "rgba(82, 121, 111, 0.12)"
                : statusMessage.type === "error"
                ? "rgba(192, 97, 74, 0.1)"
                : "rgba(197, 160, 89, 0.12)",
            color:
              statusMessage.type === "success"
                ? C.sage
                : statusMessage.type === "error"
                ? C.danger
                : C.goldDark,
            fontSize: "0.78rem",
            fontWeight: 650,
            display: "flex",
            alignItems: "center",
            gap: "0.45rem",
            border: "none",
            animation: "arca-fade-in 0.15s ease-out",
          }}
        >
          {statusMessage.type === "success" ? (
            <CheckCircle2 size={16} />
          ) : (
            <AlertCircle size={16} />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* ── 最終バックアップ情報カード ── */}
      <div
        style={{
          background: "var(--bg-nav-track, rgba(0, 0, 0, 0.025))",
          borderRadius: "14px",
          padding: "0.75rem 1rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "0.5rem",
          border: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Clock size={16} color={C.goldDark} />
          <div>
            <div style={{ fontSize: "0.72rem", color: C.charcoalLight, fontWeight: 550 }}>
              最終バックアップ日時
            </div>
            <div style={{ fontSize: "0.84rem", fontWeight: 700, color: C.charcoal }}>
              {lastBackup?.time
                ? new Date(lastBackup.time).toLocaleString("ja-JP", {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "未実行"}
              {lastBackup?.target && (
                <span
                  style={{
                    fontSize: "0.7rem",
                    fontWeight: 600,
                    color: C.charcoalMid,
                    marginLeft: "0.5rem",
                  }}
                >
                  ({lastBackup.target === "drive" ? "Google Drive" : "ローカル保存"})
                </span>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* ── バックアップ作成アクション（2カラム） ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "0.75rem",
        }}
      >
        {/* Google Drive 保存 */}
        <div
          style={{
            background: "var(--bg-card-solid, #FDFCFA)",
            borderRadius: "14px",
            padding: "1rem",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            gap: "0.75rem",
            border: "none",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", marginBottom: "0.3rem" }}>
              <Sparkles size={16} color={C.gold} />
              <h4 style={{ margin: 0, fontSize: "0.88rem", fontWeight: 750, color: C.charcoal }}>
                Google Drive に保存
              </h4>
            </div>
            <p style={{ margin: 0, fontSize: "0.75rem", color: C.charcoalLight, lineHeight: 1.45 }}>
              クラウド上の安全なフォルダに全コレクションを自動圧縮保存します。
            </p>
          </div>

          <button
            onClick={handleDriveBackup}
            disabled={isBackingUpDrive}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.45rem",
              background: C.gold,
              border: "none",
              borderRadius: "10px",
              padding: "0.55rem 0.95rem",
              fontSize: "0.8rem",
              fontWeight: 650,
              color: "#FFFFFF",
              cursor: isBackingUpDrive ? "not-allowed" : "pointer",
              boxShadow: "0 2px 8px rgba(197, 160, 89, 0.3)",
              transition: "opacity 0.15s",
              opacity: isBackingUpDrive ? 0.65 : 1,
            }}
          >
            <UploadCloud size={15} />
            <span>{isBackingUpDrive ? "保存処理中..." : "Google Drive にバックアップ"}</span>
          </button>
        </div>

        {/* 手元に JSON ダウンロード */}
        <div
          style={{
            background: "var(--bg-card-solid, #FDFCFA)",
            borderRadius: "14px",
            padding: "1rem",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            gap: "0.75rem",
            border: "none",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", marginBottom: "0.3rem" }}>
              <HardDrive size={16} color={C.goldDark} />
              <h4 style={{ margin: 0, fontSize: "0.88rem", fontWeight: 750, color: C.charcoal }}>
                手元に JSON をダウンロード
              </h4>
            </div>
            <p style={{ margin: 0, fontSize: "0.75rem", color: C.charcoalLight, lineHeight: 1.45 }}>
              お使いの端末に標準 JSON ファイルとして直接保存します。
            </p>
          </div>

          <button
            onClick={handleLocalExport}
            disabled={isExportingLocal}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.45rem",
              background: "var(--bg-nav-track, rgba(0, 0, 0, 0.04))",
              border: "none",
              borderRadius: "10px",
              padding: "0.55rem 0.95rem",
              fontSize: "0.8rem",
              fontWeight: 650,
              color: C.charcoal,
              cursor: isExportingLocal ? "not-allowed" : "pointer",
              transition: "background 0.15s",
              opacity: isExportingLocal ? 0.65 : 1,
            }}
          >
            <Download size={15} />
            <span>{isExportingLocal ? "ダウンロード中..." : "JSON をダウンロード"}</span>
          </button>
        </div>
      </div>

      {/* ── バックアップから復元セクション ── */}
      <div
        style={{
          background: "var(--bg-card-solid, #FDFCFA)",
          borderRadius: "14px",
          padding: "1rem",
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
          border: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
          <RotateCcw size={16} color={C.goldDark} />
          <h4 style={{ margin: 0, fontSize: "0.88rem", fontWeight: 750, color: C.charcoal }}>
            バックアップから復元
          </h4>
        </div>

        {/* ドロップゾーン */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            borderRadius: "12px",
            padding: "1.4rem 1rem",
            textAlign: "center",
            background: isDragging ? "rgba(197, 160, 89, 0.08)" : "var(--bg-nav-track, rgba(0, 0, 0, 0.02))",
            cursor: "pointer",
            border: "none",
            transition: "all 0.15s ease",
          }}
        >
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

          <FileText size={24} color={C.charcoalLight} style={{ margin: "0 auto 0.4rem" }} />
          <div style={{ fontSize: "0.82rem", fontWeight: 650, color: C.charcoal }}>
            {selectedFile ? selectedFile.name : "JSON ファイルを選択またはドラッグ＆ドロップ"}
          </div>
          <div style={{ fontSize: "0.7rem", color: C.charcoalLight, marginTop: "0.2rem" }}>
            過去に書き出した Arca のバックアップ JSON ファイルを指定してください
          </div>
        </div>

        {/* 復元モード選択 ＆ 実行ボタン */}
        {parsedBackup && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "0.6rem",
              paddingTop: "0.4rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.3rem",
                  fontSize: "0.75rem",
                  color: C.charcoal,
                  cursor: "pointer",
                }}
              >
                <input
                  type="radio"
                  name="restoreMode"
                  checked={restoreMode === "merge"}
                  onChange={() => setRestoreMode("merge")}
                />
                <span>マージ（差分追加）</span>
              </label>

              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.3rem",
                  fontSize: "0.75rem",
                  color: C.danger,
                  cursor: "pointer",
                  marginLeft: "0.4rem",
                }}
              >
                <input
                  type="radio"
                  name="restoreMode"
                  checked={restoreMode === "overwrite"}
                  onChange={() => setRestoreMode("overwrite")}
                />
                <span>完全上書き（注意）</span>
              </label>
            </div>

            <button
              onClick={handleRestore}
              disabled={isRestoring}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                background: restoreMode === "overwrite" ? C.danger : C.gold,
                border: "none",
                borderRadius: "8px",
                padding: "0.5rem 0.95rem",
                fontSize: "0.78rem",
                fontWeight: 650,
                color: "#FFFFFF",
                cursor: isRestoring ? "not-allowed" : "pointer",
                boxShadow: "0 2px 6px rgba(0, 0, 0, 0.12)",
                opacity: isRestoring ? 0.6 : 1,
              }}
            >
              <RotateCcw size={14} />
              <span>{isRestoring ? "復元処理中..." : "データを復元する"}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
