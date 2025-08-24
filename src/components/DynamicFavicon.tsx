import { useEffect } from "react";

/**
 * Dynamic favicon: square calendar outline + blue day number inside.
 * - No top bar fill
 * - Outline + posts + seam line (like your left-side icon)
 * - Day number is blue and centered under the seam
 */
export default function DynamicFavicon(props: {
  timeZone?: string;
  sizes?: number[];        // output icon sizes
  baseSize?: number;       // internal render resolution
  className?: string;

  // Styling overrides (optional)
  outlineColor?: string;   // calendar outline & seam & posts
  numberColor?: string;    // day number color
  fillColor?: string;      // inside fill (white looks best)
  background?: string | null; // page-agnostic halo; set null for transparent
  radius?: number;         // calendar corner radius
}) {
  useEffect(() => {
    if (typeof document === "undefined") return;

    const cfg = {
      timeZone: props.timeZone ?? "",
      sizes: props.sizes ?? [64, 32, 16],
      baseSize: props.baseSize ?? 224,
      className: props.className ?? "dynamic-favicon-outline-cal",

      outlineColor: props.outlineColor ?? "#2563EB", // blue-600
      numberColor: props.numberColor ?? "#2563EB",   // blue number
      fillColor: props.fillColor ?? "#FFFFFF",
      background: props.background ?? "rgba(37, 99, 235, 0.08)", // soft halo; set null to remove
      radius: props.radius ?? 18,

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

    const fitFont = (ctx: CanvasRenderingContext2D, text: string, S: number, maxW: number) => {
      let size = S * 0.7;
      while (true) {
        ctx.font = `900 ${Math.round(size)}px ${cfg.fontFamily}`;
        if (ctx.measureText(text).width <= maxW) break;
        size *= 0.97;
        if (size < S * 0.45) break;
      }
      return size;
    };

    const makeIcon = (day: number): string => {
      const S = cfg.baseSize;
      const c = document.createElement("canvas");
      c.width = c.height = S;
      const ctx = c.getContext("2d")!;

      // optional soft circular halo (like your page icon background)
      if (cfg.background) {
        ctx.fillStyle = cfg.background;
        ctx.beginPath();
        ctx.arc(S / 2, S / 2, S * 0.46, 0, Math.PI * 2);
        ctx.fill();
      }

      // calendar container (white fill, blue outline)
      const m = Math.round(S * 0.16);
      const bw = Math.max(4, Math.round(S / 16)); // stroke scales; ~1px at 16
      rrect(ctx, m, m, S - 2 * m, S - 2 * m, cfg.radius);
      ctx.fillStyle = cfg.fillColor;
      ctx.fill();
      ctx.strokeStyle = cfg.outlineColor;
      ctx.lineWidth = bw;
      ctx.lineJoin = "round";
      ctx.stroke();

      // seam line (top divider)
      const top = m + bw / 2;
      const seamY = m + (S - 2 * m) * 0.34;
      ctx.beginPath();
      ctx.moveTo(m + bw, seamY);
      ctx.lineTo(S - m - bw, seamY);
      ctx.stroke();

      // binder posts
      const postR = Math.max(2, Math.round(S / 28));
      const postY = top + postR + 0.5;
      const leftX = m + (S - 2 * m) * 0.33;
      const rightX = m + (S - 2 * m) * 0.67;
      ctx.fillStyle = cfg.outlineColor;
      ctx.beginPath();
      ctx.arc(leftX, postY, postR, 0, Math.PI * 2);
      ctx.arc(rightX, postY, postR, 0, Math.PI * 2);
      ctx.fill();

      // day number (blue), centered under seam
      const str = String(day);
      const maxTextWidth = (S - 2 * m) * 0.76;
      const fs = fitFont(ctx, str, S, maxTextWidth);
      ctx.font = `900 ${Math.round(fs)}px ${cfg.fontFamily}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = cfg.numberColor;

      // slight shadow so the blue stays visible at 16px
      ctx.shadowColor = "rgba(0,0,0,0.12)";
      ctx.shadowBlur = S * 0.015;

      const textY = (seamY + (S - m)) / 2; // centered in lower area
      ctx.fillText(str, S / 2, textY);

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
      document
        .querySelectorAll(`link[rel~="icon"].${cfg.className}`)
        .forEach((n) => n.remove());
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
      document
        .querySelectorAll(`link[rel~="icon"].${cfg.className}`)
        .forEach((n) => n.remove());
    };
  }, [
    props.timeZone,
    props.sizes?.join(","),
    props.baseSize,
    props.className,
    props.outlineColor,
    props.numberColor,
    props.fillColor,
    props.background,
    props.radius,
  ]);

  return null;
}
