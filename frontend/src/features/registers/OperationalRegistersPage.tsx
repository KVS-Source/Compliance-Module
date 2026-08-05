import { ChevronLeft, ChevronRight, Eye, Inbox, RefreshCw, Search } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ErrorState, LoadingState } from "../../components/feedback/AsyncState";
import { Badge } from "../../components/feedback/Badge";
import { PageHeader } from "../../components/feedback/PageHeader";
import { CsvExportButton } from "../../components/actions/CsvExportButton";
import { useAuth } from "../../context/AuthContext";
import { useTenant } from "../../context/TenantContext";
import { useApiResource } from "../../hooks/useApiResource";
import { registerApi, type RegisterRecord, type RegisterType } from "../../services/registerApi";

const PAGE_SIZE = 20;

export function OperationalRegistersPage() {
  const { user, hasPermission } = useAuth();
  const { contextVersion } = useTenant();
  const navigate = useNavigate();
  const { registerCode: routeCode } = useParams();
  const [registerCode, setRegisterCode] = useState(routeCode ?? "");
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [overdue, setOverdue] = useState(false);
  const [page, setPage] = useState(1);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    setDraftSearch("");
    setSearch("");
    setStatus("");
    setOverdue(false);
    setPage(1);
  }, [contextVersion, user?.activeCompany.id, registerCode]);

  useEffect(() => {
    if (routeCode) setRegisterCode(routeCode);
  }, [routeCode]);

  const typesResource = useApiResource(
    () => registerApi.listTypes(1, 50),
    [contextVersion, user?.activeCompany.id, version],
  );
  const types = typesResource.data?.data ?? [];

  useEffect(() => {
    if (!registerCode && typesResource.data?.data?.[0]) {
      setRegisterCode(typesResource.data.data[0].code);
    }
  }, [registerCode, typesResource.data]);

  const recordsResource = useApiResource(
    () =>
      registerCode
        ? registerApi.listRecords(registerCode, {
            page,
            pageSize: PAGE_SIZE,
            q: search || undefined,
            status: status || undefined,
            overdue: overdue || undefined,
          })
        : Promise.resolve({ data: [] as RegisterRecord[], meta: { page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 0 } }),
    [registerCode, page, search, status, overdue, version, contextVersion, user?.activeCompany.id],
  );

  const rows = recordsResource.data?.data ?? [];
  const total = recordsResource.data?.meta.total ?? 0;
  const totalPages = recordsResource.data?.meta.totalPages ?? 1;
  const selectedType: RegisterType | undefined = types.find((item) => item.code === registerCode);

  return (
    <div className="page">
      <PageHeader
        title="Operational Registers"
        section="Audit & Operations"
        description="Company operational registers imported from approved workbooks. Records are read-only in this release unless a validated write path is configured."
        connected
        actions={
          <>
            {hasPermission("exports:read") && registerCode ? (
              <CsvExportButton registerCode={registerCode} />
            ) : null}
            <button className="btn btn-secondary" type="button" onClick={() => setVersion((value) => value + 1)}>
              <RefreshCw size={15} /> Refresh
            </button>
          </>
        }
      />

      <form
        className="filter-bar deadline-filter-bar"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          setPage(1);
          setSearch(draftSearch.trim());
        }}
      >
        <label className="toolbar-select">
          <span className="sr-only">Register</span>
          <select
            className="control"
            value={registerCode}
            onChange={(event) => {
              setRegisterCode(event.target.value);
              navigate(`/compliance/operational-registers/${event.target.value}`, { replace: true });
            }}
          >
            {types.length === 0 ? <option value="">No registers</option> : null}
            {types.map((type) => (
              <option key={type.code} value={type.code}>
                {type.name} ({type.recordCount})
              </option>
            ))}
          </select>
        </label>
        <label className="filter-search">
          <span className="sr-only">Search</span>
          <Search className="icon" size={16} aria-hidden />
          <input className="control" type="search" value={draftSearch} onChange={(event) => setDraftSearch(event.target.value)} placeholder="Search code or title…" maxLength={100} />
        </label>
        <label className="toolbar-select">
          <span className="sr-only">Status</span>
          <input className="control" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} placeholder="Status" maxLength={120} />
        </label>
        <label className="deadline-check">
          <input type="checkbox" checked={overdue} onChange={(event) => { setOverdue(event.target.checked); setPage(1); }} /> Overdue only
        </label>
        <button className="btn btn-secondary" type="submit">Search</button>
      </form>

      {typesResource.loading || recordsResource.loading ? (
        <LoadingState label="Loading operational registers…" />
      ) : typesResource.error || recordsResource.error ? (
        <ErrorState error={typesResource.error ?? recordsResource.error!} />
      ) : rows.length === 0 ? (
        <section className="card empty-state" id="page-content">
          <Inbox size={28} />
          <h3>{selectedType ? `No ${selectedType.name} records` : "No registers"}</h3>
          <p>No records were returned for {user?.activeCompany.name ?? "the active Company"}.</p>
        </section>
      ) : (
        <>
          <section className="card table-card deadline-register-desktop" data-testid="operational-registers-table">
            <div className="table-wrap">
              <table className="data-table">
                <caption>{selectedType?.name ?? "Register"} — {total} result{total === 1 ? "" : "s"}</caption>
                <thead>
                  <tr>
                    <th>Record</th>
                    <th>Status</th>
                    <th>Owner</th>
                    <th>Department</th>
                    <th>Due date</th>
                    <th><span className="sr-only">Open</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((record) => (
                    <tr key={record.id}>
                      <td>
                        <div className="cell-title">
                          <strong>{record.title}</strong>
                          <small className="mono">{record.businessRecordCode}</small>
                        </div>
                      </td>
                      <td><Badge>{record.status ?? "—"}</Badge></td>
                      <td>{record.owner?.name ?? record.sourceOwnerRef ?? "Unassigned"}</td>
                      <td>{record.department?.name ?? "—"}</td>
                      <td>
                        {record.dueDate ? (
                          <span className={record.overdue ? "deadline-overdue" : ""}>
                            {record.dueDate}{record.overdue ? " · Overdue" : ""}
                          </span>
                        ) : "—"}
                      </td>
                      <td>
                        <button
                          className="tiny-btn"
                          type="button"
                          aria-label={`View ${record.businessRecordCode}`}
                          onClick={() => navigate(`/compliance/operational-registers/${registerCode}/records/${record.id}`)}
                        >
                          <Eye size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-foot">
              <span>Showing {total ? (page - 1) * PAGE_SIZE + 1 : 0}–{Math.min(page * PAGE_SIZE, total)} of {total}</span>
              <div className="pagination">
                <button className="page-btn" type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={15} /></button>
                <span>Page {page} of {Math.max(1, totalPages)}</span>
                <button className="page-btn" type="button" disabled={page >= totalPages} onClick={() => setPage(page + 1)}><ChevronRight size={15} /></button>
              </div>
            </div>
          </section>
          <section className="deadline-register-mobile" data-testid="operational-registers-cards">
            {rows.map((record) => (
              <article className="card deadline-register-card" key={record.id}>
                <header className="card-head">
                  <div>
                    <h2>{record.title}</h2>
                    <p className="mono">{record.businessRecordCode}</p>
                  </div>
                  <Badge>{record.status ?? "—"}</Badge>
                </header>
                <div className="card-pad">
                  <p>{record.owner?.name ?? record.sourceOwnerRef ?? "Unassigned"}</p>
                  <p className={record.overdue ? "deadline-overdue" : ""}>{record.dueDate ?? "No due date"}{record.overdue ? " · Overdue" : ""}</p>
                  <button className="btn btn-secondary" type="button" onClick={() => navigate(`/compliance/operational-registers/${registerCode}/records/${record.id}`)}>
                    <Eye size={15} /> View detail
                  </button>
                </div>
              </article>
            ))}
          </section>
        </>
      )}
    </div>
  );
}

export function OperationalRegisterDetailPage() {
  const { registerCode = "", recordId = "" } = useParams();
  const navigate = useNavigate();
  const { contextVersion } = useTenant();
  const { user } = useAuth();
  const resource = useApiResource(
    () => registerApi.getRecord(registerCode, recordId),
    [registerCode, recordId, contextVersion, user?.activeCompany.id],
  );
  const record = resource.data;

  return (
    <div className="page">
      <PageHeader
        title={record?.title ?? "Register record"}
        section="Audit & Operations"
        description="Structured operational-register payload for the selected record."
        connected
        actions={
          <button className="btn btn-secondary" type="button" onClick={() => navigate(`/compliance/operational-registers/${registerCode}`)}>
            Back to register
          </button>
        }
      />
      {resource.loading ? (
        <LoadingState label="Loading record…" />
      ) : resource.error ? (
        <ErrorState error={resource.error} />
      ) : record ? (
        <section className="card card-pad" data-testid="operational-register-detail">
          <p><strong>Code:</strong> <span className="mono">{record.businessRecordCode}</span></p>
          <p><strong>Register:</strong> {record.register.name}</p>
          <p><strong>Status:</strong> {record.status ?? "—"}</p>
          <p><strong>Owner:</strong> {record.owner?.name ?? record.sourceOwnerRef ?? "Unassigned"}</p>
          <p><strong>Department:</strong> {record.department?.name ?? "—"}</p>
          <p className={record.overdue ? "deadline-overdue" : ""}>
            <strong>Due:</strong> {record.dueDate ?? "—"}{record.overdue ? " · Overdue" : ""}
          </p>
          <h3>Fields</h3>
          <dl>
            {Object.entries(record.fields ?? {}).map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
    </div>
  );
}
