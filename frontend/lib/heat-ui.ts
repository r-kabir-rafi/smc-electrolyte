export function getTierFromTemperature(value?: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value! < 30) return 0;
  if (value! < 32) return 1;
  if (value! < 34) return 2;
  if (value! < 36) return 3;
  return 4;
}

export function getTierColor(value?: number): string {
  const tier = getTierFromTemperature(value);
  if (tier === 0) return "var(--tier-0)";
  if (tier === 1) return "var(--tier-1)";
  if (tier === 2) return "var(--tier-2)";
  if (tier === 3) return "var(--tier-3)";
  return "var(--tier-4)";
}

export function estimateTierProbability(value?: number): number {
  if (!Number.isFinite(value)) return 0;
  const normalized = (value! - 33.5) / 1.8;
  return Math.max(0.02, Math.min(0.99, 1 / (1 + Math.exp(-normalized))));
}

export function formatTemperature(value?: number): string {
  if (!Number.isFinite(value)) return "N/A";
  return `${value!.toFixed(1)}°C`;
}

export function formatPercent(value?: number): string {
  if (!Number.isFinite(value)) return "N/A";
  return `${Math.round((value ?? 0) * 100)}%`;
}

export function trendDirection(delta: number): "up" | "down" | "neutral" {
  if (delta > 0.5) return "up";
  if (delta < -0.5) return "down";
  return "neutral";
}
