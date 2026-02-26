import dynamic from "next/dynamic";
import IncidentTable from "./IncidentTable";
import styles from "./incidents.module.css";

const IncidentMap = dynamic(() => import("./IncidentMap"), {
  ssr: false,
});

export default function IncidentsPage() {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Heatstroke Incidents (News Reports)</h1>
      <p className={styles.subtitle}>
        Filterable and sortable incident list sourced from CSV in <code>/public/data</code>.
      </p>
      <IncidentMap />
      <IncidentTable />
    </main>
  );
}
