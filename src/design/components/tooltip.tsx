import React from "react";

export interface TooltipProps {
  label: React.ReactNode;
  placement?: "top" | "bottom";
  children: React.ReactNode;
}

export function Tooltip({ label, placement = "top", children }: TooltipProps) {
  return (
    <span className="tw-tooltip-host">
      {children}
      <span
        className={`tw-tooltip ${placement === "bottom" ? "tw-tooltip--bottom" : ""}`}
        role="tooltip"
      >
        {label}
      </span>
    </span>
  );
}
