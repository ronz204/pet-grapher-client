import type { GqlError } from "./types";

export type Result<TData, TError = GqlError> =
  | { ok: true; data: TData }
  | { ok: false; error: TError };
