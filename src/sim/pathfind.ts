import { isBlocked, pathCrossesFence, resolvePosition } from './colliders';
import { getActiveWorldContent } from './data';
import { rideHeight as rideOverWater } from './ride_height';
import { groundHeight, waterLevelAt } from './world';

// Local A* over a 1-yard grid, used for short forced moves (warrior Charge).
// The search window is the start/goal bounding box plus a margin, so cost
// stays tiny (Charge range is ~25yd). Cells are blocked by static colliders,
// deep water, and uphill steps too steep to climb; the caller supplies those
// thresholds so they can't drift from the movement rules in sim.ts.

export interface PathOpts {
  seed: number;
  bodyRadius: number;
  maxClimbSlope: number; // rise/run above which an uphill step is a wall
  // Ground below this height is impassable (deep water): either a fixed
  // height, or a per-position function (terrain/feature-aware: a declared
  // lake's floor, -Infinity everywhere else so a dry sunken feature is never
  // blocked just because it is deep).
  minGround: number | ((x: number, z: number) => number);
  maxSpan?: number; // max searched cells per axis
  ignoreFences?: boolean; // treat fences as passable (the mover can jump them)
  // Long-distance automation may attach to the road graph. Recovery callers,
  // such as pet heel, can disable it so an over-span route stays the single
  // destination fallback that triggers their bounded teleport behavior.
  roadFallback?: boolean;
  // The mover swims, so water is traversable: deep-water cells stay walkable
  // (set minGround low) and for slope purposes their surface — not the lake
  // bottom — is what the body rides, so a sloped bed isn't a wall and the climb
  // check at the shore measures the real waterline-to-bank step.
  swim?: boolean;
  // Per-Sim rift collision token (colliders.ts registry); 0/undefined = none.
  riftToken?: number;
}

function minGroundAt(o: PathOpts, x: number, z: number): number {
  return typeof o.minGround === 'function' ? o.minGround(x, z) : o.minGround;
}

// Height the mover's body actually rides at a cell: the water surface when
// swimming over submerged ground, the ground itself otherwise. Used only for
// slope/climb gating so an uneven lake bed doesn't read as a cliff. The clamp
// itself is shared with the movement kernel (ride_height.ts).
function rideHeight(
  x: number,
  z: number,
  h: number,
  swim: boolean | undefined,
  seed: number,
): number {
  return swim ? rideOverWater(x, z, h, seed) : h;
}

const CELL = 1; // yards
const MARGIN = 8; // yards of slack around the start/goal bounding box
const MAX_SPAN = 64; // cells per axis; beyond this fall back to a straight line
const SMOOTH_SAMPLE_STEP = 0.25; // yards; keeps line-of-sight smoothing inside movement sweep granularity
const ROAD_LINK_RANGE = 64;
const ROAD_ATTACH_RANGE = 140;
const ROAD_ATTACH_LIMIT = 6;

export const PLAYER_BODY_RADIUS = 0.5;
export const PLAYER_MAX_CLIMB_SLOPE = 1.5;
export const PLAYER_SWIM_DEPTH = 0.8;

interface RoadGraph {
  nodes: { x: number; z: number }[];
  edges: [number, number][];
}

function segmentWalkable(
  from: { x: number; z: number },
  to: { x: number; z: number },
  o: PathOpts,
  allowBlockedEnd: boolean,
): boolean {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const d = Math.hypot(dx, dz);
  if (d < 1e-6) return true;
  if (!o.ignoreFences && pathCrossesFence(from.x, from.z, to.x, to.z, o.bodyRadius)) return false;

  const steps = Math.max(1, Math.ceil(d / SMOOTH_SAMPLE_STEP));
  let prevX = from.x;
  let prevZ = from.z;
  let prevRide = rideHeight(prevX, prevZ, groundHeight(prevX, prevZ, o.seed), o.swim, o.seed);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = from.x + dx * t;
    const z = from.z + dz * t;
    const h = groundHeight(x, z, o.seed);
    const isEnd = i === steps;
    if (
      (!isEnd || !allowBlockedEnd) &&
      (h < minGroundAt(o, x, z) ||
        isBlocked(o.seed, x, z, o.bodyRadius, o.ignoreFences, undefined, o.riftToken))
    ) {
      return false;
    }
    const ride = rideHeight(x, z, h, o.swim, o.seed);
    const stepLen = Math.hypot(x - prevX, z - prevZ);
    const rise = ride - prevRide;
    if (stepLen > 1e-6 && rise > 0 && rise / stepLen > o.maxClimbSlope) return false;
    prevX = x;
    prevZ = z;
    prevRide = ride;
  }
  return true;
}

function smoothPath(points: { x: number; z: number }[], o: PathOpts): { x: number; z: number }[] {
  if (points.length <= 2) return points.slice(1);

  const out: { x: number; z: number }[] = [];
  let anchor = 0;
  while (anchor < points.length - 1) {
    let next = points.length - 1;
    while (
      next > anchor + 1 &&
      !segmentWalkable(points[anchor], points[next], o, next === points.length - 1)
    ) {
      next--;
    }
    out.push(points[next]);
    anchor = next;
  }

  return out;
}

function roadGraph(): RoadGraph {
  const nodes: { x: number; z: number }[] = [];
  const nodeByKey = new Map<string, number>();
  const edges: [number, number][] = [];
  const nodeIndex = (point: { x: number; z: number }): number => {
    const key = `${point.x},${point.z}`;
    const existing = nodeByKey.get(key);
    if (existing !== undefined) return existing;
    const next = nodes.length;
    nodes.push({ x: point.x, z: point.z });
    nodeByKey.set(key, next);
    return next;
  };

  for (const road of getActiveWorldContent().roads) {
    let prev: number | null = null;
    for (const point of road) {
      const current = nodeIndex(point);
      if (prev !== null) edges.push([prev, current]);
      prev = current;
    }
  }
  return { nodes, edges };
}

function roadConnectionWalkable(
  from: { x: number; z: number },
  to: { x: number; z: number },
  o: PathOpts,
  allowBlockedEnd: boolean,
): boolean {
  if (segmentWalkable(from, to, o, allowBlockedEnd)) return true;
  if (groundHeight(from.x, from.z, o.seed) >= minGroundAt(o, from.x, from.z)) return false;
  return segmentWalkable(from, to, { ...o, minGround: -Infinity, swim: true }, allowBlockedEnd);
}

function nearestRoadAttachments(
  point: { x: number; z: number },
  graph: RoadGraph,
  maxDistance: number,
): number[] {
  return graph.nodes
    .map((node, index) => ({
      index,
      distance: Math.hypot(node.x - point.x, node.z - point.z),
    }))
    .filter((entry) => entry.distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance || a.index - b.index)
    .slice(0, ROAD_ATTACH_LIMIT)
    .map((entry) => entry.index);
}

function addGraphEdge(edges: number[][], from: number, to: number, cost: number): void {
  edges[from].push(to, cost);
  edges[to].push(from, cost);
}

function findRoadFallbackPath(
  from: { x: number; z: number },
  to: { x: number; z: number },
  o: PathOpts,
): { x: number; z: number }[] {
  if (getActiveWorldContent().roads.length === 0) return [];
  if (segmentWalkable(from, to, o, true)) return [{ x: to.x, z: to.z }];

  const graph = roadGraph();
  if (graph.nodes.length === 0) return [];
  const nodes = [from, to, ...graph.nodes];
  const edges = Array.from({ length: nodes.length }, () => [] as number[]);
  const roadOffset = 2;
  for (const [a, b] of graph.edges) {
    const fromIndex = roadOffset + a;
    const toIndex = roadOffset + b;
    const aPoint = nodes[fromIndex];
    const bPoint = nodes[toIndex];
    if (!segmentWalkable(aPoint, bPoint, o, false)) continue;
    addGraphEdge(edges, fromIndex, toIndex, Math.hypot(aPoint.x - bPoint.x, aPoint.z - bPoint.z));
  }

  for (let i = 0; i < graph.nodes.length; i++) {
    for (let j = i + 1; j < graph.nodes.length; j++) {
      const aPoint = graph.nodes[i];
      const bPoint = graph.nodes[j];
      const distance = Math.hypot(aPoint.x - bPoint.x, aPoint.z - bPoint.z);
      if (distance > ROAD_LINK_RANGE) continue;
      if (!segmentWalkable(aPoint, bPoint, o, false)) continue;
      addGraphEdge(edges, roadOffset + i, roadOffset + j, distance);
    }
  }

  for (const roadIndex of nearestRoadAttachments(from, graph, ROAD_ATTACH_RANGE)) {
    const node = graph.nodes[roadIndex];
    if (!roadConnectionWalkable(from, node, o, false)) continue;
    addGraphEdge(edges, 0, roadOffset + roadIndex, Math.hypot(from.x - node.x, from.z - node.z));
  }
  for (const roadIndex of nearestRoadAttachments(to, graph, ROAD_ATTACH_RANGE)) {
    const node = graph.nodes[roadIndex];
    if (!segmentWalkable(node, to, o, true)) continue;
    addGraphEdge(edges, 1, roadOffset + roadIndex, Math.hypot(to.x - node.x, to.z - node.z));
  }

  const dist = new Float64Array(nodes.length).fill(Infinity);
  const prev = new Int32Array(nodes.length).fill(-1);
  const seen = new Uint8Array(nodes.length);
  dist[0] = 0;
  for (;;) {
    let current = -1;
    let best = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      if (seen[i] || dist[i] >= best) continue;
      current = i;
      best = dist[i];
    }
    if (current === -1 || current === 1) break;
    seen[current] = 1;
    const row = edges[current];
    for (let i = 0; i < row.length; i += 2) {
      const next = row[i];
      const cost = row[i + 1];
      const candidate = dist[current] + cost;
      if (candidate >= dist[next]) continue;
      dist[next] = candidate;
      prev[next] = current;
    }
  }
  if (!Number.isFinite(dist[1])) return [];

  const route: number[] = [];
  for (let i = 1; i !== -1; i = prev[i]) route.push(i);
  route.reverse();
  return route.slice(1).map((index) => ({ x: nodes[index].x, z: nodes[index].z }));
}

// Returns world-space waypoints from `from` to `to`, excluding the start and
// ending exactly at `to`. Long routes prefer the road graph when the direct
// line is not walkable, so automation does not cut across lakes or ridge walls.
// Falls back to [to] when the goal is unreachable or start and goal share a cell.
export function findPath(
  from: { x: number; z: number },
  to: { x: number; z: number },
  o: PathOpts,
): { x: number; z: number }[] {
  const minX = Math.min(from.x, to.x) - MARGIN;
  const minZ = Math.min(from.z, to.z) - MARGIN;
  const W = Math.ceil((Math.max(from.x, to.x) + MARGIN - minX) / CELL);
  const H = Math.ceil((Math.max(from.z, to.z) + MARGIN - minZ) / CELL);
  const maxSpan = o.maxSpan ?? MAX_SPAN;
  if (W > maxSpan || H > maxSpan) {
    const fallback = o.roadFallback === false ? [] : findRoadFallbackPath(from, to, o);
    return fallback.length > 0 ? fallback : [{ x: to.x, z: to.z }];
  }
  const cx = (gx: number) => minX + (gx + 0.5) * CELL;
  const cz = (gz: number) => minZ + (gz + 0.5) * CELL;
  const toCell = (x: number, z: number) => ({
    gx: Math.min(W - 1, Math.max(0, Math.floor((x - minX) / CELL))),
    gz: Math.min(H - 1, Math.max(0, Math.floor((z - minZ) / CELL))),
  });
  const start = toCell(from.x, from.z);
  const goal = toCell(to.x, to.z);
  const startIdx = start.gz * W + start.gx;
  const goalIdx = goal.gz * W + goal.gx;
  if (startIdx === goalIdx) return [{ x: to.x, z: to.z }];

  // lazy per-cell caches: walkability and ground height
  const walk = new Int8Array(W * H); // 0 unknown, 1 walkable, -1 blocked
  const height = new Float64Array(W * H).fill(NaN);
  const groundAt = (i: number): number => {
    if (Number.isNaN(height[i])) height[i] = groundHeight(cx(i % W), cz((i / W) | 0), o.seed);
    return height[i];
  };
  const walkable = (i: number): boolean => {
    if (walk[i] === 0) {
      // the start and goal cells are always traversable: the mover is already
      // standing on one, and the slide in resolvePosition owns the last yard
      const cellX = cx(i % W);
      const cellZ = cz((i / W) | 0);
      const ok =
        i === startIdx ||
        i === goalIdx ||
        (groundAt(i) >= minGroundAt(o, cellX, cellZ) &&
          !isBlocked(o.seed, cellX, cellZ, o.bodyRadius, o.ignoreFences, undefined, o.riftToken));
      walk[i] = ok ? 1 : -1;
    }
    return walk[i] === 1;
  };
  const cellPoint = (idx: number): { x: number; z: number } => ({
    x: cx(idx % W),
    z: cz((idx / W) | 0),
  });

  const gScore = new Float64Array(W * H).fill(Infinity);
  const cameFrom = new Int32Array(W * H).fill(-1);
  // binary min-heap of [fScore, idx]
  const heap: number[][] = [];
  const heapPush = (item: number[]) => {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const par = (i - 1) >> 1;
      if (heap[par][0] <= heap[i][0]) break;
      [heap[par], heap[i]] = [heap[i], heap[par]];
      i = par;
    }
  };
  const heapPop = (): number[] => {
    const top = heap[0];
    const last = heap.pop();
    if (!last) throw new Error('heap underflow');
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1,
          r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  const octile = (gx: number, gz: number): number => {
    const dx = Math.abs(gx - goal.gx),
      dz = Math.abs(gz - goal.gz);
    return (Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz)) * CELL;
  };

  gScore[startIdx] = 0;
  heapPush([octile(start.gx, start.gz), startIdx]);
  let found = false;
  while (heap.length > 0) {
    const [, cur] = heapPop();
    if (cur === goalIdx) {
      found = true;
      break;
    }
    const gx = cur % W,
      gz = (cur / W) | 0;
    const hCur = rideHeight(cx(gx), cz(gz), groundAt(cur), o.swim, o.seed);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dz === 0) continue;
        const nx = gx + dx,
          nz = gz + dz;
        if (nx < 0 || nx >= W || nz < 0 || nz >= H) continue;
        const n = nz * W + nx;
        const stepLen = (dx !== 0 && dz !== 0 ? Math.SQRT2 : 1) * CELL;
        const g = gScore[cur] + stepLen;
        if (g >= gScore[n]) continue;
        if (!walkable(n)) continue;
        // diagonals only when both orthogonal cells are clear (no corner clipping)
        if (dx !== 0 && dz !== 0 && (!walkable(gz * W + nx) || !walkable(nz * W + gx))) continue;
        const legFrom = cur === startIdx ? from : cellPoint(cur);
        const legTo = n === goalIdx ? to : cellPoint(n);
        if (!segmentWalkable(legFrom, legTo, o, n === goalIdx)) continue;
        const rise = rideHeight(cx(nx), cz(nz), groundAt(n), o.swim, o.seed) - hCur;
        if (rise > 0 && rise / stepLen > o.maxClimbSlope) continue;
        gScore[n] = g;
        cameFrom[n] = cur;
        heapPush([g + octile(nx, nz), n]);
      }
    }
  }
  if (!found) return [{ x: to.x, z: to.z }];

  // reconstruct, then string-pull through any intermediate grid corners that
  // have a direct walkable segment. A* gives legal cells; this converts the
  // 1-yard stair-step route into longer natural legs for movement followers.
  const cells: number[] = [];
  for (let i = goalIdx; i !== -1; i = cameFrom[i]) cells.push(i);
  cells.reverse();
  const points = [
    from,
    ...cells.slice(1, -1).map((cell) => ({ x: cx(cell % W), z: cz((cell / W) | 0) })),
    to,
  ];
  return smoothPath(points, o);
}

export function findPlayerPath(
  seed: number,
  from: { x: number; z: number },
  to: { x: number; z: number },
  maxSpan = 128,
  ignoreFences = false,
  swim = false,
  riftToken = 0,
  roadFallback = true,
): { x: number; z: number }[] {
  if (
    !swim &&
    groundHeight(from.x, from.z, seed) < waterLevelAt(from.x, from.z, seed) - PLAYER_SWIM_DEPTH
  ) {
    const shore = resolvePlayerDestination(seed, from, false, riftToken);
    if (Math.hypot(shore.x - from.x, shore.z - from.z) > 0.5) {
      return [
        shore,
        ...findPlayerPath(seed, shore, to, maxSpan, ignoreFences, false, riftToken, roadFallback),
      ];
    }
  }
  return findPath(from, to, {
    seed,
    bodyRadius: PLAYER_BODY_RADIUS,
    maxClimbSlope: PLAYER_MAX_CLIMB_SLOPE,
    // Players float on any depth (they tread water at the surface), so when
    // swimming is allowed no ground is "too deep" to enter — only colliders and
    // un-climbable banks stop them. Charge keeps the deep-water cutoff, and only
    // inside a declared lake's footprint: a dry sunken feature (crater, tunnel,
    // sinkhole) outside every lake has no floor at all, however deep it goes.
    minGround: swim
      ? -Infinity
      : (x: number, z: number) => waterLevelAt(x, z, seed) - PLAYER_SWIM_DEPTH,
    maxSpan,
    ignoreFences,
    swim,
    riftToken,
    roadFallback,
  });
}

function playerDestinationWalkable(
  seed: number,
  p: { x: number; z: number },
  swim: boolean,
  riftToken = 0,
): boolean {
  if (isBlocked(seed, p.x, p.z, PLAYER_BODY_RADIUS, false, undefined, riftToken)) return false;
  // Swimmers can stop on the water; walkers can't, so deep water inside a
  // declared lake is rejected and the caller snaps to the nearest shore.
  return swim || groundHeight(p.x, p.z, seed) >= waterLevelAt(p.x, p.z, seed) - PLAYER_SWIM_DEPTH;
}

export function resolvePlayerDestination(
  seed: number,
  target: { x: number; z: number },
  swim = false,
  riftToken = 0,
): { x: number; z: number } {
  const pushed = resolvePosition(
    seed,
    target.x,
    target.z,
    PLAYER_BODY_RADIUS,
    false,
    undefined,
    undefined,
    riftToken,
  );
  if (playerDestinationWalkable(seed, pushed, swim, riftToken)) return pushed;

  let best: { x: number; z: number } | null = null;
  let bestD2 = Infinity;
  const rings = 24;
  for (let ring = 1; ring <= rings; ring++) {
    const radius = ring * 0.75;
    const samples = Math.max(12, Math.ceil(radius * 10));
    for (let i = 0; i < samples; i++) {
      const a = (i / samples) * Math.PI * 2;
      const raw = {
        x: target.x + Math.sin(a) * radius,
        z: target.z + Math.cos(a) * radius,
      };
      const p = resolvePosition(
        seed,
        raw.x,
        raw.z,
        PLAYER_BODY_RADIUS,
        false,
        undefined,
        undefined,
        riftToken,
      );
      if (!playerDestinationWalkable(seed, p, swim, riftToken)) continue;
      const dx = p.x - target.x,
        dz = p.z - target.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) {
        best = p;
        bestD2 = d2;
      }
    }
    if (best) return best;
  }
  return pushed;
}
