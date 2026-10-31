/* Independent, read-only printer-job renderer. Never changes the editor scene. */
import * as THREE from "three";
import {OrbitControls} from "three/examples/jsm/controls/OrbitControls.js";

export function createLiveRenderer(container){
 const scene=new THREE.Scene();scene.background=new THREE.Color(0x10181c);
 const camera=new THREE.PerspectiveCamera(45,1,.1,3000);camera.up.set(0,1,0);
 const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});
 renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));container.append(renderer.domElement);
 renderer.domElement.setAttribute("aria-label","Current print toolpath viewed from the right wall");
 const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;
 const grid=new THREE.GridHelper(220,22,0x47605b,0x22342f);scene.add(grid);
 const plate=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(-110,0,-100),new THREE.Vector3(110,0,-100),new THREE.Vector3(110,0,100),new THREE.Vector3(-110,0,100)]),new THREE.LineBasicMaterial({color:0x79978c}));scene.add(plate);
 const nozzleGeometry=new THREE.ConeGeometry(4,12,18);
 // A cone normally points upward. Flip it so its red tip is exactly at M114 XYZ.
 nozzleGeometry.rotateZ(Math.PI);nozzleGeometry.translate(0,6,0);
 const marker=new THREE.Mesh(nozzleGeometry,new THREE.MeshBasicMaterial({color:0xff3344,depthTest:false,depthWrite:false}));
 marker.renderOrder=20;marker.visible=false;scene.add(marker);
 const paths=new THREE.Group();scene.add(paths);
 let layers=[],offsets=[],meshes=[],disposed=false,raf=null,center=new THREE.Vector3(0,30,0);
 const render=()=>renderer.render(scene,camera);
 const reset=()=>{controls.target.copy(center);camera.position.copy(center).add(new THREE.Vector3(350,140,0));controls.update();render()};
 function resize(){const r=container.getBoundingClientRect();if(!r.width||!r.height)return;renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();render()}
 const observer=new ResizeObserver(resize);observer.observe(container);
 function clear(){for(const mesh of meshes){paths.remove(mesh);mesh.geometry.dispose();mesh.material.dispose()}meshes=[]}
 function load(data){
  clear();layers=data.layers;offsets=[];const coordinates=[];
  for(const layer of layers){offsets.push(coordinates.length/3);for(let i=0;i<layer.segments.length;i+=3)coordinates.push(layer.segments[i],layer.segments[i+2],-layer.segments[i+1])}
  offsets.push(coordinates.length/3);
  const attribute=new THREE.Float32BufferAttribute(coordinates,3);
  for(const [color,opacity] of [[0x5ad3ae,.48],[0xffd977,1],[0xa0b4bd,.12]]){
   const geometry=new THREE.BufferGeometry();geometry.setAttribute("position",attribute);
   const material=new THREE.LineBasicMaterial({color,transparent:true,opacity,depthWrite:false});
   const mesh=new THREE.LineSegments(geometry,material);meshes.push(mesh);paths.add(mesh);
  }
  const height=layers.at(-1)?.z||.2;center.set(0,Math.min(100,height/2),0);reset();update({layer_current:null,position:{}});
 }
 function update(state){
  const number=state.layer_current,valid=Number.isInteger(number)&&number>=1&&number<=layers.length;
  const index=valid?number-1:0,last=offsets.at(-1)||0;
  if(meshes.length){
   meshes[0].geometry.setDrawRange(0,valid?offsets[index]:0);
   meshes[1].geometry.setDrawRange(valid?offsets[index]:0,valid?offsets[index+1]-offsets[index]:0);
   meshes[2].geometry.setDrawRange(valid?offsets[index+1]:0,valid?last-offsets[index+1]:last);
  }
  const p=Object.fromEntries(Object.entries(state.position||{}).map(([k,v])=>[k.toUpperCase(),v]));
  marker.visible=state.active!==false&&[p.X,p.Y,p.Z].every(Number.isFinite);
  if(marker.visible)marker.position.set(p.X,p.Z,-p.Y);
  render();
 }
 function animate(){if(disposed)return;controls.update();raf=requestAnimationFrame(animate);render()}
 reset();resize();animate();
 return {load,update,reset,dispose(){disposed=true;cancelAnimationFrame(raf);observer.disconnect();controls.dispose();clear();
  grid.geometry.dispose();grid.material.dispose();plate.geometry.dispose();plate.material.dispose();marker.geometry.dispose();marker.material.dispose();renderer.dispose();renderer.domElement.remove()}};
}

globalThis.AD4LiveRenderer={create:createLiveRenderer};
