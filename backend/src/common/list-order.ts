import { z } from "zod";

/**
 * Shared list sorting. Callers pass an allowlist of column keys; anything else
 * is rejected by Zod before it reaches a repository. Never interpolate a
 * client string into Prisma `orderBy`.
 */
export const listOrderDirectionSchema = z.enum(["asc", "desc"]);

export type ListOrderDirection = z.infer<typeof listOrderDirectionSchema>;

export const listOrderFields = <const T extends readonly [string, ...string[]]>(
  columns: T,
) =>
  z.object({
    orderBy: z.enum(columns).optional(),
    order: listOrderDirectionSchema.optional(),
  });

/**
 * Builds a Prisma-compatible orderBy array from a validated query.
 * When the client omits `orderBy`, the repository default wins unchanged.
 */
export const resolveListOrder = <TColumn extends string, TOrder>(
  query: { orderBy?: TColumn; order?: ListOrderDirection },
  columnMap: Record<TColumn, TOrder>,
  fallback: TOrder | TOrder[],
): TOrder | TOrder[] => {
  if (query.orderBy === undefined) {
    return fallback;
  }
  const mapped = columnMap[query.orderBy];
  if (mapped === undefined) {
    return fallback;
  }
  const direction = query.order ?? "asc";
  // columnMap values are field-name maps filled by the caller, e.g.
  // { code: direction } via a factory that closes over direction.
  if (typeof mapped === "function") {
    return (mapped as (dir: ListOrderDirection) => TOrder)(direction);
  }
  return mapped;
};

/**
 * Helper: map column name → Prisma order object for simple scalar fields.
 */
export const scalarOrderMap = <TColumn extends string>(
  columns: readonly TColumn[],
  direction: ListOrderDirection,
): Record<TColumn, Record<TColumn, ListOrderDirection>> => {
  const result = {} as Record<TColumn, Record<TColumn, ListOrderDirection>>;
  for (const column of columns) {
    result[column] = { [column]: direction } as Record<
      TColumn,
      ListOrderDirection
    >;
  }
  return result;
};

/**
 * Preferred form used by repositories: given validated orderBy/order and a
 * map of column → builder, return the orderBy clause.
 */
export const buildListOrderBy = <TColumn extends string, TOrder>(
  query: { orderBy?: TColumn; order?: ListOrderDirection },
  builders: Record<TColumn, (direction: ListOrderDirection) => TOrder>,
  fallback: TOrder[],
): TOrder[] => {
  if (query.orderBy === undefined) {
    return fallback;
  }
  const builder = builders[query.orderBy];
  if (!builder) {
    return fallback;
  }
  const direction = query.order ?? "asc";
  const primary = builder(direction);
  // Keep a stable secondary key so equal primary values do not shuffle pages.
  return [primary, ...fallback.filter((item) => item !== primary)];
};
