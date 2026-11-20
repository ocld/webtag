import React from "react";

export interface SurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: "a" | "b" | "c" | "glass";
  elevated?: boolean;
}

export const Surface = React.forwardRef<HTMLDivElement, SurfaceProps>(
  ({ tone = "b", elevated = false, className = "", children, ...props }, ref) => {
    const classes = [
      "tw-surface",
      tone !== "b" ? `tw-surface--${tone}` : "",
      elevated ? "tw-surface--elevated" : "",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <div ref={ref} className={classes} {...props}>
        {children}
      </div>
    );
  }
);

Surface.displayName = "Surface";
