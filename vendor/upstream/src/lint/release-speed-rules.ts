import ts from "typescript";

/** Where a release handler settles with an animation that drops the gesture's speed. */
export interface ReleaseSpeedHit {
  node: ts.Node;
  fix: string;
}

// Handlers that run when a drag, swipe or flick lets go: Motion's onDragEnd and
// onPanEnd, the gesture-handler builder's onEnd and onFinalize, and the plain
// onRelease and onSwipeEnd names that hand-rolled gestures use.
const RELEASE_HANDLER = /^on(?:DragEnd|PanEnd|SwipeEnd|Release|End|Finalize)$/;

function propertyName(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  return null;
}

function objectProperty(object: ts.ObjectLiteralExpression, name: string): ts.Expression | null {
  for (const property of object.properties) {
    if (ts.isPropertyAssignment(property) && propertyName(property.name) === name) return property.initializer;
    if (ts.isShorthandPropertyAssignment(property) && property.name.text === name) return property.name;
  }
  return null;
}

function stringValue(expression: ts.Expression | null): string | null {
  return expression && (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression))
    ? expression.text
    : null;
}

function calleeName(call: ts.CallExpression): string | null {
  const callee = call.expression;
  if (ts.isIdentifier(callee)) return callee.text;
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
  return null;
}

function hasSpread(object: ts.ObjectLiteralExpression): boolean {
  return object.properties.some(ts.isSpreadAssignment);
}

function hasAny(object: ts.ObjectLiteralExpression, names: string[]): boolean {
  return names.some((name) => objectProperty(object, name) !== null);
}

/**
 * A Motion transition drops the release speed when it is a tween (a duration or
 * an ease with no spring type) or a spring set by duration or bounce. Motion
 * sets a time-defined spring's velocity to 0 even when the transition passes
 * one (motion-dom, animation/generators/spring.mjs), so only a physics spring
 * (stiffness, damping or mass) keeps the drag's current speed.
 */
function motionTransitionDropsSpeed(transition: ts.ObjectLiteralExpression): boolean {
  if (hasSpread(transition)) return false;
  const type = stringValue(objectProperty(transition, "type"));
  if (type === "inertia" || type === "decay") return false;
  const physics = hasAny(transition, ["stiffness", "damping", "mass"]);
  if (type === "spring" || physics) return !physics && hasAny(transition, ["duration", "bounce"]);
  return hasAny(transition, ["duration", "ease"]);
}

const MOTION_FIX = "Settle with a physics spring, { type: \"spring\", stiffness, damping }, which carries the drag's current speed. A tween or a spring set by duration and bounce starts from zero.";

function settleHit(call: ts.CallExpression): ReleaseSpeedHit | null {
  const name = calleeName(call);
  if (name === "withTiming") {
    return { node: call, fix: "Settle with withSpring(target, { velocity: event.velocityX }) or withDecay, so the release speed carries into place." };
  }
  if (name === "withSpring") {
    const config = call.arguments[1];
    if (config && (!ts.isObjectLiteralExpression(config) || hasSpread(config) || objectProperty(config, "velocity"))) return null;
    return { node: call, fix: "Pass the release speed: withSpring(target, { velocity: event.velocityX }). The velocity defaults to 0." };
  }
  // Only Motion's own animate(value, target, options): a two-argument call can be
  // the browser's element.animate(keyframes, options), which no drag hands a speed.
  if (name === "animate" && ts.isIdentifier(call.expression)) {
    const options = call.arguments[2];
    if (options && ts.isObjectLiteralExpression(options) && motionTransitionDropsSpeed(options)) {
      return { node: call, fix: MOTION_FIX };
    }
    return null;
  }
  if (name === "start") {
    const target = call.arguments[0];
    const transition = target && ts.isObjectLiteralExpression(target) ? objectProperty(target, "transition") : null;
    if (transition && ts.isObjectLiteralExpression(transition) && motionTransitionDropsSpeed(transition)) {
      return { node: call, fix: MOTION_FIX };
    }
  }
  return null;
}

// Gestures that end without a flick: a press-state reset after a tap is not a release that drops speed.
const STILL_GESTURE = /^(?:Tap|LongPress|Hover|Native|Manual|ForceTouch)$/;

/** The gesture a builder chain such as Gesture.Tap().onEnd(...) starts from, when it names one. */
function builderGesture(expression: ts.Expression): string | null {
  let current: ts.Expression = expression;
  while (ts.isCallExpression(current) || ts.isPropertyAccessExpression(current)) {
    if (ts.isCallExpression(current) && ts.isPropertyAccessExpression(current.expression)
      && ts.isIdentifier(current.expression.expression) && current.expression.expression.text === "Gesture") {
      return current.expression.name.text;
    }
    current = current.expression;
  }
  return null;
}

/**
 * The body of a release handler, or null. A handler passed by reference, such as
 * onDragEnd={handleEnd}, is not followed to its declaration, so it is never scanned.
 */
function releaseHandler(node: ts.Node): ts.Node | null {
  if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name) && RELEASE_HANDLER.test(node.name.text)) {
    const value = node.initializer;
    return value && ts.isJsxExpression(value) && value.expression ? value.expression : null;
  }
  if (ts.isPropertyAssignment(node) && RELEASE_HANDLER.test(propertyName(node.name) ?? "")) return node.initializer;
  if (ts.isMethodDeclaration(node) && RELEASE_HANDLER.test(propertyName(node.name) ?? "")) return node.body ?? null;
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
    && RELEASE_HANDLER.test(node.expression.name.text)) {
    if (STILL_GESTURE.test(builderGesture(node.expression.expression) ?? "")) return null;
    return node.arguments[0] ?? null;
  }
  return null;
}

/**
 * Finds every animation inside a drag release handler that settles the element
 * without the gesture's speed: Reanimated's withTiming, a withSpring with no velocity, and a
 * Motion tween or duration-based spring.
 */
export function releaseSpeedHits(source: ts.SourceFile): ReleaseSpeedHit[] {
  const hits: ReleaseSpeedHit[] = [];
  const seen = new Set<ts.Node>();

  function scan(node: ts.Node): void {
    if (ts.isCallExpression(node) && !seen.has(node)) {
      const hit = settleHit(node);
      if (hit) {
        seen.add(node);
        hits.push(hit);
      }
    }
    ts.forEachChild(node, scan);
  }

  function visit(node: ts.Node): void {
    const handler = releaseHandler(node);
    if (handler) scan(handler);
    ts.forEachChild(node, visit);
  }

  visit(source);
  return hits;
}
