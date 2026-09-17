/**
 * src/components/notes/DocumentSpaceContext.ts
 * Arca — DocumentSpace 用コンテキスト
 * 統合ヘッダー（パンくず＋編集ツールバー）連携用
 */

import { createContext, useContext } from "react";
import type { NoteBreadcrumb } from "../../types";

export interface DocumentSpaceContextValue {
  isSidebarOpen: boolean;
  setIsSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  breadcrumbs: NoteBreadcrumb[];
  onSelectNote: (id: string) => void;
  activeNoteId: string | null;
}

export const DocumentSpaceContext = createContext<DocumentSpaceContextValue | null>(null);

export function useDocumentSpace() {
  return useContext(DocumentSpaceContext);
}
