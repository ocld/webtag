import { TagLib, type Picture, type PropertyMap } from "taglib-wasm";
import taglibWasmUrl from "@/assets/wasm/taglib-web.wasm?url";
import {
  cloneMetadata,
  createEmptyMetadata,
  type AudioTechInfo,
  type CoverArt,
  type TrackMetadata,
} from "./types";

let taglibPromise: Promise<TagLib> | null = null;

export async function getTagLib(): Promise<TagLib> {
  if (!taglibPromise) {
    taglibPromise = TagLib.initialize({
      wasmUrl: taglibWasmUrl,
    }).catch((err) => {
      taglibPromise = null;
      throw err;
    });
  }
  return taglibPromise;
}

const STANDARD_PROP_KEYS = new Set([
  "TITLE",
  "ARTIST",
  "ALBUM",
  "ALBUMARTIST",
  "ALBUM ARTIST",
  "DATE",
  "YEAR",
  "TRACKNUMBER",
  "TRACKTOTAL",
  "TOTALTRACKS",
  "DISCNUMBER",
  "DISCTOTAL",
  "TOTALDISCS",
  "GENRE",
  "COMPOSER",
  "BPM",
  "TBPM",
  "COMMENT",
  "LYRICS",
  "UNSYNCEDLYRICS",
  "ENCODEDBY",
  "ENCODER",
  "COPYRIGHT",
]);

function splitSlashNumber(raw: string | undefined): { num: string; total: string } {
  if (!raw) return { num: "", total: "" };
  const trimmed = raw.trim();
  if (trimmed.includes("/")) {
    const [a, b] = trimmed.split("/", 2);
    return { num: a.trim(), total: (b ?? "").trim() };
  }
  return { num: trimmed, total: "" };
}

function firstProp(props: PropertyMap, ...keys: string[]): string {
  const loweredTargets = new Set(keys.map((k) => k.toLowerCase()));
  for (const key of keys) {
    const vals = props[key];
    if (vals && vals.length > 0 && vals[0] !== undefined && vals[0] !== "") {
      return vals[0];
    }
  }
  for (const [propKey, vals] of Object.entries(props)) {
    if (loweredTargets.has(propKey.toLowerCase()) && vals && vals.length > 0 && vals[0] !== undefined && vals[0] !== "") {
      return vals[0];
    }
  }
  return "";
}

export function guessMimeType(filename: string, detectedFormat?: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "mp3":
      return "audio/mpeg";
    case "flac":
      return "audio/flac";
    case "m4a":
    case "mp4":
    case "aac":
      return "audio/mp4";
    case "ogg":
    case "oga":
      return "audio/ogg";
    case "opus":
      return "audio/opus";
    case "wav":
      return "audio/wav";
    case "aif":
    case "aiff":
      return "audio/aiff";
    case "wma":
      return "audio/x-ms-wma";
    case "wv":
      return "audio/wavpack";
    default:
      if (detectedFormat === "MP3") return "audio/mpeg";
      if (detectedFormat === "FLAC") return "audio/flac";
      if (detectedFormat === "WAV") return "audio/wav";
      return "audio/mpeg";
  }
}

export function createCoverObjectUrl(data: Uint8Array, mimeType: string): string {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  const blob = new Blob([copy.buffer], { type: mimeType || "image/jpeg" });
  return URL.createObjectURL(blob);
}

export async function readAudioMetadata(
  buffer: Uint8Array,
  filename: string
): Promise<{
  metadata: TrackMetadata;
  coverArt: CoverArt | null;
  tech: AudioTechInfo;
}> {
  const taglib = await getTagLib();
  const audioFile = await taglib.open(buffer);

  try {
    const tag = audioFile.tag();
    const props = audioFile.properties() ?? {};
    const audioProps = audioFile.audioProperties();
    const format = audioFile.getFormat() || filename.split(".").pop()?.toUpperCase() || "AUDIO";

    const metadata = createEmptyMetadata();
    metadata.title = tag.title || firstProp(props, "TITLE") || "";
    metadata.artist = tag.artist || firstProp(props, "ARTIST") || "";
    metadata.album = tag.album || firstProp(props, "ALBUM") || "";
    metadata.albumArtist = firstProp(props, "ALBUMARTIST", "ALBUM ARTIST");
    metadata.genre = tag.genre || firstProp(props, "GENRE") || "";
    metadata.comment = tag.comment || firstProp(props, "COMMENT") || "";
    metadata.composer = firstProp(props, "COMPOSER");
    metadata.bpm = firstProp(props, "BPM", "TBPM");
    metadata.software = firstProp(props, "ENCODEDBY", "ENCODER");
    metadata.copyright = firstProp(props, "COPYRIGHT");

    // Date / Year
    const rawDate = tag.date || firstProp(props, "DATE", "YEAR");
    if (rawDate) {
      metadata.year = rawDate;
    } else if (tag.year && tag.year > 0) {
      metadata.year = String(tag.year);
    }

    // Track number + total
    const rawTrackProp = firstProp(props, "TRACKNUMBER");
    if (rawTrackProp) {
      const parsed = splitSlashNumber(rawTrackProp);
      metadata.track = parsed.num;
      metadata.trackTotal = parsed.total || firstProp(props, "TRACKTOTAL", "TOTALTRACKS");
    } else if (tag.track && tag.track > 0) {
      metadata.track = String(tag.track);
      metadata.trackTotal = firstProp(props, "TRACKTOTAL", "TOTALTRACKS");
    }

    // Disc number + total
    const rawDiscProp = firstProp(props, "DISCNUMBER");
    if (rawDiscProp) {
      const parsed = splitSlashNumber(rawDiscProp);
      metadata.disc = parsed.num;
      metadata.discTotal = parsed.total || firstProp(props, "DISCTOTAL", "TOTALDISCS");
    }

    // Lyrics
    try {
      const lyricsList = audioFile.getLyrics();
      if (lyricsList && lyricsList.length > 0 && lyricsList[0]?.text) {
        metadata.lyrics = lyricsList[0].text;
      } else {
        metadata.lyrics = firstProp(props, "LYRICS", "UNSYNCEDLYRICS");
      }
    } catch {
      metadata.lyrics = firstProp(props, "LYRICS", "UNSYNCEDLYRICS");
    }

    // Extended / custom properties
    const customTags: Record<string, string> = {};
    for (const [key, values] of Object.entries(props)) {
      const upper = key.toUpperCase().replace(/[\s_-]+/g, "");
      if (STANDARD_PROP_KEYS.has(upper) || STANDARD_PROP_KEYS.has(key.toUpperCase())) continue;
      if (values && values.length > 0) {
        customTags[key.toUpperCase()] = values.join("; ");
      }
    }
    metadata.customTags = customTags;

    // Cover art
    let coverArt: CoverArt | null = null;
    try {
      const pictures = audioFile.getPictures();
      if (pictures && pictures.length > 0) {
        const front = pictures.find((p) => p.type === "FrontCover") ?? pictures[0];
        if (front && front.data && front.data.byteLength > 0) {
          const dataCopy = new Uint8Array(front.data.byteLength);
          dataCopy.set(front.data);
          coverArt = {
            mimeType: front.mimeType || "image/jpeg",
            data: dataCopy,
            objectUrl: createCoverObjectUrl(dataCopy, front.mimeType || "image/jpeg"),
            description: front.description,
          };
        }
      }
    } catch {
      coverArt = null;
    }

    const tech: AudioTechInfo = {
      format: String(format),
      codec: audioProps?.codec ?? String(format),
      container: audioProps?.containerFormat ?? String(format),
      duration: audioProps?.duration ?? 0,
      bitrate: audioProps?.bitrate ?? 0,
      sampleRate: audioProps?.sampleRate ?? 0,
      channels: audioProps?.channels ?? 0,
      bitsPerSample: audioProps?.bitsPerSample ?? 0,
      isLossless: audioProps?.isLossless ?? false,
    };

    return { metadata: cloneMetadata(metadata), coverArt, tech };
  } finally {
    audioFile.dispose();
  }
}

export async function writeAudioMetadata(
  buffer: Uint8Array,
  metadata: TrackMetadata,
  coverArt: CoverArt | null,
  coverDirty: boolean
): Promise<Uint8Array> {
  const taglib = await getTagLib();
  // Pass a fresh copy so the original buffer stays intact for revert
  const workingCopy = new Uint8Array(buffer.byteLength);
  workingCopy.set(buffer);

  const audioFile = await taglib.open(workingCopy);
  try {
    const tag = audioFile.tag();

    tag
      .setTitle(metadata.title)
      .setArtist(metadata.artist)
      .setAlbum(metadata.album)
      .setGenre(metadata.genre)
      .setComment(metadata.comment);

    const parsedYear = parseInt(metadata.year.trim().slice(0, 4), 10);
    if (metadata.year.trim()) {
      tag.setDate(metadata.year.trim());
      if (!Number.isNaN(parsedYear) && parsedYear > 0) {
        tag.setYear(parsedYear);
      }
    } else {
      tag.setDate("");
      tag.setYear(0);
    }

    const parsedTrack = parseInt(metadata.track.trim(), 10);
    tag.setTrack(!Number.isNaN(parsedTrack) && parsedTrack > 0 ? parsedTrack : 0);

    // Build complete PropertyMap for extended & standard properties
    const nextProps: PropertyMap = {};
    if (metadata.title) nextProps.TITLE = [metadata.title];
    if (metadata.artist) nextProps.ARTIST = [metadata.artist];
    if (metadata.album) nextProps.ALBUM = [metadata.album];
    if (metadata.albumArtist) nextProps.ALBUMARTIST = [metadata.albumArtist];
    if (metadata.genre) nextProps.GENRE = [metadata.genre];
    if (metadata.comment) nextProps.COMMENT = [metadata.comment];
    if (metadata.composer) nextProps.COMPOSER = [metadata.composer];
    if (metadata.bpm.trim()) nextProps.BPM = [metadata.bpm.trim()];
    if (metadata.software.trim()) nextProps.ENCODEDBY = [metadata.software.trim()];
    if (metadata.copyright.trim()) nextProps.COPYRIGHT = [metadata.copyright.trim()];
    if (metadata.year.trim()) nextProps.DATE = [metadata.year.trim()];

    if (metadata.track.trim()) {
      nextProps.TRACKNUMBER = [
        metadata.trackTotal.trim()
          ? `${metadata.track.trim()}/${metadata.trackTotal.trim()}`
          : metadata.track.trim(),
      ];
    }
    if (metadata.trackTotal.trim()) {
      nextProps.TRACKTOTAL = [metadata.trackTotal.trim()];
    }

    if (metadata.disc.trim()) {
      nextProps.DISCNUMBER = [
        metadata.discTotal.trim()
          ? `${metadata.disc.trim()}/${metadata.discTotal.trim()}`
          : metadata.disc.trim(),
      ];
    }
    if (metadata.discTotal.trim()) {
      nextProps.DISCTOTAL = [metadata.discTotal.trim()];
    }

    // Custom / Extended properties
    for (const [k, v] of Object.entries(metadata.customTags)) {
      const trimmedKey = k.trim().toUpperCase();
      if (!trimmedKey || !v.trim()) continue;
      nextProps[trimmedKey] = [v];
    }

    try {
      audioFile.setProperties(nextProps);
    } catch {
      // Fallback: apply individual properties if format restricts bulk setProperties
      for (const [k, vals] of Object.entries(nextProps)) {
        try {
          if (vals && vals[0] !== undefined) audioFile.setProperty(k, vals[0]);
        } catch {
          // ignore unsupported format-specific property
        }
      }
    }

    // Lyrics
    try {
      if (metadata.lyrics.trim()) {
        audioFile.setLyrics([{ text: metadata.lyrics }]);
      } else {
        audioFile.setLyrics([]);
      }
    } catch {
      if (metadata.lyrics.trim()) {
        try {
          audioFile.setProperty("LYRICS", metadata.lyrics);
        } catch {
          // ignore if format doesn't support lyrics
        }
      }
    }

    // Cover art (only touch if user modified or removed it)
    if (coverDirty) {
      try {
        if (coverArt) {
          const pic: Picture = {
            mimeType: coverArt.mimeType || "image/jpeg",
            data: coverArt.data,
            type: "FrontCover",
            description: coverArt.description || "Cover",
          };
          audioFile.setPictures([pic]);
        } else {
          audioFile.removePictures();
        }
      } catch {
        // Some formats like raw WAV might not support embedded APIC
      }
    }

    const ok = audioFile.save();
    if (!ok) {
      throw new Error("TagLib reported save() returned false for this audio format.");
    }

    const out = audioFile.getFileBuffer();
    const copy = new Uint8Array(out.byteLength);
    copy.set(out);
    return copy;
  } finally {
    audioFile.dispose();
  }
}
