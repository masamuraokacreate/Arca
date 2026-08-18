# Arca - Roadmap.md (開発計画)

「小さく作る → 動かす → 設計を確認する → 次へ進む」のSprint方式で進めます。層（レイヤー）ごとではなく、機能（モジュール）ごとにUIからデータベース連携まで一気に作り上げます。

- **Sprint 1: プロジェクト基盤構築と要件定義**
  - React + Viteのセットアップ、デザインシステム（アイボリー/ゴールド）の定義、Firebase初期設定。
- **Sprint 2: 最初のモジュール「Lists（買い物リスト）」の完全実装**
  - UI表示からFirestoreの同期、Gemini APIでの自動抽出までを一気通貫で実装。
- **Sprint 3: 「Tasks（タスク）」と「Calendar（予定）」の実装**
- **Sprint 4: 「Notes / Knowledge（記録と知識）」の実装**
- **Sprint 5: Aether Coreの高度化（横断的接続）**
  - モジュール間の情報の連携を本格稼働。
- **Sprint 6: オフライン完全対応と最適化**
  - SQLiteとFirestoreの双方向同期の完成。
- **Sprint 7: リリース v1.0**
