/**
 * src/test/gmailFinanceService.test.ts
 * Arca — Gmail クレジットカード利用速報メール解析 ＆ 下書き生成エンジンの単体テスト
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  parseCardNoticeEmail,
  fetchAndProcessCardNoticeEmails,
  decodeBase64Url,
  inferCategoryFromTitle,
} from "../services/gmailFinanceService";
import * as financeStorage from "../lib/financeStorage";
import type { ExpenseTransaction } from "../types/finance";

describe("gmailFinanceService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("ユーティリティ関数", () => {
    it("decodeBase64Url が base64url 文字列を正しく UTF-8 デコードする", () => {
      const original = "テスト文字列 12345";
      const base64 = btoa(unescape(encodeURIComponent(original)));
      const base64url = base64.replace(/\+/g, "-").replace(/\//g, "_");
      expect(decodeBase64Url(base64url)).toBe(original);
    });

    it("inferCategoryFromTitle が店名から適切にカテゴリを推論する", () => {
      expect(inferCategoryFromTitle("セブンイレブン")).toBe("食料品");
      expect(inferCategoryFromTitle("マツモトキヨシ")).toBe("日用品・消耗品");
      expect(inferCategoryFromTitle("モバイルSuica")).toBe("交通・移動");
      expect(inferCategoryFromTitle("Netflix")).toBe("サブスク・固定費");
      expect(inferCategoryFromTitle("未知の店舗")).toBe("その他");
    });
  });

  describe("メール本文パースロジック (parseCardNoticeEmail)", () => {
    it("三井住友 / Oliveカードの利用速報メールを正しくパースする", () => {
      const subject = "【三井住友カード】カードご利用のお知らせ";
      const from = "mail@contact.vpass.ne.jp";
      const body = `
いつも三井住友カードをご利用いただきありがとうございます。

◇ご利用日時：2026/08/30 14:25
◇ご利用先：セブンイレブン
◇ご利用金額：1,250円
◇お支払区分：1回払い

※本メールは利用速報です。
      `;

      const result = parseCardNoticeEmail("msg-smbc-1", subject, from, body);

      expect(result).not.toBeNull();
      expect(result?.date).toBe("2026-08-30");
      expect(result?.title).toBe("セブンイレブン");
      expect(result?.totalAmount).toBe(1250);
      expect(result?.paymentMethod).toBe("Oliveカード");
      expect(result?.category).toBe("食料品");
    });

    it("dカードの利用速報メールを正しくパースする", () => {
      const subject = "【ｄカード】カードご利用速報について";
      const from = "info@dcard.docomo.ne.jp";
      const body = `
dカードをご利用いただきありがとうございます。

■ご利用日：2026/08/29
■ご利用先など：マツモトキヨシ
■ご利用金額：2,840円
      `;

      const result = parseCardNoticeEmail("msg-dcard-1", subject, from, body);

      expect(result).not.toBeNull();
      expect(result?.date).toBe("2026-08-29");
      expect(result?.title).toBe("マツモトキヨシ");
      expect(result?.totalAmount).toBe(2840);
      expect(result?.paymentMethod).toBe("dカード");
      expect(result?.category).toBe("日用品・消耗品");
    });

    it("イオンカードの利用速報メールを正しくパースする", () => {
      const subject = "カードご利用確認メール";
      const from = "information@aeon.co.jp";
      const body = `
イオンカードをご利用いただきありがとうございます。

利用日：2026/08/28
利用加盟店：イオンモール
利用金額：4,980円
      `;

      const result = parseCardNoticeEmail("msg-aeon-1", subject, from, body);

      expect(result).not.toBeNull();
      expect(result?.date).toBe("2026-08-28");
      expect(result?.title).toBe("イオンモール");
      expect(result?.totalAmount).toBe(4980);
      expect(result?.paymentMethod).toBe("イオンカード");
      expect(result?.category).toBe("食料品");
    });

    it("Viewカードの利用速報メールを正しくパースする", () => {
      const subject = "【ビューカード】ご利用のお知らせ";
      const from = "info@viewsnet.jp";
      const body = `
ビューカードのご利用内容をお知らせいたします。

利用日：2026/08/27
ご利用先：モバイルSuica
ご利用金額：3,000円
      `;

      const result = parseCardNoticeEmail("msg-view-1", subject, from, body);

      expect(result).not.toBeNull();
      expect(result?.date).toBe("2026-08-27");
      expect(result?.title).toBe("モバイルSuica");
      expect(result?.totalAmount).toBe(3000);
      expect(result?.paymentMethod).toBe("交通系IC");
      expect(result?.category).toBe("交通・移動");
    });

    it("無関係なメールは null を返す", () => {
      const subject = "Amazonのご注文確認";
      const from = "order-update@amazon.co.jp";
      const body = "ご注文ありがとうございます。合計: 1,500円";

      const result = parseCardNoticeEmail("msg-other-1", subject, from, body);
      expect(result).toBeNull();
    });
  });

  describe("重複排除・バインド & 下書き作成 (fetchAndProcessCardNoticeEmails)", () => {
    const mockExistingTxs: ExpenseTransaction[] = [
      {
        id: "tx-existing-1",
        date: "2026-08-30",
        title: "セブンイレブン",
        totalAmount: 1250,
        category: "食料品",
        paymentMethod: "Oliveカード",
        items: [],
        isReconciled: false,
        createdAt: "2026-08-30T10:00:00Z",
        updatedAt: "2026-08-30T10:00:00Z",
        isDeleted: false,
      },
      {
        id: "tx-already-imported",
        date: "2026-08-29",
        title: "マツモトキヨシ",
        totalAmount: 2840,
        category: "日用品・消耗品",
        paymentMethod: "dカード",
        items: [],
        isReconciled: false,
        emailMessageId: "msg-dcard-already",
        createdAt: "2026-08-29T10:00:00Z",
        updatedAt: "2026-08-29T10:00:00Z",
        isDeleted: false,
      },
    ];

    it("同一 messageId のメールが二重に取り込まれない（冪等性）", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(async (url: string) => {
          if (url.includes("/messages?")) {
            return {
              ok: true,
              json: async () => ({ messages: [{ id: "msg-dcard-already" }] }),
            };
          }
          return { ok: false };
        })
      );

      const createSpy = vi.spyOn(financeStorage, "createExpenseTransaction");
      const updateSpy = vi.spyOn(financeStorage, "updateExpenseTransaction");

      const res = await fetchAndProcessCardNoticeEmails("fake-token", mockExistingTxs);

      expect(res.skippedCount).toBe(1);
      expect(res.createdCount).toBe(0);
      expect(res.linkedCount).toBe(0);
      expect(createSpy).not.toHaveBeenCalled();
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it("同日・同額・同カードの既存未突合レコードがある場合、新規作成せず既存レコードに紐付けのみ行う", async () => {
      const emailBody = `
◇ご利用日時：2026/08/30 14:25
◇ご利用先：セブンイレブン
◇ご利用金額：1,250円
      `;
      const base64Body = btoa(unescape(encodeURIComponent(emailBody)));

      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(async (url: string) => {
          if (url.includes("/messages?")) {
            return {
              ok: true,
              json: async () => ({ messages: [{ id: "msg-new-smbc" }] }),
            };
          }
          if (url.includes("/messages/msg-new-smbc")) {
            return {
              ok: true,
              json: async () => ({
                id: "msg-new-smbc",
                payload: {
                  headers: [
                    { name: "Subject", value: "【三井住友カード】カードご利用のお知らせ" },
                    { name: "From", value: "mail@contact.vpass.ne.jp" },
                  ],
                  body: { data: base64Body },
                },
              }),
            };
          }
          return { ok: false };
        })
      );

      const createSpy = vi.spyOn(financeStorage, "createExpenseTransaction");
      const updateSpy = vi.spyOn(financeStorage, "updateExpenseTransaction").mockResolvedValue(undefined as any);

      const res = await fetchAndProcessCardNoticeEmails("fake-token", mockExistingTxs);

      expect(res.createdCount).toBe(0);
      expect(res.linkedCount).toBe(1);
      expect(createSpy).not.toHaveBeenCalled();
      expect(updateSpy).toHaveBeenCalledWith(
        "tx-existing-1",
        expect.objectContaining({
          emailMessageId: "msg-new-smbc",
        })
      );
    });

    it("一致する既存レコードがない場合、新規下書きレコードを作成する", async () => {
      const emailBody = `
利用日：2026/08/28
利用加盟店：イオンモール
利用金額：4,980円
      `;
      const base64Body = btoa(unescape(encodeURIComponent(emailBody)));

      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(async (url: string) => {
          if (url.includes("/messages?")) {
            return {
              ok: true,
              json: async () => ({ messages: [{ id: "msg-new-aeon" }] }),
            };
          }
          if (url.includes("/messages/msg-new-aeon")) {
            return {
              ok: true,
              json: async () => ({
                id: "msg-new-aeon",
                payload: {
                  headers: [
                    { name: "Subject", value: "カードご利用確認メール" },
                    { name: "From", value: "information@aeon.co.jp" },
                  ],
                  body: { data: base64Body },
                },
              }),
            };
          }
          return { ok: false };
        })
      );

      const createSpy = vi.spyOn(financeStorage, "createExpenseTransaction").mockResolvedValue("new-id");

      const res = await fetchAndProcessCardNoticeEmails("fake-token", mockExistingTxs);

      expect(res.createdCount).toBe(1);
      expect(res.linkedCount).toBe(0);
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          date: "2026-08-28",
          title: "イオンモール",
          totalAmount: 4980,
          paymentMethod: "イオンカード",
          emailMessageId: "msg-new-aeon",
          source: "email_notice",
        })
      );
    });
  });
});
