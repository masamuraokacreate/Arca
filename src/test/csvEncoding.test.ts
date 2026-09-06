/**
 * src/test/csvEncoding.test.ts
 * Arca — CSV エンコーディング自動判定 (UTF-8 / Shift-JIS) の単体テスト
 */

import { describe, it, expect } from "vitest";
import {
  decodeCsvBuffer,
  parseCreditCardCsv,
} from "../utils/csvReconcile";

describe("CSV エンコーディング自動判別デコーダー (decodeCsvBuffer)", () => {
  it("UTF-8 形式の CSV テキストを正しくデコード・パースできる", () => {
    const utf8Csv = "利用日,利用店名,利用金額\n2026/08/10,セブンイレブン,1250\n2026/08/11,マツモトキヨシ,2840";
    const encoder = new TextEncoder();
    const buffer = encoder.encode(utf8Csv);

    const decoded = decodeCsvBuffer(buffer);
    expect(decoded).toBe(utf8Csv);

    const parsed = parseCreditCardCsv(decoded);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0].title).toBe("セブンイレブン");
    expect(parsed.rows[0].amount).toBe(1250);
    expect(parsed.rows[1].title).toBe("マツモトキヨシ");
    expect(parsed.rows[1].amount).toBe(2840);
  });

  it("UTF-8 (BOM付き) 形式の CSV を正しくデコードし、BOM を除去する", () => {
    const rawCsv = "利用日,利用店名,利用金額\n2026/08/15,イオンモール,5400";
    const encoder = new TextEncoder();
    const contentBytes = encoder.encode(rawCsv);
    // BOM: EF BB BF
    const bomBytes = new Uint8Array([0xef, 0xbb, 0xbf, ...contentBytes]);

    const decoded = decodeCsvBuffer(bomBytes);
    expect(decoded.startsWith("利用日")).toBe(true);
    expect(decoded).toBe(rawCsv);

    const parsed = parseCreditCardCsv(decoded);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].title).toBe("イオンモール");
    expect(parsed.rows[0].amount).toBe(5400);
  });

  it("Shift-JIS (CP932) 形式のバイト列を文字化けなく正常にデコードできる", () => {
    // Shift-JIS バイト列: "利用日,利用店名,利用金額\n2026/08/10,セブンイレブン,1250\n"
    const sjisBytes = new Uint8Array([
      // 利 (0x97, 0x98) 用 (0x97, 0x70) 日 (0x93, 0xFA) , (0x2C)
      0x97, 0x98, 0x97, 0x70, 0x93, 0xfa, 0x2c,
      // 利 (0x97, 0x98) 用 (0x97, 0x70) 店 (0x93, 0x58) 名 (0x96, 0xBC) , (0x2C)
      0x97, 0x98, 0x97, 0x70, 0x93, 0x58, 0x96, 0xbc, 0x2c,
      // 利 (0x97, 0x98) 用 (0x97, 0x70) 金 (0x8B, 0xE0) 額 (0x8A, 0x7A) \n (0x0A)
      0x97, 0x98, 0x97, 0x70, 0x8b, 0xe0, 0x8a, 0x7a, 0x0a,
      // 2026/08/10, (ASCII)
      0x32, 0x30, 0x32, 0x36, 0x2f, 0x30, 0x38, 0x2f, 0x31, 0x30, 0x2c,
      // セ (0x83, 0x5A) ブ (0x83, 0x75) ン (0x83, 0x93) イ (0x83, 0x43) レ (0x83, 0x8C) ブ (0x83, 0x75) ン (0x83, 0x93) , (0x2C)
      0x83, 0x5a, 0x83, 0x75, 0x83, 0x93, 0x83, 0x43, 0x83, 0x8c, 0x83, 0x75, 0x83, 0x93, 0x2c,
      // 1250\n (ASCII)
      0x31, 0x32, 0x35, 0x30, 0x0a,
    ]);

    const decoded = decodeCsvBuffer(sjisBytes);
    expect(decoded).toContain("利用日");
    expect(decoded).toContain("セブンイレブン");
    expect(decoded).toContain("1250");

    const parsed = parseCreditCardCsv(decoded);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].date).toBe("2026-08-10");
    expect(parsed.rows[0].title).toBe("セブンイレブン");
    expect(parsed.rows[0].amount).toBe(1250);
  });
});
