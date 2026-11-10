import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {AjvJsonSchemaValidator} from '@modelcontextprotocol/sdk/validation/ajv-provider.js';

test('prepared registry metadata validates against the retrieved official schema and package version',async()=>{
  const read=async(path:string)=>JSON.parse(await readFile(new URL('../'+path,import.meta.url),'utf8'));
  const schema=await read('docs/reference/mcp-server.schema.json'),server=await read('server.json'),npm=await read('package.json');
  const validate=new AjvJsonSchemaValidator().getValidator(schema);
  const result=validate(server);assert.equal(result.valid,true,JSON.stringify(result));
  assert.equal(server.name,npm.mcpName);assert.equal(server.version,npm.version);assert.equal(server.packages[0].version,npm.version);assert.equal(server.packages[0].identifier,npm.name);
  assert.equal(validate({...server,name:'invalid namespace'}).valid,false);
  assert.equal(server.$schema,schema.$id);
});
