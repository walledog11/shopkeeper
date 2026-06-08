# @shopkeeper/db package surface

This package owns the Prisma client wrapper, DB enum exports, and shared data
contracts that must stay aligned across dashboard, gateway, and agent code.

## Public imports

- `@shopkeeper/db` is the primary public surface. Import the DB client, Prisma
  runtime, Prisma enum runtimes and value types, message helper, token helpers,
  spend helpers, refund helpers, and voice-proposal contract from the root.
- `@shopkeeper/db/test-helpers` is a public test-only subpath for integration tests.

## Private modules

Root files such as `crypto.ts`, `llm-spend.ts`, `spend-store.ts`,
`refund-spend.ts`, and `voice.ts` are implementation modules behind the root
export. Do not add direct subpath imports for them unless a caller has a clear
reason to depend on that narrower contract.

When adding a new public module, update `package.json` `exports`,
`tsconfig.json` `include`, and this note in the same change.
