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
import {
  OrganisationFormModal,
  type OrganisationKind,
  type OrganisationRow,
} from "./OrganisationFormModal";

type Row = Department | Location | OrganisationUnit;

const writePermission: Record<OrganisationKind, string> = {
  departments: "departments:write",
  locations: "locations:write",
  units: "units:write",
};

const settings = {
  departments: {
    title: "Department Setup",
    description:
      "Maintain Company-scoped departments, ownership and operational structure.",
    singular: "Department",
    loader: masterDataApi.listDepartments,
  },
  locations: {
    title: "Location Setup",
    description:
      "Operational and compliance locations.",
    singular: "Location",
    loader: masterDataApi.listLocations,
  },
  units: {
    title: "Organisation Units",
    description:
      "Maintain Company-scoped organisation units and reporting structure.",
    singular: "Organisation Unit",
    loader: masterDataApi.listUnits,
  },
} as const;

const isDepartment = (row: Row): row is Department => "headName" in row;
const isLocation = (row: Row): row is Location => "city" in row;

export function OrganisationPage({ kind }: { kind: OrganisationKind }) {
  const config = settings[kind];
  const { user, hasPermission } = useAuth();
  const { contextVersion } = useTenant();
  const { showToast } = useToast();
  const canWrite = hasPermission(writePermission[kind]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All Statuses");
  const [listVersion, setListVersion] = useState(0);
  const [editor, setEditor] = useState<
    null | { mode: "create" } | { mode: "edit"; row: OrganisationRow }
  >(null);

  const resource = useApiResource<Row[]>(config.loader, [
    contextVersion,
    user?.activeCompany.id,
    kind,
    listVersion,
  ]);

  const rows = useMemo(
    () =>
      (resource.data ?? []).filter((entry) => {
        const text = Object.values(entry)
          .filter((value) => typeof value === "string")
          .join(" ")
          .toLowerCase();
        return (
          (!search || text.includes(search.toLowerCase())) &&
          (status === "All Statuses" || entry.status === status)
        );
      }),
    [resource.data, search, status],
  );

  const columns: Column<Row>[] = [
    {
      key: "code",
      label: `${config.singular} Code`,
      render: (row) => <span className="mono link-text">{row.code}</span>,
    },
    {
      key: "name",
      label: `${config.singular} Name`,
      render: (row) => <strong>{row.name}</strong>,
    },
    ...(kind === "departments"
      ? [
          {
            key: "head",
            label: "Department Head",
            render: (row: Row) =>
              isDepartment(row) ? (row.headName ?? "—") : "—",
          },
        ]
      : []),
    ...(kind === "locations"
      ? [
          {
            key: "city",
            label: "City / State",
            render: (row: Row) =>
              isLocation(row)
                ? [row.city, row.state].filter(Boolean).join(" · ") || "—"
                : "—",
          },
          {
            key: "country",
            label: "Country",
            render: (row: Row) =>
              isLocation(row) ? (row.country ?? "—") : "—",
          },
          {
            key: "type",
            label: "Type",
            render: (row: Row) => (isLocation(row) ? (row.type ?? "—") : "—"),
          },
        ]
      : []),
    {
      key: "status",
      label: "Status",
      render: (row) => <Badge>{row.status}</Badge>,
    },
  ];


  return (
    <div className="page">
      <PageHeader
        title={config.title}
        section="Admin"
        description={config.description}
        connected
        primaryLabel={canWrite ? `Add ${config.singular}` : undefined}
        onPrimary={
          canWrite ? () => setEditor({ mode: "create" }) : undefined
        }
      />
      <SearchToolbar
        value={search}
        onChange={setSearch}
        placeholder={`Search ${config.title.toLowerCase()}…`}
        status={status}
        onStatusChange={setStatus}
      />
      {resource.loading ? (
        <LoadingState />
      ) : resource.error ? (
        <ErrorState error={resource.error} />
      ) : (
        <DataTable
          rows={rows}
          columns={columns}
          caption={config.title}
          companyName={user?.activeCompany.name}
          onView={(row) =>
            showToast(
              "info",
              row.name,
              `${row.code} · ${user?.activeCompany.name}`,
            )
          }
          onEdit={
            canWrite ? (row) => setEditor({ mode: "edit", row }) : undefined
          }
        />
      )}
      {editor ? (
        <OrganisationFormModal
          kind={kind}
          singular={config.singular}
          mode={editor.mode}
          row={editor.mode === "edit" ? editor.row : null}
          onClose={() => setEditor(null)}
          onSaved={(saved) => {
            const wasCreate = editor.mode === "create";
            setEditor(null);
            setListVersion((value) => value + 1);
            showToast(
              "success",
              wasCreate ? `${config.singular} created` : `${config.singular} updated`,
              `${saved.name} (${saved.code}) was saved for ${user?.activeCompany.name ?? "the active Company"}.`,
            );
          }}
        />
      ) : null}
    </div>
  );
}
