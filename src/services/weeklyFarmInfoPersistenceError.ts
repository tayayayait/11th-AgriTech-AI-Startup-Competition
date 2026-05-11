export const isWeeklyFarmInfoPersistenceMissing = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;

  const source = error as Record<string, unknown>;
  const status = source.status;
  const code = source.code;
  const message = source.message;
  const details = source.details;

  return (
    status === 404
    || code === "PGRST205"
    || (typeof message === "string" && message.includes("weekly_farm_infos"))
    || (typeof details === "string" && details.includes("weekly_farm_infos"))
  );
};
