import { Icon } from "@/design";

interface DropZoneProps {
  onPickFiles: () => void;
  onPickFolder: () => void;
  onPickZip: () => void;
  onScanDrive: () => void;
  onOpenPalette: () => void;
}

export function DropZone({
  onPickFiles,
  onPickFolder,
  onPickZip,
  onScanDrive,
  onOpenPalette,
}: DropZoneProps) {
  return (
    <div className="wt-home-actions">
      <div
        className="wt-drop-card wt-clickable"
        role="button"
        tabIndex={0}
        onClick={onPickFiles}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onPickFiles();
          }
        }}
        aria-label="drop or browse any files, folders, cd or usb drives, app bundles, or zip archives"
      >
        <div className="wt-drop-icon" aria-hidden="true">
          <Icon name="upload_file" size={24} />
        </div>

        <div className="wt-drop-copy">
          <div className="wt-drop-title">drop any file here, or click to browse</div>
          <div className="wt-drop-sub">
            audio · photos · pdf · docs · apps · drives · .zip
          </div>
        </div>

        <button
          type="button"
          className="tw-btn tw-btn--primary"
          onClick={(e) => {
            e.stopPropagation();
            onPickFiles();
          }}
        >
          <Icon name="folder_open" size={17} />
          browse
        </button>
      </div>

      <div className="wt-tools-row" aria-label="quick open">
        <button type="button" className="wt-tool-pill wt-tool-pill--blue" onClick={onPickFolder}>
          <Icon name="create_new_folder" size={18} />
          <span>open folder</span>
        </button>

        <button type="button" className="wt-tool-pill wt-tool-pill--green" onClick={onScanDrive}>
          <Icon name="album" size={18} />
          <span>cd / usb drive</span>
        </button>

        <button type="button" className="wt-tool-pill wt-tool-pill--amber" onClick={onPickZip}>
          <Icon name="folder_zip" size={18} />
          <span>.zip &amp; bundles</span>
        </button>

        <button type="button" className="wt-tool-pill wt-tool-pill--violet" onClick={onOpenPalette}>
          <Icon name="terminal" size={18} />
          <span>all actions</span>
          <kbd className="wt-pill-kbd">⌘k</kbd>
        </button>
      </div>
    </div>
  );
}

export function FullWindowDragOverlay({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div className="wt-drag-overlay" aria-hidden="true">
      <div className="wt-drag-overlay-box">
        <div className="wt-drop-icon wt-drop-icon--lg">
          <Icon name="upload_file" size={30} />
        </div>
        <div className="wt-drag-overlay-title">drop to inspect &amp; edit locally</div>
        <div className="wt-drag-overlay-sub">
          audio · photos · pdf · docs · app bundles · cd / usb · .zip
        </div>
      </div>
    </div>
  );
}
