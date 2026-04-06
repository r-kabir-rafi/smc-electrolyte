import type { ReactNode } from "react";
import styles from "./ui.module.css";

type CardProps = {
  children: ReactNode;
  className?: string;
  variant?: "default" | "elevated" | "accent";
};

export function Card({ children, className = "", variant = "default" }: CardProps) {
  const variantClass =
    variant === "accent" ? styles.cardAccent : variant === "elevated" ? styles.cardElevated : "";
  return <section className={`${styles.card} ${variantClass} ${className}`.trim()}>{children}</section>;
}

export function CardHeader({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`${styles.cardHeader} ${className}`.trim()}>{children}</div>;
}

export function CardHeaderMeta({ children }: { children: ReactNode }) {
  return <div className={styles.cardHeaderMeta}>{children}</div>;
}

export function CardTitle({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <h3 className={`${styles.cardTitle} ${className}`.trim()}>{children}</h3>;
}

export function CardCaption({ children }: { children: ReactNode }) {
  return <p className={styles.cardCaption}>{children}</p>;
}

export function CardActions({ children }: { children: ReactNode }) {
  return <div className={styles.cardActions}>{children}</div>;
}

export function CardBody({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`${styles.cardBody} ${className}`.trim()}>{children}</div>;
}

export function CardFooter({ children }: { children: ReactNode }) {
  return <div className={styles.cardFooter}>{children}</div>;
}
