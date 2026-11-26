import { describe, expect, it } from 'vitest';
import {
  MAX_HELMETS, clearStage, currentStage, isUnlocked, loseHelmet, reachedStages, restartAfterGameOver, startJourney, totalTimeMs,
  type Journey, type StageResult,
} from '../../src/journey';

const ROUTE = ['hampi', 'goa', 'ladakh'];
const cleared = (stage: string, timeMs = 60_000, extra: Partial<StageResult> = {}): StageResult =>
  ({ stage, timeMs, collected: 50, total: 56, crashes: 0, flips: 0, medal: 'gold', ...extra });
/** Lose n helmets. */
const crashes = (j: Journey, n: number): Journey => { for (let i = 0; i < n; i++) j = loseHelmet(j); return j; };

describe('the journey: start', () => {
  it('starts on the first stage of the route with 10 helmets, nothing cleared', () => {
    expect(MAX_HELMETS).toBe(10);
    const j = startJourney('sundowner', ROUTE);
    expect(j).toEqual({ bike: 'sundowner', route: ROUTE, index: 0, helmets: 10, results: [], gameOvers: 0, status: 'riding' });
    expect(currentStage(j)).toBe('hampi');
    expect(totalTimeMs(j)).toBe(0);
    expect(reachedStages(j)).toEqual(['hampi']);
  });

  it('keeps its own copy of the route, and needs at least one stage', () => {
    const route = ['hampi'];
    const j = startJourney('daybreak', route);
    route.push('goa');
    expect(j.route).toEqual(['hampi']);
    expect(() => startJourney('daybreak', [])).toThrow();
  });

  it('never changes the journey it is given (every rule returns a new one)', () => {
    const j = Object.freeze(startJourney('tonup', ROUTE));
    const snapshot = JSON.stringify(j);
    loseHelmet(j);
    clearStage(j, cleared('hampi'));
    restartAfterGameOver(crashes(j, 10));
    expect(JSON.stringify(j)).toBe(snapshot);
  });
});

describe('the journey: helmets', () => {
  it('a crash costs one helmet; nine crashes leave one and the ride goes on', () => {
    let j = startJourney('daybreak', ROUTE);
    for (const left of [9, 8, 7, 6, 5, 4, 3, 2, 1]) {
      j = loseHelmet(j);
      expect([j.helmets, j.status, j.gameOvers]).toEqual([left, 'riding', 0]);
    }
  });

  it('the tenth crash is game over: no helmets, same stage, nothing cleared is lost', () => {
    let j = clearStage(startJourney('daybreak', ROUTE), cleared('hampi', 61_000));
    j = crashes(j, 10);
    expect([j.helmets, j.status, j.gameOvers]).toEqual([0, 'gameover', 1]);
    expect([j.index, currentStage(j), j.bike]).toEqual([1, 'goa', 'daybreak']);
    expect(j.results).toEqual([cleared('hampi', 61_000)]);
    // nothing more can be lost, and nothing can be cleared, while it is game over
    expect(loseHelmet(j)).toBe(j);
    expect(clearStage(j, cleared('goa'))).toBe(j);
  });

  it('game over restarts the current stage with 10 helmets; the bike and the cleared stages are kept', () => {
    const over = crashes(clearStage(startJourney('tonup', ROUTE), cleared('hampi', 52_000)), 10);
    const j = restartAfterGameOver(over);
    expect(j).toEqual({ ...over, helmets: 10, status: 'riding' });
    expect([j.bike, j.index, currentStage(j), j.gameOvers]).toEqual(['tonup', 1, 'goa', 1]);
    expect(j.results).toEqual([cleared('hampi', 52_000)]);
    expect(totalTimeMs(j)).toBe(52_000);
    // it only applies to a game over
    const riding = startJourney('tonup', ROUTE);
    expect(restartAfterGameOver(riding)).toBe(riding);
    // a second game over on the same stage counts again
    expect(crashes(j, 10).gameOvers).toBe(2);
  });

  it('helmets carry over to the next stage, plus one, capped at 10', () => {
    for (const [lost, next] of [[0, 10], [1, 10], [2, 9], [3, 8], [9, 2]] as const) {
      const j = clearStage(crashes(startJourney('daybreak', ROUTE), lost), cleared('hampi'));
      expect([j.index, j.helmets, j.status], `${lost} lost`).toEqual([1, next, 'riding']);
    }
    // stage after stage: 10 -> lose 8 -> 2 -> +1 = 3 -> lose 1 -> 2 -> +1 = 3 on the last stage
    let j = crashes(startJourney('daybreak', ROUTE), 8);
    j = clearStage(j, cleared('hampi'));
    expect(j.helmets).toBe(3);
    j = clearStage(crashes(j, 1), cleared('goa'));
    expect([j.helmets, currentStage(j)]).toEqual([3, 'ladakh']);
  });

  it('a game over does not give the +1 twice: the restarted stage has 10, the next one still at most 10', () => {
    let j = restartAfterGameOver(crashes(startJourney('daybreak', ROUTE), 10));
    expect(j.helmets).toBe(10);
    j = clearStage(crashes(j, 2), cleared('hampi'));
    expect(j.helmets).toBe(9);
  });
});

describe('the journey: stages and time', () => {
  it('clearing the last stage ends the journey: no further stage, no helmet added, the results complete', () => {
    let j = startJourney('sundowner', ROUTE);
    j = clearStage(j, cleared('hampi', 70_000));
    j = clearStage(crashes(j, 2), cleared('goa', 65_500, { crashes: 2, medal: 'silver' }));
    expect(j.status).toBe('riding');
    const before = j.helmets;
    j = clearStage(crashes(j, 1), cleared('ladakh', 80_250, { medal: null }));
    expect([j.status, j.index, j.helmets]).toEqual(['done', 2, before - 1]);
    expect(j.results.map((r) => [r.stage, r.timeMs, r.medal])).toEqual([
      ['hampi', 70_000, 'gold'], ['goa', 65_500, 'silver'], ['ladakh', 80_250, null],
    ]);
    expect(totalTimeMs(j)).toBe(215_750);
    // done is final
    expect(loseHelmet(j)).toBe(j);
    expect(clearStage(j, cleared('ladakh'))).toBe(j);
    expect(restartAfterGameOver(j)).toBe(j);
  });

  it('a journey of one stage is start -> done', () => {
    const j = clearStage(crashes(startJourney('daybreak', ['hampi']), 9), cleared('hampi', 59_517));
    expect([j.status, j.index, j.helmets, totalTimeMs(j)]).toEqual(['done', 0, 1, 59_517]);
  });

  it('the total is the sum of the runs that cleared each stage: a game over costs the stage again, not the clock', () => {
    let j = clearStage(startJourney('daybreak', ROUTE), cleared('hampi', 60_000));
    j = restartAfterGameOver(crashes(j, 10)); // whatever time that attempt at Goa took is gone with it
    expect(totalTimeMs(j)).toBe(60_000);
    j = clearStage(j, cleared('goa', 58_000));
    expect(totalTimeMs(j)).toBe(118_000);
  });

  it('only the stage being ridden can be cleared', () => {
    const j = startJourney('daybreak', ROUTE);
    expect(() => clearStage(j, cleared('goa'))).toThrow();
  });

  it('the same stage can be on a route twice (the test route of the e2e suite)', () => {
    let j = startJourney('daybreak', ['hampi', 'hampi']);
    j = clearStage(crashes(j, 1), cleared('hampi', 60_000));
    expect([j.index, j.helmets, j.status, reachedStages(j)]).toEqual([1, 10, 'riding', ['hampi']]);
    j = clearStage(j, cleared('hampi', 61_000));
    expect([j.status, totalTimeMs(j)]).toEqual(['done', 121_000]);
  });
});

describe('the journey: unlocks', () => {
  it('a journey has reached every stage up to the one it is riding', () => {
    let j = startJourney('daybreak', ROUTE);
    expect(reachedStages(j)).toEqual(['hampi']);
    j = clearStage(j, cleared('hampi'));
    expect(reachedStages(j)).toEqual(['hampi', 'goa']);
    // a game over on Goa does not take it back
    j = restartAfterGameOver(crashes(j, 10));
    expect(reachedStages(j)).toEqual(['hampi', 'goa']);
    j = clearStage(clearStage(j, cleared('goa')), cleared('ladakh'));
    expect(reachedStages(j)).toEqual(['hampi', 'goa', 'ladakh']);
  });

  it('the first stage is always unlocked; any other once a journey has reached it', () => {
    expect(isUnlocked('hampi', 'hampi', [])).toBe(true);
    expect(isUnlocked('goa', 'hampi', [])).toBe(false);
    expect(isUnlocked('goa', 'hampi', ['hampi'])).toBe(false);
    expect(isUnlocked('goa', 'hampi', ['hampi', 'goa'])).toBe(true);
    expect(isUnlocked('ladakh', 'hampi', ['hampi', 'goa'])).toBe(false);
    // reaching Goa (not clearing it) is enough
    const j = clearStage(startJourney('daybreak', ROUTE), cleared('hampi'));
    expect(ROUTE.map((s) => isUnlocked(s, 'hampi', reachedStages(j)))).toEqual([true, true, false]);
  });
});
