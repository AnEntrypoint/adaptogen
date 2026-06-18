// Minimal ambient declarations so `tsc --noEmit` typechecks offline without
// pulling `bun-types` over the network. The runtime under `bun` provides the
// real implementations; these only describe the surface adaptogen actually uses.

declare module "bun:sqlite" {
  export interface Statement<R = unknown> {
    all(...params: unknown[]): R[];
    get(...params: unknown[]): R | null;
    run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
    values(...params: unknown[]): unknown[][];
    finalize(): void;
  }
  export class Database {
    constructor(filename?: string, options?: { readonly?: boolean; create?: boolean; readwrite?: boolean });
    query<R = unknown>(sql: string): Statement<R>;
    prepare<R = unknown>(sql: string): Statement<R>;
    run(sql: string, ...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
    exec(sql: string): void;
    transaction<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R;
    close(): void;
    readonly filename: string;
    serialize(): Uint8Array;
  }
}

declare module "bun:test" {
  export const test: (name: string, fn: () => void | Promise<void>) => void;
  export const describe: (name: string, fn: () => void) => void;
  export const expect: (actual: unknown) => any;
  export const beforeEach: (fn: () => void | Promise<void>) => void;
  export const afterEach: (fn: () => void | Promise<void>) => void;
}

declare module "node:crypto" {
  export interface Hasher {
    update(data: string, inputEncoding?: string): Hasher;
    digest(encoding: string): string;
  }
  export function createHash(algorithm: string): Hasher;
}

declare module "node:fs" {
  export function existsSync(path: string): boolean;
  export function openSync(path: string, flags: string): number;
  export function closeSync(fd: number): void;
  export function unlinkSync(path: string): void;
  export function writeSync(fd: number, data: string): number;
  export function readFileSync(path: string, encoding: string): string;
  export function writeFileSync(path: string, data: string): void;
  export function mkdirSync(path: string, opts?: { recursive?: boolean }): void;
  export function rmSync(path: string, opts?: { recursive?: boolean; force?: boolean }): void;
}

declare const Bun: {
  version: string;
  argv: string[];
};

declare const performance: { now(): number };

declare const process: {
  argv: string[];
  pid: number;
  exit(code?: number): never;
  stdout: { write(s: string): boolean | void };
  stderr: { write(s: string): boolean | void };
};
