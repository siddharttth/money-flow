'use client';

import { useEffect, useRef } from 'react';
import { useReducedMotion } from './motion';

/**
 * BUBBLES YOU CAN PLAY WITH.
 *
 * The physics behind the dashboard's category bubbles, lifted out so the
 * landing page's picture of that dashboard behaves exactly like the real
 * one. The caller owns the layout and the look; this owns the motion.
 *
 * Bubbles start where the layout puts them and stay still until touched.
 * Then they can be grabbed and thrown, or flicked by a passing cursor, and
 * they bounce off the walls of their box and off each other, then settle.
 * The loop runs only while something moves and writes transforms straight
 * to the DOM, so a throw never re-renders anything. Reduced motion keeps the
 * dragging and drops the throw and the flick.
 *
 * Coordinates: x from the box's centre line, y from its top — so the layout
 * is right before the box has been measured, and stays centred after.
 */
export type BubbleLayout = { r: number; x: number; y: number };
type Body = { x: number; y: number; vx: number; vy: number; r: number; m: number };

const FRAME = 1000 / 60; // velocities are in px per 60 Hz frame
const BOUNCE = 0.82; // energy kept off a wall or another bubble
const DRAG_AIR = 0.985; // per frame; a throw crosses the box, then settles
const MAX_SPEED = 38;

export function useBubblePhysics(bubbles: BubbleLayout[], layoutKey: string) {
  const reduced = useReducedMotion();
  const box = useRef<HTMLDivElement>(null);
  const nodes = useRef<(HTMLSpanElement | null)[]>([]);
  const bodies = useRef<Body[]>([]);
  const frame = useRef(0);
  const last = useRef(0);
  const held = useRef<{ i: number; ox: number; oy: number; px: number; py: number; t: number; vx: number; vy: number } | null>(null);
  const hover = useRef<{ px: number; py: number; t: number } | null>(null);

  // New numbers, new layout: the bodies start over from it, as the DOM does.
  useEffect(() => {
    bodies.current = bubbles.map((b) => ({ x: b.x, y: b.y, vx: 0, vy: 0, r: b.r, m: b.r * b.r }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the serialised layout
  }, [layoutKey]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    // A narrower box pulls stray bubbles back inside it.
    const ro = new ResizeObserver(() => wake());
    ro.observe(el);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once; wake reads only refs
  }, []);

  function wake() {
    if (frame.current) return;
    last.current = performance.now();
    frame.current = requestAnimationFrame(tick);
  }

  function walls() {
    const el = box.current!;
    return { half: el.clientWidth / 2, height: el.clientHeight };
  }

  function place(i: number) {
    const b = bodies.current[i];
    const node = nodes.current[i];
    if (node) node.style.transform = `translate(${b.x - b.r}px, ${b.y - b.r}px)`;
  }

  function tick(now: number) {
    const bs = bodies.current;
    if (!box.current || !bs.length) {
      frame.current = 0;
      return;
    }
    const dt = Math.min(2, (now - last.current) / FRAME);
    last.current = now;
    const { half, height } = walls();
    const grabbed = held.current?.i ?? -1;
    const air = Math.pow(DRAG_AIR, dt);

    bs.forEach((b, i) => {
      if (i === grabbed) return;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      // Slow bubbles drag harder, so a throw ends in a settle, not a creep.
      const k = Math.hypot(b.vx, b.vy) < 1.5 ? air * Math.pow(0.93, dt) : air;
      b.vx *= k;
      b.vy *= k;
    });

    // Bubble against bubble: pushed apart by mass, then an elastic bounce
    // along the line between centres. A held bubble is immovable — it
    // shoves, it is not shoved.
    let crowded = false;
    for (let pass = 0; pass < 3; pass++) {
      for (let a = 0; a < bs.length; a++) {
        for (let c = a + 1; c < bs.length; c++) {
          const A = bs[a];
          const C = bs[c];
          const dx = C.x - A.x;
          const dy = C.y - A.y;
          const dist = Math.hypot(dx, dy) || 0.01;
          const overlap = A.r + C.r - dist;
          if (overlap <= 0) continue;
          if (overlap > 0.5) crowded = true;
          const nx = dx / dist;
          const ny = dy / dist;
          const ia = a === grabbed ? 0 : 1 / A.m;
          const ic = c === grabbed ? 0 : 1 / C.m;
          const sum = ia + ic;
          if (!sum) continue;
          A.x -= (nx * overlap * ia) / sum;
          A.y -= (ny * overlap * ia) / sum;
          C.x += (nx * overlap * ic) / sum;
          C.y += (ny * overlap * ic) / sum;
          const closing = (C.vx - A.vx) * nx + (C.vy - A.vy) * ny;
          if (pass === 0 && closing < 0) {
            const j = (-(1 + BOUNCE) * closing) / sum;
            A.vx -= j * ia * nx;
            A.vy -= j * ia * ny;
            C.vx += j * ic * nx;
            C.vy += j * ic * ny;
          }
        }
      }
    }

    let moving = grabbed >= 0 || crowded;
    bs.forEach((b, i) => {
      if (i !== grabbed) {
        if (b.x - b.r < -half) { b.x = -half + b.r; b.vx = Math.abs(b.vx) * BOUNCE; }
        if (b.x + b.r > half) { b.x = half - b.r; b.vx = -Math.abs(b.vx) * BOUNCE; }
        if (b.y - b.r < 0) { b.y = b.r; b.vy = Math.abs(b.vy) * BOUNCE; }
        if (b.y + b.r > height) { b.y = height - b.r; b.vy = -Math.abs(b.vy) * BOUNCE; }
        if (Math.hypot(b.vx, b.vy) < 0.04) { b.vx = 0; b.vy = 0; } else moving = true;
      }
      place(i);
    });

    frame.current = moving ? requestAnimationFrame(tick) : 0;
  }

  /** The pointer, in body coordinates. */
  function at(e: React.PointerEvent) {
    const r = box.current!.getBoundingClientRect();
    return { px: e.clientX - r.left - r.width / 2, py: e.clientY - r.top };
  }

  function grab(i: number, e: React.PointerEvent<HTMLSpanElement>) {
    const b = bodies.current[i];
    if (!b || e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const { px, py } = at(e);
    held.current = { i, ox: b.x - px, oy: b.y - py, px, py, t: e.timeStamp, vx: 0, vy: 0 };
    b.vx = 0;
    b.vy = 0;
    const node = nodes.current[i];
    if (node) {
      node.dataset.held = '';
      node.style.zIndex = '2';
    }
    wake();
  }

  function move(i: number, e: React.PointerEvent<HTMLSpanElement>) {
    const h = held.current;
    if (!h || h.i !== i) return;
    const b = bodies.current[i];
    const { px, py } = at(e);
    const { half, height } = walls();
    // Throw speed is the pointer's, smoothed over the last few moves.
    const k = FRAME / Math.max(1, e.timeStamp - h.t);
    h.vx = h.vx * 0.4 + (px - h.px) * k * 0.6;
    h.vy = h.vy * 0.4 + (py - h.py) * k * 0.6;
    h.px = px;
    h.py = py;
    h.t = e.timeStamp;
    b.x = Math.min(half - b.r, Math.max(-half + b.r, px + h.ox));
    b.y = Math.min(height - b.r, Math.max(b.r, py + h.oy));
    b.vx = h.vx;
    b.vy = h.vy;
    wake();
  }

  function release(i: number, e: React.PointerEvent<HTMLSpanElement>) {
    const h = held.current;
    if (!h || h.i !== i) return;
    const b = bodies.current[i];
    // Held still before letting go is a drop, not a throw.
    const paused = e.timeStamp - h.t > 80;
    const speed = Math.hypot(h.vx, h.vy);
    const scale = reduced || paused ? 0 : Math.min(1, MAX_SPEED / (speed || 1));
    b.vx = h.vx * scale;
    b.vy = h.vy * scale;
    held.current = null;
    const node = nodes.current[i];
    if (node) {
      delete node.dataset.held;
      node.style.zIndex = '';
    }
    wake();
  }

  // A cursor passing through a bubble nudges it along the way it was going.
  function flick(e: React.PointerEvent<HTMLElement>) {
    if (reduced || held.current || e.pointerType !== 'mouse') return;
    const { px, py } = at(e);
    const prev = hover.current;
    hover.current = { px, py, t: e.timeStamp };
    if (!prev) return;
    const k = FRAME / Math.max(1, e.timeStamp - prev.t);
    const vx = (px - prev.px) * k;
    const vy = (py - prev.py) * k;
    if (Math.hypot(vx, vy) < 1.5) return;
    let nudged = false;
    for (const b of bodies.current) {
      if (Math.hypot(px - b.x, py - b.y) > b.r) continue;
      b.vx = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, b.vx + vx * 0.3));
      b.vy = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, b.vy + vy * 0.3));
      nudged = true;
    }
    if (nudged) wake();
  }

  return {
    /** Spread on the box the bubbles move in. */
    boxProps: {
      ref: box,
      onPointerMove: flick,
      onPointerLeave: () => {
        hover.current = null;
      },
    },
    /** Spread on each bubble — the element whose transform the loop writes. */
    bubbleProps: (i: number) => ({
      ref: (n: HTMLSpanElement | null) => {
        nodes.current[i] = n;
      },
      onPointerDown: (e: React.PointerEvent<HTMLSpanElement>) => grab(i, e),
      onPointerMove: (e: React.PointerEvent<HTMLSpanElement>) => move(i, e),
      onPointerUp: (e: React.PointerEvent<HTMLSpanElement>) => release(i, e),
      onPointerCancel: (e: React.PointerEvent<HTMLSpanElement>) => release(i, e),
    }),
  };
}
