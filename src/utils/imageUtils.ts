/**
 * src/utils/imageUtils.ts
 * Arca — 画像軽量圧縮＆取り込みユーティリティ
 *
 * 特徴:
 * 1. HTML5 Canvas を利用してクライアント側で最大幅/高さを1200pxに安全に縮小リサイズ
 * 2. WebP（フォールバックで JPEG）形式に圧縮し、Firestore やローカルのストレージ消費を最小化
 * 3. EXIF Orientation 対応、クリーンな Data URL を生成
 */

export interface ProcessedImage {
  dataUrl: string;
  name: string;
  width: number;
  height: number;
}

/**
 * 画像ファイルを読み込み、指定最大寸法・品質で圧縮した Data URL を返す。
 */
export async function processImageFile(
  file: File,
  maxDimension = 1200,
  quality = 0.82
): Promise<ProcessedImage> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("選択されたファイルは画像ではありません。"));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error("ファイルの読み込みに失敗しました。"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("画像のデコードに失敗しました。"));
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // アスペクト比を維持して最大寸法以内に縮小
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas コンテキストの取得に失敗しました。"));
          return;
        }

        // 高品質スムージング
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, width, height);

        // WebP 形式でエクスポート（非対応環境は JPEG にフォールバック）
        let dataUrl = canvas.toDataURL("image/webp", quality);
        if (!dataUrl.startsWith("data:image/webp")) {
          dataUrl = canvas.toDataURL("image/jpeg", quality);
        }

        resolve({
          dataUrl,
          name: file.name.replace(/\.[^/.]+$/, "") || "image",
          width,
          height,
        });
      };

      img.src = reader.result as string;
    };

    reader.readAsDataURL(file);
  });
}
