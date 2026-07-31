import {
  CheckCircle2,
  Pencil,
  RefreshCw,
  Send,
  XCircle,
} from "lucide-react";
import { ErrorState, LoadingState } from "../../components/feedback/AsyncState";
import { Badge } from "../../components/feedback/Badge";
import type { PolicyVersion, PolicyVersionStatus } from "../../types/api";
import {
  display,
  formatPolicyDate,
  formatPolicyDateTime,
  isEditableVersionStatus,
  named,
  statusLabel,
  versionStatusTone,
} from "./policyFormatting";

interface PolicyVersionHistoryProps {
  versions: PolicyVersion[] | null;
  loading: boolean;
  error: Error | null;
  latestVersionId: string | null;
  currentApprovedVersionId: string | null;
  selectedVersionId: string | null;
  canWrite: boolean;
  canSubmit: boolean;
  canApprove: boolean;
  archived: boolean;
  onSelect: (version: PolicyVersion) => void;
  onRetry: () => void;
  onEdit: (version: PolicyVersion) => void;
  onSubmit: (version: PolicyVersion) => void;
  onApprove: (version: PolicyVersion) => void;
  onReject: (version: PolicyVersion) => void;
}

const badgeFor = (
  version: PolicyVersion,
  latestVersionId: string | null,
  currentApprovedVersionId: string | null,
) => {
  const badges: Array<{
    key: string;
    label: string;
    tone?: "green" | "red" | "blue" | "amber" | "grey";
  }> = [
      {
        key: "status",
        label: statusLabel(version.status),
        tone: versionStatusTone(version.status as PolicyVersionStatus),
      },
    ];
  if (version.id === latestVersionId) {
    badges.push({ key: "latest", label: "Latest Version", tone: "blue" });
  }
  if (version.id === currentApprovedVersionId) {
    badges.push({
      key: "approved",
      label: "Current approved Version",
      tone: "green",
    });
  }
  return badges;
};

export function PolicyVersionHistory({
  versions,
  loading,
  error,
  latestVersionId,
  currentApprovedVersionId,
  selectedVersionId,
  canWrite,
  canSubmit,
  canApprove,
  archived,
  onSelect,
  onRetry,
  onEdit,
  onSubmit,
  onApprove,
  onReject,
}: PolicyVersionHistoryProps) {
  return (
    <section className="card" data-testid="policy-version-history">
      <header className="card-head">
        <div>
          <h2>Version history</h2>
          <p>
            Latest Version is the highest sequence. Current approved Version is
            only set when an APPROVED Version is current.
          </p>
        </div>
        <button
          className="btn btn-secondary"
          type="button"
          onClick={onRetry}
          disabled={loading}
        >
          <RefreshCw size={15} /> Refresh
        </button>
      </header>
      <div className="card-pad">
        {loading ? (
          <div data-testid="policy-versions-loading">
            <LoadingState label="Loading Version history…" />
          </div>
        ) : error ? (
          <div data-testid="policy-versions-error">
            <ErrorState error={error} />
            <button
              className="btn btn-secondary"
              type="button"
              onClick={onRetry}
            >
              Retry
            </button>
          </div>
        ) : !versions || versions.length === 0 ? (
          <p className="muted">No Versions returned for this Policy.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table" data-testid="policy-versions-table">
              <caption>Policy Versions</caption>
              <thead>
                <tr>
                  <th scope="col">Version</th>
                  <th scope="col">Status</th>
                  <th scope="col">Dates</th>
                  <th scope="col">Actors</th>
                  <th scope="col">Frameworks</th>
                  <th scope="col">Change summary</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {versions.map((version) => {
                  const selected = version.id === selectedVersionId;
                  const badges = badgeFor(
                    version,
                    latestVersionId,
                    currentApprovedVersionId,
                  );
                  return (
                    <tr
                      key={version.id}
                      data-selected={selected ? "true" : "false"}
                      data-testid={`policy-version-row-${version.version}`}
                    >
                      <td>
                        <button
                          type="button"
                          className="tiny-btn"
                          onClick={() => onSelect(version)}
                          aria-pressed={selected}
                        >
                          <strong className="mono">{version.version}</strong>
                        </button>
                        <div className="stack" style={{ gap: 4, marginTop: 4 }}>
                          {badges.map((badge) => (
                            <Badge key={badge.key} tone={badge.tone}>
                              {badge.label}
                            </Badge>
                          ))}
                          {version.requiresEvidence ? (
                            <Badge tone="amber">Requires Evidence</Badge>
                          ) : null}
                        </div>
                      </td>
                      <td>{statusLabel(version.status)}</td>
                      <td>
                        <small>
                          Created {formatPolicyDateTime(version.createdAt)}
                          <br />
                          Submitted {formatPolicyDateTime(version.submittedAt)}
                          <br />
                          Approved {formatPolicyDateTime(version.approvedAt)}
                          <br />
                          Effective {formatPolicyDate(version.effectiveDate)} ·
                          Review {formatPolicyDate(version.reviewDate)}
                        </small>
                      </td>
                      <td>
                        <small>
                          Submitter {named(version.submittedBy, "—")}
                          <br />
                          Approver {named(version.approvedBy, "—")}
                          <br />
                          Requested{" "}
                          {named(version.requestedApprover, "Any eligible")}
                        </small>
                      </td>
                      <td>
                        {
                          version.frameworks.filter((mapping) => mapping.isActive)
                            .length
                        }
                      </td>
                      <td>
                        <span
                          style={{
                            whiteSpace: "pre-wrap",
                            display: "block",
                            maxWidth: 220,
                          }}
                        >
                          {display(
                            version.changeSummary
                              ? version.changeSummary.slice(0, 160)
                              : null,
                            "—",
                          )}
                        </span>
                      </td>
                      <td>
                        <div className="stack" style={{ gap: 4 }}>
                          {!archived &&
                          canWrite &&
                          isEditableVersionStatus(version.status) ? (
                            <button
                              className="btn btn-secondary"
                              type="button"
                              onClick={() => onEdit(version)}
                            >
                              <Pencil size={14} /> Edit
                            </button>
                          ) : null}
                          {!archived &&
                          canSubmit &&
                          (version.status === "DRAFT" ||
                            version.status === "REJECTED") ? (
                            <button
                              className="btn btn-secondary"
                              type="button"
                              onClick={() => onSubmit(version)}
                            >
                              <Send size={14} />{" "}
                              {version.status === "REJECTED"
                                ? "Resubmit"
                                : "Submit"}
                            </button>
                          ) : null}
                          {!archived &&
                          canApprove &&
                          version.status === "SUBMITTED" ? (
                            <>
                              <button
                                className="btn btn-primary"
                                type="button"
                                onClick={() => onApprove(version)}
                              >
                                <CheckCircle2 size={14} /> Approve
                              </button>
                              <button
                                className="btn btn-secondary"
                                type="button"
                                onClick={() => onReject(version)}
                              >
                                <XCircle size={14} /> Reject
                              </button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
