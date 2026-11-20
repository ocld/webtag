import React from "react";

export type BadgeTone = "neutral" | "blue" | "success" | "warn" | "danger";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export function Badge({ tone = "neutral", className = "", children, ...props }: BadgeProps) {
  return (
    <span
      className={`tw-badge ${tone !== "neutral" ? `tw-badge--${tone}` : ""} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}

export function Kbd({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <kbd className={`tw-kbd ${className}`}>{children}</kbd>;
}

export function Led({
  tone = "blue",
  blink = false,
  className = "",
}: {
  tone?: "blue" | "success" | "warn";
  blink?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={[
        "tw-led",
        tone !== "blue" ? `tw-led--${tone}` : "",
        blink ? "tw-led--blink" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
}
