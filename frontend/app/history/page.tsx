import type { Metadata } from "next";
import dynamic from "next/dynamic";
import styles from "./history.module.css";

const HistoryClient = dynamic(() => import("./HistoryClient"), {
  ssr: false,
  loading: () => <div className={styles.placeholder}>Loading weather history dashboard...</div>,
});

export const metadata: Metadata = {
  title: "Weather History | Bangladesh Heatwave Monitor",
  description: "Historical weather data timeline and charts for Bangladesh districts since 2010.",
};

export default function HistoryPage() {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Weather History (2010 - Today)</h1>
      <p className={styles.subtitle}>
        Historical daily weather data for Bangladesh districts, 
        powered by the Open-Meteo API (ERA5). Use the timeline to explore past weather.
      </p>
      <HistoryClient />
    </main>
  );
}
