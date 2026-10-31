/* Closed, gently chamfered extrusion cross sections.
 * Pure geometry math: no dependency on Three.js, easy to test in Node.
 * All layer heights remain defined by the real printed G-code Z planes.
 *
 * A 0.42 x 0.20 mm extruded bead is closer to a rounded rectangle than
 * a sharp box. Eight polygon corners approximate its softened shoulders.
 * We duplicate ONLY the bevel vertices to give each bevel its own shade;
 * flat sides/top/bottom retain the original feature color. No extra meshes,
 * shadow maps or draw calls are required.
 */
export const BEVEL_SHADE = 230; // 230/255 = 90.2% of flat surface brightness
export const FLAT_SHADE = 255;
export const PROFILE_CORNER_COUNT = 8;
export const BEAD_VERTEX_COUNT = 32;
export const BEAD_TRIANGLE_COUNT = 28;

export function appendChamferedBead(out, a, b, top, bottom, width=0.42) {
  const dx=b.x-a.x, dy=b.y-a.y, length=Math.hypot(dx,dy);
  const height=top-bottom;
  if (!Number.isFinite(length) || length<0.0001 ||
      !Number.isFinite(top) || !Number.isFinite(bottom) || height<=0 ||
      !Number.isFinite(width) || width<=0) return false;

  const ux=-dy/length, uy=dx/length, half=width/2;
  // 12% of width, 14% of local height: visible seam with ample flat wall.
  const bx=Math.min(width*0.12, half*0.40);
  const bz=Math.min(height*0.14, height*0.25);
  if (bx<=0 || bz<=0) return false;
  // Clockwise outline around the 2-D bead cross section: (lateral, Z).
  const section=[
    [-half+bx,bottom], [half-bx,bottom],
    [half,bottom+bz], [half,top-bz],
    [half-bx,top], [-half+bx,top],
    [-half,top-bz], [-half,bottom+bz]
  ];
  const base=out.vertices.length/3;
  const write=(pos,s)=>{out.vertices.push(pos[0],pos[1],pos[2]);out.shades.push(s);};
  const xyz=(point,[lateral,z])=>[point.x+ux*lateral,point.y+uy*lateral,z];

  // Two shared ring outlines for the top, bottom, side and end-cap faces.
  for (const point of [a,b]) for(const p of section)write(xyz(point,p),FLAT_SHADE);

  // Flat horizontal/vertical faces use the original category color.
  for(const i of [0,2,4,6]){
    const j=(i+1)%PROFILE_CORNER_COUNT;
    out.indices.push(base+i,base+i+PROFILE_CORNER_COUNT,base+j,
      base+j,base+i+PROFILE_CORNER_COUNT,base+j+PROFILE_CORNER_COUNT);
  }
  // Chamfer facets use vertices with an independent 10%-darker shade.
  // They still live in the same indexed geometry and GPU draw call.
  for(const i of [1,3,5,7]){
    const j=(i+1)%PROFILE_CORNER_COUNT;
    const n=out.vertices.length/3;
    write(xyz(a,section[i]),BEVEL_SHADE);
    write(xyz(b,section[i]),BEVEL_SHADE);
    write(xyz(a,section[j]),BEVEL_SHADE);
    write(xyz(b,section[j]),BEVEL_SHADE);
    out.indices.push(n,n+1,n+2,n+2,n+1,n+3);
  }

  // Preserve closed ends (including paths that stop at a seam).
  for(let i=1;i<PROFILE_CORNER_COUNT-1;i++){
    out.indices.push(base,base+i+1,base+i);
    out.indices.push(base+PROFILE_CORNER_COUNT,
      base+PROFILE_CORNER_COUNT+i,
      base+PROFILE_CORNER_COUNT+i+1);
  }
  return true;
}
