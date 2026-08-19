# Arca - Roadmap.md (開発計画)

「小さく作る → 動かす → 設計を確認する → 次へ進む」のSprint方式で進めます。層（レイヤー）ごとではなく、機能（モジュール）ごとにUIからデータベース連携まで一気に作り上げます。

- **Sprint 1: プロジェクト基盤構築と要件定義** 【完了】
  - React + Viteのセットアップ、デザインシステム（アイボリー/ゴールド）の定義、Firebase初期設定。
- **Sprint 2: 最初のモジュール「Lists（買い物リスト）」の完全実装** 【完了】
  - UI表示からFirestoreの同期、Google Tasks API双方向連携、Gemini APIでの自動抽出までを一気通貫で実装。
- **Sprint 3: 「Tasks（タスク）」と「Calendar（予定）」の実装** 【完了】
  - 時間と行動の管理基盤、締切日連携、ダッシュボードへの集約。
- **Sprint 4: 「Notes / Knowledge（記録と知識）」の実装** 【完了】
  - Apple Notes風エディタ、タグ管理、全文検索、ゴミ箱＆Undo復元。
- **Sprint 5: Aether Coreの高度化（横断的接続）** 【完了】
  - Gemini APIによるデイリーブリーフィング、自然言語タスク解析、ノートからのアクション自動抽出。
- **Sprint 6: オフライン完全対応と最適化** 【完了】
  - Firestore IndexedDBオフライン永続化、PWA化（iOS Safe Area対応）、ホワイトリスト厳格認証、Google Drive完全バックアップ（`/800_Arca/810_バックアップ`）。
- **Sprint 7: リリース v1.0.0** 【完了・運用開始】
  - 本番ホスティング稼働（`https://arca-f3fc6.web.app`）、実運用定着と細かな微調整。
