import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { LocalFileStore } from '../src/store.js';
import { Projects } from '../src/projects.js';
import { ProjectRulesStore } from '../src/project-rules-store.js';
import { apiDispatcher } from '../src/local-api.js';

test('project rule HTTP contract returns scoped context, replacement conflicts and owner 404',async()=> {
  const directory=await mkdtemp(path.join(os.tmpdir(),'open-design-project-rules-api-'));
  try {
    const store=new LocalFileStore(directory);
    const aliceProjects=new Projects(store,'alice');
    const project=await aliceProjects.create({value:'HTTP rules',designSystemId:'minimal-light'});
    const alice=apiDispatcher(aliceProjects,new ProjectRulesStore(store,'alice'));
    const bob=apiDispatcher(new Projects(store,'bob'),new ProjectRulesStore(store,'bob'));
    const url=`http://localhost:3000/api/v1/project-rules/${project.id}`;
    const save={kind:'use',part:'Button',markdown:'Use one primary action.'};
    assert.equal((await alice(url,{method:'PUT',body:JSON.stringify(save)})).status,200);
    const replacement={...save,markdown:'Use two primary actions.'};
    assert.equal((await alice(url,{method:'PUT',body:JSON.stringify(replacement)})).status,409);
    assert.equal((await bob(url,{method:'PUT',body:JSON.stringify(replacement)})).status,404);
    assert.equal((await bob(url)).status,404);
    const read=await alice(url+'?parts=Button');
    assert.equal(read.status,200);assert.equal((await read.json()).rules[0].markdown,save.markdown);
    assert.equal((await alice(url+'?parts=Input').then(r=>r.json())).rules.length,0);
    assert.equal((await alice(url,{method:'PUT',body:JSON.stringify({...replacement,replaceExisting:true})})).status,200);
    assert.equal((await alice(url+'?parts=Button').then(r=>r.json())).rules[0].markdown,replacement.markdown);
    assert.equal((await alice(url,{method:'POST'})).status,405);
  } finally {
    assert.ok(directory.startsWith(path.join(os.tmpdir(),'open-design-project-rules-api-')));
    await rm(directory,{recursive:true,force:true});
  }
});
