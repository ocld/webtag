import React from "react";

export interface FieldProps {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}

export function Field({ label, hint, htmlFor, className = "", children }: FieldProps) {
  return (
    <div className={`tw-field ${className}`}>
      {(label || hint) && (
        <div className="tw-field-head">
          {label && (
            <label className="tw-label" htmlFor={htmlFor}>
              {label}
            </label>
          )}
          {hint && <span className="tw-label" style={{ opacity: 0.72 }}>{hint}</span>}
        </div>
      )}
      {children}
    </div>
  );
}

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  mono?: boolean;
  mixed?: boolean;
  dirty?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ mono = false, mixed = false, dirty = false, className = "", ...props }, ref) => {
    const classes = [
      "tw-input",
      mono ? "tw-input--mono" : "",
      mixed ? "tw-input--mixed" : "",
      dirty ? "tw-input--dirty" : "",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    return <input ref={ref} className={classes} {...props} />;
  }
);
Input.displayName = "Input";

export interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  mono?: boolean;
  mixed?: boolean;
  dirty?: boolean;
}

export const TextArea = React.forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ mono = false, mixed = false, dirty = false, className = "", ...props }, ref) => {
    const classes = [
      "tw-textarea",
      mono ? "tw-textarea--mono" : "",
      mixed ? "tw-input--mixed" : "",
      dirty ? "tw-input--dirty" : "",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    return <textarea ref={ref} className={classes} {...props} />;
  }
);
TextArea.displayName = "TextArea";
