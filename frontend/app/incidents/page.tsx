import dynamic from "next/dynamic";
import { AlertBanner } from "../../components/ui/AlertBanner";
import { Button } from "../../components/ui/Button";
import { Card, CardBody, CardCaption, CardHeader, CardHeaderMeta, CardTitle } from "../../components/ui/Card";
import { DisclaimerBanner } from "../../components/ui/DisclaimerBanner";
import IncidentTable from "./IncidentTable";
import styles from "./incidents.module.css";

const IncidentMap = dynamic(() => import("./IncidentMap"), {
  ssr: false,
});

type IncidentsPageProps = {
  searchParams?: {
    district?: string | string[];
  };
};

export default function IncidentsPage({ searchParams }: IncidentsPageProps) {
  const districtParam = searchParams?.district;
  const initialDistrict =
    typeof districtParam === "string" ? districtParam : Array.isArray(districtParam) ? districtParam[0] || "" : "";

  return (
    <main className="page-shell">
      <div className="page-header">
        <div>
          <div className="page-kicker">Incident Intelligence</div>
          <h1 className="page-title">Verified incident signals and district-level evidence</h1>
          <p className="page-subtitle">
            Curated source-backed incidents mapped to districts, designed for analysts who need fast signal review and escalation context.
          </p>
        </div>
        <div className="page-actions">
          <Button type="button" variant="secondary">Export report</Button>
        </div>
      </div>

      <AlertBanner
        variant="info"
        title="Suppression-aware signal surface"
        description="This view highlights verified sources and aggregate patterns for campaign planning, not clinical interpretation."
      />

      <div className="dashboard-grid">
        <div className="grid-span-12">
          <Card variant="elevated">
            <CardHeader>
              <CardHeaderMeta>
                <CardTitle>Incident map</CardTitle>
                <CardCaption>District-linked incident markers over a premium dark basemap with overlap-aware point jittering.</CardCaption>
              </CardHeaderMeta>
            </CardHeader>
            <CardBody>
              <IncidentMap />
            </CardBody>
          </Card>
        </div>

        <div className="grid-span-12">
          <Card variant="default">
            <CardHeader>
              <CardHeaderMeta>
                <CardTitle>Incident review table</CardTitle>
                <CardCaption>
                  Verified incident list from <code>/public/data</code>, sourced from direct newspaper links. Current
                  source-backed coverage spans 2016 to 2024.
                </CardCaption>
              </CardHeaderMeta>
            </CardHeader>
            <CardBody>
              <IncidentTable initialDistrict={initialDistrict} />
            </CardBody>
          </Card>
        </div>
      </div>

      <DisclaimerBanner>
        This is an informational tool only. It does not provide medical advice. Use verified public-health guidance and emergency protocols for acute response decisions.
      </DisclaimerBanner>
    </main>
  );
}
