import JSZip from "jszip";
import { cloneMetadata, isTrackDirty, type TrackItem } from "./types";
import { readUniversalFile, writeUniversalFile } from "./universalMetadata";

export function getExtension(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx >= 0 ? filename.slice(idx + 1).toLowerCase() : "";
}

export function isZipFile(filename: string): boolean {
  return getExtension(filename) === "zip";
}

function splitPath(fullPath: string): { folderPath: string; filename: string } {
  const clean = fullPath.replace(/^\/+/, "").replace(/\\/g, "/");
  const idx = clean.lastIndexOf("/");
  if (idx < 0) return { folderPath: "", filename: clean };
  return {
    folderPath: clean.slice(0, idx),
    filename: clean.slice(idx + 1),
  };
}

function isJunkPath(path: string): boolean {
  const norm = path.replace(/\\/g, "/");
  return (
    norm.includes("__MACOSX/") ||
    norm.split("/").some((seg) => seg === ".DS_Store" || seg.startsWith("._") || seg === "Thumbs.db")
  );
}

export interface IngestProgress {
  done: number;
  total: number;
  currentFile: string;
}

export interface IngestResult {
  tracks: TrackItem[];
  skipped: string[];
  errors: Array<{ file: string; reason: string }>;
}

interface RawInputEntry {
  filename: string;
  folderPath: string;
  buffer: Uint8Array;
  fromZip?: string;
}

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `file_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

async function extractRawEntriesFromFiles(
  files: Array<{ file: File; relativePath?: string }>,
  errors: Array<{ file: string; reason: string }>
): Promise<RawInputEntry[]> {
  const raw: RawInputEntry[] = [];

  for (const item of files) {
    const rel = item.relativePath || item.file.webkitRelativePath || item.file.name;
    if (isJunkPath(rel)) continue;

    if (isZipFile(item.file.name)) {
      try {
        const zipBuffer = await item.file.arrayBuffer();
        const zip = await JSZip.loadAsync(zipBuffer);
        const zipBaseName = item.file.name.replace(/\.zip$/i, "");

        const zipEntries = Object.values(zip.files).filter((entry) => !entry.dir);
        for (const entry of zipEntries) {
          if (isJunkPath(entry.name)) continue;
          const { folderPath, filename } = splitPath(entry.name);
          if (!filename) continue;
          try {
            const bytes = await entry.async("uint8array");
            raw.push({
              filename,
              folderPath,
              buffer: bytes,
              fromZip: zipBaseName,
            });
          } catch (err) {
            errors.push({
              file: entry.name,
              reason: err instanceof Error ? err.message : "Failed to extract entry from ZIP",
            });
          }
        }
      } catch (err) {
        errors.push({
          file: item.file.name,
          reason: err instanceof Error ? err.message : "Failed to open ZIP archive",
        });
      }
      continue;
    }

    // Accept EVERY file type (audio, images, docs, PDFs, videos, binaries)
    try {
      const ab = await item.file.arrayBuffer();
      const { folderPath, filename } = splitPath(rel);
      raw.push({
        filename,
        folderPath,
        buffer: new Uint8Array(ab),
      });
    } catch (err) {
      errors.push({
        file: rel,
        reason: err instanceof Error ? err.message : "Failed to read file",
      });
    }
  }

  return raw;
}

export async function ingestFileList(
  files: Array<{ file: File; relativePath?: string }>,
  onProgress?: (progress: IngestProgress) => void
): Promise<IngestResult> {
  const skipped: string[] = [];
  const errors: Array<{ file: string; reason: string }> = [];
  const rawEntries = await extractRawEntriesFromFiles(files, errors);

  const tracks: TrackItem[] = [];
  const total = rawEntries.length;

  for (let i = 0; i < rawEntries.length; i++) {
    const entry = rawEntries[i];
    onProgress?.({ done: i, total, currentFile: entry.filename });
    try {
      const parsed = await readUniversalFile(entry.buffer, entry.filename, entry.folderPath);
      tracks.push({
        id: generateId(),
        fileKind: parsed.fileKind,
        handlerId: parsed.handlerId,
        filename: entry.filename,
        originalFilename: entry.filename,
        folderPath: entry.folderPath,
        buffer: entry.buffer,
        fileSize: entry.buffer.byteLength,
        mimeType: parsed.mimeType,
        tech: parsed.tech,
        metadata: cloneMetadata(parsed.metadata),
        originalMetadata: cloneMetadata(parsed.metadata),
        formatRecords: parsed.formatRecords,
        coverArt: parsed.coverArt,
        originalCoverArt: parsed.coverArt,
        coverDirty: false,
        stripAllMetadata: false,
        fromZip: entry.fromZip,
        isCdaPointer: parsed.isCdaPointer,
        sourceDrive: parsed.isCdaPointer
          ? { name: entry.folderPath || "Audio CD", kind: "cd", writable: false }
          : undefined,
      });
    } catch (err) {
      errors.push({
        file: entry.folderPath ? `${entry.folderPath}/${entry.filename}` : entry.filename,
        reason: err instanceof Error ? err.message : "Failed to inspect file",
      });
    }
  }

  onProgress?.({ done: total, total, currentFile: "" });
  return { tracks, skipped, errors };
}

/** Recursively walks a DragEvent DataTransfer (supports any files, nested folders, and .zip) */
export async function collectFilesFromDataTransfer(
  dataTransfer: DataTransfer
): Promise<Array<{ file: File; relativePath?: string }>> {
  const items = Array.from(dataTransfer.items ?? []);
  const supportsEntry = items.length > 0 && typeof items[0].webkitGetAsEntry === "function";

  if (!supportsEntry) {
    return Array.from(dataTransfer.files ?? []).map((file) => ({
      file,
      relativePath: file.webkitRelativePath || file.name,
    }));
  }

  const results: Array<{ file: File; relativePath?: string }> = [];

  async function walkEntry(entry: FileSystemEntry, prefix: string): Promise<void> {
    if (entry.isFile) {
      const fileEntry = entry as FileSystemFileEntry;
      await new Promise<void>((resolve) => {
        fileEntry.file(
          (file) => {
            const rel = prefix ? `${prefix}/${file.name}` : file.name;
            results.push({ file, relativePath: rel });
            resolve();
          },
          () => resolve()
        );
      });
    } else if (entry.isDirectory) {
      const dirEntry = entry as FileSystemDirectoryEntry;
      const reader = dirEntry.createReader();
      const nextPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;

      while (true) {
        const batch = await new Promise<FileSystemEntry[]>((resolve) => {
          reader.readEntries(
            (entries) => resolve(entries),
            () => resolve([])
          );
        });
        if (batch.length === 0) break;
        for (const child of batch) {
          await walkEntry(child, nextPrefix);
        }
      }
    }
  }

  const entries: FileSystemEntry[] = [];
  for (const item of items) {
    const entry = item.webkitGetAsEntry();
    if (entry) entries.push(entry);
  }

  for (const entry of entries) {
    await walkEntry(entry, "");
  }

  return results;
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Writes modified or stripped metadata to a single file and downloads it */
export async function exportSingleTrack(track: TrackItem): Promise<Uint8Array> {
  const bytes = isTrackDirty(track)
    ? await writeUniversalFile(
        track.buffer,
        track.filename,
        track.fileKind,
        track.metadata,
        track.coverArt,
        track.coverDirty,
        Boolean(track.stripAllMetadata)
      )
    : track.buffer;

  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy.buffer], { type: track.mimeType || "application/octet-stream" });
  triggerBlobDownload(blob, track.filename);
  return bytes;
}

/** Writes modified or stripped metadata to multiple files and downloads them as a .zip archive */
export async function exportTracksAsZip(
  tracks: TrackItem[],
  zipName = "webtag-export.zip",
  onProgress?: (progress: IngestProgress) => void
): Promise<{ updatedBuffers: Map<string, Uint8Array>; failed: Array<{ file: string; reason: string }> }> {
  const zip = new JSZip();
  const updatedBuffers = new Map<string, Uint8Array>();
  const failed: Array<{ file: string; reason: string }> = [];
  const usedPaths = new Set<string>();

  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    onProgress?.({ done: i, total: tracks.length, currentFile: track.filename });

    let bytes = track.buffer;
    if (isTrackDirty(track)) {
      try {
        bytes = await writeUniversalFile(
          track.buffer,
          track.filename,
          track.fileKind,
          track.metadata,
          track.coverArt,
          track.coverDirty,
          Boolean(track.stripAllMetadata)
        );
        updatedBuffers.set(track.id, bytes);
      } catch (err) {
        failed.push({
          file: track.filename,
          reason: err instanceof Error ? err.message : "Failed to write metadata",
        });
        continue;
      }
    }

    let path = track.folderPath ? `${track.folderPath}/${track.filename}` : track.filename;
    if (usedPaths.has(path.toLowerCase())) {
      const dot = path.lastIndexOf(".");
      const stem = dot >= 0 ? path.slice(0, dot) : path;
      const ext = dot >= 0 ? path.slice(dot) : "";
      let counter = 2;
      while (usedPaths.has(`${stem} (${counter})${ext}`.toLowerCase())) {
        counter++;
      }
      path = `${stem} (${counter})${ext}`;
    }
    usedPaths.add(path.toLowerCase());
    zip.file(path, bytes);
  }

  onProgress?.({ done: tracks.length, total: tracks.length, currentFile: "packaging zip..." });
  const blob = await zip.generateAsync({
    type: "blob",
    compression: "STORE",
  });
  triggerBlobDownload(blob, zipName.endsWith(".zip") ? zipName : `${zipName}.zip`);
  return { updatedBuffers, failed };
}

/** Export metadata table as CSV or JSON */
export function exportMetadataReport(tracks: TrackItem[], format: "csv" | "json"): void {
  const rows = tracks.map((t) => ({
    filename: t.filename,
    folder: t.folderPath,
    kind: t.fileKind,
    format: t.tech.format,
    sizeBytes: t.fileSize,
    dimensions: t.tech.width && t.tech.height ? `${t.tech.width}x${t.tech.height}` : "",
    durationSec: Math.round(t.tech.duration),
    title: t.metadata.title,
    authorOrArtist: t.metadata.artist,
    albumOrSubject: t.metadata.album,
    softwareOrEditor: t.metadata.software,
    copyright: t.metadata.copyright,
    cameraMake: t.metadata.cameraMake,
    cameraModel: t.metadata.cameraModel,
    gps: t.metadata.gps,
    yearOrDate: t.metadata.year,
    genreOrKeywords: t.metadata.genre,
    comment: t.metadata.comment,
  }));

  if (format === "json") {
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
    triggerBlobDownload(blob, "webtag-metadata.json");
    return;
  }

  const headers = Object.keys(rows[0] ?? {});
  const escapeCsv = (val: unknown) => {
    const str = String(val ?? "");
    if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
  };
  const csv = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escapeCsv((r as Record<string, unknown>)[h])).join(",")),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  triggerBlobDownload(blob, "webtag-metadata.csv");
}
