import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './worker.mjs';
test('forwards the practice inbox to both designated recipients', async () => {
  const calls = [];
  await worker.email({ to: 'hello@anderhue.ca', forward: async (to) => calls.push(to), setReject: () => assert.fail() });
  assert.deepEqual(calls.sort(), ['brett@execom.ca', 'info@onlineparalegals.ca']);
});
test('does not forward other recipients', async () => {
  let rejected = false;
  await worker.email({ to: 'other@anderhue.ca', forward: () => assert.fail(), setReject: () => { rejected = true; } });
  assert.equal(rejected, true);
});
test('attempts both destinations and surfaces a forwarding failure', async () => {
  const calls = [];
  await assert.rejects(worker.email({ to: 'hello@anderhue.ca', forward: async (to) => {
    calls.push(to); if (to.startsWith('info@')) throw new Error('unavailable');
  }, setReject: () => assert.fail() }), /destination failed/);
  assert.equal(calls.length, 2);
});
