import test from "node:test";
import assert from "node:assert/strict";
import {
  appendChamferedBead, BEVEL_SHADE, FLAT_SHADE,
  BEAD_VERTEX_COUNT, BEAD_TRIANGLE_COUNT
} from "../../overlays/mosaic/src/gui/viewer/ad4-bevel-profile.mjs";

function build(height=0.2,width=0.42) {
  const out={vertices:[],indices:[],shades:[]};
  const added=appendChamferedBead(
    out,{x:0,y:0,z:height},{x:10,y:0,z:height},
    height,0,width
  );
  return {added,...out};
}

test("one G-code segment has a closed octagonal chamfered profile",()=>{
  const result=build();
  assert.equal(result.added,true);
  assert.equal(result.vertices.length/3,BEAD_VERTEX_COUNT);
  assert.equal(result.indices.length/3,BEAD_TRIANGLE_COUNT);
  assert.equal(result.shades.length,BEAD_VERTEX_COUNT);
  assert.ok(result.indices.every(n=>n>=0 && n<BEAD_VERTEX_COUNT));
  assert.ok(result.shades.includes(BEVEL_SHADE));
  assert.ok(result.shades.includes(FLAT_SHADE));
  assert.equal(BEVEL_SHADE,230);
  assert.ok(Math.abs(BEVEL_SHADE/255-0.9)<0.003);
  assert.equal(result.shades.filter(s=>s===BEVEL_SHADE).length,16,
    "Only the four bevel surfaces use the shadow shade");
  assert.equal(result.shades.filter(s=>s===FLAT_SHADE).length,16,
    "The top, bottom, sides and ends retain full feature color");
});

test("variable G-code Z heights produce variable bevel geometry, unchanged total thickness",()=>{
  for(const height of [0.08,0.2,0.4,0.6]){
    const o=build(height),z=o.vertices.filter((_,i)=>i%3===2);
    assert.ok(Math.abs(Math.min(...z)-0)<1e-9);
    assert.ok(Math.abs(Math.max(...z)-height)<1e-9);
    assert.ok(z.some(v=>v>0&&v<height),"Bevel creates intermediate Z elevations");
    // Vertical walls are 72% of the layer thickness; the chamfers add 14% each.
    const sorted=[...new Set(z)].sort((a,b)=>a-b);
    assert.equal(sorted.length,4);
    assert.ok(Math.abs(sorted[1]-height*0.14)<1e-8);
    assert.ok(Math.abs(sorted[2]-height*0.86)<1e-8);
  }
});

test("no new extrusion is invented for stationary or malformed moves",()=>{
  const o={vertices:[],indices:[],shades:[]};
  assert.equal(appendChamferedBead(o,{x:1,y:2},{x:1,y:2},0.2,0),false);
  assert.equal(appendChamferedBead(o,{x:0,y:0},{x:1,y:0},0.2,0.2),false);
  assert.equal(o.vertices.length,0);
});

test("two adjacent layers retain the exact joining Z plane",()=>{
  const a=build(0.2),b={vertices:[],indices:[],shades:[]};
  assert.equal(appendChamferedBead(
    b,{x:0,y:0},{x:10,y:0},0.6,0.2
  ),true);
  const zA=a.vertices.filter((_,i)=>i%3===2);
  const zB=b.vertices.filter((_,i)=>i%3===2);
  assert.equal(Math.max(...zA),Math.min(...zB));
});

test("diagonal paths keep the same width and color and use packed brightness",()=>{
  const o={vertices:[],indices:[],shades:[]};
  appendChamferedBead(o,{x:0,y:0},{x:10,y:10},0.2,0,0.42);
  const a=o.vertices.slice(0,3),b=o.vertices.slice(3,6);
  assert.ok(Math.abs(Math.hypot(a[0]-b[0],a[1]-b[1])-0.42+0.42*0.24)<1e-7,
    "Flat bottom width is exactly width - 2 chamfers");
  const packed=new Uint8Array(o.shades);
  assert.equal(packed.byteLength,BEAD_VERTEX_COUNT,
    "The shader needs one packed BYTE per vertex, not float RGB colors");
});
