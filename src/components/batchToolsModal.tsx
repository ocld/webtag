import React, { useMemo, useState } from "react";
import { Badge, Button, Field, Icon, Input, Modal, Tabs } from "@/design";
import {
  applyAutoNumber,
  applyCaseTransform,
  applyQuickUtility,
  previewFindReplace,
  TEXT_FIELDS_FOR_BULK,
  type CaseTransform,
  type QuickUtilityAction,
} from "@/lib/batchActions";
import {
  FORMAT_TOKENS,
  formatTagsToFilename,
  parseFilenameToTags,
} from "@/lib/formatStrings";
import { cloneMetadata, type StandardTextField, type TrackItem, type TrackMetadata } from "@/lib/types";

export type BatchToolTab = "autonumber" | "fn-to-tag" | "tag-to-fn" | "replace" | "cleanup";

interface BatchToolsModalProps {
  open: boolean;
  initialTab: BatchToolTab;
  initialPattern?: string;
  onClose: () => void;
  targetTracks: TrackItem[];
  onApplyMetadataMap: (updates: Map<string, TrackMetadata>, summary: string) => void;
  onApplyRenameMap: (renames: Map<string, string>, summary: string) => void;
}

const FN_TO_TAG_PRESETS = [
  "%track% - %artist% - %title%",
  "%track% - %title%",
  "%artist% - %title%",
  "%artist% - %album% - %track% - %title%",
  "%track%. %title%",
];

const TAG_TO_FN_PRESETS = [
  "%track2% - %artist% - %title%",
  "%track2% - %title%",
  "%artist% - %title%",
  "%album% - %track2% - %title%",
];

export function BatchToolsModal({
  open,
  initialTab,
  initialPattern,
  onClose,
  targetTracks,
  onApplyMetadataMap,
  onApplyRenameMap,
}: BatchToolsModalProps) {
  const [tab, setTab] = useState<BatchToolTab>(initialTab);

  // sync requested tab and optional preset pattern each time the modal opens
  React.useEffect(() => {
    if (open) {
      setTab(initialTab);
      if (initialPattern) {
        if (initialTab === "fn-to-tag") setFnToTagPattern(initialPattern);
        else if (initialTab === "tag-to-fn") setTagToFnPattern(initialPattern);
        else if (initialTab === "replace") {
          setFindStr(initialPattern);
          setUseRegex(true);
        }
      }
    }
  }, [open, initialTab, initialPattern]);

  const [startAt, setStartAt] = useState(1);
  const [padDigits, setPadDigits] = useState(2);
  const [saveTotal, setSaveTotal] = useState(true);
  const [resetPerFolder, setResetPerFolder] = useState(true);

  const [fnToTagPattern, setFnToTagPattern] = useState("%track% - %artist% - %title%");
  const [tagToFnPattern, setTagToFnPattern] = useState("%track2% - %artist% - %title%");

  const [replaceField, setReplaceField] = useState<StandardTextField | "all">("all");
  const [findStr, setFindStr] = useState("");
  const [replaceStr, setReplaceStr] = useState("");
  const [useRegex, setUseRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);

  const [caseMode, setCaseMode] = useState<CaseTransform>("title");
  const [caseFields, setCaseFields] = useState<Set<StandardTextField>>(
    () => new Set(["title", "artist", "album", "albumArtist"])
  );

  const autoNumberPreview = useMemo(
    () => applyAutoNumber(targetTracks, { startAt, padDigits, saveTotal, resetPerFolder }),
    [targetTracks, startAt, padDigits, saveTotal, resetPerFolder]
  );

  const fnToTagPreview = useMemo(() => {
    return targetTracks.map((t) => ({
      track: t,
      patch: parseFilenameToTags(t.filename, fnToTagPattern),
    }));
  }, [targetTracks, fnToTagPattern]);

  const tagToFnPreview = useMemo(() => {
    return targetTracks.map((t) => ({
      track: t,
      nextName: formatTagsToFilename(t.metadata, t.filename, tagToFnPattern),
    }));
  }, [targetTracks, tagToFnPattern]);

  const replacePreview = useMemo(
    () =>
      previewFindReplace(targetTracks, {
        field: replaceField,
        find: findStr,
        replace: replaceStr,
        useRegex,
        caseSensitive,
      }),
    [targetTracks, replaceField, findStr, replaceStr, useRegex, caseSensitive]
  );

  const handleApply = () => {
    if (targetTracks.length === 0) return;

    if (tab === "autonumber") {
      onApplyMetadataMap(autoNumberPreview, `auto-numbered ${targetTracks.length} track(s)`);
      onClose();
      return;
    }

    if (tab === "fn-to-tag") {
      const updates = new Map<string, TrackMetadata>();
      let matched = 0;
      for (const row of fnToTagPreview) {
        if (!row.patch) continue;
        matched++;
        const next = cloneMetadata(row.track.metadata);
        Object.assign(next, row.patch);
        updates.set(row.track.id, next);
      }
      if (matched > 0) {
        onApplyMetadataMap(updates, `extracted tags from ${matched} filename(s)`);
        onClose();
      }
      return;
    }

    if (tab === "tag-to-fn") {
      const renames = new Map<string, string>();
      for (const row of tagToFnPreview) {
        if (row.nextName !== row.track.filename) {
          renames.set(row.track.id, row.nextName);
        }
      }
      if (renames.size > 0) {
        onApplyRenameMap(renames, `renamed ${renames.size} file(s) from tags`);
        onClose();
      }
      return;
    }

    if (tab === "replace") {
      if (replacePreview.updates.size > 0) {
        onApplyMetadataMap(
          replacePreview.updates,
          `replaced ${replacePreview.matchCount} match(es) across ${replacePreview.updates.size} track(s)`
        );
        onClose();
      }
      return;
    }

    if (tab === "cleanup") {
      const updates = applyCaseTransform(targetTracks, Array.from(caseFields), caseMode);
      onApplyMetadataMap(updates, `applied ${caseMode} formatting to ${targetTracks.length} track(s)`);
      onClose();
    }
  };

  const runUtility = (action: QuickUtilityAction, label: string) => {
    const updates = applyQuickUtility(targetTracks, action);
    onApplyMetadataMap(updates, `${label} (${targetTracks.length} tracks)`);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={
        <>
          <Icon name="auto_fix_high" size={19} style={{ color: "var(--accent-violet)" }} />
          batch tools
          <Badge tone="blue">{targetTracks.length} targets</Badge>
        </>
      }
      footer={
        <>
          <span style={{ fontSize: 12.5, color: "var(--text-muted)", textTransform: "lowercase" }}>
            all batch edits can be undone with <kbd className="tw-kbd">⌘z</kbd>
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="ghost" onClick={onClose}>
              cancel
            </Button>
            <Button variant="primary" onClick={handleApply} disabled={targetTracks.length === 0}>
              apply to {targetTracks.length} file{targetTracks.length === 1 ? "" : "s"}
            </Button>
          </div>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "autonumber", label: "auto-number", icon: <Icon name="numbers" size={16} /> },
            { id: "fn-to-tag", label: "filename → tag", icon: <Icon name="sell" size={16} /> },
            { id: "tag-to-fn", label: "tag → filename", icon: <Icon name="drive_file_rename_outline" size={16} /> },
            { id: "replace", label: "find & replace", icon: <Icon name="find_replace" size={16} /> },
            { id: "cleanup", label: "case & cleanup", icon: <Icon name="format_size" size={16} /> },
          ]}
        />

        {tab === "autonumber" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
              <Field label="start numbering at">
                <Input
                  mono
                  type="number"
                  min={1}
                  value={startAt}
                  onChange={(e) => setStartAt(Math.max(1, Number(e.target.value) || 1))}
                />
              </Field>
              <Field label="zero-padding width">
                <select
                  className="tw-select"
                  value={padDigits}
                  onChange={(e) => setPadDigits(Number(e.target.value))}
                >
                  <option value={0}>no leading zeros (1, 2, 10)</option>
                  <option value={2}>2 digits (01, 02, 10)</option>
                  <option value={3}>3 digits (001, 002, 010)</option>
                </select>
              </Field>
            </div>

            <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 13 }}>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  className="tw-checkbox"
                  checked={saveTotal}
                  onChange={(e) => setSaveTotal(e.target.checked)}
                />
                save total track count (e.g. 01/12)
              </label>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  className="tw-checkbox"
                  checked={resetPerFolder}
                  onChange={(e) => setResetPerFolder(e.target.checked)}
                />
                reset counter per folder / album
              </label>
            </div>

            <table className="wt-preview-table">
              <thead>
                <tr>
                  <th>track / file</th>
                  <th>before</th>
                  <th>after</th>
                </tr>
              </thead>
              <tbody>
                {targetTracks.slice(0, 8).map((t) => {
                  const next = autoNumberPreview.get(t.id);
                  return (
                    <tr key={t.id}>
                      <td>{t.metadata.title || t.filename}</td>
                      <td className="tw-mono" style={{ color: "var(--text-dim)" }}>
                        {t.metadata.track || "—"}
                      </td>
                      <td className="tw-mono" style={{ color: "var(--primary-bright)" }}>
                        {next?.track}
                        {saveTotal && next?.trackTotal ? `/${next.trackTotal}` : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {tab === "fn-to-tag" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Field label="format string" hint="click tokens or presets below">
              <Input
                mono
                value={fnToTagPattern}
                onChange={(e) => setFnToTagPattern(e.target.value)}
                placeholder="%track% - %artist% - %title%"
              />
            </Field>

            <div className="wt-token-bar">
              {FORMAT_TOKENS.map((t) => (
                <button
                  key={t.token}
                  type="button"
                  className="wt-chip"
                  onClick={() => setFnToTagPattern((p) => (p ? `${p} ${t.token}` : t.token))}
                >
                  {t.token}
                </button>
              ))}
            </div>

            <div className="wt-token-bar">
              {FN_TO_TAG_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={`wt-chip ${fnToTagPattern === preset ? "is-active" : ""}`}
                  onClick={() => setFnToTagPattern(preset)}
                >
                  {preset}
                </button>
              ))}
            </div>

            <table className="wt-preview-table">
              <thead>
                <tr>
                  <th>filename</th>
                  <th>extracted tags</th>
                </tr>
              </thead>
              <tbody>
                {fnToTagPreview.slice(0, 8).map(({ track, patch }) => (
                  <tr key={track.id}>
                    <td className="tw-mono" style={{ color: "var(--text-dim)" }}>
                      {track.filename}
                    </td>
                    <td>
                      {patch ? (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                          {Object.entries(patch).map(([k, v]) => (
                            <Badge key={k} tone="blue">
                              {k}: {v}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <Badge tone="danger">no pattern match</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "tag-to-fn" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Field label="target filename pattern" hint="extension is preserved automatically">
              <Input
                mono
                value={tagToFnPattern}
                onChange={(e) => setTagToFnPattern(e.target.value)}
                placeholder="%track2% - %artist% - %title%"
              />
            </Field>

            <div className="wt-token-bar">
              {FORMAT_TOKENS.filter((t) => t.token !== "%dummy%").map((t) => (
                <button
                  key={t.token}
                  type="button"
                  className="wt-chip"
                  onClick={() => setTagToFnPattern((p) => (p ? `${p} ${t.token}` : t.token))}
                >
                  {t.token}
                </button>
              ))}
            </div>

            <div className="wt-token-bar">
              {TAG_TO_FN_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={`wt-chip ${tagToFnPattern === preset ? "is-active" : ""}`}
                  onClick={() => setTagToFnPattern(preset)}
                >
                  {preset}
                </button>
              ))}
            </div>

            <table className="wt-preview-table">
              <thead>
                <tr>
                  <th>current filename</th>
                  <th>new filename</th>
                </tr>
              </thead>
              <tbody>
                {tagToFnPreview.slice(0, 8).map(({ track, nextName }) => (
                  <tr key={track.id}>
                    <td className="tw-mono" style={{ color: "var(--text-dim)" }}>
                      {track.filename}
                    </td>
                    <td
                      className="tw-mono"
                      style={{
                        color: nextName !== track.filename ? "var(--primary-bright)" : "var(--text-dim)",
                      }}
                    >
                      {nextName}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "replace" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "150px 1fr 1fr", gap: 8 }}>
              <Field label="field">
                <select
                  className="tw-select"
                  value={replaceField}
                  onChange={(e) => setReplaceField(e.target.value as StandardTextField | "all")}
                >
                  <option value="all">all text fields</option>
                  {TEXT_FIELDS_FOR_BULK.map((f) => (
                    <option key={f} value={f}>
                      {f.toLowerCase()}
                    </option>
                  ))}
                  <option value="year">year</option>
                  <option value="lyrics">lyrics</option>
                </select>
              </Field>
              <Field label="find">
                <Input
                  mono
                  value={findStr}
                  onChange={(e) => setFindStr(e.target.value)}
                  placeholder="text or regex..."
                />
              </Field>
              <Field label="replace with">
                <Input
                  mono
                  value={replaceStr}
                  onChange={(e) => setReplaceStr(e.target.value)}
                  placeholder="replacement..."
                />
              </Field>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
              <div style={{ display: "flex", gap: 16, fontSize: 13 }}>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                  <input
                    type="checkbox"
                    className="tw-checkbox"
                    checked={useRegex}
                    onChange={(e) => setUseRegex(e.target.checked)}
                  />
                  regular expression
                </label>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                  <input
                    type="checkbox"
                    className="tw-checkbox"
                    checked={caseSensitive}
                    onChange={(e) => setCaseSensitive(e.target.checked)}
                  />
                  case sensitive
                </label>
              </div>
              {replacePreview.error ? (
                <Badge tone="danger">{replacePreview.error}</Badge>
              ) : (
                <Badge tone={replacePreview.matchCount > 0 ? "blue" : "neutral"}>
                  {replacePreview.matchCount} match(es) in {replacePreview.updates.size} file(s)
                </Badge>
              )}
            </div>

            {replacePreview.updates.size > 0 && (
              <table className="wt-preview-table">
                <thead>
                  <tr>
                    <th>file</th>
                    <th>changed fields</th>
                  </tr>
                </thead>
                <tbody>
                  {targetTracks
                    .filter((t) => replacePreview.updates.has(t.id))
                    .slice(0, 6)
                    .map((t) => {
                      const next = replacePreview.updates.get(t.id)!;
                      const diffs = (Object.keys(next) as Array<keyof TrackMetadata>).filter(
                        (k) => k !== "customTags" && next[k] !== t.metadata[k]
                      );
                      return (
                        <tr key={t.id}>
                          <td className="tw-mono">{t.filename}</td>
                          <td>
                            {diffs.map((k) => (
                              <div key={k} style={{ fontSize: 12 }}>
                                <span style={{ color: "var(--text-dim)" }}>{k}:</span>{" "}
                                <span style={{ color: "var(--primary-bright)" }}>{String(next[k])}</span>
                              </div>
                            ))}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === "cleanup" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Field label="case transformation">
              <div className="wt-token-bar">
                {(
                  [
                    ["title", "title case"],
                    ["sentence", "sentence case"],
                    ["lower", "lowercase"],
                    ["upper", "uppercase"],
                    ["trim", "trim & collapse spaces"],
                  ] as Array<[CaseTransform, string]>
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    className={`wt-chip ${caseMode === mode ? "is-active" : ""}`}
                    onClick={() => setCaseMode(mode)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="fields to transform">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {TEXT_FIELDS_FOR_BULK.map((field) => {
                  const active = caseFields.has(field);
                  return (
                    <label
                      key={field}
                      style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}
                    >
                      <input
                        type="checkbox"
                        className="tw-checkbox"
                        checked={active}
                        onChange={() => {
                          const next = new Set(caseFields);
                          if (next.has(field)) next.delete(field);
                          else next.add(field);
                          setCaseFields(next);
                        }}
                      />
                      {field.toLowerCase()}
                    </label>
                  );
                })}
              </div>
            </Field>

            <div style={{ borderTop: "1px dashed var(--line-strong)", paddingTop: 12 }}>
              <div className="tw-label" style={{ marginBottom: 8 }}>
                one-click tag utilities
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <Button
                  size="sm"
                  onClick={() => runUtility("copy-artist-to-album-artist", "copied artist → album artist")}
                >
                  copy artist → album artist
                </Button>
                <Button
                  size="sm"
                  onClick={() => runUtility("swap-artist-title", "swapped artist ↔ title")}
                >
                  <Icon name="swap_horiz" size={16} />
                  swap artist ↔ title
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => runUtility("strip-all-tags", "cleared all metadata fields")}
                >
                  strip all text tags
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
