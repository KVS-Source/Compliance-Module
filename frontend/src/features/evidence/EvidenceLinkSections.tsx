import { Link2, RefreshCw, Unlink } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ErrorState, LoadingState } from "../../components/feedback/AsyncState";
import { Modal } from "../../components/feedback/Modal";
import { useAuth } from "../../context/AuthContext";
import { useTenant } from "../../context/TenantContext";
import { useToast } from "../../context/ToastContext";
import { useApiResource } from "../../hooks/useApiResource";
import { ApiError } from "../../services/apiClient";
import { checkpointApi } from "../../services/checkpointApi";
import { controlApi } from "../../services/controlApi";
import { evidenceApi } from "../../services/evidenceApi";
import { kpiApi } from "../../services/kpiApi";
import type {
  Checkpoint,
  Control,
  EvidenceCheckpointLink,
  EvidenceControlLink,
  EvidenceDetail,
  EvidenceKpiActualLink,
  EvidenceLifecycleStatus,
  KpiActualRecord,
} from "../../types/api";
import { evidenceActionError } from "../../utils/fieldErrors";

const LINK_PAGE_SIZE = 20;
const PICKER_PAGE_SIZE = 20;

type UnlinkTarget =
  | { kind: "control"; link: EvidenceControlLink }
  | { kind: "checkpoint"; link: EvidenceCheckpointLink }
  | { kind: "kpi-actual"; link: EvidenceKpiActualLink };

interface EvidenceLinkSectionsProps {
  evidence: EvidenceDetail;
  onLinksChanged: () => void;
}

const linksMutable = (status: EvidenceLifecycleStatus) => status === "DRAFT";

export function EvidenceLinkSections({
  evidence,
  onLinksChanged,
}: EvidenceLinkSectionsProps) {
  const { hasPermission } = useAuth();
  const { contextVersion } = useTenant();
  const canRead = hasPermission("evidence:read");
  const canWrite = hasPermission("evidence:write");
  const mutable = linksMutable(evidence.lifecycleStatus);
  const canMutate = canWrite && mutable;

  const [controlsVersion, setControlsVersion] = useState(0);
  const [checkpointsVersion, setCheckpointsVersion] = useState(0);
  const [kpiVersion, setKpiVersion] = useState(0);
  const [unlinkTarget, setUnlinkTarget] = useState<UnlinkTarget | null>(null);
  const [unlinkBusy, setUnlinkBusy] = useState(false);
  const [unlinkError, setUnlinkError] = useState<string | null>(null);

  const controls = useApiResource(
    () =>
      canRead
        ? evidenceApi.listControlLinks(evidence.id, { pageSize: LINK_PAGE_SIZE })
        : Promise.reject(new ApiError("Permission denied", 403, "FORBIDDEN")),
    [evidence.id, contextVersion, controlsVersion, canRead],
  );

  const checkpoints = useApiResource(
    () =>
      canRead
        ? evidenceApi.listCheckpointLinks(evidence.id, {
            pageSize: LINK_PAGE_SIZE,
          })
        : Promise.reject(new ApiError("Permission denied", 403, "FORBIDDEN")),
    [evidence.id, contextVersion, checkpointsVersion, canRead],
  );

  const kpiLinks = useApiResource(
    () =>
      canRead
        ? evidenceApi.listKpiActualLinks(evidence.id, {
            pageSize: LINK_PAGE_SIZE,
          })
        : Promise.reject(new ApiError("Permission denied", 403, "FORBIDDEN")),
    [evidence.id, contextVersion, kpiVersion, canRead],
  );

  useEffect(() => {
    setControlsVersion(0);
    setCheckpointsVersion(0);
    setKpiVersion(0);
    setUnlinkTarget(null);
    setUnlinkError(null);
  }, [contextVersion, evidence.id]);

  const refreshControls = () => {
    setControlsVersion((value) => value + 1);
    onLinksChanged();
  };
  const refreshCheckpoints = () => {
    setCheckpointsVersion((value) => value + 1);
    onLinksChanged();
  };
  const refreshKpi = () => {
    setKpiVersion((value) => value + 1);
    onLinksChanged();
  };

  const runUnlink = async () => {
    if (!unlinkTarget) return;
    setUnlinkBusy(true);
    setUnlinkError(null);
    try {
      if (unlinkTarget.kind === "control") {
        await evidenceApi.unlinkControl(
          evidence.id,
          unlinkTarget.link.control.id,
        );
        refreshControls();
      } else if (unlinkTarget.kind === "checkpoint") {
        await evidenceApi.unlinkCheckpoint(
          evidence.id,
          unlinkTarget.link.checkpoint.id,
        );
        refreshCheckpoints();
      } else {
        await evidenceApi.unlinkKpiActual(
          evidence.id,
          unlinkTarget.link.kpiActual.id,
        );
        refreshKpi();
      }
      setUnlinkTarget(null);
    } catch (error) {
      setUnlinkError(evidenceActionError(error, "evidence:write"));
    } finally {
      setUnlinkBusy(false);
    }
  };

  if (!canRead) return null;

  return (
    <>
      <ControlLinkSection
        evidenceId={evidence.id}
        links={controls.data?.data ?? null}
        loading={controls.loading}
        error={controls.error}
        canMutate={canMutate}
        mutableHint={
          !mutable
            ? "Links can be changed only while Evidence is DRAFT."
            : !canWrite
              ? "Your role does not include evidence:write."
              : null
        }
        onRefresh={refreshControls}
        onRetry={() => setControlsVersion((value) => value + 1)}
        onUnlink={(link) => setUnlinkTarget({ kind: "control", link })}
        onLinked={refreshControls}
      />

      <CheckpointLinkSection
        evidenceId={evidence.id}
        links={checkpoints.data?.data ?? null}
        loading={checkpoints.loading}
        error={checkpoints.error}
        canMutate={canMutate}
        mutableHint={
          !mutable
            ? "Links can be changed only while Evidence is DRAFT."
            : !canWrite
              ? "Your role does not include evidence:write."
              : null
        }
        onRefresh={refreshCheckpoints}
        onRetry={() => setCheckpointsVersion((value) => value + 1)}
        onUnlink={(link) => setUnlinkTarget({ kind: "checkpoint", link })}
        onLinked={refreshCheckpoints}
      />

      <KpiActualLinkSection
        evidenceId={evidence.id}
        links={kpiLinks.data?.data ?? null}
        loading={kpiLinks.loading}
        error={kpiLinks.error}
        canMutate={canMutate}
        mutableHint={
          !mutable
            ? "Links can be changed only while Evidence is DRAFT."
            : !canWrite
              ? "Your role does not include evidence:write."
              : null
        }
        onRefresh={refreshKpi}
        onRetry={() => setKpiVersion((value) => value + 1)}
        onUnlink={(link) => setUnlinkTarget({ kind: "kpi-actual", link })}
        onLinked={refreshKpi}
      />

      {unlinkTarget ? (
        <Modal
          title="Unlink Evidence"
          onClose={unlinkBusy ? () => undefined : () => setUnlinkTarget(null)}
          footer={
            <>
              <button
                className="btn btn-secondary"
                type="button"
                disabled={unlinkBusy}
                onClick={() => setUnlinkTarget(null)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                type="button"
                disabled={unlinkBusy}
                data-testid="evidence-unlink-confirm"
                onClick={() => void runUnlink()}
              >
                {unlinkBusy ? "Unlinking…" : "Unlink"}
              </button>
            </>
          }
        >
          {unlinkError ? (
            <div className="banner warning" role="alert">
              {unlinkError}
            </div>
          ) : null}
          <p>
            Remove the active link between this Evidence and{" "}
            <strong>
              {unlinkTarget.kind === "control"
                ? unlinkTarget.link.control.code
                : unlinkTarget.kind === "checkpoint"
                  ? unlinkTarget.link.checkpoint.code
                  : unlinkTarget.link.kpiActual.code}
            </strong>
            ? The Evidence record stays in DRAFT.
          </p>
        </Modal>
      ) : null}
    </>
  );
}

interface LinkSectionProps<T> {
  evidenceId: string;
  testId: string;
  title: string;
  links: T[] | null;
  loading: boolean;
  error: unknown;
  canMutate: boolean;
  mutableHint: string | null;
  onRefresh: () => void;
  onRetry: () => void;
  children: (links: T[]) => ReactNode;
  picker: ReactNode;
}

function LinkSectionShell<T>({
  testId,
  title,
  links,
  loading,
  error,
  canMutate,
  mutableHint,
  onRefresh,
  onRetry,
  children,
  picker,
}: LinkSectionProps<T>) {
  return (
    <section className="card" data-testid={testId}>
      <header className="card-head">
        <div>
          <h2>{title}</h2>
        </div>
        <button
          className="btn btn-secondary"
          type="button"
          onClick={onRefresh}
          disabled={loading}
          data-testid={`${testId}-refresh`}
        >
          <RefreshCw size={15} /> Refresh
        </button>
      </header>
      <div className="card-pad">
        {mutableHint ? (
          <p className="muted" role="status">
            {mutableHint}
          </p>
        ) : null}
        {loading && !links ? <LoadingState label={`Loading ${title.toLowerCase()}…`} /> : null}
        {error && !links ? (
          <div className="stack">
            <ErrorState
              error={
                error instanceof Error
                  ? error
                  : new Error("The link list could not be loaded.")
              }
            />
            <button className="btn btn-secondary" type="button" onClick={onRetry}>
              Retry
            </button>
          </div>
        ) : null}
        {links && links.length === 0 ? (
          <p className="muted" data-testid={`${testId}-empty`}>
            No active links yet.
          </p>
        ) : null}
        {links && links.length > 0 ? children(links) : null}
        {canMutate ? picker : null}
      </div>
    </section>
  );
}

function ControlLinkSection({
  evidenceId,
  links,
  loading,
  error,
  canMutate,
  mutableHint,
  onRefresh,
  onRetry,
  onUnlink,
  onLinked,
}: {
  evidenceId: string;
  links: EvidenceControlLink[] | null;
  loading: boolean;
  error: unknown;
  canMutate: boolean;
  mutableHint: string | null;
  onRefresh: () => void;
  onRetry: () => void;
  onUnlink: (link: EvidenceControlLink) => void;
  onLinked: () => void;
}) {
  const { hasPermission } = useAuth();
  const { contextVersion } = useTenant();
  const { showToast } = useToast();
  const canReadControls = hasPermission("controls:read");
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const [options, setOptions] = useState<Control[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  const linkedIds = useMemo(
    () => new Set((links ?? []).filter((entry) => entry.isActive).map((entry) => entry.control.id)),
    [links],
  );

  useEffect(() => {
    setFilter("");
    setPage(1);
    setSelectedId("");
    setLinkError(null);
    setOptionsError(null);
  }, [contextVersion, evidenceId]);

  useEffect(() => {
    if (!canMutate || !canReadControls) {
      setOptions([]);
      return;
    }
    const controller = new AbortController();
    setLoadingOptions(true);
    setOptionsError(null);
    void controlApi
      .listControls(
        {
          page,
          pageSize: PICKER_PAGE_SIZE,
          q: filter.trim() || undefined,
          lifecycleStatus: "ACTIVE",
        },
        controller.signal,
      )
      .then((result) => {
        setOptions(
          result.data.filter((entry) => !linkedIds.has(entry.id)),
        );
        setTotalPages(result.meta.totalPages);
        setLoadingOptions(false);
      })
      .catch((loadError: unknown) => {
        if (controller.signal.aborted) return;
        setOptionsError(
          loadError instanceof ApiError && loadError.status === 403
            ? "Control options require controls:read."
            : loadError instanceof Error
              ? loadError.message
              : "Control options could not be loaded.",
        );
        setOptions([]);
        setLoadingOptions(false);
      });
    return () => controller.abort();
  }, [canMutate, canReadControls, filter, page, contextVersion, linkedIds]);

  const linkControl = async () => {
    if (!selectedId || linkBusy) return;
    setLinkBusy(true);
    setLinkError(null);
    try {
      await evidenceApi.linkControl(evidenceId, selectedId);
      setSelectedId("");
      showToast("success", "Control linked", "The Evidence link was created.");
      onLinked();
    } catch (linkErr) {
      setLinkError(evidenceActionError(linkErr, "evidence:write"));
    } finally {
      setLinkBusy(false);
    }
  };

  return (
    <LinkSectionShell
      evidenceId={evidenceId}
      testId="evidence-control-links"
      title="Linked Controls"
      links={links}
      loading={loading}
      error={error}
      canMutate={canMutate && canReadControls}
      mutableHint={
        mutableHint ??
        (!canReadControls ? "Control linking requires controls:read." : null)
      }
      onRefresh={onRefresh}
      onRetry={onRetry}
      picker={
        <div className="stack evidence-link-picker" data-testid="evidence-control-link-picker">
          {linkError ? (
            <div className="banner warning" role="alert">
              {linkError}
            </div>
          ) : null}
          <div className="field">
            <label htmlFor="evidence-control-filter">Search Controls</label>
            <input
              id="evidence-control-filter"
              className="control"
              type="search"
              value={filter}
              onChange={(event) => {
                setFilter(event.target.value);
                setPage(1);
              }}
              placeholder="Search by code or title"
            />
          </div>
          <div className="field">
            <label htmlFor="evidence-control-select">ACTIVE Control</label>
            <select
              id="evidence-control-select"
              className="control"
              value={selectedId}
              disabled={loadingOptions}
              onChange={(event) => setSelectedId(event.target.value)}
              data-testid="evidence-control-select"
            >
              <option value="">
                {loadingOptions
                  ? "Loading Controls…"
                  : optionsError
                    ? "Control list unavailable"
                    : "Select an ACTIVE Control"}
              </option>
              {options.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.code} · {entry.title}
                </option>
              ))}
            </select>
            {optionsError ? (
              <p className="error" role="alert">
                {optionsError}
              </p>
            ) : null}
          </div>
          {totalPages > 1 ? (
            <div className="pagination">
              <button
                className="btn btn-secondary"
                type="button"
                disabled={page <= 1 || loadingOptions}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                Previous
              </button>
              <span className="muted">
                Page {page} of {totalPages}
              </span>
              <button
                className="btn btn-secondary"
                type="button"
                disabled={page >= totalPages || loadingOptions}
                onClick={() => setPage((value) => value + 1)}
              >
                Next
              </button>
            </div>
          ) : null}
          <button
            className="btn btn-primary"
            type="button"
            disabled={!selectedId || linkBusy}
            data-testid="evidence-control-link"
            onClick={() => void linkControl()}
          >
            <Link2 size={15} /> {linkBusy ? "Linking…" : "Link Control"}
          </button>
        </div>
      }
    >
      {(items) => (
        <ul className="link-list" data-testid="evidence-control-link-list">
          {items
            .filter((entry) => entry.isActive)
            .map((entry) => (
              <li key={entry.id} data-testid={`evidence-control-link-${entry.control.id}`}>
                <div>
                  <Link to={`/controls/${entry.control.id}`}>
                    {entry.control.code} · {entry.control.title}
                  </Link>
                  <p className="muted">
                    Linked {new Date(entry.linkedAt).toLocaleString()}
                  </p>
                </div>
                {canMutate ? (
                  <button
                    className="btn btn-secondary"
                    type="button"
                    data-testid={`evidence-control-unlink-${entry.control.id}`}
                    onClick={() => onUnlink(entry)}
                  >
                    <Unlink size={15} /> Unlink
                  </button>
                ) : null}
              </li>
            ))}
        </ul>
      )}
    </LinkSectionShell>
  );
}

function CheckpointLinkSection({
  evidenceId,
  links,
  loading,
  error,
  canMutate,
  mutableHint,
  onRefresh,
  onRetry,
  onUnlink,
  onLinked,
}: {
  evidenceId: string;
  links: EvidenceCheckpointLink[] | null;
  loading: boolean;
  error: unknown;
  canMutate: boolean;
  mutableHint: string | null;
  onRefresh: () => void;
  onRetry: () => void;
  onUnlink: (link: EvidenceCheckpointLink) => void;
  onLinked: () => void;
}) {
  const { hasPermission } = useAuth();
  const { contextVersion } = useTenant();
  const { showToast } = useToast();
  const canReadCheckpoints = hasPermission("checkpoints:read");
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const [options, setOptions] = useState<Checkpoint[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  const linkedIds = useMemo(
    () =>
      new Set(
        (links ?? [])
          .filter((entry) => entry.isActive)
          .map((entry) => entry.checkpoint.id),
      ),
    [links],
  );

  useEffect(() => {
    setFilter("");
    setPage(1);
    setSelectedId("");
    setLinkError(null);
    setOptionsError(null);
  }, [contextVersion, evidenceId]);

  useEffect(() => {
    if (!canMutate || !canReadCheckpoints) {
      setOptions([]);
      return;
    }
    const controller = new AbortController();
    setLoadingOptions(true);
    setOptionsError(null);
    void checkpointApi
      .listCheckpoints(
        {
          page,
          pageSize: PICKER_PAGE_SIZE,
          q: filter.trim() || undefined,
          lifecycleStatus: "ACTIVE",
        },
        controller.signal,
      )
      .then((result) => {
        setOptions(
          result.data.filter((entry) => !linkedIds.has(entry.id)),
        );
        setTotalPages(result.meta.totalPages);
        setLoadingOptions(false);
      })
      .catch((loadError: unknown) => {
        if (controller.signal.aborted) return;
        setOptionsError(
          loadError instanceof ApiError && loadError.status === 403
            ? "Checkpoint options require checkpoints:read."
            : loadError instanceof Error
              ? loadError.message
              : "Checkpoint options could not be loaded.",
        );
        setOptions([]);
        setLoadingOptions(false);
      });
    return () => controller.abort();
  }, [canMutate, canReadCheckpoints, filter, page, contextVersion, linkedIds]);

  const linkCheckpoint = async () => {
    if (!selectedId || linkBusy) return;
    setLinkBusy(true);
    setLinkError(null);
    try {
      await evidenceApi.linkCheckpoint(evidenceId, selectedId);
      setSelectedId("");
      showToast("success", "Checkpoint linked", "The Evidence link was created.");
      onLinked();
    } catch (linkErr) {
      setLinkError(evidenceActionError(linkErr, "evidence:write"));
    } finally {
      setLinkBusy(false);
    }
  };

  return (
    <LinkSectionShell
      evidenceId={evidenceId}
      testId="evidence-checkpoint-links"
      title="Linked Checkpoints"
      links={links}
      loading={loading}
      error={error}
      canMutate={canMutate && canReadCheckpoints}
      mutableHint={
        mutableHint ??
        (!canReadCheckpoints
          ? "Checkpoint linking requires checkpoints:read."
          : null)
      }
      onRefresh={onRefresh}
      onRetry={onRetry}
      picker={
        <div
          className="stack evidence-link-picker"
          data-testid="evidence-checkpoint-link-picker"
        >
          {linkError ? (
            <div className="banner warning" role="alert">
              {linkError}
            </div>
          ) : null}
          <div className="field">
            <label htmlFor="evidence-checkpoint-filter">Search Checkpoints</label>
            <input
              id="evidence-checkpoint-filter"
              className="control"
              type="search"
              value={filter}
              onChange={(event) => {
                setFilter(event.target.value);
                setPage(1);
              }}
              placeholder="Search by code or title"
            />
          </div>
          <div className="field">
            <label htmlFor="evidence-checkpoint-select">ACTIVE Checkpoint</label>
            <select
              id="evidence-checkpoint-select"
              className="control"
              value={selectedId}
              disabled={loadingOptions}
              onChange={(event) => setSelectedId(event.target.value)}
              data-testid="evidence-checkpoint-select"
            >
              <option value="">
                {loadingOptions
                  ? "Loading Checkpoints…"
                  : optionsError
                    ? "Checkpoint list unavailable"
                    : "Select an ACTIVE Checkpoint"}
              </option>
              {options.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.code} · {entry.title}
                </option>
              ))}
            </select>
            {optionsError ? (
              <p className="error" role="alert">
                {optionsError}
              </p>
            ) : null}
          </div>
          {totalPages > 1 ? (
            <div className="pagination">
              <button
                className="btn btn-secondary"
                type="button"
                disabled={page <= 1 || loadingOptions}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                Previous
              </button>
              <span className="muted">
                Page {page} of {totalPages}
              </span>
              <button
                className="btn btn-secondary"
                type="button"
                disabled={page >= totalPages || loadingOptions}
                onClick={() => setPage((value) => value + 1)}
              >
                Next
              </button>
            </div>
          ) : null}
          <button
            className="btn btn-primary"
            type="button"
            disabled={!selectedId || linkBusy}
            data-testid="evidence-checkpoint-link"
            onClick={() => void linkCheckpoint()}
          >
            <Link2 size={15} /> {linkBusy ? "Linking…" : "Link Checkpoint"}
          </button>
        </div>
      }
    >
      {(items) => (
        <ul className="link-list" data-testid="evidence-checkpoint-link-list">
          {items
            .filter((entry) => entry.isActive)
            .map((entry) => (
              <li
                key={entry.id}
                data-testid={`evidence-checkpoint-link-${entry.checkpoint.id}`}
              >
                <div>
                  <Link to={`/checkpoints/${entry.checkpoint.id}`}>
                    {entry.checkpoint.code} · {entry.checkpoint.title}
                  </Link>
                  <p className="muted">
                    Linked {new Date(entry.linkedAt).toLocaleString()}
                  </p>
                </div>
                {canMutate ? (
                  <button
                    className="btn btn-secondary"
                    type="button"
                    data-testid={`evidence-checkpoint-unlink-${entry.checkpoint.id}`}
                    onClick={() => onUnlink(entry)}
                  >
                    <Unlink size={15} /> Unlink
                  </button>
                ) : null}
              </li>
            ))}
        </ul>
      )}
    </LinkSectionShell>
  );
}

function KpiActualLinkSection({
  evidenceId,
  links,
  loading,
  error,
  canMutate,
  mutableHint,
  onRefresh,
  onRetry,
  onUnlink,
  onLinked,
}: {
  evidenceId: string;
  links: EvidenceKpiActualLink[] | null;
  loading: boolean;
  error: unknown;
  canMutate: boolean;
  mutableHint: string | null;
  onRefresh: () => void;
  onRetry: () => void;
  onUnlink: (link: EvidenceKpiActualLink) => void;
  onLinked: () => void;
}) {
  const { hasPermission } = useAuth();
  const { contextVersion } = useTenant();
  const { showToast } = useToast();
  const canReadKpi = hasPermission("kpi-actual:read");
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const [options, setOptions] = useState<KpiActualRecord[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  const linkedIds = useMemo(
    () =>
      new Set(
        (links ?? [])
          .filter((entry) => entry.isActive)
          .map((entry) => entry.kpiActual.id),
      ),
    [links],
  );

  useEffect(() => {
    setFilter("");
    setPage(1);
    setSelectedId("");
    setLinkError(null);
    setOptionsError(null);
  }, [contextVersion, evidenceId]);

  useEffect(() => {
    if (!canMutate || !canReadKpi) {
      setOptions([]);
      return;
    }
    const controller = new AbortController();
    setLoadingOptions(true);
    setOptionsError(null);
    void kpiApi
      .listActuals({ page, pageSize: PICKER_PAGE_SIZE })
      .then((result) => {
        const filtered = result.data.filter(
          (entry) =>
            entry.approvalStatus !== "APPROVED" &&
            !linkedIds.has(entry.id) &&
            (!filter.trim() ||
              entry.code.toLowerCase().includes(filter.trim().toLowerCase()) ||
              entry.period.toLowerCase().includes(filter.trim().toLowerCase())),
        );
        setOptions(filtered);
        setTotalPages(result.meta.totalPages);
        setLoadingOptions(false);
      })
      .catch((loadError: unknown) => {
        if (controller.signal.aborted) return;
        setOptionsError(
          loadError instanceof ApiError && loadError.status === 403
            ? "KPI actual options require kpi-actual:read."
            : loadError instanceof Error
              ? loadError.message
              : "KPI actual options could not be loaded.",
        );
        setOptions([]);
        setLoadingOptions(false);
      });
    return () => controller.abort();
  }, [canMutate, canReadKpi, filter, page, contextVersion, linkedIds]);

  const linkKpiActual = async () => {
    if (!selectedId || linkBusy) return;
    setLinkBusy(true);
    setLinkError(null);
    try {
      await evidenceApi.linkKpiActual(evidenceId, selectedId);
      setSelectedId("");
      showToast("success", "KPI actual linked", "The Evidence link was created.");
      onLinked();
    } catch (linkErr) {
      setLinkError(evidenceActionError(linkErr, "evidence:write"));
    } finally {
      setLinkBusy(false);
    }
  };

  return (
    <LinkSectionShell
      evidenceId={evidenceId}
      testId="evidence-kpi-actual-links"
      title="Linked KPI Actuals"
      links={links}
      loading={loading}
      error={error}
      canMutate={canMutate && canReadKpi}
      mutableHint={
        mutableHint ??
        (!canReadKpi ? "KPI actual linking requires kpi-actual:read." : null)
      }
      onRefresh={onRefresh}
      onRetry={onRetry}
      picker={
        <div
          className="stack evidence-link-picker"
          data-testid="evidence-kpi-actual-link-picker"
        >
          {linkError ? (
            <div className="banner warning" role="alert">
              {linkError}
            </div>
          ) : null}
          <div className="field">
            <label htmlFor="evidence-kpi-filter">Search KPI actuals</label>
            <input
              id="evidence-kpi-filter"
              className="control"
              type="search"
              value={filter}
              onChange={(event) => {
                setFilter(event.target.value);
                setPage(1);
              }}
              placeholder="Search by code or period"
            />
          </div>
          <div className="field">
            <label htmlFor="evidence-kpi-select">KPI actual (not APPROVED)</label>
            <select
              id="evidence-kpi-select"
              className="control"
              value={selectedId}
              disabled={loadingOptions}
              onChange={(event) => setSelectedId(event.target.value)}
              data-testid="evidence-kpi-actual-select"
            >
              <option value="">
                {loadingOptions
                  ? "Loading KPI actuals…"
                  : optionsError
                    ? "KPI actual list unavailable"
                    : "Select a KPI actual"}
              </option>
              {options.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.code} · {entry.period} ({entry.approvalStatus})
                </option>
              ))}
            </select>
            {optionsError ? (
              <p className="error" role="alert">
                {optionsError}
              </p>
            ) : null}
          </div>
          {totalPages > 1 ? (
            <div className="pagination">
              <button
                className="btn btn-secondary"
                type="button"
                disabled={page <= 1 || loadingOptions}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                Previous
              </button>
              <span className="muted">
                Page {page} of {totalPages}
              </span>
              <button
                className="btn btn-secondary"
                type="button"
                disabled={page >= totalPages || loadingOptions}
                onClick={() => setPage((value) => value + 1)}
              >
                Next
              </button>
            </div>
          ) : null}
          <button
            className="btn btn-primary"
            type="button"
            disabled={!selectedId || linkBusy}
            data-testid="evidence-kpi-actual-link"
            onClick={() => void linkKpiActual()}
          >
            <Link2 size={15} /> {linkBusy ? "Linking…" : "Link KPI actual"}
          </button>
        </div>
      }
    >
      {(items) => (
        <ul className="link-list" data-testid="evidence-kpi-actual-link-list">
          {items
            .filter((entry) => entry.isActive)
            .map((entry) => (
              <li
                key={entry.id}
                data-testid={`evidence-kpi-actual-link-${entry.kpiActual.id}`}
              >
                <div>
                  <span className="mono">{entry.kpiActual.code}</span> ·{" "}
                  {entry.kpiActual.period} ({entry.kpiActual.approvalStatus})
                  <p className="muted">
                    Linked {new Date(entry.linkedAt).toLocaleString()}
                  </p>
                </div>
                {canMutate ? (
                  <button
                    className="btn btn-secondary"
                    type="button"
                    data-testid={`evidence-kpi-actual-unlink-${entry.kpiActual.id}`}
                    onClick={() => onUnlink(entry)}
                  >
                    <Unlink size={15} /> Unlink
                  </button>
                ) : null}
              </li>
            ))}
        </ul>
      )}
    </LinkSectionShell>
  );
}
