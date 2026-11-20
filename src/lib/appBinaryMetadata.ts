import JSZip from "jszip";
import { createCoverObjectUrl } from "./taglibEngine";
import {
  cloneMetadata,
  createEmptyMetadata,
  type AudioTechInfo,
  type CoverArt,
  type FormatRecordsMap,
  type TrackMetadata,
} from "./types";

const utf8 = new TextDecoder("utf-8", { fatal: false });
const utf16le = new TextDecoder("utf-16le", { fatal: false });
const latin1 = new TextDecoder("latin1");

function rec(records: FormatRecordsMap, fmt: string, key: string, val: string): void {
  const clean = val.trim();
  if (!clean) return;
  if (!records[fmt]) records[fmt] = {};
  records[fmt][key] = clean;
}

function emptyTech(format: string, codec: string, container: string): AudioTechInfo {
  return {
    format,
    codec,
    container,
    duration: 0,
    bitrate: 0,
    sampleRate: 0,
    channels: 0,
    bitsPerSample: 0,
    isLossless: true,
    hasMetadataBlocks: false,
  };
}

// ============================================================================
// 1. Android APK / AAB Parser (Binary AXML AndroidManifest.xml + META-INF + Icon)
// ============================================================================
interface AxmlResult {
  packageName: string;
  versionName: string;
  versionCode: string;
  minSdk: string;
  targetSdk: string;
  compileSdk: string;
  label: string;
  permissions: string[];
  activities: string[];
}

function parseAndroidBinaryXml(bytes: Uint8Array): AxmlResult {
  const out: AxmlResult = {
    packageName: "",
    versionName: "",
    versionCode: "",
    minSdk: "",
    targetSdk: "",
    compileSdk: "",
    label: "",
    permissions: [],
    activities: [],
  };
  if (bytes.length < 16) return out;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // Check if plaintext XML first (e.g. decoded manifest)
  if (bytes[0] === 0x3c) {
    const xml = utf8.decode(bytes);
    const attr = (name: string) => {
      const m = xml.match(new RegExp(`${name}="([^"]+)"`));
      return m ? m[1] : "";
    };
    out.packageName = attr("package");
    out.versionName = attr("android:versionName");
    out.versionCode = attr("android:versionCode");
    out.minSdk = attr("android:minSdkVersion");
    out.targetSdk = attr("android:targetSdkVersion");
    out.label = attr("android:label");
    for (const m of xml.matchAll(/uses-permission[^>]+android:name="([^"]+)"/g)) {
      out.permissions.push(m[1]);
    }
    return out;
  }

  // Binary AXML header: type 0x0003 (RES_XML_TYPE), headerSize 0x0008
  const fileType = view.getUint16(0, true);
  if (fileType !== 0x0003) return out;

  const strings: string[] = [];
  let pos = view.getUint16(2, true);

  while (pos + 8 <= bytes.length) {
    const chunkType = view.getUint16(pos, true);
    const headerSize = view.getUint16(pos + 2, true);
    const chunkSize = view.getUint32(pos + 4, true);
    if (chunkSize < 8 || pos + chunkSize > bytes.length) break;

    if (chunkType === 0x0001) {
      // RES_STRING_POOL_TYPE
      const stringCount = view.getUint32(pos + 8, true);
      const flags = view.getUint32(pos + 16, true);
      const stringsStart = view.getUint32(pos + 20, true);
      const isUtf8 = (flags & (1 << 8)) !== 0;

      for (let i = 0; i < stringCount; i++) {
        const offsetPos = pos + headerSize + i * 4;
        if (offsetPos + 4 > pos + chunkSize) break;
        const strRelOffset = view.getUint32(offsetPos, true);
        let sPos = pos + stringsStart + strRelOffset;
        if (sPos >= pos + chunkSize) {
          strings.push("");
          continue;
        }
        if (isUtf8) {
          // UTF-16 length (1-2 bytes) + UTF-8 byte length (1-2 bytes)
          let cLen = bytes[sPos++];
          if (cLen & 0x80) sPos++;
          let bLen = bytes[sPos++];
          if (bLen & 0x80) bLen = ((bLen & 0x7f) << 8) | bytes[sPos++];
          const end = Math.min(pos + chunkSize, sPos + bLen);
          strings.push(utf8.decode(bytes.subarray(sPos, end)));
        } else {
          // UTF-16LE char count (2-4 bytes)
          if (sPos + 2 > pos + chunkSize) {
            strings.push("");
            continue;
          }
          let uLen = view.getUint16(sPos, true);
          sPos += 2;
          if (uLen & 0x8000) {
            uLen = ((uLen & 0x7fff) << 16) | view.getUint16(sPos, true);
            sPos += 2;
          }
          const end = Math.min(pos + chunkSize, sPos + uLen * 2);
          strings.push(utf16le.decode(bytes.subarray(sPos, end)));
        }
      }
    } else if (chunkType === 0x0102) {
      // RES_XML_START_ELEMENT_TYPE
      if (pos + headerSize + 20 <= pos + chunkSize) {
        const nameIdx = view.getInt32(pos + headerSize + 4, true);
        const attrStart = view.getUint16(pos + headerSize + 8, true);
        const attrSize = view.getUint16(pos + headerSize + 10, true);
        const attrCount = view.getUint16(pos + headerSize + 12, true);
        const tagName = strings[nameIdx] ?? "";

        const attrs: Record<string, string> = {};
        for (let a = 0; a < attrCount; a++) {
          const aPos = pos + headerSize + attrStart + a * attrSize;
          if (aPos + 20 > pos + chunkSize) break;
          const aNameIdx = view.getInt32(aPos + 4, true);
          const rawValIdx = view.getInt32(aPos + 8, true);
          const valType = bytes[aPos + 15];
          const valData = view.getInt32(aPos + 16, true);
          const aName = strings[aNameIdx] ?? "";
          if (!aName) continue;

          if (rawValIdx >= 0 && rawValIdx < strings.length) {
            attrs[aName] = strings[rawValIdx];
          } else if (valType === 0x03 && valData >= 0 && valData < strings.length) {
            attrs[aName] = strings[valData];
          } else if (valType === 0x10 || valType === 0x11) {
            attrs[aName] = String(valData);
          } else if (valType === 0x12) {
            attrs[aName] = valData !== 0 ? "true" : "false";
          } else if (valType === 0x01) {
            attrs[aName] = `@0x${(valData >>> 0).toString(16)}`;
          }
        }

        if (tagName === "manifest") {
          if (attrs.package) out.packageName = attrs.package;
          if (attrs.versionName) out.versionName = attrs.versionName;
          if (attrs.versionCode) out.versionCode = attrs.versionCode;
          if (attrs.compileSdkVersion) out.compileSdk = attrs.compileSdkVersion;
        } else if (tagName === "uses-sdk") {
          if (attrs.minSdkVersion) out.minSdk = attrs.minSdkVersion;
          if (attrs.targetSdkVersion) out.targetSdk = attrs.targetSdkVersion;
        } else if (tagName === "application") {
          if (attrs.label && !attrs.label.startsWith("@0x")) out.label = attrs.label;
        } else if (tagName === "uses-permission" && attrs.name) {
          out.permissions.push(attrs.name);
        } else if (tagName === "activity" && attrs.name) {
          out.activities.push(attrs.name);
        }
      }
    }

    pos += chunkSize;
  }

  return out;
}

export async function readApkMetadata(
  buffer: Uint8Array,
  filename: string
): Promise<{
  metadata: TrackMetadata;
  formatRecords: FormatRecordsMap;
  coverArt: CoverArt | null;
  tech: AudioTechInfo;
}> {
  const meta = createEmptyMetadata();
  const records: FormatRecordsMap = {};
  const lower = filename.toLowerCase();
  const ext = lower.slice(lower.lastIndexOf(".") + 1);
  const formatLabel =
    ext === "apkm" ? "APKM" :
    ext === "apks" ? "APKS" :
    ext === "xapk" ? "XAPK" :
    ext === "aab" ? "AAB" : "APK";
  const codecLabel =
    ext === "apkm" ? "APKMirror Split Bundle" :
    ext === "apks" ? "Android Split APK Set" :
    ext === "xapk" ? "APKPure Split Bundle" :
    ext === "aab" ? "Android App Bundle" : "Android Package";
  const tech = emptyTech(formatLabel, codecLabel, `ZIP / ${formatLabel}`);
  let coverArt: CoverArt | null = null;

  try {
    const outerZip = await JSZip.loadAsync(buffer);
    const outerFiles = Object.keys(outerZip.files);

    // 1. Parse split-bundle outer manifests (APKM info.json, XAPK manifest.json, APKS meta.sai_v*.json)
    const bundleJsonCandidates = ["info.json", "manifest.json", "meta.sai_v2.json", "meta.sai_v1.json"];
    for (const jsonName of bundleJsonCandidates) {
      const entry = outerZip.file(jsonName);
      if (!entry) continue;
      try {
        const info = JSON.parse(await entry.async("string")) as Record<string, unknown>;
        tech.hasMetadataBlocks = true;
        const appName = String(info.app_name ?? info.name ?? info.label ?? "").trim();
        const pkg = String(info.pname ?? info.package_name ?? info.package ?? "").trim();
        const vName = String(info.release_version ?? info.version_name ?? "").trim();
        const vCode = String(info.versioncode ?? info.version_code ?? "").trim();
        const minApi = String(info.min_api ?? info.min_sdk_version ?? "").trim();
        const targetApi = String(info.target_sdk_version ?? "").trim();

        if (appName && !meta.title) {
          meta.title = appName;
          rec(records, "BundleInfo", "title", appName);
        }
        if (pkg && !meta.albumArtist) {
          meta.albumArtist = pkg;
          meta.customTags.PACKAGE_ID = pkg;
          rec(records, "BundleInfo", "albumArtist", pkg);
        }
        if (vName || vCode) {
          const ver = vName ? (vCode ? `${vName} (${vCode})` : vName) : `build ${vCode}`;
          if (!meta.album) meta.album = ver;
          rec(records, "BundleInfo", "album", ver);
          if (vName) meta.customTags.VERSION_NAME = vName;
          if (vCode) meta.customTags.VERSION_CODE = vCode;
        }
        if (minApi) {
          meta.customTags.MIN_SDK = `API ${minApi}`;
          rec(records, "BundleInfo", "minSdkVersion", minApi);
        }
        if (targetApi) {
          meta.customTags.TARGET_SDK = `API ${targetApi}`;
          rec(records, "BundleInfo", "targetSdkVersion", targetApi);
        }
        if (Array.isArray(info.arches) && info.arches.length > 0) {
          meta.customTags.NATIVE_ABIS = info.arches.map(String).join(", ");
          rec(records, "BundleInfo", "arches", meta.customTags.NATIVE_ABIS);
        }
        if (Array.isArray(info.dpi) && info.dpi.length > 0) {
          meta.customTags.DPI_SPLITS = info.dpi.map(String).join(", ");
        }
        if (Array.isArray(info.locales) && info.locales.length > 0) {
          meta.customTags.LOCALES = `${info.locales.length} locale(s)`;
        }
        if (Array.isArray(info.permissions) && info.permissions.length > 0) {
          const perms = info.permissions.map((p) => String(p).replace(/^android\.permission\./, ""));
          meta.genre = perms.slice(0, 6).join(", ");
          meta.customTags.PERMISSIONS_COUNT = String(perms.length);
          rec(records, "BundleInfo", "permissions", `${perms.length} permission(s)`);
        }
      } catch {
        // ignore malformed bundle json
      }
    }

    // Check for nested split APKs (.apkm / .apks / .xapk)
    const nestedApks = outerFiles.filter((k) => /\.apk$/i.test(k) && !outerZip.files[k].dir);
    const obbFiles = outerFiles.filter((k) => /\.obb$/i.test(k) && !outerZip.files[k].dir);
    if (nestedApks.length > 0) {
      meta.customTags.SPLIT_APKS = `${nestedApks.length} (${nestedApks.map((p) => p.split("/").pop()).slice(0, 5).join(", ")}${nestedApks.length > 5 ? "…" : ""})`;
      rec(records, "BundleInfo", "splitApks", meta.customTags.SPLIT_APKS);
    }
    if (obbFiles.length > 0) {
      meta.customTags.OBB_EXPANSIONS = obbFiles.map((p) => p.split("/").pop()).join(", ");
    }

    // Outer bundle icon (icon.png in APKM / XAPK)
    const outerIcon = outerZip.file("icon.png") ?? outerZip.file("icon.webp");
    if (outerIcon) {
      const iconBytes = await outerIcon.async("uint8array");
      const mime = outerIcon.name.endsWith(".webp") ? "image/webp" : "image/png";
      coverArt = {
        mimeType: mime,
        data: iconBytes,
        objectUrl: createCoverObjectUrl(iconBytes, mime),
        description: outerIcon.name,
      };
    }

    // Choose target APK zip to inspect AndroidManifest.xml (outer zip for .apk/.aab, or nested base.apk for .apkm/.apks/.xapk)
    let zip = outerZip;
    if (!outerZip.file("AndroidManifest.xml") && !outerZip.file("base/manifest/AndroidManifest.xml") && nestedApks.length > 0) {
      const baseCandidate =
        nestedApks.find((k) => /(^|\/)(base|base-master)\.apk$/i.test(k)) ??
        nestedApks.find((k) => !/split_config|config\./i.test(k)) ??
        nestedApks[0];
      try {
        const innerBytes = await outerZip.files[baseCandidate].async("uint8array");
        zip = await JSZip.loadAsync(innerBytes);
      } catch {
        zip = outerZip;
      }
    }

    const manifestEntry =
      zip.file("AndroidManifest.xml") ?? zip.file("base/manifest/AndroidManifest.xml");

    if (manifestEntry) {
      const mBytes = await manifestEntry.async("uint8array");
      const axml = parseAndroidBinaryXml(mBytes);
      tech.hasMetadataBlocks = true;

      if (axml.label) {
        if (!meta.title) meta.title = axml.label;
        rec(records, "AndroidManifest", "title", axml.label);
      } else if (axml.packageName && !meta.title) {
        meta.title = axml.packageName.split(".").pop() || axml.packageName;
      }

      if (axml.packageName) {
        if (!meta.albumArtist) meta.albumArtist = axml.packageName;
        meta.customTags.PACKAGE_ID = axml.packageName;
        rec(records, "AndroidManifest", "albumArtist", axml.packageName);
      }
      if (axml.versionName || axml.versionCode) {
        const ver = axml.versionName
          ? axml.versionCode
            ? `${axml.versionName} (${axml.versionCode})`
            : axml.versionName
          : `build ${axml.versionCode}`;
        if (!meta.album) meta.album = ver;
        rec(records, "AndroidManifest", "album", ver);
        if (axml.versionName) meta.customTags.VERSION_NAME = axml.versionName;
        if (axml.versionCode) meta.customTags.VERSION_CODE = axml.versionCode;
      }
      if (axml.minSdk) {
        meta.customTags.MIN_SDK = `API ${axml.minSdk}`;
        rec(records, "AndroidManifest", "minSdkVersion", axml.minSdk);
      }
      if (axml.targetSdk) {
        meta.customTags.TARGET_SDK = `API ${axml.targetSdk}`;
        rec(records, "AndroidManifest", "targetSdkVersion", axml.targetSdk);
      }
      if (axml.compileSdk) {
        meta.software = `Android SDK ${axml.compileSdk}`;
        rec(records, "AndroidManifest", "software", meta.software);
      }
      if (axml.permissions.length > 0) {
        const shortPerms = axml.permissions.map((p) => p.replace(/^android\.permission\./, ""));
        if (!meta.genre) meta.genre = shortPerms.slice(0, 6).join(", ");
        meta.customTags.PERMISSIONS_COUNT = String(axml.permissions.length);
        meta.customTags.PERMISSIONS = shortPerms.slice(0, 12).join(", ");
        rec(records, "AndroidManifest", "permissions", `${axml.permissions.length} permission(s)`);
      }
    }

    // META-INF signing & manifest info
    const metaInfFiles = Object.keys(zip.files).filter((k) => k.startsWith("META-INF/"));
    const certFile = metaInfFiles.find((k) => /\.(rsa|dsa|ec)$/i.test(k));
    if (certFile) {
      meta.customTags.SIGNATURE_CERT = certFile;
      rec(records, "META-INF", "signature", certFile);
    }
    const mf = zip.file("META-INF/MANIFEST.MF");
    if (mf) {
      const mfText = await mf.async("string");
      const createdBy = mfText.match(/^Created-By:\s*(.+)$/im)?.[1]?.trim();
      if (createdBy) {
        if (!meta.software) meta.software = createdBy;
        rec(records, "META-INF", "software", createdBy);
      }
    }

    // Embedded WebTag metadata sidecar if previously edited
    const webtagJson = outerZip.file("META-INF/webtag-metadata.json");
    if (webtagJson) {
      try {
        const extra = JSON.parse(await webtagJson.async("string")) as Partial<TrackMetadata>;
        if (extra.title) meta.title = extra.title;
        if (extra.artist) meta.artist = extra.artist;
        if (extra.copyright) meta.copyright = extra.copyright;
        if (extra.comment) meta.comment = extra.comment;
        if (extra.address) meta.address = extra.address;
        if (extra.city) meta.city = extra.city;
        if (extra.country) meta.country = extra.country;
        rec(records, "WebTag", "sidecar", "META-INF/webtag-metadata.json");
      } catch {
        // ignore invalid json
      }
    }

    // Extract best app icon PNG for preview if not already grabbed from outer bundle
    if (!coverArt) {
      const iconCandidates = Object.keys(zip.files)
        .filter((k) => /(ic_launcher|app_icon|icon).*\.(png|webp)$/i.test(k) && !zip.files[k].dir)
        .sort((a, b) => {
          const rank = (p: string) =>
            p.includes("xxxhdpi") ? 5 : p.includes("xxhdpi") ? 4 : p.includes("xhdpi") ? 3 : p.includes("hdpi") ? 2 : 1;
          return rank(b) - rank(a);
        });
      if (iconCandidates[0]) {
        const iconBytes = await zip.files[iconCandidates[0]].async("uint8array");
        const mime = iconCandidates[0].toLowerCase().endsWith(".webp") ? "image/webp" : "image/png";
        coverArt = {
          mimeType: mime,
          data: iconBytes,
          objectUrl: createCoverObjectUrl(iconBytes, mime),
          description: iconCandidates[0],
        };
      }
    }

    // Count DEX & native ABIs
    const dexCount = Object.keys(zip.files).filter((k) => /^classes\d*\.dex$/i.test(k)).length;
    if (dexCount > 0) meta.customTags.DEX_FILES = String(dexCount);
    const abis = Array.from(
      new Set([
        ...Object.keys(zip.files)
          .map((k) => k.match(/^lib\/([^/]+)\//)?.[1])
          .filter((v): v is string => Boolean(v)),
        ...nestedApks
          .map((k) => k.match(/(arm64[_-]v8a|armeabi[_-]v7a|x86_64|x86)/i)?.[1])
          .filter((v): v is string => Boolean(v)),
      ])
    );
    if (abis.length > 0) {
      if (!meta.customTags.NATIVE_ABIS) meta.customTags.NATIVE_ABIS = abis.join(", ");
      tech.codec = `${codecLabel} (${abis.join("/")})`;
    }
  } catch {
    // Non-ZIP or corrupt package
  }

  return { metadata: cloneMetadata(meta), formatRecords: records, coverArt, tech };
}

export async function writeApkMetadata(
  buffer: Uint8Array,
  meta: TrackMetadata,
  stripAll: boolean
): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(buffer);
  if (stripAll) {
    zip.remove("META-INF/webtag-metadata.json");
    // Strip build metadata / comments if present
    for (const k of Object.keys(zip.files)) {
      if (k.startsWith("META-INF/com/android/build/") || k === "DebugProbesKt.bin") {
        zip.remove(k);
      }
    }
    return zip.generateAsync({ type: "uint8array", compression: "DEFLATE", comment: "" });
  }

  const payload = {
    title: meta.title,
    artist: meta.artist,
    album: meta.album,
    albumArtist: meta.albumArtist,
    software: meta.software,
    copyright: meta.copyright,
    comment: meta.comment,
    address: meta.address,
    city: meta.city,
    state: meta.state,
    country: meta.country,
    customTags: meta.customTags,
  };
  zip.file("META-INF/webtag-metadata.json", JSON.stringify(payload, null, 2));
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

// ============================================================================
// 2. iOS IPA Parser (XML Info.plist + Apple Binary Plist bplist00 + AppIcon)
// ============================================================================
function parseBinaryPlist(bytes: Uint8Array): Record<string, string> {
  const out: Record<string, string> = {};
  if (bytes.length < 40 || latin1.decode(bytes.subarray(0, 8)) !== "bplist00") return out;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const trailer = bytes.length - 32;
  const offsetIntSize = bytes[trailer + 6];
  const objectRefSize = bytes[trailer + 7];
  const numObjects = Number(view.getBigUint64(trailer + 8, false));
  const topObject = Number(view.getBigUint64(trailer + 16, false));
  const offsetTableOffset = Number(view.getBigUint64(trailer + 24, false));

  if (numObjects <= 0 || numObjects > 50000 || offsetTableOffset >= trailer) return out;

  const readUIntBE = (pos: number, size: number): number => {
    let val = 0;
    for (let i = 0; i < size; i++) val = val * 256 + bytes[pos + i];
    return val;
  };

  const offsets: number[] = [];
  for (let i = 0; i < numObjects; i++) {
    offsets.push(readUIntBE(offsetTableOffset + i * offsetIntSize, offsetIntSize));
  }

  const parseObj = (idx: number, depth = 0): unknown => {
    if (depth > 8 || idx < 0 || idx >= offsets.length) return null;
    const pos = offsets[idx];
    if (pos >= offsetTableOffset) return null;
    const marker = bytes[pos];
    const kind = marker >> 4;
    let info = marker & 0x0f;
    let dataPos = pos + 1;

    const readLen = (): number => {
      if (info !== 0x0f) return info;
      const intMarker = bytes[dataPos++];
      const intSize = 1 << (intMarker & 0x0f);
      const len = readUIntBE(dataPos, intSize);
      dataPos += intSize;
      return len;
    };

    if (kind === 0x00) {
      if (info === 0x08) return false;
      if (info === 0x09) return true;
      return null;
    }
    if (kind === 0x01) {
      const size = 1 << info;
      return readUIntBE(dataPos, size);
    }
    if (kind === 0x05) {
      const len = readLen();
      return latin1.decode(bytes.subarray(dataPos, dataPos + len));
    }
    if (kind === 0x06) {
      const len = readLen();
      // UTF-16BE
      const slice = bytes.subarray(dataPos, dataPos + len * 2);
      let s = "";
      for (let i = 0; i + 1 < slice.length; i += 2) {
        s += String.fromCharCode((slice[i] << 8) | slice[i + 1]);
      }
      return s;
    }
    if (kind === 0x0a) {
      const len = readLen();
      const arr: unknown[] = [];
      for (let i = 0; i < Math.min(len, 64); i++) {
        arr.push(parseObj(readUIntBE(dataPos + i * objectRefSize, objectRefSize), depth + 1));
      }
      return arr;
    }
    if (kind === 0x0d) {
      const len = readLen();
      const dict: Record<string, unknown> = {};
      for (let i = 0; i < Math.min(len, 256); i++) {
        const kRef = readUIntBE(dataPos + i * objectRefSize, objectRefSize);
        const vRef = readUIntBE(dataPos + (len + i) * objectRefSize, objectRefSize);
        const k = parseObj(kRef, depth + 1);
        const v = parseObj(vRef, depth + 1);
        if (typeof k === "string") dict[k] = v;
      }
      return dict;
    }
    return null;
  };

  const root = parseObj(topObject);
  if (root && typeof root === "object" && !Array.isArray(root)) {
    for (const [k, v] of Object.entries(root as Record<string, unknown>)) {
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
        out[k] = String(v);
      } else if (Array.isArray(v)) {
        out[k] = v.filter((x) => x !== null && x !== undefined).map(String).join(", ");
      }
    }
  }
  return out;
}

function parseXmlPlist(xml: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /<key>([^<]+)<\/key>\s*<(string|integer|real|true|false)>([^<]*)<\/(?:string|integer|real)>|<key>([^<]+)<\/key>\s*<(true|false)\/>/g;
  for (const m of xml.matchAll(re)) {
    if (m[1]) out[m[1]] = m[3]?.trim() ?? "";
    else if (m[4]) out[m[4]] = m[5];
  }
  return out;
}

export async function readIpaMetadata(
  buffer: Uint8Array,
  filename = "app.ipa"
): Promise<{
  metadata: TrackMetadata;
  formatRecords: FormatRecordsMap;
  coverArt: CoverArt | null;
  tech: AudioTechInfo;
}> {
  const meta = createEmptyMetadata();
  const records: FormatRecordsMap = {};
  const isTipa = filename.toLowerCase().endsWith(".tipa");
  const tech = emptyTech(
    isTipa ? "TIPA" : "IPA",
    isTipa ? "TrollStore iOS App" : "iOS App Bundle",
    isTipa ? "ZIP / TIPA" : "ZIP / IPA"
  );
  let coverArt: CoverArt | null = null;

  try {
    const zip = await JSZip.loadAsync(buffer);
    const plistPath = Object.keys(zip.files).find((k) => /^Payload\/[^/]+\.app\/Info\.plist$/i.test(k));

    if (plistPath) {
      const pBytes = await zip.files[plistPath].async("uint8array");
      const isBinary = latin1.decode(pBytes.subarray(0, 8)) === "bplist00";
      const plist = isBinary ? parseBinaryPlist(pBytes) : parseXmlPlist(utf8.decode(pBytes));
      tech.hasMetadataBlocks = true;

      const fmt = isBinary ? "BinaryPlist" : "XMLPlist";
      const displayName = plist.CFBundleDisplayName || plist.CFBundleName || plist.CFBundleExecutable || "";
      if (displayName) {
        meta.title = displayName;
        rec(records, fmt, "title", displayName);
      }
      if (plist.CFBundleIdentifier) {
        meta.albumArtist = plist.CFBundleIdentifier;
        meta.customTags.BUNDLE_ID = plist.CFBundleIdentifier;
        rec(records, fmt, "albumArtist", plist.CFBundleIdentifier);
      }
      if (plist.CFBundleShortVersionString || plist.CFBundleVersion) {
        const ver = plist.CFBundleShortVersionString
          ? plist.CFBundleVersion
            ? `${plist.CFBundleShortVersionString} (${plist.CFBundleVersion})`
            : plist.CFBundleShortVersionString
          : plist.CFBundleVersion;
        meta.album = ver;
        rec(records, fmt, "album", ver);
      }
      if (plist.NSHumanReadableCopyright) {
        meta.copyright = plist.NSHumanReadableCopyright;
        rec(records, fmt, "copyright", plist.NSHumanReadableCopyright);
      }
      if (plist.DTXcodeBuild || plist.DTXcode || plist.DTPlatformVersion) {
        meta.software = [
          plist.DTPlatformName ? `${plist.DTPlatformName} ${plist.DTPlatformVersion ?? ""}`.trim() : "",
          plist.DTXcode ? `Xcode ${plist.DTXcode}` : "",
        ]
          .filter(Boolean)
          .join(" · ");
        rec(records, fmt, "software", meta.software);
      }
      if (plist.MinimumOSVersion) {
        meta.customTags.MIN_IOS = plist.MinimumOSVersion;
        rec(records, fmt, "MinimumOSVersion", plist.MinimumOSVersion);
      }
      if (plist.LSApplicationCategoryType) {
        meta.genre = plist.LSApplicationCategoryType.replace("public.app-category.", "");
        rec(records, fmt, "genre", meta.genre);
      }
    }

    // Optional iTunesMetadata.plist (App Store purchaser / developer metadata — stripped on scrub!)
    const itunesPlist = zip.file("iTunesMetadata.plist");
    if (itunesPlist) {
      const itBytes = await itunesPlist.async("uint8array");
      const isBin = latin1.decode(itBytes.subarray(0, 8)) === "bplist00";
      const it = isBin ? parseBinaryPlist(itBytes) : parseXmlPlist(utf8.decode(itBytes));
      if (it.artistName) {
        if (!meta.artist) meta.artist = it.artistName;
        rec(records, "iTunesMetadata", "artist", it.artistName);
      }
      if (it.itemName && !meta.title) {
        meta.title = it.itemName;
        rec(records, "iTunesMetadata", "title", it.itemName);
      }
      if (it.copyright && !meta.copyright) {
        meta.copyright = it.copyright;
        rec(records, "iTunesMetadata", "copyright", it.copyright);
      }
      if (it.genre && !meta.genre) {
        meta.genre = it.genre;
        rec(records, "iTunesMetadata", "genre", it.genre);
      }
      if (it.appleId) {
        meta.customTags.ITUNES_APPLE_ID = it.appleId;
        rec(records, "iTunesMetadata", "appleId", it.appleId);
      }
    }

    // Detect TrollStore / provisioning profile
    const provPath = Object.keys(zip.files).find((k) => /embedded\.mobileprovision$/i.test(k));
    if (provPath) {
      const provText = latin1.decode(await zip.files[provPath].async("uint8array"));
      const teamName = provText.match(/<key>TeamName<\/key>\s*<string>([^<]+)<\/string>/)?.[1];
      if (teamName) {
        if (!meta.artist) meta.artist = teamName;
        meta.customTags.SIGNING_TEAM = teamName;
        rec(records, "MobileProvision", "TeamName", teamName);
      }
    } else if (isTipa) {
      meta.customTags.SIGNING_MODE = "TrollStore (CoreTrust / Unsandboxed)";
      rec(records, "TrollStore", "signing", "CoreTrust / TIPA");
    }

    // Extract AppIcon PNG if available
    const iconPath = Object.keys(zip.files)
      .filter((k) => /^Payload\/[^/]+\.app\/.*AppIcon.*\.png$/i.test(k))
      .sort((a, b) => b.length - a.length)[0];
    if (iconPath) {
      const iBytes = await zip.files[iconPath].async("uint8array");
      coverArt = {
        mimeType: "image/png",
        data: iBytes,
        objectUrl: createCoverObjectUrl(iBytes, "image/png"),
        description: iconPath,
      };
    }
  } catch {
    // non-zip or corrupt IPA/TIPA
  }

  return { metadata: cloneMetadata(meta), formatRecords: records, coverArt, tech };
}

export async function writeIpaMetadata(
  buffer: Uint8Array,
  meta: TrackMetadata,
  stripAll: boolean
): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(buffer);
  const plistPath = Object.keys(zip.files).find((k) => /^Payload\/[^/]+\.app\/Info\.plist$/i.test(k));

  if (plistPath) {
    const pBytes = await zip.files[plistPath].async("uint8array");
    const isBinary = latin1.decode(pBytes.subarray(0, 8)) === "bplist00";
    if (!isBinary) {
      let xml = utf8.decode(pBytes);
      const replaceKey = (key: string, val: string) => {
        const re = new RegExp(`(<key>${key}</key>\\s*<string>)([^<]*)(</string>)`);
        if (re.test(xml)) {
          xml = xml.replace(re, `$1${val.replace(/&/g, "&amp;").replace(/</g, "&lt;")}$3`);
        }
      };
      if (stripAll) {
        replaceKey("NSHumanReadableCopyright", "");
      } else {
        if (meta.title) replaceKey("CFBundleDisplayName", meta.title);
        if (meta.copyright) replaceKey("NSHumanReadableCopyright", meta.copyright);
      }
      zip.file(plistPath, xml);
    }
  }

  if (stripAll) {
    zip.remove("iTunesMetadata.plist");
    zip.remove("META-INF/webtag-metadata.json");
  }
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE", comment: "" });
}

// ============================================================================
// 3. Windows PE Executable (.exe / .dll / .sys / .ocx) Parser & Timestamp Scrubber
// ============================================================================
const PE_MACHINES: Record<number, string> = {
  0x014c: "x86 (i386)",
  0x8664: "x64 (AMD64)",
  0xaa64: "ARM64",
  0x01c0: "ARM",
  0x01c4: "ARMv7 Thumb-2",
};

const PE_SUBSYSTEMS: Record<number, string> = {
  1: "Native Driver",
  2: "Windows GUI",
  3: "Windows Console",
  10: "EFI Application",
};

function scanUtf16LeVersionStrings(bytes: Uint8Array): Record<string, string> {
  const keys = [
    "CompanyName",
    "FileDescription",
    "FileVersion",
    "InternalName",
    "LegalCopyright",
    "OriginalFilename",
    "ProductName",
    "ProductVersion",
    "Comments",
  ];
  const found: Record<string, string> = {};

  // Search for UTF-16LE encoded key followed by null terminator and aligned UTF-16LE value
  for (const key of keys) {
    const needle = new Uint8Array((key.length + 1) * 2);
    for (let i = 0; i < key.length; i++) {
      needle[i * 2] = key.charCodeAt(i);
      needle[i * 2 + 1] = 0;
    }
    // Scan bytes (limit to 8MB for speed)
    const limit = Math.min(bytes.length - needle.length - 4, 8 * 1024 * 1024);
    for (let i = 0; i < limit; i++) {
      let match = true;
      for (let j = 0; j < needle.length; j++) {
        if (bytes[i + j] !== needle[j]) {
          match = false;
          break;
        }
      }
      if (!match) continue;
      // Align to 4-byte boundary after key + null
      let vPos = i + needle.length;
      while (vPos % 4 !== 0 && vPos < bytes.length && bytes[vPos] === 0) vPos++;
      // Read UTF-16LE string until 0x0000
      let vEnd = vPos;
      while (vEnd + 1 < bytes.length && vEnd - vPos < 512) {
        if (bytes[vEnd] === 0 && bytes[vEnd + 1] === 0) break;
        vEnd += 2;
      }
      if (vEnd > vPos) {
        const val = utf16le.decode(bytes.subarray(vPos, vEnd)).replace(/\0/g, "").trim();
        if (val && /^[\x20-\x7e\u00a0-\u024f\u2000-\u206f]+$/.test(val)) {
          found[key] = val;
          break;
        }
      }
    }
  }
  return found;
}

export function readPeMetadata(buffer: Uint8Array): {
  metadata: TrackMetadata;
  formatRecords: FormatRecordsMap;
  tech: AudioTechInfo;
} {
  const meta = createEmptyMetadata();
  const records: FormatRecordsMap = {};
  const tech = emptyTech("PE", "Windows PE", "PE / COFF");

  if (buffer.length < 0x44 || buffer[0] !== 0x4d || buffer[1] !== 0x5a) {
    return { metadata: meta, formatRecords: records, tech };
  }

  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const peOffset = view.getUint32(0x3c, true);
  if (
    peOffset + 24 <= buffer.length &&
    buffer[peOffset] === 0x50 &&
    buffer[peOffset + 1] === 0x45 &&
    buffer[peOffset + 2] === 0x00 &&
    buffer[peOffset + 3] === 0x00
  ) {
    tech.hasMetadataBlocks = true;
    const machine = view.getUint16(peOffset + 4, true);
    const numSections = view.getUint16(peOffset + 6, true);
    const timestamp = view.getUint32(peOffset + 8, true);
    const characteristics = view.getUint16(peOffset + 22, true);
    const isDll = (characteristics & 0x2000) !== 0;

    const arch = PE_MACHINES[machine] ?? `0x${machine.toString(16)}`;
    tech.format = isDll ? "DLL" : "EXE";
    tech.codec = arch;
    meta.customTags.ARCHITECTURE = arch;
    meta.customTags.SECTIONS = String(numSections);
    rec(records, "PE", "architecture", arch);
    rec(records, "PE", "sections", String(numSections));

    if (timestamp > 0) {
      const iso = new Date(timestamp * 1000).toISOString().slice(0, 19) + "Z";
      meta.year = iso.slice(0, 10);
      meta.customTags.COMPILE_TIMESTAMP = iso;
      rec(records, "PE", "year", iso);
    }

    const optOffset = peOffset + 24;
    if (optOffset + 70 <= buffer.length) {
      const optMagic = view.getUint16(optOffset, true);
      tech.container = optMagic === 0x020b ? "PE32+ (64-bit)" : "PE32 (32-bit)";
      const subsystem = view.getUint16(optOffset + 68, true);
      if (PE_SUBSYSTEMS[subsystem]) {
        meta.customTags.SUBSYSTEM = PE_SUBSYSTEMS[subsystem];
        rec(records, "PE", "subsystem", PE_SUBSYSTEMS[subsystem]);
      }
    }
  }

  // Extract VS_VERSION_INFO StringFileInfo
  const verInfo = scanUtf16LeVersionStrings(buffer);
  if (Object.keys(verInfo).length > 0) {
    tech.hasMetadataBlocks = true;
    if (verInfo.ProductName || verInfo.FileDescription) {
      meta.title = verInfo.ProductName || verInfo.FileDescription;
      rec(records, "VersionInfo", "title", meta.title);
    }
    if (verInfo.CompanyName) {
      meta.artist = verInfo.CompanyName;
      rec(records, "VersionInfo", "artist", verInfo.CompanyName);
    }
    if (verInfo.FileVersion || verInfo.ProductVersion) {
      meta.album = verInfo.ProductVersion || verInfo.FileVersion;
      rec(records, "VersionInfo", "album", meta.album);
    }
    if (verInfo.LegalCopyright) {
      meta.copyright = verInfo.LegalCopyright;
      rec(records, "VersionInfo", "copyright", verInfo.LegalCopyright);
    }
    if (verInfo.FileDescription && verInfo.FileDescription !== meta.title) {
      meta.comment = verInfo.FileDescription;
      rec(records, "VersionInfo", "comment", verInfo.FileDescription);
    } else if (verInfo.Comments) {
      meta.comment = verInfo.Comments;
      rec(records, "VersionInfo", "comment", verInfo.Comments);
    }
    if (verInfo.OriginalFilename) {
      meta.customTags.ORIGINAL_FILENAME = verInfo.OriginalFilename;
      rec(records, "VersionInfo", "OriginalFilename", verInfo.OriginalFilename);
    }
    if (verInfo.InternalName) {
      meta.customTags.INTERNAL_NAME = verInfo.InternalName;
      rec(records, "VersionInfo", "InternalName", verInfo.InternalName);
    }
  }

  return { metadata: cloneMetadata(meta), formatRecords: records, tech };
}

export function writePeMetadata(buffer: Uint8Array, stripAll: boolean): Uint8Array {
  const out = new Uint8Array(buffer);
  if (!stripAll || out.length < 0x44 || out[0] !== 0x4d || out[1] !== 0x5a) return out;
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  const peOffset = view.getUint32(0x3c, true);
  if (
    peOffset + 12 <= out.length &&
    out[peOffset] === 0x50 &&
    out[peOffset + 1] === 0x45 &&
    out[peOffset + 2] === 0x00 &&
    out[peOffset + 3] === 0x00
  ) {
    // Safely zero COFF TimeDateStamp for reproducible/anonymous binaries
    view.setUint32(peOffset + 8, 0, true);
  }
  return out;
}

// ============================================================================
// 4. Native Binaries: ELF (.elf/.so), Mach-O (.dylib/.macho), WebAssembly (.wasm)
// ============================================================================
export function readNativeBinaryMetadata(buffer: Uint8Array): {
  metadata: TrackMetadata;
  formatRecords: FormatRecordsMap;
  tech: AudioTechInfo;
} {
  const meta = createEmptyMetadata();
  const records: FormatRecordsMap = {};
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  // ELF: 0x7F 'E' 'L' 'F'
  if (buffer.length >= 24 && buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46) {
    const is64 = buffer[4] === 2;
    const le = buffer[5] === 1;
    const eType = view.getUint16(16, le);
    const eMachine = view.getUint16(18, le);
    const archMap: Record<number, string> = {
      0x03: "x86",
      0x28: "ARM",
      0x3e: "x86_64",
      0xb7: "AArch64",
      0xf3: "RISC-V",
    };
    const typeMap: Record<number, string> = { 1: "Relocatable", 2: "Executable", 3: "Shared Object / PIE" };
    const arch = archMap[eMachine] ?? `ISA 0x${eMachine.toString(16)}`;
    const kind = typeMap[eType] ?? `Type ${eType}`;

    meta.customTags.ARCHITECTURE = arch;
    meta.customTags.BINARY_TYPE = kind;
    meta.customTags.CLASS = is64 ? "ELF64" : "ELF32";
    rec(records, "ELF", "architecture", arch);
    rec(records, "ELF", "type", kind);

    const tech = emptyTech("ELF", arch, is64 ? "ELF64" : "ELF32");
    tech.hasMetadataBlocks = true;
    return { metadata: meta, formatRecords: records, tech };
  }

  // Mach-O 64-bit / Universal Fat
  if (buffer.length >= 16) {
    const magic = view.getUint32(0, false);
    if (magic === 0xcffaedfe || magic === 0xfeedfacf || magic === 0xcafebabe) {
      const isFat = magic === 0xcafebabe;
      const arch = isFat
        ? "Universal (arm64 + x86_64)"
        : view.getUint32(4, magic === 0xcffaedfe) === 0x0100000c
          ? "Apple Silicon (arm64)"
          : "Intel (x86_64)";
      meta.customTags.ARCHITECTURE = arch;
      rec(records, "Mach-O", "architecture", arch);
      const tech = emptyTech("MACH-O", arch, isFat ? "Mach-O Universal" : "Mach-O 64-bit");
      tech.hasMetadataBlocks = true;
      return { metadata: meta, formatRecords: records, tech };
    }
  }

  // WebAssembly: \0asm
  if (buffer.length >= 8 && buffer[0] === 0x00 && buffer[1] === 0x61 && buffer[2] === 0x73 && buffer[3] === 0x6d) {
    const ver = view.getUint32(4, true);
    const customSections: string[] = [];
    let pos = 8;
    const readLeb = (): number => {
      let result = 0;
      let shift = 0;
      while (pos < buffer.length) {
        const b = buffer[pos++];
        result |= (b & 0x7f) << shift;
        if ((b & 0x80) === 0) break;
        shift += 7;
      }
      return result;
    };
    while (pos < buffer.length) {
      const secId = buffer[pos++];
      const secLen = readLeb();
      const secEnd = Math.min(buffer.length, pos + secLen);
      if (secId === 0) {
        const nameLen = readLeb();
        const name = utf8.decode(buffer.subarray(pos, Math.min(secEnd, pos + nameLen)));
        if (name) customSections.push(name);
      }
      pos = secEnd;
    }
    meta.customTags.WASM_VERSION = String(ver);
    if (customSections.length > 0) {
      meta.customTags.CUSTOM_SECTIONS = customSections.join(", ");
      rec(records, "WASM", "customSections", customSections.join(", "));
    }
    const tech = emptyTech("WASM", "WebAssembly", `WASM v${ver}`);
    tech.hasMetadataBlocks = customSections.length > 0;
    return { metadata: meta, formatRecords: records, tech };
  }

  return { metadata: meta, formatRecords: records, tech: emptyTech("BIN", "Binary", "Raw") };
}

// ============================================================================
// 5. Windows Modern Packages (.msix / .appx / .msixbundle)
// ============================================================================
export async function readMsixMetadata(buffer: Uint8Array, filename: string): Promise<{
  metadata: TrackMetadata;
  formatRecords: FormatRecordsMap;
  coverArt: CoverArt | null;
  tech: AudioTechInfo;
}> {
  const meta = createEmptyMetadata();
  const records: FormatRecordsMap = {};
  const ext = filename.slice(filename.lastIndexOf(".") + 1).toUpperCase();
  const tech = emptyTech(ext || "MSIX", "Windows AppX / MSIX", `ZIP / ${ext || "MSIX"}`);
  let coverArt: CoverArt | null = null;

  try {
    const zip = await JSZip.loadAsync(buffer);
    const manifestFile =
      zip.file("AppxManifest.xml") ?? zip.file("AppxMetadata/AppxBundleManifest.xml");
    if (manifestFile) {
      const xml = await manifestFile.async("string");
      tech.hasMetadataBlocks = true;
      const grab = (tag: string) => xml.match(new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`, "i"))?.[1]?.trim() ?? "";
      const idTag = xml.match(/<Identity\s+([^>]+)>/i)?.[1] ?? "";
      const attr = (name: string) => idTag.match(new RegExp(`${name}="([^"]+)"`, "i"))?.[1]?.trim() ?? "";

      const displayName = grab("DisplayName");
      const publisherDisplay = grab("PublisherDisplayName");
      const description = grab("Description");
      const pkgName = attr("Name");
      const version = attr("Version");
      const arch = attr("ProcessorArchitecture");

      if (displayName || pkgName) {
        meta.title = displayName || pkgName;
        rec(records, "AppxManifest", "title", meta.title);
      }
      if (pkgName) {
        meta.albumArtist = pkgName;
        meta.customTags.PACKAGE_IDENTITY = pkgName;
        rec(records, "AppxManifest", "albumArtist", pkgName);
      }
      if (publisherDisplay) {
        meta.artist = publisherDisplay;
        rec(records, "AppxManifest", "artist", publisherDisplay);
      }
      if (version) {
        meta.album = version;
        rec(records, "AppxManifest", "album", version);
      }
      if (description) {
        meta.comment = description;
        rec(records, "AppxManifest", "comment", description);
      }
      if (arch) {
        meta.customTags.ARCHITECTURE = arch;
        tech.codec = `MSIX (${arch})`;
        rec(records, "AppxManifest", "architecture", arch);
      }
    }

    const logoPath = Object.keys(zip.files).find((k) => /logo.*\.png$/i.test(k) && !zip.files[k].dir);
    if (logoPath) {
      const bytes = await zip.files[logoPath].async("uint8array");
      coverArt = {
        mimeType: "image/png",
        data: bytes,
        objectUrl: createCoverObjectUrl(bytes, "image/png"),
        description: logoPath,
      };
    }
  } catch {
    // ignore invalid zip
  }

  return { metadata: cloneMetadata(meta), formatRecords: records, coverArt, tech };
}

// ============================================================================
// 6. Java Archives (.jar / .war / .ear)
// ============================================================================
export async function readJarMetadata(buffer: Uint8Array, filename: string): Promise<{
  metadata: TrackMetadata;
  formatRecords: FormatRecordsMap;
  tech: AudioTechInfo;
}> {
  const meta = createEmptyMetadata();
  const records: FormatRecordsMap = {};
  const ext = filename.slice(filename.lastIndexOf(".") + 1).toUpperCase();
  const tech = emptyTech(ext || "JAR", "Java Archive", `ZIP / ${ext || "JAR"}`);

  try {
    const zip = await JSZip.loadAsync(buffer);
    const mf = zip.file("META-INF/MANIFEST.MF");
    if (mf) {
      const raw = (await mf.async("string")).replace(/\r?\n /g, "");
      tech.hasMetadataBlocks = true;
      const kv: Record<string, string> = {};
      for (const line of raw.split(/\r?\n/)) {
        const idx = line.indexOf(":");
        if (idx > 0) kv[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
      }
      const title = kv["Implementation-Title"] || kv["Bundle-Name"] || kv["Automatic-Module-Name"] || "";
      const ver = kv["Implementation-Version"] || kv["Bundle-Version"] || "";
      const vendor = kv["Implementation-Vendor"] || kv["Bundle-Vendor"] || kv["Built-By"] || "";
      const pkg = kv["Bundle-SymbolicName"] || kv["Main-Class"] || "";
      const tool = kv["Created-By"] || kv["Build-Jdk"] || kv["Build-Jdk-Spec"] || "";

      if (title) { meta.title = title; rec(records, "MANIFEST.MF", "title", title); }
      if (ver) { meta.album = ver; rec(records, "MANIFEST.MF", "album", ver); }
      if (vendor) { meta.artist = vendor; rec(records, "MANIFEST.MF", "artist", vendor); }
      if (pkg) { meta.albumArtist = pkg; rec(records, "MANIFEST.MF", "albumArtist", pkg); }
      if (tool) { meta.software = tool; rec(records, "MANIFEST.MF", "software", tool); }
      if (kv["Main-Class"]) meta.customTags.MAIN_CLASS = kv["Main-Class"];
      if (kv["Build-Jdk"]) meta.customTags.BUILD_JDK = kv["Build-Jdk"];
    }
  } catch {
    // ignore
  }

  return { metadata: cloneMetadata(meta), formatRecords: records, tech };
}

// ============================================================================
// 7. Debian / iOS Jailbreak Packages (.deb) — ar archive + control.tar(.gz)
// ============================================================================
async function gunzipBytes(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof DecompressionStream === "undefined") return null;
  try {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const stream = new Blob([copy.buffer]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

function extractTarFileText(tar: Uint8Array, nameRegex: RegExp): string | null {
  let pos = 0;
  while (pos + 512 <= tar.length) {
    const name = latin1.decode(tar.subarray(pos, pos + 100)).replace(/\0.*$/, "").trim();
    if (!name) break;
    const sizeOct = latin1.decode(tar.subarray(pos + 124, pos + 136)).replace(/\0.*$/, "").trim();
    const size = parseInt(sizeOct, 8) || 0;
    const dataStart = pos + 512;
    const dataEnd = Math.min(tar.length, dataStart + size);
    if (nameRegex.test(name)) {
      return utf8.decode(tar.subarray(dataStart, dataEnd));
    }
    pos = dataStart + Math.ceil(size / 512) * 512;
  }
  return null;
}

export async function readDebMetadata(buffer: Uint8Array): Promise<{
  metadata: TrackMetadata;
  formatRecords: FormatRecordsMap;
  tech: AudioTechInfo;
}> {
  const meta = createEmptyMetadata();
  const records: FormatRecordsMap = {};
  const tech = emptyTech("DEB", "Debian / iOS Tweak Package", "AR Archive");

  if (buffer.length < 8 || latin1.decode(buffer.subarray(0, 8)) !== "!<arch>\n") {
    return { metadata: meta, formatRecords: records, tech };
  }

  tech.hasMetadataBlocks = true;
  let pos = 8;
  while (pos + 60 <= buffer.length) {
    const memberName = latin1.decode(buffer.subarray(pos, pos + 16)).trim().replace(/\/$/, "");
    const memberSize = parseInt(latin1.decode(buffer.subarray(pos + 48, pos + 58)).trim(), 10) || 0;
    const dataStart = pos + 60;
    const dataEnd = Math.min(buffer.length, dataStart + memberSize);
    const memberData = buffer.subarray(dataStart, dataEnd);

    if (memberName.startsWith("control.tar")) {
      let tarBytes: Uint8Array | null = null;
      if (memberName === "control.tar") tarBytes = memberData;
      else if (memberName.endsWith(".gz")) tarBytes = await gunzipBytes(memberData);

      if (tarBytes) {
        const controlText = extractTarFileText(tarBytes, /(^|\/)control$/);
        if (controlText) {
          const kv: Record<string, string> = {};
          for (const line of controlText.split(/\r?\n/)) {
            const idx = line.indexOf(":");
            if (idx > 0 && !line.startsWith(" ")) {
              kv[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
            }
          }
          if (kv.Name || kv.Package) {
            meta.title = kv.Name || kv.Package;
            rec(records, "DEBIAN/control", "title", meta.title);
          }
          if (kv.Package) {
            meta.albumArtist = kv.Package;
            meta.customTags.PACKAGE_ID = kv.Package;
            rec(records, "DEBIAN/control", "albumArtist", kv.Package);
          }
          if (kv.Version) {
            meta.album = kv.Version;
            rec(records, "DEBIAN/control", "album", kv.Version);
          }
          if (kv.Author || kv.Maintainer) {
            meta.artist = kv.Author || kv.Maintainer;
            rec(records, "DEBIAN/control", "artist", meta.artist);
          }
          if (kv.Section) {
            meta.genre = kv.Section;
            rec(records, "DEBIAN/control", "genre", kv.Section);
          }
          if (kv.Description) {
            meta.comment = kv.Description;
            rec(records, "DEBIAN/control", "comment", kv.Description);
          }
          if (kv.Architecture) {
            meta.customTags.ARCHITECTURE = kv.Architecture;
            tech.codec = `DEB (${kv.Architecture})`;
            rec(records, "DEBIAN/control", "architecture", kv.Architecture);
          }
        }
      }
    }

    pos = dataStart + memberSize + (memberSize % 2);
  }

  return { metadata: cloneMetadata(meta), formatRecords: records, tech };
}
