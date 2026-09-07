# Chainer — Blockchain Tracing

*Project summary for the website. Author: Tobias Wagner (twgnr).
Repository: <https://github.com/twgnr/Chainer>*

---

## In one sentence

Chainer follows the money across eight blockchains — as a web application and as
a native Windows program — using nothing but freely available data sources.

## The problem

When someone is defrauded with cryptocurrency, the first question is always the
same: where did the money go? The commercial answers to that question start in
the five-figure range per year and are aimed at banks and law enforcement. A
lawyer, a small police unit or the victim themselves has no realistic access to
them.

Yet the data is public. Block explorers publish every transaction, and several
projects maintain open lists of sanctioned, reported and known addresses. What
was missing was a tool that ties those free sources together and turns them into
something a person can actually work with.

## What it does

**Follow the money.** Enter an address or a transaction and Chainer walks the
chain of payments outward, forward, backward or both, and draws the result as a
graph. Two modes: *address-based* follows every transaction an address is
involved in; *UTXO-exact* follows the specific coins along their chain of
spends.

**Say how much of it is the money in question.** Tracing tells you a path
exists; taint analysis tells you how much. Three models are implemented, because
jurisdictions and practice disagree on which is right:

| Model | 1 BTC traced meets 3 BTC clean, outputs of 1 and 3 BTC |
| --- | --- |
| Haircut | proportional: 0.25 and 0.75 BTC |
| FIFO | by order: 1.00 and 0.00 BTC |
| Poison | everything tainted: 1.00 and 3.00 BTC |

**Say where it came from.** Every address in the graph is checked against the
OFAC sanctions list, stablecoin issuer blocklists, ransomware and scam reports,
exchange and darknet tags, and your own notes. Any address that comes back
reported becomes the source of a second pass, so a downstream address can show
what share of its inflow traces back to it, and through which route.

**Recognise structure, not just edges.** Common-input clustering groups
addresses that belong to the same wallet. Change outputs, CoinJoins, peeling
chains, batch payouts and collection addresses are detected. Deposit addresses —
those that take money in and forward nearly all of it to a single address — are
singled out, because the service operating them knows who they were assigned to
and is the most promising point of contact for an enquiry. Timing patterns give
a rough estimate of the owner's time zone.

**Make it hold up.** Every query is recorded with its source, timestamp, status
and a SHA-256 checksum of the answer, plus one checksum across the whole run.
Cases collect several traces with notes, an investigation log and a printable
report.

## Two front ends, one model

The **web application** is the full version: Next.js 16 and React 19 in
TypeScript, with cases, teams, watchlists with notifications, background jobs,
an OpenAPI-described interface for your own scripts, and a printable report per
case. MongoDB is optional — without it everything runs in guest mode.

The **desktop application** is a second, independent implementation of the same
interface for Windows, written in plain C++17 on Win32 with Direct2D and
DirectWrite — no framework, no third-party library, no runtime to install. It
ships as a single 1.1 MB executable, needs no account and no database, and keeps
everything in one readable JSON file; API keys are encrypted against the Windows
account. It covers the core: search, tracing in both modes, the taint models,
the origin warning, path search, bulk checking, watchlist, labels and the
evidence log.

Its layout is derived from the web version rather than approximated: the same
colour tokens, the same spacing scale, the same font sizes, with one drawing
unit equal to one CSS pixel — so at the same zoom level it renders like the
browser does.

## Chains and sources

Bitcoin, Litecoin, Dogecoin, Bitcoin Cash, Ethereum, Polygon, Arbitrum and Tron.
Account-based chains are mapped onto the same graph model, so tracing, taint and
presentation behave identically. Tron matters in particular because a large part
of today's stablecoin fraud runs over USDT-TRC20.

Around twenty sources are wired in — your own Bitcoin node and Electrum server
first, then mempool.space, Blockstream, litecoinspace, Blockchain.com,
BlockCypher, Blockchair, Blockscout, Etherscan and TronGrid for chain data, and
the OFAC list, stablecoin blocklists, Ransomwhere, GraphSense TagPacks,
WalletExplorer, CryptoScamDB, Chainabuse and Bitcoin Who's Who for labels and
risk. If one fails, the next takes over. Most work without any key; a key raises
the limits.

## Engineering notes

A few parts were more interesting than the rest:

- **The C++ interface toolkit.** No widget library exists that would produce
  this layout, so the desktop version has its own: an immediate-mode toolkit on
  top of a Direct2D draw list, with a deferred-patch mechanism so that a card
  can paint its background behind content whose height is only known afterwards.
  Text, wrapping, selection and hit-testing go through DirectWrite.
- **Fallback that stays honest.** A source that fails is skipped for two
  minutes, so a trace does not run into the same timeout at every address — and
  the interface says which source answered rather than pretending the number
  came from nowhere.
- **Two implementations, one specification.** Writing the tracer a second time
  in a different language, against the same data sources, turned several loose
  behaviours in the original into decisions that had to be written down.

## Honest limits

Heuristics are statements of probability, not proof. Clustering can merge
wallets that do not belong together, change detection can pick the wrong output,
and a mixer breaks the trail by design. Chainer says what it found and where it
got it from; the conclusion stays with the person reading it.

The free tiers of the data sources set the pace: a deep trace is a matter of
minutes, not seconds, and the limits are visible in the interface rather than
hidden behind a spinner.

---

**Stack.** TypeScript, Next.js 16, React 19, Tailwind CSS 4, MongoDB (optional),
Vitest · C++17, Win32, Direct2D, DirectWrite, WinHTTP · roughly 11,000 lines of
C++ for the desktop version, with no dependency beyond the Windows SDK.
