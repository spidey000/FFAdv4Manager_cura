import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync, existsSync} from "node:fs";
import {resolve} from "node:path";
import {performance} from "node:perf_hooks";
import {parse} from "../../overlays/mosaic/src/gui/viewer/parser.mjs";
import {TOOLPATH_COLORS, colorForToolpathType} from "../../overlays/mosaic/src/gui/viewer/ad4-toolpath-colors.mjs";

test("original Benchy feature names each have an explicit, distinct visible color", () => {
  const benchyTypes = [
    "PERIMETER", "OVERHANG PERIMETER", "INTERNAL INFILL", "SOLID INFILL"
  ];
  const colors = benchyTypes.map(type => {
    assert.ok(TOOLPATH_COLORS[type], "Missing color for " + type);
    const color = colorForToolpathType(type);
    assert.match(color, /^#[0-9a-f]{6}$/);
    assert.equal(colorForToolpathType(type.toLowerCase()), color);
    return color;
  });
  assert.equal(new Set(colors).size, benchyTypes.length, "Benchy categories collapsed to the same color");
  assert.notEqual(colorForToolpathType("WALL-OUTER"), colorForToolpathType("WALL-INNER"));
  assert.notEqual(colorForToolpathType("SKIN"), colorForToolpathType("SUPPORT"));
});

test("unknown slicer feature names get deterministic, non-grey colors", () => {
  const a = colorForToolpathType("A CUSTOM FEATURE");
  const b = colorForToolpathType("ANOTHER CUSTOM FEATURE");
  assert.match(a, /^#[0-9a-f]{6}$/);
  assert.notEqual(a, TOOLPATH_COLORS.OTHER);
  assert.notEqual(a, b);
  assert.equal(a, colorForToolpathType("a custom feature"));
});

// Built-in real Cura-shaped fixture from the public project, not G-code to print.
const cube = readFileSync(resolve("overlays/mosaic/public/demo-cube-20mm.gcode"), "utf8");

test("real public calibration-cube G-code retains all layer groups and types", async () => {
  const layers = await parse(cube);
  assert.ok(layers.length >= 5);
  assert.ok(layers.every(layer => layer.length > 0));
  const toolpath = layers.flat();
  assert.ok(toolpath.some(p => p.type === "print" && p.subtype === "WALL-OUTER"));
  assert.ok(toolpath.some(p => p.subtype === "FILL"));
});

test("relative coordinates, E retractions, G92 resets and travel classification", async () => {
  const lines = ";LAYER:0\nG90\nM82\nG92 E0\nG0 X0 Y0 Z0.2\n" +
    "G1 X4 Y0 E0.5\nG1 X5 Y0 E0.4\nM83\nG91\nG1 X1 Y1 E0.2\n";
  const layers = await parse(lines);
  assert.equal(layers.length, 1);
  assert.equal(layers[0].at(-1).type, "print");
  assert.equal(layers[0].at(-1).vector.x, 6);
  assert.equal(layers[0].at(-2).type, "travel");
});

test("large multi-layer toolpath yields to UI while parsing", {timeout: 120000}, async () => {
  const lines = ["G90", "M82", "G92 E0"];
  let extrusion = 0;
  for (let layer = 0; layer < 240; layer++) {
    lines.push(";LAYER:" + layer, ";TYPE:WALL-OUTER",
      "G0 X0 Y0 Z" + (0.2 * (layer+1)).toFixed(3));
    for (let i = 1; i <= 800; i++) {
      extrusion += 0.01;
      lines.push("G1 X" + (i % 210) + " Y" + ((i * 3) % 190) +
        " E" + extrusion.toFixed(4) + " F2400");
    }
  }
  let ticks = 0;
  const interval = setInterval(() => ticks++, 1);
  const begin = performance.now();
  let layers;
  try { layers = await parse(lines.join("\n")); }
  finally { clearInterval(interval); }
  const elapsed = Math.round(performance.now() - begin);
  assert.equal(layers.length, 240);
  assert.ok(layers.reduce((sum, layer) => sum + layer.length, 0) >= 190000);
  assert.ok(ticks > 0, "The parser blocked the event loop instead of yielding");
  console.log("AD4 large G-code: 192,000 extrusion moves,", elapsed + "ms,", ticks + " event-loop ticks");
});

const benchy = process.env.AD4_UPSTREAM_GCODE;
test("upstream 3DBenchy G-code from xyz-tools/gcode-preview", {skip: !benchy}, async () => {
  assert.ok(existsSync(benchy), "External benchmark G-code missing");
  const source = readFileSync(benchy, "utf8");
  const start = performance.now();
  const layers = await parse(source);
  const duration = Math.round(performance.now() - start);
  assert.ok(layers.length > 10, "Expected real 3DBenchy layers");
  assert.ok(layers.flat().some(point => point.type === "print"));
  console.log("External 3DBenchy:", (source.length / 1024 / 1024).toFixed(1),
    "MiB,", layers.length, "layers,", duration + "ms");
});
