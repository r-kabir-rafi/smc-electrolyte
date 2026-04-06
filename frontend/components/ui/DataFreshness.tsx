"use client";

import { useState } from "react";

import { ChevronRightIcon, RefreshIcon } from "../icons";
import { Button } from "./Button";
import styles from "./ui.module.css";

export type FreshnessItem = {
  source: string;
  lastRun: string;
  status: "ok" | "warning" | "critical";
};

export function DataFreshness({
  items,
  compact = false,
}: {
  items: FreshnessItem[];
  compact?: boolean;
}) {
  const [expanded, setExpanded] = useState(!compact);
  const overall = items.some((item) => item.status === "critical")
    ? "critical"
    : items.some((item) => item.status === "warning")
      ? "warning"
      : "ok";
  const dotClass =
    overall === "critical"
      ? styles.freshnessCritical
      : overall === "warning"
        ? styles.freshnessWarning
        : styles.freshnessOk;

  return (
    <div className={styles.freshness}>
      <div className={styles.freshnessHeader}>
        <span className={styles.freshnessLabel}>
          <span className={`${styles.freshnessDot} ${dotClass}`.trim()} />
          <span>{items[0] ? `Updated ${items[0].lastRun}` : "Status unavailable"}</span>
        </span>
        <Button
          aria-label={expanded ? "Collapse data freshness" : "Expand data freshness"}
          iconOnly
          type="button"
          variant="ghost"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? <RefreshIcon width={14} height={14} /> : <ChevronRightIcon width={14} height={14} />}
        </Button>
      </div>
      {expanded ? (
        <div className={styles.freshnessList}>
          {items.map((item) => {
            const statusClass =
              item.status === "critical"
                ? styles.freshnessCritical
                : item.status === "warning"
                  ? styles.freshnessWarning
                  : styles.freshnessOk;
            return (
              <div key={item.source} className={styles.freshnessRow}>
                <span>{item.source}</span>
                <span className={styles.freshnessMeta}>
                  <span className={`${styles.freshnessDot} ${statusClass}`.trim()} />
                  <span>{item.lastRun}</span>
                </span>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
