import { useEffect } from "react";

/**
 * Dynamic favicon: circular halo + outlined calendar + blue day number inside.
 * - No inner seam/line
 * - Small binder posts at the top (optional via props)
 * - Updates at midnight in the chosen IANA time zone
 */
export default function DynamicFavicon(props: {
  timeZone?: string;
  sizes?: number[];          // output sizes
  baseSize?: number;         // internal render resolution (higher = crisper)
  className?: string;

  // Style overrides
  haloColor?: string | null; // null disables halo
  haloOpacity?: number;      // 0..1
  calendarFill?: string;     // inside of the calendar (usually white)
  calendarStroke?: string;   // outline color (brand blue)
  numberColor?: string;      // day number color (brand blue)
  showPosts?: boolean;       // binder posts
  radius?: number;           // calendar corner radius (px at baseSize)
}) {
  useEffect(() => {
    if (typeof document === "undefined") return;

    const cfg = {
      timeZone: props.timeZone ?? "",
      sizes: props.sizes ?? [64, 32, 16],
      baseSize: props.baseSize ?? 224,
      className: props.className ?? "dynamic-favicon",

      haloColor: props.haloColor === undefined ? "#2563EB" : props.haloColor, // brand blue halo
      haloOpacity: props.haloOpacity ?? 0.10,
      calendarFill: props.calendarFill ?? "#FFFFFF",
      calendarStroke: props.calendarStroke ?? "#2563EB",
      numberColor: props.numberColor ?? "#2563EB",
      showPosts: props.showPosts ?? true,
      radius: props.radius ?? 14,

      fontFamily:
        "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    };

    const inTzDate = (tz: string): Date => {
      if (!tz) return new Date();
      const now = new Date();
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      })
        .formatToParts(now)
        .reduce<Record<string, string>>((a, p) => ((a[p.type] = p.value), a), {});
      return new Date(
        `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`
      );
    };

    const msUntilNextMidnight = (tz: string) => {
      const d = inTzDate(tz);
      const n = new Date(d);
      n.setHours(24, 0, 0, 0);
      return n.getTime() - d.getTime();
    };

    const rrect = (
      ctx: CanvasRenderingContext2D,
      x: number,
      y: number,
      w: number,
      h: number,
      r: number
    ) => {
      const rr = Math.max(0, Math.min(r, w / 2, h / 2));
      ctx.beginPath();
      ctx.moveTo(x + rr, y);
      ctx.arcTo(x + w, y, x + w, y + h, rr);
      ctx.arcTo(x + w, y + h, x, y + h, rr);
      ctx.arcTo(x, y + h, x, y, rr);
      ctx.arcTo(x, y, x + w, y, rr);
      ctx.closePath();
    };

    const fitFont = (
      ctx: CanvasRenderingContext2D,
      text: string,
      innerW: number,
      base: number
    ) => {
      let size = base * 0.72;
      while (true) {
        ctx.font = `900 ${Math.round(size)}px ${cfg.fontFamily}`;
        const w = ctx.measureText(text).width;
        if (w <= innerW * 0.82) break;
        size *= 0.97;
        if (size < base * 0.46) break;
      }
      return size;
    };

    const makeIcon = (day: number): string => {
      const S = cfg.baseSize;
      const c = document.createElement("canvas");
      c.width = c.height = S;
      const ctx = c.getContext("2d")!;

      // 1) Soft circular halo
      if (cfg.haloColor) {
        const halo = ctx.createRadialGradient(S / 2, S / 2, S * 0.05, S / 2, S / 2, S * 0.46);
        halo.addColorStop(0, `rgba(255,255,255,0)`); // subtle center
        // convert hex to rgba
        const hex = cfg.haloColor.replace("#", "");
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        halo.addColorStop(1, `rgba(${r},${g},${b},${cfg.haloOpacity})`);
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(S / 2, S / 2, S * 0.48, 0, Math.PI * 2);
        ctx.fill();
      }

      // 2) Calendar square (white fill + blue outline)
      const m = Math.round(S * 0.18); // margin from canvas
      const w = S - 2 * m;
      const h = w;
      const stroke = Math.max(4, Math.round(S / 16)); // scales to ~1px at 16
      rrect(ctx, m, m, w, h, cfg.radius);
      ctx.fillStyle = cfg.calendarFill;
      ctx.fill();
      ctx.strokeStyle = cfg.calendarStroke;
      ctx.lineWidth = stroke;
      ctx.lineJoin = "round";
      ctx.stroke();

      // 3) Optional binder posts (but NO inner seam line)
      if (cfg.showPosts) {
        ctx.fillStyle = cfg.calendarStroke;
        const postR = Math.max(2, Math.round(S / 28));
        const y = m + postR + stroke * 0.4;
        const leftX = m + w * 0.33;
        const rightX = m + w * 0.67;
        ctx.beginPath();
        ctx.arc(leftX, y, postR, 0, Math.PI * 2);
        ctx.arc(rightX, y, postR, 0, Math.PI * 2);
        ctx.fill();
      }

      // 4) Day number (brand blue) centered inside the square
      const innerW = w - stroke * 2 - Math.round(S * 0.08);
      const text = String(day);
      const fontSize = fitFont(ctx, text, innerW, S);
      ctx.font = `900 ${Math.round(fontSize)}px ${cfg.fontFamily}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = cfg.numberColor;

      // subtle glow so it stays readable at 16px
      ctx.shadowColor = "rgba(0,0,0,0.10)";
      ctx.shadowBlur = S * 0.015;

      ctx.fillText(text, m + w / 2, m + h / 2 + S * 0.02);

      return c.toDataURL("image/png");
    };

    const scale = (src: string, size: number) =>
      new Promise<string>((res) => {
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
      document.querySelectorAll(`link[rel~="icon"].${cfg.className}`).forEach((n) => n.remove());
      for (const [sz, href] of m) {
        const l = document.createElement("link");
        l.rel = "icon";
        l.sizes = `${sz}x${sz}`;
        l.href = href;
        l.className = cfg.className;
        document.head.appendChild(l);
      }
    };

    let cancelled = false;
    let timer: number | undefined;

    const render = async () => {
      const hi = makeIcon(inTzDate(cfg.timeZone).getDate());
      const urls = await Promise.all(cfg.sizes.map((s) => scale(hi, s)));
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
      document.querySelectorAll(`link[rel~="icon"].${cfg.className}`).forEach((n) => n.remove());
    };
  }, [
    props.timeZone,
    props.sizes?.join(","),
    props.baseSize,
    props.className,
    props.haloColor,
    props.haloOpacity,
    props.calendarFill,
    props.calendarStroke,
    props.numberColor,
    props.showPosts,
    props.radius,
  ]);

  return null;
}
