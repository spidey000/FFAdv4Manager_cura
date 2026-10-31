/* Single source of truth for AD4 plate integrity, independent of the UI.
 * Installed in Mosaic's authoritative model viewer during preparation.
 */
import * as THREE from "three";
import {AD4_BED,convexHull,validatePlate,arrangeFootprints} from "./ad4-plate-layout.mjs";

const AXES = [-1,1];

export function installPlateOperations({
  models,scene,interactions,controls,renderer,focusModel,updateOverlays,clearSliceState
}) {
  const saved=new WeakMap();
  let transaction=0;

  const emit=(name,detail={})=>
    document.dispatchEvent(new CustomEvent("ad4:"+name,{detail}));
  function fail(reason) { emit("plate-rejected",{reason}); return false; }
  function remember(mesh) {
    saved.set(mesh,{position:mesh.position.clone(),quaternion:mesh.quaternion.clone(),
                    scale:mesh.scale.clone()});
  }
  function restore(mesh) {
    const old=saved.get(mesh);
    if (!old) return;
    mesh.position.copy(old.position);
    mesh.quaternion.copy(old.quaternion);
    mesh.scale.copy(old.scale);
    mesh.updateMatrixWorld(true);
    updateOverlays();
    renderer.invalidate();
  }
  function entry(mesh) {
    if (!mesh?.geometry) return {id:mesh?.uuid,outline:[],lowY:NaN,highY:NaN};
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const b=mesh.geometry.boundingBox;
    if (!b || !mesh.position || !mesh.scale) return {id:mesh?.uuid,outline:[],lowY:NaN,highY:NaN};
    mesh.updateMatrixWorld(true);
    const corners=[];
    for (const x of AXES) for (const y of AXES) for (const z of AXES) {
      const p=new THREE.Vector3(x<0?b.min.x:b.max.x,
                                y<0?b.min.y:b.max.y,
                                z<0?b.min.z:b.max.z).applyMatrix4(mesh.matrixWorld);
      corners.push(p);
    }
    return {
      id:mesh.uuid,
      name:mesh.name || models[mesh.uuid]?.name || "Model",
      outline:convexHull(corners.map(p=>[p.x,p.z])),
      lowY:Math.min(...corners.map(p=>p.y)),
      highY:Math.max(...corners.map(p=>p.y))
    };
  }
  const activeMeshes=()=>Object.values(models).map(record=>record.mesh);
  const check=meshes=>validatePlate(meshes.map(entry),AD4_BED);
  const status=()=>{
    const meshes=activeMeshes();
    if(!meshes.length)return {valid:false,code:"EMPTY_PLATE",reason:"Add an STL or 3MF model before slicing"};
    try{return check(meshes)}
    catch(error){return {valid:false,code:"PLATE_CHECK_FAILED",
      reason:"Unable to verify build plate geometry: "+(error?.message || String(error))}}
  };
  const isValid=()=>status().valid;

  function arrange(meshes=activeMeshes(),{quiet=false}={}) {
    if(!meshes.length)return quiet?false:fail("Load at least one model before arranging");
    const pieces=meshes.map(mesh=>{
      const p=entry(mesh);
      return {...p,outline:p.outline.map(([x,z])=>[x-mesh.position.x,z-mesh.position.z])};
    });
    const placements=arrangeFootprints(pieces,AD4_BED,2);
    if (!placements) return quiet?false:fail("These models cannot all fit on the Adventurer 4 build plate");
    const byId=new Map(meshes.map(m=>[m.uuid,m]));
    for (const place of placements) {
      const mesh=byId.get(place.id);
      mesh.position.x=place.x;
      mesh.position.z=place.z;
      mesh.updateMatrixWorld(true);
    }
    // The planner and editor MUST agree; never keep an invalid partial layout.
    const result=check(meshes);
    if (!result.valid) {
      for (const mesh of meshes) restore(mesh);
      return quiet?false:fail(result.reason);
    }
    for (const mesh of meshes) remember(mesh);
    clearSliceState();
    updateOverlays();
    renderer.invalidate();
    emit("plate-arranged",{count:meshes.length});
    emit("plate-valid");
    return true;
  }
  // Imports are ALWAYS editable. A too-large or overlapping STL must remain
  // in the scene so the user can resize, rotate or move it until it fits.
  // Safety belongs to the Slice/export boundary, not the model loader.
  function acceptNewModel(mesh,fileName="") {
    if(fileName)mesh.name=fileName;
    remember(mesh);
    clearSliceState();
    return true;
  }
  function cloneSelected() {
    const source=models[getFocused()];
    if (!source) return fail("Select a model to clone");
    const mesh=source.mesh.clone();
    mesh.material=source.mesh.material.clone();
    const ordinal=Object.values(models).filter(m=>m.name?.startsWith(source.name+" (copy")).length+1;
    mesh.name=source.name+" (copy "+ordinal+")";
    remember(mesh);
    // Try packing first. If there is not enough room (or the original is
    // oversized), keep the clone anyway and let the user fix its size/pose.
    // Quiet mode avoids saying nothing changed when a clone was created.
    arrange([...activeMeshes(),mesh],{quiet:true});
    scene.add(mesh);
    models[mesh.uuid]={mesh,data:source.data,name:mesh.name};
    const sceneobj=Object.create(interactions.SceneObject);
    sceneobj.mesh=mesh;
    sceneobj.onclick=()=>{if (getFocused()!==mesh.uuid) focusModel(mesh.uuid);};
    interactions.scene_objects[mesh.uuid]=sceneobj;
    focusModel(mesh.uuid);
    clearSliceState();
    renderer.invalidate();
    emit("models-changed",{count:Object.keys(models).length});
    emit("plate-status",status());
    return true;
  }
  // Native focus is an ES module live binding, so obtain it at call time.
  let focusedGetter=()=>null;
  function getFocused(){return focusedGetter();}
  function setFocusedGetter(callback){focusedGetter=callback;}
  // Transform completion must NEVER roll back an out-of-bounds or colliding
  // model: it is a valid EDIT, but not a valid PRINT. Keep the exact user pose,
  // clear stale sliced output and publish diagnostic status to the viewport.
  function validateSelected() {
    if(transaction)return true;
    clearSliceState();
    for(const mesh of activeMeshes())remember(mesh);
    renderer.invalidate();
    const result=status();
    emit("plate-status",result);
    if(result.valid)emit("plate-valid");
    return true;
  }
  function beginTransform() {
    if (transaction++===0) {
      for (const mesh of activeMeshes()) if (!saved.has(mesh)) remember(mesh);
    }
  }
  function commitTransform() {
    if (transaction>0) transaction--;
    if (transaction===0) return validateSelected();
    return true;
  }
  controls.addEventListener("dragging-changed",event=>{
    if(event.value)beginTransform();
    else commitTransform();
  });
  controls.addEventListener("mouseUp",()=>{if(transaction>0)commitTransform();});
  // Mosaic's native numeric controls are also used by our mobile rulers.
  // Re-evaluate Slice eligibility after native numeric edits; never reject
  // their placement. Compound edits publish one final status.
  document.addEventListener("input",event=>{
    const id=event.target?.id || "";
    if (/^(movement|rotation|scale)-[xyz]-value$/.test(id) && !transaction)
      validateSelected();
  });
  return {setFocusedGetter,status,isValid,arrange,acceptNewModel,cloneSelected,
          beginTransform,commitTransform,validateSelected};
}
