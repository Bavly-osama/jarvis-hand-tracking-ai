import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

for (const name of ['earth_day.jpg', 'earth_night.jpg', 'earth_clouds.jpg']) {
  test(`Earth layer ${name} is bundled as a real JPEG`, () => {
    let bytes;
    try { bytes = readFileSync(new URL(`../public/textures/${name}`, import.meta.url)); } catch {}
    assert.ok(bytes && bytes.length > 10000, 'Missing Earth texture; never show an untextured white shell');
    assert.equal(bytes.readUInt16BE(0), 0xffd8);
  });
}
