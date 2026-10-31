import test from "node:test";
import assert from "node:assert/strict";
import {
  updateGcodePixelScale,projectedLayerBand,getGcodePixelScale,
  enableInstancedBeadShader
} from "../../overlays/mosaic/src/gui/viewer/ad4-gpu-seams.mjs";

test("near zoom shows every physical layer; far zoom groups projected subpixel seams",()=>{
  const camera={isPerspectiveCamera:true,fov:75,
    position:{distanceTo:target=>target.distance}};
  const target={distance:5};
  updateGcodePixelScale(camera,844,target);
  const closePx=getGcodePixelScale()*0.2;
  assert.ok(closePx>3);
  assert.equal(projectedLayerBand(closePx),1);

  target.distance=200;
  updateGcodePixelScale(camera,844,target);
  assert.equal(projectedLayerBand(getGcodePixelScale()*0.2),8);

  target.distance=1000;
  updateGcodePixelScale(camera,844,target);
  assert.equal(projectedLayerBand(getGcodePixelScale()*0.2),16);
});

test("height from G-code changes projected seam grouping at a fixed camera zoom",()=>{
  const ppmm=3.0;
  assert.equal(projectedLayerBand(ppmm*0.1),16);
  assert.equal(projectedLayerBand(ppmm*0.4),4);
  assert.equal(projectedLayerBand(ppmm*0.8),2);
});

test("GPU bead material patches vertex and fragment shader, without shadow maps",()=>{
  const material={};
  enableInstancedBeadShader(material);
  assert.equal(typeof material.customProgramCacheKey,"function");
  const shader={
    uniforms:{},
    vertexShader:"#include <common>\n#include <begin_vertex>",
    fragmentShader:"#include <common>\n#include <color_fragment>"
  };
  material.onBeforeCompile(shader);
  for(const attribute of ["iStart","iEnd","iDimensions","iLayer","ad4Shade"]){
    assert.ok(shader.vertexShader.includes("attribute "+(attribute==="iLayer"||attribute==="ad4Shade"?"float":attribute==="iDimensions"?"vec3":"vec2")+" "+attribute));
  }
  assert.match(shader.vertexShader,/transformed=vec3/);
  assert.match(shader.fragmentShader,/ad4Seam/);
  assert.match(shader.fragmentShader,/diffuseColor\.rgb\*=/);
  assert.equal(shader.uniforms.uAd4PixelPerMM.value,getGcodePixelScale());
});
