import type { GqlError } from "./error";

export type Result<TData, TError = GqlError> =
  | { ok: true; data: TData }
  | { ok: false; error: TError };
