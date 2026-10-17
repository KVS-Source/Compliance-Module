import {
  BadgeCheck,
  FileSearch,
  Inbox,
  ShieldAlert,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import { Link } from "react-router-dom";
import { ErrorState, LoadingState } from "../../components/feedback/AsyncState";
import { Badge } from "../../components/feedback/Badge";
import { PageHeader } from "../../components/feedback/PageHeader";
import { useAuth } from "../../context/AuthContext";
import { useTenant } from "../../context/TenantContext";
import { useApiResource } from "../../hooks/useApiResource";
import { capaApi } from "../../services/capaApi";
import { evidenceApi } from "../../services/evidenceApi";
import { gapApi } from "../../services/gapApi";
import { kpiApi } from "../../services/kpiApi";
import { riskApi } from "../../services/riskApi";

const PAGE_SIZE = 50;
const label = (value: string) => value.replaceAll("_", " ");

type WorkItem = {
  id: string;
  code: string;
  title: string;
  status: string;
  dueDate: string | null;
  overdue: boolean;
  href: string;
};

const sortWorkItems = (items: WorkItem[]) =>
  [...items].sort((left, right) => {
    if (left.overdue !== right.overdue) return left.overdue ? -1 : 1;
    const leftDue = left.dueDate ?? "9999-12-31";
    const rightDue = right.dueDate ?? "9999-12-31";
    if (leftDue !== rightDue) return leftDue.localeCompare(rightDue);
    return left.code.localeCompare(right.code);
  });

/**
 * Personal work queue for the signed-in user. Composes existing list endpoints
 * with `ownerId` / `awaitingMyDecision` filters rather than a new aggregate API.
 */
export function MyWorkPage() {
  const { user, hasPermission } = useAuth();
  const { contextVersion } = useTenant();
  const userId = user?.id;
  const tenantKey = `${user?.activeCompany.id}:${contextVersion}:${userId ?? ""}`;

  const canGaps = hasPermission("gaps:read");
  const canCapas = hasPermission("capa:read") || hasPermission("capas:read");
  const canRisks = hasPermission("risk:read") || hasPermission("risks:read");
  const canEvidence = hasPermission("evidence:read");
  const canEvidenceReview = hasPermission("evidence:review");
  const canKpis = hasPermission("kpis:read");

  const gaps = useApiResource(
    () =>
      canGaps && userId
        ? gapApi.list({
            page: 1,
            pageSize: PAGE_SIZE,
            ownerId: userId,
            orderBy: "dueDate",
            order: "asc",
          })
        : Promise.resolve(null),
    [tenantKey, canGaps, userId],
  );
  const capas = useApiResource(
    () =>
      canCapas && userId
        ? capaApi.list({
            page: 1,
            pageSize: PAGE_SIZE,
            ownerId: userId,
            orderBy: "dueDate",
            order: "asc",
          })
        : Promise.resolve(null),
    [tenantKey, canCapas, userId],
  );
  const risks = useApiResource(
    () =>
      canRisks && userId
        ? riskApi.list({
            page: 1,
            pageSize: PAGE_SIZE,
            ownerId: userId,
            lifecycle: "active",
            orderBy: "reviewDate",
            order: "asc",
          })
        : Promise.resolve(null),
    [tenantKey, canRisks, userId],
  );
  const evidenceReview = useApiResource(
    () =>
      canEvidence && canEvidenceReview
        ? evidenceApi.listEvidenceReviewQueue({ page: 1, pageSize: PAGE_SIZE })
        : Promise.resolve(null),
    [tenantKey, canEvidence, canEvidenceReview],
  );
  const kpiApprovals = useApiResource(
    () =>
      canKpis
        ? kpiApi.listActuals({
            page: 1,
            pageSize: PAGE_SIZE,
            awaitingMyDecision: true,
          })
        : Promise.resolve(null),
    [tenantKey, canKpis],
  );

  const loading =
    (canGaps && gaps.loading) ||
    (canCapas && capas.loading) ||
    (canRisks && risks.loading) ||
    (canEvidence && canEvidenceReview && evidenceReview.loading) ||
    (canKpis && kpiApprovals.loading);

  const firstError =
    gaps.error ||
    capas.error ||
    risks.error ||
    evidenceReview.error ||
    kpiApprovals.error;

  const openGapItems = sortWorkItems(
    (gaps.data?.data ?? [])
      .filter((item) => item.status !== "CLOSED" && item.status !== "CANCELLED")
      .map((item) => ({
        id: item.id,
        code: item.code,
        title: item.title,
        status: item.status,
        dueDate: item.dueDate,
        overdue: Boolean(item.overdue),
        href: `/compliance/gaps/${item.id}`,
      })),
  );
  const openCapaItems = sortWorkItems(
    (capas.data?.data ?? [])
      .filter((item) => item.status !== "CLOSED")
      .map((item) => ({
        id: item.id,
        code: item.code,
        title: item.title,
        status: item.status,
        dueDate: item.dueDate,
        overdue: Boolean(item.overdue),
        href: `/compliance/capa/${item.id}`,
      })),
  );
  const openRiskItems = sortWorkItems(
    (risks.data?.data ?? []).map((item) => ({
      id: item.id,
      code: item.code,
      title: item.title,
      status: item.status,
      dueDate: item.reviewDate ?? null,
      overdue: false,
      href: `/compliance/risks/${item.id}`,
    })),
  );
  const evidenceItems = sortWorkItems(
    (evidenceReview.data?.data ?? []).map((item) => ({
      id: item.id,
      code: item.code,
      title: item.title,
      status: item.lifecycleStatus,
      dueDate: item.expiresAt,
      overdue: Boolean(
        item.expiresAt && item.expiresAt < new Date().toISOString().slice(0, 10),
      ),
      href: `/evidence/${item.id}`,
    })),
  );
  const kpiItems = sortWorkItems(
    (kpiApprovals.data?.data ?? []).map((item) => ({
      id: item.id,
      code: item.code,
      title: item.configuration?.kpi?.name ?? item.period,
      status: item.approvalStatus,
      dueDate: null,
      overdue: false,
      href: `/kpi/approval?actualId=${item.id}`,
    })),
  );

  const sections = [
    canGaps
      ? {
          key: "gaps",
          title: "Open gaps",
          icon: TriangleAlert,
          items: openGapItems,
          empty: "No open gaps assigned to you.",
          restricted: false,
        }
      : {
          key: "gaps",
          title: "Open gaps",
          icon: TriangleAlert,
          items: [] as WorkItem[],
          empty: "Restricted — gaps:read is required.",
          restricted: true,
        },
    canCapas
      ? {
          key: "capas",
          title: "Open CAPAs",
          icon: Wrench,
          items: openCapaItems,
          empty: "No open CAPAs assigned to you.",
          restricted: false,
        }
      : {
          key: "capas",
          title: "Open CAPAs",
          icon: Wrench,
          items: [] as WorkItem[],
          empty: "Restricted — capa:read is required.",
          restricted: true,
        },
    canRisks
      ? {
          key: "risks",
          title: "Open risks",
          icon: ShieldAlert,
          items: openRiskItems,
          empty: "No open risks assigned to you.",
          restricted: false,
        }
      : {
          key: "risks",
          title: "Open risks",
          icon: ShieldAlert,
          items: [] as WorkItem[],
          empty: "Restricted — risk:read is required.",
          restricted: true,
        },
    canEvidence && canEvidenceReview
      ? {
          key: "evidence",
          title: "Evidence awaiting your review",
          icon: FileSearch,
          items: evidenceItems,
          empty: "No submitted evidence is waiting for review.",
          restricted: false,
        }
      : {
          key: "evidence",
          title: "Evidence awaiting your review",
          icon: FileSearch,
          items: [] as WorkItem[],
          empty: canEvidence
            ? "Restricted — evidence:review is required."
            : "Restricted — evidence:read is required.",
          restricted: true,
        },
    canKpis
      ? {
          key: "kpis",
          title: "KPI actuals awaiting your approval",
          icon: BadgeCheck,
          items: kpiItems,
          empty: "No KPI actuals are waiting for your decision.",
          restricted: false,
        }
      : {
          key: "kpis",
          title: "KPI actuals awaiting your approval",
          icon: BadgeCheck,
          items: [] as WorkItem[],
          empty: "Restricted — kpis:read is required.",
          restricted: true,
        },
  ];

  // Omit sections the caller cannot read when every other section is available —
  // still show restricted cards so the page explains why a bucket is empty.
  const visibleSections = sections.filter(
    (section) => !section.restricted || sections.some((item) => !item.restricted),
  );

  return (
    <div className="page">
      <PageHeader
        title="My work"
        section="Overview"
        description="Your open items across gaps, CAPAs, risks, evidence review and KPI approvals. Overdue items sort first."
        connected
      />

      {loading ? (
        <LoadingState label="Loading your work…" />
      ) : firstError ? (
        <ErrorState error={firstError} />
      ) : (
        <div className="my-work-grid" data-testid="my-work-grid">
          {visibleSections.map((section) => {
            const Icon = section.icon;
            return (
              <section
                className="card my-work-section"
                key={section.key}
                data-testid={`my-work-${section.key}`}
              >
                <header className="card-head">
                  <div>
                    <h2>
                      <Icon size={16} aria-hidden /> {section.title}
                    </h2>
                    {section.restricted ? <p>Permission restricted</p> : null}
                  </div>
                </header>
                <div className="card-pad">
                  {section.restricted || section.items.length === 0 ? (
                    <div className="empty-state compact">
                      <Inbox size={22} />
                      <p>{section.empty}</p>
                    </div>
                  ) : (
                    <ul className="my-work-list">
                      {section.items.map((item) => (
                        <li key={item.id}>
                          <Link to={item.href} className="my-work-item">
                            <div>
                              <strong>{item.title}</strong>
                              <small className="mono">{item.code}</small>
                            </div>
                            <div className="my-work-meta">
                              <Badge>{label(item.status)}</Badge>
                              {item.dueDate ? (
                                <span
                                  className={
                                    item.overdue ? "deadline-overdue" : undefined
                                  }
                                >
                                  {item.dueDate}
                                  {item.overdue ? " · Overdue" : ""}
                                </span>
                              ) : null}
                            </div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
