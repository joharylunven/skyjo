export class Emitter {
  constructor() {
    this._listeners = new Set();
  }
  onUpdate(cb) {
    this._listeners.add(cb);
    return () => this._listeners.delete(cb);
  }
  _notify(update) {
    for (const cb of this._listeners) {
      try {
        cb(update);
      } catch (e) {
        console.error(e);
      }
    }
  }
}
