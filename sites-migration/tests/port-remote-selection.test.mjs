import assert from 'node:assert/strict';
import test from 'node:test';
import {initializeRemoteStoreSelection, withDisplayMachineNames} from '../client/sites-store-connection.mjs';

test('automatically displayed remote store supplies the core selection used by the matrix and details', () => {
  let active = '';
  const bridge = {
    getActiveStore: () => active,
    setActiveStore(name, options) {
      assert.deepEqual(options, {silent: true});
      active = name;
      return true;
    },
  };
  const observed = {name: 'PIA大船1（公開観測）', remote: true};
  assert.equal(initializeRemoteStoreSelection(bridge, {name: 'ローカル店舗'}), false);
  assert.equal(initializeRemoteStoreSelection(bridge, observed), true);
  assert.equal(bridge.getActiveStore(), observed.name);
  assert.equal(initializeRemoteStoreSelection(bridge, {name: '別の店舗', remote: true}), false);
  assert.equal(bridge.getActiveStore(), observed.name);
});

test('archived rows use original display names without changing captured labels or observations', () => {
  const observation = Object.freeze({tableNo: '3145', machine: 'fk', games: 3011, bb: 11, rb: 12, diff: -70});
  const captured = {...observation, sourceMachineName: '取得元の表記'};
  const payload = {day: {date: '2026-09-21', machines: [observation, captured]}};
  const result = withDisplayMachineNames(payload, {full: key => key === 'fk' ? 'ファンキージャグラー2' : null});
  assert.deepEqual(result.day.machines, [{...observation, machineName: 'ファンキージャグラー2'}, captured]);
  assert.equal(payload.day.machines[0], observation);
  assert.equal(result.day.date, payload.day.date);
});
