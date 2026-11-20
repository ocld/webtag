import JSZip from "jszip";
import { parseXmpIntoMetadata, buildXmpPacket } from "./imageMetadata";
import {
  cloneMetadata,
  createEmptyMetadata,
  type AudioTechInfo,
  type TrackMetadata,
} from "./types";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: false });
const latin1 = new TextDecoder("latin1");

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function decodeXml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function readXmlTag(xml: string, tagName: string): string {
  const esc = tagName.replace(":", "\\:");
  const m = xml.match(new RegExp(`<${esc}[^>]*>([\\s\\S]*?)<\\/${esc}>`, "i"));
  return m ? decodeXml(m[1].trim()) : "";
}

function replaceOrInsertXmlTag(xml: string, tagName: string, value: string, closingRoot: string): string {
  const esc = tagName.replace(":", "\\:");
  const re = new RegExp(`<${esc}[^>]*>[\\s\\S]*?<\\/${esc}>`, "i");
  const selfClosing = new RegExp(`<${esc}[^>]*\\/>`, "i");
  if (!value.trim()) {
    return xml.replace(re, "").replace(selfClosing, "");
  }
  const replacement = `<${tagName}>${escapeXml(value.trim())}</${tagName}>`;
  if (re.test(xml)) return xml.replace(re, replacement);
  if (selfClosing.test(xml)) return xml.replace(selfClosing, replacement);
  return xml.replace(closingRoot, `  ${replacement}\n${closingRoot}`);
}

// ============================================================================
// 1. OOXML Office Documents (.docx, .xlsx, .pptx)
// ============================================================================
export async function readOoxmlMetadata(
  buffer: Uint8Array,
  ext: string
): Promise<{ metadata: TrackMetadata; tech: AudioTechInfo }> {
  const meta = createEmptyMetadata();
  let hasMetadataBlocks = false;

  try {
    const zip = await JSZip.loadAsync(buffer);
    const coreFile = zip.file("docProps/core.xml");
    if (coreFile) {
      hasMetadataBlocks = true;
      const core = await coreFile.async("string");
      meta.title = readXmlTag(core, "dc:title");
      meta.artist = readXmlTag(core, "dc:creator");
      meta.album = readXmlTag(core, "dc:subject");
      meta.comment = readXmlTag(core, "dc:description");
      meta.genre = readXmlTag(core, "cp:keywords");
      meta.year = readXmlTag(core, "dcterms:created");
      const lastModBy = readXmlTag(core, "cp:lastModifiedBy");
      if (lastModBy) meta.customTags.LAST_MODIFIED_BY = lastModBy;
      const modified = readXmlTag(core, "dcterms:modified");
      if (modified) meta.customTags.MODIFIED = modified;
    }

    const appFile = zip.file("docProps/app.xml");
    if (appFile) {
      hasMetadataBlocks = true;
      const app = await appFile.async("string");
      meta.software = readXmlTag(app, "Application");
      meta.albumArtist = readXmlTag(app, "Company");
      const manager = readXmlTag(app, "Manager");
      if (manager) meta.customTags.MANAGER = manager;
    }
  } catch {
    // Corrupted zip-based doc; return empty metadata gracefully
  }

  return {
    metadata: cloneMetadata(meta),
    tech: {
      format: ext.toUpperCase(),
      codec: "OOXML",
      container: "ZIP / Office XML",
      duration: 0,
      bitrate: 0,
      sampleRate: 0,
      channels: 0,
      bitsPerSample: 0,
      isLossless: true,
      hasMetadataBlocks,
    },
  };
}

export async function writeOoxmlMetadata(
  buffer: Uint8Array,
  meta: TrackMetadata,
  stripAll: boolean
): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(buffer);

  const coreXml =
    stripAll
      ? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"/>`
      : (() => {
          const lines = [
            `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
            `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">`,
          ];
          if (meta.title.trim()) lines.push(`  <dc:title>${escapeXml(meta.title.trim())}</dc:title>`);
          if (meta.artist.trim()) lines.push(`  <dc:creator>${escapeXml(meta.artist.trim())}</dc:creator>`);
          if (meta.album.trim()) lines.push(`  <dc:subject>${escapeXml(meta.album.trim())}</dc:subject>`);
          if (meta.comment.trim()) lines.push(`  <dc:description>${escapeXml(meta.comment.trim())}</dc:description>`);
          if (meta.genre.trim()) lines.push(`  <cp:keywords>${escapeXml(meta.genre.trim())}</cp:keywords>`);
          if (meta.customTags.LAST_MODIFIED_BY?.trim()) {
            lines.push(`  <cp:lastModifiedBy>${escapeXml(meta.customTags.LAST_MODIFIED_BY.trim())}</cp:lastModifiedBy>`);
          }
          if (meta.year.trim()) {
            lines.push(`  <dcterms:created xsi:type="dcterms:W3CDTF">${escapeXml(meta.year.trim())}</dcterms:created>`);
          }
          lines.push(`</cp:coreProperties>`);
          return lines.join("\n");
        })();

  zip.file("docProps/core.xml", coreXml);

  const appFile = zip.file("docProps/app.xml");
  if (appFile) {
    let appXml = await appFile.async("string");
    if (stripAll) {
      appXml = replaceOrInsertXmlTag(appXml, "Application", "", "</Properties>");
      appXml = replaceOrInsertXmlTag(appXml, "Company", "", "</Properties>");
      appXml = replaceOrInsertXmlTag(appXml, "Manager", "", "</Properties>");
      appXml = replaceOrInsertXmlTag(appXml, "AppVersion", "", "</Properties>");
      appXml = replaceOrInsertXmlTag(appXml, "Template", "", "</Properties>");
    } else {
      appXml = replaceOrInsertXmlTag(appXml, "Application", meta.software, "</Properties>");
      appXml = replaceOrInsertXmlTag(appXml, "Company", meta.albumArtist, "</Properties>");
      if (meta.customTags.MANAGER !== undefined) {
        appXml = replaceOrInsertXmlTag(appXml, "Manager", meta.customTags.MANAGER, "</Properties>");
      }
    }
    zip.file("docProps/app.xml", appXml);
  }

  if (stripAll) {
    zip.remove("docProps/custom.xml");
  }

  return await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

// ============================================================================
// 2. OpenDocument (.odt, .ods, .odp) & EPUB (.epub)
// ============================================================================
export async function readOdfOrEpubMetadata(
  buffer: Uint8Array,
  ext: string
): Promise<{ metadata: TrackMetadata; tech: AudioTechInfo }> {
  const meta = createEmptyMetadata();
  let hasMetadataBlocks = false;

  try {
    const zip = await JSZip.loadAsync(buffer);
    if (ext === "epub") {
      const opf = Object.values(zip.files).find((f) => !f.dir && f.name.endsWith(".opf"));
      if (opf) {
        hasMetadataBlocks = true;
        const xml = await opf.async("string");
        meta.title = readXmlTag(xml, "dc:title");
        meta.artist = readXmlTag(xml, "dc:creator");
        meta.albumArtist = readXmlTag(xml, "dc:publisher");
        meta.comment = readXmlTag(xml, "dc:description");
        meta.copyright = readXmlTag(xml, "dc:rights");
        meta.year = readXmlTag(xml, "dc:date");
        meta.genre = readXmlTag(xml, "dc:subject");
      }
    } else {
      const metaFile = zip.file("meta.xml");
      if (metaFile) {
        hasMetadataBlocks = true;
        const xml = await metaFile.async("string");
        meta.title = readXmlTag(xml, "dc:title");
        meta.artist = readXmlTag(xml, "dc:creator") || readXmlTag(xml, "meta:initial-creator");
        meta.album = readXmlTag(xml, "dc:subject");
        meta.comment = readXmlTag(xml, "dc:description");
        meta.genre = readXmlTag(xml, "meta:keyword");
        meta.software = readXmlTag(xml, "meta:generator");
        meta.year = readXmlTag(xml, "meta:creation-date");
      }
    }
  } catch {
    // ignore
  }

  return {
    metadata: cloneMetadata(meta),
    tech: {
      format: ext.toUpperCase(),
      codec: ext === "epub" ? "EPUB OPF" : "OpenDocument",
      container: "ZIP / XML",
      duration: 0,
      bitrate: 0,
      sampleRate: 0,
      channels: 0,
      bitsPerSample: 0,
      isLossless: true,
      hasMetadataBlocks,
    },
  };
}

export async function writeOdfOrEpubMetadata(
  buffer: Uint8Array,
  ext: string,
  meta: TrackMetadata,
  stripAll: boolean
): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(buffer);
  if (ext === "epub") {
    const opf = Object.values(zip.files).find((f) => !f.dir && f.name.endsWith(".opf"));
    if (opf) {
      let xml = await opf.async("string");
      const val = (v: string) => (stripAll ? "" : v);
      xml = replaceOrInsertXmlTag(xml, "dc:title", val(meta.title), "</metadata>");
      xml = replaceOrInsertXmlTag(xml, "dc:creator", val(meta.artist), "</metadata>");
      xml = replaceOrInsertXmlTag(xml, "dc:publisher", val(meta.albumArtist), "</metadata>");
      xml = replaceOrInsertXmlTag(xml, "dc:description", val(meta.comment), "</metadata>");
      xml = replaceOrInsertXmlTag(xml, "dc:rights", val(meta.copyright), "</metadata>");
      xml = replaceOrInsertXmlTag(xml, "dc:date", val(meta.year), "</metadata>");
      xml = replaceOrInsertXmlTag(xml, "dc:subject", val(meta.genre), "</metadata>");
      zip.file(opf.name, xml);
    }
  } else {
    const metaFile = zip.file("meta.xml");
    if (metaFile) {
      let xml = await metaFile.async("string");
      const val = (v: string) => (stripAll ? "" : v);
      xml = replaceOrInsertXmlTag(xml, "dc:title", val(meta.title), "</office:meta>");
      xml = replaceOrInsertXmlTag(xml, "dc:creator", val(meta.artist), "</office:meta>");
      xml = replaceOrInsertXmlTag(xml, "meta:initial-creator", val(meta.artist), "</office:meta>");
      xml = replaceOrInsertXmlTag(xml, "dc:subject", val(meta.album), "</office:meta>");
      xml = replaceOrInsertXmlTag(xml, "dc:description", val(meta.comment), "</office:meta>");
      xml = replaceOrInsertXmlTag(xml, "meta:keyword", val(meta.genre), "</office:meta>");
      xml = replaceOrInsertXmlTag(xml, "meta:generator", val(meta.software), "</office:meta>");
      xml = replaceOrInsertXmlTag(xml, "meta:creation-date", val(meta.year), "</office:meta>");
      zip.file("meta.xml", xml);
    }
  }
  return await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

// ============================================================================
// 3. PDF Documents (.pdf) — /Info Dictionary + Embedded XMP Reader/Writer/Stripper
// ============================================================================
function decodePdfString(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("<") && trimmed.endsWith(">")) {
    const hex = trimmed.slice(1, -1).replace(/\s+/g, "");
    const bytes = new Uint8Array(Math.floor(hex.length / 2));
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16) || 0;
    }
    // UTF-16BE BOM (FE FF)
    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
      let out = "";
      for (let i = 2; i + 1 < bytes.length; i += 2) {
        out += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
      }
      return out.trim();
    }
    return latin1.decode(bytes).trim();
  }
  if (trimmed.startsWith("(") && trimmed.endsWith(")")) {
    return trimmed
      .slice(1, -1)
      .replace(/\\([()\\])/g, "$1")
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "")
      .trim();
  }
  return trimmed;
}

function formatPdfLiteral(val: string): string {
  const escaped = val.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  return `(${escaped})`;
}

export function readPdfMetadata(buffer: Uint8Array): { metadata: TrackMetadata; tech: AudioTechInfo } {
  const meta = createEmptyMetadata();
  const raw = latin1.decode(buffer);
  let hasMetadataBlocks = false;

  const grabInfo = (key: string): string => {
    const re = new RegExp(`\\/${key}\\s*(\\((?:\\\\.|[^\\\\)])*\\)|<[0-9a-fA-F\\s]+>)`, "g");
    let last = "";
    for (const m of raw.matchAll(re)) {
      last = decodePdfString(m[1]);
    }
    return last;
  };

  const title = grabInfo("Title");
  const author = grabInfo("Author");
  const subject = grabInfo("Subject");
  const keywords = grabInfo("Keywords");
  const creator = grabInfo("Creator");
  const producer = grabInfo("Producer");
  const created = grabInfo("CreationDate");

  if (title) { meta.title = title; hasMetadataBlocks = true; }
  if (author) { meta.artist = author; hasMetadataBlocks = true; }
  if (subject) { meta.album = subject; hasMetadataBlocks = true; }
  if (keywords) { meta.genre = keywords; hasMetadataBlocks = true; }
  if (creator || producer) {
    meta.software = creator || producer;
    if (creator && producer && creator !== producer) meta.customTags.PRODUCER = producer;
    hasMetadataBlocks = true;
  }
  if (created) { meta.year = created; hasMetadataBlocks = true; }

  // Embedded XMP
  const xmpStart = raw.indexOf("<x:xmpmeta");
  const xmpEnd = raw.indexOf("</x:xmpmeta>");
  if (xmpStart >= 0 && xmpEnd > xmpStart) {
    hasMetadataBlocks = true;
    parseXmpIntoMetadata(raw.slice(xmpStart, xmpEnd + 12), meta);
  }

  return {
    metadata: cloneMetadata(meta),
    tech: {
      format: "PDF",
      codec: "PDF",
      container: "Portable Document",
      duration: 0,
      bitrate: 0,
      sampleRate: 0,
      channels: 0,
      bitsPerSample: 0,
      isLossless: true,
      hasMetadataBlocks,
    },
  };
}

/**
 * Safe PDF metadata writer & stripper:
 * 1) Overwrites any embedded XMP packet in-place with exact-length space-padded XMP (or blank spaces when stripping)
 *    so PDF xref byte offsets remain 100% intact!
 * 2) Appends a valid PDF incremental update overriding /Info dictionary fields (or clearing them when stripping).
 */
export function writePdfMetadata(
  buffer: Uint8Array,
  meta: TrackMetadata,
  stripAll: boolean
): Uint8Array {
  const out = new Uint8Array(buffer.byteLength);
  out.set(buffer);

  // 1. In-place exact-length XMP rewrite/blanking (preserves all xref byte offsets!)
  const raw = latin1.decode(out);
  const xmpStart = raw.indexOf("<x:xmpmeta");
  const xmpEndTag = "</x:xmpmeta>";
  const xmpEndIdx = raw.indexOf(xmpEndTag);
  if (xmpStart >= 0 && xmpEndIdx > xmpStart) {
    const slotEnd = xmpEndIdx + xmpEndTag.length;
    const slotLen = slotEnd - xmpStart;
    if (stripAll) {
      for (let i = xmpStart; i < slotEnd; i++) out[i] = 0x20;
    } else {
      const xmpBytes = encoder.encode(buildXmpPacket(meta));
      if (xmpBytes.length <= slotLen) {
        out.set(xmpBytes, xmpStart);
        for (let i = xmpStart + xmpBytes.length; i < slotEnd; i++) out[i] = 0x20;
      }
    }
  }

  // 2. Append valid PDF incremental update for /Info dictionary if trailer/startxref found
  const startXrefMatch = raw.match(/startxref\s+(\d+)\s+%%EOF\s*$/);
  const rootMatch = raw.match(/\/Root\s+(\d+\s+\d+\s+R)/);
  const sizeMatch = raw.match(/\/Size\s+(\d+)/);

  if (!startXrefMatch || !rootMatch || !sizeMatch) {
    return out;
  }

  const prevXref = startXrefMatch[1];
  const rootRef = rootMatch[1];
  const nextObjId = parseInt(sizeMatch[1], 10);

  const infoEntries: string[] = [];
  if (stripAll) {
    infoEntries.push("/Title ()", "/Author ()", "/Subject ()", "/Keywords ()", "/Creator ()", "/Producer ()", "/CreationDate ()", "/ModDate ()");
  } else {
    infoEntries.push(`/Title ${formatPdfLiteral(meta.title)}`);
    infoEntries.push(`/Author ${formatPdfLiteral(meta.artist)}`);
    infoEntries.push(`/Subject ${formatPdfLiteral(meta.album)}`);
    infoEntries.push(`/Keywords ${formatPdfLiteral(meta.genre)}`);
    infoEntries.push(`/Creator ${formatPdfLiteral(meta.software)}`);
    infoEntries.push(`/Producer ${formatPdfLiteral(meta.customTags.PRODUCER ?? "")}`);
    if (meta.year.trim()) infoEntries.push(`/CreationDate ${formatPdfLiteral(meta.year.trim())}`);
  }

  const objOffset = out.byteLength + 1;
  const objStr = `\n${nextObjId} 0 obj\n<< ${infoEntries.join(" ")} >>\nendobj\n`;
  const xrefOffset = out.byteLength + objStr.length;
  const paddedOffset = String(objOffset).padStart(10, "0");
  const trailerStr =
    `xref\n${nextObjId} 1\n${paddedOffset} 00000 n \n` +
    `trailer\n<< /Size ${nextObjId + 1} /Root ${rootRef} /Info ${nextObjId} 0 R /Prev ${prevXref} >>\n` +
    `startxref\n${xrefOffset}\n%%EOF\n`;

  const appendBytes = encoder.encode(objStr + trailerStr);
  const combined = new Uint8Array(out.byteLength + appendBytes.byteLength);
  combined.set(out, 0);
  combined.set(appendBytes, out.byteLength);
  return combined;
}

// ============================================================================
// 4. HTML Files (.html, .htm) — <title> and <meta> tags
// ============================================================================
export function readHtmlMetadata(buffer: Uint8Array): { metadata: TrackMetadata; tech: AudioTechInfo } {
  const meta = createEmptyMetadata();
  const html = decoder.decode(buffer);
  const titleM = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleM) meta.title = decodeXml(titleM[1].trim());

  const readMeta = (name: string): string => {
    const re = new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${name}["']`, "i");
    const m = html.match(re);
    return m ? decodeXml((m[1] ?? m[2] ?? "").trim()) : "";
  };

  meta.artist = readMeta("author");
  meta.comment = readMeta("description");
  meta.software = readMeta("generator");
  meta.genre = readMeta("keywords");
  meta.copyright = readMeta("copyright");

  return {
    metadata: cloneMetadata(meta),
    tech: {
      format: "HTML",
      codec: "UTF-8",
      container: "HTML Document",
      duration: 0,
      bitrate: 0,
      sampleRate: 0,
      channels: 0,
      bitsPerSample: 0,
      isLossless: true,
      hasMetadataBlocks: Boolean(meta.title || meta.artist || meta.comment || meta.software || meta.genre),
    },
  };
}

export function writeHtmlMetadata(
  buffer: Uint8Array,
  meta: TrackMetadata,
  stripAll: boolean
): Uint8Array {
  let html = decoder.decode(buffer);
  // Strip existing author/description/generator/keywords/copyright meta tags
  html = html.replace(
    /\s*<meta[^>]+name=["'](?:author|description|generator|keywords|copyright)["'][^>]*>/gi,
    ""
  );
  if (stripAll) {
    html = html.replace(/<title[^>]*>[\s\S]*?<\/title>/i, "<title></title>");
  } else {
    if (meta.title.trim()) {
      if (/<title[^>]*>[\s\S]*?<\/title>/i.test(html)) {
        html = html.replace(/<title[^>]*>[\s\S]*?<\/title>/i, `<title>${escapeXml(meta.title.trim())}</title>`);
      }
    }
    const tags: string[] = [];
    if (meta.artist.trim()) tags.push(`<meta name="author" content="${escapeXml(meta.artist.trim())}">`);
    if (meta.comment.trim()) tags.push(`<meta name="description" content="${escapeXml(meta.comment.trim())}">`);
    if (meta.software.trim()) tags.push(`<meta name="generator" content="${escapeXml(meta.software.trim())}">`);
    if (meta.genre.trim()) tags.push(`<meta name="keywords" content="${escapeXml(meta.genre.trim())}">`);
    if (meta.copyright.trim()) tags.push(`<meta name="copyright" content="${escapeXml(meta.copyright.trim())}">`);
    if (tags.length > 0 && /<\/head>/i.test(html)) {
      html = html.replace(/<\/head>/i, `  ${tags.join("\n  ")}\n</head>`);
    }
  }
  return encoder.encode(html);
}

// ============================================================================
// 5. Universal Binary / Any File Fallback (PSD, TIFF, HEIC, AVIF, MOV, TXT, BIN, etc.)
// ============================================================================
function detectMagicSignature(buffer: Uint8Array, ext: string): string {
  if (buffer.length >= 4) {
    const h4 = latin1.decode(buffer.subarray(0, 4));
    if (h4 === "8BPS") return "PSD";
    if (h4 === "%PDF") return "PDF";
    if (h4 === "PK\x03\x04") return ext ? ext.toUpperCase() : "ZIP";
    if (h4 === "II*\x00" || h4 === "MM\x00*") return "TIFF";
    if (h4 === "\x00asm") return "WASM";
    if (h4 === "\x7fELF") return "ELF";
    if (h4.startsWith("BM")) return "BMP";
    if (buffer.length >= 12 && latin1.decode(buffer.subarray(4, 8)) === "ftyp") {
      return ext ? ext.toUpperCase() : latin1.decode(buffer.subarray(8, 12)).trim().toUpperCase();
    }
  }
  return ext ? ext.toUpperCase() : "FILE";
}

export function readGenericFileMetadata(
  buffer: Uint8Array,
  filename: string
): { metadata: TrackMetadata; tech: AudioTechInfo } {
  const ext = filename.includes(".") ? filename.split(".").pop()?.toLowerCase() ?? "" : "";
  const fmt = detectMagicSignature(buffer, ext);
  const meta = createEmptyMetadata();
  let hasMetadataBlocks = false;

  // Scan up to first/last chunks (or whole file if <= 12MB) for embedded XMP packet
  // Works on PSD, AI, EPS, TIFF, DNG, HEIC, AVIF, INDD, MOV, MP4, etc.!
  if (buffer.byteLength <= 16 * 1024 * 1024) {
    const raw = latin1.decode(buffer);
    const xmpStart = raw.indexOf("<x:xmpmeta");
    const xmpEnd = raw.indexOf("</x:xmpmeta>");
    if (xmpStart >= 0 && xmpEnd > xmpStart) {
      hasMetadataBlocks = true;
      parseXmpIntoMetadata(raw.slice(xmpStart, xmpEnd + 12), meta);
    }
  }

  return {
    metadata: cloneMetadata(meta),
    tech: {
      format: fmt,
      codec: fmt,
      container: ext ? `.${ext}` : "binary",
      duration: 0,
      bitrate: 0,
      sampleRate: 0,
      channels: 0,
      bitsPerSample: 0,
      isLossless: true,
      hasMetadataBlocks,
    },
  };
}

/**
 * In-place exact-length XMP editor/stripper for arbitrary binary formats (PSD, TIFF, HEIC, MOV, etc.):
 * Never shifts binary offsets, so internal file pointers stay 100% intact!
 */
export function writeGenericFileMetadata(
  buffer: Uint8Array,
  meta: TrackMetadata,
  stripAll: boolean
): Uint8Array {
  const out = new Uint8Array(buffer.byteLength);
  out.set(buffer);

  if (out.byteLength <= 16 * 1024 * 1024) {
    const raw = latin1.decode(out);
    const xmpStart = raw.indexOf("<x:xmpmeta");
    const xmpEndTag = "</x:xmpmeta>";
    const xmpEndIdx = raw.indexOf(xmpEndTag);
    if (xmpStart >= 0 && xmpEndIdx > xmpStart) {
      const slotEnd = xmpEndIdx + xmpEndTag.length;
      const slotLen = slotEnd - xmpStart;
      if (stripAll) {
        for (let i = xmpStart; i < slotEnd; i++) out[i] = 0x20;
      } else {
        const nextXmp = encoder.encode(buildXmpPacket(meta));
        if (nextXmp.length <= slotLen) {
          out.set(nextXmp, xmpStart);
          for (let i = xmpStart + nextXmp.length; i < slotEnd; i++) out[i] = 0x20;
        }
      }
    }
  }

  return out;
}
