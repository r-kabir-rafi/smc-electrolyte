import type { ReactNode } from "react";

import styles from "./ui.module.css";
import { Card, CardBody, CardHeader } from "./Card";

type TrendDirection = "up" | "down" | "neutral";
type TrendSentiment = "good" | "bad" | "neutral";

export function StatCard({
  label,
  value,
  trend,
  trendDirection,
  trendSentiment,
  icon,
  accentColor,
  className = "",
}: {
  label: string;
  value: string;
  trend: string;
  trendDirection: TrendDirection;
  trendSentiment: TrendSentiment;
  icon: ReactNode;
  accentColor: string;
  className?: string;
}) {
  const trendClass =
    trendSentiment === "good"
      ? styles.trendGood
      : trendSentiment === "bad"
        ? styles.trendBad
        : styles.trendNeutral;
  const trendArrow = trendDirection === "up" ? "↑" : trendDirection === "down" ? "↓" : "→";

  return (
    <Card className={`${styles.statCard} ${className}`.trim()} variant="elevated">
      <span className={styles.statAccent} style={{ backgroundColor: accentColor }} aria-hidden />
      <CardHeader>
        <div>
          <p className={styles.statLabel}>{label}</p>
          <div className={styles.statValue}>{value}</div>
        </div>
        <div style={{ color: "var(--text-tertiary)" }}>{icon}</div>
      </CardHeader>
      <CardBody>
        <div className={styles.statMeta}>
          <span className={`${styles.trend} ${trendClass}`.trim()}>
            <span aria-hidden>{trendArrow}</span>
            <span>{trend}</span>
          </span>
        </div>
      </CardBody>
    </Card>
  );
}
