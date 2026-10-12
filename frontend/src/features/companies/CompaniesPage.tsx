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
import { tenantApi } from "../../services/tenantApi";
import { CompanyFormModal } from "./CompanyFormModal";
import type { Company } from "../../types/api";

export function CompaniesPage() {
  const { user, hasPermission } = useAuth();
  const { contextVersion } = useTenant();
  const { showToast } = useToast();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All Statuses");
  const [createOpen, setCreateOpen] = useState(false);
  const [listVersion, setListVersion] = useState(0);
  const canCreate = hasPermission("tenants:write");
  const resource = useApiResource(tenantApi.list, [
    contextVersion,
    user?.activeCompany.id,
    listVersion,
  ]);
  const rows = useMemo(
    () =>
      (resource.data ?? []).filter((company) => {
        const query = search.toLowerCase();
        return (
          (!query ||
            `${company.code} ${company.name} ${company.industry ?? ""}`
              .toLowerCase()
              .includes(query)) &&
          (status === "All Statuses" || company.status === status)
        );
      }),
    [resource.data, search, status],
  );
  const columns: Column<Company>[] = [
    {
      key: "code",
      label: "Company Code",
      render: (row) => <span className="mono link-text">{row.code}</span>,
    },
    {
      key: "name",
      label: "Company Name",
      render: (row) => <strong>{row.name}</strong>,
    },
    {
      key: "industry",
      label: "Industry",
      render: (row) => row.industry ?? "—",
    },
    { key: "country", label: "Country", render: (row) => row.country ?? "—" },
    {
      key: "status",
      label: "Status",
      render: (row) => <Badge>{row.status}</Badge>,
    },
    {
      key: "created",
      label: "Created",
      render: (row) => new Date(row.created).toLocaleDateString("en-GB"),
    },
  ];
  return (
    <div className="page">
      <PageHeader
        title="Company Setup"
        section="Admin"
        description="Company profiles and membership."
        connected
        {...(canCreate
          ? {
              primaryLabel: "Add Company",
              onPrimary: () => setCreateOpen(true),
            }
          : {})}
      />
      <SearchToolbar
        value={search}
        onChange={setSearch}
        placeholder="Search Companies…"
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
          caption="Company Setup"
          companyName={user?.activeCompany.name}
          onView={(row) =>
            showToast(
              "info",
              row.name,
              `${row.code}`,
            )
          }
        />
      )}
      {createOpen ? (
        <CompanyFormModal
          onClose={() => setCreateOpen(false)}
          onSaved={(company) => {
            setCreateOpen(false);
            showToast(
              "success",
              "Company created",
              `${company.code} is ready and you are its administrator.`,
            );
            setListVersion((version) => version + 1);
          }}
        />
      ) : null}
    </div>
  );
}
