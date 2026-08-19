/**
 * src/hooks/useUndoToast.ts
 * Arca — 共通 Undo トースト制御カスタムフック
 */

import { useState, useRef, useCallback } from "react";
import type { UndoToastState } from "../components/common/UndoToast";

const TOAST_DURATION = 5000;

export function useUndoToast<T>() {
  const [toast, setToast] = useState<UndoToastState<T>>({
    visible: false,
    leaving: false,
    message: "",
    item: null,
    remaining: 5,
  });

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onUndoCallbackRef = useRef<((item: T) => void | Promise<void>) | null>(null);

  const clearTimers = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
  }, []);

  const dismissToast = useCallback(() => {
    clearTimers();
    setToast((prev) => ({ ...prev, leaving: true }));
    leaveTimerRef.current = setTimeout(() => {
      setToast({
        visible: false,
        leaving: false,
        message: "",
        item: null,
        remaining: 5,
      });
    }, 200);
  }, [clearTimers]);

  const showUndoToast = useCallback(
    ({
      message,
      item,
      onUndo,
    }: {
      message: string;
      item: T;
      onUndo: (item: T) => void | Promise<void>;
    }) => {
      clearTimers();
      onUndoCallbackRef.current = onUndo;

      let rem = 5;
      countdownRef.current = setInterval(() => {
        rem--;
        setToast((prev) => ({ ...prev, remaining: Math.max(0, rem) }));
        if (rem <= 0 && countdownRef.current) {
          clearInterval(countdownRef.current);
        }
      }, 1000);

      timerRef.current = setTimeout(() => {
        if (countdownRef.current) clearInterval(countdownRef.current);
        setToast((prev) => ({ ...prev, leaving: true }));
        leaveTimerRef.current = setTimeout(() => {
          setToast({
            visible: false,
            leaving: false,
            message: "",
            item: null,
            remaining: 5,
          });
        }, 200);
      }, TOAST_DURATION);

      setToast({
        visible: true,
        leaving: false,
        message,
        item,
        remaining: 5,
      });
    },
    [clearTimers]
  );

  const showMessageToast = useCallback(
    (message: string) => {
      clearTimers();
      onUndoCallbackRef.current = null;

      let rem = 4;
      countdownRef.current = setInterval(() => {
        rem--;
        setToast((prev) => ({ ...prev, remaining: Math.max(0, rem) }));
        if (rem <= 0 && countdownRef.current) {
          clearInterval(countdownRef.current);
        }
      }, 1000);

      timerRef.current = setTimeout(() => {
        if (countdownRef.current) clearInterval(countdownRef.current);
        setToast((prev) => ({ ...prev, leaving: true }));
        leaveTimerRef.current = setTimeout(() => {
          setToast({
            visible: false,
            leaving: false,
            message: "",
            item: null,
            remaining: 5,
          });
        }, 200);
      }, 4000);

      setToast({
        visible: true,
        leaving: false,
        message,
        item: null,
        remaining: 4,
      });
    },
    [clearTimers]
  );

  const triggerUndo = useCallback(async () => {
    if (!toast.item || !onUndoCallbackRef.current) return;
    const currentItem = toast.item;
    dismissToast();
    await onUndoCallbackRef.current(currentItem);
  }, [toast.item, dismissToast]);

  return {
    toast,
    showUndoToast,
    showMessageToast,
    dismissToast,
    triggerUndo,
  };
}
