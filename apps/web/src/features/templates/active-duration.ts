const millisecondsPerDay = 24 * 60 * 60 * 1000;

function localDayNumber(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

export function activePlanDays(
  activeSince: string | null | undefined,
  today = new Date(),
): number | null {
  if (!activeSince) return null;
  const activationDate = new Date(activeSince);
  if (Number.isNaN(activationDate.getTime())) return null;

  return Math.max(
    0,
    Math.floor(
      (localDayNumber(today) - localDayNumber(activationDate)) /
        millisecondsPerDay,
    ),
  );
}
