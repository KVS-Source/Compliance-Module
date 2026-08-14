import { apiBlobRequest, apiRequest } from "./apiClient";
import type {
  UserImportCandidate,
  UserImportPreview,
  UserImportReport,
  UserImportTemplate,
} from "../types/api";

/**
 * Bulk user onboarding.
 *
 * The file is only ever read in the browser and posted as text: the API is the
 * sole authority on what a row means, so the client never decides that a role
 * is valid or that a department exists. The initial password is supplied with
 * the commit request and is never written into the file or returned.
 */
export const userImportApi = {
  async template() {
    return (await apiRequest<UserImportTemplate>("/users/import/template"))
      .data;
  },
  downloadTemplate() {
    return apiBlobRequest(
      "/users/import/template.csv",
      "genbioca-user-import-template.csv",
    );
  },
  async preview(csv: string) {
    return (
      await apiRequest<UserImportPreview>("/users/import/preview", {
        method: "POST",
        body: JSON.stringify({ csv }),
      })
    ).data;
  },
  async commit(initialPassword: string, rows: readonly UserImportCandidate[]) {
    return (
      await apiRequest<UserImportReport>("/users/import/commit", {
        method: "POST",
        body: JSON.stringify({
          initialPassword,
          rows: rows.map((row) => ({
            line: row.line,
            code: row.code,
            name: row.name,
            email: row.email,
            phone: row.phone,
            departmentId: row.departmentId,
            roleCode: row.roleCode,
            status: row.status,
          })),
        }),
      })
    ).data;
  },
};
