import { useMemo, useState } from "react";
import { Button, Icon, Input, Modal } from "@/design";
import {
  ADDRESS_PRESETS,
  applyPatchToMetadata,
  generateRandomAddress,
  generateRandomMetadataPatch,
  getRandomGroupConfig,
  lookupRealAddress,
  type CustomLocation,
  type RandomizeOptions,
} from "@/lib/randomMetadata";
import type { FileCategory, StandardTextField, TrackItem, TrackMetadata } from "@/lib/types";

interface RandomizeModalProps {
  open: boolean;
  onClose: () => void;
  targetTracks: TrackItem[];
  onApplyMetadataMap: (updates: Map<string, TrackMetadata>, summary: string) => void;
}

function getPreviewLabel(field: StandardTextField, fileKind: FileCategory): string | undefined {
  if (fileKind === "app") {
    const appLabels: Partial<Record<StandardTextField, string>> = {
      title: "app / product name",
      albumArtist: "bundle / package id",
      album: "version",
      artist: "developer / company",
      copyright: "legal copyright",
      software: "sdk / build tool",
      year: "compile date",
      comment: "description",
    };
    return appLabels[field];
  }
  const labels: Partial<Record<StandardTextField, string>> = {
    address: "street address",
    city: "city",
    state: "state / region",
    country: "country",
    gps: "gps coordinates",
    artist: fileKind === "audio" ? "artist" : fileKind === "document" ? "author" : "creator",
    albumArtist: fileKind === "audio" ? "album artist" : "publisher / studio",
    copyright: "copyright",
    creditLine: "credit line",
    webStatement: "rights url",
    licensorUrl: "licensor url",
    cameraMake: "camera make",
    cameraModel: "camera model",
    software: fileKind === "audio" ? "encoder" : "software",
    year: fileKind === "audio" ? "year" : "date",
    title: "title",
    album: fileKind === "document" ? "subject" : "album",
    genre: fileKind === "audio" ? "genre" : "keywords",
    bpm: "bpm",
    comment: "notes",
  };
  return labels[field];
}

export function RandomizeModal({
  open,
  onClose,
  targetTracks,
  onApplyMetadataMap,
}: RandomizeModalProps) {
  const [locationMode, setLocationMode] = useState<"city" | "custom">("city");
  const [cityQuery, setCityQuery] = useState("");
  const [presetId, setPresetId] = useState<string | "random">("random");
  const [customLocation, setCustomLocation] = useState<CustomLocation>({
    address: "",
    city: "",
    state: "",
    country: "",
    gps: "",
  });
  const [lookupQuery, setLookupQuery] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupNote, setLookupNote] = useState<string | null>(null);

  const [includeLocation, setIncludeLocation] = useState(true);
  const [includeIdentity, setIncludeIdentity] = useState(true);
  const [includeDevice, setIncludeDevice] = useState(true);
  const [includeContent, setIncludeContent] = useState(false);
  const [jitterGps, setJitterGps] = useState(true);
  const [uniquePerFile, setUniquePerFile] = useState(false);
  const [seed, setSeed] = useState(1);

  const primaryKind: FileCategory = targetTracks[0]?.fileKind ?? "image";
  const groupCfg = useMemo(() => getRandomGroupConfig(primaryKind), [primaryKind]);

  const filteredCities = useMemo(() => {
    const q = cityQuery.trim().toLowerCase();
    if (!q) return ADDRESS_PRESETS;
    return ADDRESS_PRESETS.filter(
      (p) =>
        p.label.includes(q) ||
        p.city.toLowerCase().includes(q) ||
        p.country.toLowerCase().includes(q) ||
        p.state.toLowerCase().includes(q)
    );
  }, [cityQuery]);

  const options: RandomizeOptions = useMemo(
    () => ({
      includeLocation: groupCfg.showLocation && includeLocation,
      includeIdentity,
      includeDevice,
      includeContent,
      locationMode,
      customLocation,
      presetId,
      jitterGps,
    }),
    [
      groupCfg.showLocation,
      includeLocation,
      includeIdentity,
      includeDevice,
      includeContent,
      locationMode,
      customLocation,
      presetId,
      jitterGps,
    ]
  );

  // incrementing seed forces a fresh synthetic roll without mutating options
  const previewPatch = useMemo(() => {
    void seed;
    return generateRandomMetadataPatch(primaryKind, options);
  }, [primaryKind, options, seed]);

  const previewEntries = Object.entries(previewPatch)
    .map(([k, v]) => {
      const label = getPreviewLabel(k as StandardTextField, primaryKind);
      return label && v ? ([k as StandardTextField, label, v] as const) : null;
    })
    .filter((entry): entry is readonly [StandardTextField, string, string] => entry !== null);

  const hasAnyGroup =
    (groupCfg.showLocation && includeLocation) || includeIdentity || includeDevice || includeContent;

  const handleLookupAddress = async () => {
    if (!lookupQuery.trim() || lookupBusy) return;
    setLookupBusy(true);
    setLookupNote(null);
    try {
      const hit = await lookupRealAddress(lookupQuery);
      if (!hit) {
        setLookupNote("no matching address found — try a more specific street or city");
      } else {
        setCustomLocation(hit);
        setJitterGps(false);
        setLookupNote(`found: ${[hit.address, hit.city, hit.country].filter(Boolean).join(", ").toLowerCase()}`);
      }
    } catch {
      setLookupNote("lookup unavailable offline — type fields manually below");
    } finally {
      setLookupBusy(false);
    }
  };

  const handleFillRandomCustom = () => {
    const loc = generateRandomAddress("random", jitterGps);
    setCustomLocation({
      address: loc.address,
      city: loc.city,
      state: loc.state,
      country: loc.country,
      gps: loc.gps,
    });
    setLookupNote(null);
  };

  const handleApply = () => {
    if (!hasAnyGroup || targetTracks.length === 0) return;
    const updates = new Map<string, TrackMetadata>();
    targetTracks.forEach((t, idx) => {
      const patch =
        uniquePerFile && idx > 0
          ? generateRandomMetadataPatch(t.fileKind, options)
          : t.fileKind === primaryKind
            ? previewPatch
            : generateRandomMetadataPatch(t.fileKind, options);
      updates.set(t.id, applyPatchToMetadata(t.metadata, patch));
    });
    const label =
      groupCfg.showLocation && includeLocation && locationMode === "custom"
        ? "custom location & metadata"
        : groupCfg.showLocation && includeLocation && presetId !== "random"
          ? `${ADDRESS_PRESETS.find((p) => p.id === presetId)?.label ?? "preset"} metadata`
          : "randomized metadata";
    onApplyMetadataMap(
      updates,
      `applied ${label} to ${targetTracks.length} file${targetTracks.length === 1 ? "" : "s"}`
    );
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Icon name="casino" size={20} style={{ color: "var(--accent-violet)" }} />
          {groupCfg.showLocation ? "spoof address & metadata" : "spoof metadata"}
        </span>
      }
      footer={
        <>
          <Button variant="ghost" onClick={() => setSeed((s) => s + 1)}>
            <Icon name="refresh" size={17} />
            shuffle preview
          </Button>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Button onClick={onClose}>cancel</Button>
            <Button variant="primary" disabled={!hasAnyGroup || targetTracks.length === 0} onClick={handleApply}>
              <Icon name="auto_awesome" size={17} />
              apply to {targetTracks.length} file{targetTracks.length === 1 ? "" : "s"}
            </Button>
          </div>
        </>
      }
    >
      <div className="wt-rand-layout">
        <div className="wt-rand-section">
          <div className="wt-rand-label">1. choose metadata groups to fill</div>
          <div className="wt-rand-toggles">
            {groupCfg.showLocation && (
              <label className={`wt-rand-check ${includeLocation ? "is-on" : ""}`}>
                <input
                  type="checkbox"
                  checked={includeLocation}
                  onChange={(e) => setIncludeLocation(e.target.checked)}
                />
                <span>{groupCfg.locationLabel}</span>
              </label>
            )}
            <label className={`wt-rand-check ${includeIdentity ? "is-on" : ""}`}>
              <input
                type="checkbox"
                checked={includeIdentity}
                onChange={(e) => setIncludeIdentity(e.target.checked)}
              />
              <span>{groupCfg.identityLabel}</span>
            </label>
            <label className={`wt-rand-check ${includeDevice ? "is-on" : ""}`}>
              <input
                type="checkbox"
                checked={includeDevice}
                onChange={(e) => setIncludeDevice(e.target.checked)}
              />
              <span>{groupCfg.deviceLabel}</span>
            </label>
            <label className={`wt-rand-check ${includeContent ? "is-on" : ""}`}>
              <input
                type="checkbox"
                checked={includeContent}
                onChange={(e) => setIncludeContent(e.target.checked)}
              />
              <span>{groupCfg.contentLabel}</span>
            </label>
          </div>
        </div>

        {groupCfg.showLocation && includeLocation && (
          <div className="wt-rand-section">
            <div className="wt-rand-header-row">
              <div className="wt-segmented" role="tablist" aria-label="address mode">
                <button
                  type="button"
                  role="tab"
                  aria-selected={locationMode === "city"}
                  className={`wt-seg-btn ${locationMode === "city" ? "is-active" : ""}`}
                  onClick={() => setLocationMode("city")}
                >
                  pick city ({ADDRESS_PRESETS.length})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={locationMode === "custom"}
                  className={`wt-seg-btn ${locationMode === "custom" ? "is-active" : ""}`}
                  onClick={() => setLocationMode("custom")}
                >
                  custom / real address
                </button>
              </div>
              <label className="wt-rand-inline-opt">
                <input
                  type="checkbox"
                  checked={jitterGps}
                  onChange={(e) => setJitterGps(e.target.checked)}
                />
                <span>jitter gps coords</span>
              </label>
            </div>

            {locationMode === "city" ? (
              <>
                <div className="wt-tracks-filter">
                  <Icon name="search" size={16} />
                  <input
                    value={cityQuery}
                    onChange={(e) => setCityQuery(e.target.value)}
                    placeholder="search any city, state, or country..."
                    aria-label="search cities"
                  />
                  {cityQuery && (
                    <button
                      type="button"
                      className="wt-micro-icon"
                      onClick={() => setCityQuery("")}
                      aria-label="clear city search"
                    >
                      <Icon name="close" size={15} />
                    </button>
                  )}
                </div>
                <div className="wt-city-grid wt-city-grid--scroll" role="radiogroup" aria-label="address preset">
                  {!cityQuery.trim() && (
                    <button
                      type="button"
                      role="radio"
                      aria-checked={presetId === "random"}
                      className={`wt-city-chip ${presetId === "random" ? "is-active" : ""}`}
                      onClick={() => {
                        setPresetId("random");
                        setSeed((s) => s + 1);
                      }}
                    >
                      <Icon name="casino" size={15} />
                      any random city
                    </button>
                  )}
                  {filteredCities.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      role="radio"
                      aria-checked={presetId === p.id}
                      className={`wt-city-chip ${presetId === p.id ? "is-active" : ""}`}
                      onClick={() => {
                        setPresetId(p.id);
                        setSeed((s) => s + 1);
                      }}
                    >
                      {presetId === p.id && <Icon name="check" size={14} />}
                      {p.label}
                    </button>
                  ))}
                  {filteredCities.length === 0 && (
                    <span style={{ color: "var(--text-dim)", fontSize: "0.82rem", padding: "4px 2px" }}>
                      no preset city matched — switch to custom / real address to enter any place
                    </span>
                  )}
                </div>
              </>
            ) : (
              <div className="wt-custom-loc-box">
                <div className="wt-custom-lookup-row">
                  <Input
                    value={lookupQuery}
                    onChange={(e) => setLookupQuery(e.target.value)}
                    placeholder="look up any real address or landmark (e.g. eiffel tower, paris)..."
                    aria-label="look up real address"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void handleLookupAddress();
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={lookupBusy || !lookupQuery.trim()}
                    onClick={() => void handleLookupAddress()}
                  >
                    <Icon name="pin_drop" size={16} />
                    {lookupBusy ? "finding..." : "lookup"}
                  </Button>
                  <Button size="sm" onClick={handleFillRandomCustom} title="fill with a random address to tweak">
                    <Icon name="casino" size={16} />
                    roll
                  </Button>
                </div>

                {lookupNote && (
                  <div style={{ fontSize: "0.79rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                    {lookupNote}
                  </div>
                )}

                <div className="wt-custom-loc-grid">
                  <Input
                    value={customLocation.address}
                    onChange={(e) => setCustomLocation((c) => ({ ...c, address: e.target.value }))}
                    placeholder="street address"
                    aria-label="custom street address"
                  />
                  <Input
                    value={customLocation.city}
                    onChange={(e) => setCustomLocation((c) => ({ ...c, city: e.target.value }))}
                    placeholder="city"
                    aria-label="custom city"
                  />
                  <Input
                    value={customLocation.state}
                    onChange={(e) => setCustomLocation((c) => ({ ...c, state: e.target.value }))}
                    placeholder="state / region"
                    aria-label="custom state or region"
                  />
                  <Input
                    value={customLocation.country}
                    onChange={(e) => setCustomLocation((c) => ({ ...c, country: e.target.value }))}
                    placeholder="country"
                    aria-label="custom country"
                  />
                </div>

                <Input
                  mono
                  value={customLocation.gps}
                  onChange={(e) => setCustomLocation((c) => ({ ...c, gps: e.target.value }))}
                  placeholder="gps coordinates (lat, lon) e.g. 48.85837, 2.29448"
                  aria-label="custom gps coordinates"
                />
              </div>
            )}
          </div>
        )}

        {targetTracks.length > 1 && (
          <label className="wt-rand-inline-opt" style={{ paddingLeft: 2 }}>
            <input
              type="checkbox"
              checked={uniquePerFile}
              onChange={(e) => setUniquePerFile(e.target.checked)}
            />
            <span>generate unique random values for each of the {targetTracks.length} selected files</span>
          </label>
        )}

        <div className="wt-rand-section">
          <div className="wt-rand-label">live preview</div>
          {previewEntries.length === 0 ? (
            <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.9rem" }}>
              select at least one group or enter an address above to preview metadata.
            </p>
          ) : (
            <div className="wt-rand-preview">
              {previewEntries.map(([field, label, val]) => (
                <div key={field} className="wt-rand-preview-row">
                  <span className="wt-rand-preview-k">{label}</span>
                  <span className="wt-rand-preview-v">{val}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
