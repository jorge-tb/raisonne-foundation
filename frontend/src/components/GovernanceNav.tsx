import Link from "next/link";
import { ContractsIcon } from "./icons";

// The Governance section's two pages: the decisions, and the contracts that enforce them.
export function GovernanceNav({ current }: { current: "decisions" | "contracts" }) {
  return (
    <nav className="subnav" aria-label="Governance">
      <Link href="/governance" aria-current={current === "decisions" ? "page" : undefined}>
        Decisions
      </Link>
      <Link href="/contracts" aria-current={current === "contracts" ? "page" : undefined}>
        <ContractsIcon />
        Contracts
      </Link>
    </nav>
  );
}
