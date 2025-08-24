import { useEffect } from "react";

/** Minimal dynamic favicon: dark tile + light day number (no top bar) */
export default function DynamicFavicon(props: {
  timeZone?: string;
  sizes?: number[];     // 64/32/16 by default
  baseSize?: number;    // internal render resolution
  className?: string;
  // Optional overrides
  bgTop?: string;       // darker blue for contrast
  bgBottom?: string;    // deeper blue
  dayA?: string;        // day number gradient start (lighter)
  dayB?: string;        // day number gradient end (light)
  outline?: string;     // subtle outline to keep number crisp at 16px
  radius?: number;      // corner radius px at baseSize
}) {
  useEffect(() => {
    if (typeof document === "undefined") return;

    const cfg = {
      timeZone: props.timeZone ?? "",
      sizes: props.sizes ?? [64, 32, 16],
      baseSize: props.baseSize ?? 224,                 // high-res for crisper downscale
      className: props.className ?? "dynamic-favicon",

      // ⬇️ Brandy/darker tile + light number
      bgTop: props.bgTop ?? "#6A86FF",
      bgBottom: props.bgBottom ?? "#3057FF",
      dayA: props.dayA ?? "#FFFFFF",
      dayB: props.dayB ?? "#EDF4FF",
      outline: props.outline ?? "rgba(0,0,0,0.18)",
      radius: props.radius ?? 22,

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
      }).formatToParts(now).reduce<Record<string,string>>((a,p)=>{a[p.type]=p.value;return a;}, {});
      return new Date(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`);
    };

    const msUntilNextMidnight = (tz: string) => {
      const d = inTzDate(tz);
      const n = new Date(d); n.setHours(24,0,0,0);
      return n.getTime() - d.getTime();
    };

    const rrect = (
      ctx: CanvasRenderingContext2D,
      x: number, y: number, w: number, h: number, r: number
    ) => {
      const rr = Math.min(r, w/2, h/2);
      ctx.beginPath();
      ctx.moveTo(x+rr, y);
      ctx.arcTo(x+w, y, x+w, y+h, rr);
      ctx.arcTo(x+w, y+h, x, y+h, rr);
      ctx.arcTo(x, y+h, x, y, rr);
      ctx.arcTo(x, y, x+w, y, rr);
      ctx.closePath();
    };

    const fitFont = (ctx: CanvasRenderingContext2D, text: string, S: number) => {
      // Fill most of the tile since there’s no top bar now
      let size = S * 0.74; // start big, shrink until fits
      while (true) {
        ctx.font = `900 ${Math.round(size)}px ${cfg.fontFamily}`;
        const w = ctx.measureText(text).width;
        if (w <= S * 0.78) break;
        size *= 0.97;
        if (size < S * 0.46) break;
      }
      return size;
    };

    const makeIcon = (day: number): string => {
      const S = cfg.baseSize;
      const c = document.createElement("canvas");
      c.width = c.height = S;
      const ctx = c.getContext("2d")!;

      // Darker blue rounded tile
      const g = ctx.createLinearGradient(0, 0, 0, S);
      g.addColorStop(0, cfg.bgTop);
      g.addColorStop(1, cfg.bgBottom);
      ctx.fillStyle = g;
      rrect(ctx, 10, 10, S - 20, S - 20, cfg.radius);
      ctx.fill();

      // Optional soft inner highlight to add depth
      const inset = ctx.createRadialGradient(S*0.5, S*0.35, S*0.05, S*0.5, S*0.5, S*0.6);
      inset.addColorStop(0, "rgba(255,255,255,0.15)");
      inset.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = inset;
      rrect(ctx, 10, 10, S - 20, S - 20, cfg.radius);
      ctx.fill();

      // Light day number centered
      const str = String(day);
      const fs = fitFont(ctx, str, S);
      ctx.font = `900 ${Math.round(fs)}px ${cfg.fontFamily}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const dg = ctx.createLinearGradient(S*0.35, S*0.45, S*0.65, S*0.85);
      dg.addColorStop(0, cfg.dayA);
      dg.addColorStop(1, cfg.dayB);
      ctx.fillStyle = dg;

      // Subtle outline + tiny glow so it stays readable at 16px
      ctx.lineJoin = "round";
      ctx.strokeStyle = cfg.outline;
      ctx.lineWidth = Math.max(1, S / 24);    // ~0.7–1px at 16px
      ctx.shadowColor = "rgba(0,0,0,0.18)";
      ctx.shadowBlur = S * 0.02;

      const y = S * 0.58;
      ctx.strokeText(str, S/2, y);
      ctx.shadowBlur = 0;
      ctx.fillText(str, S/2, y);

      return c.toDataURL("image/png");
    };

    const scale = (src: string, size: number) => new Promise<string>((res) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = c.height = size;
        c.getContext("2d")!.drawImage(img, 0, 0, size, size);
        res(c.toDataURL("image/png"));
      };
      img.src = src;
    });

    const setFavicons = (m: Map<number,string>) => {
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
      const hi = makeIcon(inTzDate(cfg.timeZone).getDate());
      const urls = await Promise.all(cfg.sizes.map(s => scale(hi, s)));
      if (!cancelled) setFavicons(new Map(urls.map((u, i) => [cfg.sizes[i], u])));
    };

    render().catch(console.error);
    timer = window.setTimeout(function tick() {
      render().catch(console.error);
      timer = window.setTimeout(tick, 24*60*60*1000);
    }, msUntilNextMidnight(cfg.timeZone));

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.querySelectorAll(`link[rel~="icon"].${cfg.className}`).forEach(n => n.remove());
    };
  }, [
    props.timeZone,
    props.sizes?.join(","),
    props.baseSize,
    props.className,
    props.bgTop, props.bgBottom, props.dayA, props.dayB, props.outline, props.radius
  ]);

  return null;
}
