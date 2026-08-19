# ラベル (Labels) - Apple Human Interface Guidelines

> 出典: [Apple Developer Documentation - ラベル (Labels)](https://developer.apple.com/jp/design/human-interface-guidelines/labels/)

ラベル（Label）は、静的なテキスト、アイコン（SF Symbolsなど）、またはその両方を組み合わせて、UI要素の目的を説明したり短いステータスを伝えたりするコンポーネントです。

---

## ベストプラクティス (Best practices)

* **テキストは簡潔で明瞭にする。**
  短く要点を突いた語句を使用します。文章形式ではなく、名詞や短いフレーズを使用し、文末の句点（ピリオド）は省略します。
* **タイトルの大文字小文字ルール（Capitalization）を統一する。**
  英語などの言語では、ラベルには原則としてタイトルケース（Title Case: 各単語の先頭を大文字）またはセンテンスケース（Sentence Case）を一貫して適用します。
* **システムフォントと組み込みのテキストスタイルを使用する。**
  `Title`、`Headline`、`Body`、`Caption` などのスタイルを適用し、Dynamic Typeに対応させます。
* **アイコンとテキストを組み合わせる（Labelスタイル）。**
  アイコン（シンボル）の隣にテキストラベルを配置する場合、ベースラインとサイズを整列させ、統一された色味を適用します。
* **必要に応じてテキストのコピーを許可する。**
  エラーコード、バージョン番号、URLなど、ユーザが再利用したいと考えるラベルは、選択・コピー可能（Selectable）に設定します。
* **アクセシビリティラベルを適切に設定する。**
  アイコンのみのラベルや、視覚的な省略記号を含むラベルには、VoiceOverが正しく意味を読み上げられる代替テキストを付与します。

---

## プラットフォーム別の考慮事項 (Platform considerations)

### iOS / iPadOS / macOS / tvOS / visionOS / watchOS
すべてのプラットフォームで標準的に利用されます。SwiftUIの `Label` を使用すると、コンテキストに応じてアイコンのみ、テキストのみ、または両方を自動的に切り替えることができます。

---

## リソース (Resources)

### デベロッパドキュメント
* **SwiftUI:** `Label`, `Text`
* **UIKit:** `UILabel`
* **AppKit:** `NSTextField` (ラベルモード)
