import { getExtension, type IngestProgress } from "./fileIngestion";
import { cloneMetadata, isTrackDirty, type DriveSourceInfo, type TrackItem } from "./types";
import { readUniversalFile, writeUniversalFile } from "./universalMetadata";

interface FileSystemPermissionDescriptor {
  mode?: "read" | "readwrite";
}

interface ExtendedDirectoryHandle extends FileSystemDirectoryHandle {
  queryPermission?: (desc?: FileSystemPermissionDescriptor) => Promise<PermissionState>;
  requestPermission?: (desc?: FileSystemPermissionDescriptor) => Promise<PermissionState>;
}

interface ExtendedFileHandle extends FileSystemFileHandle {
  createWritable: () => Promise<FileSystemWritableFileStream>;
}

interface ExtendedWindow extends Window {
  showDirectoryPicker?: (options?: {
    id?: string;
    mode?: "read" | "readwrite";
  }) => Promise<ExtendedDirectoryHandle>;
}

export function supportsDirectoryPicker(): boolean {
  return typeof window !== "undefined" && typeof (window as ExtendedWindow).showDirectoryPicker === "function";
}

export function isCdaFile(filename: string): boolean {
  return getExtension(filename) === "cda";
}

/**
 * Parses a Windows Audio CD 44-byte RIFF CDDA (.cda) track descriptor.
 */
export function parseCdaBuffer(buffer: Uint8Array, filename: string): {
  trackNumber: number;
  durationSec: number;
  discSerial: string;
} {
  const fallbackNum = parseInt(filename.match(/\d+/)?.[0] ?? "1", 10) || 1;
  if (buffer.byteLength < 36) {
    return { trackNumber: fallbackNum, durationSec: 0, discSerial: "" };
  }
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const riff = String.fromCharCode(buffer[0], buffer[1], buffer[2], buffer[3]);
  const cdda = String.fromCharCode(buffer[8], buffer[9], buffer[10], buffer[11]);
  if (riff !== "RIFF" || cdda !== "CDDA") {
    return { trackNumber: fallbackNum, durationSec: 0, discSerial: "" };
  }
  const trackNumber = view.getUint16(22, true) || fallbackNum;
  const serial = view.getUint32(24, true).toString(16).toUpperCase().padStart(8, "0");
  const lengthFrames = view.getUint32(32, true);
  const durationSec = Math.round(lengthFrames / 75);
  return { trackNumber, durationSec, discSerial: serial };
}

function isJunkName(name: string): boolean {
  return (
    name === ".DS_Store" ||
    name.startsWith("._") ||
    name === "Thumbs.db" ||
    name === "System Volume Information" ||
    name === ".Trashes" ||
    name === ".Spotlight-V100" ||
    name === ".fseventsd"
  );
}

function makeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `drv_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export interface DriveScanResult {
  drive: DriveSourceInfo;
  tracks: TrackItem[];
  skipped: number;
  errors: Array<{ file: string; reason: string }>;
}

/**
 * Opens the native OS drive/volume picker so the user can select a mounted CD drive,
 * USB flash drive, SD card, or external disk, and scans ALL files (audio, images, docs, etc.).
 */
export async function scanDiscOrUsbDrive(
  onProgress?: (p: IngestProgress) => void
): Promise<DriveScanResult | null> {
  const win = window as ExtendedWindow;
  if (!win.showDirectoryPicker) {
    throw new Error("Directory picker unavailable in this browser");
  }

  let dirHandle: ExtendedDirectoryHandle;
  try {
    dirHandle = await win.showDirectoryPicker({
      id: "webtag-drive",
      mode: "readwrite",
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return null;
    try {
      dirHandle = await win.showDirectoryPicker({
        id: "webtag-drive",
        mode: "read",
      });
    } catch (err2) {
      if (err2 instanceof DOMException && err2.name === "AbortError") return null;
      throw err2;
    }
  }

  let writable = false;
  try {
    if (typeof dirHandle.queryPermission === "function") {
      const state = await dirHandle.queryPermission({ mode: "readwrite" });
      if (state === "granted") {
        writable = true;
      } else if (state === "prompt" && typeof dirHandle.requestPermission === "function") {
        writable = (await dirHandle.requestPermission({ mode: "readwrite" })) === "granted";
      }
    }
  } catch {
    writable = false;
  }

  const discovered: Array<{ handle: FileSystemFileHandle; folderPath: string; name: string }> = [];

  async function walk(handle: ExtendedDirectoryHandle, prefix: string, depth: number): Promise<void> {
    if (depth > 8) return;
    for await (const entry of handle.values()) {
      if (isJunkName(entry.name)) continue;
      if (entry.kind === "file") {
        discovered.push({
          handle: entry as FileSystemFileHandle,
          folderPath: prefix,
          name: entry.name,
        });
      } else if (entry.kind === "directory") {
        const nextPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;
        await walk(entry as ExtendedDirectoryHandle, nextPrefix, depth + 1);
      }
    }
  }

  onProgress?.({ done: 0, total: 1, currentFile: `scanning ${dirHandle.name}...` });
  await walk(dirHandle, "", 0);

  const hasCda = discovered.some((d) => isCdaFile(d.name));
  const looksLikeMacAudioCd =
    /audio\s*cd/i.test(dirHandle.name) ||
    discovered.some((d) => /^\d+\s+audio\s+track\.aiff?$/i.test(d.name));
  const kind: DriveSourceInfo["kind"] =
    hasCda || looksLikeMacAudioCd || !writable ? "cd" : "usb";

  const drive: DriveSourceInfo = {
    name: dirHandle.name || (kind === "cd" ? "Audio CD" : "USB Drive"),
    kind,
    writable: kind === "cd" ? false : writable,
  };

  const tracks: TrackItem[] = [];
  const errors: Array<{ file: string; reason: string }> = [];

  for (let i = 0; i < discovered.length; i++) {
    const item = discovered[i];
    onProgress?.({ done: i, total: discovered.length, currentFile: item.name });
    try {
      const file = await item.handle.getFile();
      const buffer = new Uint8Array(await file.arrayBuffer());
      const parsed = await readUniversalFile(buffer, item.name, item.folderPath || drive.name);
      tracks.push({
        id: makeId(),
        fileKind: parsed.fileKind,
        handlerId: parsed.handlerId,
        filename: item.name,
        originalFilename: item.name,
        folderPath: item.folderPath,
        buffer,
        fileSize: buffer.byteLength,
        mimeType: parsed.mimeType,
        tech: parsed.tech,
        metadata: cloneMetadata(parsed.metadata),
        originalMetadata: cloneMetadata(parsed.metadata),
        formatRecords: parsed.formatRecords,
        coverArt: parsed.coverArt,
        originalCoverArt: parsed.coverArt,
        coverDirty: false,
        stripAllMetadata: false,
        fileHandle: drive.writable && !parsed.isCdaPointer ? item.handle : undefined,
        isCdaPointer: parsed.isCdaPointer,
        sourceDrive: drive,
      });
    } catch (err) {
      errors.push({
        file: item.name,
        reason: err instanceof Error ? err.message : "Failed to read file from drive",
      });
    }
  }

  onProgress?.({ done: discovered.length, total: discovered.length, currentFile: "" });
  return { drive, tracks, skipped: 0, errors };
}

/**
 * Writes modified or stripped files DIRECTLY back in-place onto a mounted writable USB drive / folder!
 */
export async function writeTracksDirectlyToDrive(
  tracks: TrackItem[],
  onProgress?: (p: IngestProgress) => void
): Promise<{
  written: Map<string, Uint8Array>;
  failed: Array<{ file: string; reason: string }>;
}> {
  const written = new Map<string, Uint8Array>();
  const failed: Array<{ file: string; reason: string }> = [];
  const targets = tracks.filter((t) => t.fileHandle && !t.isCdaPointer && isTrackDirty(t));

  for (let i = 0; i < targets.length; i++) {
    const track = targets[i];
    onProgress?.({ done: i, total: targets.length, currentFile: track.filename });
    try {
      const updated = await writeUniversalFile(
        track.buffer,
        track.filename,
        track.fileKind,
        track.metadata,
        track.coverArt,
        track.coverDirty,
        Boolean(track.stripAllMetadata)
      );
      const handle = track.fileHandle as ExtendedFileHandle;
      const stream = await handle.createWritable();
      const copy = new Uint8Array(updated.byteLength);
      copy.set(updated);
      await stream.write(copy.buffer);
      await stream.close();
      written.set(track.id, updated);
    } catch (err) {
      failed.push({
        file: track.filename,
        reason: err instanceof Error ? err.message : "Write permission denied on drive",
      });
    }
  }

  onProgress?.({ done: targets.length, total: targets.length, currentFile: "" });
  return { written, failed };
}

export function exportCueSheet(tracks: TrackItem[]): void {
  const album = tracks[0]?.metadata.album || tracks[0]?.sourceDrive?.name || "Audio CD";
  const performer = tracks[0]?.metadata.albumArtist || tracks[0]?.metadata.artist || "Various Artists";
  const genre = tracks[0]?.metadata.genre || "";
  const year = tracks[0]?.metadata.year || "";

  const esc = (s: string) => s.replace(/"/g, "'");
  const lines: string[] = [];
  if (genre) lines.push(`REM GENRE "${esc(genre)}"`);
  if (year) lines.push(`REM DATE ${year.slice(0, 4)}`);
  lines.push(`PERFORMER "${esc(performer)}"`);
  lines.push(`TITLE "${esc(album)}"`);

  tracks.forEach((t, idx) => {
    const num = String(parseInt(t.metadata.track, 10) || idx + 1).padStart(2, "0");
    lines.push(`FILE "${esc(t.filename)}" WAVE`);
    lines.push(`  TRACK ${num} AUDIO`);
    lines.push(`    TITLE "${esc(t.metadata.title || `Track ${num}`)}"`);
    lines.push(`    PERFORMER "${esc(t.metadata.artist || performer)}"`);
    lines.push(`    INDEX 01 00:00:00`);
  });

  const blob = new Blob([lines.join("\n") + "\n"], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${album.replace(/[<>:"/\\|?*]/g, "_")}.cue`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
