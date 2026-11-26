import * as fontkit from 'fontkit';
import assert from 'assert';

describe('oldstyle figures', function () {
  let font = fontkit.openSync(
    new URL('data/Play/Play-Regular.ttf', import.meta.url),
  );

  // The contents line is the issue number (4) followed by the page number (6).
  function contents(features) {
    let run = font.layout('46', features);
    return run.glyphs.map((glyph, i) => ({
      glyph,
      xAdvance: run.positions[i].xAdvance,
    }));
  }

  it('should swap in a distinct oldstyle four', function () {
    let [four] = contents(['onum']);
    assert.equal(four.glyph.name, 'four.tosf');
    assert.equal(four.glyph.id, 751);
    assert.deepEqual(four.glyph.path.bbox, {
      minX: 52,
      minY: -145,
      maxX: 528,
      maxY: 484,
    });
  });

  it('should not produce the oldstyle four by shifting the lining four', function () {
    let [lining] = contents(['lnum']);
    let [oldstyle] = contents(['onum']);

    assert.equal(lining.glyph.path.bbox.maxY, 649);
    assert.equal(lining.glyph.path.bbox.minY, 0);

    // Sliding the lining four down to the oldstyle floor puts its top at 504.
    let drop = oldstyle.glyph.path.bbox.minY - lining.glyph.path.bbox.minY;
    assert.equal(lining.glyph.path.bbox.maxY + drop, 504);

    // The real oldstyle four tops out at 484, so its outline must differ.
    assert.equal(oldstyle.glyph.path.bbox.maxY, 484);
    assert.notDeepEqual(
      oldstyle.glyph.path.commands,
      lining.glyph.path.commands,
    );
  });

  it('should leave six on the lining path', function () {
    let [, lining] = contents(['lnum']);
    let [, oldstyle] = contents(['onum']);

    assert.equal(oldstyle.glyph.name, 'six.tosf');
    assert.deepEqual(oldstyle.glyph.path.bbox, {
      minX: 71,
      minY: -10,
      maxX: 509,
      maxY: 660,
    });
    assert.equal(oldstyle.glyph.path.toSVG(), lining.glyph.path.toSVG());
  });

  it('should keep both advances at 580 when using oldstyle figures', function () {
    let [four, six] = contents(['onum']);
    assert.equal(four.xAdvance, 580);
    assert.equal(six.xAdvance, 580);
    assert.equal(four.xAdvance + six.xAdvance, 1160);
  });

  it('should switch figures from the layout feature, before any preview', function () {
    let oldstyle = contents(['onum']);
    let lining = contents(['lnum']);
    assert.notEqual(oldstyle[0].glyph.id, lining[0].glyph.id);
    assert.equal(oldstyle[1].glyph.path.toSVG(), lining[1].glyph.path.toSVG());
  });
});
