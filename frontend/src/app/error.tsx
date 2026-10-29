"use client";

// Server errors reach the browser without their message in production; the server logs a
// redacted copy (see lib/server/snapshot.ts). Never print RPC errors here: they carry the API key.
export default function Error({ retry }: { error: unknown; retry: () => void }) {
  return (
    <>
      <h1>Chain data unavailable</h1>
      <p>The site couldn&apos;t read Sepolia just now. This is usually temporary.</p>
      <button onClick={() => retry()}>Try again</button>
    </>
  );
}
