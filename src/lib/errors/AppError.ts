// Client-only wrapper. NEVER thrown from server functions — server code must
// throw a plain Error whose message begins with an APP-XXX-### code.
import type { AppErrorCode } from "./codes";
import { ERR } from "./codes";
import { ERRORS } from "./catalog";

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly title: string;
  readonly description?: string;
  constructor(code: AppErrorCode, options?: { cause?: unknown; description?: string }) {
    const entry = ERRORS[code] ?? ERRORS[ERR.UNKNOWN];
    super(entry.title);
    this.name = "AppError";
    this.code = entry.code;
    this.title = entry.title;
    this.description = options?.description ?? entry.description;
    if (options?.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}
