import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";

// Exercise the exact functions shipped in the Pages IIFE, not test duplicates.
const source=readFileSync(new URL("../../overlays/mosaic/public/ad4-v3.js",import.meta.url),"utf8");
const start=source.indexOf("function formatPrintClock(seconds){");
const stop=source.indexOf("function parseFilamentGrams(raw){",start);
assert.ok(start>=0&&stop>start);
const helpers=source.slice(start,stop);
const format=source.match(/function formatDuration\(seconds\)\{[^\n]*\}/)?.[0];
assert.ok(format);
const api=runInNewContext(helpers+"\n"+format+"\n({formatPrintClock,parsePrintTime,formatDuration})");

test("significant units in day hours:minutes clocks",()=>{
  const cases=[
    ["00 01:45","1h45m"],
    ["02 00:44","2d 44m"],
    ["01 01:45","1d 1h45m"],
    ["00 00:44","44m"],
    ["00 01:00","1h"],
    ["01 00:00","1d"],
    ["02 00:00","2d"],
    ["00 00:00","0m"],
    ["00 00:01","1m"],
    ["00 23:59","23h59m"],
    ["01 00:01","1d 1m"]
  ];
  for(const [raw,expected] of cases){
    const seconds=api.parsePrintTime(raw);
    assert.ok(Number.isFinite(seconds),raw);
    assert.equal(api.formatPrintClock(seconds),expected,raw);
    assert.equal(api.formatDuration(seconds),expected,raw);
  }
});

test("parse compact values after formatting, including contiguous units",()=>{
  for(const value of ["1h45m","2d 44m","2d 1h45m","44m","2d","0m"]){
    assert.equal(api.formatPrintClock(api.parsePrintTime(value)),value);
  }
});

test("do not understate fractional seconds, reject invalid inputs",()=>{
  assert.equal(api.formatPrintClock(3600.1),"1h1m");
  assert.equal(api.formatPrintClock(59.1),"1m");
  assert.equal(api.formatPrintClock(-1),"—");
  assert.equal(api.formatPrintClock(Number.NaN),"—");
  assert.equal(api.formatPrintClock(0),"0m");
  assert.ok(Number.isNaN(api.parsePrintTime("Not reported by CuraEngine")));
  assert.ok(Number.isNaN(api.parsePrintTime("nonsense")));
});
