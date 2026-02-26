# Population Exposure and Mobility Proxy (Phase 7)

## Population density layer
Inputs:
- District boundaries (`data_processed/bd_admin_district.geojson`)
- Public-feasible urban center priors for Bangladesh major cities

Method:
1. Create gridded density surface over Bangladesh bbox.
2. Write raster output: `data_processed/pop_density.tif` (+ `.tfw`/`.prj` sidecars).
3. Aggregate cell-level density to district totals and mean density.

Outputs:
- `data_processed/pop_density.tif`
- `data_processed/pop_density_admin.parquet`
- `data_processed/pop_density_district.geojson`

## Mobility intensity proxy
When direct mobility traces are unavailable, proxy combines:
- Road-network density proxy (`road_network_density_proxy`)
- Transport hub proxy (`transport_hub_proxy`)
- Commuter intensity proxy (`commuter_intensity_proxy` from adjacency + population)

Final score:
- `movement_intensity_proxy`
- Ranked as `movement_rank` (1 = highest)

Output:
- `data_processed/mobility_proxy.parquet`
