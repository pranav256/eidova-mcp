// shortcut: samples solid ancestor colors; use rendered pixels for text over images or gradients.
export function measureTextContrast() {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
  const paint=canvas.getContext('2d',{willReadFrequently:true});
  const luminance=()=>{const values=[...paint.getImageData(0,0,1,1).data].slice(0,3).map(value=>{value/=255;return value<=0.04045?value/12.92:((value+0.055)/1.055)**2.4;});return values[0]*0.2126+values[1]*0.7152+values[2]*0.0722;};
  const candidates=[...document.body.querySelectorAll('*')].filter(node=>{
    const style=getComputedStyle(node);
    return (node.matches('input,textarea')||[...node.childNodes].some(child=>child.nodeType===3&&child.textContent.trim()))&&!node.closest('[aria-hidden="true"],button:disabled,script,style')&&node.getBoundingClientRect().height>0&&style.clip!=='rect(0px, 0px, 0px, 0px)'&&style.clipPath!=='inset(50%)';
  });
  return candidates.flatMap(node=>{
    const style=getComputedStyle(node),size=parseFloat(style.fontSize),weight=parseInt(style.fontWeight);
    const minimum=size>=24||(size>=18.6667&&weight>=700)?3:4.5;
    const colors=[{text:(node.value||node.textContent).trim().slice(0,80),color:style.color}];
    if(node.matches('input[placeholder]')&&!node.value)colors.push({text:node.placeholder,color:getComputedStyle(node,'::placeholder').color});
    return colors.map(({text,color})=>{
      paint.clearRect(0,0,1,1);paint.fillStyle='white';paint.fillRect(0,0,1,1);
      const ancestors=[];for(let parent=node;parent;parent=parent.parentElement)ancestors.unshift(parent);
      for(const ancestor of ancestors){paint.fillStyle=getComputedStyle(ancestor).backgroundColor;paint.fillRect(0,0,1,1);}
      const background=luminance();paint.fillStyle=color;paint.fillRect(0,0,1,1);const foreground=luminance();
      return {text,selector:node.id?'#'+node.id:node.tagName.toLowerCase()+'.'+[...node.classList].slice(0,2).join('.'),ratio:(Math.max(background,foreground)+0.05)/(Math.min(background,foreground)+0.05),minimum};
    });
  });
}
