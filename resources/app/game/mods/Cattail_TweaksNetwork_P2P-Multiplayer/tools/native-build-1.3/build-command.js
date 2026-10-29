'use strict';
// Pure protocol and arbitration. Native construction stays in snapshot-world's closure.
const crypto = require('crypto');
const REQUEST_KEYS = ['requestId', 'epoch', 'baseRevision', 'baseStateHash', 'name', 'position'];
const COMMIT_KEYS = ['commandId', 'requestId', 'actorPeerId', 'epoch', 'prevRevision', 'revision', 'beforeHash', 'afterHash', 'entity', 'price', 'resourcesAfter', 'machinesBuildAfter', 'commitHash'];
const REASONS = Object.freeze(['NOT_READY', 'BUSY', 'STALE_REVISION', 'STATE_MISMATCH', 'UNAVAILABLE', 'WRONG_PLANE', 'MEMORY_AREA', 'OCCUPIED', 'ENTITY_LIMIT', 'INSUFFICIENT_RESOURCES', 'REQUEST_ID_REUSE']);
const clone = value => structuredClone(value);
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function exact(value, keys) {
 if (!value || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).sort().join('|') !== keys.slice().sort().join('|')) throw Error('COMMAND_KEYS');
}
function integer(value, min, max, code = 'COMMAND_NUMBER') {
 if (!Number.isSafeInteger(value) || value < min || value > max) throw Error(code);
 return value;
}
function sha(value) { if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw Error('COMMAND_HASH'); return value; }
function peer(value) { if (typeof value !== 'string' || !/^guest-[1-9]\d{0,8}$/.test(value)) throw Error('COMMAND_PEER'); return value; }
function position(value) {
 if (!Array.isArray(value) || value.length !== 2) throw Error('COMMAND_POSITION');
 return value.map(n => integer(n, -64, 64, 'COMMAND_POSITION'));
}
function resources(value) {
 if (!Array.isArray(value) || value.length !== 10) throw Error('COMMAND_RESOURCES');
 return value.map(n => { if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 1e9) throw Error('COMMAND_RESOURCES'); return n; });
}
function request(value) {
 exact(value, REQUEST_KEYS);
 if (value.epoch !== 1 || value.name !== 'pump') throw Error('COMMAND_OPERATION');
 return {requestId: integer(value.requestId, 1, 64), epoch: 1, baseRevision: integer(value.baseRevision, 1, 256), baseStateHash: sha(value.baseStateHash), name: 'pump', position: position(value.position)};
}
function commitCore(value) {
 const row = value.entity;
 exact(row, ['netId', 'name', 'position', 'fields']); exact(row.fields, ['soul', 'depth', 'spoolup']);
 if (value.epoch !== 1 || row.name !== 'pump' || row.fields.soul !== 1 || row.fields.depth !== 0 || row.fields.spoolup !== 0) throw Error('COMMAND_ENTITY');
 const previous = integer(value.prevRevision, 1, 255), revision = integer(value.revision, 2, 256);
 if (revision !== previous + 1 || value.commandId !== previous || value.machinesBuildAfter !== previous) throw Error('COMMAND_ORDER');
 const price = resources(value.price);
 if (!price[2] || price.some((n, i) => i !== 2 && n !== 0) || !Number.isSafeInteger(price[2])) throw Error('COMMAND_PRICE');
 return {commandId: previous, requestId: integer(value.requestId, 1, 64), actorPeerId: value.actorPeerId === 'host' ? 'host' : peer(value.actorPeerId), epoch: 1, prevRevision: previous, revision,
  beforeHash: sha(value.beforeHash), afterHash: sha(value.afterHash), entity: {netId: integer(row.netId, 1, 256), name: 'pump', position: position(row.position), fields: {soul: 1, depth: 0, spoolup: 0}},
  price, resourcesAfter: resources(value.resourcesAfter), machinesBuildAfter: previous};
}
function commit(value) {
 exact(value, COMMIT_KEYS); const clean = commitCore(value);
 if (sha(value.commitHash) !== hash(clean)) throw Error('COMMAND_COMMIT_HASH');
 return {...clean, commitHash: value.commitHash};
}
function seal(value) { const clean = commitCore(value); return {...clean, commitHash: hash(clean)}; }
function acknowledgment(value) {
 exact(value, ['commandId', 'epoch', 'revision', 'commitHash', 'stateHash']);
 if (value.epoch !== 1 || value.revision !== value.commandId + 1) throw Error('COMMAND_ACK_ORDER');
 return {commandId: integer(value.commandId, 1, 255), epoch: 1, revision: integer(value.revision, 2, 256), commitHash: sha(value.commitHash), stateHash: sha(value.stateHash)};
}
function receipt(value) { return {commandId: value.commandId, epoch: 1, revision: value.revision, commitHash: value.commitHash, stateHash: value.afterHash}; }
function rejected(requestId, reason, state) {
 if (!REASONS.includes(reason)) throw Error('COMMAND_REJECTION_REASON');
 return {requestId, reason, epoch: 1, revision: state.revision, stateHash: state.stateHash};
}
function validateRejection(value) {
 exact(value, ['requestId', 'reason', 'epoch', 'revision', 'stateHash']);
 integer(value.requestId, 1, 64); integer(value.revision, 1, 256); sha(value.stateHash);
 if (value.epoch !== 1 || !REASONS.includes(value.reason)) throw Error('COMMAND_REJECTION'); return clone(value);
}
class HostArbiter {
 constructor({peers, state, ready, prepare, apply}) {
  if (!Array.isArray(peers) || peers.length !== 3 || new Set(peers).size !== 3) throw Error('COMMAND_PEERS');
  peers.forEach(peer); this.peers = new Set(peers); this.getState = state; this.isReady = ready; this.prepare = prepare; this.apply = apply;
  this.ledger = new Map(); this.history = new Map(); this.pending = null; this.counters = {received: 0, accepted: 0, rejected: 0, replays: 0, reusedIds: 0, duplicateAcks: 0};
 }
 receive(actor, input) {
  if (!this.peers.has(actor)) throw Error('COMMAND_PEER');
  return this.receiveAuthenticated(actor, input);
 }
 submitLocal(input) { return this.receiveAuthenticated('host', input); }
 receiveAuthenticated(actor, input) {
  if (actor !== 'host' && !this.peers.has(actor)) throw Error('COMMAND_PEER');
  const value = request(input), fingerprint = hash(value), key = actor + ':' + value.requestId;
  this.counters.received++; const old = this.ledger.get(key);
  if (old) {
   if (old.fingerprint !== fingerprint) { this.counters.reusedIds++; return {kind: 'rejected', value: rejected(value.requestId, 'REQUEST_ID_REUSE', this.getState()), replay: false}; }
   this.counters.replays++; return {kind: old.kind, value: clone(old.value), replay: true};
  }
  const reject = reason => { const reply = rejected(value.requestId, reason, this.getState()); this.ledger.set(key, {fingerprint, kind: 'rejected', value: reply}); this.counters.rejected++; return {kind: 'rejected', value: clone(reply), replay: false}; };
  if (!this.isReady()) return reject('NOT_READY');
  if (this.pending) return reject('BUSY');
  const state = this.getState();
  if (value.baseRevision !== state.revision) return reject('STALE_REVISION');
  if (value.baseStateHash !== state.stateHash) return reject('STATE_MISMATCH');
  let plan;
  try { plan = this.prepare(value); }
  catch (error) { if (REASONS.includes(error.message)) return reject(error.message); throw error; }
  // Reserve before native mutation. There is no async interleaving or implicit queue.
  this.pending = {committing: true};
  const result = this.apply(plan), core = {...plan, requestId: value.requestId, actorPeerId: actor, commandId: state.revision, epoch: 1, prevRevision: state.revision, revision: state.revision + 1, beforeHash: state.stateHash, afterHash: result.stateHash};
  const accepted = seal(core), row = {value: accepted, acks: new Map(), allAcknowledged: false};
  this.history.set(accepted.commandId, row); this.pending = row;
  this.ledger.set(key, {fingerprint, kind: 'committed', value: accepted}); this.counters.accepted++;
  return {kind: 'committed', value: clone(accepted), replay: false};
 }
 acknowledge(actor, input) {
  if (!this.peers.has(actor)) throw Error('COMMAND_PEER');
  const value = acknowledgment(input), row = this.history.get(value.commandId);
  if (!row || value.revision !== row.value.revision || value.commitHash !== row.value.commitHash || value.stateHash !== row.value.afterHash) throw Error('COMMAND_ACK_MISMATCH');
  if (row.acks.has(actor)) { this.counters.duplicateAcks++; return false; }
  row.acks.set(actor, value);
  if (row.acks.size === 3) { row.allAcknowledged = true; if (this.pending === row) this.pending = null; return true; }
  return false;
 }
 state() {
  return {counters: {...this.counters}, ledgerSize: this.ledger.size, pending: this.pending ? {commandId: this.pending.value?.commandId ?? null, committed: !!this.pending.value, ackedCount: this.pending.acks?.size || 0} : null,
   history: [...this.history.values()].map(row => ({commit: clone(row.value), hostCommitted: true, ackedCount: row.acks.size, acknowledgments: Object.fromEntries(row.acks), allAcknowledged: row.allAcknowledged}))};
 }
}
class GuestLedger {
 constructor() { this.applied = new Map(); this.duplicateCommits = 0; }
 receive(input, state, apply) {
  const value = commit(input), old = this.applied.get(value.commandId);
  if (old) {
   if (old.commitHash !== value.commitHash) throw Error('COMMAND_REPLAY_MISMATCH');
   this.duplicateCommits++; return receipt(old);
  }
  if (value.prevRevision !== state.revision || value.beforeHash !== state.stateHash) throw Error('COMMAND_STATE_ORDER');
  const result = apply(value);
  if (result.revision !== value.revision || result.stateHash !== value.afterHash) throw Error('COMMAND_RESULT_STATE');
  this.applied.set(value.commandId, value); return receipt(value);
 }
 state() { return {applied: [...this.applied.values()].map(clone), duplicateCommits: this.duplicateCommits}; }
}
module.exports = {REQUEST_KEYS, COMMIT_KEYS, REASONS, hash, exact, integer, sha, resources, request, commit, seal, acknowledgment, receipt, validateRejection, HostArbiter, GuestLedger};
