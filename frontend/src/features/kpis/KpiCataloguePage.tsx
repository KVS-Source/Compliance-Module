import { ListChecks } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ErrorState, LoadingState } from "../../components/feedback/AsyncState";
import { Badge } from "../../components/feedback/Badge";
import { PageHeader } from "../../components/feedback/PageHeader";
import { DataTable, type Column } from "../../components/tables/DataTable";
import { useAuth } from "../../context/AuthContext";
import { useTenant } from "../../context/TenantContext";
import { useApiResource } from "../../hooks/useApiResource";
import { kpiCatalogueApi } from "../../services/submissionApi";
import type { KpiCatalogueEntry } from "../../types/api";

const humanise = (code: string) =>
  code
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const CONFIGURATION_LABEL: Record<KpiCatalogueEntry["configurationStatus"], string> =
  {
    ACTIVE: "Configured",
    CONFIGURED_INACTIVE: "Configured (inactive)",
    NOT_CONFIGURED: "Not configured",
  };

/**
 * The KPI Catalogue.
 *
 * A definition this Company has never configured is still listed, marked
 * "Not configured", because hiding it would misrepresent the catalogue the
 * platform offers. Columns the schema does not carry — a perspective, or a
 * framework at definition level — print "—" rather than a guess.
 */
export function KpiCataloguePage({ mode = "catalogue" }: { mode?: "catalogue" | "master" }) {
  const { user } = useAuth();
  const { contextVersion } = useTenant();
  const [search, setSearch] = useState("");
  const [frequency, setFrequency] = useState("");
  const [configuration, setConfiguration] = useState("");
  const resource = useApiResource(kpiCatalogueApi.catalogue, [
    contextVersion,
    user?.activeCompany.id,
  ]);
  const all = useMemo(() => resource.data ?? [], [resource.data]);

  const frequencies = useMemo(
    () => [...new Set(all.map((row) => row.frequency))].sort(),
    [all],
  );

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return all.filter(
      (row) =>
        (!query ||
          `${row.code} ${row.name} ${row.unit} ${row.description ?? ""}`
            .toLowerCase()
            .includes(query)) &&
        (!frequency || row.frequency === frequency) &&
        (!configuration || row.configurationStatus === configuration),
    );
  }, [all, configuration, frequency, search]);

  const catalogueColumns: Column<KpiCatalogueEntry>[] = [
    {
      key: "code",
      label: "Code",
      render: (row) => <span className="mono link-text">{row.code}</span>,
    },
    {
      key: "name",
      label: "KPI",
      render: (row) => (
        <span className="list-row-copy">
          <strong>{row.name}</strong>
          {row.description ? <span>{row.description}</span> : null}
        </span>
      ),
    },
    {
      key: "perspective",
      label: "Category / Perspective",
      // Not carried by kpi_definitions in this schema.
      render: (row) => row.perspective ?? "—",
    },
    { key: "unit", label: "Unit", render: (row) => row.unit },
    {
      key: "frequency",
      label: "Frequency",
      render: (row) => humanise(row.frequency),
    },
    {
      key: "direction",
      label: "Direction",
      render: (row) => <Badge>{humanise(row.direction)}</Badge>,
    },
    {
      key: "framework",
      label: "Framework",
      render: (row) => row.framework ?? "—",
    },
    {
      key: "owners",
      label: "Owner / Department",
      render: (row) =>
        row.owners.length === 0 && row.departments.length === 0 ? (
          "—"
        ) : (
          <span className="list-row-copy">
            <strong>{row.owners.join(", ") || "Unassigned"}</strong>
            <span>{row.departments.join(", ") || "No department"}</span>
          </span>
        ),
    },
    {
      key: "configurationStatus",
      label: "Configuration",
      render: (row) => (
        <Badge
          tone={
            row.configurationStatus === "ACTIVE"
              ? "green"
              : row.configurationStatus === "CONFIGURED_INACTIVE"
                ? "amber"
                : "grey"
          }
        >
          {CONFIGURATION_LABEL[row.configurationStatus]}
        </Badge>
      ),
    },
  ];
  const masterColumns: Column<KpiCatalogueEntry>[] = [
    catalogueColumns[0]!,
    catalogueColumns[1]!,
    catalogueColumns[3]!,
    catalogueColumns[5]!,
    {
      key: "frequency",
      label: "Default Frequency",
      render: (row) => humanise(row.frequency),
    },
    {
      key: "status",
      label: "Record Status",
      render: (row) => (
        <Badge tone={row.status === "ACTIVE" ? "green" : "grey"}>
          {humanise(row.status)}
        </Badge>
      ),
    },
    {
      key: "configurationCount",
      label: "Company Usage",
      render: (row) => (
        <span className="list-row-copy">
          <strong>{row.configurationCount} configuration(s)</strong>
          <span>{row.activeConfigurationCount} active</span>
        </span>
      ),
    },
  ];
  const isMaster = mode === "master";
  const columns = isMaster ? masterColumns : catalogueColumns;

  return (
    <div className="page">
      <PageHeader
        title={isMaster ? "KPI Master" : "KPI Catalogue"}
        section={isMaster ? "Master Data" : "KPI Management"}
        description={
          isMaster
            ? "KPI definitions, units, frequency and measurement direction."
            : "KPI definitions and Company configuration status."
        }
        connected
        actions={
          <>
            <Link className="btn btn-secondary" to="/master/frequencies">
              Frequency Master
            </Link>
            {isMaster ? (
              <Link className="btn btn-secondary" to="/kpi/catalogue">
                KPI Catalogue
              </Link>
            ) : null}
            <Link className="btn btn-primary" to="/kpi/configuration">
              KPI Configuration
            </Link>
          </>
        }
      />

      {resource.loading ? (
        <LoadingState label={`Loading ${isMaster ? "KPI master" : "KPI catalogue"}…`} />
      ) : resource.error ? (
        <ErrorState error={resource.error} />
      ) : (
        <>
          <div className="toolbar" data-testid="kpi-catalogue-filters">
            <label className="filter-search">
              <span className="sr-only">Search KPI definitions</span>
              <input
                className="control"
                type="search"
                value={search}
                placeholder="Search code, name or unit…"
                maxLength={100}
                aria-label="Search KPI definitions"
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <label className="toolbar-select">
              <span className="sr-only">Frequency</span>
              <select
                className="control"
                value={frequency}
                aria-label="Filter by frequency"
                onChange={(event) => setFrequency(event.target.value)}
              >
                <option value="">All frequencies</option>
                {frequencies.map((code) => (
                  <option key={code} value={code}>
                    {humanise(code)}
                  </option>
                ))}
              </select>
            </label>
            <label className="toolbar-select">
              <span className="sr-only">Configuration status</span>
              <select
                className="control"
                value={configuration}
                aria-label="Filter by configuration status"
                onChange={(event) => setConfiguration(event.target.value)}
              >
                <option value="">All configuration states</option>
                <option value="ACTIVE">Configured</option>
                <option value="CONFIGURED_INACTIVE">
                  Configured (inactive)
                </option>
                <option value="NOT_CONFIGURED">Not configured</option>
              </select>
            </label>
          </div>

          {all.length === 0 ? (
            <p className="chart-empty" data-testid="kpi-catalogue-empty">
              No KPI definitions. Import an approved workbook to get started.
            </p>
          ) : (
          <DataTable
            rows={rows}
            columns={columns}
            caption={isMaster ? "KPI Definition Master" : "KPI Catalogue"}
              companyName={user?.activeCompany.name}
              pageSize={15}
            />
          )}

          <section className="card information-card">
            <span className="feature-icon tone-blue">
              <ListChecks size={19} />
            </span>
            <div>
              <strong>Definitions are shared; configuration is yours</strong>
              <p>
                KPI definitions are shared master data. What makes one live for
                this Company is a KPI configuration with an owner, thresholds
                and an approved target. Category and framework are shown as “—”
                because this release's KPI definition record does not carry
                them.
              </p>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

export function KpiMasterPage() {
  return <KpiCataloguePage mode="master" />;
}
