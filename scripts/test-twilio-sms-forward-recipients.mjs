import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../twilio-serverless/functions/sms-to-email.js', import.meta.url), 'utf8');

for (const configuredRecipient of [undefined, '', 'brett@execom.ca', 'brett@execom.ca,hello@fabsy.ca', 'other@example.test']) {
  test(`Twilio forwarder pins hello despite legacy recipient configuration ${String(configuredRecipient)}`, async () => {
    const messages = [];
    let completed = false;
    const sandbox = vm.createContext({
      exports: {},
      console: { log() {}, error() {} },
      Twilio: { twiml: { MessagingResponse: class {} } },
      require(name) {
        assert.equal(name, 'resend');
        return { Resend: class { emails = { send: async payload => { messages.push(payload); return { id: 'fixture' }; } }; } };
      },
    });
    vm.runInContext(source, sandbox);
    await sandbox.exports.handler({ RESEND_API_KEY: 'synthetic-placeholder', EMAIL_TO: configuredRecipient },
      { From: '+14035550100', To: '+18255550100', Body: 'Synthetic inbound message' },
      error => { assert.equal(error, null); completed = true; });
    assert.equal(completed, true);
    assert.equal(messages.length, 1);
    assert.deepEqual([...messages[0].to], ['hello@fabsy.ca']);
    assert.equal(messages[0].bcc, undefined);
  });
}
