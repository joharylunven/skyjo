// Fabrique de transports : c'est le seul endroit à modifier pour ajouter une implémentation
// (par exemple FirebaseTransport), choisie via "transport" dans config/network.json ou ?transport=…

import { PeerJSTransport } from './peerjs-transport.js';
import { LocalTransport } from './local-transport.js';

const TRANSPORTS = {
  peerjs: PeerJSTransport,
  local: LocalTransport,
};

export function transportFactory(netConfig, kind = netConfig.transport ?? 'peerjs') {
  const Impl = TRANSPORTS[kind];
  if (!Impl) throw new Error(`Transport inconnu : ${kind}`);
  return (extra = {}) => new Impl({ ...netConfig, ...extra });
}

export { TransportError } from './transport.js';
export { HostSession } from './host-session.js';
export { GuestSession } from './guest-session.js';
export * from './protocol.js';
