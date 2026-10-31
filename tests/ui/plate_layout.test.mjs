import test from "node:test";
import assert from "node:assert/strict";
import {
  AD4_BED,convexHull,polygonsOverlap,validatePlate,arrangeFootprints,shifted
} from "../../overlays/mosaic/src/gui/viewer/ad4-plate-layout.mjs";

const rect=(w,d)=>[[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]];
const placed=(id,poly,x=0,z=0)=>({id,outline:shifted(poly,x,z),lowY:0,highY:20});

test("rotated projected model geometry is checked, not only model centres",()=>{
 const diamond=convexHull([[0,-12],[12,0],[0,12],[-12,0]]);
 assert.equal(diamond.length,4);
 assert.equal(polygonsOverlap(diamond,shifted(rect(5,5),7,0)),true);
 assert.equal(polygonsOverlap(diamond,shifted(rect(5,5),20,0)),false);
});

test("touching is allowed; penetrating and required clearance are distinguished",()=>{
 const a=rect(20,20),b=shifted(rect(20,20),20,0);
 assert.equal(polygonsOverlap(a,b),false);
 assert.equal(polygonsOverlap(a,b,2),true);
 assert.equal(polygonsOverlap(a,shifted(b,-0.1,0)),true);
});

test("the real 220x200x250 bed rejects model overflow and z-height violations",()=>{
 assert.equal(validatePlate([placed("a",rect(20,20),100,0)]).valid,true);
 assert.equal(validatePlate([placed("a",rect(20,20),101,0)]).valid,false);
 assert.equal(validatePlate([placed("a",rect(20,20),0,91)]).valid,false);
 assert.equal(validatePlate([{...placed("a",rect(20,20)),highY:251}]).valid,false);
 assert.equal(validatePlate([{...placed("a",rect(20,20)),lowY:-1}]).valid,false);
 assert.equal(AD4_BED.maxX-AD4_BED.minX,220);
 assert.equal(AD4_BED.maxZ-AD4_BED.minZ,200);
});

test("colliding objects make the whole plate invalid, regardless of their labels",()=>{
 const a=placed("a",rect(30,30));
 const b=placed("b",rect(30,30),25,0);
 assert.match(validatePlate([a,b]).reason,/overlap/);
 assert.equal(validatePlate([a,placed("c",rect(30,30),30,0)]).valid,true);
});

test("Auto Arrange places multiple meshes with a 2mm gap and centres the group",()=>{
 const pieces=[
  {id:"first",outline:rect(55,40),lowY:0,highY:20},
  {id:"second",outline:rect(55,40),lowY:0,highY:20},
  {id:"third",outline:rect(55,40),lowY:0,highY:20},
  {id:"fourth",outline:rect(30,35),lowY:0,highY:20}
 ];
 const plan=arrangeFootprints(pieces);
 assert.equal(plan.length,pieces.length);
 assert.deepEqual(plan.map(p=>p.id),pieces.map(p=>p.id));
 const entries=pieces.map((piece,i)=>placed(piece.id,piece.outline,plan[i].x,plan[i].z));
 assert.equal(validatePlate(entries).valid,true);
 for(let i=0;i<entries.length;i++)
   for(let j=i+1;j<entries.length;j++)
     assert.equal(polygonsOverlap(entries[i].outline,entries[j].outline,2),false);
});

test("large or too many clones fail atomically (never return a partial plan)",()=>{
 const oversized=[{id:"oversized",outline:rect(221,30),lowY:0,highY:15}];
 assert.equal(arrangeFootprints(oversized),null);
 const pieces=Array.from({length:8},(_,i)=>({
  id:"copy"+i,outline:rect(105,95),lowY:0,highY:30
 }));
 assert.equal(arrangeFootprints(pieces),null);
});

test("non-finite transforms and degenerate footprints are rejected",()=>{
 assert.equal(validatePlate([{id:"broken",outline:[[0,0]],lowY:0,highY:5}]).valid,false);
 assert.deepEqual(convexHull([[NaN,1],[2,3]]),[]);
 assert.equal(arrangeFootprints([{id:"flat",outline:[[0,0]],lowY:0,highY:5}]),null);
});


test("specific errors identify the model, the exceeded edge and millimetres",()=>{
 const outside={...placed("id",rect(30,20),102,0),name:"part.stl"};
 const edge=validatePlate([outside]);
 assert.equal(edge.code,"BED_X_MAX");
 assert.match(edge.reason,/part\.stl/);
 assert.match(edge.reason,/right X edge/);
 assert.match(edge.reason,/7 mm/);
 const high={...placed("id",rect(20,20)),name:"tower.3mf",highY:255};
 assert.equal(validatePlate([high]).code,"HEIGHT_OVERFLOW");
 assert.match(validatePlate([high]).reason,/5 mm/);
 const a={...placed("one",rect(15,15)),name:"left.stl"};
 const b={...placed("two",rect(15,15),1,1),name:"right.stl"};
 const bad=validatePlate([a,b]);
 assert.equal(bad.code,"MODEL_COLLISION");
 assert.match(bad.reason,/left\.stl/);
 assert.match(bad.reason,/right\.stl/);
});
