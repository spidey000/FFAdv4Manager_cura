/* GPU-instanced G-code preview, inspired by ThreeSlicer's MIT viewer.
 * Store per-segment typed attributes, not 32 expanded world-space vertices.
 * The old geometry expansion is replaced by one reusable 32-vertex bead.
 * This keeps all feature/category and layer selection API contracts intact.
 */
import * as THREE from "three";
import {colorForToolpathType} from "./ad4-toolpath-colors.mjs";
import {getLayerStack} from "./ad4-layer-stack.mjs";
import {appendChamferedBead,BEVEL_SHADE} from "./ad4-bevel-profile.mjs";
import {enableInstancedBeadShader} from "./ad4-gpu-seams.mjs";

export const PREVIEW_SEGMENT_BUDGET=320000;
export const MOBILE_SEGMENT_BUDGET=220000;
export const EXTRUSION_WIDTH_MM=0.42;
export const INSTANCE_BYTES=32; // 8 float32 values per print segment
export const TEMPLATE_VERTEX_COUNT=32;
export const TEMPLATE_TRIANGLE_COUNT=28;

const template=(()=>{
  const data={vertices:[],indices:[],shades:[]};
  if(!appendChamferedBead(data,{x:0,y:0},{x:1,y:0},1,0,1))
    throw Error("Cannot initialize normalized filament template");
  return {
    position:new THREE.Float32BufferAttribute(data.vertices,3),
    shade:new THREE.Uint8BufferAttribute(data.shades,1,true),
    index:new THREE.BufferAttribute(new Uint16Array(data.indices),1)
  };
})();

function createPrintMaterial(type){
  const material=new THREE.MeshBasicMaterial({
    color:colorForToolpathType(type),
    side:THREE.DoubleSide,transparent:false,depthWrite:true
  });
  enableInstancedBeadShader(material);
  return material;
}

function createInstancedGeometry(data,layerIndex){
  const count=data.starts.length/2;
  const geometry=new THREE.InstancedBufferGeometry();
  geometry.setAttribute("position",template.position);
  geometry.setAttribute("ad4Shade",template.shade);
  geometry.setIndex(template.index);
  geometry.setAttribute("iStart",
    new THREE.InstancedBufferAttribute(new Float32Array(data.starts),2));
  geometry.setAttribute("iEnd",
    new THREE.InstancedBufferAttribute(new Float32Array(data.ends),2));
  geometry.setAttribute("iDimensions",
    new THREE.InstancedBufferAttribute(new Float32Array(data.dimensions),3));
  geometry.setAttribute("iLayer",
    new THREE.InstancedBufferAttribute(new Float32Array(count).fill(layerIndex),1));
  geometry.instanceCount=count;
  // Template (0..1) bounds are NOT the real segment bounds. Computing real
  // bounds avoids premature frustum culling of the boat as the camera moves.
  const b=data.bounds;
  geometry.boundingBox=new THREE.Box3(
    new THREE.Vector3(b[0],b[1],b[2]),
    new THREE.Vector3(b[3],b[4],b[5]));
  geometry.boundingSphere=new THREE.Sphere();
  geometry.boundingBox.getBoundingSphere(geometry.boundingSphere);
  geometry.userData.ad4InstanceCount=count;
  geometry.userData.ad4InstanceBytes=count*INSTANCE_BYTES;
  return geometry;
}

function trackBounds(bounds,a,b,top,bottom,width){
  const r=width/2;
  bounds[0]=Math.min(bounds[0],a.x-r,b.x-r);
  bounds[1]=Math.min(bounds[1],a.y-r,b.y-r);
  bounds[2]=Math.min(bounds[2],bottom);
  bounds[3]=Math.max(bounds[3],a.x+r,b.x+r);
  bounds[4]=Math.max(bounds[4],a.y+r,b.y+r);
  bounds[5]=Math.max(bounds[5],top);
}

function addTravel(out,a,b){
  const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
  if(!Number.isFinite(len)||len<0.0001||
     !Number.isFinite(a.z)||!Number.isFinite(b.z))return false;
  const ox=-dy/len*0.022,oy=dx/len*0.022;
  const n=out.vertices.length/3;
  out.vertices.push(a.x+ox,a.y+oy,a.z+0.012,
    a.x-ox,a.y-oy,a.z+0.012,b.x+ox,b.y+oy,b.z+0.012,
    b.x-ox,b.y-oy,b.z+0.012);
  out.indices.push(n,n+1,n+2,n+1,n+3,n+2);
  return true;
}

function previewBudget(){
  const touch=typeof navigator!=="undefined" &&
    (navigator.maxTouchPoints>0||navigator.hardwareConcurrency<=4);
  return touch?MOBILE_SEGMENT_BUDGET:PREVIEW_SEGMENT_BUDGET;
}

export async function buildGcodeLayers(parsedData){
  const group=new THREE.Group(),layers=[],materials=new Map(),categories=new Set();
  const stack=getLayerStack(parsedData);
  const segmentCount=parsedData.reduce((sum,layer)=>sum+layer.length,0);
  const stride=Math.max(1,Math.ceil(segmentCount/previewBudget()));
  let index=0,displayed=0,processed=0,solidSegments=0,instanceBytes=0;

  for(let layerIndex=0;layerIndex<parsedData.length;layerIndex++){
    const layer=parsedData[layerIndex],{top,bottom}=stack[layerIndex];
    let previous=null,printAnchor=null,anchorType=null;
    const layerGroup=new THREE.Group(),byCategory=new Map();
    let capturedLayerSegment=false;
    for(const point of layer){
      if(++processed%6000===0)await new Promise(resolve=>setTimeout(resolve,0));
      const b=point.vector,a=previous?.vector;
      const type=point.type==="travel"?"TRAVEL":
        (point.subtype||"OTHER").trim().toUpperCase();
      const continued=type!=="TRAVEL"&&previous?.type==="print"&&anchorType===type;
      if(type==="TRAVEL"){printAnchor=null;anchorType=null;}
      else if(!continued){printAnchor=a||null;anchorType=type;}
      previous=point;
      if(!a||!b)continue;
      // Large files: connect only points within a continuous extrusion run,
      // never over travel or a switch to another feature type.
      if(++index%stride!==0&&capturedLayerSegment)continue;

      let data=byCategory.get(type);
      if(!data){
        data=type==="TRAVEL"?{vertices:[],indices:[]}:
          {starts:[],ends:[],dimensions:[],
            bounds:[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity]};
        byCategory.set(type,data);
      }
      let ok=false;
      if(type==="TRAVEL")ok=addTravel(data,a,b);
      else if(top!==null&&bottom!==null){
        const start=printAnchor||a;
        if(Number.isFinite(start.x)&&Number.isFinite(start.y)&&
           Number.isFinite(b.x)&&Number.isFinite(b.y)&&
           Math.hypot(b.x-start.x,b.y-start.y)>0.0001){
          data.starts.push(start.x,start.y);
          data.ends.push(b.x,b.y);
          data.dimensions.push(bottom,top,EXTRUSION_WIDTH_MM);
          trackBounds(data.bounds,start,b,top,bottom,EXTRUSION_WIDTH_MM);
          ok=true;
        }
      }
      if(ok){
        categories.add(type);capturedLayerSegment=true;displayed++;
        if(type!=="TRAVEL"){solidSegments++;printAnchor=b;}
      }
    }
    for(const [type,data] of byCategory){
      if(type==="TRAVEL"?!data.indices.length:!data.starts.length)continue;
      let material=materials.get(type);
      if(!material){
        material=type==="TRAVEL"?
          new THREE.MeshBasicMaterial({
            color:colorForToolpathType(type),side:THREE.DoubleSide,
            transparent:true,opacity:0.45,depthWrite:false
          }):createPrintMaterial(type);
        materials.set(type,material);
      }
      let geometry;
      if(type==="TRAVEL"){
        geometry=new THREE.BufferGeometry();
        geometry.setAttribute("position",
          new THREE.Float32BufferAttribute(data.vertices,3));
        geometry.setIndex(data.indices);
        geometry.computeBoundingSphere();
      }else{
        geometry=createInstancedGeometry(data,layerIndex);
        instanceBytes+=geometry.userData.ad4InstanceBytes;
      }
      const part=new THREE.Mesh(geometry,material);
      part.userData.ad4Category=type;
      layerGroup.add(part);
    }
    group.add(layerGroup);
    layers.push(layerGroup);
  }
  return {
    mesh:group,layers,categories:[...categories].sort(),
    segmentCount,displayed,solidSegments,solidPreview:true,
    bevelPreview:true,bevelShade:BEVEL_SHADE/255,
    gpuInstanced:true,instanceBytes,
    layerHeights:stack.map(layer=>layer.height),
    simplified:stride>1||Boolean(globalThis.AD4GcodeParserInfo?.simplified)
  };
}

export function disposeGcodeLayers(mesh){
  if(!mesh)return;
  const materials=new Set();
  mesh.traverse(part=>{
    part.geometry?.dispose();
    if(part.material)for(const material of
      Array.isArray(part.material)?part.material:[part.material])materials.add(material);
  });
  for(const material of materials)material.dispose();
}
