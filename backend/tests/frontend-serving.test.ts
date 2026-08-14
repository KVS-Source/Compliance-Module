import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { PrismaClient } from "@prisma/client";
import type { Express } from "express";

describe("React frontend delivery", () => {
  let app: Express;

  beforeAll(async () => {
    process.env.DATABASE_URL ??=
      "postgresql://user:pass@localhost:5432/frontend-serving";
    process.env.JWT_ACCESS_SECRET ??=
      "frontend-serving-test-secret-with-32-characters";
    process.env.FRONTEND_DIST ??= "../frontend/dist";
    process.env.PROTOTYPE_DIR ??= "../docs/prototype";
    const module = await import("../src/app.js");
    app = module.createApp({} as PrismaClient);
  });

  it("serves the React entry for root and browser-side routes", async () => {
    for (const path of ["/", "/dashboard", "/admin/users"]) {
      const response = await request(app).get(path).expect(200);
      expect(response.text).toContain('<div id="root"></div>');
      expect(response.headers["content-security-policy"]).toContain(
        "default-src 'self'",
      );
    }
  });

  it("serves the unchanged approved prototype at the reference URL", async () => {
    const response = await request(app)
      .get("/prototype/GenBioCa-Compliance-Platform.html")
      .expect(200);
    expect(response.text).toContain("GenBioCa Compliance Platform");
    expect(response.text).toContain("const ROUTES={");
  });
});
