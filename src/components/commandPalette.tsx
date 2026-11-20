import React, { useEffect, useMemo, useRef, useState } from "react";
import { Icon, Kbd } from "@/design";

export interface PaletteCommand {
  id: string;
  label: string;
  hint?: string;
  shortcut?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  action: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  commands: PaletteCommand[];
}

export function CommandPalette({ open, onClose, commands }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const active = commands.filter((c) => !c.disabled);
    if (!q) return active;
    return active.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        (c.hint?.toLowerCase().includes(q) ?? false)
    );
  }, [commands, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setHighlighted(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  useEffect(() => {
    setHighlighted((h) => Math.min(h, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlighted((h) => (filtered.length ? (h + 1) % filtered.length : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlighted((h) => (filtered.length ? (h - 1 + filtered.length) % filtered.length : 0));
      } else if (e.key === "Enter" && filtered[highlighted]) {
        e.preventDefault();
        const cmd = filtered[highlighted];
        onClose();
        cmd.action();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, filtered, highlighted, onClose]);

  if (!open) return null;

  return (
    <div
      className="wt-palette-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="command palette"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="wt-palette">
        <div className="wt-palette-search">
          <Icon name="search" size={18} style={{ color: "var(--primary-hex)" }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="run action, scan cd/usb, or export..."
          />
          <Kbd>esc</Kbd>
        </div>

        <div className="wt-palette-list">
          {filtered.length === 0 ? (
            <div style={{ padding: "20px 12px", textAlign: "center", color: "var(--text-dim)", fontSize: "0.84rem" }}>
              no matching commands
            </div>
          ) : (
            filtered.map((cmd, idx) => (
              <button
                key={cmd.id}
                type="button"
                className={`wt-palette-item ${idx === highlighted ? "is-highlighted" : ""}`}
                onMouseEnter={() => setHighlighted(idx)}
                onClick={() => {
                  onClose();
                  cmd.action();
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  {cmd.icon && (
                    <span style={{ display: "inline-flex", color: idx === highlighted ? "var(--primary-hex)" : "var(--text-muted)" }}>
                      {cmd.icon}
                    </span>
                  )}
                  <span>{cmd.label}</span>
                  {cmd.hint && (
                    <span style={{ color: "var(--text-dim)", fontSize: "0.78rem", overflow: "hidden", textOverflow: "ellipsis" }}>
                      · {cmd.hint}
                    </span>
                  )}
                </span>
                {cmd.shortcut && <Kbd>{cmd.shortcut}</Kbd>}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
