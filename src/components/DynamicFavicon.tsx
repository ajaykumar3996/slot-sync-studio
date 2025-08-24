import { useEffect } from "react";

/** High-contrast dynamic calendar favicon */
export default function DynamicFavicon(props: {
  timeZone?: string;
  sizes?: number[];     // output sizes
  baseSize?: number;    // internal render res (bigger -> crisper)
  className?: string;
}) {
  useEffect(() => {
    if (typeof document === "undefined") return;

    const cfg = {
      timeZone: props.timeZone ?? "",
      sizes: props.sizes ?? [64, 32, 16],
      baseSize: props.baseSize ?? 192,               // ↑ crisper
      className: props.className ?? "dynamic-favicon",

      // Darker, higher-contrast palette
      bgTop: "#D6E2FF",
      bgBottom: "#A7C0FF",
      topBar: "#FFFFFF",
      ring: "#1D4ED8",                                // blue-700
      textFallback: "#0B2A6F",
      textGradA: "#1E3A8A",                           // blue-800
      textGradB: "#2563EB",                           // blue-600
      fontFamily:
        "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    };

    const inTzDate = (tz: string): Date => {
      if (!tz) return new Date();
      const now = new Date();
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        hour12: false,
      }).formatToParts(now).reduce<Record<string, string>>((a, p) => {
        a[p.type] = p.value; return a;
      }, {});
      return new Date(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`);
    };

    const msUntilNextMidnight = (tz: string) => {
      const d = inTzDate(tz);
      const n = new Date(d); n.setHours(24,0,0,0);
      return n.getTime() - d.getTime();
    };

    const rr = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
      const rad = Math.min(r, w/2, h/2);
      ctx.beginPath();
      ctx.moveTo(x+rad, y);
      ctx.arcTo(x+w, y, x+w, y+h, rad);
      ctx.arcTo(x+w, y+h, x, y+h, rad);
      ctx.arcTo(x, y+h, x, y, rad);
      ctx.arcTo(x, y, x+w, y, rad);
      ctx.closePath();
    };

    const fitFont = (ctx: CanvasRenderingContext2D, text: string, S: number) => {
      // Try big, shrink until width fits 72% of tile
      let size = S * 0.66; // start larger than needed
      while (true) {
        ctx.font = `900 ${Math.round(size)}px ${cfg.fontFamily}`;
        const w = ctx.measureText(text).width;
        if (w <= S * 0.72) break;
        size *= 0.96;
        if (size < S * 0.44) break;
      }
      return size;
    };

    const makeIconPng = (day: number): string => {
      const S = cfg.baseSize;
      const c = document.createElement("canvas");
      c.width = c.height = S;
      const ctx = c.getContext("2d")!;

      // Card background (darker)
      const g = ctx.createLinearGradient(0, 0, 0, S);
      g.addColorStop(0, cfg.bgTop);
      g.addColorStop(1, cfg.bgBottom);
      ctx.fillStyle = g;
      rr(ctx, 6, 6, S - 12, S - 12, 22);
      ctx.fill();

      // Slimmer top bar to free vertical space
      ctx.fillStyle = cfg.topBar;
      rr(ctx, 18, 18, S - 36, Math.round(S * 0.20), 12);
      ctx.fill();

      // Binder rings (slightly smaller)
      ctx.fillStyle = cfg.ring;
      ctx.beginPath(); ctx.arc(S * 0.40, 18, 5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(S * 0.60, 18, 5, 0, Math.PI * 2); ctx.fill();

      // Day number — bigger + darker + outlined
      const text = String(day);
      const fontSize = fitFont(ctx, text, S);
      ctx.font = `900 ${Math.round(fontSize)}px ${cfg.fontFamily}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const grad = ctx.createLinearGradient(S * 0.30, S * 0.55, S * 0.70, S * 0.88);
      grad.addColorStop(0, cfg.textGradA);
      grad.addColorStop(1, cfg.textGradB);
      ctx.fillStyle = grad;

      // Strong stroke for small favicons (scales down)
      ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(0,0,0,0.28)";
      ctx.lineWidth = Math.max(1, S / 18);          // ~1px at 16x16
      const y = S * 0.70;

      // Subtle shadow for extra contrast when downscaled
      ctx.shadowColor = "rgba(0,0,0,0.20)";
      ctx.shadowBlur = S * 0.02;

      ctx.strokeText(text, S / 2, y);
      ctx.shadowBlur = 0;
      ctx.fillText(text, S / 2, y);

      return c.toDataURL("image/png");
    };

    const scale = (dataUrl: string, size: number) =>
      new Promise<string>((res) => {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement("canvas");
          c.width = c.height = size;
          c.getContext("2d")!.drawImage(img, 0, 0, size, size);
          res(c.toDataURL("image/png"));
        };
        img.src = dataUrl;
      });

    const setFavicons = (m: Map<number, string>) => {
      document.querySelectorAll(`link[rel~="icon"].${cfg.className}`).forEach(n => n.remove());
      for (const [sz, href] of m) {
        const l = document.createElement("link");
        l.rel = "icon"; l.sizes = `${sz}x${sz}`; l.href = href; l.className = cfg.className;
        document.head.appendChild(l);
      }
    };

    let cancelled = false;
    let timer: number | undefined;

    const render = async () => {
      const d = inTzDate(cfg.timeZone);
      const hi = makeIconPng(d.getDate());
      const urls = await Promise.all(cfg.sizes.map(s => scale(hi, s)));
      if (!cancelled) setFavicons(new Map(urls.map((u, i) => [cfg.sizes[i], u])));
    };

    render().catch(console.error);
    timer = window.setTimeout(function tick() {
      render().catch(console.error);
      timer = window.setTimeout(tick, 24 * 60 * 60 * 1000);
    }, msUntilNextMidnight(cfg.timeZone));

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.querySelectorAll(`link[rel~="icon"].${cfg.className}`).forEach(n => n.remove());
    };
  }, [props.timeZone, props.sizes?.join(","), props.baseSize, props.className]);

  return null;
}
