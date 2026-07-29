const forbiddenSecretKeys = new Set([
  "refreshToken",
  "refresh_token",
  "refreshId",
  "refresh_id",
  "password",
  "passwordHash",
  "password_hash",
  "tokenHash",
  "token_hash",
  "sessionSecret",
]);

export type SafeCookieMetadata = {
  name: string;
  attributes: {
    names: string[];
    httpOnly: boolean;
    secure: boolean;
    sameSite?: "Lax" | "Strict" | "None";
    path?: string;
  };
};

const safeSameSiteValue = (
  value: string | undefined,
): "Lax" | "Strict" | "None" | undefined => {
  const normalised = value?.toLowerCase();
  if (normalised === "lax") return "Lax";
  if (normalised === "strict") return "Strict";
  if (normalised === "none") return "None";
  return undefined;
};

export const sanitiseSetCookieHeader = (
  header: string | undefined,
): SafeCookieMetadata => {
  if (!header) throw new Error("Set-Cookie header is missing");

  const [cookiePair, ...attributeParts] = header
    .split(";")
    .map((part) => part.trim());
  const separator = cookiePair?.indexOf("=") ?? -1;
  const name = separator > 0 ? cookiePair!.slice(0, separator).trim() : "";
  if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name)) {
    throw new Error("Set-Cookie header has an invalid cookie name");
  }

  const attributes = new Map<string, string | undefined>();
  for (const part of attributeParts) {
    const attributeSeparator = part.indexOf("=");
    const attributeName = (
      attributeSeparator === -1 ? part : part.slice(0, attributeSeparator)
    )
      .trim()
      .toLowerCase();
    if (!attributeName) continue;
    attributes.set(
      attributeName,
      attributeSeparator === -1
        ? undefined
        : part.slice(attributeSeparator + 1).trim(),
    );
  }

  const sameSite = safeSameSiteValue(attributes.get("samesite"));
  const path = attributes.get("path");

  return {
    name,
    attributes: {
      names: [...attributes.keys()].sort(),
      httpOnly: attributes.has("httponly"),
      secure: attributes.has("secure"),
      ...(sameSite ? { sameSite } : {}),
      ...(path?.startsWith("/") ? { path } : {}),
    },
  };
};

export const collectPropertyPaths = (
  value: unknown,
  parentPath = "",
  visited = new WeakSet<object>(),
): string[] => {
  if (value === null || typeof value !== "object") return [];
  if (visited.has(value)) return [];
  visited.add(value);

  const paths: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    const path = parentPath ? `${parentPath}.${key}` : key;
    paths.push(path);
    paths.push(...collectPropertyPaths(child, path, visited));
  }
  return paths;
};

export const findForbiddenSecretPaths = (value: unknown): string[] =>
  collectPropertyPaths(value).filter((path) => {
    const key = path.slice(path.lastIndexOf(".") + 1);
    return forbiddenSecretKeys.has(key);
  });
