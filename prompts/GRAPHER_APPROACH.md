# grapher

> Minimal, type-safe GraphQL client for TypeScript. Built with Bun.

---

## What is it

A small layer between your code and a GraphQL API. It sends operations, returns typed results, and lets you compose any extra behavior through a middleware system. No cache, no state, no framework opinions.

---

## Philosophy

- **Minimalista.** The core does one thing: execute GraphQL operations and return a typed result.
- **Type-safe from the document.** You define the response type once, inside `gql`. It flows through the entire chain automatically — no generics at the call site, ever.
- **Stateless.** No cache, no global state. Each `.send()` is independent.
- **Ecosystem compatible.** Accepts `TypedDocumentNode` from `graphql-js`, so it works with `graphql-codegen` and `gql.tada` out of the box.

---

## Killer features

These are what make grapher different from every other GraphQL client.

### `gql` with `TypedDocumentNode` — type lives in the document

Every other client asks you to pass the response type at the call site: `request<MyType>(url, doc)`. The type and the document live in different places and can drift apart silently.

In grapher, you define the type once inside `gql`. From that point it flows automatically through `.query()`, `.send()`, and `result.data` — no generics anywhere else, ever. If you change the query and forget to update the type, it's in the same place, impossible to miss.

```ts
const GET_USER = gql<
  { user: { id: string; name: string } },
  { id: string }
>`
  query GetUser($id: ID!) {
    user(id: $id) { id name }
  }
`

// TData and TVariables flow from the document — nothing to repeat
const result = await client.query(GET_USER, { id: '1' }).send()
result.data.user.name // string ✓
```

### Typed variables at compile time

Variables are part of the document type. Pass the wrong shape and TypeScript tells you before you ship — not at runtime in production.

```ts
// id is typed as string — passing a number is a compile error
await client.query(GET_USER, { id: 123 }).send()
//                             ^^
//           Type 'number' is not assignable to type 'string'
```

### Middleware pipeline that is type-safe

The plugin system is a middleware chain where each plugin receives a typed context. Auth, logging, retry, tracing — all first-class citizens with the same API. The client itself is just the default pipeline. You can write custom middlewares with identical power to the built-in ones.

```ts
const client = createClient({
  url: '...',
  plugins: [
    loggerPlugin(),
    retryPlugin({ maxAttempts: 3 }),
    async (ctx, next) => {
      ctx.headers['Authorization'] = `Bearer ${await getToken()}`
      return next(ctx)
    },
  ],
})
```

### `Result<T, E>` — no try/catch, ever

`.send()` never throws. It always returns `{ ok: true, data: T } | { ok: false, error: GqlError }`. You handle errors where they happen, with full type narrowing. Errors are discriminated by type so you can switch exhaustively.

```ts
const result = await client.query(GET_USER, { id: '1' }).send()

if (!result.ok) {
  switch (result.error.type) {
    case 'network':  // no connection
    case 'response': // server returned errors[]
    case 'timeout':  // exceeded timeout
  }
}
```

---

## Core features

These are the building blocks that make the killers possible.

**`createClient(config)`** — single entry point. Accepts URL, default headers, timeout, and plugins. Returns a client with `.query()`, `.mutation()`, and `.subscription()`.

**Fluent builder API** — every operation returns a builder. Chain `.use()`, `.timeout()`, and `.abort()` before calling `.send()`. Per-request options never affect the global client.

**HTTP transport** — built on native `fetch`. No polyfills needed in Bun or any modern runtime. Timeout via `AbortController`, custom headers per request.

**SSE transport** — subscriptions via Server-Sent Events. Returns an `AsyncIterable` you consume with `for await`. Reconnects automatically with backoff. Cleans up when the loop exits.

**Memory transport** — a transport that takes a handler function instead of a URL. No network, completely deterministic. The correct way to test code that uses grapher — no mocking `fetch`, no HTTP servers in tests.

**`retryPlugin`** — exponential backoff with jitter. Configurable attempts, delay, and a `shouldRetry` function to decide which errors qualify.

**`loggerPlugin`** — logs operation name, variables, duration, and result for every request. Configurable log function. Only use in development.

**Ecosystem compatible** — accepts any `TypedDocumentNode`. Works with `graphql-codegen` and `gql.tada` without any adapter or config change.

---

## How graphql-js is used

`graphql-js` is an optional `peerDependency`. grapher uses three things from it:

- `parse()` — converts the query string into a `DocumentNode` at definition time, not at request time. Syntax errors fail fast.
- `print()` — normalizes the document back to a string for the request body and for logging.
- `TypedDocumentNode` — the type that carries `TData` and `TVariables` inside the document. This is the standard interface the entire GraphQL ecosystem uses to communicate types.

grapher does not use the execution engine, resolvers, schema builder, or anything server-side.

---

## Type safety

The type of `result.data` comes from the document, not from a generic at the call site.

You define the response type and variables type once inside `gql`. From that point everything is inferred automatically — `.query()`, `.send()`, and `result.data` all know the shape.

```ts
// define once — type lives with the document
const GET_USER = gql<
  { user: { id: string; name: string; email: string } },
  { id: string }
>`
  query GetUser($id: ID!) {
    user(id: $id) {
      id
      name
      email
    }
  }
`

// use everywhere — zero generics, fully typed
const result = await client.query(GET_USER, { id: '1' }).send()

if (result.ok) {
  result.data.user.name   // string ✓
  result.data.user.age    // TypeScript error ✓
}

// wrong variable type — compile time error, not runtime
await client.query(GET_USER, { id: 123 }).send()
//                             ^^
//           Type 'number' is not assignable to type 'string'
```

For large response types, declare them separately and connect in `gql`:

```ts
type GetPostsData = {
  posts: Array<{
    id: string
    title: string
    author: { name: string }
  }>
}

type GetPostsVars = { limit: number; offset: number }

const GET_POSTS = gql<GetPostsData, GetPostsVars>`
  query GetPosts($limit: Int!, $offset: Int!) {
    posts(limit: $limit, offset: $offset) {
      id
      title
      author { name }
    }
  }
`
```

**Important:** `TData` must match exactly what the server returns. If the server returns `{ users: [...] }`, your type is `{ users: Array<...> }`. grapher does not transform the response.

---

## Project structure

```
grapher/
├── src/
│   ├── core/
│   │   ├── client.ts       # createClient() — fluent builder, public entry point
│   │   ├── executor.ts     # connects pipeline to transport, wraps result
│   │   ├── pipeline.ts     # middleware chain, typed context flow
│   │   └── types.ts        # shared contracts — no logic, only types
│   ├── gql.ts              # gql tagged template, parse(), TypedDocumentNode
│   ├── transport/
│   │   ├── http.ts         # fetch, AbortController, timeout
│   │   ├── sse.ts          # subscriptions, AsyncIterable, auto-reconnect
│   │   └── memory.ts       # in-memory transport for testing
│   ├── errors/
│   │   ├── types.ts        # GqlNetworkError, GqlResponseError, GqlTimeoutError
│   │   └── result.ts       # Result<T,E>, isOk, isErr
│   ├── plugins/
│   │   ├── retry.ts        # exponential backoff
│   │   └── logger.ts       # request/response debug logger
│   └── index.ts            # public barrel
├── tests/
│   ├── client.test.ts
│   ├── gql.test.ts
│   ├── pipeline.test.ts
│   └── memory.test.ts
├── examples/
│   ├── basic.ts
│   ├── with-plugins.ts
│   └── subscriptions.ts
├── package.json
├── tsconfig.json
└── build.ts                # bunup — ESM + CJS dual output
```

---

## Component reference

### `src/core/types.ts`
Only type definitions, no logic. Imported by everything else.
- `Operation` — `{ query: string; variables?: unknown; operationName?: string }`
- `RequestContext` — flows through the middleware chain: operation, headers, transport, response
- `TransportFn` — `(op: Operation, signal: AbortSignal) => Promise<GraphQLResponse>`
- `Middleware` — `(ctx: RequestContext, next: NextFn) => Promise<RequestContext>`

### `src/gql.ts`
The `gql` tagged template. Calls `parse()` from `graphql-js` and returns a `TypedDocumentNode<TData, TVariables>`. Fails at definition time if the document has syntax errors.

### `src/errors/result.ts`
`Result<T, E>` — discriminated union: `{ ok: true; data: T } | { ok: false; error: E }`. Exports `isOk()` and `isErr()` helpers.

### `src/errors/types.ts`
Three error types with a `type` discriminant:
- `GqlNetworkError` — `{ type: 'network'; message: string; cause?: unknown }`
- `GqlResponseError` — `{ type: 'response'; errors: GraphQLError[] }`
- `GqlTimeoutError` — `{ type: 'timeout'; ms: number }`

### `src/core/pipeline.ts`
`createPipeline(middlewares)` — runs the chain in order. Each middleware calls `next(ctx)` to continue or returns early to short-circuit.

### `src/core/executor.ts`
Runs the pipeline, calls the transport, processes the `GraphQLResponse`, and wraps everything in a `Result`.

### `src/core/client.ts`
`createClient(config)` returns an object with `.query()`, `.mutation()`, and `.subscription()`. Each returns a builder with `.use()`, `.timeout()`, `.abort()`, and `.send()`.

### `src/transport/http.ts`
`fetch`-based transport. POST with JSON body, `Content-Type: application/json`, timeout via `AbortController`.

### `src/transport/sse.ts`
SSE transport for subscriptions. Returns an `AsyncGenerator` that yields `Result` values per event. Reconnects automatically. Cleans up when the `for await` loop exits.

### `src/transport/memory.ts`
`memoryTransport(handler)` — accepts a function that receives the operation and returns a `GraphQLResponse`. No network. Used for testing.

### `src/plugins/retry.ts`
Middleware that retries on `GqlNetworkError` and `GqlTimeoutError`. Options: `maxAttempts`, `delay`, `jitter`, `shouldRetry`.

### `src/plugins/logger.ts`
Middleware that logs operation name, variables, duration, and outcome. Configurable log level and log function. Use only in development.

---

## Usage examples

### Query

```ts
import { createClient, gql } from 'grapher'

const client = createClient({
  url: 'https://api.example.com/graphql',
})

const GET_USERS = gql<
  { users: Array<{ id: string; name: string; email: string }> },
  never
>`
  query GetUsers {
    users {
      id
      name
      email
    }
  }
`

const result = await client.query(GET_USERS).send()

if (result.ok) {
  result.data.users.forEach(u => console.log(u.name))
} else {
  console.error(result.error.message)
}
```

### Mutation

```ts
const CREATE_USER = gql<
  { createUser: { id: string; name: string } },
  { input: { name: string; email: string } }
>`
  mutation CreateUser($input: UserInput!) {
    createUser(input: $input) {
      id
      name
    }
  }
`

const result = await client
  .mutation(CREATE_USER, { input: { name: 'Ana', email: 'ana@example.com' } })
  .send()
```

### Global plugins — auth, retry, logger

```ts
import { createClient } from 'grapher'
import { retryPlugin, loggerPlugin } from 'grapher/plugins'

const client = createClient({
  url: 'https://api.example.com/graphql',
  plugins: [
    loggerPlugin({ level: 'debug' }),
    retryPlugin({ maxAttempts: 3, delay: 500 }),
    async (ctx, next) => {
      ctx.headers['Authorization'] = `Bearer ${await getToken()}`
      return next(ctx)
    },
  ],
})
```

### Per-request options

```ts
const result = await client
  .query(GET_REPORT, { month: '2025-01' })
  .use(retryPlugin({ maxAttempts: 5 }))
  .timeout(15_000)
  .abort(controller.signal)
  .send()
```

### Subscription

```ts
const ON_MESSAGE = gql<
  { messageAdded: { id: string; text: string; author: string } },
  { roomId: string }
>`
  subscription OnMessage($roomId: ID!) {
    messageAdded(roomId: $roomId) {
      id
      text
      author
    }
  }
`

for await (const result of client.subscription(ON_MESSAGE, { roomId: '42' })) {
  if (result.ok) {
    console.log(result.data.messageAdded.text)
  }
}
// cleanup is automatic when the loop exits
```

### Testing with memory transport

```ts
import { createClient, memoryTransport } from 'grapher'

const client = createClient({
  transport: memoryTransport(async (op) => ({
    data: { users: [{ id: '1', name: 'Test', email: 'test@example.com' }] },
  })),
})

const result = await client.query(GET_USERS).send()

expect(result.ok).toBe(true)
expect(result.data.users[0].name).toBe('Test')
```

### Error handling

```ts
const result = await client.query(GET_USER, { id: '1' }).send()

if (!result.ok) {
  switch (result.error.type) {
    case 'network':
      console.error('Network:', result.error.message)
      break
    case 'response':
      result.error.errors.forEach(e => console.error(e.message))
      break
    case 'timeout':
      console.error(`Timed out after ${result.error.ms}ms`)
      break
  }
}
```

---

## MVP scope — v0.1

**Ships:**
- `createClient()` with fluent builder
- `gql` tagged template with `TypedDocumentNode`
- `.query()`, `.mutation()`, `.subscription()`
- `.use()`, `.timeout()`, `.abort()` on the builder
- `Result<T, E>` — no try/catch
- `GqlNetworkError`, `GqlResponseError`, `GqlTimeoutError`
- HTTP transport
- SSE transport
- Memory transport
- `retryPlugin`, `loggerPlugin`
- ESM + CJS dual build, full `.d.ts` output
- `graphql` as optional `peerDependency`

**Deliberately excluded:**
- Cache of any kind
- WebSocket transport
- Request batching
- Persisted queries
- Schema validation

---

## Roadmap

**v0.2** — WebSocket transport, request batching, persisted queries (APQ), schema validation plugin, `dedupPlugin`

**v1.0** — Stable API guarantee, OpenTelemetry plugin, multipart file upload, federation hints

---

*MIT license. Built with Bun and bunup.*
