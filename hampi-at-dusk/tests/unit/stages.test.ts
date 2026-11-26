import { describe, expect, it } from 'vitest';
import { BIKE_ORDER } from '../../src/bike/bikes';
import { TILE, cameraMaxScrollX, stageWidth, worldEndX } from '../../src/level/level';
import { FIRST_STAGE, JOURNEY_ORDER, isStageId, registerStage, stageDef, stageNumber, stageTitle, stages } from '../../src/stages';
import { BOT_RUN_MS, CHECKPOINTS, DECOR, HAMPI, LEVEL } from '../../src/stages/hampi';
import { defineStage, levelOf, medalsFor } from '../../src/stages/stage';

describe('the stage registry (v1.9)', () => {
  it('lists the stages in riding order; Hampi is stage 1 and the first of the journey', () => {
    expect(stages().map((s) => s.id)).toEqual(['hampi']);
    expect(FIRST_STAGE).toBe(HAMPI);
    expect(stages()[0]).toBe(HAMPI);
    expect(stageNumber('hampi')).toBe(1);
    expect(stageTitle(HAMPI)).toBe('STAGE 1: HAMPI AT DUSK');
  });

  it('the journey is a list of registered stages, starting with the first, each once', () => {
    expect(JOURNEY_ORDER).toEqual(['hampi']);
    expect(JOURNEY_ORDER[0]).toBe(FIRST_STAGE.id);
    for (const id of JOURNEY_ORDER) expect(isStageId(id), id).toBe(true);
    expect(new Set(JOURNEY_ORDER).size).toBe(JOURNEY_ORDER.length);
    // and in the registry's order
    const at = JOURNEY_ORDER.map((id) => stageNumber(id));
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it('looks stages up by id; anything unknown is the first stage', () => {
    expect(stageDef('hampi')).toBe(HAMPI);
    expect(isStageId('hampi')).toBe(true);
    for (const bad of ['goa', 'HAMPI', '', null, undefined, 7]) {
      expect(isStageId(bad), String(bad)).toBe(false);
      expect(stageDef(bad), String(bad)).toBe(HAMPI);
    }
  });

  it('an id can be registered once', () => {
    expect(() => registerStage(HAMPI)).toThrow(/twice/);
    expect(stages()).toHaveLength(1);
  });
});

describe('a stage definition (v1.9)', () => {
  it('Hampi: its id, name, pickups and size', () => {
    expect([HAMPI.id, HAMPI.name, HAMPI.cols, HAMPI.width]).toEqual(['hampi', 'HAMPI AT DUSK', 900, 14400]);
    expect(HAMPI.collectible).toEqual({ texture: 'diya', glow: 'glow_diya', label: 'DIYAS' });
    expect(HAMPI.collectibles).toHaveLength(56);
    expect(HAMPI.theme.id).toBe('hampi');
    expect(HAMPI.name).toMatch(/^[A-Z ]+$/);                  // the UI font is ASCII capitals
    expect(HAMPI.name.length * 16).toBeLessThanOrEqual(320);  // fits the stage card at 16 px
    expect(HAMPI.terrain.width).toBe(stageWidth(HAMPI.cols));
    expect([worldEndX(HAMPI.width), cameraMaxScrollX(HAMPI.width)]).toEqual([14384, 13920]);
  });

  it('Hampi has four checkpoints: the start, the middle, before the Temple Steps, before the river', () => {
    expect(HAMPI.checkpoints).toBe(CHECKPOINTS);
    expect(HAMPI.checkpoints).toHaveLength(4);
    expect(HAMPI.checkpoints[0]!.col).toBeLessThan(5);
    // the middle one is within a tenth of the stage of its centre
    expect(Math.abs(HAMPI.checkpoints[1]!.col - HAMPI.cols / 2)).toBeLessThan(HAMPI.cols / 10);
    const firstRiser = HAMPI.terrain.gaps.find((g) => g.step)!;
    const river = HAMPI.terrain.gaps.find((g) => g.river)!;
    // "just before": 14 columns of run-up to the first riser, 20 flat ones and the ramp to the river
    expect(firstRiser.col0 - HAMPI.checkpoints[2]!.col).toBe(12);
    expect(river.col0 - HAMPI.checkpoints[3]!.col).toBe(26);
    // nothing that can crash the bike stands between a checkpoint and 3 columns past it
    for (const c of HAMPI.checkpoints) {
      for (const o of HAMPI.hazards.obstacles) expect(o.col + o.wCols <= c.col || o.col > c.col + 3, `cp${c.id}`).toBe(true);
      for (const g of HAMPI.terrain.gaps) expect(g.col0 + g.cols <= c.col || g.col0 > c.col + 3, `cp${c.id}`).toBe(true);
    }
  });

  it('medal targets are the stage\'s, per bike, from its measured bot runs', () => {
    expect(HAMPI.botRunMs).toBe(BOT_RUN_MS);
    expect(HAMPI.botRunMs).toEqual({ tonup: 49_908, daybreak: 59_517, sundowner: 69_150 });
    for (const b of BIKE_ORDER) expect(HAMPI.medalsMs[b], b).toEqual(medalsFor(HAMPI.botRunMs[b]));
    expect(HAMPI.medalsMs.daybreak).toEqual({ gold: 63_000, silver: 75_000, bronze: 131_000 });
  });

  it('the decoration is where it stood before the stage was an object (v1.7 positions)', () => {
    // six pieces of colonnade behind the Mandapa Run's plinth, 208 px apart, from 24 px in
    const plinth = HAMPI.terrain.pieces.find((p) => p.y0 === 222 - 16 && p.y1 === p.y0 && p.cols >= 60)!;
    const colonnade = DECOR.filter((d) => d.key === 'colonnade');
    const expected: number[] = [];
    for (let x = plinth.x0 + 24; x + 192 <= plinth.x1; x += 208) expected.push(x);
    expect(colonnade.map((d) => d.x)).toEqual(expected);
    expect(colonnade).toHaveLength(6);
    expect(DECOR.filter((d) => d.key !== 'colonnade')).toEqual([
      { key: 'ruins_a', x: 426 * TILE, alpha: 0.85 }, { key: 'ruins_b', x: 462 * TILE, alpha: 0.85 },
      { key: 'ruins_a', x: 478 * TILE, alpha: 0.85 }, { key: 'ruins_b', x: 493 * TILE, alpha: 0.85 },
      { key: 'temple_door', x: 808 * TILE, alpha: 1 },
    ]);
    // all of it stands on the road, none of it over water
    for (const d of DECOR) expect(HAMPI.terrain.surfaceY(d.x + 0.5), d.key).not.toBeNull();
  });

  it('the plain-data view (what the e2e bot reads) has no functions in it and round-trips through JSON', () => {
    expect(levelOf(HAMPI)).toEqual(LEVEL);
    expect(JSON.parse(JSON.stringify(LEVEL))).toEqual(LEVEL);
    expect([LEVEL.id, LEVEL.stageCols, LEVEL.stageWidth, LEVEL.worldStartX, LEVEL.worldEndX]).toEqual(['hampi', 900, 14400, 24, 14384]);
    expect(LEVEL.checkpoints).toHaveLength(4);
    expect(LEVEL.collectibles).toHaveLength(56);
    expect(LEVEL.finish).toEqual({ col: 892 });
  });

  it('defineStage refuses a stage that cannot be ridden', () => {
    const spec = { ...HAMPI };
    expect(() => defineStage({ ...spec, id: 'Goa' })).toThrow(/lower-case/);
    expect(() => defineStage({ ...spec, cols: 901 })).toThrow(/sections cover/);
    expect(() => defineStage({ ...spec, checkpoints: [] })).toThrow(/checkpoint/);
    expect(() => defineStage({ ...spec, checkpoints: [{ id: 0, col: 2 }, { id: 2, col: 400 }] })).toThrow(/ids/);
    expect(() => defineStage({ ...spec, checkpoints: [{ id: 0, col: 400 }, { id: 1, col: 2 }] })).toThrow(/order/);
    expect(() => defineStage({ ...spec, checkpoints: [{ id: 0, col: 2 }, { id: 1, col: 189 }] })).toThrow(/gap/); // in a canal
    expect(() => defineStage({ ...spec, finish: { col: 900, art: 'gateway' } })).toThrow(/finish/);
    // a copy under another id and name is a stage of its own (what the e2e suite rides as "stage 2")
    const copy = defineStage({ ...spec, id: 'test2', name: 'TEST ROAD' });
    expect([copy.id, copy.name, copy.width, copy.medalsMs.tonup.gold]).toEqual(['test2', 'TEST ROAD', 14400, 53_000]);
    expect(copy.terrain).not.toBe(HAMPI.terrain);
    expect(copy.terrain.gaps).toEqual(HAMPI.terrain.gaps);
  });
});
