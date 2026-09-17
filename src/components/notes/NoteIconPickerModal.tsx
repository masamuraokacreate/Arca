/**
 * src/components/notes/NoteIconPickerModal.tsx
 * Arca — ノート用 SVGアイコン選択モーダル & NoteIcon コンポーネント (Apple HIG 準拠)
 */

import React, { useState, useMemo, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Folder,
  FileText,
  Book,
  Bookmark,
  Star,
  Heart,
  Sparkles,
  Lightbulb,
  Compass,
  Code,
  Terminal,
  Database,
  CheckSquare,
  List,
  Calendar,
  Layers,
  Flag,
  Tag,
  MapPin,
  Coffee,
  Rocket,
  Music,
  Image as ImageIcon,
  Shield,
  Zap,
  Box,
  Package,
  Smile,
  Layout,
  Cpu,
  Flame,
  Key,
  Award,
  Archive,
  Inbox,
  Bell,
  Globe,
  Feather,
  Target,
  Briefcase,
  GraduationCap,
  Gamepad2,
  X,
  Search,
  RotateCcw,
} from "lucide-react";

export interface IconDefinition {
  id: string;
  name: string;
  category: string;
  keywords: string[];
  component: React.ComponentType<{ className?: string; size?: number; style?: React.CSSProperties }>;
}

export const NOTE_ICONS: IconDefinition[] = [
  { id: "folder", name: "フォルダー", category: "基本", keywords: ["folder", "dir"], component: Folder },
  { id: "file-text", name: "ドキュメント", category: "基本", keywords: ["file", "document", "text"], component: FileText },
  { id: "book", name: "ブック", category: "ドキュメント", keywords: ["book", "本", "読書"], component: Book },
  { id: "bookmark", name: "ブックマーク", category: "ドキュメント", keywords: ["bookmark", "しおり"], component: Bookmark },
  { id: "star", name: "スター", category: "マーク", keywords: ["star", "お気に入り", "星"], component: Star },
  { id: "heart", name: "ハート", category: "マーク", keywords: ["heart", "愛", "お気に入り"], component: Heart },
  { id: "sparkles", name: "きらめき", category: "マーク", keywords: ["sparkles", "ai", "magic"], component: Sparkles },
  { id: "lightbulb", name: "ひらめき", category: "マーク", keywords: ["idea", "lightbulb", "アイディア"], component: Lightbulb },
  { id: "target", name: "ターゲット", category: "タスク", keywords: ["target", "目標", "goal"], component: Target },
  { id: "check-square", name: "チェック", category: "タスク", keywords: ["check", "todo", "task"], component: CheckSquare },
  { id: "list", name: "リスト", category: "タスク", keywords: ["list", "一覧"], component: List },
  { id: "calendar", name: "カレンダー", category: "タスク", keywords: ["calendar", "date", "日付"], component: Calendar },
  { id: "flag", name: "フラグ", category: "タスク", keywords: ["flag", "旗", "重要"], component: Flag },
  { id: "tag", name: "タグ", category: "タスク", keywords: ["tag", "ラベル"], component: Tag },
  { id: "briefcase", name: "ビジネス", category: "ワーク", keywords: ["work", "job", "仕事", "会社"], component: Briefcase },
  { id: "graduation-cap", name: "学習", category: "ワーク", keywords: ["study", "school", "勉強", "学校"], component: GraduationCap },
  { id: "code", name: "コード", category: "開発", keywords: ["code", "dev", "プログラミング"], component: Code },
  { id: "terminal", name: "ターミナル", category: "開発", keywords: ["terminal", "cli", "shell"], component: Terminal },
  { id: "database", name: "データベース", category: "開発", keywords: ["db", "database", "データ"], component: Database },
  { id: "cpu", name: "CPU", category: "開発", keywords: ["cpu", "hardware", "tech"], component: Cpu },
  { id: "compass", name: "コンパス", category: "ライフ", keywords: ["compass", "方位", "旅行"], component: Compass },
  { id: "map-pin", name: "マップピン", category: "ライフ", keywords: ["map", "location", "場所"], component: MapPin },
  { id: "coffee", name: "カフェ", category: "ライフ", keywords: ["coffee", "tea", "休憩"], component: Coffee },
  { id: "rocket", name: "ロケット", category: "ライフ", keywords: ["rocket", "launch", "発進"], component: Rocket },
  { id: "smile", name: "スマイル", category: "ライフ", keywords: ["smile", "happy", "笑顔"], component: Smile },
  { id: "music", name: "音楽", category: "メディア", keywords: ["music", "audio", "曲"], component: Music },
  { id: "image", name: "画像", category: "メディア", keywords: ["image", "picture", "写真"], component: ImageIcon },
  { id: "gamepad-2", name: "ゲーム", category: "メディア", keywords: ["game", "controller", "play", "ゲーム", "コントローラー"], component: Gamepad2 },
  { id: "feather", name: "フェザー", category: "マーク", keywords: ["feather", "write", "執筆"], component: Feather },
  { id: "layers", name: "レイヤー", category: "構造", keywords: ["layers", "stack", "階層"], component: Layers },
  { id: "box", name: "ボックス", category: "構造", keywords: ["box", "箱", "コンテナ"], component: Box },
  { id: "package", name: "パッケージ", category: "構造", keywords: ["package", "荷物"], component: Package },
  { id: "archive", name: "アーカイブ", category: "構造", keywords: ["archive", "保管"], component: Archive },
  { id: "inbox", name: "インボックス", category: "構造", keywords: ["inbox", "受信箱"], component: Inbox },
  { id: "shield", name: "シールド", category: "システム", keywords: ["shield", "security", "安全"], component: Shield },
  { id: "key", name: "キー", category: "システム", keywords: ["key", "pass", "鍵"], component: Key },
  { id: "zap", name: "電光", category: "マーク", keywords: ["zap", "lightning", "速い"], component: Zap },
  { id: "flame", name: "炎", category: "マーク", keywords: ["flame", "fire", "熱い"], component: Flame },
  { id: "award", name: "アワード", category: "マーク", keywords: ["award", "medal", "表彰"], component: Award },
  { id: "bell", name: "ベル", category: "システム", keywords: ["bell", "notice", "通知"], component: Bell },
  { id: "globe", name: "地球儀", category: "ライフ", keywords: ["globe", "world", "世界"], component: Globe },
  { id: "layout", name: "レイアウト", category: "構造", keywords: ["layout", "ui", "設計"], component: Layout },
];

const ICON_MAP = new Map<string, IconDefinition>(NOTE_ICONS.map((i) => [i.id, i]));

/**
 * ノートのアイコンを描画するコンポーネント
 */
export function NoteIcon({
  icon,
  defaultIcon,
  className = "w-4 h-4",
  style,
}: {
  icon?: string;
  defaultIcon?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  if (!icon) {
    return <>{defaultIcon ?? <FileText className={className} style={style} />}</>;
  }

  // Lucideアイコン名に一致する場合
  const def = ICON_MAP.get(icon);
  if (def) {
    const Component = def.component;
    return <Component className={className} style={style} />;
  }

  // 直接SVGコードが渡された場合（安全なインラインSVG）
  if (icon.startsWith("<svg") && icon.endsWith("</svg>")) {
    return (
      <span
        className={`inline-flex items-center justify-center shrink-0 ${className}`}
        style={style}
        dangerouslySetInnerHTML={{ __html: icon }}
      />
    );
  }

  return <>{defaultIcon ?? <FileText className={className} style={style} />}</>;
}

export interface NoteIconPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentIcon?: string;
  onSelectIcon: (iconId: string | null) => void;
  noteTitle?: string;
}

export function NoteIconPickerModal({
  isOpen,
  onClose,
  currentIcon,
  onSelectIcon,
  noteTitle,
}: NoteIconPickerModalProps) {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("すべて");
  const modalRef = useRef<HTMLDivElement>(null);

  // カテゴリ一覧
  const categories = useMemo(() => {
    const cats = new Set<string>();
    NOTE_ICONS.forEach((i) => cats.add(i.category));
    return ["すべて", ...Array.from(cats)];
  }, []);

  // フィルタリング
  const filteredIcons = useMemo(() => {
    const q = search.trim().toLowerCase();
    return NOTE_ICONS.filter((item) => {
      if (activeCategory !== "すべて" && item.category !== activeCategory) {
        return false;
      }
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q) ||
        item.keywords.some((k) => k.toLowerCase().includes(q))
      );
    });
  }, [search, activeCategory]);

  // モーダル外クリック・Escapeキーで閉じる
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm select-none animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md max-h-[85vh] bg-[var(--bg-card-solid,rgba(255,255,255,0.98))] rounded-2xl shadow-2xl border border-black/[0.06] dark:border-white/[0.08] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-black/[0.05] dark:border-white/[0.06] shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-[#B58D3D] flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-charcoal truncate">
                アイコンを選択
              </h3>
              {noteTitle && (
                <p className="text-[11px] text-charcoal-light truncate max-w-[240px]">
                  {noteTitle}
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-charcoal-light hover:text-charcoal hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer border-none bg-transparent"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 検索バー */}
        <div className="p-3 border-b border-black/[0.04] dark:border-white/[0.05] shrink-0">
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-charcoal-xlight absolute left-3 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="アイコンを検索（例: 本, 星, タスク...）"
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.05] border border-black/[0.05] dark:border-white/[0.08] text-xs text-charcoal outline-none focus:border-amber-500/50 transition-colors"
              autoFocus
            />
          </div>

          {/* カテゴリピル */}
          <div className="flex items-center gap-1 mt-2.5 overflow-x-auto no-scrollbar py-0.5">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={`px-2.5 py-0.5 rounded-lg text-[11px] font-medium shrink-0 transition-colors cursor-pointer border-none ${
                  activeCategory === cat
                    ? "bg-[#B58D3D] text-white"
                    : "bg-black/[0.03] dark:bg-white/[0.05] text-charcoal-light hover:text-charcoal"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* アイコングリッド */}
        <div className="flex-1 overflow-y-auto p-3 grid grid-cols-5 sm:grid-cols-6 gap-2 min-h-[200px]">
          {filteredIcons.map((item) => {
            const IconComp = item.component;
            const isSelected = currentIcon === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectIcon(item.id);
                  onClose();
                }}
                className={`flex flex-col items-center justify-center p-2.5 rounded-xl transition-all cursor-pointer border-none group ${
                  isSelected
                    ? "bg-amber-500/20 text-[#B58D3D] ring-2 ring-amber-500/50 shadow-xs"
                    : "bg-black/[0.02] dark:bg-white/[0.03] text-charcoal-light hover:text-charcoal hover:bg-black/[0.05] dark:hover:bg-white/[0.06]"
                }`}
                title={`${item.name} (${item.id})`}
              >
                <IconComp className="w-5 h-5 mb-1 group-hover:scale-110 transition-transform" />
                <span className="text-[10px] truncate max-w-full font-medium">
                  {item.name}
                </span>
              </button>
            );
          })}
          {filteredIcons.length === 0 && (
            <div className="col-span-full py-8 text-center text-xs text-charcoal-light">
              該当するアイコンが見つかりませんでした
            </div>
          )}
        </div>

        {/* フッター（リセットボタン） */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-black/[0.04] dark:border-white/[0.05] bg-black/[0.01] dark:bg-white/[0.01] shrink-0">
          <button
            type="button"
            onClick={() => {
              onSelectIcon(null);
              onClose();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-charcoal-light hover:text-charcoal hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer border-none bg-transparent"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>デフォルトに戻す</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl text-xs font-medium text-charcoal bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 transition-colors cursor-pointer border-none"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
