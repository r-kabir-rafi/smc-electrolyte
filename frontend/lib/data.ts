import Papa from "papaparse";

export type IncidentRecord = {
  id: string;
  reporting_date: string;
  incident_date: string;
  district: string;
  dead: number;
  sick: number;
  casualties: number;
  place: string;
  description: string;
  source_name: string;
  source_url: string;
};

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function toNumber(value: string | number | undefined): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (!value) return 0;
  const parsed = Number.parseFloat(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function dedupeIncidents(rows: IncidentRecord[]): IncidentRecord[] {
  const seen = new Set<string>();
  const deduped: IncidentRecord[] = [];

  for (const row of rows) {
    const key = [
      normalizeText(row.reporting_date),
      normalizeText(row.incident_date),
      normalizeText(row.district),
      String(row.dead || 0),
      String(row.sick || 0),
      String(row.casualties || 0),
      normalizeText(row.place),
      normalizeText(row.description),
      normalizeText(row.source_name),
      normalizeText(row.source_url).replace(/\/+$/, ""),
    ].join("|");

    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }

  return deduped;
}

export async function loadIncidentsCsv(): Promise<IncidentRecord[]> {
  const response = await fetch("/data/heatstroke_incidents.csv", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load incidents CSV (${response.status})`);
  }

  const text = await response.text();
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.errors.length > 0) {
    throw new Error(parsed.errors[0]?.message || "Failed to parse CSV.");
  }

  const mapped = parsed.data.map((row, index) => {
    const dead = toNumber(row.dead ?? row.deaths ?? row.fatalities ?? row.casualties);
    const sick = toNumber(
      row.sick ?? row.injured ?? row.hospitalized ?? row.hospitalised ?? row.ill
    );

    return {
      id: row.id?.trim() || String(index + 1),
      reporting_date: row.reporting_date?.trim() || "",
      incident_date: row.incident_date?.trim() || "",
      district: row.district?.trim() || "",
      dead,
      sick,
      casualties: dead + sick,
      place: row.place?.trim() || "",
      description: row.description?.trim() || "",
      source_name: row.source_name?.trim() || "",
      source_url: row.source_url?.trim() || "",
    };
  });

  return dedupeIncidents(mapped);
}

export function exportIncidentsCsv(rows: IncidentRecord[]): string {
  return Papa.unparse(
    rows.map((row) => ({
      id: row.id,
      reporting_date: row.reporting_date,
      incident_date: row.incident_date,
      district: row.district,
      dead: row.dead,
      sick: row.sick,
      casualties: row.casualties,
      place: row.place,
      description: row.description,
      source_name: row.source_name,
      source_url: row.source_url,
    }))
  );
}
