import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { AlertBanner } from "../../components/ui/AlertBanner";
import { Button } from "../../components/ui/Button";
import { DisclaimerBanner } from "../../components/ui/DisclaimerBanner";

const HistoryClient = dynamic(() => import("./HistoryClient"), {
  ssr: false,
  loading: () => <div className="page-shell"><div className="skeleton" style={{ height: "36rem" }} /></div>,
});

export const metadata: Metadata = {
  title: "Forecasts | HeatOps",
  description: "District-level weather history and scenario forecasting dashboard.",
};

export default function HistoryPage() {
  return (
    <main className="page-shell">
      <div className="page-header">
        <div>
          <div className="page-kicker">Forecasts</div>
          <h1 className="page-title">Scenario forecasting with historical context</h1>
          <p className="page-subtitle">
            Explore district-level weather history, anomaly context, and scenario playback tuned for planning and activation workflows.
          </p>
        </div>
        <div className="page-actions">
          <Button type="button" variant="secondary">Switch vintage</Button>
        </div>
      </div>

      <AlertBanner
        variant="info"
        title="Scenario playback surface"
        description="Historical reanalysis is used here as the trusted baseline. Use this view for planning context, not medical interpretation."
      />
      <HistoryClient />

      <DisclaimerBanner>
        This is an informational tool only. It does not provide medical advice. Heat-related response actions should follow official emergency and public-health guidance.
      </DisclaimerBanner>
    </main>
  );
}
