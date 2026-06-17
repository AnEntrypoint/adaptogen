// Typed error model. Every agent-facing verb returns Result<T, DStateError>
// rather than throwing on bad input: misuse is data, not a crash. Internal
// invariant breaches (which mean dstate itself is wrong) still throw.

export type DStateErrorCode =
  | "NotFound"
  | "DuplicateId"
  | "InvalidInput"
  | "PayloadTooLarge"
  | "CycleRejected"
  | "IllegalTransition"
  | "HardBlocked"
  | "GuardParseError"
  | "IntegrityBroken"
  | "LockHeld"
  | "Conflict"
  | "ZoneNotFound"
  | "CheckpointNotFound"
  | "MigrationError"
  | "InvalidConfig";

export class DStateError extends Error {
  readonly code: DStateErrorCode;
  readonly details: Record<string, unknown> | undefined;
  constructor(code: DStateErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "DStateError";
    this.code = code;
    this.details = details;
  }
  toJSON(): { code: DStateErrorCode; message: string; details?: Record<string, unknown> } {
    return this.details === undefined
      ? { code: this.code, message: this.message }
      : { code: this.code, message: this.message, details: this.details };
  }
}

// Result type: explicit success/failure without exceptions on the happy/expected
// failure paths. `unwrap` is for tests and call sites that have already checked.
export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err<E> = { readonly ok: false; readonly error: E };
export type Result<T, E = DStateError> = Ok<T> | Err<E>;

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const err = <E>(error: E): Err<E> => ({ ok: false, error });

export function isOk<T, E>(r: Result<T, E>): r is Ok<T> {
  return r.ok;
}
export function isErr<T, E>(r: Result<T, E>): r is Err<E> {
  return !r.ok;
}

export function unwrap<T>(r: Result<T, DStateError>): T {
  if (r.ok) return r.value;
  throw r.error;
}

export function fail<T>(
  code: DStateErrorCode,
  message: string,
  details?: Record<string, unknown>,
): Result<T> {
  return err(new DStateError(code, message, details));
}
