import type { ReactNode } from "react";

import styles from "./ui.module.css";

export function Tooltip({
  content,
  children,
}: {
  content: ReactNode;
  children: ReactNode;
}) {
  return (
    <span className={styles.tooltipWrap} tabIndex={0}>
      {children}
      <span className={styles.tooltipBubble} role="tooltip" aria-live="polite">
        {content}
      </span>
    </span>
  );
}
