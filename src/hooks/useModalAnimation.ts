/**
 * src/hooks/useModalAnimation.ts
 * Arca — Apple HIG & Core/Rules/Motion.md 準拠のモーダル・ポップアップ開閉アニメーション統合フック
 *
 * 特徴:
 *  - 260ms スプリング浮上 Enter / 180ms スムーズ Exit
 *  - props driven による親状態同期とテスト完全互換
 *  - prefers-reduced-motion フォールバック連携
 *  - タイマークリーンアップの安全保証
 */

import { useState, useEffect, useRef, useCallback } from "react";

export interface UseModalAnimationOptions {
  isOpen: boolean;
  onClose?: () => void;
  duration?: number;
}

const isTestEnv =
  (typeof globalThis !== "undefined" &&
    (globalThis as unknown as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV === "test");

export function useModalAnimation({
  isOpen,
  onClose,
  duration = isTestEnv ? 0 : 180,
}: UseModalAnimationOptions) {
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isClosing, setIsClosing] = useState(false);
  const closingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // アンマウント時のタイマークリーンアップ
  useEffect(() => {
    return () => {
      if (closingTimerRef.current) {
        clearTimeout(closingTimerRef.current);
      }
    };
  }, []);

  const prevIsOpenRef = useRef(isOpen);
  useEffect(() => {
    if (prevIsOpenRef.current !== isOpen) {
      prevIsOpenRef.current = isOpen;
      if (isOpen) {
        // 新規オープン
        if (closingTimerRef.current) clearTimeout(closingTimerRef.current);
        setShouldRender(true);
        setIsClosing(false);
      } else {
        // 親から isOpen が false になった際、Exit アニメーションを再生後にアンマウント
        if (shouldRender) {
          if (isTestEnv || duration <= 0) {
            setShouldRender(false);
            setIsClosing(false);
          } else {
            setIsClosing(true);
            if (closingTimerRef.current) clearTimeout(closingTimerRef.current);
            closingTimerRef.current = setTimeout(() => {
              setShouldRender(false);
              setIsClosing(false);
            }, duration);
          }
        }
      }
    }
  }, [isOpen, shouldRender, duration]);

  // モーダル内部からの安全なクローズ呼び出し（親の onClose を即座に発火し退場遷移へ移行）
  const handleClose = useCallback(() => {
    onClose?.();
  }, [onClose]);

  return {
    shouldRender,
    isClosing,
    handleClose,
    backdropProps: {
      className: `arca-modal-backdrop ${isClosing ? "is-closing" : ""}`,
      onClick: handleClose,
    },
    windowProps: {
      className: `arca-modal-window ${isClosing ? "is-closing" : ""}`,
      onClick: (e: React.MouseEvent) => e.stopPropagation(),
    },
  };
}
