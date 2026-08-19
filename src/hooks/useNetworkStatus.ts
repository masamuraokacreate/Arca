/**
 * src/hooks/useNetworkStatus.ts
 * ネットワーク接続状態監視カスタムフック
 *
 * navigator.onLine および online/offline イベントを購読し、
 * リアルタイムの接続状態（isOnline）を返却する。
 */

import { useState, useEffect } from "react";

export function useNetworkStatus(): { isOnline: boolean } {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== "undefined" && typeof navigator.onLine === "boolean"
      ? navigator.onLine
      : true;
  });

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return { isOnline };
}
