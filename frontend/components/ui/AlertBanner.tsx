import type { ReactNode } from "react";

import { Button } from "./Button";
import styles from "./ui.module.css";

export function AlertBanner({
  variant,
  eyebrow,
  leading,
  title,
  description,
  action,
  dismissible = false,
  onDismiss,
}: {
  variant: "warning" | "critical" | "info" | "success";
  eyebrow?: ReactNode;
  leading?: ReactNode;
  title: ReactNode;
  description: ReactNode;
  action?: ReactNode;
  dismissible?: boolean;
  onDismiss?: () => void;
}) {
  const variantClass =
    variant === "critical"
      ? styles.alertCritical
      : variant === "warning"
        ? styles.alertWarning
        : variant === "success"
          ? styles.alertSuccess
          : styles.alertInfo;

  return (
    <div className={`${styles.alert} ${variantClass}`.trim()}>
      {leading ? <div className={styles.alertLeading}>{leading}</div> : null}
      <div className={styles.alertContent}>
        {eyebrow ? <div className={styles.alertEyebrow}>{eyebrow}</div> : null}
        <strong className={styles.alertTitle}>{title}</strong>
        <p className={styles.alertDescription}>{description}</p>
      </div>
      <div style={{ display: "inline-flex", alignItems: "center", gap: "0.55rem" }}>
        {action}
        {dismissible ? (
          <Button aria-label="Dismiss alert" iconOnly variant="ghost" onClick={onDismiss} type="button">
            ×
          </Button>
        ) : null}
      </div>
    </div>
  );
}
