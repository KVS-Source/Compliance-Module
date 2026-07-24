import type { PrismaClient } from "@prisma/client";

export class UsersRepository {
  constructor(private readonly db: PrismaClient) {}

  findInCompany(userId: string, tenantId: string) {
    return this.db.user.findFirst({
      where: {
        id: userId,
        memberships: { some: { tenantId, status: "ACTIVE" } },
      },
      include: {
        memberships: {
          where: { tenantId, status: "ACTIVE" },
          include: { department: true },
        },
        roles: {
          where: { tenantId, status: "ACTIVE", role: { status: "ACTIVE" } },
          include: { role: true },
        },
      },
    });
  }
}
