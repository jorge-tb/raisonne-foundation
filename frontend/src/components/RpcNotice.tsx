import { DEFAULT_BROWSER_RPC, rpcOverridden } from "@/lib/browser/checks";

// Every browser ✓ trusts the RPC, and `?rpc=` comes with the link: a shared link could point at
// a node that answers anything. Make a non-default RPC impossible to miss.
export function RpcNotice({ rpc }: { rpc: string }) {
  if (!rpcOverridden(rpc)) return null;
  return (
    <p className="rpc-notice">
      <strong>Custom RPC in use:</strong> <code className="hash">{rpc}</code>. These results are only as trustworthy as
      that node. If you didn&apos;t choose it yourself, <a href="?">re-check with the default</a> (
      <code className="hash">{DEFAULT_BROWSER_RPC}</code>).
    </p>
  );
}
