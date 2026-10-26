import test from 'node:test'
import assert from 'node:assert/strict'
import {CATEGORIES,LEVELS,FIELDS,validateField,readLibrary,saveProfile} from '../src/curaSettingsData.js'
test('the pinned AD4 UI has full width categories and safe temperatures',()=>{
 assert.deepEqual(CATEGORIES,['Quality','Strength','Speed','Support','Material'])
 assert.deepEqual(LEVELS,['All','Basic','Advanced','Expert'])
 assert.equal(FIELDS.find(x=>x.key==='material_print_temperature').max,220)
 assert.equal(FIELDS.find(x=>x.key==='material_bed_temperature').max,65)
})
test('validates Cura numeric limits and boolean settings',()=>{
 const f=FIELDS.find(x=>x.key==='material_print_temperature')
 assert.throws(()=>validateField(f,240),/must be/)
 assert.equal(validateField(f,205),205)
 assert.throws(()=>validateField(f,''),/Invalid/)
 assert.equal(validateField(FIELDS.find(x=>x.key==='support_enable'),true),true)
})
test('save and replace process/material presets separately',()=>{
 let l=readLibrary({getItem:()=>null})
 l=saveProfile(l,'process','Fine',{layer_height:0.12,speed_print:30})
 l=saveProfile(l,'material','Artillery',{material_print_temperature:205})
 assert.equal(l.process[0].settings.material_print_temperature,undefined)
 assert.equal(l.material[0].settings.speed_print,undefined)
 assert.throws(()=>saveProfile(l,'process','Fine',{}),/exists/)
 assert.equal(saveProfile(l,'process','Fine',{layer_height:0.16},true).process[0].settings.layer_height,0.16)
})
test('unavailable browser storage falls back safely',()=>{
 assert.deepEqual(readLibrary({getItem(){throw Error('blocked')}}),{process:[],material:[]})
})
