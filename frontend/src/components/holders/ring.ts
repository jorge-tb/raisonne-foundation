// Geometry shared by the Governance donut and the home page emblem: one 300×300 drawing, so the two
// are the same shape at different sizes and the page-change morph lines up.
export const CX = 150;
export const CY = 150;
export const R = 112; // outer radius of the segments
export const W = 36; // segment thickness
export const TOP = -Math.PI / 2;
export const TAU = Math.PI * 2;
export const VIEWBOX = "-34 -34 368 368"; // room for the avatars, the coalition track and the quorum label

const f = (n: number) => n.toFixed(1);
export const polar = (angle: number, radius: number): [number, number] => [CX + radius * Math.cos(angle), CY + radius * Math.sin(angle)];

// A ring segment between two angles.
export function segmentPath(a0: number, a1: number, inner = R - W, outer = R): string {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = polar(a0, outer), [x1, y1] = polar(a1, outer), [x2, y2] = polar(a1, inner), [x3, y3] = polar(a0, inner);
  return `M${f(x0)},${f(y0)} A${outer},${outer} 0 ${large} 1 ${f(x1)},${f(y1)} L${f(x2)},${f(y2)} A${inner},${inner} 0 ${large} 0 ${f(x3)},${f(y3)} Z`;
}

// An open arc, for the coalition track.
export function arcPath(a0: number, a1: number, radius: number): string {
  if (a1 - a0 < 0.001) return "";
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = polar(a0, radius), [x1, y1] = polar(a1, radius);
  return `M${f(x0)},${f(y0)} A${radius},${radius} 0 ${large} 1 ${f(x1)},${f(y1)}`;
}

export type RingPart = { key: string; fraction: number; color: string; hatched?: boolean };

// Start and end angle of each part, clockwise from the top, in the order given.
export function layout<T extends { fraction: number }>(parts: T[]): (T & { a0: number; a1: number })[] {
  let a = TOP;
  return parts.map((p) => {
    const a0 = a;
    a += p.fraction * TAU;
    return { ...p, a0, a1: a };
  });
}
