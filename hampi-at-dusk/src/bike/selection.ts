// Which bike is being ridden (v1.6). The pick lives in memory for the page session and is remembered
// in the prefs; a ?bike= URL parameter overrides the remembered pick at start-up without saving it.
import { URL_BIKE } from '../input';
import { loadPrefs, savePrefs } from '../progress';
import { BIKES, type BikeDef, type BikeId } from './bikes';

let current: BikeId | null = null;

export function currentBike(): BikeId {
  if (current === null) current = URL_BIKE ?? loadPrefs().bike;
  return current;
}

export function currentBikeDef(): BikeDef {
  return BIKES[currentBike()];
}

/** Pick a bike. Remembered for the next visit when storage allows (it works the same when it does not). */
export function selectBike(id: BikeId): void {
  if (id === current) return;
  current = id;
  savePrefs({ ...loadPrefs(), bike: id });
}
