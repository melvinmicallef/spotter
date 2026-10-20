export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export function isSqliteConstraint(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    String(error.code).startsWith('SQLITE_CONSTRAINT')
  );
}
