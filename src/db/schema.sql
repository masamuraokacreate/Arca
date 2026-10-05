-- ===================================================================
-- Arca SQLite Schema: PM (Preventive Maintenance：周期保全・管理台帳)
-- 準拠: Core/Rules.md, Apple HIG
-- ===================================================================

-- 1. PMマスタ（管理台帳定義）
CREATE TABLE IF NOT EXISTS pm_masters (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    cycle_type TEXT NOT NULL,         -- 'monthly_day'(毎月○日), 'interval_month'(○ヶ月ごと), 'annual'(年1回) 等
    cycle_value INTEGER NOT NULL,      -- 例: 25(日), 3(ヶ月)
    calc_basis TEXT NOT NULL,         -- 'fixed_date'(予定日基準) / 'completion_date'(実績日基準)
    estimated_minutes INTEGER,        -- 設定目安工数（分）
    note_id TEXT,                     -- 連携ノートID (Aether Core)
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL
);

-- 2. 購入物テンプレート（台帳側で保持する定義）
CREATE TABLE IF NOT EXISTS pm_item_templates (
    id TEXT PRIMARY KEY,
    master_id TEXT NOT NULL,
    item_name TEXT NOT NULL,
    FOREIGN KEY (master_id) REFERENCES pm_masters(id) ON DELETE CASCADE
);

-- 3. 手順マスタ（チェック項目のテンプレート定義）
CREATE TABLE IF NOT EXISTS pm_task_templates (
    id TEXT PRIMARY KEY,
    master_id TEXT NOT NULL,
    content TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    FOREIGN KEY (master_id) REFERENCES pm_masters(id) ON DELETE CASCADE
);

-- 4. 実行ログ（カレンダーで完了した実績データ）
CREATE TABLE IF NOT EXISTS pm_logs (
    id TEXT PRIMARY KEY,
    master_id TEXT NOT NULL,
    started_at DATETIME,              -- 開始ボタン押下時刻 (時:分まで)
    completed_at DATETIME NOT NULL,    -- 完了ボタン押下時刻 (時:分まで)
    actual_minutes INTEGER,           -- 実測所要時間（分換算）
    diff_minutes INTEGER,             -- 目安との差分 (actual - estimated)
    FOREIGN KEY (master_id) REFERENCES pm_masters(id) ON DELETE CASCADE
);
