# Arca Motion System & Animation Guidelines

## 1. 目的と設計原則

Arcaにおけるアニメーションは、装飾ではなく「機能」である。
「画面が突然切り替わる不自然さ」を排除し、Apple Human Interface Guidelines（HIG）の「ユーザのコンテキストを保つ」「明確なフィードバックを提供する」に準拠した流体的な状態遷移を実現する。

* **天体の慣性と減速（Orbit Inertia）**: 線形移動（linear）や過剰な跳ね返り（bounce）を禁止する。初速を受け止め、摩擦で自然に収まる減速カーブを採用する。


* **柔らかな光の滲み（Luminous Glow）**: 境界線の切り替えではなく、不透明度（Opacity）と発光（Glow）の緩やかな拡散によって状態変化を表現する。


* **思考を邪魔しない速さ**: 出現は丁寧に行い、退出・消滅は出現より素早く完了させる（待たせない設計）。


* **レイアウトシフトの完全排除**: アニメーションによって周囲の要素サイズや位置がガタつく実装を禁止する。



---

## 2. モーショントークン定義 (CSS Variables)

すべてのコンポーネントは、以下のトークンのみを使用してトランジションを構成すること。ハードコードされたミリ秒やイージングは禁止する。

```css
:root {
  /* =========================================
     Timing Curves (Apple HIG 準拠の加減速)
     ========================================= */
  /* 出現・展開: 初速が速く滑らかに減速する標準カーブ */
  --ease-apple-spring: cubic-bezier(0.16, 1, 0.3, 1);
  /* 閉じる・退出: ユーザーの作業を待たせない素早い離脱カーブ */
  --ease-apple-exit: cubic-bezier(0.4, 0, 0.2, 1);
  /* 光・背景フェード: 線形に近い滑らかな透明度遷移 */
  --ease-soft-glow: cubic-bezier(0.25, 0.1, 0.25, 1);

  /* =========================================
     Duration Tokens (継続時間)
     ========================================= */
  --duration-instant: 120ms; /* ボタン押下(Active)、トグルスイッチ */
  --duration-fast:    180ms; /* チェックボックス、ツールチップ、退出(Exit) */
  --duration-normal:  260ms; /* ドロップダウン、モーダル展開、タブ切り替え */
  --duration-smooth:  340ms; /* ワイド詳細ペインの展開、カード変形 */

  /* =========================================
     Arca Accent Glow
     ========================================= */
  --glow-accent-active: 0 4px 14px rgba(212, 175, 55, 0.25);
  --glow-accent-subtle: 0 2px 8px rgba(212, 175, 55, 0.15);
}

```

---

## 3. コンポーネント別 トランジション規約

### A. モーダル・ポップアップ・ポップオーバー

画面中央に突如現れる即時描画を禁止する。奥から手前へ静かに浮上する奥行きを持たせる。

* **背景オーバーレイ（Backdrop）**:
* `Enter`: `opacity: 0 → 1` (`--duration-normal` / `--ease-soft-glow`)
* `Exit`: `opacity: 1 → 0` (`--duration-fast` / `--ease-apple-exit`)


* **モーダル本体（Window）**:
* `Enter`: `opacity: 0 → 1`, `transform: scale(0.97) translateY(8px) → scale(1) translateY(0)` (`--duration-normal` / `--ease-apple-spring`)
* `Exit`: `opacity: 1 → 0`, `transform: scale(1) → scale(0.98)` (`--duration-fast` / `--ease-apple-exit`)



### B. タブ・ワイド詳細ペインの切り替え（コンテキスト維持）

前画面の即時非表示＋新画面の即時表示を禁止する。

* **ペイン内のコンテンツ切り替え**:
* `Enter`: `opacity: 0 → 1`, `transform: translateY(4px) → translateY(0)` (`--duration-normal` / `--ease-apple-spring`)
* 前面コンテンツのフェードアウトと背面コンテンツの浮上を自然にクロスフェードさせる。



### C. リスト項目の完了・削除・繰り上がり

項目が「パッ」と消えて下の要素がワープする挙動を禁止する。

1. **フェードアウト**: 対象アイテムの `opacity: 1 → 0` (`--duration-fast` / `--ease-apple-exit`)。
2. **高さの補間**: 即座に要素を消さず、`height: auto → 0`、`margin: 0`、`padding: 0` へ滑らかに縮小させる (`--duration-normal` / `--ease-apple-spring`)。
3. 下のアイテムが自然に繰り上がる視線の誘導を保証する。

### D. 状態反転ボタン（開始 ↔ 開始取消）

テキスト量によるボタン枠の拡縮（レイアウトシフト）を厳格に禁止する。

* ボタンコンテナの幅と高さを固定（例: `w-[110px] h-[36px]`）。


* 枠線や背景の枠自体は固定したまま、内部テキストのみをクロスフェードで切り替える。
* テキスト退出: `opacity: 1 → 0` (`--duration-instant`)
* テキスト侵入: `opacity: 0 → 1` (`--duration-instant`)



### E. アクション点灯（完了ボタンのアクティブ化）

唐突な色変化や点滅を禁止する。

* **背景色・ボーダー**: `background-color`, `border-color` が `--duration-fast` / `--ease-soft-glow` で滑らかに遷移。
* **Glow効果**: `box-shadow: none → var(--glow-accent-active)` が `--duration-normal` / `--ease-soft-glow` で外側へ静かに滲むように広がる。



---

## 4. アクセシビリティ規約 (prefers-reduced-motion)

Apple HIGの「すべての人のためにデザインする」に基づき、OSの視覚効果低減設定が有効な場合、スケールおよび移動の物理演出をすべて停止する。

```css
@media (prefers-reduced-motion: reduce) {
  *, ::before, ::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }

  /* 画面切り替えはシンプルなフェード（不透明度変化）のみにフォールバック */
  .motion-fade-fallback {
    transition: opacity var(--duration-fast) var(--ease-soft-glow) !important;
    transform: none !important;
  }
}

```

---

## 5. アンチパターン（禁止事項）

* **無意味なバウンド（Bouncy Effects）の禁止**: UIがオモチャのように跳ねる演出はArcaの静謐な世界観を損なうため禁止する。


* **30px以上の移動距離（Translate）の禁止**: 移動を伴うアニメーションの移動量は `4px 〜 12px` に収め、上品な奥行き表現に留める。
* **入退場で同じ速度の適用**: 閉じる・消える動作に入場と同じ時間をかけてユーザーを待たせることを禁止する（退出は常に入場より20%〜30%速くする）。


* **アニメーション中のユーザー操作遮断**: 長すぎる演出で操作入力をブロックしてはならない。基本はすべて `300ms` 未満で完了させる。