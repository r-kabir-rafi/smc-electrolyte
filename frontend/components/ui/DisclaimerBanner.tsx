import type { ReactNode } from "react";

import { AlertTriangleIcon } from "../icons";
import styles from "./ui.module.css";

export function DisclaimerBanner({ children }: { children: ReactNode }) {
  return (
    <div className={styles.disclaimer}>
      <AlertTriangleIcon width={16} height={16} />
      <div>{children}</div>
    </div>
  );
}
