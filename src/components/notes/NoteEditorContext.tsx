/**
 * src/components/notes/NoteEditorContext.tsx
 * Arca — Tiptap NodeView 向け NoteEditor コンテキスト
 */

import { createContext } from "react";
import type { NoteItem } from "../../types";

export interface NoteEditorContextType {
  allNotes: NoteItem[];
  onSelectNote?: (noteId: string) => void;
}

export const NoteEditorContext = createContext<NoteEditorContextType>({
  allNotes: [],
});
