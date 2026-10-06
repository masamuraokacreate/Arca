"""
excursion/bot.py
Arca Excursion — Discord Bot メインスクリプト

機能:
  - Arca API (GET /api/v1/schedule/next-holidays) から次回休日データを取得
  - 定期監視タスクループ（00:01 JST判定）による休日終了検知 & 自動チャンネル投稿
  - D案（ワンタップコピペ用コードブロック）フォーマット生成
  - スラッシュコマンド（/holidays, /check-holidays, /force-post）対応
"""

import json
import logging
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional
from zoneinfo import ZoneInfo

# 実行時カレントディレクトリに関わらず自ディレクトリをインポートパスへ追加
sys.path.insert(0, str(Path(__file__).resolve().parent))

import discord
from discord import app_commands
from discord.ext import commands, tasks

from client import ArcaApiClient
from config import (
    ARCA_API_URL,
    CHECK_INTERVAL_MINUTES,
    DEFAULT_STYLE,
    DISCORD_BOT_TOKEN,
    DISCORD_CHANNEL_ID,
    STATE_FILE_PATH,
    TIMEZONE,
)
from formatter import format_holidays, STYLE_DESCRIPTIONS

# ロギング設定
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("ArcaExcursion.Bot")


class StateManager:
    """投稿履歴・状態を JSON ファイルで管理する永続化ヘルパー"""

    def __init__(self, file_path: str):
        self.file_path = Path(file_path)

    def load(self) -> Dict[str, Any]:
        """状態JSONを読み込む（存在しない場合は初期辞書を返却）"""
        if not self.file_path.exists():
            return {}
        try:
            with open(self.file_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.warning("状態ファイルの読み込みに失敗しました: %s", e)
            return {}

    def save(self, data: Dict[str, Any]) -> None:
        """状態JSONを保存する"""
        try:
            self.file_path.parent.mkdir(parents=True, exist_ok=True)
            with open(self.file_path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.error("状態ファイルの保存に失敗しました: %s", e)


class ArcaExcursionBot(commands.Bot):
    """Arca Excursion Bot 本体"""

    def __init__(self):
        # スラッシュコマンド専用Botのため、特権インテント（message_content）は不要
        # command_prefix を空にすることで「Privileged message content intent is missing」警告も解消
        intents = discord.Intents.default()
        super().__init__(command_prefix=[], intents=intents)

        self.api_client = ArcaApiClient(api_url=ARCA_API_URL)
        self.state_mgr = StateManager(STATE_FILE_PATH)
        self.tz = ZoneInfo(TIMEZONE)

    def get_current_style(self) -> str:
        """永続化された現在の投稿スタイルを取得（未設定時は DEFAULT_STYLE）"""
        state = self.state_mgr.load()
        return state.get("current_style") or DEFAULT_STYLE

    def set_current_style(self, style: str) -> None:
        """投稿スタイルを状態ファイルへ保存して永続化"""
        state = self.state_mgr.load()
        state["current_style"] = (style or DEFAULT_STYLE).upper().strip()
        self.state_mgr.save(state)
        logger.info("デフォルト投稿スタイルを更新しました: %s", state["current_style"])

    async def setup_hook(self) -> None:
        """Bot 起動時の初期化フック（スラッシュコマンド同期 & タスク起動）"""
        # スラッシュコマンドツリーの同期
        try:
            synced = await self.tree.sync()
            logger.info("スラッシュコマンド %d 件を同期しました", len(synced))
        except Exception as e:
            logger.error("スラッシュコマンドの同期に失敗しました: %s", e)

        # 定期監視タスクの開始
        if not self.schedule_monitor_loop.is_running():
            self.schedule_monitor_loop.start()

    async def on_ready(self) -> None:
        """Bot 接続完了イベント"""
        logger.info("Bot がログインしました: %s (ID: %s)", self.user, self.user.id)
        # 起動直後に初回チェックを実施
        await self.check_and_post_if_needed(trigger_reason="on_ready")

    # ─────────────────────────────────────────
    # 定期監視タスクループ
    # ─────────────────────────────────────────

    # 毎日 00:01 (JST) に実行
    # また、安全のため5分おきのループ判定も可能だが、
    # discord.py の tasks.loop(time=...) で毎日特定時刻に安全起動
    # 毎分チェック（00:00 到達を即座に検知）
    @tasks.loop(minutes=CHECK_INTERVAL_MINUTES)
    async def schedule_monitor_loop(self) -> None:
        """定期監視タスク（直近第1ブロックの休日終了翌日 00:00 到達を毎分チェック）"""
        await self.check_and_post_if_needed(trigger_reason="periodic_loop")

    @schedule_monitor_loop.before_loop
    async def before_schedule_monitor(self) -> None:
        """Bot の準備が完了するまでタスクの実行を待機"""
        await self.wait_until_ready()

    # ─────────────────────────────────────────
    # 判定 & 投稿ロジック
    # ─────────────────────────────────────────

    async def check_and_post_if_needed(self, trigger_reason: str = "check") -> bool:
        """
        休日ブロックの終了判定を行い、必要であれば専用チャンネルへ投稿する。

        判定条件:
          - 直近の第1ブロック（current_or_next_block.end）の休日が終了した翌日 00:00 を迎えたこと
            （today_str > last_posted_block_end または today_str >= next_trigger_date）
          - または未投稿（初回起動時）であること

        :return: 投稿を実施した場合は True、不要だった場合は False
        """
        now = datetime.now(self.tz)
        today_str = now.strftime("%Y-%m-%d")

        logger.debug(
            "休日終了チェック実行 [%s]: 現在時刻 %s (JST)", trigger_reason, now.isoformat()
        )

        try:
            # 1. APIから最新の次回休日データを取得
            holidays_data = await self.api_client.get_next_holidays(reference_date=today_str)
        except Exception as e:
            logger.warning("Arca API からの休日データ取得に失敗しました: %s", e)
            return False

        current_block = holidays_data.get("current_or_next_block", {})
        current_block_end = current_block.get("end", "")
        current_block_start = current_block.get("start", "")

        state = self.state_mgr.load()
        last_posted_end = state.get("last_posted_block_end")
        last_posted_start = state.get("last_posted_block_start")
        next_trigger_date = state.get("next_trigger_date")

        should_post = False
        reason = ""

        if not last_posted_end:
            # 初回起動・未投稿の場合
            should_post = True
            reason = "初回起動（未投稿状態）"
        elif (next_trigger_date and today_str >= next_trigger_date) or (today_str > last_posted_end):
            # 直近第1ブロックの休日が終了した翌日 00:00 を迎えた場合
            should_post = True
            reason = (
                f"直近第1ブロックの休日終了（終了日: {last_posted_end}）に伴い、"
                f"翌日 00:00 到達を検知 (現在日付: {today_str})"
            )
        elif (
            current_block_start != last_posted_start
            or current_block_end != last_posted_end
        ) and today_str >= current_block_start:
            # カレンダー予定変更や手動オーバーライド等で直近ブロックが切り替わっている場合
            should_post = True
            reason = f"直近休日ブロックの切り替えを検知 ({current_block_start}〜{current_block_end})"

        if not should_post:
            logger.debug(
                "投稿条件未達（更新不要）: 前回投稿第1ブロック終了日 %s (次回更新予定日: %s)",
                last_posted_end,
                next_trigger_date,
            )
            return False

        logger.info("自動投稿条件を満たしました: %s", reason)
        active_style = self.get_current_style()
        posted = await self.post_to_channel(holidays_data, style=active_style)
        if posted:
            # 次回トリガー日（今回投稿した第1ブロック終了日の翌日 YYYY-MM-DD）を算出
            next_target = ""
            try:
                dt_end = datetime.strptime(current_block_end, "%Y-%m-%d")
                from datetime import timedelta
                next_target = (dt_end + timedelta(days=1)).strftime("%Y-%m-%d")
            except Exception:
                pass

            # 状態ファイルを更新
            state["last_posted_block_start"] = current_block_start
            state["last_posted_block_end"] = current_block_end  # 直近第1ブロックの終了日
            state["next_trigger_date"] = next_target            # 終了日の翌日 00:00
            state["last_posted_at"] = now.isoformat()
            state["reason"] = reason
            self.state_mgr.save(state)
            logger.info("状態を保存しました: %s", state)
            return True

        return False

    async def post_to_channel(
        self,
        holidays_data: Dict[str, Any],
        style: str = "D",
        target_channel_id: Optional[int] = None,
    ) -> bool:
        """
        指定チャンネル（または設定されたデフォルトチャンネル）へフォーマット済みメッセージを送信する。
        """
        channel_id = target_channel_id or DISCORD_CHANNEL_ID
        if not channel_id:
            logger.error("投稿先チャンネルID (DISCORD_CHANNEL_ID) が未設定です")
            return False

        channel = self.get_channel(channel_id)
        if not channel:
            try:
                channel = await self.fetch_channel(channel_id)
            except Exception as e:
                logger.error("チャンネル (ID: %s) の取得に失敗しました: %s", channel_id, e)
                return False

        message_content = format_holidays(holidays_data, style=style)

        try:
            msg = await channel.send(message_content)
            logger.info("チャンネル %s に次回休日メッセージを送信しました (ID: %s)", channel.id, msg.id)
            return True
        except Exception as e:
            logger.error("メッセージ送信に失敗しました: %s", e)
            return False


# ─────────────────────────────────────────
# Bot インスタンス & スラッシュコマンド
# ─────────────────────────────────────────

bot = ArcaExcursionBot()


@bot.tree.command(name="style", description="次回休日の投稿スタイル（A〜D案）を切り替えます")
@app_commands.describe(choice="適用する投稿スタイルを選択してください")
@app_commands.choices(
    choice=[
        app_commands.Choice(name="A: ミニマル・コンパクト（一行形式）", value="A"),
        app_commands.Choice(name="B: 記号アクセント（区切り線入り）", value="B"),
        app_commands.Choice(name="C: カレンダー風ブロック（罫線ボックス）", value="C"),
        app_commands.Choice(name="D: ワンタップコピペ用（コードブロック形式 / 現行デフォルト）", value="D"),
    ]
)
async def cmd_style(
    interaction: discord.Interaction,
    choice: app_commands.Choice[str],
):
    """投稿スタイル切り替えスラッシュコマンド"""
    await interaction.response.defer(ephemeral=True)

    chosen_style = choice.value
    bot.set_current_style(chosen_style)

    # 現在の休日データを取得してプレビューを生成
    try:
        data = await bot.api_client.get_next_holidays()
        preview_text = format_holidays(data, style=chosen_style)
    except Exception as e:
        logger.warning("cmd_style プレビュー生成時のAPI取得エラー: %s", e)
        preview_text = f"*(※APIからのプレビュー取得に失敗しました: {e})*"

    response_text = (
        f"✅ 投稿スタイルを【**{choice.name}**】に更新しました。\n"
        "次回以降の自動投稿にこのスタイルが適用されます。\n\n"
        f"**【プレビュー】**\n{preview_text}"
    )

    await interaction.followup.send(response_text, ephemeral=True)


@bot.tree.command(name="holidays", description="Arcaから取得した次回休日を表示します（自己紹介コピペ用）")
@app_commands.describe(
    style="表示スタイル（未指定時は現在の設定スタイル）",
    share="チャンネルに全体公開するかどうか（True: 全体公開, False: 自分のみ表示）",
)
@app_commands.choices(
    style=[
        app_commands.Choice(name="D: ワンタップコピペ用（コードブロック形式 / 現行デフォルト）", value="D"),
        app_commands.Choice(name="A: ミニマル・コンパクト（一行形式）", value="A"),
        app_commands.Choice(name="B: 記号アクセント（区切り線入り）", value="B"),
        app_commands.Choice(name="C: カレンダー風ブロック（罫線ボックス）", value="C"),
    ]
)
async def cmd_holidays(
    interaction: discord.Interaction,
    style: Optional[app_commands.Choice[str]] = None,
    share: bool = False,
):
    """次回休日メッセージ表示スラッシュコマンド"""
    await interaction.response.defer(ephemeral=not share)

    chosen_style = style.value if style else bot.get_current_style()

    try:
        data = await bot.api_client.get_next_holidays()
        text = format_holidays(data, style=chosen_style)
        await interaction.followup.send(text, ephemeral=not share)
    except Exception as e:
        logger.error("cmd_holidays エラー: %s", e)
        await interaction.followup.send(
            f"⚠️ Arca API からの次回休日取得に失敗しました: {e}",
            ephemeral=True,
        )


@bot.tree.command(name="check-holidays", description="Arca API 疎通確認および次回休日データの生JSONをプレビューします")
async def cmd_check_holidays(interaction: discord.Interaction):
    """API 疎通確認 & プレビューコマンド"""
    await interaction.response.defer(ephemeral=True)

    try:
        data = await bot.api_client.get_next_holidays()
        formatted_d = format_holidays(data, style="D")
        raw_json = json.dumps(data, ensure_ascii=False, indent=2)

        response_text = (
            "✅ **Arca API 接続成功**\n\n"
            f"**プレビュー (D案):**\n{formatted_d}\n\n"
            f"**Raw JSON:**\n```json\n{raw_json}\n```"
        )
        await interaction.followup.send(response_text, ephemeral=True)
    except Exception as e:
        logger.error("cmd_check_holidays エラー: %s", e)
        await interaction.followup.send(
            f"❌ **Arca API 接続エラー**: {e}\nAPIサーバー（Arca）が起動しているか確認してください。",
            ephemeral=True,
        )


@bot.tree.command(name="force-post", description="[管理者用] 最新の次回休日メッセージを指定チャンネルへ強制投稿します")
@app_commands.describe(
    style="送信スタイル（D: コードブロック(デフォルト), A〜Cも可）"
)
async def cmd_force_post(
    interaction: discord.Interaction,
    style: Optional[str] = "D",
):
    """管理者用 強制投稿スラッシュコマンド"""
    await interaction.response.defer(ephemeral=True)

    try:
        data = await bot.api_client.get_next_holidays()
        posted = await bot.post_to_channel(data, style=style or DEFAULT_STYLE)
        if posted:
            current_block = data.get("current_or_next_block", {})
            now = datetime.now(bot.tz)
            state = bot.state_mgr.load()
            state["last_posted_block_start"] = current_block.get("start", "")
            state["last_posted_block_end"] = current_block.get("end", "")
            state["last_posted_at"] = now.isoformat()
            state["reason"] = f"手動強制投稿 (実行者: {interaction.user})"
            bot.state_mgr.save(state)

            await interaction.followup.send(
                "✅ 専用チャンネルへの手動投稿が完了し、状態を更新しました。",
                ephemeral=True,
            )
        else:
            await interaction.followup.send(
                "⚠️ チャンネルへの送信に失敗しました。チャンネルIDやBotの権限を確認してください。",
                ephemeral=True,
            )
    except Exception as e:
        await interaction.followup.send(
            f"❌ エラーが発生しました: {e}",
            ephemeral=True,
        )


# ─────────────────────────────────────────
# メインエントリーポイント
# ─────────────────────────────────────────

def main():
    """Bot 起動エントリーポイント"""
    if not DISCORD_BOT_TOKEN:
        print("\n[エラー] DISCORD_BOT_TOKEN が設定されていません。")
        print("excursion/.env に Bot トークンを設定してください。\n")
        return

    logger.info("Arca Excursion Bot を起動します...")
    logger.info("Arca API URL: %s", ARCA_API_URL)
    logger.info("投稿先チャンネル ID: %s", DISCORD_CHANNEL_ID)
    bot.run(DISCORD_BOT_TOKEN)


if __name__ == "__main__":
    main()
