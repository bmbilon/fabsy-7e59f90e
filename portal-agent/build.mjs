import {build} from 'esbuild';
await build({entryPoints:['src/phone.ts'],bundle:true,minify:true,format:'esm',target:'es2022',outfile:'dist/phone.txt'});
