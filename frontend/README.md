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
