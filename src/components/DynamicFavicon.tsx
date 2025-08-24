import { useEffect } from "react";

/** Minimal favicon: square outline + blue day number (auto-updates at midnight) */
export default function DynamicFavicon(props: {
  timeZone?: string;
  sizes?: number[];      // output sizes
  baseSize?: number;     // internal render resolution
  className?: string;
  // Optional palette/tweaks
  borderColor?: string;  // square outline
  fill?: string;         // inside fill
  numberColor?: string;  // day number color (blue)
  borderRadius?: number; // 0 = perfect square (slight rounding ok if you prefer)
}) {
  useEffect(() => {
    if (typeof document === "undefined") return;

    const cfg = {
      timeZone: props.timeZone ?? "",
      sizes: props.sizes ?? [64, 32, 16],
      baseSize: props.baseSize ?? 224,
      className: props.className ?? "dynamic-favicon",
      borderColor: props.borderColor ?? "#2563EB", // blue-600
      fill: props.fill ?? "#FFFFFF",
      numberColor: props.numberColor ?? "#2563EB",
      borderRadius: props.borderRadius ?? 4,       // small rounding; set 0 for square
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

    const rrect = (
      ctx: CanvasRenderingContext2D,
      x: number, y: number, w: number, h: number, r: number
    ) => {
      const rr = Math.max(0, Math.min(r, w/2, h/2));
      ctx.beginPath();
      ctx.moveTo(x+rr, y);
      ctx.arcTo(x+w, y, x+w, y+h, rr);
      ctx.arcTo(x+w, y+h, x, y+h, rr);
      ctx.arcTo(x, y+h, x, y, rr);
      ctx.arcTo(x, y, x+w, y, rr);
      ctx.closePath();
    };

    const fitFont = (ctx: CanvasRenderingContext2D, text: string, S: number) => {
      // Fill most of the inside box with the number
      let size = S * 0.74;
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

      // Square outline + fill
      const m = 12; // margin
      const borderWidth = S / 12; // scales to ~1.3px at 16x16
      // Fill
      ctx.fillStyle = cfg.fill;
      rrect(ctx, m, m, S - 2 * m, S - 2 * m, cfg.borderRadius);
      ctx.fill();
      // Stroke
      ctx.strokeStyle = cfg.borderColor;
      ctx.lineWidth = borderWidth;
      ctx.lineJoin = "miter";
      rrect(ctx, m, m, S - 2 * m, S - 2 * m, cfg.borderRadius);
      ctx.stroke();

      // Day number (blue)
      const str = String(day);
      const fs = fitFont(ctx, str, S);
      ctx.font = `900 ${Math.round(fs)}px ${cfg.fontFamily}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = cfg.numberColor;

      // tiny shadow so it stays readable at 16px, but number stays light
      ctx.shadowColor = "rgba(0,0,0,0.10)";
      ctx.shadowBlur = S * 0.015;

      const y = S * 0.58;
      ctx.fillText(str, S / 2, y);

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
      const hi = makeIcon(inTzDate(cfg.timeZone).getDate());
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
  }, [
    props.timeZone,
    props.sizes?.join(","),
    props.baseSize,
    props.className,
    props.borderColor,
    props.fill,
    props.numberColor,
    props.borderRadius
  ]);

  return null;
}
