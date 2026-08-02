/** Deterministic PRNG (mulberry32) — a fixed seed keeps the generated skyline
 * identical between server and client render, avoiding hydration mismatches. */
function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Building {
  x: number;
  width: number;
  height: number;
  windows: { x: number; y: number }[];
  antenna: boolean;
}

function generateSkyline(seed: number, count: number, viewWidth: number, maxHeight: number, minHeight: number): Building[] {
  const rand = mulberry32(seed);
  const buildings: Building[] = [];
  let x = -20;
  for (let i = 0; i < count; i++) {
    const width = 34 + rand() * 46;
    const height = minHeight + rand() * (maxHeight - minHeight);
    const cols = Math.max(2, Math.floor(width / 11));
    const rows = Math.max(2, Math.floor(height / 13));
    const windows: { x: number; y: number }[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (rand() > 0.58) {
          windows.push({ x: c * 11 + 4, y: r * 13 + 6 });
        }
      }
    }
    buildings.push({ x, width, height, windows, antenna: rand() > 0.82 });
    x += width + 6 + rand() * 10;
    if (x > viewWidth + 40) break;
  }
  return buildings;
}

const FAR = generateSkyline(7, 30, 1600, 130, 50);
const NEAR = generateSkyline(42, 22, 1600, 230, 90);

function Layer({ buildings, fill, windowColor, windowOpacity }: { buildings: Building[]; fill: string; windowColor: string; windowOpacity: number }) {
  return (
    <>
      {buildings.map((b, i) => (
        <g key={i} transform={`translate(${b.x}, ${260 - b.height})`}>
          <rect width={b.width} height={b.height} fill={fill} />
          {b.antenna && (
            <line x1={b.width / 2} y1={-22} x2={b.width / 2} y2={0} stroke={fill} strokeWidth={2} />
          )}
          {b.windows.map((w, wi) => (
            <rect key={wi} x={w.x} y={w.y} width={3.5} height={5} fill={windowColor} opacity={windowOpacity} />
          ))}
        </g>
      ))}
    </>
  );
}

/** Generative city skyline — stands in for a real cityscape photo without any external asset or licensing risk. */
export function Skyline({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1600 260"
      preserveAspectRatio="none"
      className={className}
      aria-hidden="true"
    >
      <Layer buildings={FAR} fill="#0d0d16" windowColor="#3730a3" windowOpacity={0.35} />
      <Layer buildings={NEAR} fill="#08080c" windowColor="#fbbf24" windowOpacity={0.55} />
    </svg>
  );
}
