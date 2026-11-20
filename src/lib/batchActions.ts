import { cloneMetadata, createEmptyMetadata, type StandardTextField, type TrackItem, type TrackMetadata } from "./types";

export interface AutoNumberOptions {
  startAt: number;
  padDigits: number; // 0 = no padding, 2 = 01, 3 = 001
  saveTotal: boolean;
  resetPerFolder: boolean;
}

export function applyAutoNumber(
  tracks: TrackItem[],
  options: AutoNumberOptions
): Map<string, TrackMetadata> {
  const updates = new Map<string, TrackMetadata>();

  if (options.resetPerFolder) {
    const groups = new Map<string, TrackItem[]>();
    for (const t of tracks) {
      const key = t.folderPath || t.metadata.album || "__root__";
      const list = groups.get(key) ?? [];
      list.push(t);
      groups.set(key, list);
    }

    for (const group of groups.values()) {
      const totalStr = String(group.length);
      group.forEach((track, idx) => {
        const next = cloneMetadata(track.metadata);
        const num = options.startAt + idx;
        next.track = options.padDigits > 1 ? String(num).padStart(options.padDigits, "0") : String(num);
        if (options.saveTotal) next.trackTotal = totalStr;
        updates.set(track.id, next);
      });
    }
  } else {
    const totalStr = String(tracks.length);
    tracks.forEach((track, idx) => {
      const next = cloneMetadata(track.metadata);
      const num = options.startAt + idx;
      next.track = options.padDigits > 1 ? String(num).padStart(options.padDigits, "0") : String(num);
      if (options.saveTotal) next.trackTotal = totalStr;
      updates.set(track.id, next);
    });
  }

  return updates;
}

export type CaseTransform = "title" | "sentence" | "lower" | "upper" | "trim";

const SMALL_WORDS = new Set([
  "a", "an", "and", "as", "at", "but", "by", "for", "from", "in", "into",
  "nor", "of", "on", "or", "over", "per", "the", "to", "up", "via", "with",
]);

export function transformCase(value: string, mode: CaseTransform): string {
  if (!value) return value;
  const normalized = value.replace(/\s+/g, " ").trim();
  switch (mode) {
    case "trim":
      return normalized;
    case "lower":
      return normalized.toLowerCase();
    case "upper":
      return normalized.toUpperCase();
    case "sentence":
      return normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase();
    case "title": {
      const words = normalized.split(" ");
      return words
        .map((word, idx) => {
          const lower = word.toLowerCase();
          if (idx !== 0 && idx !== words.length - 1 && SMALL_WORDS.has(lower)) {
            return lower;
          }
          return lower.replace(/(^|[\(\[\-"'\/])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());
        })
        .join(" ");
    }
  }
}

export const TEXT_FIELDS_FOR_BULK: StandardTextField[] = [
  "title",
  "artist",
  "album",
  "albumArtist",
  "genre",
  "composer",
  "comment",
];

export function applyCaseTransform(
  tracks: TrackItem[],
  fields: StandardTextField[],
  mode: CaseTransform
): Map<string, TrackMetadata> {
  const updates = new Map<string, TrackMetadata>();
  for (const t of tracks) {
    const next = cloneMetadata(t.metadata);
    for (const f of fields) {
      next[f] = transformCase(next[f], mode);
    }
    updates.set(t.id, next);
  }
  return updates;
}

export interface FindReplaceOptions {
  field: StandardTextField | "all";
  find: string;
  replace: string;
  useRegex: boolean;
  caseSensitive: boolean;
}

export function previewFindReplace(
  tracks: TrackItem[],
  options: FindReplaceOptions
): {
  updates: Map<string, TrackMetadata>;
  matchCount: number;
  error?: string;
} {
  const updates = new Map<string, TrackMetadata>();
  if (!options.find) return { updates, matchCount: 0 };

  let re: RegExp;
  try {
    const flags = options.caseSensitive ? "g" : "gi";
    const source = options.useRegex
      ? options.find
      : options.find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    re = new RegExp(source, flags);
  } catch (err) {
    return {
      updates,
      matchCount: 0,
      error: err instanceof Error ? err.message : "Invalid regular expression",
    };
  }

  const targetFields: StandardTextField[] =
    options.field === "all" ? [...TEXT_FIELDS_FOR_BULK, "year", "lyrics"] : [options.field];

  let matchCount = 0;

  for (const t of tracks) {
    const next = cloneMetadata(t.metadata);
    let touched = false;
    for (const f of targetFields) {
      const orig = next[f];
      if (!orig) continue;
      const matches = orig.match(re);
      if (matches && matches.length > 0) {
        matchCount += matches.length;
        next[f] = orig.replace(re, options.replace);
        touched = true;
      }
    }
    if (touched) {
      updates.set(t.id, next);
    }
  }

  return { updates, matchCount };
}

export type QuickUtilityAction = "copy-artist-to-album-artist" | "swap-artist-title" | "strip-all-tags";

export function applyQuickUtility(
  tracks: TrackItem[],
  action: QuickUtilityAction
): Map<string, TrackMetadata> {
  const updates = new Map<string, TrackMetadata>();
  for (const t of tracks) {
    if (action === "strip-all-tags") {
      updates.set(t.id, createEmptyMetadata());
      continue;
    }
    const next = cloneMetadata(t.metadata);
    if (action === "copy-artist-to-album-artist") {
      next.albumArtist = next.artist;
    } else if (action === "swap-artist-title") {
      const tmp = next.artist;
      next.artist = next.title;
      next.title = tmp;
    }
    updates.set(t.id, next);
  }
  return updates;
}
