/* AD4 Studio native Cura catalog + named presets.
 * Quick filters use original Cura category IDs, never a whitelist of 20 settings.
 * Only the connected Adventurer 4 definition may authorize editable preset keys.
 */
export const KEY="ffadv4-mosaic-custom-presets-v1";
export const GROUPS={
  Quality:["resolution","quality","shell"],
  Strength:["shell","infill"],
  Speed:["speed","travel","cooling"],
  Support:["support","platform_adhesion","adhesion"],
  Material:["material"]
};
export const LEVELS=["All","Basic","Advanced","Expert"];
export const TIERS={
  layer_height:0,wall_line_count:0,infill_sparse_density:0,speed_print:0,support_enable:0,
  material_print_temperature:0,material_bed_temperature:0,layer_height_0:1,
  top_layers:1,bottom_layers:1,speed_wall:1,speed_infill:1,speed_travel:1,
  support_angle:1,material_print_temperature_layer_0:1,material_bed_temperature_layer_0:1,
  line_width:2,acceleration_print:2,acceleration_travel:2,support_infill_rate:2,material_flow:2
};
export const LIMITS={
  material_print_temperature:[180,220],material_print_temperature_layer_0:[180,220],
  material_bed_temperature:[0,65],material_bed_temperature_layer_0:[0,65],
  speed_print:[1,65],speed_travel:[1,100],acceleration_print:[1,1200],acceleration_travel:[1,1200]
};
const legacyMaterial=new Set(["material_print_temperature","material_print_temperature_layer_0",
  "material_bed_temperature","material_bed_temperature_layer_0","material_flow"]);
const legacyProcess=new Set(["layer_height","layer_height_0","line_width","wall_line_count","top_layers",
  "bottom_layers","infill_sparse_density","speed_print","speed_wall","speed_infill","speed_travel",
  "acceleration_print","acceleration_travel","support_enable","support_angle","support_infill_rate"]);
let processKeys=new Set(legacyProcess),materialKeys=new Set(legacyMaterial);
let descriptions=new Map();
let catalogReady=false;

// Categories come from Mosaic's resolved Cura printer definition, including
// nested settings and machine-specific overrides, not handwritten UI IDs.
export function configureCatalog(printerDefinition, resolvedSettings={}){
  const nextProcess=new Set(),nextMaterial=new Set(),nextDescriptions=new Map();
  function visit(items,category=""){
    for(const [id,setting] of Object.entries(items||{})){
      if(!setting||typeof setting!=="object")continue;
      const nextCategory=setting.type==="category"?id:category;
      if(setting.type!=="category"&&setting.type&& !id.startsWith("machine_")){
        const group=category.toLowerCase();
        const isMaterial=group==="material"||group==="cooling"||
          id.startsWith("material_")||id.startsWith("cool_");
        (isMaterial?nextMaterial:nextProcess).add(id);
        nextDescriptions.set(id,setting);
      }
      visit(setting.children,nextCategory);
    }
  }
  visit(printerDefinition?.settings);
  // Include all real per-extruder/resolved Cura settings; some inherited
  // definitions may live outside the top-level category tree.
  for(const [id,setting] of Object.entries(resolvedSettings)){
    if(!setting?.type||setting.type==="category"||id.startsWith("machine_"))continue;
    if(!nextDescriptions.has(id)){
      nextDescriptions.set(id,setting);
      (id.startsWith("material_")||id.startsWith("cool_")?nextMaterial:nextProcess).add(id);
    }
  }
  if(nextProcess.size+nextMaterial.size<20)throw Error("Native Cura setting catalog incomplete");
  processKeys=nextProcess;materialKeys=nextMaterial;descriptions=nextDescriptions;
  catalogReady=true;
  return {process:processKeys.size,material:materialKeys.size};
}
export function isCatalogReady(){return catalogReady}
export function allowed(type){return type==="material"?materialKeys:type==="process"?processKeys:new Set()}
export function validate(key,value){
  if(catalogReady&&!descriptions.has(key))throw Error("Unknown Cura setting: "+key);
  const descriptor=descriptions.get(key);
  const type=descriptor?.type;
  if(type==="bool"){
    if(typeof value!=="boolean")throw Error("Invalid boolean: "+key);
    return value;
  }
  if(type==="enum"){
    if(typeof value!=="string"||!Object.prototype.hasOwnProperty.call(descriptor.options||{},value))
      throw Error("Invalid option: "+key);
    return value;
  }
  if(type==="str"){
    if(typeof value!=="string"||value.length>1024)throw Error("Invalid string: "+key);
    return value;
  }
  if(type?.startsWith("[")&&type.endsWith("]")){
    if(!Array.isArray(value)||value.length>128||JSON.stringify(value).length>4096)
      throw Error("Invalid array: "+key);
    return value;
  }
  if(typeof value==="boolean" && !catalogReady)return value; // older saved library
  if(typeof value!=="number"||!Number.isFinite(value))throw Error("Invalid value: "+key);
  if(type==="int"&&!Number.isInteger(value))throw Error("Expected integer: "+key);
  const range=LIMITS[key];
  if(range&&(value<range[0]||value>range[1]))throw Error("Unsafe value: "+key);
  // Literal limits can be enforced; Cura also supports expression-based limits
  // and those remain the job of CuraEngine plus the server safety gate.
  for(const name of ["minimum_value","maximum_value"]){
    const limit=descriptor?.[name];
    if(typeof limit!=="number")continue;
    if(name==="minimum_value"&&value<limit||name==="maximum_value"&&value>limit)
      throw Error("Out-of-range Cura value: "+key);
  }
  return value;
}
function cleanItems(items,type){
  if(!Array.isArray(items))return [];
  const keys=allowed(type);
  return items.filter(x=>x&&typeof x.name==="string"&&/^[A-Za-z0-9][\w .-]{0,48}$/.test(x.name)&&
     x.values&&typeof x.values==="object"&&!Array.isArray(x.values))
    .slice(0,40).map(x=>({name:x.name,values:Object.fromEntries(Object.entries(x.values).filter(([key,val])=>{
      if(!keys.has(key))return false;
      try{validate(key,val);return true}catch{return false}
    }))}));
}
export function normalize(obj){return {process:cleanItems(obj?.process,"process"),material:cleanItems(obj?.material,"material")}}
export function readLibrary(store){
  try{return normalize(JSON.parse(store?.getItem(KEY)||"{}"))}catch{return normalize({})}
}
export function savePreset(library,type,name,values,replace=false){
  if(!["process","material"].includes(type)||!/^[A-Za-z0-9][\w .-]{0,48}$/.test(name))
    throw Error("Invalid preset name");
  const out=normalize(library),list=out[type];
  const index=list.findIndex(item=>item.name.toLowerCase()===name.toLowerCase());
  if(index>=0&&!replace)throw Error("Preset already exists");
  if(index<0&&list.length>=40)throw Error("Preset limit reached");
  const safe={};
  for(const [key,value] of Object.entries(values))
    if(allowed(type).has(key))safe[key]=validate(key,value);
  const item={name,values:safe};
  if(index>=0)list[index]=item;else list.push(item);
  return out;
}
