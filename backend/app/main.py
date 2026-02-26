from fastapi import FastAPI

from app.api.admin import router as admin_router
from app.api.analysis import router as analysis_router
from app.api.exposure import router as exposure_router
from app.api.forecast import router as forecast_router
from app.api.health import router as health_router
from app.api.heatwave import router as heatwave_router
from app.api.smc import router as smc_router
from app.core.config import settings

app = FastAPI(title=settings.app_name, version=settings.app_version)
app.include_router(health_router)
app.include_router(heatwave_router, prefix="/api/v1")
app.include_router(admin_router, prefix="/api/v1")
app.include_router(analysis_router, prefix="/api/v1")
app.include_router(forecast_router, prefix="/api/v1")
app.include_router(exposure_router, prefix="/api/v1")
app.include_router(smc_router, prefix="/api/v1")


@app.get("/")
def root() -> dict[str, str]:
    return {
        "message": "SMC Heatwave Risk API",
        "docs": "/docs",
    }
