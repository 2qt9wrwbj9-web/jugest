import test from 'node:test';
import assert from 'node:assert/strict';
import {canAccessStoreMetadata,isPublicNativeStore,storeMetadata} from '../src/store-access.mjs';

test('only explicitly public PIA native metadata bypasses Collector channel matching',()=>{
  const pia={source:'pia-public-ranking-top',visibility:'public'};
  assert.equal(isPublicNativeStore(pia),true);
  assert.equal(canAccessStoreMetadata(pia,'any-channel'),true);
  assert.equal(canAccessStoreMetadata({source:'pia-public-ranking-top'},'any-channel'),false);
  assert.equal(canAccessStoreMetadata({visibility:'public',source:'other-source'},'any-channel'),false);
});

test('private Collector stores still require their exact channel and malformed metadata fails closed',()=>{
  assert.equal(canAccessStoreMetadata({collectorChannelId:'channel-a',source:'ana-slo-ios-relay'},'channel-a'),true);
  assert.equal(canAccessStoreMetadata({collectorChannelId:'channel-b',source:'ana-slo-ios-relay'},'channel-a'),false);
  assert.deepEqual(storeMetadata('{bad-json'),{});
  assert.equal(canAccessStoreMetadata(storeMetadata('{bad-json'),'channel-a'),false);
});
