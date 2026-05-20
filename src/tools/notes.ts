import { z } from 'zod';
import {
  loadNotes,
  saveNote,
  deleteNote,
  searchNotes,
  filterByTag,
} from '../memory.js';
import type { ToolDefinition } from './registry.js';

const SaveNoteParams = z.object({
  text: z.string().describe('Note content'),
  tags: z.array(z.string()).default([]).describe('Tags for this note'),
});

const ListNotesParams = z.object({
  tag: z.string().optional().describe('Filter by tag'),
});

const SearchNotesParams = z.object({
  query: z.string().describe('Search query'),
});

const DeleteNoteParams = z.object({
  id: z.string().describe('Note ID to delete'),
});

export const saveNoteTool: ToolDefinition = {
  name: 'save_note',
  description: 'Save a note with optional tags',
  parameters: SaveNoteParams,
  async execute(args) {
    const { text, tags } = SaveNoteParams.parse(args);
    try {
      const note = saveNote(text, tags);
      return `Note saved [${note.id}] ${tags.map((t) => `#${t}`).join(' ')}`;
    } catch (err: unknown) {
      return `ERROR: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

export const listNotesTool: ToolDefinition = {
  name: 'list_notes',
  description: 'List all notes, optionally filtered by tag',
  parameters: ListNotesParams,
  async execute(args) {
    const { tag } = ListNotesParams.parse(args);
    try {
      const notes = tag ? filterByTag(tag) : loadNotes();
      if (notes.length === 0) return 'No notes found.';
      return notes
        .map(
          (n) =>
            `[${n.id}] ${n.text.slice(0, 60)} | ${n.tags.map((t) => `#${t}`).join(' ')} | ${new Date(n.ts).toLocaleDateString()}`
        )
        .join('\n');
    } catch (err: unknown) {
      return `ERROR: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

export const searchNotesTool: ToolDefinition = {
  name: 'search_notes',
  description: 'Search notes by keyword in text or tags',
  parameters: SearchNotesParams,
  async execute(args) {
    const { query } = SearchNotesParams.parse(args);
    try {
      const results = searchNotes(query);
      if (results.length === 0) return 'No matching notes.';
      return results
        .map((n) => `[${n.id}] ${n.text.slice(0, 80)} ${n.tags.map((t) => `#${t}`).join(' ')}`)
        .join('\n');
    } catch (err: unknown) {
      return `ERROR: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

export const deleteNoteTool: ToolDefinition = {
  name: 'delete_note',
  description: 'Delete a note by ID',
  parameters: DeleteNoteParams,
  async execute(args) {
    const { id } = DeleteNoteParams.parse(args);
    try {
      const deleted = deleteNote(id);
      return deleted ? `Note deleted: ${id}` : `No note found with id: ${id}`;
    } catch (err: unknown) {
      return `ERROR: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};
