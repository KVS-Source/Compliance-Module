import { apiRequest } from "./apiClient";

const fallbackMeta = (page: number, pageSize: number, total: number) => ({
  page,
  pageSize,
  total,
  totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
});

export type RegisterType = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  active: boolean;
  recordCount: number;
  fields: Array<{ key: string; label: string; type: string }> | unknown;
};

export type RegisterRecord = {
  id: string;
  businessRecordCode: string;
  title: string;
  status: string | null;
  owner: { id: string; code: string; name: string } | null;
  sourceOwnerRef: string | null;
  department: { id: string; code: string; name: string } | null;
  recordDate: string | null;
  dueDate: string | null;
  overdue: boolean;
  fields: Record<string, string>;
  register: { id: string; code: string; name: string };
  source?: {
    sheet: string | null;
    row: number | null;
    importBatchId: string | null;
  };
  createdAt?: string;
  updatedAt?: string;
};

export const registerApi = {
  async listTypes(page = 1, pageSize = 50) {
    const response = await apiRequest<RegisterType[]>(
      `/operational-registers?page=${page}&pageSize=${pageSize}&active=true`,
    );
    return {
      data: response.data,
      meta: response.meta ?? fallbackMeta(page, pageSize, response.data.length),
    };
  },
  async listRecords(
    registerCode: string,
    query: {
      page?: number;
      pageSize?: number;
      q?: string;
      status?: string;
      ownerId?: string;
      departmentId?: string;
      overdue?: boolean;
    } = {},
  ) {
    const params = new URLSearchParams();
    params.set("page", String(query.page ?? 1));
    params.set("pageSize", String(query.pageSize ?? 20));
    if (query.q) params.set("q", query.q);
    if (query.status) params.set("status", query.status);
    if (query.ownerId) params.set("ownerId", query.ownerId);
    if (query.departmentId) params.set("departmentId", query.departmentId);
    if (query.overdue) params.set("overdue", "true");
    const response = await apiRequest<RegisterRecord[]>(
      `/operational-registers/${encodeURIComponent(registerCode)}/records?${params}`,
    );
    return {
      data: response.data,
      meta:
        response.meta ??
        fallbackMeta(query.page ?? 1, query.pageSize ?? 20, response.data.length),
    };
  },
  async getRecord(registerCode: string, recordId: string) {
    return (
      await apiRequest<RegisterRecord>(
        `/operational-registers/${encodeURIComponent(registerCode)}/records/${encodeURIComponent(recordId)}`,
      )
    ).data;
  },
};
