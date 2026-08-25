# Arca - Architecture.md (技術構成)

## システムアーキテクチャ
- **フロントエンド:** Vite + React + TypeScript + Tailwind CSS
- **バックエンド・同期基盤:** Firebase (Firestore)
- **AI・中枢ロジック (Aether Core):** Gemini API

## デバイスごとの役割
- **PC (メイン環境):** 情報の整理、詳細な編集、大量の入力、開発・メンテナンス。
- **iPhone (サブ環境):** 今日の予定の確認、タスク確認、買い物リストの利用、簡単なメモ追加。PWAとしてFirebase経由でアクセスします（ネイティブアプリは作成しません）。

## データストア & Firestore コレクション設計
- `lists`: 買い物リストアイテム（Google Tasks連携、カテゴリ分類）
- `tasks`: 行動タスク・サブタスク（Google Tasks連携、期日・優先度）
- `events`: カレンダー予定（Google Calendar双方向連携）
- `notes`: メモ・知識（Markdown、タグ、全文検索）
- `recipes`: 料理レシピ（材料・手順・知見、Lists連携）
- `pm_templates`: PM（予防保全）Day別計画テンプレート
- `pm_logs`: PMタスク実施・スキップ記録ログ（`${date}_${templateId}`）
- `pm_settings`: PMサイクル総日数・起点日・単日オーバーライド設定（`config` / `main`）

## データ保護 ＆ バックアップ（Local First）
- **IndexedDB**: Firestore オフライン永続化キャッシュ（ゼロ秒ローカル起動）。
- **Google Drive API v3**: `/800_Arca/810_バックアップ` への完全JSON自動・手動バックアップ（エクスポート / インポート / 復元バリデーション）。
