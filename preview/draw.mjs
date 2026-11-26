import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openSync } from 'fontkit';

const fontUrl = new URL('../test/data/Play/Play-Regular.ttf', import.meta.url);
const outUrl = new URL('./out.svg', import.meta.url);
const liningOutUrl = new URL('./out-lining.svg', import.meta.url);

const PAD = 80;

// The contents line has exactly two figures: the issue number (4) and the
// page number (6). Both advance 580 units, so the line is 1160 units wide.
const ADVANCE = 580;
const EXPECTED = {
  oldstyle: {
    four: { minX: 52, minY: -145, maxX: 528, maxY: 484 },
    six: { minX: 71, minY: -10, maxX: 509, maxY: 660 },
    fourPathStart: 'M528 0',
  },
  lining: {
    four: { minX: 52, minY: 0, maxX: 528, maxY: 649 },
    six: { minX: 71, minY: -10, maxX: 509, maxY: 660 },
    fourPathStart: 'M528 142',
  },
};

/**
 * Shapes the contents line with the real oldstyle figures (`onum`) or with
 * the default lining figures (`lnum`). The oldstyle 4 is a separate outline
 * from the font, not the lining 4 shifted down by 145 units: shifting would
 * put its top at 504 instead of 484.
 */
export function layoutContents(font, { oldstyle = true } = {}) {
  const features = oldstyle ? ['onum'] : ['lnum'];
  const run = font.layout('46', features);

  let pen = 0;
  const glyphs = run.glyphs.map((glyph, index) => {
    const position = run.positions[index];
    const entry = {
      char: index === 0 ? '4' : '6',
      name: glyph.name,
      id: glyph.id,
      x: pen,
      advanceWidth: position.xAdvance,
      bbox: { ...glyph.path.bbox },
      d: glyph.path.toSVG(),
      commands: glyph.path.commands,
    };

    pen += position.xAdvance;
    return entry;
  });

  return { glyphs, advanceWidth: pen };
}

function assertBBox(label, actual, expected) {
  for (const key of ['minX', 'minY', 'maxX', 'maxY']) {
    assert.equal(
      actual[key],
      expected[key],
      `${label}.${key}: expected ${expected[key]}, measured ${actual[key]}`,
    );
  }
}

export function verify(oldstyle, lining) {
  const [oldFour, oldSix] = oldstyle.glyphs;
  const [linFour, linSix] = lining.glyphs;

  // The figures sit where they are meant to sit on the grid.
  assertBBox('oldstyle 4', oldFour.bbox, EXPECTED.oldstyle.four);
  assertBBox('oldstyle 6', oldSix.bbox, EXPECTED.oldstyle.six);
  assertBBox('lining 4', linFour.bbox, EXPECTED.lining.four);
  assertBBox('lining 6', linSix.bbox, EXPECTED.lining.six);

  // The oldstyle 4 falls below the baseline; the lining 4 does not.
  assert.equal(oldFour.bbox.minY, -145);
  assert.equal(oldFour.bbox.minY < 0, true);
  assert.equal(oldFour.bbox.maxY, 484);
  assert.notEqual(oldFour.bbox.maxY, 504);
  assert.notEqual(oldFour.bbox.maxY, linFour.bbox.maxY);

  // Six is the control: same box and same outline in both sets.
  assert.deepEqual(
    oldSix.commands,
    linSix.commands,
    'oldstyle 6 must stay on the lining 6 path',
  );
  assert.equal(oldSix.d, linSix.d);

  // Four must be the oldstyle outline, not the lining one shifted down.
  assert.notDeepEqual(oldFour.commands, linFour.commands);
  assert.equal(oldFour.d.startsWith(EXPECTED.oldstyle.fourPathStart), true);
  assert.equal(oldSix.d.startsWith('M509 251'), true);

  // Dropping the lining 4 far enough to reach the oldstyle floor (-145)
  // would put its top at 504, not 484. The oldstyle 4 is a different
  // outline, so its top lands at 484.
  const drop = oldFour.bbox.minY - linFour.bbox.minY;
  assert.equal(linFour.bbox.maxY + drop, 504);
  assert.notEqual(oldFour.bbox.maxY, 504);

  // Advances are unchanged by switching figure style.
  for (const entry of [oldFour, oldSix, linFour, linSix]) {
    assert.equal(entry.advanceWidth, ADVANCE, `${entry.name} advance`);
  }

  assert.equal(oldstyle.advanceWidth, 1160);
  assert.equal(lining.advanceWidth, 1160);
  assert.equal(oldFour.advanceWidth + oldSix.advanceWidth, 1160);

  // Six follows Four by exactly one advance; nothing is nudged sideways.
  assert.equal(oldSix.x, ADVANCE);
  assert.equal(linSix.x, ADVANCE);
}

function escapeXml(value) {
  return String(value).replace(/[<>&"]/g, (c) => {
    return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c];
  });
}

function buildSvg(contents, { title, control = false } = {}) {
  const [four, six] = contents.glyphs;
  const minX = 0;
  const maxX = contents.advanceWidth;
  const minY = Math.min(0, four.bbox.minY, six.bbox.minY);
  const maxY = Math.max(0, four.bbox.maxY, six.bbox.maxY);

  const left = minX - PAD;
  const top = maxY + PAD;
  const width = maxX - minX + 2 * PAD;
  const height = maxY - minY + 2 * PAD;

  const sx = (x) => x - left;
  const sy = (y) => top - y;
  const boxHeight = (box) => box.maxY - box.minY;

  const glyphPath = (glyph) =>
    `<path d="${glyph.d}" transform="translate(${sx(glyph.x)} ${top}) scale(1 -1)" />`;

  const box = (glyph, color) =>
    `<rect class="box" x="${sx(glyph.bbox.minX)}" y="${sy(
      glyph.bbox.maxY,
    )}" width="${glyph.bbox.maxX - glyph.bbox.minX}" height="${boxHeight(
      glyph.bbox,
    )}" stroke="${color}" />`;

  const gridY = sy(0);
  const cellLines = [0, four.x + four.advanceWidth, contents.advanceWidth]
    .map(
      (x) =>
        `<line class="advance" x1="${sx(x)}" y1="${sy(maxY) - 10}" x2="${sx(
          x,
        )}" y2="${sy(minY) + 10}" />`,
    )
    .join('');

  const labels = [
    `<text x="${sx(0)}" y="${sy(maxY) - 24}">${escapeXml(title)}</text>`,
    `<text class="small" x="${sx(0)}" y="${gridY + 26}">grid 0</text>`,
    `<text class="small" x="${sx(four.x)}" y="${sy(minY) + 24}">4 · ${
      four.name
    } · ${four.advanceWidth}</text>`,
    `<text class="small" x="${sx(six.x)}" y="${sy(minY) + 24}">6 · ${
      six.name
    } · ${six.advanceWidth}</text>`,
    `<text class="small" x="${sx(four.bbox.minX) - 12}" y="${
      sy(four.bbox.maxY) + 8
    }" text-anchor="end">${four.bbox.maxY}</text>`,
    `<text class="small" x="${sx(four.bbox.minX) - 12}" y="${
      sy(four.bbox.minY) + 4
    }" text-anchor="end">${four.bbox.minY}</text>`,
    `<text class="small" x="${sx(six.bbox.maxX) + 12}" y="${
      sy(six.bbox.maxY) + 16
    }">${six.bbox.maxY}</text>`,
    `<text class="small" x="${sx(six.bbox.maxX) + 12}" y="${
      sy(six.bbox.minY) - 4
    }">${six.bbox.minY}</text>`,
  ].join('');

  const accent = control ? '#8fb3c7' : '#e0a458';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <style>
    .glyph { fill: #f4f1ea; }
    .box { fill: none; stroke-width: 3; }
    .advance { stroke: #555; stroke-dasharray: 6 10; stroke-width: 2; }
    .baseline { stroke: #9a948a; stroke-width: 2; }
    text { fill: #cfc9be; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 26px; }
    .small { font-size: 22px; fill: #9a948a; }
  </style>
  <rect width="100%" height="100%" fill="#111" />
  ${cellLines}
  <line class="baseline" x1="${sx(0)}" y1="${gridY}" x2="${sx(
    contents.advanceWidth,
  )}" y2="${gridY}" />
  <g class="glyph">${contents.glyphs.map(glyphPath).join('')}</g>
  ${box(four, accent)}
  ${box(six, '#6ab0c8')}
  ${labels}
</svg>
`;
}

export function summary(contents) {
  return {
    advanceWidth: contents.advanceWidth,
    glyphs: contents.glyphs.map((glyph) => ({
      char: glyph.char,
      name: glyph.name,
      id: glyph.id,
      x: glyph.x,
      advanceWidth: glyph.advanceWidth,
      bbox: glyph.bbox,
      pathStart: glyph.d.slice(0, 12),
    })),
  };
}

function main() {
  const font = openSync(fontUrl);
  const oldstyle = layoutContents(font, { oldstyle: true });
  const lining = layoutContents(font, { oldstyle: false });

  verify(oldstyle, lining);

  // The delivered preview: oldstyle figures. This is the version to hand off.
  fs.writeFileSync(
    outUrl,
    buildSvg(oldstyle, { title: 'oldstyle figures · issue 4 + page 6' }),
  );
  console.log('wrote preview/out.svg');
  console.log(JSON.stringify(summary(oldstyle), null, 2));

  // Measurement control only: lining figures, not part of the handoff.
  fs.writeFileSync(
    liningOutUrl,
    buildSvg(lining, {
      title: 'lining control · 4 top 649',
      control: true,
    }),
  );
  console.log('wrote preview/out-lining.svg (control)');
  console.log(JSON.stringify(summary(lining), null, 2));
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main();
}
