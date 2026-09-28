export type Note = { id: string; text: string; createdAt: string; updatedAt: string; deletedAt: string | null };
export type Notebook = { schemaVersion: 1; notes: Note[] };
export const emptyNotebook = (): Notebook => ({ schemaVersion: 1, notes: [] });
export function validateNotebook(value: unknown): asserts value is Notebook {
  const book = value as Notebook | null;
  const instant = (v: unknown) => typeof v === 'string' && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString() === v;
  if (!book || book.schemaVersion !== 1 || !Array.isArray(book.notes) || book.notes.length > 10000 ||
    book.notes.some(n => !n || typeof n.id !== 'string' || !n.id || typeof n.text !== 'string' || !n.text.trim() || n.text.length > 20000 || !instant(n.createdAt) || !instant(n.updatedAt) || (n.deletedAt !== null && !instant(n.deletedAt))) ||
    new Set(book.notes.map(n => n.id)).size !== book.notes.length) throw new Error('메모장 데이터 형식이 올바르지 않아요.');
}
