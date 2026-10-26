/* Named Cura presets for MosaicSlicer. Only supported AD4 material/process keys. */
export const KEY="ffadv4-mosaic-custom-presets-v1";
export const GROUPS={
 Quality:["layer_height","layer_height_0","line_width"],
 Strength:["wall_line_count","top_layers","bottom_layers","infill_sparse_density"],
 Speed:["speed_print","speed_wall","speed_infill","speed_travel","acceleration_print","acceleration_travel"],
 Support:["support_enable","support_angle","support_infill_rate"],
 Material:["material_print_temperature","material_print_temperature_layer_0",
 "material_bed_temperature","material_bed_temperature_layer_0","material_flow"]
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
const processKeys=new Set(Object.entries(GROUPS).filter(([name])=>name!=="Material").flatMap(([,keys])=>keys));
const materialKeys=new Set(GROUPS.Material);
export function allowed(type){return type==="material"?materialKeys:type==="process"?processKeys:new Set()}
export function validate(key,value){
 if(typeof value==="boolean")return value;
 if(typeof value!=="number"||!Number.isFinite(value))throw Error("Invalid value: "+key);
 const range=LIMITS[key];if(range&&(value<range[0]||value>range[1]))throw Error("Unsafe value: "+key);
 return value;
}
function cleanItems(items,type){
 if(!Array.isArray(items))return [];
 const keys=allowed(type);
 return items.filter(x=>x&&typeof x.name==="string"&&/^[A-Za-z0-9][\w .-]{0,48}$/.test(x.name)&&x.values&&typeof x.values==="object")
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
 if(!["process","material"].includes(type)||!/^[A-Za-z0-9][\w .-]{0,48}$/.test(name))throw Error("Invalid preset name");
 const out=normalize(library),list=out[type];
 const index=list.findIndex(item=>item.name.toLowerCase()===name.toLowerCase());
 if(index>=0&&!replace)throw Error("Preset already exists");
 if(index<0&&list.length>=40)throw Error("Preset limit reached");
 const safe={};for(const [key,value]of Object.entries(values))if(allowed(type).has(key))safe[key]=validate(key,value);
 const item={name,values:safe};
 if(index>=0)list[index]=item;else list.push(item);
 return out;
}
