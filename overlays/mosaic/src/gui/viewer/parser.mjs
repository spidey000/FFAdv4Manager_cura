/* AD4 toolpath parser: bounded intermediary allocations and cooperative yielding.
 * Input is generated G-code, not executable JS. Never evaluates commands.
 * The authoritative full G-code string is preserved for export/printing.
 */
const PARAM = /(?:^|\s)([XYZEF])\s*(-?(?:\d+(?:\.\d*)?|\.\d+))/gi;
const YIELD_EVERY = 6000;

export async function parse(gcode) {
  if (typeof gcode !== "string") throw new TypeError("G-code text required");
  const layers = [];
  let layer = [];
  let x = 0, y = 0, z = 0, e = 0, subtype = "OTHER";
  let absoluteXYZ = true, absoluteE = true;
  let cursor = 0, lineNumber = 0, moves = 0;
  // Bound preview allocations while preserving the full print G-code.
  // This is a visual LOD only, never a modification of a printable file.
  const stride = Math.max(1, Math.ceil(gcode.length / (14 * 1024 * 1024)));
  globalThis.AD4GcodeParserInfo = {simplified: stride > 1, samplingStride: stride};
  // Parse directly against the source, avoiding gcode.split("\n") which
  // transiently creates an array of hundreds of thousands of strings.
  while (cursor < gcode.length) {
    const end = gcode.indexOf("\n", cursor);
    const next = end < 0 ? gcode.length : end;
    const line = gcode.slice(cursor, next);
    cursor = next + 1;
    const semicolon = line.indexOf(";");
    const command = (semicolon < 0 ? line : line.slice(0, semicolon)).trim();
    const comment = semicolon < 0 ? "" : line.slice(semicolon + 1).trim();
    if (/^(?:LAYER\s*:\s*\d+|LAYER_CHANGE)\b/i.test(comment)) {
      if (layer.length) { layers.push(layer); layer = []; }
    } else if (/^TYPE\s*:/i.test(comment)) {
      subtype = comment.slice(comment.indexOf(":") + 1).trim().toUpperCase() || "OTHER";
    }

    const op = command.split(/\s/, 1)[0].toUpperCase();
    if (op === "G90") absoluteXYZ = true;
    else if (op === "G91") absoluteXYZ = false;
    else if (op === "M82") absoluteE = true;
    else if (op === "M83") absoluteE = false;
    else if (op === "G92" || op === "G0" || op === "G00" || op === "G1" || op === "G01") {
      const lastE = e;
      let hasExtrusion = false, moved = false;
      PARAM.lastIndex = op.length;
      let match;
      while ((match = PARAM.exec(command)) !== null) {
        const value = Number(match[2]);
        if (!Number.isFinite(value)) continue;
        switch (match[1].toUpperCase()) {
          case "X": x = op === "G92" ? value : absoluteXYZ ? value : x + value; moved = true; break;
          case "Y": y = op === "G92" ? value : absoluteXYZ ? value : y + value; moved = true; break;
          case "Z": z = op === "G92" ? value : absoluteXYZ ? value : z + value; moved = true; break;
          case "E": e = op === "G92" ? value : absoluteE ? value : e + value; hasExtrusion = true; break;
        }
      }
      if (op !== "G92" && moved && (++moves % stride === 0 || layer.length === 0)) {
        layer.push({
          type: hasExtrusion && e > lastE + 1e-7 ? "print" : "travel",
          subtype, vector: {x, y, z, w: e}
        });
      }
    }
    if (++lineNumber % YIELD_EVERY === 0) {
      // A complex G-code must not freeze orbit controls or the UI for seconds.
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  if (layer.length) layers.push(layer);
  return layers;
}
