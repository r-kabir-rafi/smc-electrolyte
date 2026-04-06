import styles from "./ui.module.css";

export function getTierLabel(tier: number): string {
  if (tier <= 0) return "Minimal";
  if (tier === 1) return "Low";
  if (tier === 2) return "Moderate";
  if (tier === 3) return "High";
  return "Extreme";
}

export function TierBadge({
  tier,
  showLabel = true,
  size = "md",
}: {
  tier: number;
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  const tierClass = styles[`tier${Math.max(0, Math.min(4, tier))}` as keyof typeof styles];
  const sizeClass = size === "sm" ? styles.tierSm : size === "lg" ? styles.tierLg : "";

  return (
    <span className={`${styles.tierBadge} ${tierClass} ${sizeClass}`.trim()}>
      <span>T{tier}</span>
      {showLabel ? <span>{getTierLabel(tier)} Risk</span> : null}
    </span>
  );
}
