# Apple Human Interface Guidelines (HIG) Master Reference

本書は、Appleプラットフォーム（iOS, iPadOS, macOS, visionOS, watchOS, tvOS）におけるUI/UXデザインおよびエンジニアリングのための統合マスターリファレンスです。
LLM（Gemini等）のシステムプロンプトやナレッジベースとして読み込ませることで、Apple HIGに完全準拠した設計・レビュー・SwiftUI/UIKit実装指示を可能にします。

---

## 目次
1. [コア設計原則 & ベストプラクティス](#1-コア設計原則--ベストプラクティス)
2. [基本要素 (Foundations)](#2-基本要素-foundations)
   - レイアウト (Layout)
   - アプリアイコン (App Icons)
   - マテリアル (Materials)
   - タイポグラフィ (Typography)
   - アクセシビリティ (Accessibility)
3. [コンテンツコンポーネント (Content)](#3-コンテンツコンポーネント-content)
   - グラフ (Charts)
   - 画像ビュー (Image Views)
   - テキストビュー (Text Views)
   - Webビュー (Web Views)
4. [レイアウトと構成 (Layout & Organization)](#4-レイアウトと構成-layout--organization)
   - ボックス (Boxes) / コレクション (Collections) / カラムビュー (Column Views)
   - 開閉コントロール (Disclosure Controls) / ラベル (Labels) / リストとテーブル (Lists & Tables)
   - ロックアップ (Lockups) / アウトラインビュー (Outline Views) / スプリットビュー (Split Views) / タブビュー (Tab Views)
5. [プラットフォーム別設計仕様 & 定数テーブル](#5-プラットフォーム別設計仕様--定数テーブル)

---

## 1. コア設計原則 & ベストプラクティス

* **視覚的階層 (Visual Hierarchy):** 重要度に応じた配置（上から下、先頭から末尾）。サイズ、ウェイト、コントラスト、余白を活用。
* **適応性 (Adaptability):** 画面サイズ、向き（縦/横）、ウインドウリサイズ、Dynamic Type、ダークモードに動的に追従。
* **セーフエリア遵守 (Safe Area):** ノッチ、Dynamic Island、角丸、ホームインジケータ等と干渉させず、重要要素はセーフエリア内に収める。背景・スクロール領域のみを端（フルブリード）まで拡張。
* **最小ターゲットサイズ:** タッチUI（iOS/iPadOS/watchOS）は最低 **44 × 44 pt**、空間UI（visionOS）は最低 **60 × 60 pt**。
* **システム標準の優先:** 独自コンポーネントを車輪の再発明せず、SwiftUI/UIKitの標準コンポーネントとセマンティックカラー/スタイルを使用。

---

## 2. 基本要素 (Foundations)

### ■ レイアウト (Layout)
* **グルーピングと余白:** 関連要素をマテリアル、背景色、区切り線で明確にまとめ、重要情報周囲に十分なネガティブスペースを確保。
* **階層の区別:** Liquid Glassやスクロールエッジエフェクトを活用し、コントロールとコンテンツの平面・重なりを明確化。
* **段階的開示 (Progressive Disclosure):** 全情報を詰め込まず、必要に応じてスクロール、展開、別ビューへ誘導。

### ■ アプリアイコン (App Icons)
* **レイヤード設計:** 前景レイヤー（エッジ明確化、不透明度による躍動感）＋ 背景レイヤー（単色/グラデーション、フルブリード）。
* **シンプルさとコアアイデア:** 写真やUI複製の流用禁止、テキストやAppleハードウェアレプリカの配置禁止。
* **外観バリエーション:** デフォルト、ダーク、クリア（Light/Dark）、淡色/Tinted（Light/Dark）で視認性を維持。
* **フォーマット:** 1024×1024 px（watchOSは1088×1088 px、tvOSは800×480 px）。ベクター（SVG/PDF）推奨。

### ■ マテリアル (Materials)
* **半透明とブラー:** 背景の気配を感じさせつつ前景を強調。Z軸の深さを表現。
* **厚み (Thickness):** `Ultra Thin`（極薄オーバーレイ）から `Ultra Thick`（強いモーダル分離）まで階層に応じて使い分け。
* **ビブランシー (Vibrancy):** セマンティックカラー（`label`, `secondaryLabel` 等）と組み合わせて自動コントラスト最適化。
* **アクセシビリティ自動適応:** 「透明度を下げる」設定時に不透明化・高コントラスト化へ自動フォールバック。

### ■ タイポグラフィ (Typography)
* **システムフォント:** SF Pro（標準サンセリフ）、SF Compact（watchOS向け）、SF Mono（等幅/コード/数値）、SF Rounded（親しみやすさ）、New York（セリフ体）。
* **Dynamic Type:** 全テキストスタイルでスケーリング対応。最大アクセシビリティサイズ時に縦積み（VStack）へ自動適応。
* **可読性:** 1行あたり50〜70文字（日本語20〜35文字程度）を推奨。

### ■ アクセシビリティ (Accessibility)
* **4原則:** 知覚可能 (Perceivable)、操作可能 (Operable)、理解可能 (Understandable)、堅牢 (Robust)。
* **VoiceOver:** 簡潔なラベル（「ボタン」等の重複単語を避ける）、適切なヒント・値、装飾要素の非表示（`accessibilityHidden`）。
* **コントラスト比:** 本文通常テキスト **4.5:1** 以上、大きなテキスト/太字 **3:1** 以上。色だけに情報を依存させない。
* **モーション/支援機能:** 「視覚効果を減らす (Reduce Motion)」、「コントラストを上げる」、音声コントロール、スイッチコントロールの完全サポート。

---

## 3. コンテンツコンポーネント (Content)

| コンポーネント | 用途・主要ルール | デベロッパAPI |
| :--- | :--- | :--- |
| **グラフ (Charts)** | トレンド（Line）、比較（Bar: Y軸下限は0固定）、相関（Point）、累積（Area）。Audio Graphs（音声ピッチ・パン）および代替データテーブル必須。 | SwiftUI: `Chart`<br>AX: `accessibilityChartDescriptor` |
| **画像ビュー (Image Views)** | 純粋な画像表示用。タップ等の操作を伴う場合は「ボタン」内に画像を配置。アスペクト比維持（Aspect Fit / Aspect Fill）。 | SwiftUI: `Image`, `AsyncImage`<br>UIKit: `UIImageView` |
| **テキストビュー (Text Views)** | 複数行・編集可能テキスト、リッチテキスト。有益テキストは選択/コピー可能にする。データ検出（URL/電話番号/住所）の活用。 | SwiftUI: `TextEditor`<br>UIKit: `UITextView` |
| **Webビュー (Web Views)** | アプリ内の一時的HTML/Web表示。進む/戻る操作を提供。フル機能ブラウザを自作せず `SFSafariViewController` を検討。 | WebKit: `WKWebView`<br>SafariServices: `SFSafariViewController` |

---

## 4. レイアウトと構成 (Layout & Organization)

| コンポーネント | 推奨される用途と設計指針 | 代表的なAPI |
| :--- | :--- | :--- |
| **ボックス (Boxes)** | 関連コントロールの視覚的囲い・設定のグルーピング。深い入れ子（ネスト）を禁止。セパレータとしても機能。 | SwiftUI: `GroupBox`<br>AppKit: `NSBox` |
| **コレクション (Collections)** | メディア・画像主体の視覚的グリッド/カルーセル。Compositional Layoutの活用。テキスト主体ならリストを選択。 | SwiftUI: `LazyVGrid`, `LazyHGrid`<br>UIKit: `UICollectionView` |
| **カラムビュー (Column Views)** | macOS Finder型の深いツリー階層ナビゲーション。右端に詳細プレビューカラムを配置。列幅リサイズ対応。 | AppKit: `NSBrowser` |
| **開閉コントロール (Disclosure Controls)** | 段階的開示（Progressive Disclosure）。開閉三角形、展開ボタン、リスト行末尾の山形記号（`>`）。 | SwiftUI: `DisclosureGroup`<br>UIKit: `disclosureIndicator` |
| **ラベル (Labels)** | 簡潔な名詞句（文末ピリオドなし）。SF Symbolsとテキストのベースライン整列。エラー値等はコピー可能にする。 | SwiftUI: `Label`, `Text`<br>UIKit: `UILabel` |
| **リストとテーブル (Lists & Tables)** | テキスト中心の一覧・検索・比較。スタイル（Plain / Grouped / Inset Grouped / Bordered）。スワイプアクション。 | SwiftUI: `List`, `Table`<br>UIKit: `UITableView` |
| **ロックアップ (Lockups)** | 画像＋テキスト＋バッジを一体化したカード/タイルUI（tvOSの視差カード、watchOS Smart Stack、App Store特集）。 | TVUIKit: `TVLockupView`<br>SwiftUI: `VStack`/`ZStack` |
| **アウトラインビュー (Outline Views)** | macOSサイドバーやファイルツリー構造。インデント幅の最適化と開閉状態の永続化（記憶）。 | SwiftUI: `OutlineGroup`<br>AppKit: `NSOutlineView` |
| **スプリットビュー (Split Views)** | 2〜3ペインのマスター/ディテール構造。コンパクト環境では単一スタックへ自動折りたたみ（Collapse）。 | SwiftUI: `NavigationSplitView`<br>UIKit: `UISplitViewController` |
| **タブビュー (Tab Views)** | 同一領域での排他的ペイン切り替え（設定パネル等）。各ペインの自己完結性。タブ数は原則6個以下。 | SwiftUI: `TabView`<br>AppKit: `NSTabView` |

---

## 5. プラットフォーム別設計仕様 & 定数テーブル

### ■ iOS / iPadOS デバイスサイズクラス (Size Classes)
* **全iPad（全世代/全画面）:** 縦向き `Regular × Regular` / 横向き `Regular × Regular`
* **iPhone Plus / Pro Max:** 縦向き `Compact (W) × Regular (H)` / 横向き `Regular (W) × Compact (H)`
* **iPhone 標準 / Pro / mini / SE:** 縦向き `Compact (W) × Regular (H)` / 横向き `Compact (W) × Compact (H)`

### ■ iOS / iPadOS 主要画面寸法表
| デバイスモデル | ポートレート寸法 (pt) | ピクセル解像度 (px) | スケールファクタ |
| :--- | :--- | :--- | :--- |
| **iPad Pro 13-inch** | 1032 × 1376 pt | 2064 × 2752 px | @2x |
| **iPad Pro 12.9-inch / Air 13-inch** | 1024 × 1366 pt | 2048 × 2732 px | @2x |
| **iPad Pro 11-inch (M4)** | 834 × 1210 pt | 1668 × 2420 px | @2x |
| **iPad Pro 11-inch (第1〜4世代)** | 834 × 1194 pt | 1668 × 2388 px | @2x |
| **iPad Air 11-inch / iPad 第10世代** | 820 × 1180 pt | 1640 × 2360 px | @2x |
| **iPad mini (第6世代以降)** | 744 × 1133 pt | 1488 × 2266 px | @2x |
| **iPhone 16 Pro Max / 17 Pro Max** | 440 × 956 pt | 1320 × 2868 px | @3x |
| **iPhone 16 Pro / 17 Pro / 17** | 402 × 874 pt | 1206 × 2622 px | @3x |
| **iPhone 16 Plus / 15 Pro Max / 14 Pro Max** | 430 × 932 pt | 1290 × 2796 px | @3x |
| **iPhone 16 / 15 Pro / 15 / 14 Pro** | 393 × 852 pt | 1179 × 2556 px | @3x |
| **iPhone 16e / 14 / 13 / 12** | 390 × 844 pt | 1170 × 2532 px | @3x |
| **iPhone 13 mini / 12 mini** | 360 × 780 pt | 1080 × 2340 px | @3x |
| **iPhone SE (第2・3世代)** | 375 × 667 pt | 750 × 1334 px | @2x |

### ■ タイポグラフィ仕様 (iOS/iPadOS 標準Large時)
| テキストスタイル | ウェイト | サイズ | 行送り (Leading) | トラッキング |
| :--- | :--- | :--- | :--- | :--- |
| **Large Title** | Regular | 34 pt | 41 pt | +0.37 pt |
| **Title 1** | Regular | 28 pt | 34 pt | +0.36 pt |
| **Title 2** | Regular | 22 pt | 28 pt | +0.35 pt |
| **Title 3** | Regular | 20 pt | 25 pt | +0.38 pt |
| **Headline** | Semi-Bold | 17 pt | 22 pt | -0.43 pt |
| **Body** | Regular | 17 pt | 22 pt | -0.43 pt |
| **Callout** | Regular | 16 pt | 21 pt | -0.31 pt |
| **Subheadline** | Regular | 15 pt | 20 pt | -0.23 pt |
| **Footnote** | Regular | 13 pt | 18 pt | -0.08 pt |
| **Caption 1** | Regular | 12 pt | 16 pt | 0.00 pt |
| **Caption 2** | Regular | 11 pt | 13 pt | +0.06 pt |

### ■ アプリアイコン仕様
| プラットフォーム | レイアウト形状 | システムマスク後形状 | サイズ | スタイル / 特性 |
| :--- | :--- | :--- | :--- | :--- |
| **iOS / iPadOS / macOS** | 正方形 | 角丸四角形 | 1024 × 1024 px | レイヤード（Default/Dark/Clear/Tinted） |
| **visionOS** | 正方形 | 円形 | 1024 × 1024 px | レイヤード（3D空間表現） |
| **watchOS** | 正方形 | 円形 | 1088 × 1088 px | レイヤード（黒背景回避） |
| **tvOS** | 長方形（横） | 角丸四角形 | 800 × 480 px | レイヤード（フォーカス視差） |
