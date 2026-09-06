import relayWebHandler from './_relay-web.js';
import {runWebHandler} from './_node-web.js';
export default async function handler(req,res){return await runWebHandler(req,res,relayWebHandler)}
