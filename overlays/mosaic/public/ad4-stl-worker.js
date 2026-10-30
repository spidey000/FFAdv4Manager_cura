/* AD4 Studio: decode binary STL faces off the main/UI thread.
 * Strictly geometry only. No printer access, networking or code execution.
 */
self.onmessage = event => {
  const {id, buffer} = event.data || {};
  try {
    if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 84)
      throw Error("Invalid binary STL");
    const view = new DataView(buffer);
    const count = view.getUint32(80, true);
    if (!count || 84 + count * 50 !== buffer.byteLength || count > 1000000)
      throw Error("Invalid or oversized binary STL triangle count");
    const positions = new Float32Array(count * 9);
    const normals = new Float32Array(count * 9);
    for (let face = 0; face < count; face++) {
      const begin = 84 + face * 50, dest = face * 9;
      const nx = view.getFloat32(begin, true);
      const ny = view.getFloat32(begin + 4, true);
      const nz = view.getFloat32(begin + 8, true);
      for (let v = 0; v < 3; v++) {
        const base = begin + 12 + v * 12;
        const index = dest + v * 3;
        positions[index] = view.getFloat32(base, true);
        positions[index + 1] = view.getFloat32(base + 4, true);
        positions[index + 2] = view.getFloat32(base + 8, true);
        normals[index] = nx;
        normals[index + 1] = ny;
        normals[index + 2] = nz;
      }
    }
    self.postMessage({id, positions: positions.buffer, normals: normals.buffer},
      [positions.buffer, normals.buffer]);
  } catch (error) {
    self.postMessage({id, error: error?.message || String(error)});
  }
};
