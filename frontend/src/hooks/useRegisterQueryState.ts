import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTenant } from "../context/TenantContext";

export type SortOrder = "asc" | "desc";

type ParamSpec = {
  /** Keys that are written into the URL when truthy. */
  keys: readonly string[];
  /** Defaults applied when a key is absent (not written to the URL). */
  defaults?: Record<string, string>;
};

/**
 * URL-backed filter + sort state for register pages. A pasted link reproduces
 * the same view; company switches clear every param.
 */
export function useRegisterQueryState(spec: ParamSpec) {
  const { user } = useAuth();
  const { contextVersion } = useTenant();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeCompanyId = user?.activeCompany.id;

  const values = useMemo(() => {
    const next: Record<string, string> = {};
    for (const key of spec.keys) {
      const raw = searchParams.get(key);
      if (raw !== null && raw !== "") {
        next[key] = raw;
      } else if (spec.defaults?.[key] !== undefined) {
        next[key] = spec.defaults[key]!;
      } else {
        next[key] = "";
      }
    }
    return next;
  }, [searchParams, spec.keys, spec.defaults]);

  const page = useMemo(() => {
    const raw = Number(searchParams.get("page") ?? "1");
    return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1;
  }, [searchParams]);

  const orderBy = searchParams.get("orderBy") ?? "";
  const orderParam = searchParams.get("order");
  const order: SortOrder =
    orderParam === "desc" || orderParam === "asc" ? orderParam : "asc";

  const updateParams = useCallback(
    (
      changes: Record<string, string | number | boolean | null | undefined>,
      options: { resetPage?: boolean } = {},
    ) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          for (const [key, value] of Object.entries(changes)) {
            if (
              value === null ||
              value === undefined ||
              value === "" ||
              value === false
            ) {
              next.delete(key);
            } else if (value === true) {
              next.set(key, "true");
            } else {
              next.set(key, String(value));
            }
          }
          if (options.resetPage !== false && !("page" in changes)) {
            next.delete("page");
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setPage = useCallback(
    (nextPage: number) => {
      updateParams(
        { page: nextPage <= 1 ? "" : String(nextPage) },
        { resetPage: false },
      );
    },
    [updateParams],
  );

  const toggleSort = useCallback(
    (column: string) => {
      if (orderBy === column) {
        if (order === "asc") {
          updateParams({ orderBy: column, order: "desc" });
        } else {
          updateParams({ orderBy: "", order: "" });
        }
      } else {
        updateParams({ orderBy: column, order: "asc" });
      }
    },
    [order, orderBy, updateParams],
  );

  // Company switch drops every filter so no query survives a tenant change.
  const tenantKeyRef = useRef(`${activeCompanyId}:${contextVersion}`);
  useEffect(() => {
    const key = `${activeCompanyId}:${contextVersion}`;
    if (tenantKeyRef.current === key) return;
    tenantKeyRef.current = key;
    setSearchParams(new URLSearchParams(), { replace: true });
  }, [activeCompanyId, contextVersion, setSearchParams]);

  return {
    values,
    page,
    orderBy,
    order,
    updateParams,
    setPage,
    toggleSort,
    searchParams,
  };
}

/** Debounced draft search that writes `q` into the register URL state. */
export function useDebouncedSearchParam(
  appliedSearch: string,
  updateParams: (
    changes: Record<string, string>,
    options?: { resetPage?: boolean },
  ) => void,
  delayMs = 300,
) {
  const [draftSearch, setDraftSearch] = useState(appliedSearch);

  useEffect(() => {
    setDraftSearch((current) =>
      current.trim() === appliedSearch ? current : appliedSearch,
    );
  }, [appliedSearch]);

  useEffect(() => {
    if (draftSearch.trim() === appliedSearch) return;
    const timer = window.setTimeout(() => {
      updateParams({ q: draftSearch.trim() });
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [appliedSearch, draftSearch, delayMs, updateParams]);

  return { draftSearch, setDraftSearch };
}
