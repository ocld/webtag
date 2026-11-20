import type { FileCategory, FormatRecordsMap, StandardTextField, TrackItem, TrackMetadata } from "./types";

export type MetadataTopic =
  | "Core & Identity"
  | "Rights & Licensing"
  | "Origin & Location"
  | "Camera & Media"
  | "Editor & Software"
  | "Extended & Raw";

export interface FieldDescriptor {
  field: StandardTextField;
  label: string;
  iptcName: string;
  topic: MetadataTopic;
  kinds?: FileCategory[];
}

export const FIELD_DESCRIPTORS: FieldDescriptor[] = [
  // Core & Identity
  { field: "title", label: "Title", iptcName: "Title / Object Name", topic: "Core & Identity" },
  { field: "headline", label: "Headline", iptcName: "Headline", topic: "Core & Identity", kinds: ["image", "document"] },
  { field: "artist", label: "Creator / Artist", iptcName: "Creator", topic: "Core & Identity" },
  { field: "comment", label: "Description / Comment", iptcName: "Description", topic: "Core & Identity" },
  { field: "album", label: "Album / Subject", iptcName: "Subject / Album", topic: "Core & Identity" },
  { field: "albumArtist", label: "Album Artist / Publisher", iptcName: "Publisher / Album Artist", topic: "Core & Identity" },
  { field: "genre", label: "Keywords / Genre", iptcName: "Keywords", topic: "Core & Identity" },
  { field: "year", label: "Date Created / Year", iptcName: "Date Created", topic: "Core & Identity" },

  // Rights & Licensing (IPTC Google Licensable fields)
  { field: "copyright", label: "Copyright Notice", iptcName: "Copyright Notice", topic: "Rights & Licensing" },
  { field: "creditLine", label: "Credit Line", iptcName: "Credit Line", topic: "Rights & Licensing" },
  { field: "webStatement", label: "Web Statement of Rights", iptcName: "Web Statement of Rights", topic: "Rights & Licensing" },
  { field: "licensorName", label: "Licensor Name", iptcName: "Licensor Name", topic: "Rights & Licensing" },
  { field: "licensorUrl", label: "Licensor URL", iptcName: "Licensor URL", topic: "Rights & Licensing" },
  { field: "licensorId", label: "Licensor ID", iptcName: "Licensor ID", topic: "Rights & Licensing" },
  { field: "source", label: "Source", iptcName: "Source", topic: "Rights & Licensing" },

  // Origin & Location
  { field: "address", label: "Street Address", iptcName: "Sublocation / Address", topic: "Origin & Location" },
  { field: "city", label: "City", iptcName: "City (legacy)", topic: "Origin & Location" },
  { field: "state", label: "Province / State", iptcName: "Province or State", topic: "Origin & Location" },
  { field: "country", label: "Country", iptcName: "Country", topic: "Origin & Location" },
  { field: "gps", label: "GPS Coordinates", iptcName: "GPS Location", topic: "Origin & Location" },

  // Camera & Media
  { field: "cameraMake", label: "Camera Make", iptcName: "Camera Make", topic: "Camera & Media", kinds: ["image"] },
  { field: "cameraModel", label: "Camera Model", iptcName: "Camera Model", topic: "Camera & Media", kinds: ["image"] },
  { field: "track", label: "Track #", iptcName: "Track Number", topic: "Camera & Media", kinds: ["audio"] },
  { field: "disc", label: "Disc #", iptcName: "Disc Number", topic: "Camera & Media", kinds: ["audio"] },
  { field: "bpm", label: "BPM", iptcName: "Tempo (BPM)", topic: "Camera & Media", kinds: ["audio"] },
  { field: "composer", label: "Composer", iptcName: "Composer", topic: "Camera & Media", kinds: ["audio"] },

  // Editor & Software
  { field: "software", label: "Editor / Software", iptcName: "Creator Tool / Software", topic: "Editor & Software" },
];

export interface ProvenanceInfo {
  formats: string[];
  syncStatus: "sync" | "diff" | null;
}

// compares stored values across embedded containers to build format provenance and sync status
export function getFieldProvenance(
  formatRecords: FormatRecordsMap,
  field: StandardTextField
): ProvenanceInfo {
  const formats: string[] = [];
  const distinctValues = new Set<string>();

  for (const [fmtName, map] of Object.entries(formatRecords)) {
    const val = map[field];
    if (val !== undefined && val.trim() !== "") {
      formats.push(fmtName);
      distinctValues.add(val.trim());
    }
  }

  let syncStatus: "sync" | "diff" | null = null;
  if (formats.length >= 2) {
    syncStatus = distinctValues.size === 1 ? "sync" : "diff";
  }

  return { formats, syncStatus };
}

// builds a schema.org json-ld object from normalized file metadata
export function buildSchemaOrgJsonLd(track: TrackItem): Record<string, unknown> {
  const m: TrackMetadata = track.metadata;
  const type =
    track.fileKind === "image"
      ? "ImageObject"
      : track.fileKind === "audio"
        ? "AudioObject"
        : track.fileKind === "video"
          ? "VideoObject"
          : track.fileKind === "app"
            ? "SoftwareApplication"
            : "DigitalDocument";

  const obj: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": type,
    name: m.title || track.filename,
    encodingFormat: track.mimeType,
  };

  if (track.tech.width && track.tech.height) {
    obj.width = track.tech.width;
    obj.height = track.tech.height;
  }
  if (track.tech.duration > 0) {
    obj.duration = `PT${Math.round(track.tech.duration)}S`;
  }
  if (m.copyright) obj.copyrightNotice = m.copyright;
  if (m.artist) obj.creator = m.artist;
  if (m.creditLine) obj.creditText = m.creditLine;
  if (m.licensorUrl) obj.acquireLicensePage = m.licensorUrl;
  if (m.webStatement) obj.license = m.webStatement;
  if (m.headline) obj.headline = m.headline;
  if (m.comment) obj.description = m.comment;
  if (m.genre) obj.keywords = m.genre;
  if (m.year) obj.dateCreated = m.year;
  if (m.album && track.fileKind === "audio") obj.inAlbum = m.album;
  if (m.album && track.fileKind === "app") obj.softwareVersion = m.album;
  if (m.albumArtist && track.fileKind === "app") obj.identifier = m.albumArtist;
  if (m.address || m.city || m.country) {
    obj.contentLocation = {
      "@type": "Place",
      ...(m.address ? { streetAddress: m.address } : {}),
      ...(m.city ? { addressLocality: m.city } : {}),
      ...(m.state ? { addressRegion: m.state } : {}),
      ...(m.country ? { addressCountry: m.country } : {}),
    };
  }
  if (m.software) obj.creatorTool = m.software;

  return obj;
}

export interface SearchEngineReadiness {
  hasBasicAttribution: boolean;
  hasLicensableBadge: boolean;
  checks: Array<{
    label: string;
    field: StandardTextField;
    present: boolean;
    value: string;
    formats: string[];
    role: string;
  }>;
}

// evaluates attribution and licensable metadata completeness for search engines
export function evaluateSearchEngineReadiness(track: TrackItem): SearchEngineReadiness {
  const m = track.metadata;
  const spec: Array<{ label: string; field: StandardTextField; role: string }> = [
    { label: "Copyright Notice", field: "copyright", role: "Shown next to image in search results" },
    { label: "Creator", field: "artist", role: "Shown next to image in search results" },
    { label: "Credit Line", field: "creditLine", role: "Shown next to image in search results" },
    { label: "Web Statement of Rights", field: "webStatement", role: "Sets Licensable badge + License details URL" },
    { label: "Licensor URL", field: "licensorUrl", role: "Sets 'Get this image on' link" },
  ];

  const checks = spec.map((s) => {
    const val = m[s.field].trim();
    const prov = getFieldProvenance(track.formatRecords, s.field);
    return {
      label: s.label,
      field: s.field,
      present: Boolean(val),
      value: val,
      formats: prov.formats,
      role: s.role,
    };
  });

  const hasBasicAttribution = Boolean(m.copyright.trim() || m.artist.trim() || m.creditLine.trim());
  const hasLicensableBadge = Boolean(m.webStatement.trim() || m.licensorUrl.trim());

  return { hasBasicAttribution, hasLicensableBadge, checks };
}
