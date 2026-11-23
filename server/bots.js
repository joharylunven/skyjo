// Adversaires robots. Ils ont un profil (pour l'historique et les scores) mais pas de code PIN :
// personne ne peut se connecter avec. Le pilote joue leurs coups dès que c'est leur tour.

import { Worker } from 'node:worker_threads';

export const BOTS = [
  { id: 'bot-rakoto', name: 'Rakoto', avatar: '🤖', game: 'minigolf', level: 'bon', blurb: 'Bon joueur, sûr au putt' },
  { id: 'bot-rakoto-champion', name: 'Rakoto Champion', avatar: '👑', game: 'minigolf', level: 'champion', blurb: 'Presque imbattable' },
  { id: 'bot-soizic', name: 'Mamie Soizic', avatar: '👵', game: 'petanque', level: 'bon', blurb: 'Pointeuse redoutable de Port Maria' },
];

export const botInfo = (b) => ({ id: b.id, name: b.name, avatar: b.avatar, blurb: b.blurb, bot: true });

/** Crée (ou met à jour) les profils des robots dans la base. */
export function ensureBotProfiles(store) {
  for (const b of BOTS) {
    const existing = store.data.profiles.find((p) => p.id === b.id);
    const profile = { id: b.id, name: b.name, avatar: b.avatar, bot: true, game: b.game, createdAt: existing?.createdAt ?? Date.now() };
    if (existing) Object.assign(existing, profile);
    else store.data.profiles.push(profile);
  }
  store.save();
}

function botMove(data) {
  return new Promise((ok, ko) => {
    const w = new Worker(new URL('./bot-worker.js', import.meta.url), { workerData: data });
    w.once('message', ok);
    w.once('error', ko);
    w.once('exit', (code) => code && ko(new Error(`robot : fin anormale (${code})`)));
  });
}

export class BotRunner {
  constructor(matches, { delay = 1500 } = {}) {
    this.matches = matches;
    this.delay = delay;
    this.busy = new Set();
    this.closed = false;
  }

  /** À appeler après chaque changement de partie : un robot doit-il jouer ? */
  check(match) {
    if (this.closed || match.status !== 'active' || this.busy.has(match.id)) return;
    const bot = BOTS.find((b) => b.game === match.game && this.matches.awaiting(match).includes(b.id));
    if (bot) this.play(match.id, bot);
  }

  scanAll() {
    for (const m of this.matches.all) this.check(m);
  }

  async play(matchId, bot) {
    this.busy.add(matchId);
    try {
      const m0 = this.matches.get(matchId);
      // laisser le temps de voir rouler la balle d'avant, puis « réfléchir »
      const last = m0.state.lastShot?.path ?? m0.state.lastThrow?.frames;
      const replay = last ? (last.length / 30) * 1000 : 0;
      await new Promise((r) => setTimeout(r, this.delay ? replay + this.delay : 0));
      const m = this.matches.get(matchId);
      if (this.closed || !m || m.status !== 'active' || !this.matches.awaiting(m).includes(bot.id)) return;
      const s = m.state;
      const me = s.players.findIndex((p) => p.id === bot.id);
      const action =
        bot.game === 'petanque'
          ? await botMove({ game: 'petanque', state: s, level: bot.level })
          : await botMove({ game: 'minigolf', holeId: s.holes[s.hole], from: s.players[me].ball, shots: s.shots, level: bot.level });
      if (this.closed) return;
      this.busy.delete(matchId);
      const { expected, ...move } = action;
      this.matches.act(matchId, bot.id, bot.game === 'petanque' ? move : { type: 'shot', angle: move.angle, power: move.power });
    } catch (e) {
      console.warn('Robot :', e.message);
    } finally {
      this.busy.delete(matchId);
    }
  }
}
