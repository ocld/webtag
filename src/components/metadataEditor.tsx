import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Icon } from "@/design";
import { COMMON_GENRES } from "@/lib/genres";
import {
  buildSchemaOrgJsonLd,
  evaluateSearchEngineReadiness,
  FIELD_DESCRIPTORS,
  getFieldProvenance,
  type MetadataTopic,
} from "@/lib/iptcSchema";
import { createCoverObjectUrl } from "@/lib/taglibEngine";
import {
  ALL_STANDARD_FIELDS,
  isTrackDirty,
  type CoverArt,
  type StandardTextField,
  type TrackItem,
} from "@/lib/types";

type InspectorView = "fields" | "topic" | "format" | "schema";

interface MetadataEditorProps {
  tracks: TrackItem[];
  selectedIds: Set<string>;
  anchorId: string | null;
  onSelectChange: (next: Set<string>, anchorId?: string) => void;
  onPatchField: (field: StandardTextField, value: string) => void;
  onRenameSingle: (trackId: string, nextFilename: string) => void;
  onSetCoverArt: (cover: CoverArt | null) => void;
  onUpdateCustomTag: (oldKey: string | null, newKey: string, value: string) => void;
  onDeleteCustomTag: (key: string) => void;
  onStripSelected: () => void;
  onRevertSelected: () => void;
  onRemoveTrack: (trackId: string) => void;
  onDownloadOne: (track: TrackItem) => void;
  onDownloadAll: () => void;
  onWriteToDrive: () => void;
  onExportCue: () => void;
  onOpenBatchTools: () => void;
  onOpenRandomize: () => void;
  onPickFiles: () => void;
  onPickFolder: () => void;
  onScanDrive: () => void;
  onPickZip: () => void;
  onUndo: () => void;
  canUndo: boolean;
  onBack: () => void;
}

function formatDuration(sec: number): string {
  if (!sec || !Number.isFinite(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} b`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kb`;
  return `~${(bytes / (1024 * 1024)).toFixed(1)} mb`;
}

const TOPIC_ORDER: MetadataTopic[] = [
  "Core & Identity",
  "Rights & Licensing",
  "Origin & Location",
  "Camera & Media",
  "Editor & Software",
];

export function MetadataEditor({
  tracks,
  selectedIds,
  anchorId,
  onSelectChange,
  onPatchField,
  onRenameSingle,
  onSetCoverArt,
  onUpdateCustomTag,
  onDeleteCustomTag,
  onStripSelected,
  onRevertSelected,
  onRemoveTrack,
  onDownloadOne,
  onDownloadAll,
  onWriteToDrive,
  onExportCue,
  onOpenBatchTools,
  onOpenRandomize,
  onPickFiles,
  onPickFolder,
  onScanDrive,
  onPickZip,
  onUndo,
  canUndo,
  onBack,
}: MetadataEditorProps) {
  const [view, setView] = useState<InspectorView>("fields");
  const [filter, setFilter] = useState("");
  const [focusedField, setFocusedField] = useState<string | null>("title");
  const [showMore, setShowMore] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newVal, setNewVal] = useState("");
  const [copiedJsonLd, setCopiedJsonLd] = useState(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const visibleTracks = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return tracks;
    return tracks.filter(
      (t) =>
        t.filename.toLowerCase().includes(q) ||
        t.metadata.title.toLowerCase().includes(q) ||
        t.metadata.artist.toLowerCase().includes(q) ||
        t.metadata.album.toLowerCase().includes(q) ||
        t.metadata.software.toLowerCase().includes(q) ||
        t.metadata.copyright.toLowerCase().includes(q) ||
        t.tech.format.toLowerCase().includes(q)
    );
  }, [tracks, filter]);

  const selectedTracks = useMemo(
    () => tracks.filter((t) => selectedIds.has(t.id)),
    [tracks, selectedIds]
  );

  const isBatch = selectedTracks.length > 1;
  const primary = selectedTracks[0] ?? tracks[0] ?? null;
  const anyDirty = useMemo(() => selectedTracks.some(isTrackDirty), [selectedTracks]);
  const totalDirty = useMemo(() => tracks.filter(isTrackDirty).length, [tracks]);
  const anyStripped = useMemo(() => selectedTracks.some((t) => t.stripAllMetadata), [selectedTracks]);

  const writableDriveTracks = useMemo(
    () => tracks.filter((t) => t.fileHandle && !t.isCdaPointer),
    [tracks]
  );
  const hasCdaTracks = useMemo(() => tracks.some((t) => t.isCdaPointer), [tracks]);
  const activeDrive = primary?.sourceDrive;

  const activeKind = useMemo(() => {
    if (selectedTracks.length === 0) return "other" as const;
    const kinds = new Set(selectedTracks.map((t) => t.fileKind));
    if (kinds.size === 1) return selectedTracks[0].fileKind;
    if (kinds.has("image") && !kinds.has("audio")) return "image" as const;
    if (kinds.has("audio") && !kinds.has("image") && !kinds.has("document")) return "audio" as const;
    return "other" as const;
  }, [selectedTracks]);

  const fields = useMemo(() => {
    const out = {} as Record<StandardTextField, { value: string; mixed: boolean }>;
    for (const k of ALL_STANDARD_FIELDS) {
      if (selectedTracks.length === 0) {
        out[k] = { value: "", mixed: false };
      } else {
        const first = selectedTracks[0].metadata[k];
        const allSame = selectedTracks.every((t) => t.metadata[k] === first);
        out[k] = { value: allSame ? first : "", mixed: !allSame };
      }
    }
    return out;
  }, [selectedTracks]);

  const coverInfo = useMemo(() => {
    if (selectedTracks.length === 0) return { cover: null as CoverArt | null, mixed: false };
    const first = selectedTracks[0].coverArt;
    const allSame = selectedTracks.every((t) => t.coverArt?.objectUrl === first?.objectUrl);
    return { cover: first, mixed: !allSame };
  }, [selectedTracks]);

  const customTags = useMemo(() => {
    const keys = new Set<string>();
    selectedTracks.forEach((t) => Object.keys(t.metadata.customTags).forEach((k) => keys.add(k)));
    return Array.from(keys)
      .sort()
      .map((key) => {
        const first = selectedTracks[0]?.metadata.customTags[key] ?? "";
        const allSame = selectedTracks.every((t) => (t.metadata.customTags[key] ?? "") === first);
        return { key, value: allSame ? first : "", mixed: !allSame };
      });
  }, [selectedTracks]);

  // copy into a fresh arraybuffer so blob creation works when wasm shares memory
  const audioUrl = useMemo(() => {
    if (!primary || primary.fileKind !== "audio" || primary.isCdaPointer) return null;
    const copy = new Uint8Array(primary.buffer.byteLength);
    copy.set(primary.buffer);
    return URL.createObjectURL(new Blob([copy.buffer], { type: primary.mimeType }));
  }, [primary?.id, primary?.fileKind, primary?.isCdaPointer]);

  useEffect(() => {
    setIsPlaying(false);
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el) return;
    if (isPlaying) {
      el.pause();
      setIsPlaying(false);
    } else {
      void el.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }
  };

  // handle list navigation and single-key shortcuts while focus is outside text inputs
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inInput =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;
      if (inInput) return;

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (visibleTracks.length === 0) return;
        e.preventDefault();
        const curIdx = primary ? visibleTracks.findIndex((t) => t.id === primary.id) : -1;
        const nextIdx =
          e.key === "ArrowDown"
            ? (curIdx + 1 + visibleTracks.length) % visibleTracks.length
            : (curIdx - 1 + visibleTracks.length) % visibleTracks.length;
        const nextTrack = visibleTracks[nextIdx];
        if (nextTrack) onSelectChange(new Set([nextTrack.id]), nextTrack.id);
      } else if (e.key.toLowerCase() === "b" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        onOpenBatchTools();
      } else if (e.key.toLowerCase() === "r" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        onOpenRandomize();
      } else if (e.key.toLowerCase() === "x" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        onStripSelected();
      } else if (e.key.toLowerCase() === "a" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        const allSel = selectedIds.size === tracks.length;
        if (allSel && primary) onSelectChange(new Set([primary.id]), primary.id);
        else onSelectChange(new Set(tracks.map((t) => t.id)));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [visibleTracks, primary, selectedIds.size, tracks, onSelectChange, onOpenBatchTools, onOpenRandomize, onStripSelected]);

  // support shift-range and cmd/ctrl-toggle multi-selection like a file manager
  const handleRowClick = (e: React.MouseEvent, trackId: string) => {
    const next = new Set(selectedIds);
    if (e.shiftKey && anchorId) {
      const a = visibleTracks.findIndex((t) => t.id === anchorId);
      const b = visibleTracks.findIndex((t) => t.id === trackId);
      if (a >= 0 && b >= 0) {
        const [start, end] = a < b ? [a, b] : [b, a];
        if (!e.metaKey && !e.ctrlKey) next.clear();
        for (let i = start; i <= end; i++) next.add(visibleTracks[i].id);
        onSelectChange(next, anchorId);
        return;
      }
    }
    if (e.metaKey || e.ctrlKey) {
      if (next.has(trackId) && next.size > 1) next.delete(trackId);
      else next.add(trackId);
      onSelectChange(next, trackId);
    } else {
      onSelectChange(new Set([trackId]), trackId);
    }
  };

  const handleCoverFile = async (file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    const data = new Uint8Array(await file.arrayBuffer());
    const mimeType = file.type || "image/jpeg";
    onSetCoverArt({
      mimeType,
      data,
      objectUrl: createCoverObjectUrl(data, mimeType),
      description: file.name,
    });
  };

  const handleDownloadCover = () => {
    if (!coverInfo.cover) return;
    const ext = coverInfo.cover.mimeType.includes("png") ? "png" : "jpg";
    const a = document.createElement("a");
    a.href = coverInfo.cover.objectUrl;
    a.download = `${primary?.metadata.album || primary?.metadata.title || "cover"}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const allSelected = tracks.length > 1 && selectedIds.size === tracks.length;
  const isAudioMode = activeKind === "audio";
  const isImageMode = activeKind === "image";
  const isDocumentMode = activeKind === "document";
  const isAppMode = activeKind === "app";

  // reset away from the photo-only topic view if the user selects a non-image file
  useEffect(() => {
    if (!isImageMode && view === "topic") {
      setView("fields");
    }
  }, [isImageMode, view]);

  const detectedFormats = useMemo(() => {
    if (!primary) return [];
    return Object.keys(primary.formatRecords);
  }, [primary]);

  const jsonLdText = useMemo(() => {
    if (!primary) return "";
    return JSON.stringify(buildSchemaOrgJsonLd(primary), null, 2);
  }, [primary]);

  const searchReadiness = useMemo(
    () => (primary ? evaluateSearchEngineReadiness(primary) : null),
    [primary]
  );

  const renderTextRow = (field: StandardTextField, label: string, ph = "[empty]") => {
    const prov = primary && !isBatch ? getFieldProvenance(primary.formatRecords, field) : null;
    const formatSuffix = prov && prov.formats.length > 0 ? `{${prov.formats.join(",")}}` : "";
    const syncBadge =
      prov?.syncStatus === "sync" ? "[sync]" : prov?.syncStatus === "diff" ? "[diff]" : "";

    return (
      <label key={field} className={`wt-kv-row ${focusedField === field ? "is-focused" : ""}`}>
        <span className="wt-kv-key">
          <span>{label}</span>
          {formatSuffix && <span className="wt-kv-fmt">{formatSuffix}</span>}
          {syncBadge && (
            <span className={prov?.syncStatus === "diff" ? "wt-kv-diff" : "wt-kv-sync"}>
              {syncBadge}
            </span>
          )}
        </span>
        <input
          className={`wt-kv-input ${fields[field].mixed ? "is-mixed" : ""}`}
          value={fields[field].value}
          placeholder={fields[field].mixed ? "<keep existing>" : ph}
          aria-label={label}
          onFocus={() => setFocusedField(field)}
          onBlur={() => setFocusedField(null)}
          onChange={(e) => onPatchField(field, e.target.value)}
        />
      </label>
    );
  };

  const renderTechLine = (t: TrackItem) => {
    const parts: string[] = [];
    if (t.tech.width && t.tech.height) parts.push(`${t.tech.width}×${t.tech.height}`);
    if (t.tech.colorSpace) parts.push(t.tech.colorSpace.toLowerCase());
    if (t.tech.compression) parts.push(t.tech.compression.toLowerCase());
    if (t.tech.duration > 0) parts.push(formatDuration(t.tech.duration));
    if (t.tech.bitrate > 0) parts.push(`${t.tech.bitrate} kbps`);
    parts.push(formatBytes(t.fileSize));
    if (detectedFormats.length > 0 && !isBatch) {
      parts.push(`{${detectedFormats.join(", ").toLowerCase()}}`);
    }
    return parts.join(" · ");
  };

  const renderRowRightMeta = (t: TrackItem) => {
    const fmt = t.tech.format.toLowerCase();
    if (t.tech.width && t.tech.height) return `${fmt} · ${t.tech.width}×${t.tech.height}`;
    if (t.tech.duration > 0) return `${fmt} · ${formatDuration(t.tech.duration)}`;
    return `${fmt} · ${formatBytes(t.fileSize)}`;
  };

  return (
    <div className="wt-editor">
      <input
        ref={coverInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(e) => {
          void handleCoverFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {audioUrl && <audio ref={audioRef} src={audioUrl} onEnded={() => setIsPlaying(false)} />}

      <div className="wt-editor-grid">
        <div className="wt-editor-left">
          {primary && (
            <section className="wt-panel wt-track-hero" aria-label="selected file summary">
              <div
                className={`wt-art-square ${isAudioMode ? "wt-clickable" : ""}`}
                onClick={isAudioMode ? () => coverInputRef.current?.click() : undefined}
                onDragOver={
                  isAudioMode
                    ? (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }
                    : undefined
                }
                onDrop={
                  isAudioMode
                    ? (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void handleCoverFile(e.dataTransfer.files?.[0]);
                      }
                    : undefined
                }
                title={isAudioMode ? "click or drop image to set cover art" : primary.filename}
              >
                {coverInfo.cover ? (
                  <img src={coverInfo.cover.objectUrl} alt={`preview of ${primary.filename}`} />
                ) : primary.fileKind === "audio" ? (
                  <Icon name="music_note" size={28} style={{ color: "var(--accent-blue)" }} />
                ) : primary.fileKind === "image" ? (
                  <Icon name="image" size={28} style={{ color: "var(--accent-green)" }} />
                ) : primary.fileKind === "document" ? (
                  <Icon name="description" size={28} style={{ color: "var(--accent-amber)" }} />
                ) : primary.fileKind === "app" ? (
                  <Icon name="deployed_code" size={28} style={{ color: "var(--accent-violet)" }} />
                ) : (
                  <Icon name="draft" size={28} style={{ color: "var(--accent-cyan)" }} />
                )}
                {isAudioMode && <span className="wt-art-hover">art</span>}
              </div>

              <div className="wt-track-hero-text">
                <h2 className="wt-track-hero-title">
                  {isBatch
                    ? `${selectedTracks.length} files selected`
                    : primary.metadata.title || primary.filename}
                </h2>

                <div className="wt-track-hero-meta">
                  {audioUrl && (
                    <button
                      type="button"
                      className="wt-inline-play"
                      onClick={togglePlay}
                      aria-label={isPlaying ? "pause audio preview" : "play audio preview"}
                    >
                      <Icon name={isPlaying ? "pause" : "play_arrow"} size={15} />
                    </button>
                  )}
                  <span>
                    {isBatch
                      ? `batch editing · ${tracks.length} loaded`
                      : renderTechLine(primary)}
                  </span>
                </div>

                {activeDrive && (
                  <div className="wt-drive-line">
                    [{activeDrive.kind === "cd" ? "cd drive" : "usb drive"}: {activeDrive.name.toLowerCase()} ·{" "}
                    {activeDrive.writable ? "writable in-place" : "read-only"}]
                  </div>
                )}

                {primary.tech.hasGps && !primary.stripAllMetadata && (
                  <div className="wt-warn-line" role="alert">
                    [gps embedded: {primary.metadata.gps}]
                  </div>
                )}

                {anyStripped && (
                  <div className="wt-drive-line" role="status">
                    [queued for full metadata strip on save]
                  </div>
                )}

                <div className="wt-track-hero-links">
                  <button
                    type="button"
                    className="wt-micro-link wt-micro-link--spoof"
                    onClick={onOpenRandomize}
                  >
                    <Icon name="casino" size={15} />
                    spoof
                  </button>
                  <button
                    type="button"
                    className="wt-micro-link wt-micro-link--danger"
                    onClick={onStripSelected}
                  >
                    <Icon name="cleaning_services" size={14} />
                    strip all
                  </button>
                  {isAudioMode && (
                    <>
                      <button type="button" className="wt-micro-link" onClick={() => coverInputRef.current?.click()}>
                        {coverInfo.cover ? "replace art" : "add art"}
                      </button>
                      {coverInfo.cover && (
                        <>
                          <button type="button" className="wt-micro-link" onClick={handleDownloadCover}>
                            extract art
                          </button>
                          <button type="button" className="wt-micro-link wt-micro-link--danger" onClick={() => onSetCoverArt(null)}>
                            remove art
                          </button>
                        </>
                      )}
                    </>
                  )}
                  {anyDirty && (
                    <button type="button" className="wt-micro-link" onClick={onRevertSelected}>
                      revert
                    </button>
                  )}
                </div>
              </div>
            </section>
          )}

          <div className="wt-panel">
            <div className="wt-panel-head">
              <h3 className="wt-panel-title">
                <Icon name="folder_open" size={17} style={{ color: "var(--primary-hex)" }} />
                files ({tracks.length})
              </h3>
              <div className="wt-tracks-head-right">
                {tracks.length > 1 && (
                  <button
                    type="button"
                    className={`wt-micro-link ${allSelected ? "is-active" : ""}`}
                    onClick={() => {
                      if (allSelected && primary) onSelectChange(new Set([primary.id]), primary.id);
                      else onSelectChange(new Set(tracks.map((t) => t.id)));
                    }}
                  >
                    {allSelected ? "deselect all" : "select all"}
                  </button>
                )}
                <button type="button" className="wt-micro-link" onClick={onPickFiles}>+files</button>
                <button type="button" className="wt-micro-link" onClick={onPickFolder}>+folder</button>
                <button type="button" className="wt-micro-link" onClick={onScanDrive}>+drive</button>
                <button type="button" className="wt-micro-link" onClick={onPickZip}>+.zip</button>
              </div>
            </div>

            <div className="wt-panel-body">
              {tracks.length > 4 && (
                <div className="wt-tracks-filter">
                  <Icon name="search" size={16} />
                  <input
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="filter files..."
                    aria-label="filter loaded files"
                  />
                  {filter && (
                    <button type="button" className="wt-micro-icon" onClick={() => setFilter("")} aria-label="clear filter">
                      <Icon name="close" size={15} />
                    </button>
                  )}
                </div>
              )}

              <div className="wt-file-list" role="listbox" aria-label="loaded files" aria-multiselectable="true">
                {visibleTracks.map((track) => {
                  const selected = selectedIds.has(track.id);
                  const dirty = isTrackDirty(track);
                  const label = track.metadata.title || track.filename;
                  return (
                    <div
                      key={track.id}
                      role="option"
                      tabIndex={0}
                      aria-selected={selected}
                      className={`wt-file-row ${selected ? "is-selected" : ""}`}
                      onClick={(e) => handleRowClick(e, track.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onSelectChange(new Set([track.id]), track.id);
                        }
                      }}
                    >
                      <span className="wt-row-status" aria-hidden="true">
                        <Icon
                          name={track.stripAllMetadata ? "cleaning_services" : dirty ? "edit" : "chevron_right"}
                          size={15}
                        />
                      </span>
                      <span className="wt-row-main" title={track.filename}>
                        {track.fileKind === "audio" && track.metadata.track
                          ? `${track.metadata.track.padStart(2, "0")} `
                          : ""}
                        {label}
                      </span>
                      <span className="wt-row-meta">{renderRowRightMeta(track)}</span>
                      <span className="wt-row-quick" onClick={(e) => e.stopPropagation()}>
                        {!track.isCdaPointer && (
                          <button
                            type="button"
                            className="wt-micro-icon"
                            onClick={() => onDownloadOne(track)}
                            title={`save & download ${track.filename}`}
                            aria-label={`download ${track.filename}`}
                          >
                            <Icon name="download" size={16} />
                          </button>
                        )}
                        <button
                          type="button"
                          className="wt-micro-icon"
                          onClick={() => onRemoveTrack(track.id)}
                          title={`remove ${track.filename}`}
                          aria-label={`remove ${track.filename}`}
                        >
                          <Icon name="close" size={16} />
                        </button>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <section className="wt-panel" aria-label="metadata inspector">
          <div className="wt-panel-head">
            <h3 className="wt-panel-title">
              <Icon name="sell" size={17} style={{ color: "var(--primary-hex)" }} />
              {isBatch
                ? `batch (${selectedTracks.length})`
                : `metadata · ${(primary?.tech.format ?? "file").toLowerCase()}`}
            </h3>

            <div className="wt-segmented" role="tablist" aria-label="metadata inspection views">
              {(
                (isImageMode
                  ? [
                      ["fields", "edit"],
                      ["topic", "by topic"],
                      ["format", "raw formats"],
                      ["schema", "json-ld"],
                    ]
                  : [
                      ["fields", "edit"],
                      ["format", "raw formats"],
                      ["schema", "json-ld"],
                    ]) as Array<[InspectorView, string]>
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  id={`tab-${id}`}
                  aria-selected={view === id}
                  aria-controls={`panel-${id}`}
                  className={`wt-seg-btn ${view === id ? "is-active" : ""}`}
                  onClick={() => setView(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="wt-panel-body">
            {view === "fields" && (
              <div id="panel-fields" role="tabpanel" aria-labelledby="tab-fields" className="wt-kv-list">
                {!isBatch && primary && (
                  <label className={`wt-kv-row ${focusedField === "filename" ? "is-focused" : ""}`}>
                    <span className="wt-kv-key">file</span>
                    <input
                      className="wt-kv-input"
                      value={primary.filename}
                      disabled={primary.isCdaPointer}
                      aria-label="filename"
                      onFocus={() => setFocusedField("filename")}
                      onBlur={() => setFocusedField(null)}
                      onChange={(e) => onRenameSingle(primary.id, e.target.value)}
                    />
                  </label>
                )}

                {isImageMode && (
                  <>
                    {renderTextRow("title", "title")}
                    {renderTextRow("headline", "headline")}
                    {renderTextRow("artist", "creator")}
                    {renderTextRow("copyright", "copyright notice")}
                    {renderTextRow("creditLine", "credit line")}
                    {renderTextRow("webStatement", "web statement of rights", "https://...")}
                    {renderTextRow("licensorName", "licensor name")}
                    {renderTextRow("licensorUrl", "licensor url", "https://...")}
                    {renderTextRow("comment", "description")}
                    {renderTextRow("genre", "keywords")}
                    {renderTextRow("software", "editor / software")}
                    {renderTextRow("year", "date created")}
                    {renderTextRow("cameraMake", "camera make")}
                    {renderTextRow("cameraModel", "camera model")}
                    {renderTextRow("address", "street address")}
                    {renderTextRow("city", "city")}
                    {renderTextRow("country", "country")}
                    {renderTextRow("gps", "gps location", "[none]")}
                  </>
                )}

                {isAudioMode && (
                  <>
                    {renderTextRow("title", "title")}
                    {renderTextRow("artist", "artist")}
                    {renderTextRow("album", "album")}
                    {renderTextRow("albumArtist", "album artist")}

                    <div className={`wt-kv-row ${focusedField === "track" ? "is-focused" : ""}`}>
                      <span className="wt-kv-key">track / disc</span>
                      <div className="wt-kv-inline-nums">
                        <input
                          className={`wt-kv-num ${fields.track.mixed ? "is-mixed" : ""}`}
                          value={fields.track.value}
                          placeholder={fields.track.mixed ? "keep" : "#"}
                          aria-label="track number"
                          onFocus={() => setFocusedField("track")}
                          onBlur={() => setFocusedField(null)}
                          onChange={(e) => onPatchField("track", e.target.value)}
                        />
                        <span className="wt-kv-sep">/</span>
                        <input
                          className={`wt-kv-num ${fields.trackTotal.mixed ? "is-mixed" : ""}`}
                          value={fields.trackTotal.value}
                          placeholder={fields.trackTotal.mixed ? "keep" : "tot"}
                          aria-label="total tracks"
                          onFocus={() => setFocusedField("track")}
                          onBlur={() => setFocusedField(null)}
                          onChange={(e) => onPatchField("trackTotal", e.target.value)}
                        />
                        <span className="wt-kv-sep" style={{ marginInline: 6 }}>·</span>
                        <span className="wt-kv-sep">disc</span>
                        <input
                          className={`wt-kv-num ${fields.disc.mixed ? "is-mixed" : ""}`}
                          value={fields.disc.value}
                          placeholder={fields.disc.mixed ? "keep" : "#"}
                          aria-label="disc number"
                          onFocus={() => setFocusedField("track")}
                          onBlur={() => setFocusedField(null)}
                          onChange={(e) => onPatchField("disc", e.target.value)}
                        />
                        <span className="wt-kv-sep">/</span>
                        <input
                          className={`wt-kv-num ${fields.discTotal.mixed ? "is-mixed" : ""}`}
                          value={fields.discTotal.value}
                          placeholder={fields.discTotal.mixed ? "keep" : "tot"}
                          aria-label="total discs"
                          onFocus={() => setFocusedField("track")}
                          onBlur={() => setFocusedField(null)}
                          onChange={(e) => onPatchField("discTotal", e.target.value)}
                        />
                      </div>
                    </div>

                    <div className={`wt-kv-row ${focusedField === "year" ? "is-focused" : ""}`}>
                      <span className="wt-kv-key">year / bpm</span>
                      <div className="wt-kv-inline-nums">
                        <input
                          className={`wt-kv-num wt-kv-num--wide ${fields.year.mixed ? "is-mixed" : ""}`}
                          value={fields.year.value}
                          placeholder={fields.year.mixed ? "<keep>" : "year"}
                          aria-label="year"
                          onFocus={() => setFocusedField("year")}
                          onBlur={() => setFocusedField(null)}
                          onChange={(e) => onPatchField("year", e.target.value)}
                        />
                        <span className="wt-kv-sep" style={{ marginInline: 6 }}>·</span>
                        <span className="wt-kv-sep">bpm</span>
                        <input
                          className={`wt-kv-num ${fields.bpm.mixed ? "is-mixed" : ""}`}
                          value={fields.bpm.value}
                          placeholder={fields.bpm.mixed ? "keep" : "—"}
                          aria-label="bpm"
                          onFocus={() => setFocusedField("year")}
                          onBlur={() => setFocusedField(null)}
                          onChange={(e) => onPatchField("bpm", e.target.value)}
                        />
                      </div>
                    </div>

                    <label className={`wt-kv-row ${focusedField === "genre" ? "is-focused" : ""}`}>
                      <span className="wt-kv-key">genre</span>
                      <input
                        list="webtag-genre-list"
                        className={`wt-kv-input ${fields.genre.mixed ? "is-mixed" : ""}`}
                        value={fields.genre.value}
                        placeholder={fields.genre.mixed ? "<keep>" : "[empty]"}
                        aria-label="genre"
                        onFocus={() => setFocusedField("genre")}
                        onBlur={() => setFocusedField(null)}
                        onChange={(e) => onPatchField("genre", e.target.value)}
                      />
                      <datalist id="webtag-genre-list">
                        {COMMON_GENRES.map((g) => (
                          <option key={g} value={g} />
                        ))}
                      </datalist>
                    </label>

                    {renderTextRow("composer", "composer")}
                    {renderTextRow("software", "encoder / software")}
                    {renderTextRow("copyright", "copyright notice")}
                    {renderTextRow("comment", "comment")}
                  </>
                )}

                {isAppMode && (
                  <>
                    {renderTextRow("title", "app / product name")}
                    {renderTextRow("albumArtist", "bundle / package id")}
                    {renderTextRow("album", "version")}
                    {renderTextRow("artist", "developer / company")}
                    {renderTextRow("software", "sdk / build tool")}
                    {renderTextRow("year", "compile date")}
                    {renderTextRow("copyright", "legal copyright")}
                    {renderTextRow("comment", "description")}
                  </>
                )}

                {isDocumentMode && (
                  <>
                    {renderTextRow("title", "title")}
                    {renderTextRow("artist", "author / creator")}
                    {renderTextRow("album", "subject")}
                    {renderTextRow("albumArtist", "company / publisher")}
                    {renderTextRow("genre", "keywords")}
                    {renderTextRow("software", "editor / software")}
                    {renderTextRow("year", "date created")}
                    {renderTextRow("copyright", "copyright notice")}
                    {renderTextRow("comment", "description")}
                  </>
                )}

                {!isAudioMode && !isImageMode && !isAppMode && !isDocumentMode && (
                  <>
                    {renderTextRow("title", "title")}
                    {renderTextRow("artist", "creator")}
                    {renderTextRow("software", "software")}
                    {renderTextRow("year", "date created")}
                    {renderTextRow("copyright", "copyright notice")}
                    {renderTextRow("comment", "description")}
                  </>
                )}

                <div className="wt-more-toggle-row">
                  <button
                    type="button"
                    className="wt-micro-link"
                    aria-expanded={showMore}
                    onClick={() => setShowMore((v) => !v)}
                  >
                    <Icon name={showMore ? "expand_less" : "expand_more"} size={16} />
                    {showMore
                      ? isAudioMode
                        ? "hide lyrics & custom tags"
                        : "hide extra & custom tags"
                      : isAudioMode
                        ? "lyrics & custom tags"
                        : "extra & custom tags"}
                    {customTags.length > 0 ? ` (${customTags.length})` : ""}
                  </button>
                </div>

                {showMore && (
                  <div className="wt-more-drawer">
                    {isImageMode && (
                      <>
                        {renderTextRow("state", "province / state")}
                        {renderTextRow("source", "source")}
                        {renderTextRow("licensorId", "licensor id")}
                      </>
                    )}

                    {isAudioMode && (
                      <div className="wt-more-block">
                        <label className="wt-kv-key" htmlFor="wt-lyrics-box">lyrics</label>
                        <textarea
                          id="wt-lyrics-box"
                          className={`wt-more-textarea ${fields.lyrics.mixed ? "is-mixed" : ""}`}
                          rows={3}
                          value={fields.lyrics.value}
                          placeholder={fields.lyrics.mixed ? "<keep existing lyrics>" : "paste lyrics..."}
                          onChange={(e) => onPatchField("lyrics", e.target.value)}
                        />
                      </div>
                    )}

                    <div className="wt-more-block">
                      <span className="wt-kv-key">custom / raw tags</span>
                      {customTags.map((ct) => (
                        <div key={ct.key} className="wt-custom-inline">
                          <input
                            className="wt-kv-input"
                            style={{ maxWidth: 130, color: "var(--primary-hex)" }}
                            value={ct.key}
                            aria-label="custom tag key"
                            onChange={(e) => onUpdateCustomTag(ct.key, e.target.value, ct.value)}
                          />
                          <input
                            className={`wt-kv-input ${ct.mixed ? "is-mixed" : ""}`}
                            value={ct.value}
                            placeholder={ct.mixed ? "<keep>" : "value"}
                            aria-label={`value for ${ct.key}`}
                            onChange={(e) => onUpdateCustomTag(ct.key, ct.key, e.target.value)}
                          />
                          <button
                            type="button"
                            className="wt-micro-icon"
                            onClick={() => onDeleteCustomTag(ct.key)}
                            aria-label={`remove ${ct.key}`}
                          >
                            <Icon name="delete" size={16} />
                          </button>
                        </div>
                      ))}
                      <div className="wt-custom-inline">
                        <input
                          className="wt-kv-input"
                          style={{ maxWidth: 130 }}
                          value={newKey}
                          placeholder="new_key"
                          aria-label="new custom tag key"
                          onChange={(e) => setNewKey(e.target.value.toUpperCase())}
                        />
                        <input
                          className="wt-kv-input"
                          value={newVal}
                          placeholder="value"
                          aria-label="new custom tag value"
                          onChange={(e) => setNewVal(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && newKey.trim()) {
                              onUpdateCustomTag(null, newKey.trim(), newVal);
                              setNewKey("");
                              setNewVal("");
                            }
                          }}
                        />
                        <button
                          type="button"
                          className="wt-micro-icon"
                          disabled={!newKey.trim()}
                          onClick={() => {
                            onUpdateCustomTag(null, newKey.trim(), newVal);
                            setNewKey("");
                            setNewVal("");
                          }}
                          aria-label="add custom tag"
                        >
                          <Icon name="add" size={17} />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {view === "topic" && (
              <div id="panel-topic" role="tabpanel" aria-labelledby="tab-topic" className="wt-view-stack">
                {TOPIC_ORDER.map((topic) => {
                  const relevant = FIELD_DESCRIPTORS.filter(
                    (d) =>
                      d.topic === topic &&
                      (!d.kinds || d.kinds.includes(activeKind) || fields[d.field].value.trim() !== "")
                  );
                  if (relevant.length === 0) return null;
                  return (
                    <div key={topic} className="wt-group-card">
                      <h3 className="wt-group-title">{topic.toLowerCase()}</h3>
                      <div className="wt-kv-list">
                        {relevant.map((d) => renderTextRow(d.field, d.iptcName.toLowerCase()))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {view === "format" && primary && (
              <div id="panel-format" role="tabpanel" aria-labelledby="tab-format" className="wt-view-stack">
                {Object.keys(primary.formatRecords).length === 0 ? (
                  <p style={{ margin: "10px 4px", color: "var(--text-muted)", textTransform: "lowercase" }}>
                    no embedded metadata blocks detected in original file. edit any field to write new metadata.
                  </p>
                ) : (
                  Object.entries(primary.formatRecords).map(([fmtName, map]) => (
                    <div key={fmtName} className="wt-group-card">
                      <h3 className="wt-group-title">
                        {`{${fmtName.toLowerCase()}}`} — {Object.keys(map).length} field(s)
                      </h3>
                      <table className="wt-preview-table" style={{ marginTop: 4 }}>
                        <thead>
                          <tr>
                            <th style={{ width: "38%" }}>field</th>
                            <th>embedded value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(map).map(([k, v]) => (
                            <tr key={k}>
                              <td style={{ color: "var(--text-muted)" }}>{k}</td>
                              <td style={{ color: "var(--text-focus)", overflowWrap: "anywhere" }}>{v}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))
                )}
              </div>
            )}

            {view === "schema" && primary && searchReadiness && (
              <div id="panel-schema" role="tabpanel" aria-labelledby="tab-schema" className="wt-view-stack">
                {isImageMode && (
                  <div className="wt-group-card">
                    <h3 className="wt-group-title">search engine &amp; attribution readiness</h3>
                    <div className="wt-schema-badges">
                      <span className={searchReadiness.hasBasicAttribution ? "wt-status-ok" : "wt-status-miss"}>
                        {searchReadiness.hasBasicAttribution ? "[ok]" : "[missing]"} image attribution
                      </span>
                      <span className={searchReadiness.hasLicensableBadge ? "wt-status-ok" : "wt-status-miss"}>
                        {searchReadiness.hasLicensableBadge ? "[ok]" : "[missing]"} licensable badge
                      </span>
                    </div>

                    <table className="wt-preview-table" style={{ marginTop: 6 }}>
                      <thead>
                        <tr>
                          <th>field</th>
                          <th>value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {searchReadiness.checks.map((c) => (
                          <tr key={c.field}>
                            <td style={{ color: "var(--text-muted)" }}>
                              {c.label.toLowerCase()}{" "}
                              {c.formats.length > 0 && (
                                <span className="wt-kv-fmt">{`{${c.formats.join(",")}}`}</span>
                              )}
                            </td>
                            <td style={{ color: c.present ? "var(--text-focus)" : "var(--text-dim)", overflowWrap: "anywhere" }}>
                              {c.present ? c.value : "[empty]"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="wt-group-card">
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <h3 className="wt-group-title">schema.org json-ld</h3>
                    <button
                      type="button"
                      className="wt-micro-link"
                      onClick={() => {
                        void navigator.clipboard?.writeText(jsonLdText);
                        setCopiedJsonLd(true);
                        setTimeout(() => setCopiedJsonLd(false), 1600);
                      }}
                    >
                      <Icon name={copiedJsonLd ? "check" : "content_copy"} size={15} />
                      {copiedJsonLd ? "copied" : "copy json-ld"}
                    </button>
                  </div>
                  <pre className="wt-jsonld-pre"><code>{jsonLdText}</code></pre>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      <nav className="wt-action-bar" aria-label="editor actions">
        <div className="wt-action-group">
          <Button size="sm" variant="ghost" disabled={!canUndo} onClick={onUndo}>
            <Icon name="undo" size={16} />
            undo
          </Button>
          <Button size="sm" onClick={onOpenRandomize}>
            <Icon name="casino" size={16} style={{ color: "var(--accent-violet)" }} />
            spoof
          </Button>
          <Button size="sm" variant="danger" onClick={onStripSelected}>
            <Icon name="cleaning_services" size={15} />
            strip
          </Button>
          <Button size="sm" onClick={onOpenBatchTools}>
            <Icon name="auto_fix_high" size={16} style={{ color: "var(--primary-hex)" }} />
            batch
          </Button>
        </div>

        <div className="wt-action-group">
          {writableDriveTracks.length > 0 && totalDirty > 0 && (
            <Button size="sm" variant="primary" onClick={onWriteToDrive}>
              <Icon name="save" size={16} />
              write to drive ({totalDirty})
            </Button>
          )}

          {hasCdaTracks ? (
            <Button size="sm" variant="primary" onClick={onExportCue}>
              <Icon name="download" size={16} />
              export .cue
            </Button>
          ) : (
            <Button size="sm" variant="primary" onClick={onDownloadAll}>
              <Icon name="download" size={16} />
              {tracks.length === 1
                ? totalDirty > 0
                  ? "save file"
                  : "download"
                : `export .zip (${tracks.length})`}
            </Button>
          )}

          <Button size="sm" variant="ghost" onClick={onBack}>
            <Icon name="arrow_back" size={16} />
            close
          </Button>
        </div>
      </nav>
    </div>
  );
}
