import { useEffect } from "react";

/** Darker tile + lighter day number */
export default function DynamicFavicon(props: {
  timeZone?: string;
  sizes?: number[];
  baseSize?: number;
  className?: string;
}) {
  useEffect(() => {
    if (typeof document === "undefined") return;

    const cfg = {
      timeZone: props.timeZone ?? "",
      sizes: props.sizes ?? [64, 32, 16],
      baseSize: props.baseSize ?? 192,
      className: props.className ?? "dynamic-favicon",

      // ⬇️ Darker calendar tile
      bgTop: "#9BB8FF",   // was very light; now darker
      bgBottom: "#5C84FF",
      topBar: "#FFFFFF",
      ring: "#1E3A8A",    // deeper blue rings

      // ⬇️ Lighter day number
      dayFillA: "#FFFFFF",
      dayFillB: "#EAF2FF",
      stroke: "rgba(0,0,0,0.18)",  // subtle edge, not heavy
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
      let size = S * 0.66;
      while (true) {
        ctx.font = `900 ${Math.round(size)}px ${cfg.fontFamily}`;
        const w = ctx.measureText(text).width;
        if (w <= S * 0.72) break;
        size *= 0.96;
        if (size < S * 0.44) break;
      }
      return size;
    };

    const makeIcon = (day: number): string => {
      const S = cfg.baseSize;
      const c = document.createElement("canvas");
      c.width = c.height = S;
      const ctx = c.getContext("2d")!;

      // darker tile
      const g = ctx.createLinearGradient(0, 0, 0, S);
      g.addColorStop(0, cfg.bgTop);
      g.addColorStop(1, cfg.bgBottom);
      ctx.fillStyle = g;
      rr(ctx, 6, 6, S - 12, S - 12, 22);
      ctx.fill();

      // top bar (white)
      ctx.fillStyle = cfg.topBar;
      rr(ctx, 18, 18, S - 36, Math.round(S * 0.20), 12);
      ctx.fill();

      // binder rings
      ctx.fillStyle = cfg.ring;
      ctx.beginPath(); ctx.arc(S * 0.40, 18, 5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(S * 0.60, 18, 5, 0, Math.PI * 2); ctx.fill();

      // lighter day number
      const text = String(day);
      const fs = fitFont(ctx, text, S);
      ctx.font = `900 ${Math.round(fs)}px ${cfg.fontFamily}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const grad = ctx.createLinearGradient(S*0.30, S*0.55, S*0.70, S*0.88);
      grad.addColorStop(0, cfg.dayFillA);
      grad.addColorStop(1, cfg.dayFillB);
      ctx.fillStyle = grad;

      // subtle outline for tiny sizes
      ctx.lineJoin = "round";
      ctx.strokeStyle = cfg.stroke;
      ctx.lineWidth = Math.max(1, S / 22); // ~0.7–1px at 16
      const y = S * 0.70;
      ctx.strokeText(text, S/2, y);
      ctx.fillText(text, S/2, y);

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
  }, [props.timeZone, props.sizes?.join(","), props.baseSize, props.className]);

  return null;
}
