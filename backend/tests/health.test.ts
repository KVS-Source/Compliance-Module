import type { PrismaClient } from "@prisma/client";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";

describe("operational health endpoints", () => {
  it("keeps liveness independent of database connectivity", async () => {
    const db = {
      $queryRaw: vi.fn().mockRejectedValue(new Error("unavailable")),
    } as unknown as PrismaClient;

    const response = await request(createApp(db))
      .get("/api/v1/health")
      .expect(200);
    expect(response.body).toEqual({
      success: true,
      data: { status: "ok" },
    });
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it("reports ready only after a successful database check", async () => {
    const db = {
      $queryRaw: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
    } as unknown as PrismaClient;

    const response = await request(createApp(db))
      .get("/api/v1/ready")
      .expect(200);
    expect(response.body).toEqual({
      success: true,
      data: { status: "ready" },
    });
    expect(db.$queryRaw).toHaveBeenCalledOnce();
  });

  it("returns a generic unavailable response without database details", async () => {
    const db = {
      $queryRaw: vi
        .fn()
        .mockRejectedValue(new Error("synthetic internal database detail")),
    } as unknown as PrismaClient;

    const response = await request(createApp(db))
      .get("/api/v1/ready")
      .expect(503);
    expect(response.body).toEqual({
      success: false,
      error: {
        code: "NOT_READY",
        message: "Service is not ready",
      },
    });
    expect(JSON.stringify(response.body)).not.toContain("synthetic internal");
  });
});
