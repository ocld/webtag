import { useMemo, useState } from "react";
import { Badge, Button, Icon, Modal, Tabs } from "@/design";
import { getRegisteredFormatSpecs } from "@/lib/universalMetadata";
import type { FileCategory } from "@/lib/types";

interface FormatsModalProps {
  open: boolean;
  onClose: () => void;
  hasTracks: boolean;
  onApplyPreset: (tool: "fn-to-tag" | "tag-to-fn" | "replace", pattern: string) => void;
}

const CATEGORY_ORDER: Array<{ id: FileCategory; title: string }> = [
  { id: "audio", title: "audio & cds" },
  { id: "image", title: "images" },
  { id: "document", title: "documents" },
  { id: "app", title: "apps & binaries" },
  { id: "other", title: "any other file" },
];

const PRESETS: Array<{ label: string; tool: "fn-to-tag" | "tag-to-fn" | "replace"; pattern: string }> = [
  { label: "track · artist · title", tool: "fn-to-tag", pattern: "%track% - %artist% - %title%" },
  { label: "track · title", tool: "fn-to-tag", pattern: "%track% - %title%" },
  { label: "artist · album · track · title", tool: "fn-to-tag", pattern: "%artist% - %album% - %track% - %title%" },
  { label: "zero-padded rename", tool: "tag-to-fn", pattern: "%track2% - %artist% - %title%" },
  { label: "multi-disc rename", tool: "tag-to-fn", pattern: "%disc%-%track2% %title%" },
  { label: "strip (official audio)", tool: "replace", pattern: "\\s*[\\(\\[]\\s*Official\\s+(Audio|Video|Music\\s+Video)\\s*[\\)\\]]" },
];

const SHORTCUTS: Array<[string, string]> = [
  ["⌘k", "command palette"],
  ["d", "scan cd or usb drive"],
  ["z", "open .zip archive"],
  ["↑ / ↓", "step through files"],
  ["a", "select all files"],
  ["r", "spoof / randomize metadata"],
  ["x", "strip all metadata"],
  ["b", "batch tools"],
  ["⌘z", "undo last edit"],
  ["?", "reference"],
  ["esc", "back to home"],
];

export function FormatsModal({ open, onClose, hasTracks, onApplyPreset }: FormatsModalProps) {
  const [tab, setTab] = useState<"formats" | "presets" | "shortcuts">("formats");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const handlers = useMemo(() => getRegisteredFormatSpecs(), []);

  const groupedHandlers = useMemo(() => {
    return CATEGORY_ORDER.map((cat) => ({
      ...cat,
      items: handlers.filter((h) => h.category === cat.id),
    })).filter((g) => g.items.length > 0);
  }, [handlers]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={
        <>
          <Icon name="menu_book" size={19} style={{ color: "var(--primary-hex)" }} />
          reference
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "formats", label: `formats (${handlers.length})` },
            { id: "presets", label: "patterns" },
            { id: "shortcuts", label: "shortcuts" },
          ]}
        />

        {tab === "formats" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {groupedHandlers.map((group) => (
              <div key={group.id} className="wt-group-card" style={{ marginBottom: 0 }}>
                <h3 className="wt-group-title">{group.title}</h3>
                <table className="wt-preview-table" style={{ marginTop: 2 }}>
                  <tbody>
                    {group.items.map((h) => (
                      <tr key={h.id}>
                        <td style={{ width: "36%", fontWeight: 700, color: "var(--text-focus)" }}>
                          {h.label.toLowerCase()}
                        </td>
                        <td style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>
                          {h.standards.toLowerCase()}
                        </td>
                        <td style={{ width: "24%", textAlign: "right" }}>
                          <Badge tone="blue">{h.capabilities.toLowerCase()}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}

        {tab === "presets" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {PRESETS.map((p) => {
              const copied = copiedId === p.pattern;
              return (
                <div
                  key={p.label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    padding: "10px 12px",
                    background: "var(--bg-b)",
                    border: "1px solid var(--line-strong)",
                    borderRadius: "var(--radius-md)",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: "0.92rem", fontWeight: 700, color: "var(--text-focus)" }}>
                      {p.label} <Badge style={{ marginLeft: 4 }}>{p.tool}</Badge>
                    </div>
                    <code style={{ fontSize: "0.84rem", color: "var(--primary-hex)" }}>
                      {p.pattern}
                    </code>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <Button
                      size="sm"
                      iconOnly
                      onClick={() => {
                        void navigator.clipboard?.writeText(p.pattern);
                        setCopiedId(p.pattern);
                        setTimeout(() => setCopiedId(null), 1400);
                      }}
                      aria-label={`copy ${p.label}`}
                    >
                      <Icon name={copied ? "check" : "content_copy"} size={16} />
                    </Button>
                    {hasTracks && (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => {
                          onClose();
                          onApplyPreset(p.tool, p.pattern);
                        }}
                      >
                        use
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === "shortcuts" && (
          <div className="wt-group-card" style={{ marginBottom: 0 }}>
            <table className="wt-preview-table" style={{ marginTop: 0 }}>
              <tbody>
                {SHORTCUTS.map(([keys, desc]) => (
                  <tr key={keys}>
                    <td style={{ width: 110 }}>
                      <kbd className="tw-kbd">{keys}</kbd>
                    </td>
                    <td style={{ color: "var(--text-focus)", fontWeight: 500 }}>{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}
