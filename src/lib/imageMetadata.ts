import {
  cloneMetadata,
  createEmptyMetadata,
  type AudioTechInfo,
  type FormatRecordsMap,
  type TrackMetadata,
} from "./types";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: false });
const latin1 = new TextDecoder("latin1");

// ============================================================================
// CRC-32 (IEEE 802.3) for lossless PNG chunk writing
// ============================================================================
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[n] = c >>> 0;
}

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.byteLength;
  }
  return out;
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function recordField(
  records: FormatRecordsMap,
  format: string,
  field: string,
  value: string
): void {
  if (!value.trim()) return;
  if (!records[format]) records[format] = {};
  if (!records[format][field]) records[format][field] = value.trim();
}

// ============================================================================
// Full IPTC / PLUS / Dublin Core XMP Parser & Writer
// ============================================================================
export function parseXmpIntoMetadata(
  xml: string,
  meta: TrackMetadata,
  records?: FormatRecordsMap
): void {
  const grabTag = (tagNames: string[]): string => {
    for (const name of tagNames) {
      const esc = name.replace(":", "\\:");
      const blockRe = new RegExp(`<${esc}[^>]*>([\\s\\S]*?)<\\/${esc}>`, "i");
      const m = xml.match(blockRe);
      if (m) {
        const lis = Array.from(m[1].matchAll(/<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/gi)).map((x) =>
          decodeXmlEntities(x[1].replace(/<[^>]+>/g, "").trim())
        ).filter(Boolean);
        if (lis.length > 0) return lis.join(", ");
        const raw = decodeXmlEntities(m[1].replace(/<[^>]+>/g, "").trim());
        if (raw) return raw;
      }
      const attrRe = new RegExp(`${esc}="([^"]+)"`, "i");
      const a = xml.match(attrRe);
      if (a && a[1].trim()) return decodeXmlEntities(a[1].trim());
    }
    return "";
  };

  const pairs: Array<[keyof TrackMetadata, string[]]> = [
    ["title", ["dc:title"]],
    ["artist", ["dc:creator", "tiff:Artist"]],
    ["comment", ["dc:description"]],
    ["copyright", ["dc:rights"]],
    ["software", ["xmp:CreatorTool", "tiff:Software", "pdf:Producer"]],
    ["year", ["photoshop:DateCreated", "xmp:CreateDate", "exif:DateTimeOriginal"]],
    ["cameraMake", ["tiff:Make"]],
    ["cameraModel", ["tiff:Model"]],
    ["genre", ["dc:subject", "pdf:Keywords"]],
    ["creditLine", ["photoshop:Credit"]],
    ["headline", ["photoshop:Headline"]],
    ["source", ["photoshop:Source"]],
    ["address", ["Iptc4xmpCore:Location"]],
    ["city", ["photoshop:City"]],
    ["state", ["photoshop:State"]],
    ["country", ["photoshop:Country", "Iptc4xmpCore:CountryCode"]],
    ["webStatement", ["xmpRights:WebStatement"]],
    ["licensorName", ["plus:LicensorName"]],
    ["licensorUrl", ["plus:LicensorURL"]],
    ["licensorId", ["plus:LicensorID"]],
  ];

  for (const [field, tags] of pairs) {
    if (field === "customTags") continue;
    const val = grabTag(tags);
    if (!val) continue;
    if (!meta[field]) meta[field] = val;
    if (records) recordField(records, "XMP", field, val);
  }
}

export function buildXmpPacket(meta: TrackMetadata): string {
  const parts: string[] = [];
  if (meta.title) {
    parts.push(`<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(meta.title)}</rdf:li></rdf:Alt></dc:title>`);
  }
  if (meta.artist) {
    parts.push(`<dc:creator><rdf:Seq><rdf:li>${escapeXml(meta.artist)}</rdf:li></rdf:Seq></dc:creator>`);
  }
  if (meta.comment) {
    parts.push(`<dc:description><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(meta.comment)}</rdf:li></rdf:Alt></dc:description>`);
  }
  if (meta.copyright) {
    parts.push(`<dc:rights><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(meta.copyright)}</rdf:li></rdf:Alt></dc:rights>`);
  }
  if (meta.software) parts.push(`<xmp:CreatorTool>${escapeXml(meta.software)}</xmp:CreatorTool>`);
  if (meta.year) parts.push(`<photoshop:DateCreated>${escapeXml(meta.year)}</photoshop:DateCreated>`);
  if (meta.cameraMake) parts.push(`<tiff:Make>${escapeXml(meta.cameraMake)}</tiff:Make>`);
  if (meta.cameraModel) parts.push(`<tiff:Model>${escapeXml(meta.cameraModel)}</tiff:Model>`);
  if (meta.creditLine) parts.push(`<photoshop:Credit>${escapeXml(meta.creditLine)}</photoshop:Credit>`);
  if (meta.headline) parts.push(`<photoshop:Headline>${escapeXml(meta.headline)}</photoshop:Headline>`);
  if (meta.source) parts.push(`<photoshop:Source>${escapeXml(meta.source)}</photoshop:Source>`);
  if (meta.address) parts.push(`<Iptc4xmpCore:Location>${escapeXml(meta.address)}</Iptc4xmpCore:Location>`);
  if (meta.city) parts.push(`<photoshop:City>${escapeXml(meta.city)}</photoshop:City>`);
  if (meta.state) parts.push(`<photoshop:State>${escapeXml(meta.state)}</photoshop:State>`);
  if (meta.country) parts.push(`<photoshop:Country>${escapeXml(meta.country)}</photoshop:Country>`);
  if (meta.webStatement) parts.push(`<xmpRights:WebStatement>${escapeXml(meta.webStatement)}</xmpRights:WebStatement>`);
  if (meta.licensorName || meta.licensorUrl || meta.licensorId) {
    const lic: string[] = [];
    if (meta.licensorId) lic.push(`<plus:LicensorID>${escapeXml(meta.licensorId)}</plus:LicensorID>`);
    if (meta.licensorName) lic.push(`<plus:LicensorName>${escapeXml(meta.licensorName)}</plus:LicensorName>`);
    if (meta.licensorUrl) lic.push(`<plus:LicensorURL>${escapeXml(meta.licensorUrl)}</plus:LicensorURL>`);
    parts.push(`<plus:Licensor><rdf:Seq><rdf:li rdf:parseType="Resource">${lic.join("")}</rdf:li></rdf:Seq></plus:Licensor>`);
  }
  if (meta.genre) {
    const kws = meta.genre.split(",").map((k) => k.trim()).filter(Boolean);
    if (kws.length > 0) {
      parts.push(`<dc:subject><rdf:Bag>${kws.map((k) => `<rdf:li>${escapeXml(k)}</rdf:li>`).join("")}</rdf:Bag></dc:subject>`);
    }
  }

  return (
    `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>` +
    `<x:xmpmeta xmlns:x="adobe:ns:meta/">` +
    `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">` +
    `<rdf:Description rdf:about="" ` +
    `xmlns:dc="http://purl.org/dc/elements/1.1/" ` +
    `xmlns:xmp="http://ns.adobe.com/xap/1.0/" ` +
    `xmlns:xmpRights="http://ns.adobe.com/xap/1.0/rights/" ` +
    `xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/" ` +
    `xmlns:Iptc4xmpCore="http://iptc.org/std/Iptc4xmpCore/1.0/xmlns/" ` +
    `xmlns:plus="http://ns.useplus.org/ldf/xmp/1.0/" ` +
    `xmlns:tiff="http://ns.adobe.com/tiff/1.0/">` +
    parts.join("") +
    `</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`
  );
}

// ============================================================================
// Binary IPTC IIM (APP13 / Photoshop 8BIM 0x0404) Parser
// ============================================================================
function parseIptcIimBlock(
  data: Uint8Array,
  meta: TrackMetadata,
  records: FormatRecordsMap
): void {
  const keywords: string[] = [];
  let pos = 0;

  while (pos + 5 <= data.length) {
    if (data[pos] !== 0x1c) {
      pos++;
      continue;
    }
    const recordNum = data[pos + 1];
    const datasetNum = data[pos + 2];
    const len = (data[pos + 3] << 8) | data[pos + 4];
    pos += 5;
    if (pos + len > data.length) break;
    const val = decoder.decode(data.subarray(pos, pos + len)).trim();
    pos += len;

    if (recordNum !== 2 || !val) continue;

    switch (datasetNum) {
      case 5: // Object Name (Title)
        if (!meta.title) meta.title = val;
        recordField(records, "IIM", "title", val);
        break;
      case 25: // Keywords
        keywords.push(val);
        break;
      case 55: // Date Created (YYYYMMDD)
        {
          const formatted = val.length === 8 ? `${val.slice(0, 4)}-${val.slice(4, 6)}-${val.slice(6, 8)}` : val;
          if (!meta.year) meta.year = formatted;
          recordField(records, "IIM", "year", formatted);
        }
        break;
      case 80: // By-line (Creator)
        if (!meta.artist) meta.artist = val;
        recordField(records, "IIM", "artist", val);
        break;
      case 90: // City
        if (!meta.city) meta.city = val;
        recordField(records, "IIM", "city", val);
        break;
      case 92: // Sub-location / Street Address
        if (!meta.address) meta.address = val;
        recordField(records, "IIM", "address", val);
        break;
      case 95: // Province / State
        if (!meta.state) meta.state = val;
        recordField(records, "IIM", "state", val);
        break;
      case 101: // Country
        if (!meta.country) meta.country = val;
        recordField(records, "IIM", "country", val);
        break;
      case 105: // Headline
        if (!meta.headline) meta.headline = val;
        recordField(records, "IIM", "headline", val);
        break;
      case 110: // Credit Line
        if (!meta.creditLine) meta.creditLine = val;
        recordField(records, "IIM", "creditLine", val);
        break;
      case 115: // Source
        if (!meta.source) meta.source = val;
        recordField(records, "IIM", "source", val);
        break;
      case 116: // Copyright Notice
        if (!meta.copyright) meta.copyright = val;
        recordField(records, "IIM", "copyright", val);
        break;
      case 120: // Caption / Abstract (Description)
        if (!meta.comment) meta.comment = val;
        recordField(records, "IIM", "comment", val);
        break;
    }
  }

  if (keywords.length > 0) {
    const joined = keywords.join(", ");
    if (!meta.genre) meta.genre = joined;
    recordField(records, "IIM", "genre", joined);
  }
}

function parsePhotoshopApp13(
  payload: Uint8Array,
  meta: TrackMetadata,
  records: FormatRecordsMap
): void {
  const prefix = "Photoshop 3.0\0";
  if (payload.length < prefix.length || latin1.decode(payload.subarray(0, prefix.length)) !== prefix) {
    return;
  }
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  let pos = prefix.length;

  while (pos + 12 <= payload.length) {
    const sig = latin1.decode(payload.subarray(pos, pos + 4));
    if (sig !== "8BIM") break;
    const resId = view.getUint16(pos + 4, false);
    const nameLen = payload[pos + 6];
    // Pascal string padded to even length (including length byte)
    const paddedNameLen = nameLen + 1 + ((nameLen + 1) % 2);
    const sizePos = pos + 6 + paddedNameLen;
    if (sizePos + 4 > payload.length) break;
    const dataSize = view.getUint32(sizePos, false);
    const dataStart = sizePos + 4;
    const dataEnd = Math.min(payload.length, dataStart + dataSize);

    if (resId === 0x0404) {
      parseIptcIimBlock(payload.subarray(dataStart, dataEnd), meta, records);
    }

    pos = dataEnd + (dataSize % 2);
  }
}

// ============================================================================
// EXIF TIFF IFD Reader & Minimal Clean EXIF Writer
// ============================================================================
function parseTiffExif(
  tiff: Uint8Array,
  meta: TrackMetadata,
  records: FormatRecordsMap
): { hasGps: boolean } {
  let hasGps = false;
  if (tiff.byteLength < 8) return { hasGps };
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  const le = tiff[0] === 0x49 && tiff[1] === 0x49;
  const be = tiff[0] === 0x4d && tiff[1] === 0x4d;
  if (!le && !be) return { hasGps };
  if (view.getUint16(2, le) !== 42) return { hasGps };

  const ifd0Offset = view.getUint32(4, le);

  const readAscii = (valOffset: number, count: number): string => {
    if (count <= 0 || valOffset < 0 || valOffset + count > tiff.byteLength) return "";
    let end = valOffset + count;
    while (end > valOffset && tiff[end - 1] === 0) end--;
    return decoder.decode(tiff.subarray(valOffset, end)).trim();
  };

  const readRational = (off: number): number => {
    if (off < 0 || off + 8 > tiff.byteLength) return 0;
    const num = view.getUint32(off, le);
    const den = view.getUint32(off + 4, le);
    return den ? num / den : 0;
  };

  const readIfd = (offset: number) => {
    const entries = new Map<number, { type: number; count: number; valueOffset: number; rawValueOffset: number }>();
    if (offset <= 0 || offset + 2 > tiff.byteLength) return entries;
    const count = view.getUint16(offset, le);
    for (let i = 0; i < count; i++) {
      const base = offset + 2 + i * 12;
      if (base + 12 > tiff.byteLength) break;
      const tag = view.getUint16(base, le);
      const type = view.getUint16(base + 2, le);
      const cnt = view.getUint32(base + 4, le);
      const typeSize = type === 1 || type === 2 || type === 7 ? 1 : type === 3 ? 2 : type === 4 || type === 9 ? 4 : type === 5 || type === 10 ? 8 : 1;
      const byteLen = cnt * typeSize;
      const valueOffset = byteLen <= 4 ? base + 8 : view.getUint32(base + 8, le);
      const rawValueOffset = view.getUint32(base + 8, le);
      entries.set(tag, { type, count: cnt, valueOffset, rawValueOffset });
    }
    return entries;
  };

  const ifd0 = readIfd(ifd0Offset);
  const strTag = (map: ReturnType<typeof readIfd>, tagId: number): string => {
    const e = map.get(tagId);
    if (!e || e.type !== 2) return "";
    return readAscii(e.valueOffset, e.count);
  };

  const desc = strTag(ifd0, 0x010e);
  const make = strTag(ifd0, 0x010f);
  const model = strTag(ifd0, 0x0110);
  const software = strTag(ifd0, 0x0131);
  const dateTime = strTag(ifd0, 0x0132);
  const artist = strTag(ifd0, 0x013b);
  const copyright = strTag(ifd0, 0x8298);

  if (desc) { if (!meta.comment) meta.comment = desc; if (!meta.title) meta.title = desc; recordField(records, "Exif", "comment", desc); }
  if (make) { meta.cameraMake = make; recordField(records, "Exif", "cameraMake", make); }
  if (model) { meta.cameraModel = model; recordField(records, "Exif", "cameraModel", model); }
  if (software) { meta.software = software; recordField(records, "Exif", "software", software); }
  if (dateTime) { meta.year = dateTime; recordField(records, "Exif", "year", dateTime); }
  if (artist) { meta.artist = artist; recordField(records, "Exif", "artist", artist); }
  if (copyright) { meta.copyright = copyright; recordField(records, "Exif", "copyright", copyright); }

  const exifPtr = ifd0.get(0x8769);
  if (exifPtr) {
    const exifIfd = readIfd(exifPtr.rawValueOffset);
    const dtOrig = strTag(exifIfd, 0x9003);
    if (dtOrig) { meta.year = dtOrig; recordField(records, "Exif", "year", dtOrig); }
    const lens = strTag(exifIfd, 0xa434);
    if (lens) { meta.customTags.LENS = lens; recordField(records, "Exif", "LENS", lens); }
    const iso = exifIfd.get(0x8827);
    if (iso && iso.valueOffset + 2 <= tiff.byteLength) {
      const isoStr = String(view.getUint16(iso.valueOffset, le));
      meta.customTags.ISO = isoStr;
      recordField(records, "Exif", "ISO", isoStr);
    }
    const fnum = exifIfd.get(0x829d);
    if (fnum && fnum.type === 5) {
      const f = readRational(fnum.valueOffset);
      if (f > 0) {
        const s = `f/${f.toFixed(1)}`;
        meta.customTags.APERTURE = s;
        recordField(records, "Exif", "APERTURE", s);
      }
    }
    const focal = exifIfd.get(0x920a);
    if (focal && focal.type === 5) {
      const mm = readRational(focal.valueOffset);
      if (mm > 0) {
        const s = `${Math.round(mm)}mm`;
        meta.customTags.FOCAL_LENGTH = s;
        recordField(records, "Exif", "FOCAL_LENGTH", s);
      }
    }
  }

  const gpsPtr = ifd0.get(0x8825);
  if (gpsPtr) {
    const gpsIfd = readIfd(gpsPtr.rawValueOffset);
    const latRef = strTag(gpsIfd, 0x0001) || "N";
    const lat = gpsIfd.get(0x0002);
    const lonRef = strTag(gpsIfd, 0x0003) || "E";
    const lon = gpsIfd.get(0x0004);
    if (lat && lon && lat.count >= 3 && lon.count >= 3) {
      hasGps = true;
      const latDeg =
        readRational(lat.valueOffset) +
        readRational(lat.valueOffset + 8) / 60 +
        readRational(lat.valueOffset + 16) / 3600;
      const lonDeg =
        readRational(lon.valueOffset) +
        readRational(lon.valueOffset + 8) / 60 +
        readRational(lon.valueOffset + 16) / 3600;
      const latSigned = latRef === "S" ? -latDeg : latDeg;
      const lonSigned = lonRef === "W" ? -lonDeg : lonDeg;
      meta.gps = `${latSigned.toFixed(5)}, ${lonSigned.toFixed(5)}`;
      recordField(records, "Exif", "gps", meta.gps);
    } else if (gpsIfd.size > 0) {
      hasGps = true;
      meta.gps = "present";
      recordField(records, "Exif", "gps", "present");
    }
  }

  return { hasGps };
}

function buildExifApp1Payload(meta: TrackMetadata): Uint8Array | null {
  const tags: Array<{ id: number; bytes: Uint8Array }> = [];
  const pushAscii = (id: number, val: string) => {
    if (!val.trim()) return;
    tags.push({ id, bytes: encoder.encode(val.trim() + "\0") });
  };

  pushAscii(0x010e, meta.comment || meta.title);
  pushAscii(0x010f, meta.cameraMake);
  pushAscii(0x0110, meta.cameraModel);
  pushAscii(0x0131, meta.software);
  pushAscii(0x0132, meta.year);
  pushAscii(0x013b, meta.artist);
  pushAscii(0x8298, meta.copyright);

  if (tags.length === 0) return null;
  tags.sort((a, b) => a.id - b.id);

  const ifdStart = 8;
  const dataStart = ifdStart + 2 + tags.length * 12 + 4;
  let extraBytes = 0;
  for (const t of tags) {
    if (t.bytes.length > 4) extraBytes += t.bytes.length + (t.bytes.length % 2);
  }

  const tiff = new Uint8Array(dataStart + extraBytes);
  const view = new DataView(tiff.buffer);
  tiff[0] = 0x49;
  tiff[1] = 0x49;
  view.setUint16(2, 42, true);
  view.setUint32(4, ifdStart, true);
  view.setUint16(ifdStart, tags.length, true);

  let dataCursor = dataStart;
  tags.forEach((t, idx) => {
    const entryOff = ifdStart + 2 + idx * 12;
    view.setUint16(entryOff, t.id, true);
    view.setUint16(entryOff + 2, 2, true);
    view.setUint32(entryOff + 4, t.bytes.length, true);
    if (t.bytes.length <= 4) {
      tiff.set(t.bytes, entryOff + 8);
    } else {
      view.setUint32(entryOff + 8, dataCursor, true);
      tiff.set(t.bytes, dataCursor);
      dataCursor += t.bytes.length + (t.bytes.length % 2);
    }
  });
  view.setUint32(ifdStart + 2 + tags.length * 12, 0, true);

  const header = new Uint8Array([0x45, 0x78, 0x69, 0x66, 0x00, 0x00]);
  return concatBytes([header, tiff]);
}

// ============================================================================
// 1. JPEG Reader, Editor & Lossless Stripper (Exif + XMP + IPTC IIM + COM)
// ============================================================================
export function readJpegMetadata(buffer: Uint8Array): {
  metadata: TrackMetadata;
  formatRecords: FormatRecordsMap;
  tech: AudioTechInfo;
} {
  const meta = createEmptyMetadata();
  const formatRecords: FormatRecordsMap = {};
  let width = 0;
  let height = 0;
  let colorSpace = "YCbCr";
  let compression = "JPEG";
  let hasGps = false;
  let hasMetadataBlocks = false;

  let pos = 2;
  while (pos + 4 <= buffer.length) {
    if (buffer[pos] !== 0xff) break;
    while (pos < buffer.length && buffer[pos] === 0xff) pos++;
    if (pos >= buffer.length) break;
    const marker = buffer[pos++];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (pos + 2 > buffer.length) break;
    const segLen = (buffer[pos] << 8) | buffer[pos + 1];
    if (segLen < 2 || pos + segLen > buffer.length) break;
    const payload = buffer.subarray(pos + 2, pos + segLen);

    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      if (payload.length >= 6) {
        height = (payload[1] << 8) | payload[2];
        width = (payload[3] << 8) | payload[4];
        const comps = payload[5];
        colorSpace = comps === 1 ? "Grayscale" : comps === 4 ? "CMYK" : "YCbCr / sRGB";
        compression = marker === 0xc2 ? "JPEG Progressive" : "JPEG Baseline";
      }
    } else if (marker === 0xe1) {
      hasMetadataBlocks = true;
      const head6 = latin1.decode(payload.subarray(0, 6));
      if (head6 === "Exif\0\0") {
        const res = parseTiffExif(payload.subarray(6), meta, formatRecords);
        if (res.hasGps) hasGps = true;
      } else {
        const xmpPrefix = "http://ns.adobe.com/xap/1.0/\0";
        if (payload.length > xmpPrefix.length && latin1.decode(payload.subarray(0, xmpPrefix.length)) === xmpPrefix) {
          parseXmpIntoMetadata(decoder.decode(payload.subarray(xmpPrefix.length)), meta, formatRecords);
        }
      }
    } else if (marker === 0xed) {
      // APP13: IPTC IIM inside Photoshop 8BIM 0x0404
      hasMetadataBlocks = true;
      parsePhotoshopApp13(payload, meta, formatRecords);
    } else if (marker === 0xfe) {
      hasMetadataBlocks = true;
      const c = decoder.decode(payload).trim();
      if (c) {
        if (!meta.comment) meta.comment = c;
        recordField(formatRecords, "COM", "comment", c);
      }
    } else if (marker === 0xec) {
      hasMetadataBlocks = true;
    }

    pos += segLen;
  }

  return {
    metadata: cloneMetadata(meta),
    formatRecords,
    tech: {
      format: "JPEG",
      codec: "JPEG",
      container: "JPEG",
      duration: 0,
      bitrate: 0,
      sampleRate: 0,
      channels: 0,
      bitsPerSample: 8,
      isLossless: false,
      width,
      height,
      colorSpace,
      compression,
      hasGps,
      hasMetadataBlocks,
    },
  };
}

export function writeJpegMetadata(
  buffer: Uint8Array,
  meta: TrackMetadata,
  stripAll: boolean
): Uint8Array {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return buffer;

  const keptSegments: Uint8Array[] = [new Uint8Array([0xff, 0xd8])];
  const makeSeg = (marker: number, payload: Uint8Array): Uint8Array => {
    const seg = new Uint8Array(4 + payload.length);
    seg[0] = 0xff;
    seg[1] = marker;
    const len = payload.length + 2;
    seg[2] = (len >> 8) & 0xff;
    seg[3] = len & 0xff;
    seg.set(payload, 4);
    return seg;
  };

  const injected: Uint8Array[] = [];
  if (!stripAll) {
    const exifPayload = buildExifApp1Payload(meta);
    if (exifPayload && exifPayload.length + 2 <= 65535) {
      injected.push(makeSeg(0xe1, exifPayload));
    }
    if (meta.comment.trim()) {
      const comBytes = encoder.encode(meta.comment.trim());
      if (comBytes.length + 2 <= 65535) injected.push(makeSeg(0xfe, comBytes));
    }
    const hasXmp = Boolean(
      meta.title || meta.artist || meta.comment || meta.software || meta.copyright ||
      meta.creditLine || meta.headline || meta.webStatement || meta.licensorName ||
      meta.licensorUrl || meta.licensorId || meta.address || meta.city || meta.state || meta.country || meta.genre
    );
    if (hasXmp) {
      const xmpPayload = concatBytes([
        encoder.encode("http://ns.adobe.com/xap/1.0/\0"),
        encoder.encode(buildXmpPacket(meta)),
      ]);
      if (xmpPayload.length + 2 <= 65535) injected.push(makeSeg(0xe1, xmpPayload));
    }
  }

  let pos = 2;
  let injectedPlaced = false;

  while (pos + 2 <= buffer.length) {
    if (buffer[pos] !== 0xff) {
      keptSegments.push(buffer.subarray(pos));
      break;
    }
    const startPos = pos;
    while (pos < buffer.length && buffer[pos] === 0xff) pos++;
    if (pos >= buffer.length) break;
    const marker = buffer[pos++];

    if (marker === 0xda) {
      if (!injectedPlaced) {
        keptSegments.push(...injected);
        injectedPlaced = true;
      }
      keptSegments.push(buffer.subarray(startPos));
      break;
    }
    if (marker === 0xd9) {
      if (!injectedPlaced) {
        keptSegments.push(...injected);
        injectedPlaced = true;
      }
      keptSegments.push(buffer.subarray(startPos));
      break;
    }
    if (pos + 2 > buffer.length) break;
    const segLen = (buffer[pos] << 8) | buffer[pos + 1];
    const segEnd = pos + segLen;
    if (segLen < 2 || segEnd > buffer.length) {
      keptSegments.push(buffer.subarray(startPos));
      break;
    }

    if (marker === 0xe0) {
      keptSegments.push(buffer.subarray(startPos, segEnd));
      if (!injectedPlaced) {
        keptSegments.push(...injected);
        injectedPlaced = true;
      }
    } else if (marker === 0xe1 || marker === 0xec || marker === 0xed || marker === 0xfe) {
      // Strip old EXIF/XMP/IPTC/Ducky/COM
    } else {
      keptSegments.push(buffer.subarray(startPos, segEnd));
    }

    pos = segEnd;
  }

  return concatBytes(keptSegments);
}

// ============================================================================
// 2. PNG Reader, Editor & Lossless Stripper
// ============================================================================
const PNG_STD_KEYS: Record<string, keyof TrackMetadata> = {
  title: "title",
  author: "artist",
  artist: "artist",
  description: "comment",
  comment: "comment",
  software: "software",
  copyright: "copyright",
  "creation time": "year",
  source: "source",
};

export function readPngMetadata(buffer: Uint8Array): {
  metadata: TrackMetadata;
  formatRecords: FormatRecordsMap;
  tech: AudioTechInfo;
} {
  const meta = createEmptyMetadata();
  const formatRecords: FormatRecordsMap = {};
  let width = 0;
  let height = 0;
  let colorSpace = "RGB";
  let hasGps = false;
  let hasMetadataBlocks = false;

  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let pos = 8;

  while (pos + 12 <= buffer.length) {
    const length = view.getUint32(pos, false);
    const type = latin1.decode(buffer.subarray(pos + 4, pos + 8));
    const dataStart = pos + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) break;
    const data = buffer.subarray(dataStart, dataEnd);

    if (type === "IHDR" && length >= 10) {
      width = view.getUint32(dataStart, false);
      height = view.getUint32(dataStart + 4, false);
      const colorType = data[9];
      colorSpace =
        colorType === 0 ? "Grayscale" :
        colorType === 2 ? "RGB" :
        colorType === 3 ? "Indexed" :
        colorType === 4 ? "Grayscale+A" :
        colorType === 6 ? "RGBA" : "RGB";
    } else if (type === "tEXt") {
      hasMetadataBlocks = true;
      const nul = data.indexOf(0);
      if (nul > 0) {
        const key = latin1.decode(data.subarray(0, nul)).trim();
        const val = latin1.decode(data.subarray(nul + 1)).trim();
        const mapped = PNG_STD_KEYS[key.toLowerCase()];
        if (mapped && mapped !== "customTags") {
          if (!meta[mapped]) meta[mapped] = val;
          recordField(formatRecords, "PNG", mapped, val);
        } else if (key) {
          meta.customTags[key.toUpperCase()] = val;
          recordField(formatRecords, "PNG", key.toUpperCase(), val);
        }
      }
    } else if (type === "iTXt") {
      hasMetadataBlocks = true;
      const nul = data.indexOf(0);
      if (nul > 0 && nul + 3 < data.length) {
        const key = latin1.decode(data.subarray(0, nul)).trim();
        const compFlag = data[nul + 1];
        const langEnd = data.indexOf(0, nul + 3);
        const transEnd = langEnd >= 0 ? data.indexOf(0, langEnd + 1) : -1;
        if (compFlag === 0 && transEnd >= 0) {
          const val = decoder.decode(data.subarray(transEnd + 1)).trim();
          if (key === "XML:com.adobe.xmp") {
            parseXmpIntoMetadata(val, meta, formatRecords);
          } else {
            const mapped = PNG_STD_KEYS[key.toLowerCase()];
            if (mapped && mapped !== "customTags") {
              if (!meta[mapped]) meta[mapped] = val;
              recordField(formatRecords, "PNG", mapped, val);
            } else if (key) {
              meta.customTags[key.toUpperCase()] = val;
              recordField(formatRecords, "PNG", key.toUpperCase(), val);
            }
          }
        }
      }
    } else if (type === "eXIf") {
      hasMetadataBlocks = true;
      const res = parseTiffExif(data, meta, formatRecords);
      if (res.hasGps) hasGps = true;
    } else if (type === "tIME" || type === "zTXt") {
      hasMetadataBlocks = true;
    }

    pos = dataEnd + 4;
  }

  return {
    metadata: cloneMetadata(meta),
    formatRecords,
    tech: {
      format: "PNG",
      codec: "PNG",
      container: "PNG",
      duration: 0,
      bitrate: 0,
      sampleRate: 0,
      channels: 0,
      bitsPerSample: 8,
      isLossless: true,
      width,
      height,
      colorSpace,
      compression: "DEFLATE (Lossless)",
      hasGps,
      hasMetadataBlocks,
    },
  };
}

function buildPngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length, false);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  const crc = crc32(out.subarray(4, 8 + data.length));
  view.setUint32(8 + data.length, crc, false);
  return out;
}

function buildPngITXtChunk(keyword: string, text: string): Uint8Array {
  const keyBytes = encoder.encode(keyword.slice(0, 79));
  const valBytes = encoder.encode(text);
  const payload = new Uint8Array(keyBytes.length + 5 + valBytes.length);
  payload.set(keyBytes, 0);
  payload.set(valBytes, keyBytes.length + 5);
  return buildPngChunk("iTXt", payload);
}

export function writePngMetadata(
  buffer: Uint8Array,
  meta: TrackMetadata,
  stripAll: boolean
): Uint8Array {
  if (buffer.length < 24) return buffer;
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const chunks: Uint8Array[] = [buffer.subarray(0, 8)];

  const newMetaChunks: Uint8Array[] = [];
  if (!stripAll) {
    const pushIf = (k: string, v: string) => {
      if (v.trim()) newMetaChunks.push(buildPngITXtChunk(k, v.trim()));
    };
    pushIf("Title", meta.title);
    pushIf("Author", meta.artist);
    pushIf("Description", meta.comment);
    pushIf("Software", meta.software);
    pushIf("Copyright", meta.copyright);
    pushIf("Creation Time", meta.year);
    pushIf("Source", meta.source || meta.cameraModel);
    for (const [k, v] of Object.entries(meta.customTags)) {
      if (k.trim() && v.trim()) pushIf(k.trim(), v.trim());
    }
    if (meta.creditLine || meta.webStatement || meta.licensorUrl || meta.licensorName || meta.headline) {
      newMetaChunks.push(buildPngITXtChunk("XML:com.adobe.xmp", buildXmpPacket(meta)));
    }
  }

  const STRIP_TYPES = new Set(["tEXt", "iTXt", "zTXt", "eXIf", "tIME"]);
  let pos = 8;
  let placed = false;

  while (pos + 12 <= buffer.length) {
    const length = view.getUint32(pos, false);
    const type = latin1.decode(buffer.subarray(pos + 4, pos + 8));
    const end = pos + 12 + length;
    if (end > buffer.length) break;

    if (type === "IHDR") {
      chunks.push(buffer.subarray(pos, end));
      if (!placed) {
        chunks.push(...newMetaChunks);
        placed = true;
      }
    } else if (!STRIP_TYPES.has(type)) {
      chunks.push(buffer.subarray(pos, end));
    }

    pos = end;
  }

  return concatBytes(chunks);
}

// ============================================================================
// 3. WebP Reader, Editor & Lossless Stripper
// ============================================================================
export function readWebpMetadata(buffer: Uint8Array): {
  metadata: TrackMetadata;
  formatRecords: FormatRecordsMap;
  tech: AudioTechInfo;
} {
  const meta = createEmptyMetadata();
  const formatRecords: FormatRecordsMap = {};
  let width = 0;
  let height = 0;
  let hasGps = false;
  let hasMetadataBlocks = false;

  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let pos = 12;
  while (pos + 8 <= buffer.length) {
    const fourcc = latin1.decode(buffer.subarray(pos, pos + 4));
    const size = view.getUint32(pos + 4, true);
    const dataStart = pos + 8;
    const dataEnd = Math.min(buffer.length, dataStart + size);
    const data = buffer.subarray(dataStart, dataEnd);

    if (fourcc === "VP8X" && data.length >= 10) {
      width = 1 + (data[4] | (data[5] << 8) | (data[6] << 16));
      height = 1 + (data[7] | (data[8] << 8) | (data[9] << 16));
    } else if (fourcc === "VP8 " && data.length >= 10 && width === 0) {
      width = (data[6] | (data[7] << 8)) & 0x3fff;
      height = (data[8] | (data[9] << 8)) & 0x3fff;
    } else if (fourcc === "VP8L" && data.length >= 5 && width === 0) {
      const b0 = data[1], b1 = data[2], b2 = data[3], b3 = data[4];
      width = 1 + (((b1 & 0x3f) << 8) | b0);
      height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
    } else if (fourcc === "EXIF") {
      hasMetadataBlocks = true;
      const offset = latin1.decode(data.subarray(0, 6)) === "Exif\0\0" ? 6 : 0;
      const res = parseTiffExif(data.subarray(offset), meta, formatRecords);
      if (res.hasGps) hasGps = true;
    } else if (fourcc === "XMP ") {
      hasMetadataBlocks = true;
      parseXmpIntoMetadata(decoder.decode(data), meta, formatRecords);
    }

    pos = dataStart + size + (size % 2);
  }

  return {
    metadata: cloneMetadata(meta),
    formatRecords,
    tech: {
      format: "WEBP",
      codec: "WebP",
      container: "RIFF WEBP",
      duration: 0,
      bitrate: 0,
      sampleRate: 0,
      channels: 0,
      bitsPerSample: 8,
      isLossless: false,
      width,
      height,
      colorSpace: "RGB/A",
      compression: "WebP",
      hasGps,
      hasMetadataBlocks,
    },
  };
}

export function writeWebpMetadata(
  buffer: Uint8Array,
  meta: TrackMetadata,
  stripAll: boolean
): Uint8Array {
  if (buffer.length < 16) return buffer;
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const kept: Array<{ fourcc: string; data: Uint8Array }> = [];
  let hasVp8x = false;

  let pos = 12;
  while (pos + 8 <= buffer.length) {
    const fourcc = latin1.decode(buffer.subarray(pos, pos + 4));
    const size = view.getUint32(pos + 4, true);
    const dataStart = pos + 8;
    const dataEnd = Math.min(buffer.length, dataStart + size);
    const data = buffer.subarray(dataStart, dataEnd);
    if (fourcc === "VP8X") hasVp8x = true;
    if (fourcc !== "EXIF" && fourcc !== "XMP ") {
      kept.push({ fourcc, data: new Uint8Array(data) });
    }
    pos = dataStart + size + (size % 2);
  }

  const wantsXmp = !stripAll && Boolean(
    meta.title || meta.artist || meta.comment || meta.software || meta.copyright ||
    meta.creditLine || meta.webStatement || meta.licensorUrl || meta.year
  );

  if (hasVp8x) {
    const vp8x = kept.find((c) => c.fourcc === "VP8X");
    if (vp8x && vp8x.data.length >= 1) {
      vp8x.data[0] &= ~0x0c;
      if (wantsXmp) vp8x.data[0] |= 0x04;
    }
    if (wantsXmp) {
      kept.push({ fourcc: "XMP ", data: encoder.encode(buildXmpPacket(meta)) });
    }
  }

  const bodyParts: Uint8Array[] = [encoder.encode("WEBP")];
  for (const chunk of kept) {
    const pad = chunk.data.length % 2;
    const hdr = new Uint8Array(8);
    for (let i = 0; i < 4; i++) hdr[i] = chunk.fourcc.charCodeAt(i);
    new DataView(hdr.buffer).setUint32(4, chunk.data.length, true);
    bodyParts.push(hdr, chunk.data);
    if (pad) bodyParts.push(new Uint8Array([0]));
  }

  const body = concatBytes(bodyParts);
  const riffHdr = new Uint8Array(8);
  riffHdr.set(encoder.encode("RIFF"), 0);
  new DataView(riffHdr.buffer).setUint32(4, body.length, true);
  return concatBytes([riffHdr, body]);
}

// ============================================================================
// 4. GIF Reader, Editor & Stripper
// ============================================================================
export function readGifMetadata(buffer: Uint8Array): {
  metadata: TrackMetadata;
  formatRecords: FormatRecordsMap;
  tech: AudioTechInfo;
} {
  const meta = createEmptyMetadata();
  const formatRecords: FormatRecordsMap = {};
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const width = buffer.length >= 10 ? view.getUint16(6, true) : 0;
  const height = buffer.length >= 10 ? view.getUint16(8, true) : 0;
  let hasMetadataBlocks = false;

  const text = latin1.decode(buffer);
  const xmpStart = text.indexOf("<x:xmpmeta");
  const xmpEnd = text.indexOf("</x:xmpmeta>");
  if (xmpStart >= 0 && xmpEnd > xmpStart) {
    hasMetadataBlocks = true;
    parseXmpIntoMetadata(text.slice(xmpStart, xmpEnd + 12), meta, formatRecords);
  }

  for (let i = 13; i + 3 < buffer.length; i++) {
    if (buffer[i] === 0x21 && buffer[i + 1] === 0xfe) {
      hasMetadataBlocks = true;
      let p = i + 2;
      const chunks: Uint8Array[] = [];
      while (p < buffer.length && buffer[p] !== 0) {
        const len = buffer[p++];
        if (p + len > buffer.length) break;
        chunks.push(buffer.subarray(p, p + len));
        p += len;
      }
      const comment = decoder.decode(concatBytes(chunks)).trim();
      if (comment) {
        if (!meta.comment) meta.comment = comment;
        recordField(formatRecords, "GIF", "comment", comment);
      }
      break;
    }
  }

  return {
    metadata: cloneMetadata(meta),
    formatRecords,
    tech: {
      format: "GIF",
      codec: "GIF",
      container: "GIF",
      duration: 0,
      bitrate: 0,
      sampleRate: 0,
      channels: 0,
      bitsPerSample: 8,
      isLossless: true,
      width,
      height,
      colorSpace: "Indexed",
      compression: "LZW",
      hasMetadataBlocks,
    },
  };
}

export function writeGifMetadata(
  buffer: Uint8Array,
  meta: TrackMetadata,
  stripAll: boolean
): Uint8Array {
  if (buffer.length < 14) return buffer;
  const packed = buffer[10];
  let pos = 13;
  if (packed & 0x80) pos += 3 * (1 << ((packed & 0x07) + 1));
  const out: Uint8Array[] = [buffer.subarray(0, pos)];

  if (!stripAll && meta.comment.trim()) {
    const cBytes = encoder.encode(meta.comment.trim().slice(0, 255));
    const ext = new Uint8Array(4 + cBytes.length);
    ext[0] = 0x21;
    ext[1] = 0xfe;
    ext[2] = cBytes.length;
    ext.set(cBytes, 3);
    ext[3 + cBytes.length] = 0;
    out.push(ext);
  }

  while (pos < buffer.length) {
    const b = buffer[pos];
    if (b === 0x21 && pos + 2 < buffer.length) {
      const label = buffer[pos + 1];
      if (label === 0xfe) {
        let p = pos + 2;
        while (p < buffer.length && buffer[p] !== 0) p += 1 + buffer[p];
        pos = Math.min(buffer.length, p + 1);
        continue;
      }
      if (label === 0xff && pos + 14 < buffer.length) {
        const appId = latin1.decode(buffer.subarray(pos + 3, pos + 14));
        if (appId === "XMP DataXMP") {
          let p = pos + 14;
          while (p < buffer.length && buffer[p] !== 0) p += 1 + buffer[p];
          pos = Math.min(buffer.length, p + 1);
          continue;
        }
      }
    }
    out.push(buffer.subarray(pos));
    break;
  }

  return concatBytes(out);
}

// ============================================================================
// 5. SVG Reader, Editor & Stripper
// ============================================================================
export function readSvgMetadata(buffer: Uint8Array): {
  metadata: TrackMetadata;
  formatRecords: FormatRecordsMap;
  tech: AudioTechInfo;
} {
  const meta = createEmptyMetadata();
  const formatRecords: FormatRecordsMap = {};
  const xml = decoder.decode(buffer);
  const titleM = xml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const descM = xml.match(/<desc[^>]*>([\s\S]*?)<\/desc>/i);
  if (titleM) {
    meta.title = decodeXmlEntities(titleM[1].trim());
    recordField(formatRecords, "SVG", "title", meta.title);
  }
  if (descM) {
    meta.comment = decodeXmlEntities(descM[1].trim());
    recordField(formatRecords, "SVG", "comment", meta.comment);
  }

  parseXmpIntoMetadata(xml, meta, formatRecords);

  if (!meta.software) {
    const gen = xml.match(/<!--\s*Generator:\s*([^-->]+?)-->/i);
    if (gen) meta.software = gen[1].trim();
    else if (/inkscape:version="([^"]+)"/i.test(xml)) {
      meta.software = `Inkscape ${xml.match(/inkscape:version="([^"]+)"/i)?.[1] ?? ""}`.trim();
    } else if (/figma/i.test(xml)) meta.software = "Figma";
    else if (/sketch/i.test(xml)) meta.software = "Sketch";
    if (meta.software) recordField(formatRecords, "SVG", "software", meta.software);
  }

  const wM = xml.match(/\bwidth="(\d+(?:\.\d+)?)/i);
  const hM = xml.match(/\bheight="(\d+(?:\.\d+)?)/i);

  return {
    metadata: cloneMetadata(meta),
    formatRecords,
    tech: {
      format: "SVG",
      codec: "XML Vector",
      container: "SVG",
      duration: 0,
      bitrate: 0,
      sampleRate: 0,
      channels: 0,
      bitsPerSample: 0,
      isLossless: true,
      width: wM ? Math.round(Number(wM[1])) : 0,
      height: hM ? Math.round(Number(hM[1])) : 0,
      colorSpace: "Vector RGB",
      compression: "None (XML)",
      hasMetadataBlocks: Boolean(meta.title || meta.comment || meta.software || /<metadata[\s>]/i.test(xml)),
    },
  };
}

export function writeSvgMetadata(
  buffer: Uint8Array,
  meta: TrackMetadata,
  stripAll: boolean
): Uint8Array {
  let xml = decoder.decode(buffer);
  xml = xml
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<metadata[\s\S]*?<\/metadata>/gi, "")
    .replace(/<sodipodi:namedview[\s\S]*?(?:\/>|<\/sodipodi:namedview>)/gi, "")
    .replace(/\s+(?:inkscape|sodipodi|sketch|xmlns:inkscape|xmlns:sodipodi|xmlns:sketch):[a-z0-9_-]+="[^"]*"/gi, "")
    .replace(/<title[^>]*>[\s\S]*?<\/title>/gi, "")
    .replace(/<desc[^>]*>[\s\S]*?<\/desc>/gi, "");

  if (!stripAll) {
    const inserts: string[] = [];
    if (meta.title.trim()) inserts.push(`<title>${escapeXml(meta.title.trim())}</title>`);
    if (meta.comment.trim()) inserts.push(`<desc>${escapeXml(meta.comment.trim())}</desc>`);
    if (meta.artist.trim() || meta.software.trim() || meta.copyright.trim() || meta.creditLine.trim() || meta.webStatement.trim()) {
      inserts.push(`<metadata>${buildXmpPacket(meta)}</metadata>`);
    }
    if (inserts.length > 0) {
      xml = xml.replace(/(<svg[^>]*>)/i, `$1\n  ${inserts.join("\n  ")}`);
    }
  }

  return encoder.encode(xml);
}
