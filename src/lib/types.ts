export interface CoverArt {
  mimeType: string;
  data: Uint8Array;
  objectUrl: string;
  description?: string;
}

export type FileCategory = "audio" | "image" | "document" | "video" | "app" | "other";

export interface TrackMetadata {
  // Core universal fields
  title: string;
  artist: string; // Audio: Artist | Image: Creator | Doc: Author | App: Publisher / Developer
  album: string; // Audio: Album | Doc: Subject | App: Version
  albumArtist: string; // Audio: Album Artist | Doc: Publisher / Company | App: Bundle / Package ID
  year: string; // Audio: Year / Date | Image: Date Created | Doc: Created Date | App: Compile Date
  track: string;
  trackTotal: string;
  disc: string;
  discTotal: string;
  genre: string; // Audio: Genre | Image/Doc: Keywords / Subjects
  composer: string;
  bpm: string;
  comment: string; // Audio: Comment | Image: Caption / Description | Doc: Description
  lyrics: string;
  // Image / IPTC / Editor / Rights fields
  software: string; // EXIF Software, PNG Software, PDF Creator, OOXML Application, SDK / Compiler
  copyright: string; // IPTC Copyright Notice, EXIF Copyright, ID3 TCOP, PE LegalCopyright
  creditLine: string; // IPTC Credit Line (photoshop:Credit / IIM 2:110)
  headline: string; // IPTC Headline (photoshop:Headline / IIM 2:105)
  webStatement: string; // IPTC Web Statement of Rights (xmpRights:WebStatement)
  licensorName: string; // PLUS Licensor Name
  licensorUrl: string; // PLUS Licensor URL (Google Licensable acquireLicensePage)
  licensorId: string; // PLUS Licensor ID
  source: string; // IPTC Source (IIM 2:115)
  address: string; // Street Address / IPTC Sublocation (Iptc4xmpCore:Location / IIM 2:92)
  city: string; // IPTC City (IIM 2:90)
  state: string; // IPTC Province / State (IIM 2:95)
  country: string; // IPTC Country (IIM 2:101)
  cameraMake: string; // EXIF Make
  cameraModel: string; // EXIF Model
  gps: string; // EXIF GPS coordinates
  customTags: Record<string, string>;
}

export type StandardTextField = Exclude<keyof TrackMetadata, "customTags">;

export interface AudioTechInfo {
  format: string;
  codec: string;
  container: string;
  duration: number;
  bitrate: number;
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  isLossless: boolean;
  width?: number;
  height?: number;
  colorSpace?: string;
  compression?: string;
  hasGps?: boolean;
  hasMetadataBlocks?: boolean;
}

export interface DriveSourceInfo {
  name: string;
  kind: "cd" | "usb" | "folder";
  writable: boolean;
}

/** Per-embedded-format field snapshot, e.g. { Exif: { copyright: "..." }, XMP: { ... }, IIM: { ... } } */
export type FormatRecordsMap = Record<string, Record<string, string>>;

export interface TrackItem {
  id: string;
  fileKind: FileCategory;
  handlerId?: string;
  filename: string;
  originalFilename: string;
  folderPath: string;
  buffer: Uint8Array;
  fileSize: number;
  mimeType: string;
  tech: AudioTechInfo;
  metadata: TrackMetadata;
  originalMetadata: TrackMetadata;
  /** Raw per-format extracted key-value snapshots for IPTC {XMP, IIM, Exif} [sync] views */
  formatRecords: FormatRecordsMap;
  coverArt: CoverArt | null;
  originalCoverArt: CoverArt | null;
  coverDirty: boolean;
  stripAllMetadata?: boolean;
  fromZip?: string;
  fileHandle?: FileSystemFileHandle;
  isCdaPointer?: boolean;
  sourceDrive?: DriveSourceInfo;
}

export const ALL_STANDARD_FIELDS: StandardTextField[] = [
  "title",
  "artist",
  "album",
  "albumArtist",
  "year",
  "track",
  "trackTotal",
  "disc",
  "discTotal",
  "genre",
  "composer",
  "bpm",
  "comment",
  "lyrics",
  "software",
  "copyright",
  "creditLine",
  "headline",
  "webStatement",
  "licensorName",
  "licensorUrl",
  "licensorId",
  "source",
  "address",
  "city",
  "state",
  "country",
  "cameraMake",
  "cameraModel",
  "gps",
];

export function createEmptyMetadata(): TrackMetadata {
  return {
    title: "",
    artist: "",
    album: "",
    albumArtist: "",
    year: "",
    track: "",
    trackTotal: "",
    disc: "",
    discTotal: "",
    genre: "",
    composer: "",
    bpm: "",
    comment: "",
    lyrics: "",
    software: "",
    copyright: "",
    creditLine: "",
    headline: "",
    webStatement: "",
    licensorName: "",
    licensorUrl: "",
    licensorId: "",
    source: "",
    address: "",
    city: "",
    state: "",
    country: "",
    cameraMake: "",
    cameraModel: "",
    gps: "",
    customTags: {},
  };
}

export function cloneMetadata(m: TrackMetadata): TrackMetadata {
  return {
    ...m,
    customTags: { ...m.customTags },
  };
}

export function isMetadataDirty(a: TrackMetadata, b: TrackMetadata): boolean {
  for (const k of ALL_STANDARD_FIELDS) {
    if (a[k] !== b[k]) return true;
  }
  const aKeys = Object.keys(a.customTags);
  const bKeys = Object.keys(b.customTags);
  if (aKeys.length !== bKeys.length) return true;
  for (const k of aKeys) {
    if (a.customTags[k] !== b.customTags[k]) return true;
  }
  return false;
}

export function isTrackDirty(track: TrackItem): boolean {
  return (
    Boolean(track.stripAllMetadata) ||
    track.coverDirty ||
    track.filename !== track.originalFilename ||
    isMetadataDirty(track.metadata, track.originalMetadata)
  );
}
