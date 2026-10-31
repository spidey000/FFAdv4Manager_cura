/* AD4 Studio GPU segment shader; independent ThreeSlicer-style instancing.
 * Reuses MeshBasicMaterial's feature colors and native Three.js matrix
 * handling. No shadow maps, extra draw calls or physically fake layers.
 */
const pixelScale={value:1};
export function projectedLayerBand(pixelsPerLayer){
  return pixelsPerLayer<0.4?16:
    pixelsPerLayer<0.8?8:
    pixelsPerLayer<1.5?4:
    pixelsPerLayer<3.0?2:1;
}
export function getGcodePixelScale(){return pixelScale.value;}

export function updateGcodePixelScale(camera,viewportHeight,target){
  if(!camera?.isPerspectiveCamera||!target||viewportHeight<=0)return;
  const distance=Math.max(0.5,camera.position.distanceTo(target));
  const fov=Math.max(0.01,camera.fov*Math.PI/180);
  pixelScale.value=viewportHeight/(2*Math.tan(fov/2)*distance);
}
export function enableInstancedBeadShader(material){
  material.onBeforeCompile=shader=>{
    shader.uniforms.uAd4PixelPerMM=pixelScale;
    shader.vertexShader=shader.vertexShader
      .replace("#include <common>",[
        "#include <common>",
        "attribute vec2 iStart;",
        "attribute vec2 iEnd;",
        "attribute vec3 iDimensions;",
        "attribute float iLayer;",
        "attribute float ad4Shade;",
        "varying float vAd4Shade;",
        "varying float vAd4LocalZ;",
        "varying float vAd4Layer;",
        "varying float vAd4Height;"
      ].join("\n"))
      .replace("#include <begin_vertex>",[
        "#include <begin_vertex>",
        "vec2 ad4Delta=iEnd-iStart;",
        "vec2 ad4Normal=vec2(-ad4Delta.y,ad4Delta.x)/max(length(ad4Delta),0.00001);",
        "vec2 ad4XY=mix(iStart,iEnd,position.x)+ad4Normal*(position.y*iDimensions.z);",
        "transformed=vec3(ad4XY,mix(iDimensions.x,iDimensions.y,position.z));",
        "vAd4Shade=ad4Shade;",
        "vAd4LocalZ=position.z;",
        "vAd4Layer=iLayer;",
        "vAd4Height=iDimensions.y-iDimensions.x;"
      ].join("\n"));
    shader.fragmentShader=shader.fragmentShader
      .replace("#include <common>",[
        "#include <common>",
        "uniform float uAd4PixelPerMM;",
        "varying float vAd4Shade;",
        "varying float vAd4LocalZ;",
        "varying float vAd4Layer;",
        "varying float vAd4Height;"
      ].join("\n"))
      .replace("#include <color_fragment>",[
        "#include <color_fragment>",
        "// Near: each physical bevel. Far: emphasize only every Nth layer.",
        "// N grows when one physical layer would cover less than a pixel.",
        "float ad4Pixels=max(0.001,uAd4PixelPerMM*vAd4Height);",
        "float ad4Step=ad4Pixels<0.4?16.0:",
        "              ad4Pixels<0.8?8.0:",
        "              ad4Pixels<1.5?4.0:",
        "              ad4Pixels<3.0?2.0:1.0;",
        "float ad4Mark=1.0-step(0.5,mod(floor(vAd4Layer+0.1),ad4Step));",
        "float ad4NearEdge=min(vAd4LocalZ,1.0-vAd4LocalZ);",
        "float ad4Width=min(0.48,max(0.12,0.8/max(ad4Pixels,0.01)));",
        "float ad4Seam=(1.0-smoothstep(0.0,ad4Width,ad4NearEdge))*ad4Mark;",
        "float ad4Strength=ad4Step>1.0?0.36:0.18;",
        "diffuseColor.rgb*=vAd4Shade*(1.0-ad4Strength*ad4Seam);"
      ].join("\n"));
  };
  material.customProgramCacheKey=()=>"ad4-instanced-seam-v1";
}
