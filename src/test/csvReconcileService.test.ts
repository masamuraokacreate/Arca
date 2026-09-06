/**
 * src/test/csvReconcileService.test.ts
 * Arca — Finance 月次×カード別 CSV照合ステータスサービスの単体テスト
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getMonthlyReconcileStatusId,
  setMonthlyCardReconcileStatus,
  markMonthCardReconciled,
  toggleMonthlyCardReconcile,
} from "../services/csvReconcileService";
import * as firestore from "firebase/firestore";

describe("csvReconcileService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getMonthlyReconcileStatusId が月度と支払方法から正しいIDを生成する", () => {
    const id1 = getMonthlyReconcileStatusId("2026-05", "Oliveカード");
    expect(id1).toBe("2026-05_Oliveカード");

    const id2 = getMonthlyReconcileStatusId("2026-08", "dカード");
    expect(id2).toBe("2026-08_dカード");
  });

  it("setMonthlyCardReconcileStatus が Firestore setDoc を正しく呼び出す", async () => {
    const setDocSpy = vi.spyOn(firestore, "setDoc").mockResolvedValue(undefined as any);

    await setMonthlyCardReconcileStatus({
      month: "2026-05",
      paymentMethod: "Oliveカード",
      isReconciled: true,
      matchedCount: 12,
    });

    expect(setDocSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        month: "2026-05",
        paymentMethod: "Oliveカード",
        isReconciled: true,
        matchedCount: 12,
      }),
      { merge: true }
    );
  });

  it("markMonthCardReconciled が isReconciled=true で保存する", async () => {
    const setDocSpy = vi.spyOn(firestore, "setDoc").mockResolvedValue(undefined as any);

    await markMonthCardReconciled("2026-05", "イオンカード", 5);

    expect(setDocSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        month: "2026-05",
        paymentMethod: "イオンカード",
        isReconciled: true,
        matchedCount: 5,
      }),
      { merge: true }
    );
  });

  it("toggleMonthlyCardReconcile がステータスを反転して保存する", async () => {
    const setDocSpy = vi.spyOn(firestore, "setDoc").mockResolvedValue(undefined as any);

    // 未照合(false) -> 照合済(true)
    await toggleMonthlyCardReconcile("2026-05", "Oliveカード", false);
    expect(setDocSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        month: "2026-05",
        paymentMethod: "Oliveカード",
        isReconciled: true,
      }),
      { merge: true }
    );

    // 照合済(true) -> 未照合(false)
    await toggleMonthlyCardReconcile("2026-05", "Oliveカード", true);
    expect(setDocSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        month: "2026-05",
        paymentMethod: "Oliveカード",
        isReconciled: false,
      }),
      { merge: true }
    );
  });
});
