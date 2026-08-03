import { readFile } from "node:fs/promises";

const required = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const baseUrl = required("SMOKE_BASE_URL").replace(/\/$/, "");
const email = required("SMOKE_USER_EMAIL");
const passwordFile = required("SMOKE_USER_PASSWORD_FILE");
const expectedKpis = Number(process.env.SMOKE_EXPECTED_KPI_COUNT ?? "91");
const expectedCompliance = Number(
  process.env.SMOKE_EXPECTED_COMPLIANCE ?? "31",
);

if (
  !baseUrl.startsWith("https://") &&
  process.env.ALLOW_LOCAL_PRODUCTION_SMOKE !== "true"
) {
  throw new Error(
    "Smoke target must use HTTPS unless local smoke is explicitly enabled",
  );
}

type Envelope = {
  success: boolean;
  data?: unknown;
  meta?: { total?: number };
  error?: { code?: string };
};

let accessToken = "";
let cookie = "";
const checks: string[] = [];

const call = async (
  path: string,
  options: RequestInit = {},
  expectedStatus = 200,
) => {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Accept: "application/json, text/csv",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...options.headers,
    },
  });
  if (response.status !== expectedStatus) {
    throw new Error(
      `${path} returned ${response.status}; expected ${expectedStatus}`,
    );
  }
  checks.push(`${path}:${response.status}`);
  return response;
};

const envelope = async (path: string) =>
  (await (await call(path)).json()) as Envelope;

const main = async () => {
  await envelope("/api/v1/health");
  await envelope("/api/v1/ready");

  const password = (await readFile(passwordFile, "utf8")).replace(
    /[\r\n]+$/,
    "",
  );
  const login = await call("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const loginPayload = (await login.json()) as Envelope;
  const loginData = loginPayload.data as
    | { accessToken?: string; user?: { activeCompany?: { id?: string } } }
    | undefined;
  if (!loginData?.accessToken || !loginData.user?.activeCompany?.id) {
    throw new Error("Login did not establish an approved Company context");
  }
  accessToken = loginData.accessToken;
  cookie = (login.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  if (!cookie) throw new Error("Login did not issue a refresh cookie");

  const dashboard = await envelope("/api/v1/dashboard/summary");
  const compliance = (
    dashboard.data as { compliance?: { overallPercentage?: number } }
  ).compliance?.overallPercentage;
  if (compliance !== expectedCompliance) {
    throw new Error(
      `Dashboard compliance is ${String(compliance)}, expected ${expectedCompliance}`,
    );
  }

  const kpis = await envelope("/api/v1/kpi-definitions?page=1&pageSize=1");
  if (kpis.meta?.total !== expectedKpis) {
    throw new Error(
      `KPI total is ${String(kpis.meta?.total)}, expected ${expectedKpis}`,
    );
  }

  for (const path of [
    "/api/v1/frameworks?page=1&pageSize=1",
    "/api/v1/policies?page=1&pageSize=1",
    "/api/v1/evidence?page=1&pageSize=1",
    "/api/v1/risks?page=1&pageSize=1",
    "/api/v1/gaps?page=1&pageSize=1",
    "/api/v1/capas?page=1&pageSize=1",
    "/api/v1/imports?page=1&pageSize=1",
  ]) {
    await envelope(path);
  }

  const csv = await call("/api/v1/exports/gaps.csv");
  if (!(csv.headers.get("content-type") ?? "").startsWith("text/csv")) {
    throw new Error("Gap export did not return CSV");
  }
  await call(
    "/api/v1/dashboard/summary",
    { headers: { Authorization: "" } },
    401,
  );

  const foreignPath = required("SMOKE_CROSS_TENANT_RESOURCE_PATH");
  await call(foreignPath, {}, 404);
  const evidencePath = required("SMOKE_EVIDENCE_DOWNLOAD_PATH");
  const evidenceResult = await fetch(`${baseUrl}${evidencePath}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (![200, 404, 409].includes(evidenceResult.status)) {
    throw new Error(
      `Evidence download contract returned ${evidenceResult.status}`,
    );
  }
  checks.push(`${evidencePath}:${evidenceResult.status}`);

  process.stdout.write(`${JSON.stringify({ success: true, checks })}\n`);
};

void main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Smoke verification failed";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
