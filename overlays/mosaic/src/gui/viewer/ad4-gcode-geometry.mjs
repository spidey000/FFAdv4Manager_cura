/* Memory-bounded, fully 3D G-code layer geometry.
 * Print segments are solid indexed rectangular filament beads, not a
 * single zero-thickness top-facing triangle strip. Each layer extends down
 * to the printed Z of the previous layer, so the model is opaque from
 * the side and stacked layers meet without visible horizontal gaps.
 * Travel moves remain thin translucent lines. No source G-code changes.
 */
import * as THREE from "three";
import {colorForToolpathType} from "./ad4-toolpath-colors.mjs";
import {getLayerStack} from "./ad4-layer-stack.mjs";

// Indexed solid prisms require more GPU memory than the previous flat ribbon.
// Keep the scene responsive on Android even for a full-resolution 3DBenchy.
export const PREVIEW_SEGMENT_BUDGET = 220000;
export const MOBILE_SEGMENT_BUDGET = 140000;
export const EXTRUSION_WIDTH_MM = 0.42;

function addTravelLine(out, a, b) {
  const dx=b.x-a.x, dy=b.y-a.y;
  const distance=Math.hypot(dx,dy);
  if(!Number.isFinite(distance) || distance<0.0001 ||
     !Number.isFinite(a.z) || !Number.isFinite(b.z)) return false;
  const ox=-dy/distance*0.022, oy=dx/distance*0.022;
  const offset=out.vertices.length/3;
  // One translucent quad; travel is not deposited plastic.
  out.vertices.push(
    a.x+ox,a.y+oy,a.z+0.012, a.x-ox,a.y-oy,a.z+0.012,
    b.x+ox,b.y+oy,b.z+0.012, b.x-ox,b.y-oy,b.z+0.012
  );
  out.indices.push(offset,offset+1,offset+2,offset+1,offset+3,offset+2);
  return true;
}

function addSolidBead(out, a, b, top, bottom, width=EXTRUSION_WIDTH_MM) {
  const dx=b.x-a.x,dy=b.y-a.y;
  const distance=Math.hypot(dx,dy);
  if(!Number.isFinite(distance) || distance<0.0001 ||
     !Number.isFinite(top) || !Number.isFinite(bottom) ||
     top<=bottom || !Number.isFinite(width) || width<=0) return false;
  const ox=-dy/distance*width/2,oy=dx/distance*width/2;
  const n=out.vertices.length/3;
  // Eight prism corners: A-left/right, B-left/right, bottom then top.
  // Coordinate Z becomes world vertical Y after the existing -90° X rotation.
  out.vertices.push(
    a.x-ox,a.y-oy,bottom, a.x+ox,a.y+oy,bottom,
    b.x-ox,b.y-oy,bottom, b.x+ox,b.y+oy,bottom,
    a.x-ox,a.y-oy,top,    a.x+ox,a.y+oy,top,
    b.x-ox,b.y-oy,top,    b.x+ox,b.y+oy,top
  );
  // Closed shell: upper/lower faces, two side walls and two end caps.
  // Shared corners + indexed triangles minimize GPU allocations.
  out.indices.push(
    n+4,n+5,n+6, n+5,n+7,n+6,  // top
    n+0,n+2,n+1, n+1,n+2,n+3,  // bottom
    n+0,n+4,n+2, n+2,n+4,n+6,  // left wall
    n+1,n+3,n+5, n+3,n+7,n+5,  // right wall
    n+0,n+1,n+4, n+1,n+5,n+4,  // start end cap
    n+2,n+6,n+3, n+3,n+6,n+7   // finish end cap
  );
  return true;
}

function previewBudget() {
  // Avoid requiring browser globals in Node and Python-based test tooling.
  const touch=typeof navigator !== "undefined" &&
    (navigator.maxTouchPoints>0 || navigator.hardwareConcurrency<=4);
  return touch ? MOBILE_SEGMENT_BUDGET : PREVIEW_SEGMENT_BUDGET;
}

export async function buildGcodeLayers(parsedData) {
  const group=new THREE.Group(),layers=[],materials=new Map(),categories=new Set();
  const stack=getLayerStack(parsedData);
  const segmentCount=parsedData.reduce((sum,layer)=>sum+layer.length,0);
  const budget=previewBudget();
  const stride=Math.max(1,Math.ceil(segmentCount/budget));
  let index=0,displayed=0,processed=0,solidSegments=0;

  for(let layerIndex=0;layerIndex<parsedData.length;layerIndex++){
    const layer=parsedData[layerIndex];
    const {top,bottom}=stack[layerIndex];
    let previous=null,printAnchor=null,anchorType=null;
    const layerGroup=new THREE.Group(),byCategory=new Map();
    let capturedLayerSegment=false;
    for(const point of layer){
      if(++processed%6000===0) await new Promise(resolve=>setTimeout(resolve,0));
      const b=point.vector;
      const a=previous?.vector;
      const type=point.type==="travel"?"TRAVEL":
        (point.subtype||"OTHER").trim().toUpperCase();
      const continuedPrint=type!=="TRAVEL" && previous?.type==="print" &&
        anchorType===type;
      if(type==="TRAVEL"){
        printAnchor=null;
        anchorType=null;
      }else if(!continuedPrint){
        printAnchor=a||null;
        anchorType=type;
      }
      previous=point;
      if(!a||!b) continue;
      // For simplified previews, join consecutive extrusions of the SAME
      // feature instead of leaving alternating missing ribbons. A travel or
      // type change resets the anchor, so no artificial bridges are formed.
      const shouldDraw=++index%stride===0 || !capturedLayerSegment;
      if(!shouldDraw) continue;

      let out=byCategory.get(type);
      if(!out){out={vertices:[],indices:[]};byCategory.set(type,out);}
      const ok=type==="TRAVEL"
        ? addTravelLine(out,a,b)
        : addSolidBead(out,printAnchor||a,b,top,bottom);
      if(ok){
        capturedLayerSegment=true;
        displayed++;
        categories.add(type);
        if(type!=="TRAVEL"){solidSegments++;printAnchor=b;}
      }
    }

    for(const [type,{vertices,indices}] of byCategory){
      if(!indices.length) continue;
      let material=materials.get(type);
      if(!material){
        material=new THREE.MeshBasicMaterial({
          color:colorForToolpathType(type),
          side:THREE.DoubleSide,
          transparent:type==="TRAVEL",
          opacity:type==="TRAVEL"?0.45:1,
          depthWrite:type!=="TRAVEL"
        });
        materials.set(type,material);
      }
      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute("position",
        new THREE.Float32BufferAttribute(vertices,3));
      geometry.setIndex(indices);
      geometry.computeBoundingSphere();
      const part=new THREE.Mesh(geometry,material);
      part.userData.ad4Category=type;
      layerGroup.add(part);
    }
    group.add(layerGroup);
    layers.push(layerGroup);
  }
  return {
    mesh:group,layers,categories:[...categories].sort(),
    segmentCount,displayed,solidSegments,
    solidPreview:true,
    layerHeights:stack.map(layer=>layer.height),
    simplified:stride>1||Boolean(globalThis.AD4GcodeParserInfo?.simplified)
  };
}

export function disposeGcodeLayers(mesh){
  if(!mesh)return;
  const materials=new Set();
  mesh.traverse(part=>{
    part.geometry?.dispose();
    if(part.material) for(const material of
      Array.isArray(part.material)?part.material:[part.material]) materials.add(material);
  });
  for(const material of materials)material.dispose();
}
