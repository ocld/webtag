import type { StandardTextField, TrackMetadata } from "./types";

export const FORMAT_TOKENS: Array<{ token: string; label: string; field?: StandardTextField }> = [
  { token: "%track%", label: "Track #", field: "track" },
  { token: "%track2%", label: "Track # (01)", field: "track" },
  { token: "%disc%", label: "Disc #", field: "disc" },
  { token: "%artist%", label: "Artist", field: "artist" },
  { token: "%title%", label: "Title", field: "title" },
  { token: "%album%", label: "Album", field: "album" },
  { token: "%albumartist%", label: "Album Artist", field: "albumArtist" },
  { token: "%year%", label: "Year", field: "year" },
  { token: "%genre%", label: "Genre", field: "genre" },
  { token: "%composer%", label: "Composer", field: "composer" },
  { token: "%bpm%", label: "BPM", field: "bpm" },
  { token: "%comment%", label: "Comment", field: "comment" },
  { token: "%dummy%", label: "Ignore (dummy)" },
];

const TOKEN_TO_FIELD: Record<string, StandardTextField | "dummy"> = {
  title: "title",
  artist: "artist",
  album: "album",
  albumartist: "albumArtist",
  year: "year",
  track: "track",
  track2: "track",
  disc: "disc",
  genre: "genre",
  composer: "composer",
  bpm: "bpm",
  comment: "comment",
  dummy: "dummy",
};

function stripExtension(filename: string): { stem: string; ext: string } {
  const dot = filename.lastIndexOf(".");
  if (dot <= 0) return { stem: filename, ext: "" };
  return { stem: filename.slice(0, dot), ext: filename.slice(dot) };
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// compiles a %token% template into a regex to extract metadata fields from a filename stem
export function parseFilenameToTags(
  filename: string,
  pattern: string
): Partial<Record<StandardTextField, string>> | null {
  const { stem } = stripExtension(filename);
  const trimmedPattern = pattern.trim();
  if (!trimmedPattern) return null;

  const tokenRegex = /%([a-z0-9_]+)%/gi;
  const capturedFields: Array<StandardTextField | "dummy"> = [];
  let regexSource = "^";
  let lastIndex = 0;

  for (const match of trimmedPattern.matchAll(tokenRegex)) {
    const idx = match.index ?? 0;
    const rawKey = match[1].toLowerCase();
    const field = TOKEN_TO_FIELD[rawKey];

    regexSource += escapeRegex(trimmedPattern.slice(lastIndex, idx));

    if (field) {
      capturedFields.push(field);
      // lazy capture keeps earlier tokens from swallowing later delimiters
      regexSource += "(.+?)";
    } else {
      regexSource += escapeRegex(match[0]);
    }
    lastIndex = idx + match[0].length;
  }

  regexSource += escapeRegex(trimmedPattern.slice(lastIndex)) + "$";
  if (capturedFields.length === 0) return null;

  let re: RegExp;
  try {
    re = new RegExp(regexSource, "i");
  } catch {
    return null;
  }

  const m = stem.match(re);
  if (!m) return null;

  const patch: Partial<Record<StandardTextField, string>> = {};
  capturedFields.forEach((field, i) => {
    if (field === "dummy") return;
    const val = (m[i + 1] ?? "").trim();
    if (field === "track" || field === "disc") {
      // strip leading zeros on numeric track/disc numbers while preserving "0"
      const num = val.replace(/^0+(?=\d)/, "");
      patch[field] = num;
    } else {
      patch[field] = val;
    }
  });

  return patch;
}

// strips characters that are invalid across macos, windows, and linux filesystems
export function sanitizeFilenameSegment(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/^\.+/, "")
    .trim();
}

// formats metadata fields into a sanitized filename while keeping the original extension
export function formatTagsToFilename(
  metadata: TrackMetadata,
  currentFilename: string,
  pattern: string
): string {
  const { stem, ext } = stripExtension(currentFilename);
  const trimmed = pattern.trim();
  if (!trimmed) return currentFilename;

  const pad2 = (raw: string) => {
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) return raw;
    return String(n).padStart(2, "0");
  };

  const replaced = trimmed.replace(/%([a-z0-9_]+)%/gi, (full, rawKey: string) => {
    const key = rawKey.toLowerCase();
    switch (key) {
      case "title":
        return metadata.title;
      case "artist":
        return metadata.artist;
      case "album":
        return metadata.album;
      case "albumartist":
        return metadata.albumArtist;
      case "year":
        return metadata.year;
      case "track":
        return metadata.track;
      case "track2":
        return pad2(metadata.track);
      case "disc":
        return metadata.disc;
      case "genre":
        return metadata.genre;
      case "composer":
        return metadata.composer;
      case "bpm":
        return metadata.bpm;
      case "comment":
        return metadata.comment;
      case "_filename":
        return stem;
      default:
        return full;
    }
  });

  const cleanStem = sanitizeFilenameSegment(replaced);
  if (!cleanStem) return currentFilename;
  return `${cleanStem}${ext}`;
}
