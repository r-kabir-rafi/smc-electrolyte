import AnalysisDashboard from "../components/analysis-dashboard";
import BoundaryMap from "../components/boundary-map";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export default async function Home() {
  let health = "unreachable";
  try {
    const res = await fetch(`${API_BASE}/health`, { cache: "no-store" });
    if (res.ok) {
      const payload = (await res.json()) as { status?: string };
      health = payload.status ?? "unknown";
    }
  } catch {
    health = "unreachable";
  }

  return (
    <main>
      <div className="badge">Phase 7 Exposure + Mobility</div>
      <h1>Bangladesh Heatwave Risk Map</h1>
      <p>
        Timeline-enabled district choropleth with daily/weekly heatwave intensity categories.
      </p>

      <section className="card">
        <strong>Backend health:</strong> {health}
      </section>

      <section className="map-shell">
        <BoundaryMap />
      </section>

      <AnalysisDashboard />
    </main>
  );
}
