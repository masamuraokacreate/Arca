"""
excursion/formatter.py
Arca Excursion (Discord Bot) — 次回休日メッセージフォーマッター

概要:
    Arca API (GET /api/v1/schedule/next-holidays) から取得した休日ブロックJSONを
    Discord投稿用テキストに整形する。
    A〜D案のスタイルをサポートし、将来的なスラッシュコマンド切り替えにも対応。
    次回更新予定は直近の第1ブロック（current_or_next_block.end）の翌日 00:00 を表示する。
"""

from datetime import datetime, timedelta
from typing import Any, Dict, Optional


def _parse_date(date_str: str) -> Optional[datetime]:
    """YYYY-MM-DD 文字列を datetime オブジェクトに変換"""
    try:
        return datetime.strptime(date_str.strip(), "%Y-%m-%d")
    except (ValueError, AttributeError):
        return None


def _to_mmdd(date_str: str) -> str:
    """YYYY-MM-DD 文字列を MM/DD 表記に変換（パース失敗時は元の文字列を返却）"""
    dt = _parse_date(date_str)
    if dt:
        return f"{dt.month:02d}/{dt.day:02d}"
    # すでに MM/DD 形式の場合はそのまま返す
    if "/" in date_str:
        return date_str.strip()
    return date_str.strip()


def _format_block_dates(block: Dict[str, Any]) -> str:
    """
    ブロックの開始日と終了日を整形して返却。
    例: "10/11 - 10/12" （単休の場合は "10/11"）
    """
    start_raw = block.get("start", "")
    end_raw = block.get("end", "")
    start_mmdd = _to_mmdd(start_raw)
    end_mmdd = _to_mmdd(end_raw)

    if not start_mmdd and not end_mmdd:
        # dates 配列がある場合のフォールバック
        dates = block.get("dates", [])
        if dates:
            if len(dates) == 1:
                return dates[0]
            return f"{dates[0]} - {dates[-1]}"
        return "未定"

    if start_mmdd == end_mmdd or not end_mmdd:
        return start_mmdd
    return f"{start_mmdd} - {end_mmdd}"


def _get_next_day_mmdd_midnight(date_str: str) -> str:
    """
    指定日付（YYYY-MM-DD）の翌日 00:00 表記を生成。
    例: "2026-10-12" -> "10/13 00:00"
    """
    dt = _parse_date(date_str)
    if dt:
        next_dt = dt + timedelta(days=1)
        return f"{next_dt.month:02d}/{next_dt.day:02d} 00:00"
    return "翌日 00:00"


# ─────────────────────────────────────────
# 各スタイルのフォーマッター
# ─────────────────────────────────────────

def format_style_d(data: Dict[str, Any]) -> str:
    """
    D案: ワンタップコピペ用コードブロックフォーマット（本命）

    【出力例】
    **【自己紹介用】次回休日の更新**
    ```text
    ◈ SCHEDULE / OFF-DAY ◈
    ▸ 10/11 - 10/12
    ▸ 10/17 - 10/18
    ──────────────────────
    ```
    *(次回更新予定: 10/13 00:00)*
    """
    b1 = data.get("current_or_next_block", {})
    b2 = data.get("following_block", {})

    b1_text = _format_block_dates(b1)
    b2_text = _format_block_dates(b2)

    # 直近第1ブロック終了日（current_or_next_block.end）の翌日 00:00
    b1_end = b1.get("end", "")
    next_update_str = _get_next_day_mmdd_midnight(b1_end)

    return (
        "**【自己紹介用】次回休日の更新**\n"
        "```text\n"
        "◈ SCHEDULE / OFF-DAY ◈\n"
        f"▸ {b1_text}\n"
        f"▸ {b2_text}\n"
        "──────────────────────\n"
        "```\n"
        f"*(次回更新予定: {next_update_str})*"
    )


def format_style_a(data: Dict[str, Any]) -> str:
    """
    A案: ミニマル1行フォーマット

    【出力例】
    **次回休日**: `10/11 - 10/12` / 次々回: `10/17 - 10/18` *(更新予定: 10/13 00:00)*
    """
    b1 = data.get("current_or_next_block", {})
    b2 = data.get("following_block", {})

    b1_text = _format_block_dates(b1)
    b2_text = _format_block_dates(b2)

    # 直近第1ブロック終了日の翌日 00:00
    b1_end = b1.get("end", "")
    next_update = _get_next_day_mmdd_midnight(b1_end)

    return (
        f"**次回休日**: `{b1_text}` / 次々回: `{b2_text}` *(更新予定: {next_update})*"
    )


def format_style_b(data: Dict[str, Any]) -> str:
    """
    B案: 記号アクセント（区切り線入り）フォーマット

    【出力例】
    ✦ SCHEDULE / NEXT OFF-DAYS ✦
    ──────────────────────
    ▸ 直近: **10/11 - 10/12**
    ▸ 次回: **10/17 - 10/18**
    ──────────────────────
    *(次回更新予定: 10/13 00:00)*
    """
    b1 = data.get("current_or_next_block", {})
    b2 = data.get("following_block", {})

    b1_text = _format_block_dates(b1)
    b2_text = _format_block_dates(b2)

    # 直近第1ブロック終了日の翌日 00:00
    b1_end = b1.get("end", "")
    next_update = _get_next_day_mmdd_midnight(b1_end)

    return (
        "✦ SCHEDULE / NEXT OFF-DAYS ✦\n"
        "──────────────────────\n"
        f"▸ 直近: **{b1_text}**\n"
        f"▸ 次回: **{b2_text}**\n"
        "──────────────────────\n"
        f"*(次回更新予定: {next_update})*"
    )


def format_style_c(data: Dict[str, Any]) -> str:
    """
    C案: ボックス・カード形式フォーマット

    【出力例】
    ```text
    ┌─── NEXT OFF-DAYS ───┐
    │ 1st: 10/11 - 10/12  │
    │ 2nd: 10/17 - 10/18  │
    └─────────────────────┘
    ```
    *(次回更新予定: 10/13 00:00)*
    """
    b1 = data.get("current_or_next_block", {})
    b2 = data.get("following_block", {})

    b1_text = _format_block_dates(b1)
    b2_text = _format_block_dates(b2)

    # 直近第1ブロック終了日の翌日 00:00
    b1_end = b1.get("end", "")
    next_update = _get_next_day_mmdd_midnight(b1_end)

    line1 = f"│ 1st: {b1_text}".ljust(22) + "│"
    line2 = f"│ 2nd: {b2_text}".ljust(22) + "│"

    return (
        "```text\n"
        "┌─── NEXT OFF-DAYS ───┐\n"
        f"{line1}\n"
        f"{line2}\n"
        "└─────────────────────┘\n"
        "```\n"
        f"*(次回更新予定: {next_update})*"
    )


def format_holidays(data: Dict[str, Any], style: str = "D") -> str:
    """
    指定されたスタイル（A〜D）でテキストを整形して返却する統合関数。

    :param data: Arca API の返却辞書データ
    :param style: "A", "B", "C", "D"（大文字小文字不問、デフォルト: "D"）
    :return: Discord投稿用テキスト文字列
    """
    normalized_style = (style or "D").upper().strip()

    if normalized_style == "A":
        return format_style_a(data)
    elif normalized_style == "B":
        return format_style_b(data)
    elif normalized_style == "C":
        return format_style_c(data)
    else:
        # デフォルトはD案
        return format_style_d(data)


# スタイル識別子と表示名称のマッピング
STYLE_DESCRIPTIONS = {
    "A": "A案: ミニマル・コンパクト（一行形式）",
    "B": "B案: 記号アクセント（区切り線入り）",
    "C": "C案: カレンダー風ブロック（罫線ボックス）",
    "D": "D案: ワンタップコピペ用（コードブロック形式 / 現行デフォルト）",
}

