// Notifications push (Web Push, compatible iPhone depuis iOS 16.4 pour l'appli ajoutée à l'écran
// d'accueil). Les clés VAPID sont créées au premier démarrage et gardées dans la base.
// PUSH_SUBJECT (ou PUBLIC_URL) : adresse de contact transmise aux services de push d'Apple/Google.

import webpush from 'web-push';

export class Push {
  constructor(store, { subject, send } = {}) {
    this.store = store;
    this.subject = subject || 'mailto:arcade@example.invalid';
    this.send = send ?? ((sub, payload, opts) => webpush.sendNotification(sub, payload, opts));
    const data = (store.data.push ??= { vapid: null, subs: [] });
    if (!data.vapid) {
      data.vapid = webpush.generateVAPIDKeys();
      store.save();
    }
  }

  get publicKey() {
    return this.store.data.push.vapid.publicKey;
  }

  get subs() {
    return this.store.data.push.subs;
  }

  /** Enregistre (ou rattache au profil) l'abonnement d'un appareil. */
  subscribe(profileId, sub) {
    if (!sub || typeof sub.endpoint !== 'string' || !/^https:\/\//.test(sub.endpoint) || !sub.keys?.p256dh || !sub.keys?.auth) return false;
    const clean = { endpoint: sub.endpoint, keys: { p256dh: String(sub.keys.p256dh), auth: String(sub.keys.auth) } };
    const data = this.store.data.push;
    data.subs = data.subs.filter((s) => s.endpoint !== clean.endpoint);
    data.subs.push({ profileId, ...clean, createdAt: Date.now() });
    this.store.save();
    return true;
  }

  unsubscribe(endpoint, profileId = null) {
    const data = this.store.data.push;
    const before = data.subs.length;
    data.subs = data.subs.filter((s) => !(s.endpoint === endpoint && (!profileId || s.profileId === profileId)));
    if (data.subs.length !== before) this.store.save();
  }

  hasDevice(profileId) {
    return this.subs.some((s) => s.profileId === profileId);
  }

  /** Envoie à tous les appareils du profil ; oublie ceux qui ont expiré. */
  async notify(profileId, message) {
    const targets = this.subs.filter((s) => s.profileId === profileId);
    const { vapid } = this.store.data.push;
    const payload = JSON.stringify(message);
    await Promise.all(
      targets.map(async (s) => {
        try {
          await this.send({ endpoint: s.endpoint, keys: s.keys }, payload, {
            TTL: 60 * 60 * 24,
            urgency: 'high',
            topic: message.tag?.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || undefined,
            vapidDetails: { subject: this.subject, publicKey: vapid.publicKey, privateKey: vapid.privateKey },
          });
        } catch (e) {
          if (e.statusCode === 404 || e.statusCode === 410) this.unsubscribe(s.endpoint);
          else console.warn('Notification non envoyée :', e.statusCode ?? '', e.body ?? e.message);
        }
      }),
    );
  }
}
