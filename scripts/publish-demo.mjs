import { execFileSync } from 'node:child_process';
import { mkdtemp, cp, readdir, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
const project=fileURLToPath(new URL('..',import.meta.url)),directory=await mkdtemp(join(tmpdir(),'brandos-pages-'));
const git=(args,cwd=project)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
try{
 execFileSync(process.execPath,['scripts/build-demo.mjs'],{cwd:project,stdio:'inherit'});
 const origin=git(['remote','get-url','origin']);
 const previous=git(['ls-remote',origin,'refs/heads/gh-pages']);
 git(['init','--initial-branch=gh-pages'],directory);git(['remote','add','origin',origin],directory);
 git(['config','user.name',git(['config','user.name'])],directory);git(['config','user.email',git(['config','user.email'])],directory);
 if(previous){
  git(['fetch','--depth=1','origin','gh-pages'],directory);git(['checkout','--detach','FETCH_HEAD'],directory);
  if((await readFile(join(directory,'.brandos-demo'),'utf8')).trim()!=='BrandOS static demo v1')throw new Error('Existing gh-pages branch is not managed by this demo; refusing to replace it');
  for(const name of await readdir(directory))if(name!=='.git')await rm(join(directory,name),{recursive:true,force:true});
 }
 for(const name of await readdir(join(project,'dist')))await cp(join(project,'dist',name),join(directory,name),{recursive:true});
 git(['add','.'],directory);
 if(git(['status','--porcelain'],directory)){git(['commit','-m','Publish BrandOS browser demo'],directory);git(['push','origin','HEAD:refs/heads/gh-pages'],directory)}
 console.log('Static artifact pushed to gh-pages. This is not confirmation that Pages is enabled or the public URL is live.');
}finally{await rm(directory,{recursive:true,force:true})}
