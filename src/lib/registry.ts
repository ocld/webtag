import type {
  AudioTechInfo,
  CoverArt,
  FileCategory,
  FormatRecordsMap,
  TrackMetadata,
} from "./types";

export interface FormatReadResult {
  fileKind: FileCategory;
  metadata: TrackMetadata;
  formatRecords: FormatRecordsMap;
  coverArt: CoverArt | null;
  tech: AudioTechInfo;
  mimeType: string;
  isCdaPointer?: boolean;
}

export interface FormatWriteContext {
  buffer: Uint8Array;
  filename: string;
  ext: string;
  metadata: TrackMetadata;
  coverArt: CoverArt | null;
  coverDirty: boolean;
  stripAll: boolean;
}

/**
 * Pluggable metadata format handler.
 * Register a new file format with `registerFormatHandler(...)` and it automatically
 * gains full read, edit, strip, topic grouping, tech-format inspection, and Schema.org export.
 */
export interface FormatHandler {
  id: string;
  label: string;
  category: FileCategory;
  extensions: string[];
  standards: string;
  capabilities: string;
  notes: string;
  /** Optional magic-byte / header matcher (runs before fallback) */
  detect?: (buffer: Uint8Array, ext: string) => boolean;
  read: (buffer: Uint8Array, filename: string, folderPath?: string) => Promise<FormatReadResult> | FormatReadResult;
  write: (ctx: FormatWriteContext) => Promise<Uint8Array> | Uint8Array;
}

const handlers: FormatHandler[] = [];

export function registerFormatHandler(handler: FormatHandler): void {
  const existingIdx = handlers.findIndex((h) => h.id === handler.id);
  if (existingIdx >= 0) handlers[existingIdx] = handler;
  else handlers.push(handler);
}

export function listFormatHandlers(): readonly FormatHandler[] {
  return handlers;
}

export function resolveFormatHandler(
  buffer: Uint8Array,
  filename: string
): FormatHandler | undefined {
  const dot = filename.lastIndexOf(".");
  const ext = dot >= 0 ? filename.slice(dot + 1).toLowerCase() : "";

  // 1. Prefer exact extension match
  for (const h of handlers) {
    if (h.extensions.includes(ext)) return h;
  }
  // 2. Fall back to magic-byte detection
  for (const h of handlers) {
    if (h.detect && h.detect(buffer, ext)) return h;
  }
  // 3. Universal fallback handler ("generic")
  return handlers.find((h) => h.id === "generic");
}
