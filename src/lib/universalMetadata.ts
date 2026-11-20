import {
  readApkMetadata,
  readDebMetadata,
  readIpaMetadata,
  readJarMetadata,
  readMsixMetadata,
  readNativeBinaryMetadata,
  readPeMetadata,
  writeApkMetadata,
  writeIpaMetadata,
  writePeMetadata,
} from "./appBinaryMetadata";
import { isCdaFile, parseCdaBuffer } from "./discDrive";
import {
  readGenericFileMetadata,
  readHtmlMetadata,
  readOdfOrEpubMetadata,
  readOoxmlMetadata,
  readPdfMetadata,
  writeGenericFileMetadata,
  writeHtmlMetadata,
  writeOdfOrEpubMetadata,
  writeOoxmlMetadata,
  writePdfMetadata,
} from "./docMetadata";
import {
  readGifMetadata,
  readJpegMetadata,
  readPngMetadata,
  readSvgMetadata,
  readWebpMetadata,
  writeGifMetadata,
  writeJpegMetadata,
  writePngMetadata,
  writeSvgMetadata,
  writeWebpMetadata,
} from "./imageMetadata";
import {
  listFormatHandlers,
  registerFormatHandler,
  resolveFormatHandler,
  type FormatReadResult,
} from "./registry";
import { createCoverObjectUrl, guessMimeType, readAudioMetadata, writeAudioMetadata } from "./taglibEngine";
import {
  ALL_STANDARD_FIELDS,
  cloneMetadata,
  createEmptyMetadata,
  type CoverArt,
  type FileCategory,
  type FormatRecordsMap,
  type TrackMetadata,
} from "./types";

export const AUDIO_EXTS = [
  "mp3", "flac", "m4a", "aac", "ogg", "oga", "opus",
  "wav", "aif", "aiff", "wma", "wv", "ape", "mpc", "tta", "dsf", "spx",
];

const PREVIEWABLE_IMAGES = new Set(["jpg", "jpeg", "png", "webp", "gif", "svg", "bmp", "ico", "avif"]);

function buildSingleFormatRecord(formatName: string, meta: TrackMetadata): FormatRecordsMap {
  const map: Record<string, string> = {};
  for (const f of ALL_STANDARD_FIELDS) {
    if (meta[f].trim()) map[f] = meta[f].trim();
  }
  for (const [k, v] of Object.entries(meta.customTags)) {
    if (v.trim()) map[k] = v.trim();
  }
  return Object.keys(map).length > 0 ? { [formatName]: map } : {};
}

export function getExt(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : "";
}

export function guessUniversalMime(filename: string): string {
  const ext = getExt(filename);
  switch (ext) {
    case "jpg":
    case "jpeg": return "image/jpeg";
    case "png": return "image/png";
    case "webp": return "image/webp";
    case "gif": return "image/gif";
    case "svg": return "image/svg+xml";
    case "bmp": return "image/bmp";
    case "avif": return "image/avif";
    case "pdf": return "application/pdf";
    case "docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "xlsx": return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "pptx": return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    case "html":
    case "htm": return "text/html";
    case "mp4":
    case "m4v": return "video/mp4";
    case "mov": return "video/quicktime";
    case "webm": return "video/webm";
    case "apk":
    case "apkm":
    case "apks":
    case "xapk": return "application/vnd.android.package-archive";
    case "aab": return "application/octet-stream";
    case "ipa":
    case "tipa": return "application/octet-stream";
    case "msix":
    case "appx":
    case "msixbundle": return "application/msix";
    case "jar":
    case "war":
    case "ear": return "application/java-archive";
    case "deb": return "application/vnd.debian.binary-package";
    case "exe":
    case "dll":
    case "sys": return "application/vnd.microsoft.portable-executable";
    case "wasm": return "application/wasm";
    default:
      if (AUDIO_EXTS.includes(ext)) return guessMimeType(filename);
      return "application/octet-stream";
  }
}

// ============================================================================
// Register Built-in Format Handlers (easy to extend with registerFormatHandler!)
// ============================================================================
let registered = false;

export function ensureBuiltInHandlersRegistered(): void {
  if (registered) return;
  registered = true;

  // 1. Audio CD (.cda)
  registerFormatHandler({
    id: "cda",
    label: "Audio CD (.cda)",
    category: "audio",
    extensions: ["cda"],
    standards: "RIFF CDDA",
    capabilities: "read + .cue export",
    notes: "Windows Audio CD tracks",
    read: (buffer, filename, folderPath = "") => {
      const cda = parseCdaBuffer(buffer, filename);
      const meta = createEmptyMetadata();
      meta.title = `Track ${String(cda.trackNumber).padStart(2, "0")}`;
      meta.album = folderPath || "Audio CD";
      meta.track = String(cda.trackNumber);
      if (cda.discSerial) meta.customTags = { DISC_ID: cda.discSerial };
      return {
        fileKind: "audio",
        metadata: cloneMetadata(meta),
        formatRecords: buildSingleFormatRecord("CD-DA", meta),
        coverArt: null,
        mimeType: "audio/x-cda",
        isCdaPointer: true,
        tech: {
          format: "CD-DA",
          codec: "PCM 16-bit",
          container: "Audio CD",
          duration: cda.durationSec,
          bitrate: 1411,
          sampleRate: 44100,
          channels: 2,
          bitsPerSample: 16,
          isLossless: true,
        },
      };
    },
    write: ({ buffer }) => buffer,
  });

  // 2. Audio & MP4 via TagLib WASM
  registerFormatHandler({
    id: "taglib-audio",
    label: "Audio (MP3 / FLAC / M4A / OGG / WAV / AIFF)",
    category: "audio",
    extensions: [...AUDIO_EXTS, "mp4", "m4v"],
    standards: "ID3v2, Vorbis, MP4 Atoms, RIFF",
    capabilities: "edit + strip + art + lyrics",
    notes: "C++ TagLib WebAssembly",
    read: async (buffer, filename) => {
      const ext = getExt(filename);
      try {
        const parsed = await readAudioMetadata(buffer, filename);
        const tagStd =
          parsed.tech.format === "MP3" ? "ID3v2" :
          parsed.tech.format === "FLAC" || parsed.tech.format === "OGG" || parsed.tech.format === "OPUS" ? "Vorbis" :
          parsed.tech.format === "MP4" ? "MP4" : parsed.tech.format;
        return {
          fileKind: ext === "mp4" || ext === "m4v" ? "video" : "audio",
          metadata: parsed.metadata,
          formatRecords: buildSingleFormatRecord(tagStd, parsed.metadata),
          coverArt: parsed.coverArt,
          tech: parsed.tech,
          mimeType: guessUniversalMime(filename),
        };
      } catch {
        const g = readGenericFileMetadata(buffer, filename);
        return {
          fileKind: ext === "mp4" || ext === "m4v" ? "video" : "audio",
          metadata: g.metadata,
          formatRecords: buildSingleFormatRecord("XMP", g.metadata),
          coverArt: null,
          tech: g.tech,
          mimeType: guessUniversalMime(filename),
        };
      }
    },
    write: async ({ buffer, metadata, coverArt, coverDirty, stripAll }) => {
      try {
        const effectiveMeta = stripAll ? createEmptyMetadata() : metadata;
        return await writeAudioMetadata(
          buffer,
          effectiveMeta,
          stripAll ? null : coverArt,
          stripAll ? true : coverDirty
        );
      } catch {
        return writeGenericFileMetadata(buffer, metadata, stripAll);
      }
    },
  });

  // 3. JPEG (Exif + IPTC IIM + XMP + COM)
  registerFormatHandler({
    id: "jpeg",
    label: "JPEG (.jpg / .jpeg)",
    category: "image",
    extensions: ["jpg", "jpeg"],
    standards: "Exif, IPTC IIM (APP13), XMP, COM",
    capabilities: "lossless edit + strip + GPS",
    notes: "iptc sync & schema.org",
    detect: (buf) => buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
    read: (buffer) => {
      const parsed = readJpegMetadata(buffer);
      return {
        fileKind: "image",
        metadata: parsed.metadata,
        formatRecords: parsed.formatRecords,
        coverArt: {
          mimeType: "image/jpeg",
          data: buffer,
          objectUrl: createCoverObjectUrl(buffer, "image/jpeg"),
        },
        tech: parsed.tech,
        mimeType: "image/jpeg",
      };
    },
    write: ({ buffer, metadata, stripAll }) => writeJpegMetadata(buffer, metadata, stripAll),
  });

  // 4. PNG (tEXt / iTXt / zTXt / eXIf / XMP)
  registerFormatHandler({
    id: "png",
    label: "PNG (.png)",
    category: "image",
    extensions: ["png"],
    standards: "PNG tEXt/iTXt, eXIf, XMP",
    capabilities: "lossless edit + strip",
    notes: "CRC-32 verified · strips AI prompts",
    detect: (buf) => buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47,
    read: (buffer) => {
      const parsed = readPngMetadata(buffer);
      return {
        fileKind: "image",
        metadata: parsed.metadata,
        formatRecords: parsed.formatRecords,
        coverArt: {
          mimeType: "image/png",
          data: buffer,
          objectUrl: createCoverObjectUrl(buffer, "image/png"),
        },
        tech: parsed.tech,
        mimeType: "image/png",
      };
    },
    write: ({ buffer, metadata, stripAll }) => writePngMetadata(buffer, metadata, stripAll),
  });

  // 5. WebP
  registerFormatHandler({
    id: "webp",
    label: "WebP (.webp)",
    category: "image",
    extensions: ["webp"],
    standards: "RIFF EXIF, XMP",
    capabilities: "lossless edit + strip",
    notes: "updates VP8X flags cleanly",
    detect: (buf) =>
      buf.length >= 12 &&
      buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50,
    read: (buffer) => {
      const parsed = readWebpMetadata(buffer);
      return {
        fileKind: "image",
        metadata: parsed.metadata,
        formatRecords: parsed.formatRecords,
        coverArt: {
          mimeType: "image/webp",
          data: buffer,
          objectUrl: createCoverObjectUrl(buffer, "image/webp"),
        },
        tech: parsed.tech,
        mimeType: "image/webp",
      };
    },
    write: ({ buffer, metadata, stripAll }) => writeWebpMetadata(buffer, metadata, stripAll),
  });

  // 6. GIF
  registerFormatHandler({
    id: "gif",
    label: "GIF (.gif)",
    category: "image",
    extensions: ["gif"],
    standards: "GIF89a COM, XMP",
    capabilities: "lossless edit + strip",
    notes: "comments & XMP extension",
    detect: (buf) => buf.length >= 6 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46,
    read: (buffer) => {
      const parsed = readGifMetadata(buffer);
      return {
        fileKind: "image",
        metadata: parsed.metadata,
        formatRecords: parsed.formatRecords,
        coverArt: {
          mimeType: "image/gif",
          data: buffer,
          objectUrl: createCoverObjectUrl(buffer, "image/gif"),
        },
        tech: parsed.tech,
        mimeType: "image/gif",
      };
    },
    write: ({ buffer, metadata, stripAll }) => writeGifMetadata(buffer, metadata, stripAll),
  });

  // 7. SVG
  registerFormatHandler({
    id: "svg",
    label: "SVG (.svg)",
    category: "image",
    extensions: ["svg"],
    standards: "SVG XML, XMP, Editor Attrs",
    capabilities: "edit + strip",
    notes: "strips Illustrator/Inkscape/Figma",
    read: (buffer) => {
      const parsed = readSvgMetadata(buffer);
      return {
        fileKind: "image",
        metadata: parsed.metadata,
        formatRecords: parsed.formatRecords,
        coverArt: {
          mimeType: "image/svg+xml",
          data: buffer,
          objectUrl: createCoverObjectUrl(buffer, "image/svg+xml"),
        },
        tech: parsed.tech,
        mimeType: "image/svg+xml",
      };
    },
    write: ({ buffer, metadata, stripAll }) => writeSvgMetadata(buffer, metadata, stripAll),
  });

  // 8. Office OOXML (.docx, .xlsx, .pptx)
  registerFormatHandler({
    id: "ooxml",
    label: "Office (.docx / .xlsx / .pptx)",
    category: "document",
    extensions: ["docx", "xlsx", "pptx"],
    standards: "OOXML core.xml & app.xml",
    capabilities: "edit + strip",
    notes: "author, app, company, manager",
    read: async (buffer, filename) => {
      const ext = getExt(filename);
      const parsed = await readOoxmlMetadata(buffer, ext);
      return {
        fileKind: "document",
        metadata: parsed.metadata,
        formatRecords: buildSingleFormatRecord("OOXML", parsed.metadata),
        coverArt: null,
        tech: parsed.tech,
        mimeType: guessUniversalMime(filename),
      };
    },
    write: ({ buffer, metadata, stripAll }) => writeOoxmlMetadata(buffer, metadata, stripAll),
  });

  // 9. OpenDocument & EPUB
  registerFormatHandler({
    id: "odf-epub",
    label: "OpenDocument & EPUB (.odt / .ods / .odp / .epub)",
    category: "document",
    extensions: ["odt", "ods", "odp", "epub"],
    standards: "ODF meta.xml / EPUB OPF",
    capabilities: "edit + strip",
    notes: "creator, generator, rights",
    read: async (buffer, filename) => {
      const ext = getExt(filename);
      const parsed = await readOdfOrEpubMetadata(buffer, ext);
      return {
        fileKind: "document",
        metadata: parsed.metadata,
        formatRecords: buildSingleFormatRecord(ext === "epub" ? "EPUB" : "ODF", parsed.metadata),
        coverArt: null,
        tech: parsed.tech,
        mimeType: guessUniversalMime(filename),
      };
    },
    write: ({ buffer, ext, metadata, stripAll }) => writeOdfOrEpubMetadata(buffer, ext, metadata, stripAll),
  });

  // 10. PDF
  registerFormatHandler({
    id: "pdf",
    label: "PDF (.pdf)",
    category: "document",
    extensions: ["pdf"],
    standards: "PDF /Info dict & XMP",
    capabilities: "edit + strip",
    notes: "preserves xref byte offsets",
    detect: (buf) => buf.length >= 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46,
    read: (buffer) => {
      const parsed = readPdfMetadata(buffer);
      return {
        fileKind: "document",
        metadata: parsed.metadata,
        formatRecords: buildSingleFormatRecord("PDF", parsed.metadata),
        coverArt: null,
        tech: parsed.tech,
        mimeType: "application/pdf",
      };
    },
    write: ({ buffer, metadata, stripAll }) => writePdfMetadata(buffer, metadata, stripAll),
  });

  // 11. HTML
  registerFormatHandler({
    id: "html",
    label: "HTML (.html / .htm)",
    category: "document",
    extensions: ["html", "htm"],
    standards: "HTML <title> & <meta>",
    capabilities: "edit + strip",
    notes: "author, generator, keywords",
    read: (buffer) => {
      const parsed = readHtmlMetadata(buffer);
      return {
        fileKind: "document",
        metadata: parsed.metadata,
        formatRecords: buildSingleFormatRecord("HTML", parsed.metadata),
        coverArt: null,
        tech: parsed.tech,
        mimeType: "text/html",
      };
    },
    write: ({ buffer, metadata, stripAll }) => writeHtmlMetadata(buffer, metadata, stripAll),
  });

  // 12. Android Packages & Split Bundles (.apk / .apkm / .apks / .xapk / .aab)
  registerFormatHandler({
    id: "apk",
    label: "Android (.apk / .apkm / .apks / .xapk / .aab)",
    category: "app",
    extensions: ["apk", "apkm", "apks", "xapk", "aab"],
    standards: "Binary AXML AndroidManifest, Split Bundles, META-INF",
    capabilities: "inspect + edit + strip",
    notes: "split APKs, OBB, SDK, perms, icon",
    read: async (buffer, filename) => {
      const parsed = await readApkMetadata(buffer, filename);
      return {
        fileKind: "app",
        metadata: parsed.metadata,
        formatRecords: parsed.formatRecords,
        coverArt: parsed.coverArt,
        tech: parsed.tech,
        mimeType: guessUniversalMime(filename),
      };
    },
    write: ({ buffer, metadata, stripAll }) => writeApkMetadata(buffer, metadata, stripAll),
  });

  // 13. iOS & TrollStore App Bundles (.ipa / .tipa)
  registerFormatHandler({
    id: "ipa",
    label: "iOS / TrollStore (.ipa / .tipa)",
    category: "app",
    extensions: ["ipa", "tipa"],
    standards: "XML & Binary Info.plist, iTunesMetadata, MobileProvision",
    capabilities: "inspect + edit + strip",
    notes: "bundle ID, min iOS, TrollStore, icon",
    read: async (buffer, filename) => {
      const parsed = await readIpaMetadata(buffer, filename);
      return {
        fileKind: "app",
        metadata: parsed.metadata,
        formatRecords: parsed.formatRecords,
        coverArt: parsed.coverArt,
        tech: parsed.tech,
        mimeType: guessUniversalMime(filename),
      };
    },
    write: ({ buffer, metadata, stripAll }) => writeIpaMetadata(buffer, metadata, stripAll),
  });

  // 14. Windows MSIX / AppX Packages (.msix / .appx / .msixbundle)
  registerFormatHandler({
    id: "msix",
    label: "Windows Package (.msix / .appx)",
    category: "app",
    extensions: ["msix", "appx", "msixbundle"],
    standards: "AppxManifest.xml",
    capabilities: "inspect",
    notes: "identity, publisher, version, logo",
    read: async (buffer, filename) => {
      const parsed = await readMsixMetadata(buffer, filename);
      return {
        fileKind: "app",
        metadata: parsed.metadata,
        formatRecords: parsed.formatRecords,
        coverArt: parsed.coverArt,
        tech: parsed.tech,
        mimeType: guessUniversalMime(filename),
      };
    },
    write: ({ buffer, metadata, stripAll }) => writeGenericFileMetadata(buffer, metadata, stripAll),
  });

  // 15. Java Archives (.jar / .war / .ear)
  registerFormatHandler({
    id: "jar",
    label: "Java Archive (.jar / .war / .ear)",
    category: "app",
    extensions: ["jar", "war", "ear"],
    standards: "META-INF/MANIFEST.MF",
    capabilities: "inspect",
    notes: "Main-Class, vendor, Build-Jdk",
    read: async (buffer, filename) => {
      const parsed = await readJarMetadata(buffer, filename);
      return {
        fileKind: "app",
        metadata: parsed.metadata,
        formatRecords: parsed.formatRecords,
        coverArt: null,
        tech: parsed.tech,
        mimeType: guessUniversalMime(filename),
      };
    },
    write: ({ buffer, metadata, stripAll }) => writeGenericFileMetadata(buffer, metadata, stripAll),
  });

  // 16. Debian / iOS Jailbreak Packages (.deb)
  registerFormatHandler({
    id: "deb",
    label: "Debian / Jailbreak (.deb)",
    category: "app",
    extensions: ["deb"],
    standards: "AR Archive + DEBIAN/control",
    capabilities: "inspect",
    notes: "package, author, arch, section",
    detect: (buf) =>
      buf.length >= 8 &&
      buf[0] === 0x21 && buf[1] === 0x3c && buf[2] === 0x61 && buf[3] === 0x72 &&
      buf[4] === 0x63 && buf[5] === 0x68 && buf[6] === 0x3e && buf[7] === 0x0a,
    read: async (buffer, filename) => {
      const parsed = await readDebMetadata(buffer);
      return {
        fileKind: "app",
        metadata: parsed.metadata,
        formatRecords: parsed.formatRecords,
        coverArt: null,
        tech: parsed.tech,
        mimeType: guessUniversalMime(filename),
      };
    },
    write: ({ buffer, metadata, stripAll }) => writeGenericFileMetadata(buffer, metadata, stripAll),
  });

  // 17. Windows PE Executables (.exe / .dll / .sys / .ocx)
  registerFormatHandler({
    id: "pe",
    label: "Windows Executable (.exe / .dll / .sys)",
    category: "app",
    extensions: ["exe", "dll", "sys", "ocx", "scr"],
    standards: "PE/COFF Header + VS_VERSION_INFO",
    capabilities: "inspect + timestamp strip",
    notes: "arch, compile time, product/company",
    detect: (buf) => buf.length >= 0x44 && buf[0] === 0x4d && buf[1] === 0x5a,
    read: (buffer, filename) => {
      const parsed = readPeMetadata(buffer);
      return {
        fileKind: "app",
        metadata: parsed.metadata,
        formatRecords: parsed.formatRecords,
        coverArt: null,
        tech: parsed.tech,
        mimeType: guessUniversalMime(filename),
      };
    },
    write: ({ buffer, stripAll }) => writePeMetadata(buffer, stripAll),
  });

  // 15. Native Binaries (ELF / Mach-O / WebAssembly)
  registerFormatHandler({
    id: "native-binary",
    label: "Native Binary (.elf / .so / .dylib / .wasm)",
    category: "app",
    extensions: ["elf", "so", "dylib", "macho", "wasm"],
    standards: "ELF64/32, Mach-O Universal, WASM Sections",
    capabilities: "inspect",
    notes: "ISA architecture, binary class, sections",
    detect: (buf) =>
      (buf.length >= 4 && buf[0] === 0x7f && buf[1] === 0x45 && buf[2] === 0x4c && buf[3] === 0x46) ||
      (buf.length >= 4 && buf[0] === 0x00 && buf[1] === 0x61 && buf[2] === 0x73 && buf[3] === 0x6d),
    read: (buffer, filename) => {
      const parsed = readNativeBinaryMetadata(buffer);
      return {
        fileKind: "app",
        metadata: parsed.metadata,
        formatRecords: parsed.formatRecords,
        coverArt: null,
        tech: parsed.tech,
        mimeType: guessUniversalMime(filename),
      };
    },
    write: ({ buffer, metadata, stripAll }) => writeGenericFileMetadata(buffer, metadata, stripAll),
  });

  // 16. Universal Fallback (PSD, TIFF, HEIC, AVIF, MOV, MKV, TXT, BIN — EVERY file!)
  registerFormatHandler({
    id: "generic",
    label: "Any Binary / Text File (PSD, TIFF, HEIC, MOV, etc.)",
    category: "other",
    extensions: [],
    standards: "Embedded XMP & Magic Bytes",
    capabilities: "inspect + XMP edit/strip",
    notes: "in-place length-safe XMP scrub",
    read: (buffer, filename) => {
      const ext = getExt(filename);
      const parsed = readGenericFileMetadata(buffer, filename);
      const mime = guessUniversalMime(filename);
      const kind: FileCategory = PREVIEWABLE_IMAGES.has(ext)
        ? "image"
        : ["mov", "webm", "mkv", "avi"].includes(ext)
          ? "video"
          : "other";
      return {
        fileKind: kind,
        metadata: parsed.metadata,
        formatRecords: buildSingleFormatRecord("XMP", parsed.metadata),
        coverArt: PREVIEWABLE_IMAGES.has(ext)
          ? { mimeType: mime, data: buffer, objectUrl: createCoverObjectUrl(buffer, mime) }
          : null,
        tech: parsed.tech,
        mimeType: mime,
      };
    },
    write: ({ buffer, metadata, stripAll }) => writeGenericFileMetadata(buffer, metadata, stripAll),
  });
}

export async function readUniversalFile(
  buffer: Uint8Array,
  filename: string,
  folderPath = ""
): Promise<FormatReadResult & { handlerId: string }> {
  ensureBuiltInHandlersRegistered();
  const handler = resolveFormatHandler(buffer, filename)!;
  const result = await handler.read(buffer, filename, folderPath);
  return { ...result, handlerId: handler.id };
}

export async function writeUniversalFile(
  buffer: Uint8Array,
  filename: string,
  _fileKind: FileCategory,
  metadata: TrackMetadata,
  coverArt: CoverArt | null,
  coverDirty: boolean,
  stripAll = false
): Promise<Uint8Array> {
  ensureBuiltInHandlersRegistered();
  if (isCdaFile(filename)) return buffer;
  const handler = resolveFormatHandler(buffer, filename)!;
  return handler.write({
    buffer,
    filename,
    ext: getExt(filename),
    metadata,
    coverArt,
    coverDirty,
    stripAll,
  });
}

export function getRegisteredFormatSpecs() {
  ensureBuiltInHandlersRegistered();
  return listFormatHandlers();
}
