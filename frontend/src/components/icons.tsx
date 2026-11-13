// Section icons, drawn on a 20-unit grid with the text colour so they follow the theme.
const common = { width: 18, height: 18, viewBox: "0 0 20 20", fill: "none", stroke: "currentColor", strokeWidth: 1.6, "aria-hidden": true } as const;

export function FundIcon() {
  return (
    <svg {...common} strokeLinejoin="round">
      <path d="M10 2 17.5 6v1.5h-15V6Z" />
      <path d="M4.5 9.5v5.5M8.2 9.5v5.5M11.8 9.5v5.5M15.5 9.5v5.5M2.5 17.5h15" />
    </svg>
  );
}

export function CollectionIcon() {
  return (
    <svg {...common}>
      <rect x="2" y="3" width="7" height="9" />
      <rect x="11" y="3" width="7" height="5" />
      <rect x="11" y="10" width="7" height="7" />
      <rect x="2" y="14" width="7" height="3" />
    </svg>
  );
}

export function AcquisitionsIcon() {
  return (
    <svg {...common} strokeLinejoin="round">
      <path d="M10 2.5 18 6.5 10 10.5 2 6.5Z" />
      <path d="M2 10 10 14 18 10M2 13.5 10 17.5 18 13.5" />
    </svg>
  );
}

export function GovernanceIcon() {
  return (
    <svg {...common} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="9" width="14" height="8.5" />
      <path d="M6.5 9V3.5h7V9" />
      <path d="M8 6.2 9.4 7.6 12.2 4.8" />
    </svg>
  );
}
