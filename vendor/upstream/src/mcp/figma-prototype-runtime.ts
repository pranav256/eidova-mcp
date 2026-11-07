/**
 * The one script a model-mode prototype runs. A prototype should feel like the
 * real product, so its tabs switch, its menus pick an option, its dialogs open
 * and its segmented controls and pagination move. On a phone, a menu button
 * opens the sidebar the layout CSS folds away (`data-toggle-open`). [BD-1075] The model never writes a
 * script: it marks behaviour with the `data-` attributes below, and this fixed
 * runtime, written and reviewed here, gives them effect. The page's Content
 * Security Policy allows this script by its SHA-256 hash and nothing else, so
 * anything the model wrote stays inert. Native HTML covers the rest: `<input>`,
 * `<select>`, `<details>`, and `popover` with `popovertarget`. [BD-1073] The browser draws a
 * popover in the middle of the screen, so the runtime places each one against the button that
 * opened it: below it, above it when the space below is short, inside the screen edge, and as
 * wide as the button when the button shows a picked value (`data-option-label`). [BD-1082] It measures
 * the page's zoom first, because a zoomed page scales the lengths the runtime sets. [BD-1056]
 *
 * Figma's prototype links run here too: each `data-go` list moves between the
 * `data-node` screens with the designer's transition, opens an overlay, goes
 * back or runs on a timer, and a reader who asks for less motion gets the change
 * at once. [BD-1299]
 *
 * Changing one character of the script changes its hash. The test in
 * `figma-model.test.ts` recomputes it, so update `PROTOTYPE_RUNTIME_HASH`
 * whenever the script changes.
 */
export const PROTOTYPE_RUNTIME = `(()=>{
const d=document;
const on=(sel,fn)=>d.addEventListener("click",(e)=>{const t=e.target instanceof Element?e.target.closest(sel):null;if(t)fn(t,e);});
const byId=(id)=>id?d.getElementById(id):null;
on("[data-tab],.ds-tab",(tab)=>{
  const group=tab.closest("[data-tabs],.ds-tabs,[role=tablist]")||tab.parentElement;
  if(!group)return;
  for(const other of group.querySelectorAll("[data-tab],.ds-tab")){
    const active=other===tab;
    other.classList.toggle("active",active);
    other.setAttribute("aria-selected",String(active));
    const name=other.getAttribute("data-tab");
    if(!name)continue;
    for(const panel of d.querySelectorAll("[data-tab-panel]")){if(panel.getAttribute("data-tab-panel")===name)panel.hidden=!active;}
  }
});
on("[data-toggle-group] button,[data-toggle-group] [role=button]",(item)=>{
  const group=item.closest("[data-toggle-group]");
  const items=[...group.querySelectorAll("button,[role=button]")].filter((el)=>!el.hasAttribute("data-step"));
  let next=item;
  const step=Number(item.getAttribute("data-step"));
  if(step){
    const current=items.findIndex((el)=>el.classList.contains("active"));
    next=items[Math.min(items.length-1,Math.max(0,current+step))];
  }
  for(const el of items){const active=el===next;el.classList.toggle("active",active);el.setAttribute("aria-pressed",String(active));}
});
on(".ds-switch",(control)=>{
  const track=control.querySelector(".ds-switch-track")||control;
  const checked=!track.classList.contains("on");
  track.classList.toggle("on",checked);
  control.setAttribute("aria-checked",String(checked));
});
on("[data-dialog-open]",(button)=>{
  const target=byId(button.getAttribute("data-dialog-open"));
  if(target&&typeof target.showModal==="function"&&!target.open)target.showModal();
  else if(target)target.hidden=false;
});
on("[data-dialog-close]",(button)=>{
  const dialog=button.closest("dialog");
  if(dialog)dialog.close();
});
on("[data-toggle]",(button)=>{
  const target=byId(button.getAttribute("data-toggle"));
  if(!target)return;
  target.hidden=!target.hidden;
  button.setAttribute("aria-expanded",String(!target.hidden));
});
on("[data-toggle-open]",(button)=>{
  const target=byId(button.getAttribute("data-toggle-open"));
  if(!target)return;
  const open=!target.hasAttribute("data-open");
  target.toggleAttribute("data-open",open);
  button.setAttribute("aria-expanded",String(open));
});
const opener=new Map();
const triggerOf=(pop)=>pop.id?opener.get(pop.id)||d.querySelector("[popovertarget=\\""+CSS.escape(pop.id)+"\\"]"):null;
on("[popovertarget]",(button)=>opener.set(button.getAttribute("popovertarget"),button));
on("[popover] [data-option]",(option)=>{
  const popover=option.closest("[popover]");
  for(const other of popover.querySelectorAll("[data-option]"))other.setAttribute("aria-selected",String(other===option));
  const trigger=triggerOf(popover);
  const label=trigger&&(trigger.querySelector("[data-option-label]")||trigger);
  if(label)label.textContent=option.textContent.trim();
  if(typeof popover.hidePopover==="function")popover.hidePopover();
});
const place=(pop)=>{
  const trigger=triggerOf(pop);
  const r=trigger&&trigger.getBoundingClientRect();
  if(!r||(!r.width&&!r.height))return;
  const vw=d.documentElement.clientWidth||innerWidth,vh=innerHeight,s=pop.style,edge=8,gap=4,scrolled=pop.scrollTop;
  s.position="fixed";s.inset="auto";s.margin="0";s.maxHeight="";s.overflowY="";s.top="0px";s.left="0px";
  const origin=pop.getBoundingClientRect().left;s.left="100px";
  const k=(pop.getBoundingClientRect().left-origin)/100||1,px=(n)=>n/k+"px";
  if(trigger.querySelector("[data-option-label]"))s.width=px(Math.min(Math.max(r.width,(parseFloat(getComputedStyle(pop).minWidth)||0)*k),vw-2*edge));
  const h=pop.offsetHeight*k,below=vh-r.bottom-gap-edge,above=r.top-gap-edge;
  if(h<=below||below>=above){s.top=px(r.bottom+gap);if(h>below){s.maxHeight=px(below);s.overflowY="auto";}}
  else{s.top=px(r.top-gap-Math.min(h,above));if(h>above){s.maxHeight=px(above);s.overflowY="auto";}}
  s.left=px(Math.max(edge,Math.min(r.left,vw-edge-pop.offsetWidth*k)));
  pop.scrollTop=scrolled;
};
const shown=new Set();
const isPopover=(t)=>t instanceof HTMLElement&&t.hasAttribute("popover");
d.addEventListener("beforetoggle",(e)=>{if(isPopover(e.target)&&e.newState==="open")e.target.style.opacity="0";},true);
d.addEventListener("toggle",(e)=>{
  const pop=e.target;
  if(!isPopover(pop))return;
  if(e.newState!=="open"){shown.delete(pop);return;}
  shown.add(pop);
  place(pop);
  pop.style.opacity="";
},true);
const again=(e)=>{for(const pop of shown)if(!(e&&e.target instanceof Node&&pop.contains(e.target)))place(pop);};
addEventListener("resize",again);
d.addEventListener("scroll",again,true);
const links=(el)=>{try{const list=JSON.parse(el.getAttribute("data-go")||"[]");return Array.isArray(list)?list:[];}catch(error){return[];}};
const nodeOf=(id)=>id?d.querySelector("[data-node='"+CSS.escape(String(id))+"']"):null;
const still=()=>typeof matchMedia==="function"&&matchMedia("(prefers-reduced-motion: reduce)").matches;
const linked=[...d.querySelectorAll("[data-go]")];
const goals=new Set();
for(const el of linked)for(const a of links(el))if((a.do==="navigate"||a.do==="swap")&&a.to)goals.add(a.to);
const first=[...goals].map(nodeOf).find(Boolean);
const stage=first?first.parentElement:null;
const screens=stage?[...stage.children].filter((el)=>el.hasAttribute("data-node")):[];
let current=screens[0]||null;
const past=[],overlays=[];let running=[];let timers=[];
const EDGE={LEFT:[1,0],RIGHT:[-1,0],TOP:[0,1],BOTTOM:[0,-1]};
const shift=(dir,f)=>{const v=EDGE[dir]||EDGE.LEFT;return"translate("+v[0]*f*100+"%,"+v[1]*f*100+"%)";};
const settle=()=>{const list=running;running=[];for(const a of list)a.finish();};
const play=(el,frames,t)=>{if(typeof el.animate!=="function")return null;const a=el.animate(frames,{duration:t.ms,easing:t.ease,fill:"both"});running.push(a);return a;};
const timing=(t)=>t&&!still()&&t.ms>0&&t.k!=="instant"?t:null;
const fit=(screen)=>{stage.style.width=screen.style.width;stage.style.height=screen.style.height;};
const arm=(screen)=>{for(const id of timers)clearTimeout(id);timers=[];
  for(const el of [screen,...screen.querySelectorAll("[data-go]")])if(!el.closest("[data-vg][hidden]"))for(const a of links(el))if(a.on==="timeout")timers.push(setTimeout(()=>{if(current===screen&&!overlays.length&&!el.closest("[data-vg][hidden]"))act(a,el);},a.after||0));};
const member=(el,to)=>{
  for(let g=el.closest("[data-vg]");g;g=g.parentElement&&g.parentElement.closest("[data-vg]")){
    const id=g.getAttribute("data-vg"),next=g.parentElement&&[...g.parentElement.children].find((m)=>m.getAttribute("data-vg")===id&&m.getAttribute("data-variant")===to);
    if(next)return[g,next];
  }
  return null;
};
const held=new Map();
const vary=(a,el)=>{
  const pair=member(el,a.to);
  if(!pair){console.warn("Better Design prototype: no variant "+a.to+" sits beside this layer, so its change to link does nothing.");return;}
  if(pair[0]===pair[1])return;
  const[from,to]=pair;from.hidden=true;to.hidden=false;
  const tt=timing(a.t);
  if(tt&&typeof to.animate==="function")to.animate([{opacity:0},{opacity:1}],{duration:tt.ms,easing:tt.ease});
  if(a.on==="hover"||a.on==="press")held.set(to,{from,on:a.on});
  for(const x of [to,...to.querySelectorAll("[data-go]")])for(const b of links(x))if(b.on==="timeout")timers.push(setTimeout(()=>{if(!x.closest("[data-vg][hidden]"))act(b,x);},b.after||0));
};
const undo=(when,leaving,e)=>{for(const[to,h]of[...held]){
  if(h.on!==when||(leaving&&(!to.contains(e.target)||to.contains(e.relatedTarget))))continue;
  held.delete(to);if(to.hidden)continue;to.hidden=true;h.from.hidden=false;}};
const morph=(from,to,t)=>{
  const named=(root)=>{const m=new Map();for(const el of root.querySelectorAll("[data-layer]")){const n=el.getAttribute("data-layer");m.set(n,m.has(n)?null:el);}return m;};
  const before=named(from),moved=[];
  for(const [name,el] of named(to)){
    const old=before.get(name);
    if(!el||!old||moved.length>=80||moved.some((p)=>p.contains(el)))continue;
    const a=old.getBoundingClientRect(),b=el.getBoundingClientRect();
    if(!b.width||!b.height)continue;
    const dx=a.left-b.left,dy=a.top-b.top,sx=a.width/b.width,sy=a.height/b.height;
    if(Math.abs(dx)<1&&Math.abs(dy)<1&&Math.abs(sx-1)<0.01&&Math.abs(sy-1)<0.01)continue;
    moved.push(el);
    play(el,[{transformOrigin:"0 0",transform:"translate("+dx+"px,"+dy+"px) scale("+sx+","+sy+")"},{transformOrigin:"0 0",transform:"none"}],t);
  }
};
const show=(to,t,remember)=>{
  settle();
  if(!stage||!to||to===current)return;
  const from=current;current=to;
  if(remember)past.push({el:from,t});
  to.hidden=false;fit(to);scrollTo(0,0);arm(to);
  const tt=timing(t);
  if(!tt){from.hidden=true;return;}
  const k=tt.k,mine=[];
  const anim=(el,frames)=>{const a=play(el,frames,tt);if(a)mine.push(a);};
  if(k==="move-out"||k==="slide-out")from.style.zIndex="2";else to.style.zIndex="2";
  if(k==="move-in"||k==="push"||k==="slide-in")anim(to,[{transform:shift(tt.dir,1)},{transform:"none"}]);
  if(k==="slide-out")anim(to,[{transform:shift(tt.dir,0.3)},{transform:"none"}]);
  if(k==="move-out"||k==="push"||k==="slide-out")anim(from,[{transform:"none"},{transform:shift(tt.dir,-1)}]);
  if(k==="slide-in")anim(from,[{transform:"none"},{transform:shift(tt.dir,-0.3)}]);
  if(k==="dissolve"||k==="smart")anim(to,[{opacity:0},{opacity:1}]);
  if(k==="smart")morph(from,to,tt);
  const done=()=>{if(current!==from)from.hidden=true;from.style.zIndex="";to.style.zIndex="";for(const a of mine)a.cancel();};
  if(mine.length)mine[0].finished.then(done,done);else done();
};
const REVERSE={"move-in":"move-out","move-out":"move-in","slide-in":"slide-out","slide-out":"slide-in"};
const OPPOSITE={LEFT:"RIGHT",RIGHT:"LEFT",TOP:"BOTTOM",BOTTOM:"TOP"};
const close=(box)=>{if(!box)return;const i=overlays.indexOf(box);if(i>=0)overlays.splice(i,1);if(box.open)box.close();box.remove();};
const overlay=(to,t,at)=>{
  const box=d.createElement("dialog");box.className="bd-overlay";
  const copy=to.cloneNode(true);copy.hidden=false;copy.removeAttribute("data-node");
  copy.style.position="relative";copy.style.left="0";copy.style.top="0";copy.style.zIndex="";
  box.appendChild(copy);
  (to.closest("[data-ds]")||d.body).appendChild(box);
  if(at&&current){const r=current.getBoundingClientRect();box.style.margin="0";box.style.left=r.left+at.x+"px";box.style.top=r.top+at.y+"px";}
  box.addEventListener("click",(e)=>{if(e.target===box)close(box);});
  box.addEventListener("cancel",(e)=>{e.preventDefault();close(box);});
  if(typeof box.showModal==="function")box.showModal();else box.setAttribute("open","");
  overlays.push(box);
  const tt=timing(t);
  if(tt)play(copy,tt.k==="move-in"||tt.k==="push"||tt.k==="slide-in"?[{transform:shift(tt.dir,0.3),opacity:0},{transform:"none",opacity:1}]:[{opacity:0,transform:"scale(0.97)"},{opacity:1,transform:"none"}],tt);
};
const back=()=>{
  if(overlays.length)return close(overlays[overlays.length-1]);
  const last=past.pop();
  if(!last)return;
  const t=last.t?Object.assign({},last.t,{k:REVERSE[last.t.k]||last.t.k,dir:OPPOSITE[last.t.dir]||last.t.dir}):null;
  show(last.el,t,false);
};
const act=(a,el)=>{
  if(a.do==="back")return back();
  if(a.do==="close")return close(el.closest(".bd-overlay")||overlays[overlays.length-1]);
  if(a.do==="url"){if(/^https?:[/][/]/i.test(a.url||""))open(a.url,"_blank","noopener");return;}
  if(a.do==="change")return vary(a,el);
  const to=nodeOf(a.to);
  if(!to)return;
  if(a.do==="scroll")return to.scrollIntoView({behavior:still()?"auto":"smooth"});
  if(a.do==="overlay")return overlay(to,a.t,a.at);
  if(a.do==="swap"&&overlays.length){close(overlays[overlays.length-1]);return overlay(to,a.t,a.at);}
  if(stage&&to.parentElement===stage)return show(to,a.t,a.do!=="swap");
  to.scrollIntoView();
};
const run=(start,when,e)=>{
  for(let el=start;el;el=el.parentElement&&el.parentElement.closest("[data-go]")){
    const mine=links(el).filter((a)=>when.includes(a.on));
    if(!mine.length)continue;
    if(e&&e.preventDefault)e.preventDefault();
    for(const a of mine)act(a,el);
    return true;
  }
  return false;
};
const goOf=(t)=>t instanceof Element?t.closest("[data-go]"):null;
d.addEventListener("click",(e)=>run(goOf(e.target),["click"],e));
d.addEventListener("keydown",(e)=>{if((e.key==="Enter"||e.key===" ")&&e.target instanceof Element&&e.target.hasAttribute("data-go")&&!e.target.matches("button,a,input,select,textarea"))run(e.target,["click"],e);});
d.addEventListener("pointerover",(e)=>{const el=goOf(e.target);if(el&&!el.contains(e.relatedTarget))run(el,["hover","enter"]);});
d.addEventListener("pointerout",(e)=>{undo("hover",true,e);const el=goOf(e.target);if(!el||el.contains(e.relatedTarget))return;
  for(const a of links(el)){if(a.on==="leave")act(a,el);else if(a.on==="hover"&&a.do!=="change")back();}});
d.addEventListener("pointerdown",(e)=>run(goOf(e.target),["press"]));
d.addEventListener("pointerup",(e)=>undo("press",false,e));
d.addEventListener("pointercancel",(e)=>undo("press",false,e));
for(const el of linked){
  if(!links(el).some((a)=>a.on==="click")||el.matches("button,a,input,select,textarea,[tabindex]"))continue;
  el.tabIndex=0;if(!el.hasAttribute("role"))el.setAttribute("role","button");
}
if(stage&&current){
  stage.style.position=stage.style.position==="absolute"?"absolute":"relative";stage.style.overflow="hidden";
  for(const el of screens){el.style.position="absolute";el.style.left="0px";el.style.top="0px";el.hidden=el!==current;}
  fit(current);arm(current);
}
})();`

/** The base64 SHA-256 of `PROTOTYPE_RUNTIME`, as the page's Content Security Policy names it. */
export const PROTOTYPE_RUNTIME_HASH = "sha256-nmPCk2KBEbYArtRFN+JOMwfCiuc52cgk4FN73eSoYX0="
