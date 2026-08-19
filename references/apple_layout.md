# レイアウト (Layout) - Apple Human Interface Guidelines

> 出典: [Apple Developer Documentation - レイアウト (Layout)](https://developer.apple.com/jp/design/human-interface-guidelines/layout)

さまざまなコンテキストに適応する一貫したレイアウトを使用すると、アプリがより使いやすくなり、ユーザがお気に入りのアプリやゲームをどのデバイスでも楽しめるようになります。

アプリのレイアウトは、ユーザがアプリを開いた瞬間からコンテンツを把握するのに役立ちます。ユーザは、コントロールとコンテンツの間に慣れ親しんだ関係があることで、アプリの機能を使いやすく探しやすくなると期待しています。この点を考慮してレイアウトをデザインすることで、プラットフォームでのアプリの使用感が親しみやすいものになります。

Appleは、Appleテクノロジーを組み込み、すべてのAppleプラットフォームで実行できるアプリやゲームの設計に役立つように、テンプレートやガイドなどのリソースを提供しています。Appleデザインリソースを参照してください。

---

## ベストプラクティス (Best practices)

* **関連のある項目をグループ分けして必要な情報を見つけやすくする。**
  例えば、余白（ネガティブスペース）、背景の形状、カラー、マテリアル、区切り線を使って、要素同士を関連付けたり、情報を明確な領域に分けることをおすすめします。その際、コンテンツとコントロールが明確に区別されていることを確認してください。

* **周りに十分なスペースを確保して重要な情報を見つけやすくする。**
  最も重要な情報は早く見たいものです。些末な情報を詰め込んだために肝心の情報が埋もれてしまったということがないようにしましょう。副次的な情報は、ウインドウのほかの部分で確認できるようにするか、追加のビューに含めるようにしてください。

* **コンテンツを画面またはウインドウいっぱいに拡張する。**
  バックグラウンドやフルスクリーンのアートワークがディスプレイの端まで拡張されていることを確認します。また、スクロール可能なレイアウトの場合は、デバイスの画面の下や左右まで続いていることを確認します。サイドバーやタブバーなどのコントロールやナビゲーションコンポーネントは、同じ平面ではなくコンテンツに重ねて表示されます。レイアウトではこの点を考慮することが重要です。
  コンテンツがウインドウ全体に広がっていない場合は、背景拡張ビューを使用して、サイドバーやインスペクタの下など、コントロールレイヤーの後ろにコンテンツを表示します。デベロッパ向けのガイダンスは、`backgroundExtensionEffect()` および `UIBackgroundExtensionView` を参照してください。

* **コントロールとコンテンツを区別する。**
  Liquid Glassマテリアルを活用して、コントロールの明確な見た目をiOS、iPadOS、macOSで一貫したものにします。背景の代わりに、スクロールエッジエフェクトを使用して、コンテンツとコントロール領域の間の遷移を表現します。ガイダンスは、スクロールビューを参照してください。

* **相対的重要性を伝えるように項目を配置する。**
  多くのユーザは、上から下、先頭側から末尾側というように、横書きの文章を読むときの順で項目を見ていくので、特に重要な項目は、ウインドウ、ディスプレイ、視野の左上付近に配置しておくと基本的にうまくいきます。言語によって読む方向が異なる点に注意し、右から左に記述する言語（RTL）を考慮してデザインしてください。

* **コンポーネント同士を位置合わせすることでスキャンを容易にし、構成や階層構造を分かりやすく伝える。**
  位置を合わせるとアプリの表示内容がきれいに整理されるほか、スクロールしているときや目を動かしているときでもコンテンツを追いやすくなるため、より情報を見つけやすくなります。インデントと同様、位置合わせには、情報の階層構造が理解しやすくなるメリットもあります。

* **現在見えているもの以外にもコンテンツがあることが分かるように段階的な表示（Progressive Disclosure）を利用する。**
  大きなコレクション内の全項目を一度に表示することができない場合などは、現在見えているもの以外にも項目があることを示す必要があります。プラットフォームによりますが、例えば開閉コントロールを使用したり、項目の一部が見えるようにしておけば、ビューのスクロールなどによってさらにコンテンツが現れることが伝わります。

* **コントロールが使いやすくなるように、周囲に十分なスペースを確保し、論理的なセクションにグループ分けする。**
  関係のないコントロール同士の距離が近すぎたり、ほかのコンテンツを周りに詰め込んだりすると、コントロールを区別したり機能を理解したりするのが難しくなることがあります。こうなると、アプリやゲームが使いにくくなってしまうかもしれません。ガイダンスは、ツールバーを参照してください。

* **コンテキストの変更に適切に適応しながら、認識可能な一貫性を維持するレイアウトを設計する。**
  ユーザは、デバイスを回転させたり、ウインドウのサイズを変更したり、ディスプレイを追加したり、別のデバイスに切り替えたりしたときでも、使いやすさが保たれ、一貫した操作感であることを期待します。システム定義のセーフエリア、マージン、ガイドを尊重し、レイアウト修飾子を指定してインターフェイス内のビュー配置を微調整することで、適応性の高いインターフェイスを実現できます。

---

## ガイドとセーフエリア (Guides and safe areas)

レイアウトガイド（Layout Guide）は、画面上でコンテンツを配置、整列、およびスペース設定するのに役立つ長方形の領域を定義します。システムには、コンテンツの周囲に標準のマージンを適用し、最適な読みやすさのためにテキストの幅を制限することを容易にする事前定義されたレイアウトガイドが含まれています。また、カスタムレイアウトガイドを定義することもできます。開発者向けガイダンスについては、`UILayoutGuide` および `NSLayoutGuide` を参照してください。

セーフエリア（Safe Area）は、ツールバー、ナビゲーションバー、タブバー、またはその他のビューによって覆われないビュー内の領域を定義します。また、ハードウェアの角丸、カメラハウジング（ノッチやDynamic Island）、ホームインジケータなどのシステム要素との重なりを回避します。すべてのインタラクティブなコントロールおよび重要な情報はセーフエリア内に配置し、背景やスクロール可能なコンテンツのみを画面端まで拡張させてください。

---

## 適応性 (Adaptability)

すべてのアプリやゲームは、デバイスやシステムのコンテキストが変化したときに適応する必要があります。iOS、iPadOS、tvOS、visionOSでは、アプリやゲームの見た目に影響することがあるデバイス環境の違いを特徴付ける、一連の特性が定義されています。

* **Dynamic Typeのサポート:** ユーザがテキストサイズを変更したときに動的に適応するレイアウトを設計します。iOS、iPadOS、tvOS、visionOS、watchOSでDynamic Typeをサポートすることで、文字の大きさに応じてレイアウトが適切にリフロー（再配置）されます。
* **画面サイズ・向きへの適応:** デバイスの回転（縦向き/横向き）や、iPadOSおよびmacOSでのウインドウリサイズ、マルチタスク（Split ViewやStage Managerなど）に柔軟に対応します。

---

## プラットフォーム別の仕様 (Specifications)

### iOS / iPadOS デバイスサイズクラス (Device size classes)

サイズクラスは、画面の幅や高さの空間的制約を表す値（`regular` または `compact`）です。

| モデル (Model) | 縦向き (Portrait) | 横向き (Landscape) |
| :--- | :--- | :--- |
| **iPad Pro 13-inch** | Regular width, Regular height | Regular width, Regular height |
| **iPad Pro 12.9-inch** | Regular width, Regular height | Regular width, Regular height |
| **iPad Pro 11-inch** | Regular width, Regular height | Regular width, Regular height |
| **iPad Pro 10.5-inch** | Regular width, Regular height | Regular width, Regular height |
| **iPad Air (各世代)** | Regular width, Regular height | Regular width, Regular height |
| **iPad (各世代)** | Regular width, Regular height | Regular width, Regular height |
| **iPad mini (各世代)** | Regular width, Regular height | Regular width, Regular height |
| **iPhone Pro Max / Plus 各種** | Compact width, Regular height | Regular width, Compact height |
| **iPhone Pro / 標準モデル 各種** | Compact width, Regular height | Compact width, Compact height |
| **iPhone mini / SE 各種** | Compact width, Regular height | Compact width, Compact height |

---

### iOS / iPadOS デバイス画面寸法 (Device screen dimensions)

| モデル (Model) | ポートレート寸法 (pt / px) |
| :--- | :--- |
| **iPad Pro 13-inch** | 1032 × 1376 pt (2064 × 2752 px @2x) |
| **iPad Pro 12.9-inch** | 1024 × 1366 pt (2048 × 2732 px @2x) |
| **iPad Pro 11-inch (M4 / 第5・6世代)** | 834 × 1210 pt (1668 × 2420 px @2x) |
| **iPad Pro 11-inch (第1〜4世代)** | 834 × 1194 pt (1668 × 2388 px @2x) |
| **iPad Pro 10.5-inch / iPad Air 10.5-inch** | 834 × 1112 pt (1668 × 2224 px @2x) |
| **iPad Air 13-inch** | 1024 × 1366 pt (2048 × 2732 px @2x) |
| **iPad Air 11-inch / iPad Air 10.9-inch / iPad 第10世代** | 820 × 1180 pt (1640 × 2360 px @2x) |
| **iPad 10.2-inch (第7〜9世代)** | 810 × 1080 pt (1620 × 2160 px @2x) |
| **iPad 9.7-inch / iPad Air 2** | 768 × 1024 pt (1536 × 2048 px @2x) |
| **iPad mini 8.3-inch (第6世代以降)** | 744 × 1133 pt (1488 × 2266 px @2x) |
| **iPad mini 7.9-inch (第5世代以前)** | 768 × 1024 pt (1536 × 2048 px @2x) |
| **iPhone 16 Pro Max / 17 Pro Max** | 440 × 956 pt (1320 × 2868 px @3x) |
| **iPhone 16 Pro / 17 Pro / 17** | 402 × 874 pt (1206 × 2622 px @3x) |
| **iPhone 16 Plus / 15 Pro Max / 15 Plus / 14 Pro Max** | 430 × 932 pt (1290 × 2796 px @3x) |
| **iPhone 16 / 15 Pro / 15 / 14 Pro** | 393 × 852 pt (1179 × 2556 px @3x) |
| **iPhone 16e / 14 / 13 / 13 Pro / 12 / 12 Pro** | 390 × 844 pt (1170 × 2532 px @3x) |
| **iPhone 14 Plus / 13 Pro Max / 12 Pro Max** | 428 × 926 pt (1284 × 2778 px @3x) |
| **iPhone 13 mini / 12 mini** | 360 × 780 pt (1080 × 2340 px @3x) |
| **iPhone 11 Pro Max / XS Max** | 414 × 896 pt (1242 × 2688 px @3x) |
| **iPhone 11 / XR** | 414 × 896 pt (828 × 1792 px @2x) |
| **iPhone 11 Pro / XS / X** | 375 × 812 pt (1125 × 2436 px @3x) |
| **iPhone 8 Plus / 7 Plus / 6s Plus / 6 Plus** | 414 × 736 pt (1080 × 1920 px @3x) |
| **iPhone SE (第2・3世代) / 8 / 7 / 6s / 6** | 375 × 667 pt (750 × 1334 px @2x) |
| **iPhone SE (第1世代) / 5s / 5** | 320 × 568 pt (640 × 1136 px @2x) |

---

### watchOS デバイス画面寸法 (Apple Watch dimensions)

| モデル (Model) | ケースサイズ | 解像度 (px) |
| :--- | :--- | :--- |
| **Apple Watch Series 10 / 11** | 46mm | 416 × 496 px |
| **Apple Watch Series 10 / 11** | 42mm | 374 × 446 px |
| **Apple Watch Ultra (全世代)** | 49mm | 410 × 502 px |
| **Apple Watch Series 7, 8, 9** | 45mm | 396 × 484 px |
| **Apple Watch Series 7, 8, 9** | 41mm | 352 × 430 px |
| **Apple Watch Series 4, 5, 6, SE** | 44mm | 368 × 448 px |
| **Apple Watch Series 4, 5, 6, SE** | 40mm | 324 × 394 px |
| **Apple Watch Series 1, 2, 3** | 42mm | 312 × 390 px |
| **Apple Watch Series 1, 2, 3** | 38mm | 272 × 340 px |

---

## リソース (Resources)

### 関連トピック (Related)
* **右から左 (Right to left)**
* **空間レイアウト (Spatial layout)**
* **レイアウトと構成 (Layout and organization)**

### デベロッパドキュメント (Developer documentation)
* `Composing custom layouts with SwiftUI` — SwiftUI
* `backgroundExtensionEffect()` — SwiftUI
* `UIBackgroundExtensionView` — UIKit
* `UILayoutGuide` — UIKit
* `NSLayoutGuide` — AppKit
* `UserInterfaceSizeClass` — SwiftUI

### ビデオ (Videos)
* *Get to know the new design system*
* *Compose custom layouts with SwiftUI*
* *Essential Design Principles*
