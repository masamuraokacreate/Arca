# 開閉コントロール (Disclosure controls) - Apple Human Interface Guidelines

> 出典: [Apple Developer Documentation - 開閉コントロール (Disclosure controls)](https://developer.apple.com/jp/design/human-interface-guidelines/disclosure-controls/)

開閉コントロール（Disclosure controls）は、段階的な情報開示（Progressive Disclosure）を実現し、詳細情報や追加オプションの表示／非表示を切り替えるためのUI要素です。

---

## 開閉コントロールの種類

1. **開閉三角形 (Disclosure triangle):**
   * 主にmacOSや階層リストで使用されます。閉じた状態では右向き（RTL言語では左向き）、開いた状態では下向きを指します。
2. **開閉ボタン (Disclosure button):**
   * タップやクリックによって詳細パネルや折りたたみ領域を展開します。
3. **ディスクロージャインジケータ (Disclosure indicator):**
   * iOS/iPadOSのリスト行の末尾に表示される山形アイコン（Chevron: `>`）で、行をタップすると新しい詳細画面に遷移することを示します。

---

## ベストプラクティス (Best practices)

* **二次的または高度な情報の非表示に使用する。**
  デフォルトでは主要な情報のみを表示して画面をシンプルに保ち、必要なユーザのみが開閉コントロールを使って詳細や設定を展開できるようにします。
* **コントロールのラベルを明確にする。**
  何が開閉されるのかが明確に伝わるラベル（例: 「詳細設定」「詳細を表示」など）を付与します。
* **状態の変化をスムーズにアニメーション表示する。**
  コンテンツが展開・折りたたまれる際は滑らかなアニメーションを伴わせ、コンテンツの位置変化をユーザが把握できるようにします。
* **重要な必須項目を開閉コントロール内に隠さない。**
  タスクを完了するために必須のコントロールやエラーメッセージは、最初から表示しておきます。

---

## プラットフォーム別の考慮事項 (Platform considerations)

### iOS / iPadOS
* リスト内の階層遷移には山形記号（`UITableViewCell.AccessoryType.disclosureIndicator`）を使用します。
* インラインでの展開には `DisclosureGroup` を使用します。

### macOS
* アウトラインビュー、インスペクタ、Finderのリスト表示などで開閉三角形（`NSDisclosureButton`）が広く利用されます。

---

## リソース (Resources)

### デベロッパドキュメント
* **SwiftUI:** `DisclosureGroup`
* **UIKit:** `UITableViewCell.AccessoryType`
* **AppKit:** `NSButton.ButtonType.disclosure`
