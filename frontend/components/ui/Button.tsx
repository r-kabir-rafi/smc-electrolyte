import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./ui.module.css";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  iconOnly?: boolean;
};

export function Button({
  children,
  className = "",
  variant = "secondary",
  iconOnly = false,
  ...props
}: ButtonProps) {
  const variantClass =
    variant === "primary" ? styles.primary : variant === "ghost" ? styles.ghost : styles.secondary;
  const iconOnlyClass = iconOnly ? styles.iconOnly : "";
  return (
    <button
      {...props}
      className={`${styles.button} ${variantClass} ${iconOnlyClass} ${className}`.trim()}
    >
      {children}
    </button>
  );
}
