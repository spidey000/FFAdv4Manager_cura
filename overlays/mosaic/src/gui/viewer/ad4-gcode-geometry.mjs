/* ThreeSlicer MIT viewer adapter: real GPU-mitered plastic beads.
 *
 * The actual instancing geometry, miter joins, Lambert face lighting, GL3
 * shaders, travel lines and two real far-distance LODs come directly from
 * ThreeSlicer's standalone MIT viewer (see ad4-three-slicer/LICENSE).
 * This adapter only translates Mosaic's parsed Cura/Prusa G-code into the
 * viewer's documented {z, paths, widths} interface and exposes AD4 controls.
 * No dependency on ThreeSlicer's AGPL slicing kernel. Never changes G-code.
 */
import * as THREE from "three";
import {getLayerStack} from "./ad4-layer-stack.mjs";
import {colorForToolpathType} from "./ad4-toolpath-colors.mjs";
import {ROLE} from "./ad4-three-slicer/core/toolpath_encoding.mjs";
import {packColor,hexToRgb} from "./ad4-three-slicer/core/toolpath_palette.mjs";
import {buildSegmentData} from "./ad4-three-slicer/core/toolpath_segments.mjs";
import {makeToolpath} from "./ad4-three-slicer/scene/toolpath_mesh.mjs";
import {moveCursor,topMoveLayer} from "./ad4-three-slicer/core/toolpath_segments.mjs";
import {computeColors} from "./ad4-three-slicer/core/toolpath_views.mjs";

export const EXTRUSION_WIDTH_MM=0.42;
export const PREVIEW_SEGMENT_BUDGET=320000;
export const MOBILE_SEGMENT_BUDGET=220000;

// Keep distinct category IDs for every label in the AD4 panel, even though
// ThreeSlicer's shader uses a smaller set of semantic types for statistics.
const roleMap=Object.freeze({
  "PERIMETER":ROLE.WALL,"EXTERNAL PERIMETER":ROLE.WALL,
  "WALL-OUTER":ROLE.WALL,"WALL-INNER":ROLE.WALL,
  "OVERHANG PERIMETER":ROLE.BRIDGE,
  "INTERNAL INFILL":ROLE.SPARSE,"FILL":ROLE.SPARSE,
  "SOLID INFILL":ROLE.SOLID,"TOP SOLID INFILL":ROLE.SOLID,"SKIN":ROLE.SOLID,
  "BRIDGE INFILL":ROLE.BRIDGE,"INTERNAL BRIDGE INFILL":ROLE.BRIDGE,
  "SUPPORT":ROLE.SUPPORT,"SUPPORT MATERIAL":ROLE.SUPPORT,
  "SUPPORT-INTERFACE":ROLE.SUPPORT,"SUPPORT MATERIAL INTERFACE":ROLE.SUPPORT,
  "SKIRT":ROLE.SKIRT,"BRIM":ROLE.SKIRT,"SKIRT/BRIM":ROLE.SKIRT,
  "RAFT":ROLE.RAFT,"GAP FILL":ROLE.GAP,
  "IRONING":ROLE.IRONING,"WIPE TOWER":ROLE.PRIME
});
function roleFor(type){return roleMap[type]??ROLE.WALL;}
function hexColor(type){return colorForToolpathType(type);}
function rgbPacked(type){return packColor(hexToRgb(hexColor(type)));}

function physicalWidth(a,point,height,filamentDiameter){
  const annotated=Number(point.width);
  if(Number.isFinite(annotated) && annotated>0.05 && annotated<3)return annotated;
  const travel=Math.hypot(point.vector.x-a.x,point.vector.y-a.y);
  const length=Number(point.vector.w)-Number(a.w);
  if(travel<1e-6||!Number.isFinite(length)||length<=0||height<=0)
    return EXTRUSION_WIDTH_MM;
  const area=length*Math.PI*(filamentDiameter/2)**2/travel;
  // Rounded-rectangle deposition: A = h*(w - h)+pi*(h/2)^2.
  const estimated=area/height + height*(1-Math.PI/4);
  return Number.isFinite(estimated) && estimated>=0.18 && estimated<=1.6
    ? estimated:EXTRUSION_WIDTH_MM;
}

export async function buildGcodeLayers(parsedData){
  const stack=getLayerStack(parsedData);
  const categories=new Set(),types=[],layerValues=[];
  const layers=[];
  let countSource=0,countPrinted=0,countTravel=0,lastZ=0;
  // ThreeSlicer's buildSegmentData allocates typed arrays in exactly two
  // passes. Only this light translation has a temporary G-code layer array.
  for(let li=0;li<parsedData.length;li++){
    const layer=parsedData[li],path=[];
    const widths=[];
    const level=stack[li];
    const top=level.top??lastZ;
    if(level.top!==null)lastZ=top;
    let previous=null;
    for(const point of layer){
      countSource++;
      const p=point.vector, a=previous?.vector;
      if(!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) ||
         !Number.isFinite(p.z)){previous=point;continue;}
      if(a && Number.isFinite(a.x) && Number.isFinite(a.y) &&
         Number.isFinite(a.z) &&
         Math.hypot(p.x-a.x,p.y-a.y)>0.0001){
        const print=point.type==="print",type=print?
          (point.subtype||"OTHER").trim().toUpperCase():"TRAVEL";
        const role=print?roleFor(type):ROLE.TRAVEL;
        // The nozzle Z (not bead centre) is the absolute top of its layer.
        const z=print?top:p.z;
        path.push(a.x,a.y,z,role,p.x,p.y,z,role);
        const width=print?physicalWidth(a,point,level.height,1.75):0;
        widths.push(width);
        if(print){
          countPrinted++;
          categories.add(type);types.push(type);layerValues.push(li);
        }else{
          countTravel++;categories.add("TRAVEL");
        }
      }
      previous=point;
      if(countSource%6000===0) await new Promise(resolve=>setTimeout(resolve,0));
    }
    layers.push({z:top,paths:new Float32Array(path),widths:new Float32Array(widths)});
  }
  const data=buildSegmentData(layers,EXTRUSION_WIDTH_MM);
  if(data.hasNaN)throw Error("Invalid non-finite print geometry");
  if(data.nSeg!==types.length)throw Error("G-code category/segment synchronization failed");
  const handle=makeToolpath(THREE,data);
  // ThreeSlicer uses shader-expanded vertices (tpl, not "position"), so
  // Three.js cannot infer the model bounds from the template. Supply them.
  if(data.bbox){
    handle.mesh.geometry.boundingBox=new THREE.Box3(
      new THREE.Vector3(...data.bbox.min),
      new THREE.Vector3(...data.bbox.max));
  }

  // This is exactly the category array the shader instancing uses. A hidden
  // type is represented by -1, which the vertex shader safely clips.
  const packed=new Float32Array(data.nV*4);
  let viewMode="feature";
  // ThreeSlicer hides non-extruding travel lines by default.
  // Keep the AD4 layer-type switch truthful about that initial state.
  const hidden=new Set(categories.has("TRAVEL")?["TRAVEL"]:[]);
  const packedByType=new Map();
  for(const type of categories)packedByType.set(type,rgbPacked(type));
  function refreshColors(){
    const derived=viewMode==="feature"?null:
      computeColors(data,viewMode,{toolColors:["#fa7329"]}).color;
    for(let i=0;i<types.length;i++){
      const color=hidden.has(types[i])?-1:
        derived?derived[i*8]:packedByType.get(types[i]);
      packed[i*8]=color;packed[i*8+4]=color;
    }
    handle.setColors(packed);
  }
  refreshColors();
  const root=new THREE.Group();
  root.add(handle.mesh,handle.travLines);
  // Nozzle points at the actual toolpath Z (the green cone stays above it).
  const nozzle=new THREE.Mesh(
    new THREE.ConeGeometry(1.2,3.6,12),
    new THREE.MeshBasicMaterial({color:0x20e37c,depthTest:false,depthWrite:false})
  );
  nozzle.rotation.x=-Math.PI/2;
  nozzle.renderOrder=999;nozzle.frustumCulled=false;nozzle.visible=false;
  root.add(nozzle);
  function moveNozzle(cursor){
    const p=cursor?.point;
    nozzle.visible=Array.isArray(p)&&p.every(Number.isFinite);
    if(nozzle.visible)nozzle.position.set(p[0],p[1],p[2]+1.8);
  }
  function showMove(at,selectedLayer=data.layerCount-1){
    if(at==null){handle.setMoveRange(null);nozzle.visible=false;return null}
    const layer=topMoveLayer(data,0,Math.max(0,Math.min(data.layerCount-1,selectedLayer)));
    const total=data.movePrefix[layer+1]-data.movePrefix[layer];
    // Do not disable ThreeSlicer LOD for the last (complete) move.
    const cursor=at>=total?
      (handle.setMoveRange(null),moveCursor(data,layer,total)):
      handle.setMoveRange(at);
    moveNozzle(cursor);
    return cursor;
  }
  const layerHeights=stack.map(x=>x.height);
  const returned={
    mesh:root,layers:Array.from({length:parsedData.length},()=>({visible:true})),
    get viewMode(){return viewMode;},
    setViewMode(mode){
      if(!["feature","filament","height","width"].includes(mode))
        throw new RangeError("Unsupported ThreeSlicer color mode: "+mode);
      viewMode=mode;refreshColors();
    },
    handle,hiddenTypes:hidden,categories:[...categories].sort(),
    nozzle,showMove,
    layerHeights,segmentCount:countSource,
    displayed:data.nSeg+countTravel,solidSegments:data.nSeg,
    solidPreview:true,gpuInstanced:true,threeSlicerViewer:true,
    // ThreeSlicer: two 3D endpoint buffers + height/width/packed color,
    // layer and packed miter-join angle. LOD buffer bytes are tracked too.
    instanceBytes:Object.values(handle.mesh.geometry.attributes)
      .reduce((sum,attribute)=>sum+(attribute.isInstancedBufferAttribute?
        attribute.array.byteLength:0),0),
    setRange(from,to){handle.setLayerRange(from,to);},
    setTypeVisible(type,visible){
      if(visible)hidden.delete(type);else hidden.add(type);
      if(type==="TRAVEL")handle.setTravelVisible(visible);
      else refreshColors();
    },
    updateLod(camera,viewportPixels){handle.updateLod(camera,viewportPixels);},
    dispose(){handle.dispose();nozzle.geometry.dispose();nozzle.material.dispose();}
  };
  root.userData.ad4Toolpath=returned;
  return returned;
}
export function disposeGcodeLayers(mesh){
  if(!mesh)return;
  const disposed=new Set();
  mesh.traverse(part=>{
    if(part.userData?.ad4Toolpath && !disposed.has(part.userData.ad4Toolpath)){
      disposed.add(part.userData.ad4Toolpath);
      part.userData.ad4Toolpath.dispose();
    }
  });
}
