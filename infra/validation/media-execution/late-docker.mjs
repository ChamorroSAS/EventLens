#!/usr/bin/env node
// Laboratory fault: delay a mutating CLI RPC, without cancelling its server operation.
import {spawn} from 'node:child_process';
const args=process.argv.slice(2);if(args[0]==='create')await new Promise(resolve=>setTimeout(resolve,500));
const child=spawn('docker',args,{stdio:'inherit'});child.on('close',code=>process.exit(code??1));child.on('error',()=>process.exit(1));
