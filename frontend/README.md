# Raisonné Foundation — frontend

Read-only Next.js site for the Sepolia deployment (see `../DEPLOYMENTS.md`).

## Setup

```bash
cp .env.example .env.local   # add ALCHEMY_SEPOLIA_URL and ETHERSCAN_API_KEY (server-only)
npm install
npm run dev
```

## Contract addresses and ABIs

`src/generated/contracts.ts` is generated from `../out/` (Foundry artifacts) and
`../deployments/11155111.json`, and committed, because `out/` is gitignored and
Vercel has no Foundry.

```bash
(cd .. && forge build)
npm run gen:contracts            # regenerate
npm run gen:contracts -- --check # CI: fail if stale
```

## Verification script

```bash
npm run verify
```

Lists every proposal with its live state, verifies each `addGallery` root against the
tree published on IPFS, and prints the current cap table in basis points.

- **Logs**: Alchemy's free tier caps `eth_getLogs` at 10 blocks, so Etherscan V2 is used
  to discover *which blocks* hold project logs; the logs themselves are read from the RPC.
  Without `ETHERSCAN_API_KEY` the script range-scans (`LOGS_MAX_RANGE`, `LOGS_CONCURRENCY`).
- **Merkle**: roots are rebuilt with a port of Murky (`src/lib/merkle.ts`), the library that
  built the on-chain roots. `@openzeppelin/merkle-tree` gives a different root for gallery 001.

## CI

`.github/workflows/frontend.yml` runs on changes to `frontend/` or anything that feeds the
bindings (contract sources, `lib/`, Foundry config, `deployments/11155111.json`):
`forge build` (Foundry pinned to v1.7.1) → `npm ci` → `gen:contracts --check` → typecheck → lint.
The contracts workflow (`test.yml`) ignores `frontend/**`.

`next build` is not run in CI: pages prerender from live chain data and need the keys.
Vercel's build covers it.

## Deploy (Vercel)

- Import the GitHub repo; **Root Directory** `frontend`; framework preset Next.js (auto-detected).
- Environment variables (Production and Preview, available at build time: pages prerender):
  - `ALCHEMY_SEPOLIA_URL`: a separate production key, restricted in Alchemy to the five
    project contract addresses. Never `NEXT_PUBLIC_`.
  - `ETHERSCAN_API_KEY`
  - optional `IPFS_GATEWAY` (default: the project's Pinata gateway)
- Node 24 (`engines.node`).
- Every push to `main` deploys; data refreshes at most once a minute (`cacheLife`), independent
  of traffic.
