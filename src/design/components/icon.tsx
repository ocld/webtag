import React from "react";

export interface IconProps {
  name: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function Icon({ name, size = 18, className = "", style }: IconProps) {
  return (
    <span
      className={`material-symbols-outlined wt-icon ${className}`}
      style={{ fontSize: size, ...style }}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}
