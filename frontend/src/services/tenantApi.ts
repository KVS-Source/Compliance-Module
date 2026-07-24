import { apiRequest, pageQuery, setAccessToken } from "./apiClient";
import type { AuthResult, Company } from "../types/api";

export const tenantApi = {
  async list() {
    return (await apiRequest<Company[]>(`/tenants${pageQuery()}`)).data;
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
