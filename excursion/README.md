# Arca Excursion (Discord Bot)

Arca（個人用OS）で管理している勤務サイクル（4勤2休等）から直近の次回休日を取得し、Discord の専用チャンネルへ自己紹介コピペ用メッセージを自動投稿する Bot です。

---

## 主な機能

1. **次回休日の自動監視 & チャンネル投稿**
   - 直近の第1ブロック（`current_or_next_block.end`）の休日が終了した翌日 00:00 を検知し、専用チャンネルへ自動投稿します。
   - 状態永続化（`state.json`）により、Bot 再起動時でも重複投稿や取りこぼしを防止します。

2. **D案フォーマット（ワンタップコピペ用コードブロック）**
   - Discord 上でワンタップコピーしやすいコードブロック形式で出力します。
   ```text
   **【自己紹介用】次回休日の更新**
   ```text
   ◈ SCHEDULE / OFF-DAY ◈
   ▸ 10/11 - 10/12
   ▸ 10/17 - 10/18
   ──────────────────────
   ```
   *(次回更新予定: 10/13 00:00)*
   ```

3. **スラッシュコマンド対応**
   - `/style [choice]`: 次回休日の投稿スタイル（A〜D案）を動的に切り替え、設定を永続化（次回自動投稿に反映）。
   - `/holidays [style]`: 現在の次回休日を表示（指定スタイルまたは設定中のスタイルで表示）。
   - `/check-holidays`: Arca API との疎通確認および Raw JSON プレビュー。
   - `/force-post`: 管理者用。専用チャンネルへ即座に手動強制投稿。

---

## ディレクトリ構成

```text
excursion/
├── bot.py             # Bot メインプログラム（discord.py タスクループ & コマンド）
├── client.py          # Arca API クライアント (aiohttp)
├── config.py          # 環境変数・設定読み込み
├── formatter.py       # A〜D案テキスト整形フォーマッター
├── test_formatter.py  # フォーマッター単体テスト
├── requirements.txt   # Python 依存ライブラリ一覧
├── .env.example       # 環境変数設定テンプレート
└── README.md          # 本手順書
```

---

## セットアップ手順

### 1. 依存ライブラリのインストール

Python 3.10 以上がインストールされている環境で、以下のコマンドを実行します。

```bash
cd excursion
pip install -r requirements.txt
```

### 2. 環境変数の設定

`.env.example` をコピーして `.env` を作成し、必要な値を設定します。

```bash
cp .env.example .env
```

`.env` の内容：

```env
# Discord Developer Portal で作成した Bot のトークン
DISCORD_BOT_TOKEN=your_discord_bot_token_here

# 投稿先の専用チャンネルID（チャンネル右クリック「IDをコピー」）
DISCORD_CHANNEL_ID=1234567890123456789

# Arca 休日取得APIエンドポイント
# Vite 開発サーバーの場合: http://localhost:5173/api/v1/schedule/next-holidays
# スタンドアロンAPIサーバーの場合: http://localhost:3000/api/v1/schedule/next-holidays
ARCA_API_URL=http://localhost:5173/api/v1/schedule/next-holidays

# タイムゾーン（日本時間）
TIMEZONE=Asia/Tokyo

# 定期監視チェック間隔（分）
CHECK_INTERVAL_MINUTES=5

# デフォルトスタイル (D)
DEFAULT_STYLE=D
```

---

## 起動方法

### 手順 1: Arca 側の API サーバーを起動する

以下のいずれかの方法で Arca 側の API エンドポイントを起動します。

* **方法 A（通常の開発サーバーと同時に利用する場合）**:
  ```bash
  npm run dev
  ```
  `http://localhost:5173/api/v1/schedule/next-holidays` で休日 API が利用可能になります。

* **方法 B（スタンドアロン API サーバーとして単体起動する場合）**:
  ```bash
  npm run api
  ```
  `http://localhost:3000/api/v1/schedule/next-holidays` で API サーバーが起動します。
  （※この場合は `.env` の `ARCA_API_URL` をポート `3000` に設定してください）

### 手順 2: Arca Excursion (Bot) を起動する

```bash
python excursion/bot.py
```

正常に起動すると、コンソールに以下のように表示され、スラッシュコマンドの同期と初回チェックが行われます。

```text
[INFO] ArcaExcursion.Bot: Arca Excursion Bot を起動します...
[INFO] ArcaExcursion.Bot: スラッシュコマンド 3 件を同期しました
[INFO] ArcaExcursion.Bot: Bot がログインしました: Arca Excursion#1234
[INFO] ArcaExcursion.Bot: 自動投稿条件を満たしました: 初回起動（未投稿状態）
[INFO] ArcaExcursion.Bot: チャンネル に次回休日メッセージを送信しました
```

---

## 単体テストの実行

フォーマッターの動作確認テストは以下で実行できます。

```bash
python excursion/test_formatter.py
```
