export interface DemoSeedEnvironment {
  NODE_ENV?: string;
  DEMO_SEED_PASSWORD?: string;
}

export const assertDemoSeedExecutionAllowed = (
  environment: DemoSeedEnvironment = process.env,
) => {
  if (environment.NODE_ENV === "production") {
    throw new Error("Demo seed execution is disabled in production");
  }
  if (
    environment.NODE_ENV !== "development" &&
    environment.NODE_ENV !== "test"
  ) {
    throw new Error(
      "Demo seed execution is allowed only in development or test",
    );
  }
  const password = environment.DEMO_SEED_PASSWORD;
  if (!password || password.length < 12) {
    throw new Error(
      "DEMO_SEED_PASSWORD must be supplied at runtime and contain at least 12 characters",
    );
  }
  return { password };
};
