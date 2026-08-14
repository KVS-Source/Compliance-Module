import { apiRequest } from "./apiClient";

const fallbackMeta = (page: number, pageSize: number, total: number) => ({
  page,
  pageSize,
  total,
  totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
});

export const genracApi = {
  async status() {
    return (
      await apiRequest<{
        connection: {
          id: string;
          systemCode: string;
          displayName: string;
          connectorType: string;
          status: string;
          secretRefKeys: string[];
          config: Record<string, unknown>;
          lastTestedAt: string | null;
          lastTestSuccess: boolean | null;
          lastTestMessage: string | null;
          lastSuccessfulSyncAt: string | null;
          lastAttemptedSyncAt: string | null;
          configurationExplanation?: string;
        };
        mappingCount: number;
        lastSyncRun: {
          id: string;
          status: string;
          mode: string;
          createCount: number;
          updateCount: number;
          conflictCount: number;
          invalidCount: number;
          startedAt: string;
          completedAt: string | null;
        } | null;
        liveAccess: boolean;
        adapters: {
          csvFile: boolean;
          rest: boolean;
          postgresReadonly: boolean;
        };
      }>("/integrations/genrac/status")
    ).data;
  },
  async testConnection() {
    return (
      await apiRequest<{ ok: boolean; message: string }>(
        "/integrations/genrac/test-connection",
        { method: "POST", body: "{}" },
      )
    ).data;
  },
  async preview() {
    return (
      await apiRequest<{
        syncRunId: string;
        counts: {
          create: number;
          update: number;
          conflict: number;
          invalid: number;
          skip: number;
        };
        changeCount: number;
      }>("/integrations/genrac/preview", { method: "POST", body: "{}" })
    ).data;
  },
  async sync() {
    return (
      await apiRequest<{
        create: number;
        update: number;
        conflict: number;
        invalid: number;
        skip: number;
      }>("/integrations/genrac/sync", { method: "POST", body: "{}" })
    ).data;
  },
  async history(page = 1, pageSize = 20) {
    const response = await apiRequest<
      Array<{
        id: string;
        status: string;
        mode: string;
        createCount: number;
        updateCount: number;
        conflictCount: number;
        invalidCount: number;
        startedAt: string;
        completedAt: string | null;
      }>
    >(`/integrations/genrac/history?page=${page}&pageSize=${pageSize}`);
    return {
      data: response.data,
      meta: response.meta ?? fallbackMeta(page, pageSize, response.data.length),
    };
  },
};
