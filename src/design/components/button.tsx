import React from "react";
import { playTick } from "../sound";

export type ButtonVariant = "default" | "primary" | "ghost" | "danger" | "subtle-blue";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconOnly?: boolean;
  spinOnHover?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "default",
      size = "md",
      iconOnly = false,
      spinOnHover = false,
      className = "",
      onClick,
      type = "button",
      children,
      ...props
    },
    ref
  ) => {
    const classes = [
      "tw-btn",
      variant !== "default" ? `tw-btn--${variant}` : "",
      size !== "md" ? `tw-btn--${size}` : "",
      iconOnly ? "tw-btn--icon" : "",
      spinOnHover ? "tw-hover-spin" : "",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <button
        ref={ref}
        type={type}
        className={classes}
        onClick={(e) => {
          playTick(variant === "primary" ? "pop" : "click");
          onClick?.(e);
        }}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
