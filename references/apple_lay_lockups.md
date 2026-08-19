# ロックアップ (Lockups) - Apple Human Interface Guidelines

> 出典: [Apple Developer Documentation - ロックアップ (Lockups)](https://developer.apple.com/jp/design/human-interface-guidelines/lockups/)

ロックアップ（Lockup）は、画像、タイトル、サブタイトル、バッジ、評価などの関連する視覚要素を1つのまとまり（カードやタイル）として一体化させたコンポーネントです。tvOSのメディアカード、App Storeの特集カード、watchOSのSmart Stackなどで広く使用されています。

---

## ベストプラクティス (Best practices)

* **一貫した視覚的調和を保つ。**
  画像の上にテキストを重ねるか、画像の下や隣にテキストを配置するかを一貫させ、グループ内の要素の比率を整えます。
* **フォーカスやインタラクションに応答させる。**
  ユーザがロックアップに注目・ホバーした際、滑らかな拡大、ハイライト、シャドウの変化、視差効果（Parallax）を適用して、選択可能であることを示します。
* **テキストの階層を明確にする。**
  メインタイトルには太めのフォント、ジャンルや日付などの補助情報には小さくコントラストを抑えたフォントを適用します。
* **バッジやオーバーレイを適切に配置する。**
  「NEW」「4K」「ランキング」などのバッジを配置する場合は、画像の重要な部分を覆わないよう、四隅（一般的には右上や左上）に固定配置します。

---

## プラットフォーム別の考慮事項 (Platform considerations)

### tvOS
* tvOSにおける中心的なUIコンポーネントです（`TVLockupView`）。リモコンのフォーカス時にカードが拡大し、立体的なレイヤーアニメーション（視差）が発生します。

### watchOS
* Smart Stack（スマートスタック）のウィジェットやカードとして、一目で把握できるコンパクトなロックアップを構成します。

### iOS / iPadOS / macOS
* App StoreやApple Music、Apple TVアプリの「おすすめ」セクションなどでカードUIとして活用されます。

---

## リソース (Resources)

### デベロッパドキュメント
* **TVUIKit:** `TVLockupView`, `TVCardView`
* **SwiftUI:** カスタムビューコンポジション (`VStack`, `HStack`, `ZStack`)
