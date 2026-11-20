import React from "react";
import { Icon } from "./icon";

export interface DetailsProps {
  summary: React.ReactNode;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function Details({ summary, badge, defaultOpen = false, className = "", children }: DetailsProps) {
  return (
    <details className={`tw-details ${className}`} open={defaultOpen}>
      <summary>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          {summary}
          {badge}
        </span>
        <Icon name="expand_more" size={18} className="tw-details-chevron" />
      </summary>
      <div className="tw-details-body">{children}</div>
    </details>
  );
}
