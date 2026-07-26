import { ShieldCheck, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { ErrorState, LoadingState } from "../../components/feedback/AsyncState";
import { Badge } from "../../components/feedback/Badge";
import { Modal } from "../../components/feedback/Modal";
import { PageHeader } from "../../components/feedback/PageHeader";
import { SearchToolbar } from "../../components/forms/SearchToolbar";
import { DataTable, type Column } from "../../components/tables/DataTable";
import { useAuth } from "../../context/AuthContext";
import { useTenant } from "../../context/TenantContext";
import { useToast } from "../../context/ToastContext";
import { useApiResource } from "../../hooks/useApiResource";
import { ApiError } from "../../services/apiClient";
import { masterDataApi } from "../../services/masterDataApi";
import type { CompanyUser } from "../../types/api";
import { UserFormModal } from "./UserFormModal";

const roleName = (role: CompanyUser["roles"][number]) =>
  typeof role === "string" ? role : role.name;

export function UsersPage() {
  const { user, hasPermission } = useAuth();
  const { contextVersion } = useTenant();
  const { showToast } = useToast();
  const canWrite = hasPermission("users:write");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All Statuses");
  const [listVersion, setListVersion] = useState(0);
  const [detail, setDetail] = useState<CompanyUser | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editor, setEditor] = useState<
    null | { mode: "create" } | { mode: "edit"; user: CompanyUser }
  >(null);

  const resource = useApiResource(masterDataApi.listUsers, [
    contextVersion,
    user?.activeCompany.id,
    listVersion,
  ]);

  const rows = useMemo(
    () =>
      (resource.data ?? []).filter((entry) => {
        const query = search.toLowerCase();
        const text =
          `${entry.code} ${entry.name} ${entry.email} ${entry.department ?? ""} ${entry.roles.map(roleName).join(" ")}`.toLowerCase();
        return (
          (!query || text.includes(query)) &&
          (status === "All Statuses" || entry.status === status)
        );
      }),
    [resource.data, search, status],
  );

  const columns: Column<CompanyUser>[] = [
    {
      key: "code",
      label: "User ID",
      render: (row) => <span className="mono link-text">{row.code}</span>,
    },
    {
      key: "name",
      label: "User Name",
      render: (row) => (
        <div className="cell-title">
          <strong>{row.name}</strong>
          <small>{row.email}</small>
        </div>
      ),
    },
    { key: "phone", label: "Phone", render: (row) => row.phone ?? "—" },
    {
      key: "department",
      label: "Department",
      render: (row) => row.department ?? "—",
    },
    {
      key: "roles",
      label: "Role",
      render: (row) =>
        row.roles.map(roleName).join(" · ") || "Company User",
    },
    {
      key: "status",
      label: "Status",
      render: (row) => <Badge>{row.status}</Badge>,
    },
    {
      key: "lastLogin",
      label: "Last Login",
      render: (row) =>
        row.lastLogin
          ? new Date(row.lastLogin).toLocaleString("en-GB")
          : "Never",
    },
  ];

  const openDetail = async (entry: CompanyUser) => {
    setDetailLoading(true);
    try {
      setDetail(await masterDataApi.getUser(entry.id));
    } catch (error) {
      showToast(
        "error",
        "User could not be loaded",
        error instanceof Error ? error.message : "Request failed",
      );
    } finally {
      setDetailLoading(false);
    }
  };

  const openEdit = async (entry: CompanyUser) => {
    if (!canWrite) {
      showToast(
        "error",
        "Permission denied",
        "Your role does not include users:write for this Company.",
      );
      return;
    }
    setDetailLoading(true);
    try {
      const fresh = await masterDataApi.getUser(entry.id);
      setEditor({ mode: "edit", user: fresh });
    } catch (error) {
      showToast(
        "error",
        "User could not be loaded",
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Request failed",
      );
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="page">
      <PageHeader
        title="User Management"
        section="Admin"
        description="Manage user access, Company assignment, roles and account status."
        connected
        primaryLabel={canWrite ? "Add User" : undefined}
        onPrimary={canWrite ? () => setEditor({ mode: "create" }) : undefined}
        actions={
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() =>
              showToast(
                "info",
                "Role authority",
                "Database roles and permissions determine access in the active Company.",
              )
            }
          >
            <ShieldCheck size={15} /> Review access
          </button>
        }
      />
      <SearchToolbar
        value={search}
        onChange={setSearch}
        placeholder="Search users, roles or departments…"
        status={status}
        onStatusChange={setStatus}
      />
      {resource.loading ? (
        <LoadingState label="Loading Company users…" />
      ) : resource.error ? (
        <ErrorState error={resource.error} />
      ) : (
        <DataTable
          rows={rows}
          columns={columns}
          caption="User Management"
          companyName={user?.activeCompany.name}
          onView={(row) => void openDetail(row)}
          onEdit={canWrite ? (row) => void openEdit(row) : undefined}
        />
      )}
      {detailLoading ? (
        <div className="floating-loading" role="status">
          Loading user detail…
        </div>
      ) : null}
      {detail ? (
        <Modal
          title={detail.name}
          onClose={() => setDetail(null)}
          footer={
            <>
              {canWrite ? (
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => {
                    setEditor({ mode: "edit", user: detail });
                    setDetail(null);
                  }}
                >
                  Edit
                </button>
              ) : null}
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => setDetail(null)}
              >
                Done
              </button>
            </>
          }
        >
          <div className="banner banner-success">
            <UserPlus size={17} />
            <span>Database-authoritative Company user detail.</span>
          </div>
          <dl className="detail-list">
            <div>
              <dt>User code</dt>
              <dd className="mono">{detail.code}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{detail.email}</dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>{detail.phone ?? "—"}</dd>
            </div>
            <div>
              <dt>Department</dt>
              <dd>{detail.department ?? "—"}</dd>
            </div>
            <div>
              <dt>Roles</dt>
              <dd>
                {detail.roles.map(roleName).join(" · ") || "Company User"}
              </dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                <Badge>{detail.status}</Badge>
              </dd>
            </div>
          </dl>
        </Modal>
      ) : null}
      {editor ? (
        <UserFormModal
          mode={editor.mode}
          user={editor.mode === "edit" ? editor.user : null}
          onClose={() => setEditor(null)}
          onSaved={(saved) => {
            setEditor(null);
            setListVersion((value) => value + 1);
            showToast(
              "success",
              editor.mode === "create" ? "User created" : "User updated",
              `${saved.name} (${saved.email}) was saved for ${user?.activeCompany.name ?? "the active Company"}.`,
            );
          }}
        />
      ) : null}
    </div>
  );
}
