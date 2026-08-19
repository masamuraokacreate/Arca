# Webビュー (Web views) - Apple Human Interface Guidelines

> 出典: [Apple Developer Documentation - Webビュー (Web views)](https://developer.apple.com/jp/design/human-interface-guidelines/web-views/)

Webビュー（Web View）は、埋め込まれたHTMLやWebサイトなどのリッチなWebコンテンツをアプリ内に直接読み込んで表示します。例えば、「メール」アプリではメッセージ内のHTMLコンテンツを表示するためにWebビューが使われています。

---

## ベストプラクティス (Best practices)

* **進む／戻るナビゲーションに適宜対応する。**
  Webビューは「進む」「戻る」ナビゲーションをサポートしていますが、この動作はデフォルトでは利用できません。ユーザがWebビュー内で複数のページを閲覧する可能性がある場合は、進む／戻るナビゲーションを有効にし、それらの機能を起動する対応コントロール（ツールバーボタンやスワイプジェスチャーなど）を提供してください。
* **Webビューを使ってWebブラウザを構築することは避ける。**
  アプリのコンテキストから離れることなく一時的にWebサイトにアクセスさせるためにWebビューを使用するのは適切ですが、ユーザがWebをブラウジングする主な手段はSafariです。アプリ内でSafariと同等の汎用ブラウザ機能を再現しようとすることは不要であり、推奨されません。
* **Safari View Controller (`SFSafariViewController`) の検討:**
  一般的なWebページをフルブラウザに近い体験で一時的に閲覧させる場合は、カスタムのWebビューを組むのではなく `SFSafariViewController` を使用すると、Safariの自動入力、リーダーモード、コンテンツブロッカーなどの機能をユーザにそのまま提供できます。

---

## プラットフォーム別の考慮事項 (Platform considerations)

* **iOS、iPadOS、macOS、visionOS:** 追加の特別な考慮事項はありません。
* **tvOS、watchOS:** Webビューはサポートされていません（Not supported）。

---

## リソース (Resources)

### 関連トピック
* **SafariとWeb (Safari and Web)**
* **WebKit.org**

### デベロッパドキュメント
* **WebKit:** `WKWebView`
* **SafariServices:** `SFSafariViewController`

### ビデオ
* *Explore WKWebView additions*
