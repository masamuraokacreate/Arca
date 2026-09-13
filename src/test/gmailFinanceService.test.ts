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
  mergeExpenseTransactions,
  cleanupDuplicateExpenses,
  buildGmailCardNoticeQuery,
} from "../services/gmailFinanceService";
import * as financeStorage from "../lib/financeStorage";
import type { ExpenseTransaction } from "../types/finance";

describe("gmailFinanceService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("ユーティリティ関数", () => {
    it("buildGmailCardNoticeQuery が指定日数に応じた newer_than クエリを正しく生成する", () => {
      expect(buildGmailCardNoticeQuery()).toContain("newer_than:30d");
      expect(buildGmailCardNoticeQuery(60)).toContain("newer_than:60d");
      expect(buildGmailCardNoticeQuery(14)).toContain("newer_than:14d");
    });

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

    it("三井住友 / Oliveカードのブロック形式速報メール（ご利用のお知らせ【三井住友カード】）を正しくパースする", () => {
      const subject = "ご利用のお知らせ【三井住友カード】";
      const from = "statement@vpass.ne.jp";
      const body = `
Muraoka Masato 様
いつも三井住友カードをご利用いただきありがとうございます。
Ｏｌｉｖｅ ゴールド／クレジットについてカードの利用内容をお知らせします。
ご利用内容
ご利用日時：2026/09/10 04:38
ファミリーマート（買物）
397円
本メールはカードご利用の承認照会に基づく通知であり、カードのご利用及びご請求を確定するものではございません。
ご利用情報が明細に反映するまでにはお日にちがかかる場合がございます。
身に覚えのない利用通知が届いた場合は、以下をご確認ください。
      `;

      const result = parseCardNoticeEmail("msg-smbc-olive-1", subject, from, body);

      expect(result).not.toBeNull();
      expect(result?.date).toBe("2026-09-10");
      expect(result?.title).toBe("ファミリーマート");
      expect(result?.totalAmount).toBe(397);
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

    it("同日・同額・同カードの既存未突合レコードがあっても、emailMessageId が新規であれば正当な別決済として新規作成される", async () => {
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

      const createSpy = vi.spyOn(financeStorage, "createExpenseTransaction").mockResolvedValue("new-created-id");

      const res = await fetchAndProcessCardNoticeEmails("fake-token", mockExistingTxs);

      // 同日・同額・同カードであっても、異なるメールであれば新規取引として正常に取り込まれる
      expect(res.createdCount).toBe(1);
      expect(res.linkedCount).toBe(0);
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          emailMessageId: "msg-new-smbc",
          totalAmount: 1250,
          paymentMethod: "Oliveカード",
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

    it("同日に同額（例: 500円）の別決済があった場合でも、別々のメールであれば2件とも正常に取り込まれる", async () => {
      const emailBody1 = `
Muraoka Masato 様
いつも三井住友カードをご利用いただきありがとうございます。
ご利用内容
ご利用日時：2026/09/10 10:00
マクドナルド
500円
      `;
      const emailBody2 = `
Muraoka Masato 様
いつも三井住友カードをご利用いただきありがとうございます。
ご利用内容
ご利用日時：2026/09/10 15:00
セブンイレブン
500円
      `;

      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(async (url: string) => {
          if (url.includes("/messages?")) {
            return {
              ok: true,
              json: async () => ({ messages: [{ id: "msg-same-1" }, { id: "msg-same-2" }] }),
            };
          }
          if (url.includes("/messages/msg-same-1")) {
            return {
              ok: true,
              json: async () => ({
                id: "msg-same-1",
                payload: {
                  headers: [
                    { name: "Subject", value: "ご利用のお知らせ【三井住友カード】" },
                    { name: "From", value: "statement@vpass.ne.jp" },
                  ],
                  body: { data: btoa(unescape(encodeURIComponent(emailBody1))) },
                },
              }),
            };
          }
          if (url.includes("/messages/msg-same-2")) {
            return {
              ok: true,
              json: async () => ({
                id: "msg-same-2",
                payload: {
                  headers: [
                    { name: "Subject", value: "ご利用のお知らせ【三井住友カード】" },
                    { name: "From", value: "statement@vpass.ne.jp" },
                  ],
                  body: { data: btoa(unescape(encodeURIComponent(emailBody2))) },
                },
              }),
            };
          }
          return { ok: false };
        })
      );

      const createdList: any[] = [];
      vi.spyOn(financeStorage, "createExpenseTransaction").mockImplementation(async (data) => {
        createdList.push(data);
        return `tx-${createdList.length}`;
      });

      const res = await fetchAndProcessCardNoticeEmails("fake-token", []);

      expect(res.createdCount).toBe(2);
      expect(res.skippedCount).toBe(0);
      expect(createdList).toHaveLength(2);
      expect(createdList[0].title).toBe("マクドナルド");
      expect(createdList[0].totalAmount).toBe(500);
      expect(createdList[1].title).toBe("セブンイレブン");
      expect(createdList[1].totalAmount).toBe(500);
    });

    it("mergeExpenseTransactions でレシートOCRとメール速報を手動マージし、itemsが保持され確定ステータスになる", async () => {
      const targetTx: ExpenseTransaction = {
        id: "tx-ocr-target",
        date: "2026-09-10",
        title: "ヤオコー MARKETPLACE",
        totalAmount: 7221,
        category: "食料品",
        paymentMethod: "現金",
        items: [
          { id: "it-1", name: "牛乳", amount: 220, category: "食料品" },
          { id: "it-2", name: "お肉", amount: 7001, category: "食料品" },
        ],
        isReconciled: false,
        source: "ocr",
        createdAt: "2026-09-10T10:00:00Z",
        updatedAt: "2026-09-10T10:00:00Z",
      };

      const sourceTx: ExpenseTransaction = {
        id: "tx-email-source",
        date: "2026-09-10",
        title: "ヤオコー",
        totalAmount: 7221,
        category: "食料品",
        paymentMethod: "Oliveカード",
        items: [],
        isReconciled: false,
        emailMessageId: "msg-email-123",
        source: "email_notice",
        createdAt: "2026-09-10T12:00:00Z",
        updatedAt: "2026-09-10T12:00:00Z",
      };

      const updateSpy = vi.spyOn(financeStorage, "updateExpenseTransaction").mockResolvedValue();
      const deleteSpy = vi.spyOn(financeStorage, "deleteExpenseTransaction").mockResolvedValue();

      const merged = await mergeExpenseTransactions(targetTx, sourceTx);

      expect(merged.isReconciled).toBe(true);
      expect(merged.items.length).toBe(2);
      expect(merged.items[0].name).toBe("牛乳");
      expect(merged.paymentMethod).toBe("Oliveカード");
      expect(merged.emailMessageId).toBe("msg-email-123");

      expect(updateSpy).toHaveBeenCalledWith(
        "tx-ocr-target",
        expect.objectContaining({
          isReconciled: true,
          items: expect.arrayContaining([expect.objectContaining({ name: "牛乳" })]),
          paymentMethod: "Oliveカード",
          emailMessageId: "msg-email-123",
        })
      );
      expect(deleteSpy).toHaveBeenCalledWith("tx-email-source");
    });

    it("既存の速報メールと同日・同額であっても、異なる emailMessageId の新規メールであれば正常に取り込まれる", async () => {
      const existingEmailTx: ExpenseTransaction = {
        id: "tx-existing-notice",
        date: "2026-09-10",
        title: "ファミリーマート",
        totalAmount: 397,
        category: "食料品",
        paymentMethod: "Oliveカード",
        items: [],
        isReconciled: false,
        source: "email_notice",
        emailMessageId: "msg-prev-id",
        createdAt: "2026-09-10T05:00:00Z",
        updatedAt: "2026-09-10T05:00:00Z",
      };

      const emailBody = `
Muraoka Masato 様
いつも三井住友カードをご利用いただきありがとうございます。
Ｏｌｉｖｅ ゴールド／クレジットについてカードの利用内容をお知らせします。
ご利用内容
ご利用日時：2026/09/10 08:30
ファミリーマート（買物）
397円
      `;
      const base64Body = btoa(unescape(encodeURIComponent(emailBody)));

      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(async (url: string) => {
          if (url.includes("/messages?")) {
            return {
              ok: true,
              json: async () => ({ messages: [{ id: "msg-new-different-id" }] }),
            };
          }
          if (url.includes("/messages/msg-new-different-id")) {
            return {
              ok: true,
              json: async () => ({
                id: "msg-new-different-id",
                payload: {
                  headers: [
                    { name: "Subject", value: "ご利用のお知らせ【三井住友カード】" },
                    { name: "From", value: "statement@vpass.ne.jp" },
                  ],
                  body: { data: base64Body },
                },
              }),
            };
          }
          return { ok: false };
        })
      );

      const createSpy = vi.spyOn(financeStorage, "createExpenseTransaction").mockResolvedValue("created-new-tx");

      const res = await fetchAndProcessCardNoticeEmails("fake-token", [existingEmailTx]);

      expect(res.createdCount).toBe(1);
      expect(res.skippedCount).toBe(0);
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          date: "2026-09-10",
          totalAmount: 397,
          emailMessageId: "msg-new-different-id",
        })
      );
    });

    it("同一バッチ内で同じ emailMessageId が複数届いた場合、2通目以降の二重作成が防止される", async () => {
      const emailBody = `
Muraoka Masato 様
いつも三井住友カードをご利用いただきありがとうございます。
ご利用内容
ご利用日時：2026/09/10 04:38
ファミリーマート（買物）
397円
      `;
      const base64Body = btoa(unescape(encodeURIComponent(emailBody)));

      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(async (url: string) => {
          if (url.includes("/messages?")) {
            return {
              ok: true,
              json: async () => ({
                messages: [{ id: "batch-msg-same" }, { id: "batch-msg-same" }],
              }),
            };
          }
          if (url.includes("/messages/batch-msg-same")) {
            return {
              ok: true,
              json: async () => ({
                id: "batch-msg-same",
                payload: {
                  headers: [
                    { name: "Subject", value: "ご利用のお知らせ【三井住友カード】" },
                    { name: "From", value: "statement@vpass.ne.jp" },
                  ],
                  body: { data: base64Body },
                },
              }),
            };
          }
          return { ok: false };
        })
      );

      const createSpy = vi
        .spyOn(financeStorage, "createExpenseTransaction")
        .mockResolvedValue("created-batch-tx-1");

      const res = await fetchAndProcessCardNoticeEmails("fake-token", []);

      expect(res.createdCount).toBe(1);
      expect(res.skippedCount).toBe(1);
      expect(createSpy).toHaveBeenCalledTimes(1);
    });

    it("手動入力取引と同日・同額であっても、emailMessageId が未登録であれば新規決済として正常に取り込まれる", async () => {
      const manualLunchTx: ExpenseTransaction = {
        id: "tx-manual-lunch",
        date: "2026-09-10",
        title: "お昼ごはん",
        totalAmount: 397,
        category: "食料品",
        paymentMethod: "現金",
        items: [{ id: "it-onigiri", name: "おにぎり", amount: 397, category: "食料品" }],
        isReconciled: false,
        createdAt: "2026-09-10T12:00:00Z",
        updatedAt: "2026-09-10T12:00:00Z",
      };

      const emailBody = `
Muraoka Masato 様
いつも三井住友カードをご利用いただきありがとうございます。
ご利用内容
ご利用日時：2026/09/10 04:38
ファミリーマート（買物）
397円
      `;
      const base64Body = btoa(unescape(encodeURIComponent(emailBody)));

      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(async (url: string) => {
          if (url.includes("/messages?")) {
            return {
              ok: true,
              json: async () => ({ messages: [{ id: "msg-lunch-smbc" }] }),
            };
          }
          if (url.includes("/messages/msg-lunch-smbc")) {
            return {
              ok: true,
              json: async () => ({
                id: "msg-lunch-smbc",
                payload: {
                  headers: [
                    { name: "Subject", value: "ご利用のお知らせ【三井住友カード】" },
                    { name: "From", value: "statement@vpass.ne.jp" },
                  ],
                  body: { data: base64Body },
                },
              }),
            };
          }
          return { ok: false };
        })
      );

      const createSpy = vi.spyOn(financeStorage, "createExpenseTransaction").mockResolvedValue("new-tx-from-mail");

      const res = await fetchAndProcessCardNoticeEmails("fake-token", [manualLunchTx]);

      // 同日・同額の手動取引があっても、別決済として新規作成される
      expect(res.createdCount).toBe(1);
      expect(res.linkedCount).toBe(0);
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          emailMessageId: "msg-lunch-smbc",
          totalAmount: 397,
          title: "ファミリーマート",
        })
      );
    });

    it("確定済み（確認済み）レコードと同日・同額であっても、emailMessageId が未登録であれば新規決済として正常に取り込まれる", async () => {
      const reconciledTx: ExpenseTransaction = {
        id: "tx-reconciled",
        date: "2026-09-10",
        title: "ファミリーマート",
        totalAmount: 397,
        category: "食料品",
        paymentMethod: "Oliveカード",
        items: [],
        isReconciled: true,
        createdAt: "2026-09-10T12:00:00Z",
        updatedAt: "2026-09-10T12:00:00Z",
      };

      const emailBody = `
Muraoka Masato 様
ご利用内容
ご利用日時：2026/09/10 04:38
ファミリーマート（買物）
397円
      `;
      const base64Body = btoa(unescape(encodeURIComponent(emailBody)));

      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(async (url: string) => {
          if (url.includes("/messages?")) {
            return {
              ok: true,
              json: async () => ({ messages: [{ id: "msg-reconciled-smbc" }] }),
            };
          }
          if (url.includes("/messages/msg-reconciled-smbc")) {
            return {
              ok: true,
              json: async () => ({
                id: "msg-reconciled-smbc",
                payload: {
                  headers: [
                    { name: "Subject", value: "ご利用のお知らせ【三井住友カード】" },
                    { name: "From", value: "statement@vpass.ne.jp" },
                  ],
                  body: { data: base64Body },
                },
              }),
            };
          }
          return { ok: false };
        })
      );

      const createSpy = vi.spyOn(financeStorage, "createExpenseTransaction").mockResolvedValue("created-new-tx-rec");

      const res = await fetchAndProcessCardNoticeEmails("fake-token", [reconciledTx]);

      expect(res.createdCount).toBe(1);
      expect(res.skippedCount).toBe(0);
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          emailMessageId: "msg-reconciled-smbc",
          totalAmount: 397,
        })
      );
    });

    it("論理削除された取引のmessageIdも再取り込みから除外され、ゾンビ作成されない", async () => {
      const deletedTx: ExpenseTransaction = {
        id: "tx-deleted-1",
        date: "2026-09-10",
        title: "不要な速報メール",
        totalAmount: 500,
        category: "食料品",
        paymentMethod: "Oliveカード",
        items: [],
        isReconciled: false,
        isDeleted: true, // 削除済み
        emailMessageId: "msg-already-deleted-1",
        createdAt: "2026-09-10T12:00:00Z",
        updatedAt: "2026-09-10T12:00:00Z",
      };

      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(async (url: string) => {
          if (url.includes("/messages?")) {
            return {
              ok: true,
              json: async () => ({ messages: [{ id: "msg-already-deleted-1" }] }),
            };
          }
          return { ok: false };
        })
      );

      const createSpy = vi.spyOn(financeStorage, "createExpenseTransaction");

      const res = await fetchAndProcessCardNoticeEmails("fake-token", [deletedTx]);

      expect(res.createdCount).toBe(0);
      expect(res.skippedCount).toBe(1);
      expect(createSpy).not.toHaveBeenCalled();
    });

    it("同一メール取得処理を連続で何度呼び出しても件数が増殖せずスキップされる（冪等性の保証）", async () => {
      const emailBody = `
いつも三井住友カードをご利用いただきありがとうございます。
◇ご利用日時：2026/09/12 10:00
◇ご利用先：バーガーキング
◇ご利用金額：1,080円
◇お支払区分：1回払い
      `;

      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(async (url: string) => {
          if (url.includes("/messages?")) {
            return {
              ok: true,
              json: async () => ({ messages: [{ id: "msg-burgerking-dup" }] }),
            };
          }
          if (url.includes("/messages/msg-burgerking-dup")) {
            return {
              ok: true,
              json: async () => ({
                id: "msg-burgerking-dup",
                snippet: "バーガーキング 1,080円",
                payload: {
                  headers: [
                    { name: "Subject", value: "【三井住友カード】カードご利用のお知らせ" },
                    { name: "From", value: "mail@contact.vpass.ne.jp" },
                  ],
                  body: { data: btoa(unescape(encodeURIComponent(emailBody))) },
                },
              }),
            };
          }
          return { ok: false };
        })
      );

      const createdList: ExpenseTransaction[] = [];
      vi.spyOn(financeStorage, "createExpenseTransaction").mockImplementation(async (data) => {
        const newTx: ExpenseTransaction = { id: `tx-${Date.now()}-${Math.random()}`, ...data };
        createdList.push(newTx);
        return newTx.id;
      });

      // 1回目の実行: 1件作成される
      const res1 = await fetchAndProcessCardNoticeEmails("fake-token", []);
      expect(res1.createdCount).toBe(1);
      expect(res1.skippedCount).toBe(0);
      expect(createdList).toHaveLength(1);

      // 2回目の実行（同じ既存リストを渡す）: 新規作成されずスキップされる
      const res2 = await fetchAndProcessCardNoticeEmails("fake-token", createdList);
      expect(res2.createdCount).toBe(0);
      expect(res2.skippedCount).toBe(1);
      expect(createdList).toHaveLength(1); // 増殖しない

      // 3回目の実行: 再びスキップされる
      const res3 = await fetchAndProcessCardNoticeEmails("fake-token", createdList);
      expect(res3.createdCount).toBe(0);
      expect(res3.skippedCount).toBe(1);
      expect(createdList).toHaveLength(1); // 増殖しない
    });
  });

  describe("cleanupDuplicateExpenses (重複レコードの一括クリーンアップ)", () => {
    it("同一の emailMessageId を持つドキュメントのうち、最古の1件を残し2件目以降を削除する", async () => {
      const duplicates: ExpenseTransaction[] = [
        {
          id: "tx-older",
          date: "2026-09-10",
          title: "ヤオコー",
          totalAmount: 2500,
          category: "食料品",
          paymentMethod: "Oliveカード",
          items: [],
          isReconciled: false,
          isDeleted: false,
          emailMessageId: "1a072c0318d482d8",
          createdAt: "2026-09-10T10:00:00.000Z", // より古い
          updatedAt: "2026-09-10T10:00:00.000Z",
        },
        {
          id: "tx-newer",
          date: "2026-09-10",
          title: "ヤオコー",
          totalAmount: 2500,
          category: "食料品",
          paymentMethod: "Oliveカード",
          items: [],
          isReconciled: false,
          isDeleted: false,
          emailMessageId: "1a072c0318d482d8", // 同じ emailMessageId
          createdAt: "2026-09-10T10:05:00.000Z", // より新しい
          updatedAt: "2026-09-10T10:05:00.000Z",
        },
        {
          id: "tx-unique",
          date: "2026-09-11",
          title: "ファミリーマート",
          totalAmount: 450,
          category: "食料品",
          paymentMethod: "Oliveカード",
          items: [],
          isReconciled: false,
          isDeleted: false,
          emailMessageId: "unique-email-msg-999",
          createdAt: "2026-09-11T08:00:00.000Z",
          updatedAt: "2026-09-11T08:00:00.000Z",
        },
        {
          id: "tx-manual",
          date: "2026-09-11",
          title: "手動入力の現金出費",
          totalAmount: 800,
          category: "食料品",
          paymentMethod: "現金",
          items: [],
          isReconciled: false,
          isDeleted: false,
          createdAt: "2026-09-11T12:00:00.000Z",
          updatedAt: "2026-09-11T12:00:00.000Z",
        },
      ];

      const res = await cleanupDuplicateExpenses(duplicates);

      expect(res.deletedCount).toBe(1);
      expect(res.duplicateIds).toEqual(["tx-newer"]);
    });

    it("重複が存在しない場合は deletedCount 0 で空配列を返す", async () => {
      const nonDuplicates: ExpenseTransaction[] = [
        {
          id: "tx-1",
          date: "2026-09-10",
          title: "A店",
          totalAmount: 1000,
          category: "食料品",
          paymentMethod: "Oliveカード",
          items: [],
          isReconciled: false,
          isDeleted: false,
          emailMessageId: "msg-1",
          createdAt: "2026-09-10T10:00:00Z",
          updatedAt: "2026-09-10T10:00:00Z",
        },
        {
          id: "tx-2",
          date: "2026-09-11",
          title: "B店",
          totalAmount: 2000,
          category: "日用品・消耗品",
          paymentMethod: "Oliveカード",
          items: [],
          isReconciled: false,
          isDeleted: false,
          emailMessageId: "msg-2",
          createdAt: "2026-09-11T10:00:00Z",
          updatedAt: "2026-09-11T10:00:00Z",
        },
      ];

      const res = await cleanupDuplicateExpenses(nonDuplicates);

      expect(res.deletedCount).toBe(0);
      expect(res.duplicateIds).toEqual([]);
    });
  });
});
