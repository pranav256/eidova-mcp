export const captureScript = () => {
  const style = (element: Element) => {
    const computed = getComputedStyle(element);
    const radius = (value: string) => ({ horizontal: parseFloat(value) || 0, vertical: parseFloat(value) || 0 });
    return {
      display: computed.display,
      position: computed.position,
      overflowX: computed.overflowX,
      overflowY: computed.overflowY,
      padding: { top: parseFloat(computed.paddingTop) || 0, right: parseFloat(computed.paddingRight) || 0, bottom: parseFloat(computed.paddingBottom) || 0, left: parseFloat(computed.paddingLeft) || 0 },
      margin: { top: parseFloat(computed.marginTop) || 0, right: parseFloat(computed.marginRight) || 0, bottom: parseFloat(computed.marginBottom) || 0, left: parseFloat(computed.marginLeft) || 0 },
      borderRadius: { topLeft: radius(computed.borderTopLeftRadius), topRight: radius(computed.borderTopRightRadius), bottomRight: radius(computed.borderBottomRightRadius), bottomLeft: radius(computed.borderBottomLeftRadius) },
      color: computed.color,
      backgroundColor: computed.backgroundColor,
      fontSize: computed.fontSize,
      fontWeight: computed.fontWeight,
      lineHeight: computed.lineHeight,
      textAlign: computed.textAlign,
    };
  };
  const elements = [...document.querySelectorAll('body *')].filter(element => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && getComputedStyle(element).display !== 'none';
  }).slice(0, 1500);
  return {
    name: document.title || location.pathname,
    viewport: { width: innerWidth, height: innerHeight },
    platform: 'web',
    elements: elements.map((element, index) => {
      const rect = element.getBoundingClientRect();
      return { id: 'e' + index, tag: element.tagName.toLowerCase(), parentId: element.parentElement ? 'e' + elements.indexOf(element.parentElement) : undefined, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, style: style(element) };
    }),
  };
};
