"""
excursion/config.py
Arca Excursion — 環境設定管理モジュール
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# プロジェクトルートまたはスクリプトと同階層の .env を読み込む
ENV_PATH = Path(__file__).resolve().parent / ".env"
if ENV_PATH.exists():
    load_dotenv(dotenv_path=ENV_PATH)
else:
    load_dotenv()

# Discord Bot Token（必須）
DISCORD_BOT_TOKEN = os.getenv("DISCORD_BOT_TOKEN", "").strip()

# 投稿先チャンネルID（必須）
_channel_id_raw = os.getenv("DISCORD_CHANNEL_ID", "").strip()
DISCORD_CHANNEL_ID = int(_channel_id_raw) if _channel_id_raw.isdigit() else 0

# Arca 休日取得APIエンドポイントURL
# 例: http://localhost:5173/api/v1/schedule/next-holidays
ARCA_API_URL = os.getenv(
    "ARCA_API_URL", "http://localhost:5173/api/v1/schedule/next-holidays"
).strip()

# タイムゾーン（デフォルト: Asia/Tokyo）
TIMEZONE = os.getenv("TIMEZONE", "Asia/Tokyo").strip()

# 定期監視タスクのポーリング間隔（分）
CHECK_INTERVAL_MINUTES = int(os.getenv("CHECK_INTERVAL_MINUTES", "1"))

# 状態永続化JSONファイルパス
STATE_FILE_PATH = os.getenv(
    "STATE_FILE_PATH", str(Path(__file__).resolve().parent / "state.json")
)

# デフォルトのテキストスタイル ("A", "B", "C", "D")
DEFAULT_STYLE = os.getenv("DEFAULT_STYLE", "D").upper().strip()
