export type SeedMode = "development" | "test";

export const assertSeedExecutionAllowed = (
  argumentsList: string[],
  nodeEnvironment = process.env.NODE_ENV,
): SeedMode => {
  if (nodeEnvironment === "production") {
    throw new Error("Development and test seed execution is disabled in production");
  }
  if (argumentsList.includes("--development")) return "development";
  if (argumentsList.includes("--test-fixture") && nodeEnvironment === "test") {
    return "test";
  }
  throw new Error(
    "Seed execution requires the explicit development or isolated-test command",
  );
};
