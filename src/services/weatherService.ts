/**
 * src/services/weatherService.ts
 * Arca — 4勤2休サイクルリボン用 天気予報サービス
 *
 * 設計原則:
 * - 登録不要・APIキー不要のオープン気象API (Open-Meteo) を使用
 * - 3時間の localStorage キャッシュで無駄なネットワーク負荷を抑制
 * - オフライン・エラー時は安全なフォールバック値を返し、UI描画を妨げない
 */

export interface WeatherDayInfo {
  date: string; // "YYYY-MM-DD"
  weatherCode: number;
  maxTemp: number; // 最高気温（℃）
  minTemp: number; // 最低気温（℃）
  condition: "sunny" | "partly_cloudy" | "cloudy" | "rainy" | "snowy" | "stormy";
}

const CACHE_KEY = "arca_weather_forecast_cache";
const CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3時間

interface CachedData {
  timestamp: number;
  data: Record<string, WeatherDayInfo>;
}

/**
 * WMO Weather interpretation codes を簡潔な condition にマッピング
 */
export function mapWeatherCodeToCondition(
  code: number
): WeatherDayInfo["condition"] {
  // 0: Clear sky
  if (code === 0) return "sunny";
  // 1, 2: Mainly clear, partly cloudy
  if (code === 1 || code === 2) return "partly_cloudy";
  // 3, 45, 48: Overcast, Fog
  if (code === 3 || code === 45 || code === 48) return "cloudy";
  // 51-67, 80-82: Drizzle / Rain / Showers
  if (
    (code >= 51 && code <= 67) ||
    (code >= 80 && code <= 82)
  ) {
    return "rainy";
  }
  // 71-77, 85-86: Snow
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
    return "snowy";
  }
  // 95-99: Thunderstorm
  if (code >= 95 && code <= 99) {
    return "stormy";
  }
  return "cloudy";
}

/**
 * 日付リストに対応するフォールバック天気データを生成（ネットワーク切断時用）
 */
function createFallbackWeather(dates: string[]): Record<string, WeatherDayInfo> {
  const result: Record<string, WeatherDayInfo> = {};
  for (const d of dates) {
    result[d] = {
      date: d,
      weatherCode: 1,
      maxTemp: 24,
      minTemp: 16,
      condition: "sunny",
    };
  }
  return result;
}

/**
 * サイクル期間（日付一覧）の天気予報を取得する
 */
export async function fetchWeatherForecast(
  dates: string[]
): Promise<Record<string, WeatherDayInfo>> {
  if (!dates || dates.length === 0) return {};

  // 1. キャッシュの確認
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const cached: CachedData = JSON.parse(raw);
      if (Date.now() - cached.timestamp < CACHE_TTL_MS) {
        // 要求された日付が概ねキャッシュに含まれているか
        const hasAll = dates.every((d) => Boolean(cached.data[d]));
        if (hasAll) {
          return cached.data;
        }
      }
    }
  } catch {
    // キャッシュ読み取り失敗は無視してフェッチへ進む
  }

  // 2. Open-Meteo API フェッチ（東京: 緯度35.6895, 経度139.6917）
  try {
    const url =
      "https://api.open-meteo.com/v1/forecast?latitude=35.6895&longitude=139.6917&daily=weathercode,temperature_2m_max,temperature_2m_min&timezone=Asia%2FTokyo";
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) }).catch(() => null);
    if (!res || !res.ok) {
      throw new Error("Open-Meteo fetch failed");
    }

    const json = await res.json();
    const daily = json?.daily;
    if (!daily || !Array.isArray(daily.time)) {
      throw new Error("Invalid daily weather format");
    }

    const fetchedMap: Record<string, WeatherDayInfo> = {};
    for (let i = 0; i < daily.time.length; i++) {
      const dStr = daily.time[i];
      const code = Number(daily.weathercode?.[i] ?? 1);
      const maxT = Math.round(Number(daily.temperature_2m_max?.[i] ?? 22));
      const minT = Math.round(Number(daily.temperature_2m_min?.[i] ?? 15));

      fetchedMap[dStr] = {
        date: dStr,
        weatherCode: code,
        maxTemp: maxT,
        minTemp: minT,
        condition: mapWeatherCodeToCondition(code),
      };
    }

    // キャッシュを更新
    try {
      const toCache: CachedData = {
        timestamp: Date.now(),
        data: fetchedMap,
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(toCache));
    } catch {
      // localStorage 書き込みエラーは無視
    }

    // サイクル内の日付で未取得のものがあればフォールバックで補完
    const fullResult: Record<string, WeatherDayInfo> = {};
    for (const d of dates) {
      if (fetchedMap[d]) {
        fullResult[d] = fetchedMap[d];
      } else {
        fullResult[d] = {
          date: d,
          weatherCode: 1,
          maxTemp: 24,
          minTemp: 16,
          condition: "sunny",
        };
      }
    }

    return fullResult;
  } catch {
    // オフライン・タイムアウト・CORS等の場合は既存キャッシュまたは安全なフォールバック
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const cached: CachedData = JSON.parse(raw);
        if (cached.data) return cached.data;
      }
    } catch {
      // 無視
    }
    return createFallbackWeather(dates);
  }
}
