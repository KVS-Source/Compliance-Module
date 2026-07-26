import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { AuthRepository } from "../src/modules/auth/repository.js";
import { AuthService } from "../src/modules/auth/service.js";

describe("logout session handling", () => {
  it("does nothing when the refresh cookie is missing", async () => {
    const revokeSessionByHash = vi.fn();
    const service = new AuthService({
      revokeSessionByHash,
    } as unknown as AuthRepository);

    await expect(service.logout(undefined, {})).resolves.toBe(false);
    expect(revokeSessionByHash).not.toHaveBeenCalled();
  });

  it("passes only the refresh-token hash to the repository", async () => {
    const revokeSessionByHash = vi.fn().mockResolvedValue(true);
    const service = new AuthService({
      revokeSessionByHash,
    } as unknown as AuthRepository);
    const rawToken = "synthetic-refresh-token";

    await expect(
      service.logout(rawToken, {
        ip: "192.0.2.1",
        userAgent: "synthetic-test-agent",
      }),
    ).resolves.toBe(true);

    expect(revokeSessionByHash).toHaveBeenCalledWith(
      createHash("sha256").update(rawToken).digest("hex"),
      {
        ip: "192.0.2.1",
        userAgent: "synthetic-test-agent",
      },
    );
    expect(revokeSessionByHash).not.toHaveBeenCalledWith(
      rawToken,
      expect.anything(),
    );
  });
});
