# Chainer – blockchain tracing

*[Deutsche Fassung](README.de.md)*

A Next.js/React application that analyses cryptocurrency addresses and transactions across several **free** data
sources and traces the flow of funds as a graph.

## Features

### Analysis
- **Search** by address or transaction: balance, history, inputs/outputs, spending status, value at the rate of the day.
- **Two tracing modes**:
  - *address-based* – every transaction of an address,
  - *UTXO-exact* – only the specific coins along their chain of spends (including outputs without an address, such as P2PK).
- **Direction**: forward (where did the coins go?), backward (where did they come from?) or both.
- **Taint analysis** with three models:
  | Model | Behaviour with 1 BTC traced + 3 BTC clean, outputs of 1 and 3 BTC |
  | --- | --- |
  | Haircut | proportional: 0.25 and 0.75 BTC |
  | FIFO | by order: 1.00 and 0.00 BTC |
  | Poison | everything tainted: 1.00 and 3.00 BTC |
- **Origin warning**: every address in the graph that appears on a sanctions, ransomware, scam or darknet list
  becomes the source of a second trace. Downstream addresses then show how much of their inflow comes from there
  and through which source. Payments *to* such addresses are marked as well. Mixers and addresses with medium
  risk can optionally be included.
- **Heuristics**: common-input clustering (union-find), change detection (address reuse, script type, roundness of
  the amount), CoinJoin, consolidation and batch hints, peeling chains, coinbase detection.
- **Timing patterns**: activity by weekday and hour, with an estimate of the time zone derived from the quietest
  night-time stretch.
- **Behaviour-based service detection**: batch payouts, many counterparties, collection addresses, cold wallets.
- **Lightning**: detects transactions that open or close a payment channel, including the nodes involved.
- **Historic rates**: amounts in euros at the time of the transaction, not only at today's rate.
- **Connection search**: finds money paths between two addresses. The search runs from both ends at once
  (bidirectional breadth-first search), either only in the direction of flow or in both directions. Hubs such as
  exchanges can be skipped so that the paths found stay meaningful. The query budget is capped and reported in
  the result.
- **Bulk check**: paste up to 200 addresses at once or upload a file and check them against every label, sanctions
  and abuse source, with a result table and CSV export.
- **Deposit address detection**: addresses that take money in and pass practically all of it on to a single
  collection address are the deposit addresses of a service. The operator knows who the address was assigned to
  and is therefore the most promising point of contact for an enquiry.
- **Wallet fingerprint**: version, locktime, sequence numbers, BIP69 ordering and script types are condensed into a
  short signature. Transactions with the same signature probably come from the same wallet software and can be
  linked even without shared inputs.
- **Cross-chain hops**: swap and bridge services are recognised from the labels and marked in the graph. On the
  transaction page you can check whether a candidate address on the destination chain received an amount matching
  the outflow after conversion at the rate of the day.
- **Correlating mixer payouts**: payouts of a service that match a deposit in amount and timing are returned as a
  scored list of candidates.
- **Multiple starting points**: trace several victim addresses together and see where the paths converge.
- **Evidence record**: for every query it is recorded which source delivered which data and when, with a checksum
  over the raw data and an overall checksum for the whole trace.

### Presentation
- **Graph** with zoom, freely movable nodes, path highlighting, cluster colouring, taint bars, collapsing a whole
  cluster into one node, hiding individual nodes, and comments.
- **History**: a chronological table of all transactions with senders, recipients, labels, taint share and a filter.
- **Patterns**: activity heatmap, peeling chains and addresses with notable behaviour.
- **Warnings**: a dedicated tab with every reported address in the graph, the recipients of its money including
  share and origin chain, and the payments made to reported addresses. In the graph, tainted flows can be
  highlighted in red or everything else hidden; the history has its own filter for this.
- **Live build-up**: the trace runs as a stream, intermediate states appear immediately and can be cancelled.
- **Time-axis layout**: the horizontal axis is time, so distances correspond to real intervals.
- **Forensics tab**: deposit addresses, cross-chain hops, wallet fingerprints and the data record.

### Investigation workflow
- **Cases** with several traces, notes, an investigation log and a saved graph view.
- **Your own labels and notes** per address, private or shared with the team; they take precedence over external
  databases.
- **Manual cluster correction**: merge addresses when the automatic detection gets it wrong.
- **Watchlist** with notification on new activity by email, Telegram or webhook. If an inflow comes from a reported
  address, the message contains an explicit warning naming the sender and the source.
- **Report** per case, printable as a PDF, plus CSV and JSON export.
- **Automatic case refresh**: a case is recalculated at a configurable interval; on movement a log entry is written
  and a notification is sent.
- **Notes on transactions**, not only on addresses.
- **Background jobs**: long analyses are queued and worked through by the server one after another, even if you
  leave the page. This lifts the limit that a request's response time would otherwise impose.
- **Access tokens** for your own scripts, plus an interface description following OpenAPI 3.1 at `/api/openapi` and
  an overview at `/api-docs`.
- **Full export**: all cases, labels, watchlist entries and settings as a single JSON file. Credentials are only
  included masked, so the export can be passed on.
- **Schema versioning**: cases from older versions are lifted to the current format once when opened; missing
  analyses stay empty instead of causing errors.
- **Teams**: organisations with roles (owner, admin, member, viewer), shared cases and API keys.

## Supported chains

Bitcoin, Litecoin, Dogecoin, Bitcoin Cash, Ethereum and Tron. Account-based chains are mapped onto the same graph
model, so tracing, taint and presentation work identically; token transfers appear as their own edges. Tron is
particularly relevant because a large part of today's stablecoin fraud runs over USDT-TRC20.

## Data sources

| Source | Type | Chains | Key |
| --- | --- | --- | --- |
| Bitcoin Core (your own node) | Blockchain | BTC | no, needs `txindex=1` |
| Electrum/ElectrumX server | Blockchain | BTC, LTC | no |
| mempool.space | Blockchain (Esplora) | BTC | no |
| Blockstream Esplora | Blockchain | BTC | no |
| litecoinspace.org | Blockchain | LTC | no |
| Blockchain.com | Blockchain | BTC | no |
| BlockCypher | Blockchain | BTC, LTC, DOGE | optional |
| Blockchair | Blockchain | BTC, LTC, DOGE, BCH | optional (often IP-blocked without a key) |
| Blockscout | Blockchain | ETH | no |
| Etherscan | Blockchain | ETH | required |
| TronGrid | Blockchain | TRX | optional (3 requests/s without a key) |
| OFAC sanctions list | Sanctions | BTC, LTC, BCH, ETH | no |
| Stablecoin blocklists (Tether, Circle) | frozen addresses | ETH, TRX | no |
| Ransomwhere | Ransomware | BTC | no |
| GraphSense TagPacks | Exchanges, mixers, darknet, mining | all | no |
| WalletExplorer | Clusters and services | BTC | no |
| CryptoScamDB | Scam reports | all | no |
| Chainabuse | Abuse reports | all | required (free) |
| Bitcoin Who's Who | Reputation, web mentions | BTC | required (free) |
| Your own labels | User and team | all | – |
| CoinGecko | Rates, historic too | all | no |

If a source fails (rate limit, outage), the next one takes over automatically. Your own infrastructure is
preferred. To add a source: implement `ChainProvider` or `IntelProvider` in `src/lib/providers/types.ts` and
register it in `src/lib/providers/registry.ts`.

## Installation

```bash
npm install
cp .env.example .env.local   # adjust the values; everything is optional
npm run dev                  # http://localhost:3000
```

For production: `npm run build && npm start`.

Without `MONGODB_URI` everything runs in guest mode. Login, cases, watchlist, teams and the persistent cache need
`MONGODB_URI` and `AUTH_SECRET`.

## Project structure

```
src/app                    Pages and API routes
src/components             React components (graph with @xyflow/react + dagre, forms, report)
src/lib/chains.ts          Chain definitions and format detection
src/lib/providers          Data sources and registry with fallback
src/lib/providers/intel    Label, risk and sanctions sources
src/lib/trace/engine.ts    Tracing (address-based and UTXO-exact)
src/lib/trace/taint.ts     Taint models
src/lib/trace/heuristics.ts Clustering, change, peeling, timing patterns, behaviour
src/lib/trace/risk.ts      Classification as harmful, the basis of the origin warning
src/lib/trace/path.ts      Connection search between two addresses
src/lib/trace/inflow.ts    Checking the direct senders of an address
src/lib/trace/deposit.ts   Detection of deposit addresses
src/lib/trace/fingerprint.ts Wallet fingerprint from the raw traits
src/lib/trace/crosschain.ts Swap and bridge services, comparison on the destination chain
src/lib/trace/mixer.ts     Correlation of mixer payouts
src/lib/i18n               Language selection, translation of texts from the analysis and the API
src/lib/theme.ts           Light/dark mode
src/lib/evidence.ts        Evidence record of the raw data used
src/lib/jobs.ts            Queue for background jobs
src/lib/apitoken.ts        Access tokens for scripts
src/lib/caseRefresh.ts     Automatic case refresh
src/lib/logger.ts          Structured logging with a request id
src/lib/migrate.ts         Schema versioning of stored cases
src/middleware.ts          Assignment of the request id
src/lib/ratelimit.ts       Rate limit for the expensive endpoints
src/lib/cache.ts           Two-tier cache (memory and MongoDB)
src/lib/auth.ts            Session, user keys, provider context
src/lib/watch.ts           Watchlist check and notification
src/lib/models             Mongoose models (User, Org, Case, Annotation, Watch, CacheEntry)
src/instrumentation.ts     Optional timer for the watchlist
```

## API

| Route | Description |
| --- | --- |
| `GET /api/address/:addr?chain=` | Address info, transactions, labels, classification and inflows from reported addresses |
| `GET /api/tx/:txid?chain=` | Transaction details including the Lightning channel |
| `POST /api/trace` | Run a trace, complete result |
| `POST /api/trace/stream` | Trace as an NDJSON stream with intermediate states |
| `POST /api/path` | Search for a connection between two addresses |
| `POST /api/screen` | Bulk check of a list of addresses |
| `POST /api/mixer` | Correlate mixer payouts with a deposit |
| `POST /api/crosschain` | Compare a hop to another chain |
| `GET/POST /api/jobs`, `GET/DELETE /api/jobs/:id` | Background jobs |
| `GET/POST /api/tokens`, `DELETE /api/tokens/:id` | Access tokens |
| `POST /api/cases/refresh` | Recalculate cases (session or `CRON_SECRET`) |
| `GET /api/openapi` | Interface description (OpenAPI 3.1) |
| `GET /api/export` | Full export of all your own data |
| `POST /api/settings/rekey` | Re-encrypt credentials with the current key |
| `GET /api/health` | Status report for monitoring |
| `GET /api/providers?chain=&ping=1` | Status and reachability of the sources, cache size |
| `GET /api/price?chain=&from=&to=` | Current rate or rate history |
| `GET/POST/PATCH/DELETE /api/cases[/:id]` | Cases with traces, log, view |
| `GET/POST /api/annotations`, `DELETE /api/annotations/:id` | Your own labels |
| `GET/POST/PUT /api/watch`, `PATCH/DELETE /api/watch/:id` | Watchlist and notifications |
| `POST /api/watch/check` | Trigger a check (session or `CRON_SECRET`) |
| `GET/POST/PATCH /api/org` | Team, members, roles, shared keys |
| `GET/PUT /api/settings/keys` | Your own API keys and node configuration |
| `GET/DELETE /api/cache` | Cache statistics and clearing |
| `POST /api/auth/register\|login\|logout`, `GET /api/auth/me` | Authentication |

## Operation

### Interface language and colour scheme

The interface is available in **English** (default) and **German**; the colour scheme can be set to light, dark or
follow the operating system. Both are chosen in the header and stored in a cookie, so the server renders the page
in the right language and mode straight away. Without a cookie the language is taken from the `Accept-Language`
header, falling back to English.

### Docker

```bash
export AUTH_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
docker compose up -d
```

The bundled `docker-compose.yml` starts the application together with a MongoDB. The container uses the standalone
output of Next.js, runs as an unprivileged user and comes with a health check. All environment variables from
`.env.example` can be passed through.

### Privacy

Every query to a public source tells that source what is being looked for. Privacy mode restricts the application
to sources that do not learn the target of the investigation: your own node, Electrum, and lists that are
downloaded in full and checked locally (sanctions, ransomware, TagPacks). It can be set per user in the settings or
enforced server-wide through `PRIVACY_MODE=true`. Without your own infrastructure this leaves no blockchain sources
at all; the interface says so too.

### Key rotation

If `ENCRYPTION_KEY` changes, existing credentials stay readable only while the old value is present in
`ENCRYPTION_KEY_PREVIOUS`. In the settings, "Re-encrypt now" encrypts all of your own values with the new key;
afterwards the old entry can be removed.

### Logging

Every request gets an id that comes back as the `x-request-id` header and appears in all log lines of the same
request. In production every line is written as JSON, in development in a readable form. The level is controlled by
`LOG_LEVEL` (debug, info, warn, error).

### Health and protection

- `GET /api/health` returns status, database connection, cache size and the available notification channels. The
  endpoint answers with 503 if a configured database is unreachable.
- The expensive endpoints are rate limited (trace 20, connection search 10, bulk check 5, address and transaction
  120 requests per minute and sender each). Above that you get status 429 with `Retry-After`. Can be switched off
  with `RATE_LIMIT_DISABLED=true`, for instance behind a reverse proxy of your own.

## Tests

```bash
npm test          # once
npm run test:watch
```

The tests cover three levels and touch neither the network nor the database:

- **Logic**: taint models, change, peeling and deposit detection, timing patterns, risk classification, wallet
  fingerprint, address formats, formatting, translation of the texts from the analysis and the API, TagPack parser,
  cache, inflow analysis, evidence record, migration and logging.
- **Conversion of the provider data**: recorded real responses in `src/lib/providers/__fixtures__/` are sent through
  the providers and the result is checked. If a provider changes its format, it shows up here. Re-record with
  `npm run fixtures`.
- **API routes**: validation, permissions, error codes and rate limiting of all endpoints with the providers
  swapped out.

## Background services

Three services optionally run inside the server process, each only with a database:

```bash
JOB_POLL_SECONDS=5                  # queue for long analyses (always active when a database is present)
WATCH_INTERVAL_MINUTES=15           # check the watchlist
CASE_REFRESH_INTERVAL_MINUTES=360   # recalculate cases
```

With several instances it is better to point an external cron service at `/api/watch/check` and
`/api/cases/refresh` using `CRON_SECRET`.

## Automatic watchlist check

Two ways, configured in `.env.local`:

```bash
WATCH_INTERVAL_MINUTES=15        # built-in timer, for a single instance
```

```bash
CRON_SECRET=<random value>       # external cron service:
# curl -X POST https://<host>/api/watch/check -H "Authorization: Bearer <CRON_SECRET>"
```

## Notes

- All heuristics – clustering, change, taint, origin warning – yield **statements of probability, not proof**. That
  money arrived over several steps from a reported address does not establish that the recipient was involved;
  exchanges and payment services continuously receive funds of mixed origin.
- The free endpoints are rate limited. Results are cached: confirmed transactions for 30 days, sanctions and label
  lists for 6 to 24 hours, rate histories for 12 hours. With MongoDB the cache survives restarts.
- The free CoinGecko tier only serves rate histories for the last 365 days; older transactions appear without their
  value at the time.
- Very active addresses (exchanges) are not expanded further beyond depth 1, so the graph stays readable.
- The wallet fingerprint needs raw traits that currently only the Esplora interfaces deliver (mempool.space,
  Blockstream, litecoinspace).
- A complete search across a foreign chain is not possible without an index of your own. The cross-chain comparison
  therefore checks a given candidate address and returns a scored assessment, not an attribution.
- The token contracts of Tether and Circle partly list their own address on the blocklist. These self-entries are
  filtered out, because they would otherwise raise a false alarm.
- Sessions can be revoked individually or for all devices. After a password reset all existing sessions become
  invalid.
- After five failed attempts an account is temporarily locked; the lock grows with further attempts up to one hour.
  The error message does not reveal whether the email address exists.
- Stored API keys and node credentials are kept encrypted with AES-256-GCM.
- Notification emails and the OpenAPI document are currently still in German only.
