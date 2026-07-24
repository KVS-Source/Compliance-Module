import { describe, expect, it } from "vitest";
import { pageMeta } from "../src/common/responses/envelope.js";
import { paginationSchema } from "../src/common/responses/pagination.js";

describe("response and pagination helpers", () => {
  it("calculates pages, including an empty result", () => {
    expect(pageMeta(2, 20, 41)).toEqual({
      page: 2,
      pageSize: 20,
      total: 41,
      totalPages: 3,
    });
    expect(pageMeta(1, 20, 0).totalPages).toBe(0);
  });

  it("coerces valid query strings and rejects unsafe bounds", () => {
    expect(paginationSchema.parse({ page: "2", pageSize: "50" })).toEqual({
      page: 2,
      pageSize: 50,
    });
    expect(() => paginationSchema.parse({ page: "0" })).toThrow();
    expect(() => paginationSchema.parse({ pageSize: "101" })).toThrow();
  });
});
