import type { ZodError } from 'zod';

/** A user-actionable error: message is printed without a stack trace. */
export class ArcanaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArcanaError';
  }
}

export function formatZodError(err: ZodError, source: string): string {
  const lines = err.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
    return `  ${path}: ${issue.message}`;
  });
  return `Invalid ${source}:\n${lines.join('\n')}`;
}
