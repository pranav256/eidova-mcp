import {z} from 'zod';

const dimension=z.object({value:z.number(),unit:z.enum(['px','rem'])});
const color=z.object({colorSpace:z.literal('oklch'),components:z.tuple([z.number().min(0).max(1),z.number().min(0),z.number().min(0).max(360)]),alpha:z.number().min(0).max(1).optional(),hex:z.string().regex(/^#[a-f\d]{6}$/i).optional()});
const shadow=z.object({color,offsetX:dimension,offsetY:dimension,blur:dimension,spread:dimension,inset:z.boolean().optional()});
const values:Record<string,z.ZodType>={color,dimension,shadow:z.union([shadow,z.array(shadow).min(1)]),fontFamily:z.union([z.string().min(1),z.array(z.string().min(1)).min(1)]),fontWeight:z.number().min(1).max(1000),duration:z.object({value:z.number(),unit:z.enum(['ms','s'])}),cubicBezier:z.tuple([z.number().min(0).max(1),z.number(),z.number().min(0).max(1),z.number()]),number:z.number()};
type Token=Record<string,unknown>&{$value:unknown;$type?:string};

/** Keep valid typed tokens and aliases; retain unsupported CSS as extension data. */
export function normalizeDtcg(input:string) {
  const document=JSON.parse(input) as Record<string,unknown>;
  const tokens=new Map<string,{token:Token;parent:Record<string,unknown>;key:string;mode?:string;original:Token}>();
  function collect(group:Record<string,unknown>,path:string[]=[],mode?:string) {
    for(const[key,value]of Object.entries(group)) {
      if(key.startsWith('$')||!value||typeof value!=='object'||Array.isArray(value))continue;
      const node=value as Record<string,unknown>,next=[...path,key];
      if(Object.hasOwn(node,'$value'))tokens.set(next.join('.'),{token:node as Token,parent:group,key,mode,original:structuredClone(node) as Token});
      else collect(node,next,(node.$extensions as Record<string,unknown>|undefined)?.['com.better-design.mode']==='dark'?next.join('.'):mode);
    }
  }
  collect(document);
  const resolved=new Map<string,string|undefined>(),visiting=new Set<string>();let aliases=0;
  function resolve(path:string):string|undefined {
    if(resolved.has(path))return resolved.get(path);
    if(visiting.has(path))return;
    visiting.add(path);
    const entry=tokens.get(path)!;const {token,mode}=entry;
    const variable=typeof token.$value==='string'?token.$value.match(/^var\((--[\w-]+)\)$/)?.[1]:undefined;
    let type:string|undefined;
    if(variable) {
      const name=variable.slice(2).split('-').filter(Boolean).join('.');
      const target=[...(mode?[mode+'.'+name,mode+'.'+name+'.DEFAULT']:[]),name,name+'.DEFAULT'].find(candidate=>tokens.has(candidate));
      type=target?resolve(target):undefined;
      if(type){token.$type=type;token.$value=`{${target}}`;aliases++;}
    } else if(token.$type&&Object.hasOwn(values,token.$type)&&values[token.$type].safeParse(token.$value).success&&!/\b(?:var|calc)\(/.test(JSON.stringify(token.$value)))type=token.$type;
    visiting.delete(path);resolved.set(path,type);return type;
  }
  const unsupported:Record<string,Token>=Object.create(null);
  for(const[path,entry]of tokens)if(!resolve(path)){unsupported[path]=entry.original;delete entry.parent[entry.key];}
  delete document.$schema;
  document.$extensions={...(document.$extensions as Record<string,unknown>??{}),'org.eidova.export':{formatVersion:'2025.10',unsupported}};
  return {document,report:{formatVersion:'2025.10',typedTokens:tokens.size-Object.keys(unsupported).length,aliases,unsupportedTokens:Object.keys(unsupported).length}};
}
