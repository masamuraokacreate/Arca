# Arca - Architecture.md (技術構成)

## システムアーキテクチャ
- **フロントエンド:** Vite + React + TypeScript + Tailwind CSS
- **バックエンド・同期基盤:** Firebase (Firestore)
- **AI・中枢ロジック (Aether Core):** Gemini API

## デバイスごとの役割
- **PC (メイン環境):** 情報の整理、詳細な編集、大量の入力、開発・メンテナンス。
- **iPhone (サブ環境):** 今日の予定の確認、タスク確認、買い物リストの利用、簡単なメモ追加。PWAとしてFirebase経由でアクセスします（ネイティブアプリは作成しません）。

## データフロー
ローカル(PC)のデータをベースとし、Firebaseを通じてiPhoneとリアルタイムに同期します。オフライン環境でも動作する堅牢なローカルファースト構成を目指します。
