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

---

### 🔑 Type lives in the document, not at the call site

Every other client asks you to pass the response type as a generic at the call site: `request<MyType>(url, doc)`. This means the type and the document live in separate places and can silently drift apart — you update the query, forget the type, and TypeScript has no way to warn you.

In grapher, you define `TData` and `TVariables` once inside `gql`. From that point the type flows automatically through `.query()`, `.send()`, and `result.data`. There are no generics anywhere else in your codebase, ever.

```ts
// the type is declared here — once, next to the document
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

// and it flows here automatically — nothing to repeat
const result = await client.query(GET_USER, { id: '1' }).send()

if (result.ok) {
  result.data.user.name   // string ✓
  result.data.user.age    // TypeScript error — 'age' does not exist ✓
}
```

For large or complex types, declare them separately and connect them in `gql`. The document stays the single source of truth either way.

```ts
type GetPostsData = {
  posts: Array<{
    id: string
    title: string
    publishedAt: string
    author: { name: string; avatar: string }
  }>
}

type GetPostsVars = {
  limit: number
  offset: number
}

const GET_POSTS = gql<GetPostsData, GetPostsVars>`
  query GetPosts($limit: Int!, $offset: Int!) {
    posts(limit: $limit, offset: $offset) {
      id
      title
      publishedAt
      author { name avatar }
    }
  }
`

// still zero generics at the call site
const result = await client.query(GET_POSTS, { limit: 10, offset: 0 }).send()
```

---

### 🔑 Variables typed at compile time

Variables are not an afterthought. They are the second generic in `gql<TData, TVariables>`, which means the second argument to `.query()` and `.mutation()` is fully typed. Pass the wrong shape and TypeScript tells you before you run a single line — not in production at 2am.

```ts
// correct — TypeScript is happy
await client.query(GET_USER, { id: '1' }).send()

// wrong type — compile error, not a runtime surprise
await client.query(GET_USER, { id: 123 }).send()
//                             ^^
//           Type 'number' is not assignable to type 'string'

// missing variable — compile error
await client.query(GET_USER, {}).send()
//                             ^^
//           Property 'id' is missing
```

---

### 🔑 Middleware pipeline that is type-safe and composable

Most clients give you a `beforeRequest` hook at best. grapher gives you a full middleware chain where each plugin is a function that receives a typed context and a `next` function. Calling `next(ctx)` continues the chain. Not calling it short-circuits — useful for returning cached responses, aborting early, or mocking in tests.

The important part: every plugin you write has exactly the same power as the built-in ones. There is no special internal API.

```ts
// auth, logging, retry — all composed the same way
const client = createClient({
  url: 'https://api.example.com/graphql',
  plugins: [
    loggerPlugin({ level: 'debug' }),
    retryPlugin({ maxAttempts: 3, delay: 500 }),

    // a custom middleware — same API, full power
    async (ctx, next) => {
      ctx.headers['Authorization'] = `Bearer ${await getToken()}`
      const result = await next(ctx)
      console.log('request finished in', result.duration, 'ms')
      return result
    },
  ],
})
```

Plugins added globally run for every request. Plugins added with `.use()` run only for that specific request, without touching the global client config.

```ts
// this retry config applies only to this one request
const result = await client
  .query(FLAKY_QUERY, { id: '1' })
  .use(retryPlugin({ maxAttempts: 5, delay: 1000 }))
  .send()
```

---

### 🔑 `Result<T, E>` — no try/catch, ever

`.send()` never throws. It always returns a discriminated union:

```ts
type Result<T, E> =
  | { ok: true;  data: T  }
  | { ok: false; error: E }
```

You check `result.ok` and TypeScript narrows the type automatically. Errors are discriminated by a `type` field so you can handle each case precisely and exhaustively. No more empty catch blocks, no more swallowed errors.

```ts
const result = await client.query(GET_USER, { id: '1' }).send()

if (!result.ok) {
  switch (result.error.type) {

    case 'network':
      // the request never completed — no connection, DNS failure, CORS, etc.
      // result.error: { type: 'network'; message: string; cause?: unknown }
      console.error('Network error:', result.error.message)
      break

    case 'response':
      // the server responded but included an errors[] array
      // result.error: { type: 'response'; errors: GraphQLError[] }
      result.error.errors.forEach(e =>
        console.error(e.message, 'at path:', e.path?.join('.'))
      )
      break

    case 'timeout':
      // the request exceeded the configured timeout
      // result.error: { type: 'timeout'; ms: number }
      console.error(`Timed out after ${result.error.ms}ms`)
      break
  }
  return
}

// TypeScript knows result.data exists here — no assertion needed
console.log(result.data.user.name)
```

---

## Core features

The building blocks. Each one does exactly one thing.

---

### `createClient(config)`

The single entry point for the entire library. Accepts:

- `url` — the GraphQL endpoint
- `headers` — default headers sent with every request
- `timeout` — default timeout in milliseconds for every request
- `plugins` — array of middlewares that run for every request
- `transport` — override the default HTTP transport (useful for testing with `memoryTransport`)

Returns a client with `.query()`, `.mutation()`, and `.subscription()`.

```ts
const client = createClient({
  url: 'https://api.example.com/graphql',
  headers: { 'x-api-key': process.env.API_KEY },
  timeout: 10_000,
  plugins: [loggerPlugin(), retryPlugin({ maxAttempts: 3 })],
})
```

---

### Fluent builder API

Every operation returns a builder. The builder lets you configure the individual request without touching the global client. The chain always ends with `.send()`.

| Method | What it does |
|---|---|
| `.use(plugin)` | Add a middleware for this request only |
| `.timeout(ms)` | Override the global timeout for this request |
| `.abort(signal)` | Attach an `AbortController` signal for manual cancellation |
| `.send()` | Execute the operation — returns `Promise<Result<TData, GqlError>>` |

```ts
const controller = new AbortController()

const result = await client
  .query(GET_REPORT, { month: '2025-01' })
  .use(retryPlugin({ maxAttempts: 5 }))
  .timeout(20_000)
  .abort(controller.signal)
  .send()
```

---

### HTTP transport

The default transport. Built on native `fetch` — no polyfills needed in Bun or any modern runtime. Sends a POST request with a JSON body. Timeout is implemented via `AbortController` internally, so it cancels the actual network request rather than just ignoring the response.

---

### SSE transport — subscriptions

Subscriptions use Server-Sent Events. `.subscription()` returns an `AsyncIterable<Result<TData, GqlError>>` that you consume with `for await`. Each event from the server yields one `Result`. The connection reconnects automatically with exponential backoff if it drops. Cleanup is automatic when you break out of the loop.

```ts
for await (const result of client.subscription(ON_MESSAGE, { roomId: '42' })) {
  if (result.ok) {
    console.log(result.data.messageAdded.text)
  }
}
// breaking the loop closes the connection automatically
```

---

### Memory transport — testing without a network

A transport that takes a handler function instead of a URL. The handler receives the operation and returns whatever you tell it to. No network, no mocks, completely deterministic. This is the correct way to test any code that depends on grapher — you get full control over every response without intercepting `fetch`.

```ts
const client = createClient({
  transport: memoryTransport(async (op) => {
    if (op.operationName === 'GetUser') {
      return { data: { user: { id: '1', name: 'Test', email: 'test@test.com' } } }
    }
    return { errors: [{ message: 'not found' }] }
  }),
})
```

---

### `retryPlugin`

Retries failed requests automatically. Catches `GqlNetworkError` and `GqlTimeoutError` and re-runs the operation with a delay that grows exponentially between attempts. Jitter is enabled by default to avoid thundering herd.

| Option | Default | Description |
|---|---|---|
| `maxAttempts` | `3` | Maximum number of total attempts |
| `delay` | `500` | Base delay in ms between attempts |
| `jitter` | `true` | Adds randomness to the delay |
| `shouldRetry` | network + timeout errors | Function to decide which errors qualify |

```ts
retryPlugin({
  maxAttempts: 4,
  delay: 300,
  shouldRetry: (err) => err.type === 'network',
})
```

---

### `loggerPlugin`

Logs every request with the operation name, variables, duration, and outcome (success or error). Designed for development only — add it conditionally.

```ts
if (process.env.NODE_ENV === 'development') {
  plugins.push(loggerPlugin({ level: 'debug' }))
}
```

The log function is fully replaceable if you want to pipe output to a custom logger.

---

### Ecosystem compatible

grapher accepts any `TypedDocumentNode` as input to `.query()`, `.mutation()`, and `.subscription()`. This means documents generated by `graphql-codegen` or typed by `gql.tada` work without any adapter, config change, or extra setup. If a tool in the GraphQL ecosystem outputs a `TypedDocumentNode`, grapher speaks its language.

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