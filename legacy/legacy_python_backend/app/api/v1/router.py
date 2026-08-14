from fastapi import APIRouter

from app.api.v1.routes import (
    auth,
    capa,
    checkpoints,
    clients,
    controls,
    dashboard,
    departments,
    employees,
    evidence,
    frameworks,
    gaps,
    kpi_actuals,
    kpi_targets,
    kpis,
    lookups,
    permissions,
    policy_register,
    risks,
    roles,
    users,
)


api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(clients.router)
api_router.include_router(users.router)
api_router.include_router(roles.router)
api_router.include_router(permissions.router)
api_router.include_router(departments.router)
api_router.include_router(employees.router)
api_router.include_router(frameworks.router)
api_router.include_router(controls.router)
api_router.include_router(checkpoints.router)
api_router.include_router(kpis.router)
api_router.include_router(kpi_targets.router)
api_router.include_router(kpi_actuals.router)
api_router.include_router(policy_register.router)
api_router.include_router(evidence.router)
api_router.include_router(gaps.router)
api_router.include_router(capa.router)
api_router.include_router(risks.router)
api_router.include_router(lookups.router)
api_router.include_router(dashboard.router)
