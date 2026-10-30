/** Stand-in for the `cloudflare:workers` runtime module so unit tests can import the Worker's entry in Node (see vitest.config.ts). */
export class DurableObject<E = unknown> {
  constructor(
    readonly ctx: unknown,
    readonly env: E,
  ) {}
}
export class WorkflowEntrypoint<E = unknown> {
  constructor(
    readonly ctx: unknown,
    readonly env: E,
  ) {}
}
