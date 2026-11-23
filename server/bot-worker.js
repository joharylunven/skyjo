// Calcul d'un coup de robot hors du fil principal (le serveur reste réactif).
import { parentPort, workerData } from 'node:worker_threads';

const { game, ...data } = workerData;
const mod = game === 'petanque' ? await import('./petanque-ai.js') : await import('./golf-ai.js');
parentPort.postMessage(game === 'petanque' ? mod.chooseThrow(data) : mod.chooseShot(data));
