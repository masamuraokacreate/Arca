/**
 * src/components/maintenance/SchemaLegendCard.tsx
 * Arca — データ構造（スキーマ）凡例カード
 *
 * 設計原則 (Core/Rules.md & Apple HIG):
 * - 絵文字完全排除、Lucide React の洗練された SVG アイコンを使用
 * - 枠線完全排除、アイボリー背景、微細多層シャドウ、マットゴールドのアクセント
 * - 各コレクションの生データフィールド（id, createdAt, googleEventId等）の目的と型を視覚的に解説
 */

import { useState } from "react";
import { C } from "../../lib/designSystem";
import { Copy, Check, Info, FileCode } from "lucide-react";
import type { InspectorCollection } from "./DbInspectorTab";

interface FieldDefinition {
  field: string;
  type: string;
  label: string;
  description: string;
  example: string;
}

const SCHEMA_DEFINITIONS: Record<InspectorCollection, { title: string; subtitle: string; fields: FieldDefinition[] }> = {
  events: {
    title: "カレンダー (events) スキーマ凡例",
    subtitle: "Arca の予定・行事および Google カレンダー連動データの構造定義",
    fields: [
      {
        field: "id",
        type: "string",
        label: "ドキュメントID",
        description: "Firestore 上の一意識別キー。Arca 内部で自動採番されます。",
        example: '"evt_1726700000"',
      },
      {
        field: "title",
        type: "string",
        label: "予定タイトル",
        description: "予定の名称・見出し。",
        example: '"出勤", "ランチミーティング"',
      },
      {
        field: "date",
        type: "string (YYYY-MM-DD)",
        label: "予定日",
        description: "予定が配置される年月日。",
        example: '"2026-09-18"',
      },
      {
        field: "startTime",
        type: "string (HH:mm) | undefined",
        label: "開始時刻",
        description: "予定の開始時刻。終日予定の場合は空文字または未定義。",
        example: '"09:00"',
      },
      {
        field: "endTime",
        type: "string (HH:mm) | undefined",
        label: "終了時刻",
        description: "予定の終了時刻。",
        example: '"17:00"',
      },
      {
        field: "note",
        type: "string | undefined",
        label: "メモ・補足",
        description: "予定に付随する任意のテキストメモ。",
        example: '"会議室B"',
      },
      {
        field: "googleEventId",
        type: "string | null",
        label: "Google予定ID",
        description: "Google カレンダー同期時の外部一意キー。値がある場合は Google 連動予定です。",
        example: '"_60q30c1g60o..."',
      },
      {
        field: "isShiftOnly",
        type: "boolean | undefined",
        label: "シフト計算専用フラグ",
        description: "true の場合、出勤判定・PMサイクル計算のみに使用され、カレンダー画面上には非表示となります。",
        example: "false",
      },
      {
        field: "createdAt",
        type: "Timestamp | string | null",
        label: "作成日時",
        description: "レコードが作成された日時（Firestore Timestamp または ISO文字列）。",
        example: '"2026-09-18T08:00:00Z"',
      },
      {
        field: "updatedAt",
        type: "Timestamp | string | undefined",
        label: "更新日時",
        description: "レコードが最後に更新された日時。",
        example: '"2026-09-18T10:00:00Z"',
      },
      {
        field: "isDeleted",
        type: "boolean | undefined",
        label: "論理削除フラグ",
        description: "ごみ箱（論理削除）状態を表すフラグ。true の場合、通常画面から除外されます。",
        example: "false",
      },
    ],
  },
  finance_transactions: {
    title: "支出・家計 (finance_transactions) スキーマ凡例",
    subtitle: "支出取引、品目明細（1対N）、およびクレジットカード照合ステータスの構造定義",
    fields: [
      {
        field: "id",
        type: "string",
        label: "ドキュメントID",
        description: "Firestore 上の一意識別キー。",
        example: '"tx_1726700000"',
      },
      {
        field: "title",
        type: "string",
        label: "支出タイトル / 店名",
        description: "支払先や内容の見出し（例: スーパー、スターバックス、Amazon）。",
        example: '"スターバックス コーヒー"',
      },
      {
        field: "totalAmount",
        type: "number",
        label: "支出合計金額",
        description: "決済金額（税込・円）。",
        example: "650",
      },
      {
        field: "date",
        type: "string (YYYY-MM-DD)",
        label: "決済日",
        description: "支払いが実行された日付。",
        example: '"2026-09-18"',
      },
      {
        field: "category",
        type: "ExpenseCategory",
        label: "支出カテゴリ",
        description: "食料品、外食、日用品、交通費、趣味・娯楽などの分類。",
        example: '"外食"',
      },
      {
        field: "paymentMethod",
        type: "PaymentMethod",
        label: "支払方法",
        description: "Oliveカード、現金、PayPay、Suica 等の決済手段。",
        example: '"Oliveカード"',
      },
      {
        field: "isReconciled",
        type: "boolean",
        label: "照合・消込フラグ",
        description: "クレジットカード明細CSVや速報メールと突き合わせ（照合完了）されているかを表す真偽値。",
        example: "true",
      },
      {
        field: "matchedCsvRowId",
        type: "string | undefined",
        label: "突合CSV行ID",
        description: "照合済みのカード明細行の識別子。",
        example: '"csv_row_8492"',
      },
      {
        field: "emailMessageId",
        type: "string | undefined",
        label: "Gmail速報メールID",
        description: "速報メールから自動取り込みされた場合のメッセージ識別キー。",
        example: '"msg_18ab9c..."',
      },
      {
        field: "items",
        type: "ExpenseItem[]",
        label: "レシート品目内訳",
        description: "レシートOCRや手動で登録された個別の購入商品・単価の配列（1対N）。",
        example: '[{ name: "ラテ", amount: 650 }]',
      },
      {
        field: "createdAt",
        type: "string (ISO 8601)",
        label: "登録日時",
        description: "取引がシステムに登録された日時。",
        example: '"2026-09-18T10:00:00Z"',
      },
      {
        field: "isDeleted",
        type: "boolean",
        label: "論理削除フラグ",
        description: "削除状態を表すフラグ。true の場合、支出集計から安全に除外されます。",
        example: "false",
      },
    ],
  },
};

export function SchemaLegendCard({
  collection,
  onClose,
}: {
  collection: InspectorCollection;
  onClose?: () => void;
}) {
  const schema = SCHEMA_DEFINITIONS[collection];
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const handleCopy = async (fieldName: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(null), 1800);
    } catch {
      // エラー無視
    }
  };

  return (
    <div
      data-testid="schema-legend-card"
      style={{
        background: "var(--bg-card-solid, #FDFCFA)",
        borderRadius: "16px",
        padding: "1rem 1.25rem",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02)",
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
        border: "none",
        animation: "arca-fade-in 0.18s ease-out",
      }}
    >
      {/* ヘッダー行 */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <div
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "8px",
              background: "rgba(197, 160, 89, 0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: C.goldDark,
              flexShrink: 0,
            }}
          >
            <Info size={15} />
          </div>
          <div>
            <h4 style={{ margin: 0, fontSize: "0.88rem", fontWeight: 750, color: C.charcoal }}>
              {schema.title}
            </h4>
            <p style={{ margin: "0.1rem 0 0", fontSize: "0.72rem", color: C.charcoalLight }}>
              {schema.subtitle}
            </p>
          </div>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            aria-label="凡例を閉じる"
            data-testid="close-schema-legend-btn"
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontSize: "0.72rem",
              color: C.charcoalLight,
              padding: "0.25rem 0.5rem",
              borderRadius: "6px",
              fontWeight: 600,
              transition: "color 0.15s ease",
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = C.charcoal)}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = C.charcoalLight)}
          >
            閉じる
          </button>
        )}
      </div>

      {/* スキーマ表 */}
      <div
        style={{
          overflowX: "auto",
          borderRadius: "10px",
          background: "var(--bg-nav-track, rgba(0, 0, 0, 0.02))",
          padding: "0.2rem",
        }}
        className="no-scrollbar"
      >
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "0.74rem",
            textAlign: "left",
          }}
        >
          <thead>
            <tr style={{ color: C.charcoalLight, borderBottom: "1px solid rgba(0, 0, 0, 0.05)" }}>
              <th style={{ padding: "0.45rem 0.6rem", fontWeight: 650 }}>フィールド名</th>
              <th style={{ padding: "0.45rem 0.6rem", fontWeight: 650 }}>型 (Type)</th>
              <th style={{ padding: "0.45rem 0.6rem", fontWeight: 650 }}>項目の説明・意味</th>
              <th style={{ padding: "0.45rem 0.6rem", fontWeight: 650 }}>具体例</th>
            </tr>
          </thead>
          <tbody>
            {schema.fields.map((f) => {
              const isCopied = copiedField === f.field;
              return (
                <tr
                  key={f.field}
                  style={{
                    borderBottom: "1px solid rgba(0, 0, 0, 0.03)",
                    transition: "background 0.12s ease",
                  }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "rgba(197, 160, 89, 0.04)")}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
                >
                  <td style={{ padding: "0.45rem 0.6rem", fontWeight: 700, fontFamily: "monospace", color: C.goldDark, whiteSpace: "nowrap" }}>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                      <span>{f.field}</span>
                      <button
                        type="button"
                        onClick={() => handleCopy(f.field, f.field)}
                        title={`"${f.field}" をコピー`}
                        style={{
                          background: "transparent",
                          border: "none",
                          cursor: "pointer",
                          padding: "0.15rem",
                          color: isCopied ? C.sage : C.charcoalLight,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: "4px",
                          transition: "color 0.15s ease",
                        }}
                      >
                        {isCopied ? <Check size={12} /> : <Copy size={12} />}
                      </button>
                    </div>
                  </td>
                  <td style={{ padding: "0.45rem 0.6rem", color: C.charcoalMid, fontFamily: "monospace", fontSize: "0.7rem" }}>
                    {f.type}
                  </td>
                  <td style={{ padding: "0.45rem 0.6rem", color: C.charcoal, lineHeight: 1.4 }}>
                    <div style={{ fontWeight: 600 }}>{f.label}</div>
                    <div style={{ fontSize: "0.7rem", color: C.charcoalLight }}>{f.description}</div>
                  </td>
                  <td style={{ padding: "0.45rem 0.6rem", color: C.charcoalMid, fontFamily: "monospace", fontSize: "0.7rem" }}>
                    {f.example}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: "0.68rem", color: C.charcoalLight, display: "flex", alignItems: "center", gap: "0.35rem" }}>
        <FileCode size={12} />
        <span>フィールド名横のアイコンをクリックすると、プロパティ名をクリップボードにコピーできます。</span>
      </div>
    </div>
  );
}
export default SchemaLegendCard;
