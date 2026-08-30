/**
 * src/services/imageUploadService.ts
 * Arca — Firebase Storage 画像アップロードサービス
 *
 * 機能:
 * 1. 画像を最大幅1600px・WebP形式にCanvas軽量圧縮（高品質・低容量）
 * 2. Firebase Storage の `notes_images/${userId}/${timestamp}_${safeName}.webp` へアップロード
 * 3. 公開HTTPS downloadURL を返却
 * 4. ネットワークエラーやオフライン時は安全にフォールバック（Data URL）
 */

import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage, auth } from "../lib/firebase";

export interface UploadImageResult {
  url: string;
  name: string;
  isFirebaseStorage: boolean;
}

/**
 * 画像ファイルを Canvas で圧縮して WebP Blob を生成
 */
export async function compressImageToBlob(
  file: File,
  maxWidth = 1600,
  quality = 0.85
): Promise<{ blob: Blob; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = document.createElement("img");
      img.onload = () => {
        let { width, height } = img;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas context is not available"));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve({ blob, width, height });
            } else {
              reject(new Error("Image compression failed"));
            }
          },
          "image/webp",
          quality
        );
      };
      img.onerror = () => reject(new Error("Image loading failed"));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error("FileReader failed"));
    reader.readAsDataURL(file);
  });
}

/**
 * 画像を Firebase Storage にアップロードして公開 URL を取得
 */
export async function uploadNoteImage(
  file: File,
  customUserId?: string
): Promise<UploadImageResult> {
  const userId = customUserId || auth.currentUser?.uid || "anonymous";
  const rawName = file.name.replace(/\.[^/.]+$/, "");
  const safeName = rawName.replace(/[^a-zA-Z0-9_\-\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/g, "_") || "image";
  const timestamp = Date.now();
  const storagePath = `notes_images/${userId}/${timestamp}_${safeName}.webp`;

  try {
    const { blob } = await compressImageToBlob(file, 1600, 0.85);

    // Firebase Storage へアップロード
    const storageRef = ref(storage, storagePath);
    const snapshot = await uploadBytes(storageRef, blob, {
      contentType: "image/webp",
      cacheControl: "public, max-age=31536000",
    });

    const downloadUrl = await getDownloadURL(snapshot.ref);

    return {
      url: downloadUrl,
      name: safeName,
      isFirebaseStorage: true,
    };
  } catch (error) {
    console.warn("Firebase Storage upload fallback to Data URL:", error);
    // オフラインやエラー時のフォールバック（Data URL）
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        resolve({
          url: e.target?.result as string,
          name: safeName,
          isFirebaseStorage: false,
        });
      };
      reader.readAsDataURL(file);
    });
  }
}
