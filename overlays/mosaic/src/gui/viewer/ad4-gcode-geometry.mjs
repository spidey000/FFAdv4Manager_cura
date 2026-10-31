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
import {appendChamferedBead, BEVEL_SHADE} from "./ad4-bevel-profile.mjs";

// Indexed solid prisms require more GPU memory than the previous flat ribbon.
// Keep the scene responsive on Android even for a full-resolution 3DBenchy.
export const PREVIEW_SEGMENT_BUDGET = 150000;
export const MOBILE_SEGMENT_BUDGET = 105000;
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

/* One ultra-cheap vertex-shade scalar, stored as a normalized byte.
 * Standard MeshBasicMaterial stays unlit and all facets are part of the
 * SAME draw call; no shadows, light calculations, or extra material passes.
 * Flat faces are 1.0, bevels are 230/255 (~0.90).
 */
function enableBevelShading(material) {
  material.onBeforeCompile = shader => {
    shader.vertexShader=shader.vertexShader
      .replace("#include <common>",
        "#include <common>\nattribute float ad4Shade;\nvarying float vAd4Shade;")
      .replace("#include <begin_vertex>",
        "#include <begin_vertex>\nvAd4Shade = ad4Shade;");
    shader.fragmentShader=shader.fragmentShader
      .replace("#include <common>",
        "#include <common>\nvarying float vAd4Shade;")
      .replace("#include <color_fragment>",
        "#include <color_fragment>\ndiffuseColor.rgb *= vAd4Shade;");
  };
  material.customProgramCacheKey = () => "ad4-chamfer-10-percent-v1";
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
      if(!out){out={vertices:[],indices:[],shades:[]};byCategory.set(type,out);}
      const ok=type==="TRAVEL"
        ? addTravelLine(out,a,b)
        : appendChamferedBead(out,printAnchor||a,b,top,bottom,EXTRUSION_WIDTH_MM);
      if(ok){
        capturedLayerSegment=true;
        displayed++;
        categories.add(type);
        if(type!=="TRAVEL"){solidSegments++;printAnchor=b;}
      }
    }

    for(const [type,{vertices,indices,shades}] of byCategory){
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
        if(type!=="TRAVEL")enableBevelShading(material);
        materials.set(type,material);
      }
      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute("position",
        new THREE.Float32BufferAttribute(vertices,3));
      geometry.setIndex(indices);
      if(type!=="TRAVEL"){
        geometry.setAttribute("ad4Shade",
          new THREE.Uint8BufferAttribute(shades,1,true));
      }
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
    bevelPreview:true,
    bevelShade:BEVEL_SHADE/255,
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
