import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analyticsAllowed} from '../lib/consent';
test('Analytics requires explicit current-version consent; absent, declined and old values fail closed',()=>{
 for(const value of [null,undefined,'','v1.reject','true','accept','v0.accept'])assert.equal(analyticsAllowed(value),false);
 assert.equal(analyticsAllowed('v1.accept'),true);
});
