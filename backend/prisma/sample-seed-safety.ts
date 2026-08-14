export interface DemoSeedEnvironment {
  NODE_ENV?: string;
  SAMPLE_SEED_PASSWORD?: string;
}

export const assertSampleSeedExecutionAllowed = (
  environment: DemoSeedEnvironment = process.env,
) => {
  if (environment.NODE_ENV === "production") {
    throw new Error("Sample seed execution is disabled in production");
  }
  if (
    environment.NODE_ENV !== "development" &&
    environment.NODE_ENV !== "test"
  ) {
    throw new Error(
      "Sample seed execution is allowed only in development or test",
    );
  }
  const password = environment.SAMPLE_SEED_PASSWORD;
  if (!password || password.length < 12) {
    throw new Error(
      "SAMPLE_SEED_PASSWORD must be supplied at runtime and contain at least 12 characters",
    );
  }
  return { password };
};
