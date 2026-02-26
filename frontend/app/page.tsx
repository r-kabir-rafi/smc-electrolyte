import AnalysisDashboard from "../components/analysis-dashboard";
import MapWrapper from "../components/map-wrapper";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

type Hotspot = {
  district_code: string;
  district_name: string;
  tmax_c: number;
  intensity_category: string;
};

type HeatwaveSummary = {
  as_of_date?: string;
  district_hotspots?: Hotspot[];
};

const intensityColor: Record<string, string> = {
  extreme: "#dc2626",
  high: "#fb923c",
  watch: "#d97706",
  none: "#9ca3af",
};

export default async function Home() {
  let health = "unreachable";
  let summary: HeatwaveSummary = {};
  try {
    const [healthRes, summaryRes] = await Promise.all([
      fetch(`${API_BASE}/health`, { cache: "no-store" }),
      fetch(`${API_BASE}/api/v1/heatwave/summary`, { cache: "no-store" }),
    ]);
    if (healthRes.ok) {
      const payload = (await healthRes.json()) as { status?: string };
      health = payload.status ?? "unknown";
    }
    if (summaryRes.ok) {
      summary = (await summaryRes.json()) as HeatwaveSummary;
    }
  } catch {
    health = "unreachable";
  }

  const hotspots = summary.district_hotspots ?? [];
  const extremeCount = hotspots.filter((h) => h.intensity_category === "extreme").length;
  const highCount = hotspots.filter((h) => h.intensity_category === "high").length;

  return (
    <main>
      <div style={{ marginBottom: "1.5rem" }}>
        <h1>Bangladesh Heatwave Risk Dashboard</h1>
        <p style={{ color: "#64748b", margin: 0, fontSize: "0.95rem" }}>
          Real-time district heatwave intensity · 7-day forecast · Population exposure · SMC activation priority
        </p>
      </div>

      {/* Summary stats bar */}
      {hotspots.length > 0 && (
        <section style={{
          background: "linear-gradient(135deg, #fff9f5 0%, #fff7ed 50%, #fffbf5 100%)",
          border: "1px solid #fed7aa",
          borderRadius: "0.75rem",
          padding: "1.25rem 1.5rem",
          marginBottom: "1.25rem",
        }}>
          <div style={{ display: "flex", gap: "2.5rem", flexWrap: "wrap", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: "0.7rem", fontWeight: 600, color: "#92400e", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "0.3rem" }}>
                As of date
              </div>
              <div style={{ fontWeight: 700, fontSize: "1.35rem", color: "#0f172a" }}>{summary.as_of_date ?? "N/A"}</div>
            </div>
            {extremeCount > 0 && (
              <div>
                <div style={{ fontSize: "0.7rem", fontWeight: 600, color: "#92400e", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "0.3rem" }}>
                  Extreme
                </div>
                <div style={{ fontWeight: 700, fontSize: "1.35rem", color: "#dc2626" }}>{extremeCount} districts</div>
              </div>
            )}
            {highCount > 0 && (
              <div>
                <div style={{ fontSize: "0.7rem", fontWeight: 600, color: "#92400e", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "0.3rem" }}>
                  High Heat
                </div>
                <div style={{ fontWeight: 700, fontSize: "1.35rem", color: "#ea580c" }}>{highCount} districts</div>
              </div>
            )}
            <div style={{ flex: 1, minWidth: "280px" }}>
              <div style={{ fontSize: "0.7rem", fontWeight: 600, color: "#92400e", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "0.5rem" }}>
                Top Hotspot Districts
              </div>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                {hotspots.slice(0, 6).map((h) => (
                  <span key={h.district_code} style={{
                    background: intensityColor[h.intensity_category] ?? "#9ca3af",
                    color: "#fff",
                    borderRadius: "999px",
                    padding: "0.3rem 0.75rem",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
                  }}>
                    {h.district_name} · {h.tmax_c.toFixed(1)}°C
                  </span>
                ))}
              </div>
            </div>
            <div style={{
              fontSize: "0.8rem",
              fontWeight: 500,
              color: health === "ok" ? "#059669" : "#dc2626",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              padding: "0.4rem 0.8rem",
              background: health === "ok" ? "#d1fae5" : "#fee2e2",
              borderRadius: "999px",
            }}>
              API: {health}
            </div>
          </div>
        </section>
      )}

      <section className="card" style={{ padding: "0", overflow: "hidden" }}>
        <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid #e2e8f0", background: "linear-gradient(180deg, #f8fafc 0%, #fff 100%)" }}>
          <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 600 }}>Heatwave Intensity Map</h2>
        </div>
        <div style={{ padding: "1rem" }}>
          <MapWrapper />
        </div>
      </section>

      <AnalysisDashboard />
    </main>
  );
}
