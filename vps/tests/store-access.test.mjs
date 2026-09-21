import test from 'node:test';
import assert from 'node:assert/strict';
import {canAccessStoreMetadata,isPublicNativeStore,storeMetadata} from '../src/store-access.mjs';

test('explicit public PIA native metadata remains public in public mode',()=>{
  const pia={source:'pia-public-ranking-top',visibility:'public'};
  assert.equal(isPublicNativeStore(pia),true);
  assert.equal(canAccessStoreMetadata(pia,'any-channel',{piaAccessMode:'public'}),true);
  assert.equal(canAccessStoreMetadata({source:'pia-public-ranking-top'},'any-channel',{piaAccessMode:'public'}),false);
  assert.equal(canAccessStoreMetadata({visibility:'public',source:'other-source'},'any-channel',{piaAccessMode:'public'}),false);
});

test('PIA owner mode allows only configured owner channels and fails closed',()=>{
  const pia={source:'pia-public-ranking-top',visibility:'public'};
  const options={piaAccessMode:'owner',piaOwnerChannelIds:'hiro-channel, second-channel '};
  assert.equal(canAccessStoreMetadata(pia,'hiro-channel',options),true);
  assert.equal(canAccessStoreMetadata(pia,'second-channel',options),true);
  assert.equal(canAccessStoreMetadata(pia,'other-channel',options),false);
  assert.equal(canAccessStoreMetadata(pia,'',{piaAccessMode:'owner',piaOwnerChannelIds:'hiro-channel'}),false);
  assert.equal(canAccessStoreMetadata(pia,'hiro-channel',{piaAccessMode:'owner',piaOwnerChannelIds:''}),false);
  assert.equal(canAccessStoreMetadata(pia,'hiro-channel',{piaAccessMode:'unexpected',piaOwnerChannelIds:'hiro-channel'}),false);
});

test('private Collector stores still require their exact channel and malformed metadata fails closed',()=>{
  assert.equal(canAccessStoreMetadata({collectorChannelId:'channel-a',source:'ana-slo-ios-relay'},'channel-a'),true);
  assert.equal(canAccessStoreMetadata({collectorChannelId:'channel-b',source:'ana-slo-ios-relay'},'channel-a'),false);
  assert.deepEqual(storeMetadata('{bad-json'),{});
  assert.equal(canAccessStoreMetadata(storeMetadata('{bad-json'),'channel-a'),false);
});
