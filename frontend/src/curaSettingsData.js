// Only real CuraEngine keys; the Adventurer 4 machine itself is fixed.
export const CATEGORIES=['Quality','Strength','Speed','Support','Material'];
export const LEVELS=['All','Basic','Advanced','Expert'];
export const FIELDS=[
 ['layer_height','Layer height','Quality',0,0.08,0.36,0.02,0.2,'mm','Thickness of printed layers. Lower values improve fine details.'],
 ['layer_height_0','First layer height','Quality',1,0.08,0.36,0.02,0.2,'mm','Thickness of the first layer, influencing adhesion.'],
 ['line_width','Line width','Quality',2,0.32,0.56,0.01,0.4,'mm','Extrusion width for the 0.4 mm nozzle.'],
 ['wall_line_count','Walls','Strength',0,1,10,1,3,'','Number of solid perimeter lines around the model.'],
 ['top_layers','Top layers','Strength',1,1,15,1,4,'','Number of solid layers on top of the model.'],
 ['bottom_layers','Bottom layers','Strength',1,1,15,1,4,'','Number of solid layers underneath the model.'],
 ['infill_sparse_density','Infill density','Strength',0,0,100,5,15,'%','Percentage of the interior filled with infill.'],
 ['speed_print','Print speed','Speed',0,10,90,5,40,'mm/s','Target speed for print moves. Conservative speeds improve AD4 quality.'],
 ['speed_wall','Wall speed','Speed',1,10,90,5,35,'mm/s','Speed for perimeter walls.'],
 ['speed_infill','Infill speed','Speed',1,10,90,5,45,'mm/s','Speed of sparse interior infill.'],
 ['speed_travel','Travel speed','Speed',1,10,100,5,80,'mm/s','Speed for non-extruding moves.'],
 ['acceleration_print','Acceleration','Speed',2,100,2000,50,650,'mm/s²','Acceleration of printing moves. Excessive values can cause ringing.'],
 ['support_enable','Generate support','Support',0,0,1,1,0,'bool','Generate temporary material under model overhangs.'],
 ['support_angle','Overhang angle','Support',1,0,90,5,50,'°','Minimum overhang angle requiring support.'],
 ['support_infill_rate','Support density','Support',2,1,70,5,15,'%','Infill percentage of support structures.'],
 ['material_print_temperature','Nozzle temperature','Material',0,180,220,5,205,'°C','Artillery PLA Basic nominal nozzle temperature.'],
 ['material_print_temperature_layer_0','First layer nozzle','Material',1,180,220,5,210,'°C','First-layer Artillery PLA Basic nozzle temperature.'],
 ['material_bed_temperature','Bed temperature','Material',0,0,65,5,55,'°C','Heated build plate target for PLA.'],
 ['material_bed_temperature_layer_0','First layer bed','Material',1,0,65,5,55,'°C','First-layer build plate target.'],
 ['material_flow','Material flow','Material',2,80,120,1,100,'%','Extruded flow percentage; calibrate before changing.']
].map(([key,label,category,level,min,max,step,fallback,unit,help])=>({key,label,category,level,min,max,step,fallback,unit,help,type:unit==='bool'?'boolean':'number'}));
export const CUSTOM_PROFILE_KEY='ffadv4-cura-browser-profiles-v1';
export function validateField(field,input){
 if(field.type==='boolean')return Boolean(input);
 if(input==='' || input===null || !Number.isFinite(Number(input)))throw Error('Invalid numeric value');
 const n=Number(input);
 if(n<field.min || n>field.max)throw Error(field.label+' must be '+field.min+'–'+field.max);
 return n;
}
export function readLibrary(storage){
 try{
  const raw=JSON.parse(storage?.getItem(CUSTOM_PROFILE_KEY)||'{}');
  return {process:Array.isArray(raw.process)?raw.process:[], material:Array.isArray(raw.material)?raw.material:[]};
 }catch{return {process:[],material:[]}}
}
export function saveProfile(lib,type,name,current,overwrite=false){
 if(!['process','material'].includes(type))throw Error('Unsupported profile type');
 if(!/^[A-Za-z0-9][\w .-]{0,48}$/.test(name))throw Error('Profile name must be 1–49 safe characters');
 const rows=(lib[type]||[]).slice(),at=rows.findIndex(x=>x.name.toLowerCase()===name.toLowerCase());
 if(at>=0&&!overwrite)throw Error('Profile already exists');
 if(at<0&&rows.length>=40)throw Error('Profile limit reached');
 const settings={};
 for(const field of FIELDS)if((type==='material')===(field.category==='Material') && field.key in current){
  settings[field.key]=validateField(field,current[field.key]);
 }
 const entry={name,settings};if(at>=0)rows[at]=entry;else rows.push(entry);
 return {...lib,[type]:rows};
}
