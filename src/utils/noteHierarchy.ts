/**
 * src/utils/noteHierarchy.ts
 * Arca — Notes 階層化（Parent-Child Hub）トラバース＆ユーティリティ
 *
 * 準拠:
 * - Core/Rules.md (主体性、シンプルさ、データ保護)
 * - references/apple_hig_master.md
 */

import type { NoteItem, NoteBreadcrumb } from "../types";

/**
 * 現在開いているノートから親ノートを再帰的に辿り、
 * トップ（All Notes）から現在ノートまでのパンくずリスト配列を生成する。
 * 循環参照が発生した場合でも無限ループを防ぐ安全設計。
 */
export function getBreadcrumbs(
  notes: NoteItem[],
  currentNoteId: string | null
): NoteBreadcrumb[] {
  const rootBreadcrumb: NoteBreadcrumb = { id: null, title: "Notes" };
  if (!currentNoteId) {
    return [rootBreadcrumb];
  }

  const noteMap = new Map<string, NoteItem>();
  for (const n of notes) {
    noteMap.set(n.id, n);
  }

  const path: NoteBreadcrumb[] = [];
  const visited = new Set<string>();
  let currId: string | null = currentNoteId;

  while (currId && !visited.has(currId)) {
    visited.add(currId);
    const currNote = noteMap.get(currId);
    if (!currNote) break;

    path.unshift({
      id: currNote.id,
      title: currNote.title.trim() || "（タイトルなし）",
    });

    currId = currNote.parentId ?? null;
  }

  return [rootBreadcrumb, ...path];
}

/**
 * 指定した親ノート配下のアクティブな子ノート一覧を取得する。
 * parentId が null または undefined の場合はルート階層のノートを返す。
 */
export function getChildNotes(
  notes: NoteItem[],
  parentId: string | null = null
): NoteItem[] {
  return notes.filter((n) => {
    if (n.isDeleted) return false;
    if (!parentId) {
      return !n.parentId;
    }
    return n.parentId === parentId;
  });
}

/**
 * 指定したノート配下のアクティブな直接の子ノート件数を集計する。
 */
export function getChildCount(
  notes: NoteItem[],
  parentId: string
): number {
  if (!parentId) return 0;
  return notes.filter((n) => !n.isDeleted && n.parentId === parentId).length;
}

/**
 * 指定したノートID（rootNoteId）自身と、その配下のすべての子孫ノートIDを再帰的に収集する。
 * 親ノート削除時のカスケード論理削除や一括Undo復元で使用する。
 */
export function getDescendantNoteIds(
  notes: NoteItem[],
  rootNoteId: string
): string[] {
  const noteMap = new Map<string, NoteItem[]>(); // parentId -> children
  for (const n of notes) {
    if (n.parentId) {
      const list = noteMap.get(n.parentId) || [];
      list.push(n);
      noteMap.set(n.parentId, list);
    }
  }

  const results: string[] = [rootNoteId];
  const queue: string[] = [rootNoteId];
  const visited = new Set<string>([rootNoteId]);

  while (queue.length > 0) {
    const parent = queue.shift()!;
    const children = noteMap.get(parent) || [];
    for (const child of children) {
      if (!visited.has(child.id)) {
        visited.add(child.id);
        results.push(child.id);
        queue.push(child.id);
      }
    }
  }

  return results;
}

/**
 * 指定したノート（noteId）を候補親ノート（candidateParentId）配下へ移動できるか判定する。
 * 自分自身や自身の子孫ノートへの移動は循環参照となるため false を返す。
 */
export function canMoveNoteTo(
  notes: NoteItem[],
  noteId: string,
  candidateParentId: string | null
): boolean {
  // ルートへの移動（candidateParentId === null）は常に可能
  if (!candidateParentId) return true;

  // 自分自身を親にすることはできない
  if (candidateParentId === noteId) return false;

  // 自身の子孫ノートを親にすることはできない（循環参照防止）
  const descendantIds = getDescendantNoteIds(notes, noteId);
  if (descendantIds.includes(candidateParentId)) {
    return false;
  }

  return true;
}

export interface HierarchyOption {
  note: NoteItem;
  depth: number;
  isSelectable: boolean;
  disabledReason?: string;
  isCurrentParent: boolean;
}

/**
 * 移動モーダル表示用に、アクティブなノートを階層順（深さ depth 付き）にフラット展開した配列を生成する。
 */
export function getHierarchyTreeOptions(
  notes: NoteItem[],
  targetNoteId: string
): HierarchyOption[] {
  const activeNotes = notes.filter((n) => !n.isDeleted);
  const targetNote = activeNotes.find((n) => n.id === targetNoteId);
  const currentParentId = targetNote?.parentId ?? null;
  const descendantIds = new Set(getDescendantNoteIds(activeNotes, targetNoteId));

  const noteMap = new Map<string, NoteItem[]>(); // parentId -> children
  for (const n of activeNotes) {
    const pId = n.parentId || "root";
    const list = noteMap.get(pId) || [];
    list.push(n);
    noteMap.set(pId, list);
  }

  const result: HierarchyOption[] = [];

  function traverse(parentId: string, depth: number) {
    const children = noteMap.get(parentId) || [];
    for (const child of children) {
      const isSelf = child.id === targetNoteId;
      const isDescendant = descendantIds.has(child.id);
      const isSelectable = !isSelf && !isDescendant;

      let disabledReason: string | undefined;
      if (isSelf) {
        disabledReason = "移動対象のノート自身です";
      } else if (isDescendant) {
        disabledReason = "移動対象の配下ノート（循環参照防止）";
      }

      result.push({
        note: child,
        depth,
        isSelectable,
        disabledReason,
        isCurrentParent: child.id === currentParentId,
      });

      traverse(child.id, depth + 1);
    }
  }

  traverse("root", 0);
  return result;
}

