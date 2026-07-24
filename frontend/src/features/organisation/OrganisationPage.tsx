import { MapPin, Network } from "lucide-react";
import { useMemo, useState } from "react";
import { ErrorState, LoadingState } from "../../components/feedback/AsyncState";
import { Badge } from "../../components/feedback/Badge";
import { PageHeader } from "../../components/feedback/PageHeader";
import { SearchToolbar } from "../../components/forms/SearchToolbar";
import { DataTable, type Column } from "../../components/tables/DataTable";
import { useAuth } from "../../context/AuthContext";
import { useTenant } from "../../context/TenantContext";
import { useToast } from "../../context/ToastContext";
import { useApiResource } from "../../hooks/useApiResource";
import { masterDataApi } from "../../services/masterDataApi";
import type { Department, Location, OrganisationUnit } from "../../types/api";

type Kind = "departments" | "locations" | "units";
type Row = Department | Location | OrganisationUnit;

const settings = {
  departments: { title: "Department Setup", description: "Maintain Company-scoped departments, ownership and operational structure.", singular: "Department", loader: masterDataApi.listDepartments },
  locations: { title: "Location Setup", description: "Manage operational and compliance locations across Location 001.", singular: "Location", loader: masterDataApi.listLocations },
  units: { title: "Organisation Units", description: "Maintain Company-scoped organisation units and reporting structure.", singular: "Organisation Unit", loader: masterDataApi.listUnits },
} as const;

const isDepartment = (row: Row): row is Department => "headName" in row;
const isLocation = (row: Row): row is Location => "city" in row;

export function OrganisationPage({ kind }: { kind: Kind }) {
  const config = settings[kind];
  const { user } = useAuth();
  const { contextVersion } = useTenant();
  const { showToast } = useToast();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All Statuses");
  const resource = useApiResource<Row[]>(config.loader, [contextVersion, user?.activeCompany.id, kind]);
  const rows = useMemo(() => (resource.data ?? []).filter((entry) => {
    const text = Object.values(entry).filter((value) => typeof value === "string").join(" ").toLowerCase();
    return (!search || text.includes(search.toLowerCase())) && (status === "All Statuses" || entry.status === status);
  }), [resource.data, search, status]);
  const columns: Column<Row>[] = [
    { key: "code", label: `${config.singular} Code`, render: (row) => <span className="mono link-text">{row.code}</span> },
    { key: "name", label: `${config.singular} Name`, render: (row) => <strong>{row.name}</strong> },
    ...(kind === "departments" ? [{ key: "head", label: "Department Head", render: (row: Row) => isDepartment(row) ? row.headName ?? "—" : "—" }] : []),
    ...(kind === "locations" ? [
      { key: "city", label: "City / State", render: (row: Row) => isLocation(row) ? [row.city, row.state].filter(Boolean).join(" · ") || "—" : "—" },
      { key: "country", label: "Country", render: (row: Row) => isLocation(row) ? row.country ?? "—" : "—" },
      { key: "type", label: "Type", render: (row: Row) => isLocation(row) ? row.type ?? "—" : "—" },
    ] : []),
    { key: "status", label: "Status", render: (row) => <Badge>{row.status}</Badge> },
  ];
  const Icon = kind === "locations" ? MapPin : Network;
  return <div className="page"><PageHeader title={config.title} section="Admin" description={config.description} connected primaryLabel={`Add ${config.singular}`} onPrimary={() => showToast("info", "Read-only in Milestone 1", `${config.singular} write APIs are scheduled for the next backend milestone.`)} />
    <SearchToolbar value={search} onChange={setSearch} placeholder={`Search ${config.title.toLowerCase()}…`} status={status} onStatusChange={setStatus} />
    {resource.loading ? <LoadingState /> : resource.error ? <ErrorState error={resource.error} /> : <DataTable rows={rows} columns={columns} caption={config.title} companyName={user?.activeCompany.name} onView={(row) => showToast("info", row.name, `${row.code} is database-authoritative for ${user?.activeCompany.name}.`)} />}
    <section className="card information-card"><span className="feature-icon tone-blue"><Icon size={19} /></span><div><strong>Active Company scope</strong><p>Only records belonging to {user?.activeCompany.name} are returned by this endpoint.</p></div></section>
  </div>;
}
