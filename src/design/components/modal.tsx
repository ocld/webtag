import React, { useEffect, useId, useRef } from "react";
import { Button } from "./button";
import { Icon } from "./icon";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  size?: "sm" | "md" | "lg";
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export function Modal({
  open,
  onClose,
  title,
  size = "md",
  footer,
  children,
}: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="tw-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={["tw-modal", size !== "md" ? `tw-modal--${size}` : ""].filter(Boolean).join(" ")}
      >
        <div className="tw-modal-header">
          <h2 id={titleId} className="tw-modal-title">
            {title}
          </h2>
          <Button variant="ghost" size="sm" iconOnly onClick={onClose} aria-label="close modal">
            <Icon name="close" size={18} />
          </Button>
        </div>
        <div className="tw-modal-body">{children}</div>
        {footer && <div className="tw-modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
