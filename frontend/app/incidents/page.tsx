import dynamic from "next/dynamic";
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
    <main className={styles.page}>
      <h1 className={styles.title}>Heatstroke Incidents (News Reports)</h1>
      <p className={styles.subtitle}>
        Filterable and sortable incident list sourced from CSV in <code>/public/data</code>.
      </p>
      <IncidentMap />
      <IncidentTable initialDistrict={initialDistrict} />
    </main>
  );
}
