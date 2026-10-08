import { useEffect, useRef } from "react";

/**
 * Interactive "heartbeat threads" background: flowing waves that bend away from the
 * cursor (or finger), ripple rings on click/tap, and slowly drifting cells.
 * Pauses when off-screen or the tab is hidden; static when the user prefers reduced motion.
 */
export function WaveBackground({ className = "", lines = 7, intensity = 1, tone = "brand" }: { className?: string; lines?: number; intensity?: number; tone?: "brand" | "white" }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0, h = 0, dpr = 1, raf = 0, t = 0, visible = true;
    const mouse = { x: -9999, y: -9999, tx: -9999, ty: -9999, active: false };
    const ripples: { x: number; y: number; r: number; a: number }[] = [];
    const cells = Array.from({ length: 22 }, () => ({ x: Math.random(), y: Math.random(), r: 1.5 + Math.random() * 3, s: 0.2 + Math.random() * 0.6, p: Math.random() * 6.28 }));

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = rect.width; h = rect.height;
      canvas.width = Math.max(1, w * dpr); canvas.height = Math.max(1, h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const isDark = () => document.documentElement.classList.contains("dark");

    const local = (cx: number, cy: number) => {
      const rect = canvas.getBoundingClientRect();
      return { x: cx - rect.left, y: cy - rect.top, inside: cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom };
    };
    const onMove = (e: PointerEvent) => {
      const p = local(e.clientX, e.clientY);
      mouse.tx = p.x; mouse.ty = p.y; mouse.active = p.inside;
      if (mouse.x < -1000) { mouse.x = p.x; mouse.y = p.y; }
    };
    const onDown = (e: PointerEvent) => {
      const p = local(e.clientX, e.clientY);
      if (p.inside) ripples.push({ x: p.x, y: p.y, r: 0, a: 0.5 });
    };
    const onLeave = () => { mouse.active = false; };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      const dark = isDark();
      // ease the cursor so waves glide instead of jumping
      mouse.x += (mouse.tx - mouse.x) * 0.12;
      mouse.y += (mouse.ty - mouse.y) * 0.12;
      const influence = mouse.active ? 1 : 0;

      for (let i = 0; i < lines; i++) {
        const k = i / Math.max(1, lines - 1);
        const base = h * (0.18 + k * 0.7);
        const amp = (10 + 14 * Math.sin(k * 3.1)) * intensity;
        const freq = 0.006 + k * 0.0025;
        const speed = 0.6 + k * 0.5;
        const grad = ctx.createLinearGradient(0, 0, w, 0);
        const a = tone === "white" ? 0.45 : dark ? 0.5 : 0.55;
        const c1 = tone === "white" ? "255,255,255" : "20,184,166";
        const c2 = tone === "white" ? "204,251,241" : "45,212,191";
        grad.addColorStop(0, `rgba(${c1},${a * 0.2})`);
        grad.addColorStop(0.45, `rgba(${c1},${a})`);
        grad.addColorStop(0.75, `rgba(${c2},${a * 0.9})`);
        grad.addColorStop(1, `rgba(251,191,36,${a * 0.6})`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = i === Math.floor(lines / 2) ? 3 : 1.8;
        ctx.beginPath();
        for (let x = -10; x <= w + 10; x += 8) {
          let y = base + Math.sin(x * freq + t * speed + i) * amp + Math.sin(x * freq * 2.3 - t * 0.7 + i * 2) * amp * 0.35;
          // heartbeat blip travelling along the middle thread
          if (i === Math.floor(lines / 2)) {
            const beatX = ((t * 120) % (w + 400)) - 200;
            const d = x - beatX;
            if (Math.abs(d) < 60) y -= (34 * Math.exp(-((d / 7) ** 2)) - 14 * Math.exp(-(((d - 14) / 7) ** 2)) + 6 * Math.exp(-(((d + 22) / 10) ** 2))) * intensity;
          }
          // bend away from the cursor (gaussian bump)
          const dx = x - mouse.x, dy = y - mouse.y;
          const dist2 = dx * dx + dy * dy;
          const push = Math.exp(-dist2 / (2 * 120 * 120)) * 70 * influence * intensity;
          y += dy >= 0 ? push : -push;
          if (x === -10) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // drifting cells, gently drawn toward the cursor
      for (const c of cells) {
        let cx = (c.x * w + Math.sin(t * c.s + c.p) * 30) % w;
        let cy = (c.y * h + Math.cos(t * c.s * 0.8 + c.p) * 20) % h;
        if (influence) {
          const dx = mouse.x - cx, dy = mouse.y - cy, d = Math.hypot(dx, dy);
          if (d < 180) { cx += dx * (1 - d / 180) * 0.25; cy += dy * (1 - d / 180) * 0.25; }
        }
        ctx.beginPath();
        ctx.fillStyle = tone === "white" ? "rgba(255,255,255,0.35)" : dark ? "rgba(94,234,212,0.35)" : "rgba(13,148,136,0.3)";
        ctx.arc(cx, cy, c.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // ripples
      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i];
        r.r += 3.2; r.a *= 0.955;
        ctx.beginPath();
        ctx.strokeStyle = tone === "white" ? `rgba(255,255,255,${r.a})` : `rgba(20,184,166,${r.a})`;
        ctx.lineWidth = 2;
        ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
        ctx.stroke();
        if (r.a < 0.02) ripples.splice(i, 1);
      }
    };

    const loop = () => {
      if (visible && !document.hidden) { t += 0.016; draw(); }
      raf = requestAnimationFrame(loop);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    io.observe(canvas);
    if (reduce) {
      draw();
    } else {
      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("pointerdown", onDown, { passive: true });
      document.addEventListener("pointerleave", onLeave);
      raf = requestAnimationFrame(loop);
    }
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, [lines, intensity, tone]);

  return <canvas ref={ref} aria-hidden className={`pointer-events-none absolute inset-0 h-full w-full ${className}`} />;
}

/** Soft glow that follows the cursor (mouse/pen only), plus card "spotlight" coordinates. */
export function CursorGlow() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!window.matchMedia("(pointer: fine)").matches || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let x = -500, y = -500, tx = -500, ty = -500, raf = 0;
    const onMove = (e: PointerEvent) => {
      tx = e.clientX; ty = e.clientY;
      // feed spotlight cards the local cursor position
      const el = (e.target as HTMLElement)?.closest?.(".spotlight") as HTMLElement | null;
      if (el) {
        const r = el.getBoundingClientRect();
        el.style.setProperty("--mx", `${e.clientX - r.left}px`);
        el.style.setProperty("--my", `${e.clientY - r.top}px`);
      }
    };
    const loop = () => {
      x += (tx - x) * 0.15; y += (ty - y) * 0.15;
      if (ref.current) ref.current.style.transform = `translate3d(${x - 200}px, ${y - 200}px, 0)`;
      raf = requestAnimationFrame(loop);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("pointermove", onMove); };
  }, []);
  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 -z-10 h-[400px] w-[400px] rounded-full opacity-70 blur-2xl transition-opacity duration-500 dark:opacity-50"
      style={{ background: "radial-gradient(circle, rgba(45,212,191,0.28) 0%, rgba(45,212,191,0.08) 40%, transparent 70%)" }}
    />
  );
}
