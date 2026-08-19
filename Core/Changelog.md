# Arca - 日報 (Changelog)

---

## [2026-08-18] Sprint 2 & 3 完了

### 完了したこと

**Tasks（行動）モジュールの実装と Firestore 同期**
- Lists と同様に、アイボリー背景とマットゴールドのアクセントを活かしたタスク管理画面を構築。

**Calendar（時間）モジュールの実装と拡張**
- 日常のスケジュール管理機能に加え、タスクの締切日とも連携するカレンダー基盤を実装。

**Google Jules によるコードのリファクタリングとテスト自動化**
- GitHub リポジトリ（`masamuraokacreate/Arca.git`）との連携を完了。
- Jules による型定義の整理やテストコードの網羅を実現（全53テスト オールグリーン達成）。

**ホーム画面（Dashboard）の完成**
- Lists・Tasks・Calendar の3大モジュールを1画面に美しく集約。
- Aether Core の視覚的サポートも組み込んだ「自分専用 OS Arca」の拠点（ダッシュボード）が完成。

**UIの細部調整**
- オリジナルのブランドアイコン（`arca_icon.png`）をファビコンに設定。
- Google ログイン用の設定も保持した洗練されたブラウザ環境を構築。

---

## [2026-08-17] Sprint 1 Day 1

### 完了したこと

**プロジェクト基盤の構築**
- Vite + React + TypeScript + Tailwind CSS (v4) による開発環境セットアップ
- `@tailwindcss/postcss` による PostCSS 設定の修正
- Core フォルダ内の設計ドキュメント群（Rules, Kernel, Blueprint, Architecture, Roadmap, Roles）初版作成
- デザインシステムの CSS 変数定義（`--color-base` / `--color-text` / `--color-accent`）

**Lists モジュール（買い物リスト）の実装**
- `src/components/Lists.tsx` 作成・`App.tsx` への組み込み
- Firebase / Firestore によるリアルタイム同期
- Google OAuth 2.0（GIS Token Model）によるログイン機能
- Google Tasks API との双方向同期（「買い物リスト」リストを対象）
- `localStorage` によるログイン状態の永続化（リロード後も自動復元）
- 同期ステータス表示（同期中です… / 同期完了 / 同期エラー）
- ログアウトボタンの追加

### 発生した問題と解決

| 問題 | 原因 | 解決策 |
|---|---|---|
| 画面が真っ白になる | React StrictMode の二重エフェクト実行時に `google` オブジェクト未定義でクラッシュ | GIS スクリプトを `index.html` に直接配置し、`gsi-loaded` イベントで通知 |
| 同期中→同期完了→同期中になってしまう | `useEffect([isSignedIn, accessToken])` の依存配列が `setSyncStatus` の呼び出しで再トリガーされる構造的欠陥 | 同期処理を命令型コールバック（`performSync`）に切り出し、`useEffect` の依存配列から完全に切り離す

### 未解決・持ち越し

- 同期中問題：修正コードは実装済みだが動作確認が取れていない（ | それでも上手くいかなかったのでいったん今日は諦めた…）
- アイテムの削除機能が未実装
- Google Tasks → Arca の同期は「インポート（初回のみ）」で、継続的な双方向同期ではない

---

## [2026-08-16] Sprint 1 — 今後の予定

- Lists モジュールの安定化・削除機能の追加
- 次のモジュール検討（Roadmap.md 参照）

---

## [2026-08-14] Sprint 0（初期セットアップ）

- Sprint 1 開始
- Vite + React + Tailwind CSS (v4) を用いたローカル開発基盤の構築完了
- Core フォルダ内に各種設計ドキュメントの初版を作成
