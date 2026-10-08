import { useEffect, useRef } from "react";

/**
 * Cursor effects for public pages (mouse / pen only, off for reduced-motion):
 *  - a glowing "heartbeat thread" trail that follows the pointer and fades out
 *  - sparks that fly off when you move fast
 *  - a ring around the cursor that grows and fills over links & buttons, shrinks on click
 *  - magnetic pull on elements with the `magnetic` class
 *  - feeds --mx / --my to `.spotlight` cards
 */
export function CursorFX() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)").matches;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!fine || reduce) return;
    const canvas = canvasRef.current!, ring = ringRef.current!, dot = dotRef.current!;
    const ctx = canvas.getContext("2d")!;
    let w = 0, h = 0, raf = 0, t = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pos = { x: -100, y: -100 }, ringPos = { x: -100, y: -100 };
    let hover = false, down = false, visible = false;
    const trail: { x: number; y: number; life: number }[] = [];
    const sparks: { x: number; y: number; vx: number; vy: number; life: number; hue: number }[] = [];
    let magnet: HTMLElement | null = null;

    const resize = () => {
      w = window.innerWidth; h = window.innerHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const onMove = (e: PointerEvent) => {
      const dx = e.clientX - pos.x, dy = e.clientY - pos.y;
      const speed = Math.hypot(dx, dy);
      pos.x = e.clientX; pos.y = e.clientY;
      visible = true;
      trail.push({ x: pos.x, y: pos.y, life: 1 });
      if (trail.length > 42) trail.shift();
      if (speed > 18 && sparks.length < 80) {
        for (let i = 0; i < 2; i++) sparks.push({ x: pos.x, y: pos.y, vx: (Math.random() - 0.5) * 3 - dx * 0.04, vy: (Math.random() - 0.5) * 3 - dy * 0.04, life: 1, hue: Math.random() < 0.7 ? 172 : 43 });
      }
      const target = e.target as HTMLElement;
      hover = !!target.closest?.("a, button, [role=button], input, select, textarea, summary, .spotlight");
      const spot = target.closest?.(".spotlight") as HTMLElement | null;
      if (spot) {
        const r = spot.getBoundingClientRect();
        spot.style.setProperty("--mx", `${e.clientX - r.left}px`);
        spot.style.setProperty("--my", `${e.clientY - r.top}px`);
      }
      // magnetic buttons
      const m = target.closest?.(".magnetic") as HTMLElement | null;
      if (magnet && magnet !== m) { magnet.style.transform = ""; }
      magnet = m;
      if (m) {
        const r = m.getBoundingClientRect();
        const mx = (e.clientX - (r.left + r.width / 2)) * 0.25, my = (e.clientY - (r.top + r.height / 2)) * 0.35;
        m.style.transform = `translate(${mx}px, ${my}px)`;
      }
    };
    const onDown = () => {
      down = true;
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        sparks.push({ x: pos.x, y: pos.y, vx: Math.cos(a) * 3.2, vy: Math.sin(a) * 3.2, life: 1, hue: i % 3 ? 172 : 43 });
      }
    };
    const onUp = () => { down = false; };
    const onLeave = () => { visible = false; if (magnet) magnet.style.transform = ""; };

    const loop = () => {
      t += 1;
      ctx.clearRect(0, 0, w, h);
      // trail: a soft tapered ribbon with a small heartbeat wobble
      for (const p of trail) p.life -= 0.035;
      while (trail.length && trail[0].life <= 0) trail.shift();
      if (trail.length > 2) {
        for (let i = 1; i < trail.length; i++) {
          const a = trail[i - 1], b = trail[i];
          const k = i / trail.length;
          const wob = Math.sin(i * 0.9 + t * 0.25) * 1.5 * k;
          ctx.strokeStyle = `hsla(${172 - k * 8}, 75%, ${48 + k * 8}%, ${Math.min(a.life, b.life) * 0.75 * k})`;
          ctx.lineWidth = 1 + k * 5;
          ctx.lineCap = "round";
          ctx.shadowColor = "rgba(20,184,166,0.6)";
          ctx.shadowBlur = 12 * k;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y + wob);
          ctx.lineTo(b.x, b.y - wob);
          ctx.stroke();
        }
        ctx.shadowBlur = 0;
      }
      // sparks
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.x += s.vx; s.y += s.vy; s.vx *= 0.94; s.vy *= 0.94; s.vy += 0.03; s.life -= 0.025;
        if (s.life <= 0) { sparks.splice(i, 1); continue; }
        ctx.fillStyle = `hsla(${s.hue}, 85%, 55%, ${s.life})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 2.2 * s.life + 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
      // ring follows with a little lag
      ringPos.x += (pos.x - ringPos.x) * 0.18;
      ringPos.y += (pos.y - ringPos.y) * 0.18;
      const scale = down ? 0.75 : hover ? 1.8 : 1;
      ring.style.transform = `translate3d(${ringPos.x - 18}px, ${ringPos.y - 18}px, 0) scale(${scale})`;
      ring.style.opacity = visible ? "1" : "0";
      ring.dataset.hover = hover ? "1" : "0";
      dot.style.transform = `translate3d(${pos.x - 3}px, ${pos.y - 3}px, 0)`;
      dot.style.opacity = visible && !hover ? "1" : "0";
      raf = requestAnimationFrame(loop);
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      if (magnet) magnet.style.transform = "";
    };
  }, []);

  return (
    <>
      <canvas ref={canvasRef} aria-hidden className="pointer-events-none fixed inset-0 z-[70] h-full w-full" />
      <div ref={ringRef} aria-hidden className="cursor-ring pointer-events-none fixed left-0 top-0 z-[71] h-9 w-9 rounded-full opacity-0" />
      <div ref={dotRef} aria-hidden className="pointer-events-none fixed left-0 top-0 z-[71] h-1.5 w-1.5 rounded-full bg-brand-600 opacity-0 dark:bg-brand-300" />
    </>
  );
}
