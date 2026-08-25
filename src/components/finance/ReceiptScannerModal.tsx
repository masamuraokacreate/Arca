/**
 * src/components/finance/ReceiptScannerModal.tsx
 * Arca — iPhoneカメラ連携 ＆ Gemini Vision レシートスキャナーモーダル
 *
 * 設計原則 (Core/Rules.md & Apple HIG):
 * - `<input type="file" accept="image/*" capture="environment" />` によるワンタップカメラ起動
 * - クライアント側Canvas軽量圧縮（1600px, JPEG）
 * - 印字された文字・金額をそのまま抽出する無機質で高精度なOCR
 * - Aether Core の静かなゴールドスキャニングUI
 */

import { useState, useRef } from "react";
import type { ReceiptOcrResult } from "../../types/finance";
import {
  compressReceiptImage,
  parseReceiptWithGemini,
} from "../../services/receiptOcrService";
import { C } from "../../lib/designSystem";

interface ReceiptScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanComplete: (result: ReceiptOcrResult, imageUrl?: string) => void;
}

export function ReceiptScannerModal({
  isOpen,
  onClose,
  onScanComplete,
}: ReceiptScannerModalProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleProcessFile = async (file: File) => {
    setIsScanning(true);
    setErrorMessage(null);

    try {
      // 1. クライアント側で画像を軽量圧縮
      const { base64, mimeType, dataUrl } = await compressReceiptImage(file);
      setPreviewUrl(dataUrl);

      // 2. Gemini Vision API でOCR解析
      const result = await parseReceiptWithGemini(base64, mimeType);

      if (!result) {
        throw new Error(
          "レシートの読み取りに失敗しました。明るい場所で文字がはっきり見えるように再度撮影するか、手動で入力してください。"
        );
      }

      // 3. 親コンポーネントへ解析結果を引き渡し
      setIsScanning(false);
      setPreviewUrl(null);
      onScanComplete(result, dataUrl);
    } catch (err: any) {
      console.error("[ReceiptScanner] Error:", err);
      setErrorMessage(
        err?.message || "レシートの解析中にエラーが発生しました。もう一度お試しください。"
      );
      setIsScanning(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleProcessFile(file);
    }
    // 同じファイルを再選択できるようにリセット
    e.target.value = "";
  };

  const handleReset = () => {
    setIsScanning(false);
    setPreviewUrl(null);
    setErrorMessage(null);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 210,
        backgroundColor: "rgba(0, 0, 0, 0.45)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        animation: "arca-fade-in 0.18s ease-out",
      }}
      onClick={isScanning ? undefined : onClose}
    >
      <div
        style={{
          background: C.white,
          borderRadius: C.radiusModal,
          boxShadow: C.modalShadow,
          width: "100%",
          maxWidth: "480px",
          overflow: "hidden",
          border: "1px solid rgba(0, 0, 0, 0.05)",
          display: "flex",
          flexDirection: "column",
          animation: "arca-modal-pop 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div
          style={{
            padding: "1.2rem 1.5rem 0.8rem",
            borderBottom: "1px solid rgba(0, 0, 0, 0.05)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <h2
              style={{
                fontSize: "1.1rem",
                fontWeight: 700,
                color: C.charcoal,
                margin: 0,
                letterSpacing: "-0.01em",
              }}
            >
              レシートをカメラで読み取る
            </h2>
            <p style={{ fontSize: "0.74rem", color: C.charcoalLight, margin: "0.15rem 0 0" }}>
              Gemini Vision が印字された品目・金額を正確に抽出します
            </p>
          </div>
          {!isScanning && (
            <button
              onClick={onClose}
              aria-label="閉じる"
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: C.charcoalLight,
                padding: "0.3rem",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        {/* 隠しインプット（カメラ用 ＆ ファイル用） */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: "none" }}
          onChange={handleInputChange}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={handleInputChange}
        />

        {/* 本文エリア */}
        <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.2rem", width: "100%", boxSizing: "border-box", overflowX: "hidden" }}>
          {isScanning ? (
            /* ── 解析待機中（ゴールドスキャンアニメーション） ── */
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "2rem 1rem",
                gap: "1.2rem",
                textAlign: "center",
              }}
            >
              {previewUrl ? (
                <div
                  style={{
                    position: "relative",
                    width: "180px",
                    height: "240px",
                    borderRadius: "12px",
                    overflow: "hidden",
                    boxShadow: C.cardShadowHover,
                    border: `2px solid ${C.gold}`,
                  }}
                >
                  <img
                    src={previewUrl}
                    alt="Receipt Preview"
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                  {/* スキャンラインアニメーション */}
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      height: "3px",
                      background: "linear-gradient(90deg, transparent, #C5A059, #FFF, #C5A059, transparent)",
                      boxShadow: "0 0 12px #C5A059",
                      animation: "arca-scan-line 1.8s infinite ease-in-out",
                    }}
                  />
                </div>
              ) : (
                <div
                  style={{
                    width: "64px",
                    height: "64px",
                    borderRadius: "50%",
                    background: C.goldFaint,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: C.goldDark,
                  }}
                >
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <path d="m9 12 2 2 4-4" />
                  </svg>
                </div>
              )}

              <div>
                <p style={{ fontSize: "0.95rem", fontWeight: 700, color: C.charcoal, margin: "0 0 0.3rem" }}>
                  レシートを解析中...
                </p>
                <p style={{ fontSize: "0.76rem", color: C.charcoalLight, margin: 0 }}>
                  印字された店舗名・品目・金額・外税を正確に抽出しています
                </p>
              </div>
            </div>
          ) : errorMessage ? (
            /* ── エラー画面 ── */
            <div
              style={{
                background: "rgba(192, 97, 74, 0.08)",
                border: "1px solid rgba(192, 97, 74, 0.2)",
                borderRadius: "12px",
                padding: "1.2rem",
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                gap: "0.8rem",
              }}
            >
              <p style={{ fontSize: "0.82rem", color: C.danger, margin: 0, lineHeight: 1.5 }}>
                {errorMessage}
              </p>
              <div style={{ display: "flex", justifyContent: "center", gap: "0.6rem" }}>
                <button
                  onClick={handleReset}
                  style={{
                    background: C.gold,
                    color: "#FFF",
                    border: "none",
                    borderRadius: "8px",
                    padding: "0.5rem 1.1rem",
                    fontSize: "0.78rem",
                    fontWeight: 650,
                    cursor: "pointer",
                  }}
                >
                  もう一度撮影する
                </button>
                <button
                  onClick={onClose}
                  style={{
                    background: "transparent",
                    border: "1px solid rgba(0,0,0,0.15)",
                    borderRadius: "8px",
                    padding: "0.5rem 0.9rem",
                    fontSize: "0.78rem",
                    color: C.charcoalMid,
                    cursor: "pointer",
                  }}
                >
                  閉じる
                </button>
              </div>
            </div>
          ) : (
            /* ── 通常起動メニュー（カメラ ＆ ライブラリ選択） ── */
            <div style={{ display: "flex", flexDirection: "column", gap: "0.8rem" }}>
              {/* iPhoneカメラ起動ボタン（最優先メインアクション） */}
              <button
                onClick={() => cameraInputRef.current?.click()}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-start",
                  gap: "1rem",
                  background: C.gold,
                  border: "none",
                  borderRadius: "14px",
                  padding: "1.1rem 1.4rem",
                  cursor: "pointer",
                  color: "#FDFCFA",
                  boxShadow: "0 4px 16px rgba(197, 160, 89, 0.35)",
                  transition: "transform 0.15s, box-shadow 0.15s",
                  textAlign: "left",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-1px)";
                  e.currentTarget.style.boxShadow = "0 6px 22px rgba(197, 160, 89, 0.45)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "0 4px 16px rgba(197, 160, 89, 0.35)";
                }}
              >
                <div
                  style={{
                    width: "44px",
                    height: "44px",
                    borderRadius: "10px",
                    background: "rgba(255, 255, 255, 0.2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                    <circle cx="12" cy="13" r="3" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: "0.95rem", fontWeight: 750, letterSpacing: "0.01em" }}>
                    カメラを起動して撮影
                  </div>
                  <div style={{ fontSize: "0.74rem", opacity: 0.9, marginTop: "0.15rem" }}>
                    ワンタップでiPhoneのカメラが直接起動します
                  </div>
                </div>
              </button>

              {/* 写真ライブラリから選択 */}
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-start",
                  gap: "1rem",
                  background: C.white,
                  border: "1px solid rgba(0, 0, 0, 0.08)",
                  borderRadius: "14px",
                  padding: "1rem 1.4rem",
                  cursor: "pointer",
                  color: C.charcoal,
                  boxShadow: "0 1px 4px rgba(0,0,0,0.03)",
                  transition: "background 0.15s",
                  textAlign: "left",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(0, 0, 0, 0.02)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = C.white;
                }}
              >
                <div
                  style={{
                    width: "44px",
                    height: "44px",
                    borderRadius: "10px",
                    background: C.goldFaint,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: C.goldDark,
                    flexShrink: 0,
                  }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                    <circle cx="9" cy="9" r="2" />
                    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: "0.9rem", fontWeight: 700, color: C.charcoal }}>
                    写真ライブラリから選択
                  </div>
                  <div style={{ fontSize: "0.74rem", color: C.charcoalLight, marginTop: "0.15rem" }}>
                    撮影済みのレシート写真から解析
                  </div>
                </div>
              </button>

              {/* 撮影のコツ */}
              <div
                style={{
                  background: "rgba(197, 160, 89, 0.08)",
                  border: `1px solid ${C.goldFaint3}`,
                  borderRadius: "12px",
                  padding: "0.9rem 1.1rem",
                  fontSize: "0.75rem",
                  color: C.charcoalMid,
                  lineHeight: 1.5,
                }}
              >
                <div style={{ fontWeight: 700, color: C.goldDark, marginBottom: "0.3rem", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                  <span>💡 レシート撮影のコツ</span>
                </div>
                <div>
                  「店名（一番上）」から「合計金額（外税・請求額）」までが全て入るように撮影してください。
                  <br />
                  <span style={{ color: C.charcoalLight, fontSize: "0.7rem" }}>
                    （※決済方法やレジ番号等の最下部は切れていてもOKです）
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
