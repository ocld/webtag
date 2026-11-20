import { Icon } from "./icon";

export interface ToastItem {
  id: string;
  message: string;
  tone?: "info" | "success" | "error";
}

export function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div className="tw-toast-stack" role="status" aria-live="polite">
      {toasts.map((t) => {
        const tone = t.tone ?? "info";
        return (
          <div key={t.id} className={`tw-toast tw-toast--${tone}`}>
            {tone === "success" && <Icon name="check_circle" size={18} style={{ color: "var(--success)", flexShrink: 0 }} />}
            {tone === "error" && <Icon name="warning" size={18} style={{ color: "var(--danger-soft)", flexShrink: 0 }} />}
            {tone === "info" && <Icon name="info" size={18} style={{ color: "var(--primary-hex)", flexShrink: 0 }} />}
            <span style={{ flex: 1 }}>{t.message}</span>
            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              aria-label="dismiss notification"
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-dim)",
                padding: 2,
                display: "inline-flex",
              }}
            >
              <Icon name="close" size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
