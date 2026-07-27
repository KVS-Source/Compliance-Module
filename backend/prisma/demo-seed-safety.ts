export interface DemoSeedEnvironment {
  NODE_ENV?: string;
  ALLOW_DEMO_SEED?: string;
  DEMO_SEED_PASSWORD?: string;
}

export const assertDemoSeedExecutionAllowed = (
  environment: DemoSeedEnvironment = process.env,
) => {
  if (
    environment.NODE_ENV === "production" &&
    environment.ALLOW_DEMO_SEED !== "true"
  ) {
    throw new Error(
      "Demo seed execution is disabled in production unless ALLOW_DEMO_SEED=true",
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
