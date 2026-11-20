import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon, ToastStack, type ToastItem } from "@/design";
import {
  exportCueSheet,
  scanDiscOrUsbDrive,
  supportsDirectoryPicker,
  writeTracksDirectlyToDrive,
} from "@/lib/discDrive";
import {
  collectFilesFromDataTransfer,
  exportMetadataReport,
  exportSingleTrack,
  exportTracksAsZip,
  ingestFileList,
  type IngestProgress,
} from "@/lib/fileIngestion";
import {
  cloneMetadata,
  createEmptyMetadata,
  type CoverArt,
  type StandardTextField,
  type TrackItem,
  type TrackMetadata,
} from "@/lib/types";
import { BatchToolsModal, type BatchToolTab } from "./batchToolsModal";
import { CommandPalette, type PaletteCommand } from "./commandPalette";
import { DropZone, FullWindowDragOverlay } from "./dropZone";
import { FormatsModal } from "./formatsModal";
import { MetadataEditor } from "./metadataEditor";
import { RandomizeModal } from "./randomizeModal";
import { WebtagLogo } from "./webtagLogo";
import "./webtagApp.css";

interface HistorySnapshot {
  tracks: Array<{
    id: string;
    filename: string;
    metadata: TrackMetadata;
    coverArt: CoverArt | null;
    coverDirty: boolean;
    stripAllMetadata?: boolean;
  }>;
}

function captureSnapshot(tracks: TrackItem[]): HistorySnapshot {
  return {
    tracks: tracks.map((t) => ({
      id: t.id,
      filename: t.filename,
      metadata: cloneMetadata(t.metadata),
      coverArt: t.coverArt,
      coverDirty: t.coverDirty,
      stripAllMetadata: t.stripAllMetadata,
    })),
  };
}

function applySnapshot(tracks: TrackItem[], snap: HistorySnapshot): TrackItem[] {
  const byId = new Map(snap.tracks.map((s) => [s.id, s]));
  return tracks.map((t) => {
    const s = byId.get(t.id);
    if (!s) return t;
    return {
      ...t,
      filename: s.filename,
      metadata: cloneMetadata(s.metadata),
      coverArt: s.coverArt,
      coverDirty: s.coverDirty,
      stripAllMetadata: s.stripAllMetadata,
    };
  });
}

export function WebtagApp() {
  const [tracks, setTracks] = useState<TrackItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [nightMode, setNightMode] = useState(false);

  const [undoStack, setUndoStack] = useState<HistorySnapshot[]>([]);
  const [, setRedoStack] = useState<HistorySnapshot[]>([]);

  const [busyProgress, setBusyProgress] = useState<(IngestProgress & { label: string }) | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [batchModalTab, setBatchModalTab] = useState<BatchToolTab>("autonumber");
  const [batchInitialPattern, setBatchInitialPattern] = useState<string | undefined>(undefined);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [formatsOpen, setFormatsOpen] = useState(false);
  const [randomizeOpen, setRandomizeOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);
  const lastTypingSnapshotRef = useRef<number>(0);

  useEffect(() => {
    setNightMode(document.documentElement.dataset.theme === "night");
  }, []);

  const toggleTheme = useCallback(() => {
    setNightMode((prev) => {
      const next = !prev;
      if (next) {
        document.documentElement.dataset.theme = "night";
        try {
          localStorage.setItem("webtag-theme", "night");
        } catch {
          // ignore storage errors
        }
      } else {
        delete document.documentElement.dataset.theme;
        try {
          localStorage.setItem("webtag-theme", "day");
        } catch {
          // ignore storage errors
        }
      }
      return next;
    });
  }, []);

  const pushToast = useCallback((message: string, tone: ToastItem["tone"] = "info") => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev.slice(-3), { id, message: message.toLowerCase(), tone }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3600);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // coalesce rapid keystrokes within 650ms into a single undo snapshot
  const recordUndo = useCallback((currentTracks: TrackItem[], coalesce = false) => {
    const now = Date.now();
    if (coalesce && now - lastTypingSnapshotRef.current < 650) return;
    lastTypingSnapshotRef.current = now;
    setUndoStack((prev) => [...prev.slice(-39), captureSnapshot(currentTracks)]);
    setRedoStack([]);
  }, []);

  const handleUndo = useCallback(() => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setTracks((cur) => {
        setRedoStack((r) => [...r.slice(-39), captureSnapshot(cur)]);
        return applySnapshot(cur, last);
      });
      pushToast("undid last edit", "info");
      return prev.slice(0, -1);
    });
  }, [pushToast]);

  const handleRedo = useCallback(() => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setTracks((cur) => {
        setUndoStack((u) => [...u.slice(-39), captureSnapshot(cur)]);
        return applySnapshot(cur, last);
      });
      pushToast("redid edit", "info");
      return prev.slice(0, -1);
    });
  }, [pushToast]);

  const selectedTracks = useMemo(
    () => tracks.filter((t) => selectedIds.has(t.id)),
    [tracks, selectedIds]
  );

  const batchTargetTracks = selectedTracks.length > 0 ? selectedTracks : tracks;

  const handleIngest = useCallback(
    async (entries: Array<{ file: File; relativePath?: string }>) => {
      if (entries.length === 0) return;
      setBusyProgress({
        label: "reading metadata",
        done: 0,
        total: entries.length,
        currentFile: "",
      });
      try {
        const result = await ingestFileList(entries, (p) => {
          setBusyProgress({ label: "reading metadata", ...p });
        });

        if (result.tracks.length > 0) {
          setTracks((prev) => [...prev, ...result.tracks]);
          setSelectedIds((prev) => (prev.size === 0 ? new Set([result.tracks[0].id]) : prev));
          setAnchorId((prev) => prev ?? result.tracks[0].id);
          pushToast(
            `loaded ${result.tracks.length} file${result.tracks.length === 1 ? "" : "s"}`,
            "success"
          );
        }

        if (result.errors.length > 0) {
          pushToast(`${result.errors.length} file(s) failed (${result.errors[0].file})`, "error");
        }
      } catch (err) {
        pushToast(err instanceof Error ? err.message : "failed to load files", "error");
      } finally {
        setBusyProgress(null);
      }
    },
    [pushToast]
  );

  const handleScanDrive = useCallback(async () => {
    if (!supportsDirectoryPicker()) {
      pushToast("select your mounted cd or usb volume", "info");
      folderInputRef.current?.click();
      return;
    }

    setBusyProgress({ label: "scanning drive", done: 0, total: 1, currentFile: "select cd or usb volume..." });
    try {
      const result = await scanDiscOrUsbDrive((p) => {
        setBusyProgress({ label: "scanning drive", ...p });
      });
      if (!result) return;

      if (result.tracks.length > 0) {
        setTracks((prev) => [...prev, ...result.tracks]);
        setSelectedIds((prev) => (prev.size === 0 ? new Set([result.tracks[0].id]) : prev));
        setAnchorId((prev) => prev ?? result.tracks[0].id);
        const modeLabel = result.drive.writable ? "writable" : "read-only";
        pushToast(
          `mounted ${result.drive.kind} "${result.drive.name}" (${result.tracks.length} files · ${modeLabel})`,
          "success"
        );
      } else {
        pushToast(`no files found on "${result.drive.name}"`, "error");
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "could not read drive", "error");
    } finally {
      setBusyProgress(null);
    }
  }, [pushToast]);

  const handleWriteToDrive = useCallback(async () => {
    setBusyProgress({ label: "writing to drive", done: 0, total: tracks.length, currentFile: "" });
    try {
      const { written, failed } = await writeTracksDirectlyToDrive(tracks, (p) => {
        setBusyProgress({ label: "writing to drive", ...p });
      });

      if (written.size > 0) {
        setTracks((prev) =>
          prev.map((t) => {
            const buf = written.get(t.id);
            if (!buf) return t;
            return {
              ...t,
              buffer: buf,
              fileSize: buf.byteLength,
              originalFilename: t.filename,
              originalMetadata: cloneMetadata(t.metadata),
              originalCoverArt: t.coverArt,
              coverDirty: false,
              stripAllMetadata: false,
              tech: t.stripAllMetadata ? { ...t.tech, hasGps: false } : t.tech,
            };
          })
        );
        pushToast(`saved ${written.size} file(s) directly to drive`, "success");
      }
      if (failed.length > 0) {
        pushToast(`${failed.length} file(s) could not be written (${failed[0].file})`, "error");
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "drive write failed", "error");
    } finally {
      setBusyProgress(null);
    }
  }, [tracks, pushToast]);

  // track dragenter/dragleave depth with a counter so child transitions do not flicker the overlay
  useEffect(() => {
    const onDragEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types?.includes("Files")) return;
      e.preventDefault();
      dragCounterRef.current += 1;
      setIsDragging(true);
    };
    const onDragOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types?.includes("Files")) return;
      e.preventDefault();
    };
    const onDragLeave = (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
      if (dragCounterRef.current === 0) setIsDragging(false);
    };
    const onDrop = async (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current = 0;
      setIsDragging(false);
      if (!e.dataTransfer) return;
      const entries = await collectFilesFromDataTransfer(e.dataTransfer);
      void handleIngest(entries);
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [handleIngest]);

  const handleClearWorkspace = useCallback(() => {
    setTracks([]);
    setSelectedIds(new Set());
    setAnchorId(null);
    setUndoStack([]);
    setRedoStack([]);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const target = e.target as HTMLElement | null;
      const inInput =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;

      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }

      if (inInput) return;

      if (e.key === "?" && !paletteOpen && !batchModalOpen) {
        e.preventDefault();
        setFormatsOpen((v) => !v);
        return;
      }

      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
        return;
      }

      if (tracks.length === 0 && !paletteOpen && !formatsOpen) {
        if (e.key.toLowerCase() === "d" && !mod) {
          e.preventDefault();
          void handleScanDrive();
          return;
        }
        if (e.key.toLowerCase() === "z" && !mod) {
          e.preventDefault();
          zipInputRef.current?.click();
          return;
        }
      }

      if (e.key === "Escape" && !paletteOpen && !batchModalOpen && !formatsOpen && !randomizeOpen && tracks.length > 0) {
        e.preventDefault();
        handleClearWorkspace();
        return;
      }

      if (mod && e.key.toLowerCase() === "a" && tracks.length > 0) {
        e.preventDefault();
        setSelectedIds(new Set(tracks.map((t) => t.id)));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleUndo, handleRedo, handleClearWorkspace, handleScanDrive, tracks, paletteOpen, batchModalOpen, formatsOpen, randomizeOpen]);

  // clear stripAllMetadata when a user explicitly edits any field so the new value is written
  const handlePatchField = useCallback(
    (field: StandardTextField, value: string) => {
      setTracks((prev) => {
        recordUndo(prev, true);
        return prev.map((t) =>
          selectedIds.has(t.id)
            ? {
                ...t,
                stripAllMetadata: false,
                metadata: { ...t.metadata, [field]: value },
              }
            : t
        );
      });
    },
    [selectedIds, recordUndo]
  );

  const handleRenameSingle = useCallback(
    (trackId: string, nextFilename: string) => {
      setTracks((prev) => {
        recordUndo(prev, true);
        return prev.map((t) => (t.id === trackId ? { ...t, filename: nextFilename } : t));
      });
    },
    [recordUndo]
  );

  const handleSetCoverArt = useCallback(
    (cover: CoverArt | null) => {
      setTracks((prev) => {
        recordUndo(prev, false);
        return prev.map((t) =>
          selectedIds.has(t.id)
            ? { ...t, coverArt: cover, coverDirty: true, stripAllMetadata: false }
            : t
        );
      });
      pushToast(
        cover
          ? `set art on ${selectedIds.size} file(s)`
          : `removed art from ${selectedIds.size} file(s)`,
        "info"
      );
    },
    [selectedIds, recordUndo, pushToast]
  );

  const handleUpdateCustomTag = useCallback(
    (oldKey: string | null, newKey: string, value: string) => {
      setTracks((prev) => {
        recordUndo(prev, true);
        return prev.map((t) => {
          if (!selectedIds.has(t.id)) return t;
          const nextCustom = { ...t.metadata.customTags };
          if (oldKey && oldKey !== newKey) delete nextCustom[oldKey];
          if (newKey.trim()) nextCustom[newKey.trim().toUpperCase()] = value;
          return { ...t, stripAllMetadata: false, metadata: { ...t.metadata, customTags: nextCustom } };
        });
      });
    },
    [selectedIds, recordUndo]
  );

  const handleDeleteCustomTag = useCallback(
    (key: string) => {
      setTracks((prev) => {
        recordUndo(prev, false);
        return prev.map((t) => {
          if (!selectedIds.has(t.id)) return t;
          const nextCustom = { ...t.metadata.customTags };
          delete nextCustom[key];
          return { ...t, metadata: { ...t.metadata, customTags: nextCustom } };
        });
      });
    },
    [selectedIds, recordUndo]
  );

  const handleStripSelected = useCallback(() => {
    setTracks((prev) => {
      recordUndo(prev, false);
      return prev.map((t) => {
        if (!selectedIds.has(t.id)) return t;
        return {
          ...t,
          metadata: createEmptyMetadata(),
          coverArt: t.fileKind === "audio" ? null : t.coverArt,
          coverDirty: t.fileKind === "audio" ? true : t.coverDirty,
          stripAllMetadata: true,
        };
      });
    });
    pushToast(`stripped all metadata from ${selectedIds.size} file(s) — save to apply`, "success");
  }, [selectedIds, recordUndo, pushToast]);

  const handleApplyMetadataMap = useCallback(
    (updates: Map<string, TrackMetadata>, summary: string) => {
      setTracks((prev) => {
        recordUndo(prev, false);
        return prev.map((t) => {
          const next = updates.get(t.id);
          return next ? { ...t, stripAllMetadata: false, metadata: cloneMetadata(next) } : t;
        });
      });
      pushToast(summary, "success");
    },
    [recordUndo, pushToast]
  );

  const handleApplyRenameMap = useCallback(
    (renames: Map<string, string>, summary: string) => {
      setTracks((prev) => {
        recordUndo(prev, false);
        return prev.map((t) => {
          const nextName = renames.get(t.id);
          return nextName ? { ...t, filename: nextName } : t;
        });
      });
      pushToast(summary, "success");
    },
    [recordUndo, pushToast]
  );

  const handleRevertSelected = useCallback(() => {
    setTracks((prev) => {
      recordUndo(prev, false);
      return prev.map((t) =>
        selectedIds.has(t.id)
          ? {
              ...t,
              filename: t.originalFilename,
              metadata: cloneMetadata(t.originalMetadata),
              coverArt: t.originalCoverArt,
              coverDirty: false,
              stripAllMetadata: false,
            }
          : t
      );
    });
    pushToast(`reverted ${selectedIds.size} file(s)`, "info");
  }, [selectedIds, recordUndo, pushToast]);

  const handleRemoveTrack = useCallback((trackId: string) => {
    setTracks((prev) => {
      const remaining = prev.filter((t) => t.id !== trackId);
      setSelectedIds((sel) => {
        const next = new Set(sel);
        next.delete(trackId);
        if (next.size === 0 && remaining[0]) next.add(remaining[0].id);
        return next;
      });
      return remaining;
    });
  }, []);

  const handleDownloadOne = useCallback(
    async (track: TrackItem) => {
      if (track.isCdaPointer) {
        exportCueSheet([track]);
        pushToast("exported .cue sheet", "success");
        return;
      }
      setBusyProgress({
        label: track.stripAllMetadata ? "stripping metadata" : "writing metadata",
        done: 0,
        total: 1,
        currentFile: track.filename,
      });
      try {
        const updatedBuffer = await exportSingleTrack(track);
        setTracks((prev) =>
          prev.map((t) =>
            t.id === track.id
              ? {
                  ...t,
                  buffer: updatedBuffer,
                  fileSize: updatedBuffer.byteLength,
                  originalFilename: t.filename,
                  originalMetadata: cloneMetadata(t.metadata),
                  originalCoverArt: t.coverArt,
                  coverDirty: false,
                  stripAllMetadata: false,
                  tech: t.stripAllMetadata ? { ...t.tech, hasGps: false } : t.tech,
                }
              : t
          )
        );
        pushToast(`saved ${track.filename}`, "success");
      } catch (err) {
        pushToast(err instanceof Error ? err.message : "failed to save file", "error");
      } finally {
        setBusyProgress(null);
      }
    },
    [pushToast]
  );

  const handleExportZip = useCallback(
    async (subset: TrackItem[], zipLabel = "webtag-export.zip") => {
      const exportable = subset.filter((t) => !t.isCdaPointer);
      if (exportable.length === 0) {
        if (subset.length > 0) {
          exportCueSheet(subset);
          pushToast("exported audio cd .cue sheet", "success");
        }
        return;
      }
      if (exportable.length === 1) {
        await handleDownloadOne(exportable[0]);
        return;
      }

      setBusyProgress({
        label: "packaging zip",
        done: 0,
        total: exportable.length,
        currentFile: "",
      });
      try {
        const { updatedBuffers, failed } = await exportTracksAsZip(exportable, zipLabel, (p) => {
          setBusyProgress({ label: "packaging zip", ...p });
        });

        setTracks((prev) =>
          prev.map((t) => {
            const buf = updatedBuffers.get(t.id);
            if (!buf) return t;
            return {
              ...t,
              buffer: buf,
              fileSize: buf.byteLength,
              originalFilename: t.filename,
              originalMetadata: cloneMetadata(t.metadata),
              originalCoverArt: t.coverArt,
              coverDirty: false,
              stripAllMetadata: false,
              tech: t.stripAllMetadata ? { ...t.tech, hasGps: false } : t.tech,
            };
          })
        );

        if (failed.length > 0) {
          pushToast(`exported zip with ${failed.length} error(s)`, "error");
        } else {
          pushToast(`exported ${exportable.length} files to ${zipLabel}`, "success");
        }
      } catch (err) {
        pushToast(err instanceof Error ? err.message : "zip export failed", "error");
      } finally {
        setBusyProgress(null);
      }
    },
    [handleDownloadOne, pushToast]
  );

  const openBatchTab = useCallback((tab: BatchToolTab, pattern?: string) => {
    setBatchInitialPattern(pattern);
    setBatchModalTab(tab);
    setBatchModalOpen(true);
  }, []);

  const paletteCommands: PaletteCommand[] = useMemo(
    () => [
      {
        id: "upload-files",
        label: "open any files",
        hint: "audio, images, pdf, docs, video, any file",
        icon: <Icon name="draft" size={17} />,
        action: () => fileInputRef.current?.click(),
      },
      {
        id: "upload-folder",
        label: "open folder",
        hint: "recursive directory scan",
        icon: <Icon name="create_new_folder" size={17} />,
        action: () => folderInputRef.current?.click(),
      },
      {
        id: "scan-drive",
        label: "scan cd drive / usb drive",
        hint: "audio cds & writable usb volumes",
        shortcut: "d",
        icon: <Icon name="album" size={17} />,
        action: () => void handleScanDrive(),
      },
      {
        id: "upload-zip",
        label: "open .zip archive",
        shortcut: "z",
        icon: <Icon name="folder_zip" size={17} />,
        action: () => zipInputRef.current?.click(),
      },
      {
        id: "randomize",
        label: "randomize address & metadata",
        hint: "pick global cities, gps, identity & camera presets",
        shortcut: "r",
        icon: <Icon name="casino" size={17} />,
        disabled: tracks.length === 0,
        action: () => setRandomizeOpen(true),
      },
      {
        id: "strip-selected",
        label: "strip all metadata from selected",
        hint: "removes exif, gps, xmp, editor info, tags",
        shortcut: "x",
        icon: <Icon name="cleaning_services" size={17} />,
        disabled: tracks.length === 0,
        action: handleStripSelected,
      },
      {
        id: "formats",
        label: "supported formats, presets & shortcuts",
        shortcut: "?",
        icon: <Icon name="menu_book" size={17} />,
        action: () => setFormatsOpen(true),
      },
      {
        id: "autonumber",
        label: "auto-number tracks",
        hint: `${batchTargetTracks.length} target(s)`,
        icon: <Icon name="numbers" size={17} />,
        disabled: tracks.length === 0,
        action: () => openBatchTab("autonumber"),
      },
      {
        id: "fn-to-tag",
        label: "filename → tag converter",
        icon: <Icon name="sell" size={17} />,
        disabled: tracks.length === 0,
        action: () => openBatchTab("fn-to-tag"),
      },
      {
        id: "tag-to-fn",
        label: "tag → filename renamer",
        icon: <Icon name="drive_file_rename_outline" size={17} />,
        disabled: tracks.length === 0,
        action: () => openBatchTab("tag-to-fn"),
      },
      {
        id: "replace",
        label: "batch find & replace (regex)",
        icon: <Icon name="find_replace" size={17} />,
        disabled: tracks.length === 0,
        action: () => openBatchTab("replace"),
      },
      {
        id: "cleanup",
        label: "case & cleanup actions",
        icon: <Icon name="format_size" size={17} />,
        disabled: tracks.length === 0,
        action: () => openBatchTab("cleanup"),
      },
      {
        id: "export-zip",
        label: "export all as .zip",
        hint: `${tracks.length} file(s)`,
        icon: <Icon name="download" size={17} />,
        disabled: tracks.length === 0,
        action: () => void handleExportZip(tracks, "webtag-export.zip"),
      },
      {
        id: "export-csv",
        label: "export metadata csv",
        icon: <Icon name="table_view" size={17} />,
        disabled: tracks.length === 0,
        action: () => {
          exportMetadataReport(tracks, "csv");
          pushToast("downloaded webtag-metadata.csv", "success");
        },
      },
      {
        id: "export-json",
        label: "export metadata json",
        icon: <Icon name="data_object" size={17} />,
        disabled: tracks.length === 0,
        action: () => {
          exportMetadataReport(tracks, "json");
          pushToast("downloaded webtag-metadata.json", "success");
        },
      },
      {
        id: "undo",
        label: "undo last edit",
        shortcut: "⌘z",
        icon: <Icon name="undo" size={17} />,
        disabled: undoStack.length === 0,
        action: handleUndo,
      },
      {
        id: "clear",
        label: "back to home (close files)",
        shortcut: "esc",
        icon: <Icon name="delete" size={17} />,
        disabled: tracks.length === 0,
        action: handleClearWorkspace,
      },
    ],
    [
      tracks,
      batchTargetTracks.length,
      undoStack.length,
      handleScanDrive,
      handleStripSelected,
      openBatchTab,
      handleExportZip,
      handleUndo,
      handleClearWorkspace,
      pushToast,
    ]
  );

  const isEditing = tracks.length > 0;

  return (
    <div className={`wt-app ${isEditing ? "is-editing" : ""}`}>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const list = Array.from(e.target.files ?? []).map((file) => ({ file }));
          void handleIngest(list);
          e.target.value = "";
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        // @ts-expect-error non-standard directory picker attribute supported by browsers
        webkitdirectory=""
        directory=""
        hidden
        onChange={(e) => {
          const list = Array.from(e.target.files ?? []).map((file) => ({
            file,
            relativePath: file.webkitRelativePath || file.name,
          }));
          void handleIngest(list);
          e.target.value = "";
        }}
      />
      <input
        ref={zipInputRef}
        type="file"
        multiple
        accept=".zip,application/zip"
        hidden
        onChange={(e) => {
          const list = Array.from(e.target.files ?? []).map((file) => ({ file }));
          void handleIngest(list);
          e.target.value = "";
        }}
      />

      {!isEditing ? (
        <div className="wt-corner-tools" aria-label="page controls">
          <button
            type="button"
            className="wt-corner-btn"
            onClick={() => setFormatsOpen(true)}
            aria-label="supported formats and shortcuts"
          >
            <Icon name="menu_book" size={16} className="wt-c-accent" />
            <span>formats</span>
          </button>
          <button
            type="button"
            className="wt-corner-btn wt-corner-btn--icon"
            onClick={toggleTheme}
            title={nightMode ? "switch to day theme" : "switch to night theme"}
            aria-label={nightMode ? "switch to day theme" : "switch to night theme"}
          >
            <Icon
              name={nightMode ? "light_mode" : "dark_mode"}
              size={17}
              className={nightMode ? "wt-c-amber" : "wt-c-violet"}
            />
          </button>
        </div>
      ) : (
        <header className="wt-topbar">
          <div className="wt-topbar-inner">
            <div className="wt-topbar-left">
              <button
                type="button"
                className="wt-topbar-brand"
                onClick={handleClearWorkspace}
                aria-label="webtag — return to start"
              >
                <WebtagLogo compact />
              </button>
              <span className="wt-topbar-stat">
                {tracks.length} file{tracks.length === 1 ? "" : "s"} · {selectedIds.size} selected
              </span>
            </div>
            <nav className="wt-topbar-right" aria-label="workspace toolbar">
              <button type="button" className="wt-top-btn" onClick={() => void handleScanDrive()}>
                <Icon name="album" size={16} className="wt-c-green" />
                <span>cd/usb</span>
              </button>
              <button type="button" className="wt-top-btn wt-top-btn--spoof" onClick={() => setRandomizeOpen(true)}>
                <Icon name="casino" size={16} className="wt-c-violet" />
                <span>spoof</span>
              </button>
              <button type="button" className="wt-top-btn" onClick={() => setPaletteOpen(true)}>
                <Icon name="terminal" size={16} className="wt-c-accent" />
                <span>⌘k</span>
              </button>
              <button type="button" className="wt-top-btn" onClick={() => setFormatsOpen(true)}>
                <Icon name="menu_book" size={16} className="wt-c-amber" />
                <span>ref</span>
              </button>
              <button
                type="button"
                className="wt-top-btn wt-top-btn--icon"
                onClick={toggleTheme}
                title={nightMode ? "switch to day theme" : "switch to night theme"}
                aria-label={nightMode ? "switch to day theme" : "switch to night theme"}
              >
                <Icon
                  name={nightMode ? "light_mode" : "dark_mode"}
                  size={16}
                  className={nightMode ? "wt-c-amber" : "wt-c-violet"}
                />
              </button>
            </nav>
          </div>
        </header>
      )}

      <main id="main-content" className="wt-stage">
        {!isEditing ? (
          <div className="wt-home-shell">
            <div className="wt-brand-header">
              <h1 className="wt-hero-h1">
                <WebtagLogo interactive />
              </h1>
              <p className="wt-tagline">
                <span>inspect, edit, spoof, or strip metadata on any file</span>
                <span className="wt-hint-dot" aria-hidden="true">·</span>
                <button type="button" className="wt-inline-link" onClick={() => setFormatsOpen(true)}>
                  45+ formats
                </button>
              </p>
            </div>

            {busyProgress && (
              <div className="wt-progress-card" role="status" aria-live="polite">
                <div className="wt-progress-meta">
                  <span>
                    <strong style={{ color: "var(--text-focus)" }}>{busyProgress.label}</strong>
                    {busyProgress.currentFile ? ` — ${busyProgress.currentFile}` : ""}
                  </span>
                  <span>
                    {busyProgress.done}/{busyProgress.total}
                  </span>
                </div>
                <div className={`tw-progress-bar ${busyProgress.total <= 1 ? "is-indeterminate" : ""}`}>
                  {busyProgress.total > 1 && (
                    <div
                      className="tw-progress-fill"
                      style={{ width: `${Math.round((busyProgress.done / busyProgress.total) * 100)}%` }}
                    />
                  )}
                </div>
              </div>
            )}

            <DropZone
              onPickFiles={() => fileInputRef.current?.click()}
              onPickFolder={() => folderInputRef.current?.click()}
              onPickZip={() => zipInputRef.current?.click()}
              onScanDrive={() => void handleScanDrive()}
              onOpenPalette={() => setPaletteOpen(true)}
            />
          </div>
        ) : (
          <div className="wt-workspace-shell">
            {busyProgress && (
              <div className="wt-progress-card" role="status" aria-live="polite">
                <div className="wt-progress-meta">
                  <span>
                    <strong style={{ color: "var(--text-focus)" }}>{busyProgress.label}</strong>
                    {busyProgress.currentFile ? ` — ${busyProgress.currentFile}` : ""}
                  </span>
                  <span>
                    {busyProgress.done}/{busyProgress.total}
                  </span>
                </div>
                <div className={`tw-progress-bar ${busyProgress.total <= 1 ? "is-indeterminate" : ""}`}>
                  {busyProgress.total > 1 && (
                    <div
                      className="tw-progress-fill"
                      style={{ width: `${Math.round((busyProgress.done / busyProgress.total) * 100)}%` }}
                    />
                  )}
                </div>
              </div>
            )}

            <MetadataEditor
              tracks={tracks}
              selectedIds={selectedIds}
              anchorId={anchorId}
              onSelectChange={(next, nextAnchor) => {
                setSelectedIds(next);
                if (nextAnchor !== undefined) setAnchorId(nextAnchor);
              }}
              onPatchField={handlePatchField}
              onRenameSingle={handleRenameSingle}
              onSetCoverArt={handleSetCoverArt}
              onUpdateCustomTag={handleUpdateCustomTag}
              onDeleteCustomTag={handleDeleteCustomTag}
              onStripSelected={handleStripSelected}
              onRevertSelected={handleRevertSelected}
              onRemoveTrack={handleRemoveTrack}
              onDownloadOne={(track) => void handleDownloadOne(track)}
              onDownloadAll={() => void handleExportZip(tracks, "webtag-export.zip")}
              onWriteToDrive={() => void handleWriteToDrive()}
              onExportCue={() => {
                exportCueSheet(tracks);
                pushToast("exported audio cd .cue sheet", "success");
              }}
              onOpenBatchTools={() => openBatchTab("autonumber")}
              onOpenRandomize={() => setRandomizeOpen(true)}
              onPickFiles={() => fileInputRef.current?.click()}
              onPickFolder={() => folderInputRef.current?.click()}
              onScanDrive={() => void handleScanDrive()}
              onPickZip={() => zipInputRef.current?.click()}
              onUndo={handleUndo}
              canUndo={undoStack.length > 0}
              onBack={handleClearWorkspace}
            />
          </div>
        )}
      </main>

      <footer className="wt-minimal-footer">
        <span>
          by{" "}
          <a href="https://github.com/ocld" target="_blank" rel="noopener noreferrer">
            ocld
          </a>
        </span>
        <span className="wt-hint-dot" aria-hidden="true">|</span>
        <a href="https://github.com/ocld/webtag" target="_blank" rel="noopener noreferrer">
          source code
        </a>
        <span className="wt-hint-dot" aria-hidden="true">|</span>
        <button type="button" className="wt-inline-link" onClick={() => setFormatsOpen(true)}>
          reference
        </button>
      </footer>

      <FullWindowDragOverlay active={isDragging} />

      <BatchToolsModal
        open={batchModalOpen}
        initialTab={batchModalTab}
        initialPattern={batchInitialPattern}
        onClose={() => setBatchModalOpen(false)}
        targetTracks={batchTargetTracks}
        onApplyMetadataMap={handleApplyMetadataMap}
        onApplyRenameMap={handleApplyRenameMap}
      />

      <RandomizeModal
        open={randomizeOpen}
        onClose={() => setRandomizeOpen(false)}
        targetTracks={batchTargetTracks}
        onApplyMetadataMap={handleApplyMetadataMap}
      />

      <FormatsModal
        open={formatsOpen}
        onClose={() => setFormatsOpen(false)}
        hasTracks={tracks.length > 0}
        onApplyPreset={(tool, pattern) => openBatchTab(tool, pattern)}
      />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        commands={paletteCommands}
      />

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
