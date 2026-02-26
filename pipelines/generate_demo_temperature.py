"""Generate demo daily Tmax NetCDF for Bangladesh-like coordinates.

This is a fallback dataset for local development when public download is unavailable.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
import xarray as xr

OUT = Path("data_raw/temperature/demo_tmax_2025.nc")


def main() -> None:
    rng = np.random.default_rng(42)
    times = pd.date_range("2025-03-01", "2025-06-30", freq="D")
    lats = np.linspace(21.8, 25.5, 16)
    lons = np.linspace(89.5, 92.5, 14)

    lat_grid, lon_grid = np.meshgrid(lats, lons, indexing="ij")
    spatial = (lat_grid - 23.5) * 0.8 + (lon_grid - 90.8) * 0.4

    tmax = np.empty((len(times), len(lats), len(lons)), dtype=np.float32)
    for idx, t in enumerate(times):
        doy = t.timetuple().tm_yday
        seasonal = 6.0 * np.sin((doy - 90) * (2 * np.pi / 365.0))
        noise = rng.normal(0.0, 1.0, size=spatial.shape)
        tmax[idx] = 33.5 + seasonal + spatial + noise

    ds = xr.Dataset(
        data_vars={
            "tmax": (("time", "lat", "lon"), tmax),
        },
        coords={"time": times, "lat": lats, "lon": lons},
        attrs={
            "title": "Demo Bangladesh Tmax",
            "units": "degC",
            "source": "synthetic fallback",
        },
    )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    ds.to_netcdf(OUT)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
