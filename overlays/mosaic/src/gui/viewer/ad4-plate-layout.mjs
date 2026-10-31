/* Conservative build-plate geometry for AD4 (Three.js-independent and testable).
 * Each footprint encloses the FULL transformed 3D model, not just its centroid.
 * Convex projected bounds can reject some valid interlocking shapes, but never
 * approve overlapping solids. This is intentional for print safety.
 */
export const AD4_BED = Object.freeze({
  minX: -110, maxX: 110, minZ: -100, maxZ: 100, minY: 0, maxY: 250
});
const EPS = 1e-6;
const finite = n => Number.isFinite(n);

export function convexHull(points) {
  if (!Array.isArray(points) || points.some(p => !Array.isArray(p) ||
      p.length !== 2 || !finite(p[0]) || !finite(p[1]))) return [];
  const sorted = points.map(p => [...p]).sort((a,b) => a[0]-b[0] || a[1]-b[1]);
  const cross = (o,a,b) => (a[0]-o[0])*(b[1]-o[1]) -
                            (a[1]-o[1])*(b[0]-o[0]);
  const lower=[], upper=[];
  for (const p of sorted) {
    while (lower.length > 1 && cross(lower.at(-2),lower.at(-1),p) <= EPS) lower.pop();
    lower.push(p);
  }
  for (let i=sorted.length-1;i>=0;i--) {
    const p=sorted[i];
    while (upper.length > 1 && cross(upper.at(-2),upper.at(-1),p) <= EPS) upper.pop();
    upper.push(p);
  }
  lower.pop(); upper.pop();
  return lower.concat(upper);
}
export function bounds(poly) {
  return {
    minX:Math.min(...poly.map(p=>p[0])), maxX:Math.max(...poly.map(p=>p[0])),
    minZ:Math.min(...poly.map(p=>p[1])), maxZ:Math.max(...poly.map(p=>p[1]))
  };
}
export function shifted(poly,x,z) { return poly.map(p=>[p[0]+x,p[1]+z]); }

// Separating-axis theorem: a zero-area contact is permitted, penetration is not.
// clearance>0 is used by Arrange to keep printed objects at least 2 mm apart.
export function polygonsOverlap(a,b,clearance=0) {
  if (a.length < 3 || b.length < 3) return true;
  for (const poly of [a,b]) {
    for (let i=0;i<poly.length;i++) {
      const p=poly[i],q=poly[(i+1)%poly.length];
      const dx=q[0]-p[0], dz=q[1]-p[1], length=Math.hypot(dx,dz);
      if (length < EPS) continue;
      const nx=-dz/length,nz=dx/length;
      const pa=a.map(v=>v[0]*nx+v[1]*nz);
      const pb=b.map(v=>v[0]*nx+v[1]*nz);
      if (Math.max(...pa)+clearance <= Math.min(...pb)+EPS ||
          Math.max(...pb)+clearance <= Math.min(...pa)+EPS) return false;
    }
  }
  return true;
}
export function validatePlate(entries,bed=AD4_BED) {
  const invalid=(code,reason,entry,other)=>({
    valid:false,code,reason,modelId:entry?.id||null,
    otherModelId:other?.id||null
  });
  const name=p=>String(p?.name || p?.id || "Unnamed model").slice(0,75);
  const mm=n=>Math.max(0,n).toFixed(1).replace(/\.0$/,"")+" mm";
  for (const entry of entries) {
    const p=entry.outline;
    if (!p || p.length < 3 || !finite(entry.lowY) || !finite(entry.highY) ||
        p.some(v=>v.some(n=>!finite(n))))
      return invalid("INVALID_GEOMETRY",
        "Model “"+name(entry)+"” has invalid geometry or coordinates",entry);
    if (entry.lowY < bed.minY-0.02)
      return invalid("BELOW_BED",
        "Model “"+name(entry)+"” is "+mm(bed.minY-entry.lowY)+" below the build plate",entry);
    if (entry.highY > bed.maxY+EPS)
      return invalid("HEIGHT_OVERFLOW",
        "Model “"+name(entry)+"” exceeds Z height (250 mm) by "+mm(entry.highY-bed.maxY),entry);
    const b=bounds(p);
    if (b.minX < bed.minX-EPS)
      return invalid("BED_X_MIN",
        "Model “"+name(entry)+"” exceeds the left X edge by "+mm(bed.minX-b.minX),entry);
    if (b.maxX > bed.maxX+EPS)
      return invalid("BED_X_MAX",
        "Model “"+name(entry)+"” exceeds the right X edge by "+mm(b.maxX-bed.maxX),entry);
    if (b.minZ < bed.minZ-EPS)
      return invalid("BED_Y_MIN",
        "Model “"+name(entry)+"” exceeds the front Y edge by "+mm(bed.minZ-b.minZ),entry);
    if (b.maxZ > bed.maxZ+EPS)
      return invalid("BED_Y_MAX",
        "Model “"+name(entry)+"” exceeds the rear Y edge by "+mm(b.maxZ-bed.maxZ),entry);
  }
  for (let i=0;i<entries.length;i++)
    for (let j=i+1;j<entries.length;j++)
      if (polygonsOverlap(entries[i].outline,entries[j].outline))
        return invalid("MODEL_COLLISION",
          "Model “"+name(entries[i])+"” overlaps “"+name(entries[j])+"”",entries[i],entries[j]);
  return {valid:true,code:null,reason:"",modelId:null,otherModelId:null};
}

// The input outlines use MODEL-LOCAL x/z positions. Return all placements or
// null; callers apply the complete plan atomically, never a partial arrangement.
export function arrangeFootprints(entries,bed=AD4_BED,clearance=2) {
  if (!Array.isArray(entries) || !finite(clearance) || clearance < 0) return null;
  const placed=[];
  for (const entry of entries) {
    if (!entry.outline || entry.outline.length < 3 ||
        !finite(entry.lowY) || !finite(entry.highY) ||
        entry.lowY < bed.minY-0.02 || entry.highY > bed.maxY+EPS) return null;
    const b=bounds(entry.outline);
    const xMin=bed.minX-b.minX, xMax=bed.maxX-b.maxX;
    const zMin=bed.minZ-b.minZ, zMax=bed.maxZ-b.maxZ;
    if (xMin > xMax+EPS || zMin > zMax+EPS) return null;
    const candidates=(start,end,axis) => {
      const choices=new Set([start,end]);
      // Edges of existing rectangles are packing anchors, but grid fallback
      // also finds usable gaps around rotated footprints.
      for (const prior of placed) {
        const edge=bounds(prior.outline);
        choices.add(axis==="x"?edge.maxX+clearance-b.minX:edge.maxZ+clearance-b.minZ);
      }
      for (let n=start;n<end;n+=2) choices.add(n);
      return [...choices].filter(v=>v>=start-EPS&&v<=end+EPS).sort((a,b)=>a-b);
    };
    const xs=candidates(xMin,xMax,"x"),zs=candidates(zMin,zMax,"z");
    let match=null;
    for (const z of zs) {
      for (const x of xs) {
        const outline=shifted(entry.outline,x,z);
        if (placed.every(prev=>!polygonsOverlap(outline,prev.outline,clearance))) {
          match={id:entry.id,x,z,outline};
          break;
        }
      }
      if (match) break;
    }
    if (!match) return null;
    placed.push(match);
  }
  if (!placed.length) return [];
  // Centre the entire arrangement on the plate without changing distances.
  const points=placed.flatMap(p=>p.outline),group=bounds(points);
  const dx=(bed.minX+bed.maxX-group.minX-group.maxX)/2;
  const dz=(bed.minZ+bed.maxZ-group.minZ-group.maxZ)/2;
  return placed.map(p=>({id:p.id,x:p.x+dx,z:p.z+dz}));
}
