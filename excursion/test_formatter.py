"""
excursion/test_formatter.py
Arca Excursion — フォーマッター単体テスト
"""

import unittest
from formatter import (
    format_style_d,
    format_style_a,
    format_style_b,
    format_style_c,
    format_holidays,
)


class TestFormatter(unittest.TestCase):
    def setUp(self):
        # ユーザー要件のサンプルデータ
        self.sample_data = {
            "current_or_next_block": {
                "start": "2026-10-11",
                "end": "2026-10-12",
                "dates": ["10/11", "10/12"],
            },
            "following_block": {
                "start": "2026-10-17",
                "end": "2026-10-18",
                "dates": ["10/17", "10/18"],
            },
        }

    def test_format_style_d(self):
        """D案フォーマットの検証（コードブロック、記号、更新予定）"""
        output = format_style_d(self.sample_data)
        self.assertIn("**【自己紹介用】次回休日の更新**", output)
        self.assertIn("```text", output)
        self.assertIn("◈ SCHEDULE / OFF-DAY ◈", output)
        self.assertIn("▸ 10/11 - 10/12", output)
        self.assertIn("▸ 10/17 - 10/18", output)
        self.assertIn("──────────────────────", output)
        self.assertIn("```", output)
        # 直近第1ブロック終了日 2026-10-12 の翌日 00:00 -> 10/13 00:00
        self.assertIn("*(次回更新予定: 10/13 00:00)*", output)

    def test_format_holidays_default(self):
        """format_holidays のデフォルトが D 案であること"""
        d_output = format_style_d(self.sample_data)
        default_output = format_holidays(self.sample_data)
        self.assertEqual(d_output, default_output)

    def test_format_style_a(self):
        """A案ミニマルの検証"""
        output = format_holidays(self.sample_data, style="A")
        self.assertIn("**次回休日**:", output)
        self.assertIn("10/11 - 10/12", output)
        self.assertIn("10/17 - 10/18", output)
        self.assertIn("10/13 00:00", output)

    def test_format_style_b(self):
        """B案 記号アクセント（区切り線入り）の検証"""
        output = format_holidays(self.sample_data, style="B")
        self.assertIn("✦ SCHEDULE / NEXT OFF-DAYS ✦", output)
        self.assertIn("──────────────────────", output)
        self.assertIn("▸ 直近: **10/11 - 10/12**", output)
        self.assertIn("▸ 次回: **10/17 - 10/18**", output)
        self.assertIn("10/13 00:00", output)

    def test_format_style_c(self):
        """C案ボックス形式の検証"""
        output = format_holidays(self.sample_data, style="C")
        self.assertIn("┌─── NEXT OFF-DAYS ───┐", output)
        self.assertIn("10/11 - 10/12", output)
        self.assertIn("10/13 00:00", output)

    def test_single_day_holiday(self):
        """単休（1日のみの休日）のケース検証"""
        single_day_data = {
            "current_or_next_block": {
                "start": "2026-10-11",
                "end": "2026-10-11",
                "dates": ["10/11"],
            },
            "following_block": {
                "start": "2026-10-17",
                "end": "2026-10-18",
                "dates": ["10/17", "10/18"],
            },
        }
        output = format_style_d(single_day_data)
        self.assertIn("▸ 10/11", output)
        self.assertIn("▸ 10/17 - 10/18", output)
        # 10/11 の翌日 -> 10/12 00:00
        self.assertIn("*(次回更新予定: 10/12 00:00)*", output)


if __name__ == "__main__":
    unittest.main()
