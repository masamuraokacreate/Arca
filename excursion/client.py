"""
excursion/client.py
Arca Excursion — Arca API 非同期クライアント
"""

import logging
from typing import Any, Dict, Optional
import aiohttp

logger = logging.getLogger("ArcaExcursion.Client")


class ArcaApiClient:
    """Arca スケジュール API 連携クライアント"""

    def __init__(self, api_url: str, timeout_seconds: float = 10.0):
        self.api_url = api_url
        self.timeout = aiohttp.ClientTimeout(total=timeout_seconds)

    async def get_next_holidays(self, reference_date: Optional[str] = None) -> Dict[str, Any]:
        """
        GET /api/v1/schedule/next-holidays から直近2回分の休日ブロックを取得する。

        :param reference_date: オプションの基準日 "YYYY-MM-DD"
        :return: レスポンスJSON辞書
        :raises aiohttp.ClientError: 通信エラー発生時
        :raises ValueError: レスポンスデータ不正時
        """
        params = {}
        if reference_date:
            params["date"] = reference_date

        async with aiohttp.ClientSession(timeout=self.timeout) as session:
            logger.debug("Arca API リクエスト送信: %s (params=%s)", self.api_url, params)
            async with session.get(self.api_url, params=params) as response:
                if response.status != 200:
                    text = await response.text()
                    raise aiohttp.ClientResponseError(
                        request_info=response.request_info,
                        history=response.history,
                        status=response.status,
                        message=f"Arca APIエラー HTTP {response.status}: {text}",
                    )

                data = await response.json()

                # レスポンス形式のバリデーション
                if "current_or_next_block" not in data or "following_block" not in data:
                    raise ValueError(
                        f"Arca APIのレスポンス形式が不正です (必須キー不足): {data}"
                    )

                return data
