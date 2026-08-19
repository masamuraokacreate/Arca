# タイポグラフィ (Typography) - Apple Human Interface Guidelines

> 出典: [Apple Developer Documentation - タイポグラフィ (Typography)](https://developer.apple.com/jp/design/human-interface-guidelines/typography/)

文字の配置、フォントの選択、テキストスタイルの設定は、アプリやゲームにおいて情報を明確に伝え、読みやすく魅力的な視覚階層を形成するための基本要素です。

Appleのプラットフォームには、各デバイスの画面特性や解像度に最適化されたシステムフォント（San FranciscoおよびNew York）が用意されており、Dynamic Type（動的テキストサイズ変更）やアクセシビリティ機能とシームレスに連携します。

---

## ベストプラクティス (Best practices)

* **可能な限りシステムフォントを使用する。**
  Appleが設計したSan Francisco（SF）およびNew Yorkフォントファミリは、広範なウェイト、サイズ、スタイルをサポートし、あらゆる言語やスケールで高い可読性を維持します。システムフォントを使用すると、Dynamic Typeや太字テキストなどのアクセシビリティ設定が自動的に適用されます。

* **Dynamic Typeをサポートし、すべてのテキストスタイルでテストする。**
  Dynamic Typeを使用すると、ユーザが好みの文字サイズを選択できます。大きなアクセシビリティサイズが設定された場合でもテキストが切り詰められたり重なったりせず、コンテナが適切に拡張されるようにレイアウトを設計してください。

* **組み込みのテキストスタイル（Text Styles）を使用する。**
  `Large Title`、`Title 1`、`Headline`、`Body`、`Caption` などのセマンティックなテキストスタイルを使用することで、コンテンツ間の明確な視覚的階層を確立できます。また、ユーザのフォントサイズ変更に応じて自動的にスケールします。

* **重要度に応じてフォントウェイト（太さ）を使い分ける。**
  見出しには `Bold` や `Semibold`、本文には `Regular` を使用するなど、重要度や情報の区切りをフォントの太さで表現します。ただし、過度なウェイトの多用は視覚的な混乱を招くため、1画面あたり2〜3種類程度に抑えることを推奨します。

* **行の長さ（Line length）と行間（Leading）を最適に保つ。**
  1行あたりの文字数が長すぎると次の行の先頭を見失いやすく、短すぎると視線の折り返しが頻繁になり読書リズムが損なわれます。一般的に1行あたり50〜70文字（日本語では20〜35文字程度）が快適とされます。行間もテキストスタイル定義の標準値を尊重してください。

* **カスタムフォントを使用する場合は可読性とアクセシビリティを確保する。**
  ブランディングのためにカスタムフォントを導入する場合は、小さいサイズでも判読できるか、Dynamic Typeに対応できるか、必要なウェイトやグリフ（特殊文字や多言語）が含まれているかを十分に確認してください。

---

## システムフォント (System fonts)

Appleプラットフォームでは、主に以下のシステムフォントが提供されています。

* **SF Pro:**
  iOS、iPadOS、macOS、tvOS、visionOSの主要なシステムフォント（サンセリフ体）。極小サイズから巨大な見出しまで高い視認性を誇ります。
* **SF Compact:**
  watchOS向けに最適化されたフォント。文字の丸みを抑え、フラットな側面を持たせることで、狭い画面でも文字間を詰めて効率的に情報を表示できます。
* **SF Mono:**
  等幅フォント。コードの表示や、数値データを縦一列に揃えて整列させたい場合に適しています。
* **SF Rounded:**
  角を丸めた親しみやすいデザインのバリアント。カジュアルなトーンや子ども向けアプリ、ゲームなどに適しています。
* **New York:**
  クラシックかつ洗練されたセリフフォント。読書アプリ、エディトリアル、歴史・文化的なコンテンツなどにエレガントな雰囲気をもたらします。

---

## Dynamic Type と テキストスタイル仕様 (Specifications)

以下は、iOS / iPadOS の標準サイズ（Large - デフォルト）における各テキストスタイルの仕様値です。

| テキストスタイル (Text Style) | ウェイト (Weight) | サイズ (pt) | 行送り (Leading / pt) | トラッキング (Tracking) |
| :--- | :--- | :--- | :--- | :--- |
| **Large Title** | Regular | 34 pt | 41 pt | 0.37 pt |
| **Title 1** | Regular | 28 pt | 34 pt | 0.36 pt |
| **Title 2** | Regular | 22 pt | 28 pt | 0.35 pt |
| **Title 3** | Regular | 20 pt | 25 pt | 0.38 pt |
| **Headline** | Semi-Bold | 17 pt | 22 pt | -0.43 pt |
| **Body** | Regular | 17 pt | 22 pt | -0.43 pt |
| **Callout** | Regular | 16 pt | 21 pt | -0.31 pt |
| **Subheadline** | Regular | 15 pt | 20 pt | -0.23 pt |
| **Footnote** | Regular | 13 pt | 18 pt | -0.08 pt |
| **Caption 1** | Regular | 12 pt | 16 pt | 0.00 pt |
| **Caption 2** | Regular | 11 pt | 13 pt | 0.06 pt |

> **注記:** Dynamic Typeが有効な場合、ユーザ設定（xSmall 〜 Accessibility XXXLarge）に応じてこれらすべてのサイズと行送りが動的にスケーリングされます。

---

## プラットフォーム別の考慮事項 (Platform considerations)

### iOS / iPadOS
* **情報の優先度に応じた階層化:** `Large Title` や `Title` を使って画面の目的を明確にし、本文やリスト項目には `Body` や `Subheadline` を適用します。
* **アクセシビリティサイズへの対応:** 最も大きいアクセシビリティテキストサイズでは、横並びのレイアウト（アイコンとテキストなど）を縦並び（スタック）に切り替えるレイアウト適応が必要です。

### macOS
* **画面密度とコントロール:** macOSではポインタ操作を前提としており、iOSよりも情報密度が高くなります。ボタンやラベル、テーブル行には `systemFont(ofSize:)` やコントロール専用の標準フォントサイズ（Regular, Small, Mini）が使用されます。

### visionOS
* **空間での可読性と背景コントラスト:**
  visionOSでは、ウィンドウのGlassマテリアルを通して背後の実世界や空間が見えるため、可読性を維持するために少し太めのウェイト（例: 通常のBodyに `Medium` や `Semibold`）を使用することが推奨されます。
* **視界とスケール:** 遠くにあるウインドウでも文字が潰れないよう、視覚的な角度（Angular size）に基づいてシステムが文字サイズを自動調整します。

### tvOS
* **離れた距離（10フィートUI）からの視認性:**
  テレビは数メートル離れた場所から閲覧されるため、全体的に大きめのフォントサイズと太めのウェイトを使用します。
* **フォーカス時のハイライト:** フォーカスが当たった要素のテキストは、拡大やカラー変更により選択状態を明確にします。

### watchOS
* **SF Compactの活用:** 狭い画面幅を最大限に活かすため、文字幅がスリムなSF Compactが標準採用されています。
* **一目でわかる情報設計:** 長文を避け、見出しやショートメッセージを中心に構成します。

---

## リソース (Resources)

### フォントのダウンロード (Downloads)
* **SF Pro, SF Compact, SF Mono, SF Rounded, New York フォントデータ**（Apple Developer リソースより入手可能）

### デベロッパドキュメント (Developer documentation)
* **SwiftUI:**
  * `Font` (`.largeTitle`, `.title`, `.headline`, `.body`, `.callout`, `.footnote`, `.caption`)
  * `dynamicTypeSize(_:)`
* **UIKit:**
  * `UIFont`
  * `UIFontMetrics`
  * `UIFontDescriptor`
* **AppKit:**
  * `NSFont`

### 関連トピック (Related)
* **アクセシビリティ (Accessibility)**
* **右から左 (Right to left)**
* **インクルージョン (Inclusion)**
