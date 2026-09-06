# Chainer Desktop

The Chainer interface as a native Windows application: the same pages, the same
layout, the same colours as the web version — written in plain C++ on Win32 with
Direct2D and DirectWrite. No third-party frameworks, no licence beyond the
Windows SDK.

*Deutsche Fassung: [README.de.md](README.de.md)*

## What it is

An application that runs on your own machine and fetches blockchain data
straight from the sources — with no server in between:

* **No sign-in, no registration.** There is no account and no user management.
* **No database.** Cases, watches, your own labels and your API keys live in one
  readable JSON file at `%LOCALAPPDATA%\Chainer\chainer.json`. Keys are
  encrypted inside it with the Windows data protection API (DPAPI) and are
  therefore bound to your Windows account.
* **Real data.** Addresses, transactions, rates and labels come live from the
  connected services. The application talks to them directly; the addresses you
  look up go to the sources you have enabled, the results stay here.

The look follows `src/app/globals.css` and the components under `src/components`
one to one: the same colour tokens for light and dark mode, the same Tailwind
spacing (1 unit = 4 px), the same font sizes and line heights. One drawing unit
is one CSS pixel, so on a screen with scaling the app renders exactly as the
browser would at the same zoom level.

## Building

Needs Visual Studio 2022 (or the Build Tools) with the **Desktop development
with C++** workload.

```bat
build.bat
```

The result is `build\Chainer.exe` — a single self-contained executable
(statically linked runtime, `/MT`).

To build from an existing developer command prompt, `build.bat` reuses that
environment; otherwise it finds Visual Studio through `vswhere` on its own.

## Data sources

Usable without credentials:

| Source | Chains | Purpose |
| --- | --- | --- |
| mempool.space, Blockstream, litecoinspace | BTC, LTC | addresses, transactions, outspends |
| Blockchain.com | BTC | reachability |
| Blockchair | BTC, LTC, DOGE, BCH | addresses and transactions (a key raises the limit) |
| BlockCypher | BTC, LTC, DOGE | fallback source (a token raises the limit) |
| Blockscout | ETH, Polygon, Arbitrum | addresses and transactions |
| TronGrid | TRX | accounts and transactions (a key raises the limit) |
| CoinGecko, Blockchain.com | all | rates |
| OFAC sanctions list, Ransomwhere | BTC, LTC, BCH, ETH | sanction and ransomware lists |
| WalletExplorer, CryptoScamDB | BTC / all | wallet clusters and scam reports |

With your own key: **Etherscan** (one key for every EVM chain), **Chainabuse**,
**Bitcoin Who's Who**. Keys are entered under *Sources*.

If a source fails, the application moves on to the next one in the order. A
source that does not answer is skipped for two minutes so a trace does not run
into the same timeout at every address. The list sources (OFAC, Ransomwhere) are
downloaded and kept under `%LOCALAPPDATA%\Chainer\cache` for six and
twenty-four hours respectively.

## Pages

| Page | Contents |
| --- | --- |
| Search | search box with format detection, the four steps, data source overview |
| Trace | parameter form, statistics, warning banner, graph with side panel, history, patterns, warnings, forensics |
| Connection | bidirectional path search between two addresses |
| Bulk check | up to 200 addresses against the reporting lists, CSV export |
| Cases | saved traces |
| Jobs | the running and most recent background queries |
| Watchlist | watched addresses; “Check now” refetches balance and count and records changes |
| Labels | your own labels: create, edit, delete, search |
| Sources | data sources with a reachability check, API keys, storage location, language and colour scheme |
| API | the web interface reference |
| Info | version, author, repository |
| Address | balance, labels, activity pattern, transaction list |
| Transaction | volume, fee, time, inputs and outputs |

Language (English/German) and colour scheme (light/dark/system) are switched in
the header exactly as on the website, and both choices are remembered.

## How the trace works

An address-based breadth-first search over the provider interfaces: the
transactions of the starting address are loaded, address and transaction nodes
are built from them, and the counterparties form the next level — forward along
the outputs, backward along the inputs, or both. Depth, transactions per
address, addresses per transaction, minimum amount and the node cap bound the
run.

Afterwards labels are fetched, clusters are formed through the common-input
heuristic and tainted inflows are marked. Every query goes into the evidence
log: time, status code and the SHA-256 checksum of the answer, plus an overall
checksum across all entries.

All queries run on background threads; the interface stays responsive and a
running trace can be cancelled.

## Source layout

```
src/
  main.cpp        window, Direct2D, message loop
  gfx.*           drawing on Direct2D/DirectWrite (colours, fonts, draw list)
  theme.*         the colour tokens from globals.css, incl. the Tailwind palette
  ui.*            widgets: cards, buttons, inputs, selects, checkboxes, layout
  app.*           header, content, footer, routing
  format.cpp      numbers, amounts and dates as Intl does them (en-GB / de-DE)
  net.*           HTTP over WinHTTP, background jobs, evidence log (SHA-256)
  providers.*     the data sources and the detection of addresses and txids
  live.cpp        queries, trace search, path search, bulk check, watch check
  widgets.cpp     shared building blocks, trace graph, activity heatmap
  trace_panel.cpp the graph side panel
  pages_a.cpp     Search, Trace, Connection, Bulk check
  pages_b.cpp     Cases, Jobs, Watchlist, Labels
  pages_c.cpp     Sources, API, Info, Address, Transaction
  store.*         JSON reader/writer, DPAPI encryption, local storage
  export.cpp      JSON and CSV output, reading an address list
  demo.cpp        the data source list and the empty initial state
```

## Fonts

The web version loads *Geist* through `next/font`. If Geist is installed
locally it is used; otherwise the app falls back to Inter, Segoe UI Variable
Text or Segoe UI, and for monospace to Geist Mono, JetBrains Mono, Cascadia Mono
or Consolas.

## Licence and copyright

Copyright (c) by Tobias Wagner (twgnr) · <https://github.com/twgnr/Chainer>
