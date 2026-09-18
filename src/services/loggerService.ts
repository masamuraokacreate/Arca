/**
 * src/services/loggerService.ts
 * Arca — システム保守・診断用リングバッファロガー
 *
 * 設計原則:
 * - 最大100件のメモリ上リングバッファ
 * - sessionStorage への一時永続化
 * - 「Logging モード」ON/OFF トグル管理（localStorage）
 * - AI 解析用に整形された一括コピー機能
 */

export type LogLevel = "info" | "success" | "warn" | "error";
export type LogCategory = "firestore" | "google_api" | "auth" | "app" | (string & {});

export interface LogEntry {
  id: string;
  timestamp: string; // ISO 8601
  level: LogLevel;
  category: LogCategory;
  message: string;
  details?: unknown;
}

const MAX_LOGS = 100;
const STORAGE_KEY_ENABLED = "arca_logging_enabled";
const STORAGE_KEY_LOGS = "arca_logging_buffer";

class LoggerService {
  private buffer: LogEntry[] = [];
  private isEnabled: boolean = false;
  private listeners: Set<(logs: LogEntry[]) => void> = new Set();

  constructor() {
    if (typeof window !== "undefined") {
      try {
        this.isEnabled = localStorage.getItem(STORAGE_KEY_ENABLED) === "true";
        const saved = sessionStorage.getItem(STORAGE_KEY_LOGS);
        if (saved) {
          this.buffer = JSON.parse(saved);
        }
      } catch {
        // storage エラー無視
      }
    }
  }

  /**
   * Logging モードの有効/無効状態を取得
   */
  public getLoggingEnabled(): boolean {
    return this.isEnabled;
  }

  /**
   * Logging モードの有効/無効を設定
   */
  public setLoggingEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY_ENABLED, String(enabled));
      } catch {
        // storage エラー無視
      }
    }
    if (enabled) {
      this.info("app", "Logging mode enabled");
    } else {
      this.info("app", "Logging mode disabled");
    }
    this.notify();
  }

  /**
   * ログを追加
   */
  public log(level: LogLevel, category: LogCategory, message: string, details?: unknown): void {
    if (!this.isEnabled) return;

    const entry: LogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      details,
    };

    this.buffer.unshift(entry);
    if (this.buffer.length > MAX_LOGS) {
      this.buffer.length = MAX_LOGS;
    }

    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(this.buffer));
      } catch {
        // storage エラー無視
      }
    }

    this.notify();
  }

  public info(category: LogCategory, message: string, details?: unknown): void {
    this.log("info", category, message, details);
  }

  public success(category: LogCategory, message: string, details?: unknown): void {
    this.log("success", category, message, details);
  }

  public warn(category: LogCategory, message: string, details?: unknown): void {
    this.log("warn", category, message, details);
  }

  public error(category: LogCategory, message: string, details?: unknown): void {
    this.log("error", category, message, details);
  }

  /**
   * 現在のログ一覧を取得（新しい順）
   */
  public getLogs(): LogEntry[] {
    return [...this.buffer];
  }

  /**
   * ログを全消去
   */
  public clearLogs(): void {
    this.buffer = [];
    if (typeof window !== "undefined") {
      try {
        sessionStorage.removeItem(STORAGE_KEY_LOGS);
      } catch {
        // storage エラー無視
      }
    }
    this.notify();
  }

  /**
   * リスナー登録（購読）
   */
  public subscribe(callback: (logs: LogEntry[]) => void): () => void {
    this.listeners.add(callback);
    callback(this.getLogs());
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notify(): void {
    const current = this.getLogs();
    this.listeners.forEach((listener) => {
      try {
        listener(current);
      } catch (err) {
        console.error("[LoggerService] listener error:", err);
      }
    });
  }

  /**
   * AI 解析向け Markdown フォーマットテキストを生成
   */
  public formatForAi(): string {
    if (this.buffer.length === 0) {
      return "No logs recorded.";
    }

    const lines: string[] = [
      "# Arca System Diagnostic Log Dump",
      `Dumped At: ${new Date().toISOString()}`,
      `Total Entries: ${this.buffer.length}`,
      "",
      "```text",
    ];

    // 時系列順（古い順）に並べ替えて出力
    const chronological = [...this.buffer].reverse();
    for (const entry of chronological) {
      const time = entry.timestamp.slice(11, 23);
      const level = entry.level.toUpperCase().padEnd(7, " ");
      const category = entry.category.toUpperCase().padEnd(10, " ");
      lines.push(`[${time}] [${level}] [${category}] ${entry.message}`);
      if (entry.details !== undefined && entry.details !== null) {
        try {
          const detailStr =
            typeof entry.details === "string"
              ? entry.details
              : JSON.stringify(entry.details, null, 2);
          const indented = detailStr
            .split("\n")
            .map((l) => `    ${l}`)
            .join("\n");
          lines.push(indented);
        } catch {
          lines.push(`    [Unserializable Details]`);
        }
      }
    }

    lines.push("```");
    return lines.join("\n");
  }
}

export const logger = new LoggerService();
