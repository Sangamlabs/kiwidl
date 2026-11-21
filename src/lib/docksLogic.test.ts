import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BACK_WAVES,
  COPY,
  FRONT_WAVES,
  back,
  buildWavePath,
  detectPlatform,
  getChestCropMetrics,
  getShipDimensions,
  getShipTarget,
  mapHttpErrorToMessage,
  mix,
  out,
  seg,
  yAt,
} from './docksLogic';

test('detectPlatform matches YouTube, Instagram, and Pinterest links accurately', () => {
  assert.equal(detectPlatform('https://www.youtube.com/watch?v=abc123'), 'youtube');
  assert.equal(detectPlatform('https://youtu.be/abc123?t=12'), 'youtube');
  assert.equal(detectPlatform('youtube.com/shorts/xyz'), 'youtube');
  assert.equal(detectPlatform('https://www.instagram.com/p/C8test/'), 'instagram');
  assert.equal(detectPlatform('https://instagram.com/reel/abc'), 'instagram');
  assert.equal(detectPlatform('https://www.pinterest.com/pin/123456/'), 'pinterest');
  assert.equal(detectPlatform('https://pinterest.co.uk/pin/123456/'), 'pinterest');
  assert.equal(detectPlatform('https://pin.it/3xYzAbC'), 'pinterest');

  assert.equal(detectPlatform(''), null);
  assert.equal(detectPlatform('   '), null);
  assert.equal(detectPlatform('https://example.com/video'), null);
  assert.equal(detectPlatform('https://notyoutube.com/watch?v=1'), null);
  assert.equal(detectPlatform('not a url at all :::'), null);
});

test('easing helpers match Saltwake hero formulas', () => {
  assert.equal(seg(0.5, 0, 1), 0.5);
  assert.equal(seg(-1, 0, 1), 0);
  assert.equal(seg(2, 0, 1), 1);

  assert.equal(out(0), 0);
  assert.equal(out(1), 1);
  assert.equal(out(0.5), 0.875);

  assert.equal(back(0), 0);
  assert.equal(back(1), 1);
  assert.ok(back(0.75) > 1, 'back easing overshoots slightly before settling at 1');

  assert.equal(mix(1, 2.4, 0), 1);
  assert.equal(mix(1, 2.4, 1), 2.4);
  assert.ok(Math.abs(mix(1, 2.4, 0.5) - 1.7) < 1e-9);
});

test('getShipTarget implements exact asymptotic phase targets', () => {
  assert.equal(getShipTarget('idle', 5, 0.4), 0);
  assert.equal(getShipTarget('ready', 5, 0.1), 0.28);
  assert.equal(getShipTarget('done', 1, 0.7), 1);
  assert.equal(getShipTarget('error', 3, 0.42), 0.42);

  const f0 = getShipTarget('fetching', 0, 0);
  const f1 = getShipTarget('fetching', 1.4, 0);
  const f10 = getShipTarget('fetching', 10, 0);
  assert.equal(f0, 0);
  assert.ok(f1 > 0.15 && f1 < 0.28);
  assert.ok(f10 < 0.28 && f10 > 0.27);

  const w0 = getShipTarget('working', 0, 0.28);
  const w7 = getShipTarget('working', 7, 0.28);
  const w100 = getShipTarget('working', 100, 0.28);
  assert.equal(w0, 0.28);
  assert.ok(w7 > 0.65 && w7 < 0.9);
  assert.ok(w100 <= 0.9 && w100 > 0.899);
});

test('wave geometry builds filled closed paths and broken span paths', () => {
  const filledPath = buildWavePath(BACK_WAVES[0], 1000, 190, 0);
  assert.ok(filledPath.startsWith('M-10.0 '));
  assert.ok(filledPath.endsWith('Z'));

  const spanLayer = FRONT_WAVES[1];
  const spanPath = buildWavePath(spanLayer, 1000, 190, 1.2);
  assert.ok(spanPath.startsWith('M60.0 '), `expected span start at 60px, got ${spanPath.slice(0, 20)}`);
  assert.ok(!spanPath.endsWith('Z'), 'broken span layer must not close');

  const y1 = yAt(FRONT_WAVES[0], 300, 0, 190);
  const y2 = yAt(FRONT_WAVES[0], 300, 1.5, 190);
  assert.notEqual(y1, y2);
});

test('chest crop metrics match 2048x1360 sprite sheet formulas', () => {
  const m = getChestCropMetrics(120);
  assert.equal(m.width, 120);
  assert.ok(Math.abs(m.height - (120 * 392) / 446) < 1e-6);
  assert.ok(Math.abs(m.bgSizeX - (2048 / 446) * 100) < 1e-6);
  assert.ok(Math.abs(m.bgSizeY - (1360 / 392) * 100) < 1e-6);
  assert.ok(Math.abs(m.bgPosX - (1475 / (2048 - 446)) * 100) < 1e-6);
  assert.ok(Math.abs(m.bgPosY - (830 / (1360 - 392)) * 100) < 1e-6);
});

test('ship dimensions clamp cleanly on desktop, mobile, and short band heights', () => {
  assert.equal(getShipDimensions(390, 168).sw, 110);
  assert.equal(getShipDimensions(760, 168).sw, 110);
  assert.equal(getShipDimensions(1000, 190).sw, 140);
  assert.ok(Math.abs(getShipDimensions(1440, 190).sw - 190 * 0.85) < 1e-6);
  assert.ok(Math.abs(getShipDimensions(1440, 140).sw - 140 * 0.85) < 1e-6);
  assert.equal(getShipDimensions(1440, 240).sw, 190);
});

test('mapHttpErrorToMessage returns exact spec copy', () => {
  assert.equal(mapHttpErrorToMessage(401), COPY.badKey);
  assert.equal(mapHttpErrorToMessage(429), COPY.rateLimit);
  assert.equal(mapHttpErrorToMessage(null), COPY.network);
  assert.equal(mapHttpErrorToMessage(500), COPY.failedJob);
});
