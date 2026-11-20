// Calcul d'un coup du robot de minigolf hors du fil principal (le serveur reste réactif).
import { parentPort, workerData } from 'node:worker_threads';
import { chooseShot } from './golf-ai.js';

parentPort.postMessage(chooseShot(workerData));
