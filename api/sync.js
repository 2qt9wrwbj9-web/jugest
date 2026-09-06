import syncWebHandler from './_sync-web.js';
import {runWebHandler} from './_node-web.js';
export default async function handler(req,res){return await runWebHandler(req,res,syncWebHandler)}
