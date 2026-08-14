import { apiRequest, pageQuery, setAccessToken } from "./apiClient";
import type { AuthResult, Company } from "../types/api";

export const tenantApi = {
  async list() {
    return (await apiRequest<Company[]>(`/tenants${pageQuery()}`)).data;
  },

  /**
   * Creates a Company and makes the caller its administrator. Requires
   * `tenants:write`, which only the Company Administrator profile holds.
   */
  async create(input: {
    code: string;
    name: string;
    industry?: string | null;
    country?: string | null;
  }) {
    return (
      await apiRequest<Company>("/tenants", {
        method: "POST",
        body: JSON.stringify(input),
      })
    ).data;
  },

  async switchCompany(companyId: string) {
    const response = await apiRequest<AuthResult>("/auth/tenant-context", {
      method: "POST",
      body: JSON.stringify({ companyId }),
    });
    setAccessToken(response.data.accessToken);
    return response.data.user;
  },
};
