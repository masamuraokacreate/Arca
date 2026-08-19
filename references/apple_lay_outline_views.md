# アウトラインビュー (Outline views) - Apple Human Interface Guidelines

> 出典: [Apple Developer Documentation - アウトラインビュー (Outline views)](https://developer.apple.com/jp/design/human-interface-guidelines/outline-views/)

アウトラインビュー（Outline View）は、ツリー状の階層データを表示・操作するためのコンポーネントです。各階層レベルがインデントされ、親ノードの横にある開閉三角形（Disclosure triangle）を使って展開・折りたたみができます。

---

## ベストプラクティス (Best practices)

* **ネストされた階層関係を持つデータに使用する。**
  ファイルシステムのツリー、プロジェクトの構造、ブックマークのフォルダなど、親子関係が深いデータの整理に最適です。
* **インデント幅を適切に設定する。**
  階層の深さが一目でわかるよう明確なインデントを設定しますが、深すぎるネストによってテキストが右端に押し出されないよう配慮します。
* **展開状態（Expanded / Collapsed）を記憶する。**
  ユーザがどのフォルダやカテゴリを展開していたかを記憶し、ビューを再表示した際にも前回の状態を復元します。
* **ドラッグ＆ドロップによる階層変更をサポートする。**
  アイテムを別の親ノードの中や前後にドラッグして直感的に階層構造を再編成できるようにします。
* **キーボード操作に対応する。**
  上/下矢印キーでの項目移動、右矢印キーでの展開、左矢印キーでの折りたたみなど、デスクトップ標準の操作をサポートします。

---

## プラットフォーム別の考慮事項 (Platform considerations)

### macOS
* macOSアプリのサイドバーやツリービューの基本コンポーネントです (`NSOutlineView`)。
* ソースリスト（Source List）スタイルを適用することで、macOS標準の半透明サイドバーに最適化された外観になります。

### iOS / iPadOS
* SwiftUIの `OutlineGroup` または `UICollectionView` の階層的リストレイアウトを使用することで、同様の階層構造を表現できます。

---

## リソース (Resources)

### デベロッパドキュメント
* **SwiftUI:** `OutlineGroup`
* **AppKit:** `NSOutlineView`
