# Token Radar

[![Token launch radar](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![Rank](https://make.fun/badge/token-radar-01/norv33/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01)
[![Reward](https://make.fun/badge/token-radar-01/norv33/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01)

Every protocol in a DefiLlama snapshot that records no token, ranked by what
its token would be worth if the record stayed as it is. Built for the
[Build the best token launch radar](https://make.fun/bounty/token-radar-01)
competition on make.fun.

## What it is

A radar, not a tip sheet. The snapshot (as of 2026-11-14, 758 protocols from
DefiLlama) is scored by one function, `radar-2`, and shown on a static,
offline dashboard:

- **198 ranked pre-token protocols** — the 40-protocol watchlist is the floor,
  never the ceiling: 158 more sit below the $50M TVL floor and are ranked too.
- **24 live tokens set aside** — protocols whose token already trades are
  shown separately at the market's own value, never mixed into the ranking.
- **A farm plan for every row** — six concrete steps with a cost and a time,
  derived from the protocol's category, chains, TVL and age.
- **A detail view per protocol** — the inputs behind its implied value, the
  breakdown of the formula, and where its multiple comes from.

## How the radar scores — radar-2

No protocol name is special-cased. For a pre-token protocol, from the
snapshot's own figures:

```
implied = TVL × multiple × growth × maturity × chains
```

- **multiple** — the median mcap/TVL of the live-token protocols in the row's
  category, taken from this same snapshot (at least 3 of them, else the
  snapshot's global median of 0.1689x), clamped to [0.02, 1.50].
- **growth** — `1 + 0.5 × clamp(7-day TVL change, −60%, +120%) / 100`.
  A protocol growing fast is worth more than one shrinking.
- **maturity** — `0.6 + 0.4 × min(age in days, 1095) / 1095`. A protocol that
  has run a long time with no token has a longer record to price.
- **chains** — `1 + 0.03 × min(chains − 1, 5)`. More chains, more surface to farm.

A bridged, wrapped or staked product of a token that already trades is never
ranked — a bridged token is the token it wraps, not a protocol still waiting
on a launch of its own. That is the watchlist's own product rule, applied to
every row. A protocol that records no token in the snapshot is DefiLlama's
record, not proof it has none — and a token may never launch. The implied
value is this radar's claim about what a launch would be worth, not a price.

## The top of the board

| Rank | Protocol | TVL | Implied value |
| ---: | --- | ---: | ---: |
| 1 | Steakhouse Financial | $2.75B | $422.4M |
| 2 | Sentora Curator | $2.76B | $384.6M |
| 3 | Gauntlet | $1.58B | $251.5M |
| 4 | USDD | $1.06B | $153.2M |
| 5 | BitFi Basis | $214.9M | $94.2M |

## The dashboard

`dashboard/` is a static page (no network, no build step) that reads
`data.js` beside it. It sorts by rank, name, TVL, 7-day change, age or
implied value; filters by search, category, chain or watchlist-only; and opens
a detail view per protocol (`#detail=<slug>`), so any view is a link:
`#cat=Dexs`, `#wl=1`, `#q=gauntlet`.

## Run it

Node 22 or newer, standard library only, no network while it runs:

```sh
node main.ts --input <snapshot.json|directory>   # writes /output
MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|directory>
```

The program writes `board.json`, `data.js`, copies `dashboard/` and
`screenshots/` into the output, and writes `dossier.json` with the vendored
`vendor/makefun-board.ts`. Running it twice on the same snapshot writes
byte-identical output.

## Layout

```
main.ts                  entry point (Node 22, stdlib only)
lib/model.ts             radar-2: scoring, farm plans, board, data.js
vendor/makefun-board.ts  make.fun's dossier builder (vendored, byte-identical)
dashboard/               index.html, app.css, app.js (static, offline)
screenshots/             1-board.png, 2-detail.png, 3-filtered.png
```

## Limits — read before trusting the board

- **One snapshot, one date.** The radar scores the 2026-11-14 snapshot only.
  A protocol that launched, collapsed or moved TVL after that date still
  shows its 2026-11-14 record. Re-run on a fresh snapshot to refresh it.
- **The multiple is a median, not a promise.** A category's median mcap/TVL
  says what comparable tokens trade at today; it says nothing about what a
  new token would trade at, or whether the market wants another one.
- **No volume, no revenue, no users.** The sealed snapshot the program reads
  carries TVL, 7-day change, age and chains — not fees, not active users, not
  tokenomics. A protocol can look large on TVL and earn nothing.
- **The farm plans are templates, not advice.** Each step names the action,
  the capital and the time for that protocol's shape; none of it is checked
  against a live points program, and a program can change or end without
  notice.

## Local validation (19 Nov 2026)

- Two runs on the kit snapshot write byte-identical output (`diff -r` clean).
- Board: 198 rows, ranks exactly 1–198, implied values non-increasing with
  rank, all 40 watchlist slugs present, every row's 6 farm steps 20–600 chars.
- Dossier: 595,202 bytes (cap 1.5 MiB), text 29,433 bytes (cap 65,536), all 3
  dashboard files included whole; 3 screenshots 131–147 KB each (cap 512 KiB).
- Dashboard: 3 files, 29,169 bytes, no `http://` or `https://` anywhere.

## Data

Snapshot: DefiLlama `https://api.llama.fi/protocols`, fetched 2026-11-14.
Not financial advice: implied values are this radar's model, a token may
never launch, and farming costs gas and locks capital.

## License

MIT — see [LICENSE](LICENSE).
