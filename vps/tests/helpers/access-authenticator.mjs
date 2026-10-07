import {createHash,generateKeyPairSync,randomBytes,sign} from 'node:crypto';
import {encodeCBOR} from '@levischuck/tiny-cbor';

const hash=bytes=>createHash('sha256').update(bytes).digest();
const b64=bytes=>Buffer.from(bytes).toString('base64url');
export function virtualCredential(){
  const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),jwk=publicKey.export({format:'jwk'}),id=randomBytes(32);
  const cose=Buffer.from(encodeCBOR(new Map([[1,2],[3,-7],[-1,1],[-2,new Uint8Array(Buffer.from(jwk.x,'base64url'))],[-3,new Uint8Array(Buffer.from(jwk.y,'base64url'))]])));
  let counter=0;
  function clientData(options,type,origin){return Buffer.from(JSON.stringify({type,challenge:options.challenge,origin,crossOrigin:false}))}
  function data(rpID,flags,count){const buffer=Buffer.alloc(37);hash(rpID).copy(buffer);buffer[32]=flags;buffer.writeUInt32BE(count,33);return buffer}
  return {
    id:b64(id),
    registration(options,{origin='https://jugest.net',rpID='jugest.net',uv=true}={}){
      const cd=clientData(options,'webauthn.create',origin),head=data(rpID,uv?0x45:0x41,0),length=Buffer.alloc(2);length.writeUInt16BE(id.length);
      const authData=Buffer.concat([head,Buffer.alloc(16),length,id,cose]);
      const attestation=encodeCBOR(new Map([['fmt','none'],['authData',new Uint8Array(authData)],['attStmt',new Map()]]));
      return {id:b64(id),rawId:b64(id),type:'public-key',authenticatorAttachment:'platform',clientExtensionResults:{},response:{clientDataJSON:b64(cd),attestationObject:b64(attestation),transports:['internal']}};
    },
    assertion(options,{origin='https://jugest.net',rpID='jugest.net',uv=true,userHandle=null,invalidSignature=false}={}){
      const cd=clientData(options,'webauthn.get',origin),authData=data(rpID,uv?0x05:0x01,++counter);
      const signature=invalidSignature?randomBytes(70):sign('sha256',Buffer.concat([authData,hash(cd)]),privateKey);
      return {id:b64(id),rawId:b64(id),type:'public-key',authenticatorAttachment:'platform',clientExtensionResults:{},response:{clientDataJSON:b64(cd),authenticatorData:b64(authData),signature:b64(signature),userHandle}};
    }
  };
}
