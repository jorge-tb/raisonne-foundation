# Raisonné Foundation — frontend

Read-only Next.js site for the Sepolia deployment (see `../DEPLOYMENTS.md`).

## Setup

```bash
cp .env.example .env.local   # add a server-only Sepolia RPC URL
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
