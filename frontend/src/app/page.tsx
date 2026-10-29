import { ArtRegistry, FundGovernor, FundShare, FundTreasury, TimelockController } from "@/generated/contracts";

const CONTRACTS = { FundShare, FundGovernor, TimelockController, ArtRegistry, FundTreasury };

export default function Home() {
  return (
    <main>
      <h1>Raisonné Foundation</h1>
      <p>Sepolia deployment</p>
      <dl>
        {Object.entries(CONTRACTS).map(([name, { address }]) => (
          <div key={name}>
            <dt>{name}</dt>
            <dd>
              <code>{address}</code>
            </dd>
          </div>
        ))}
      </dl>
    </main>
  );
}
