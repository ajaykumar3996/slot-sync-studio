import { useEffect } from "react";

/**
 * Dynamic calendar favicon (brand-blue preset).
 * - Matches blue gradient heading (text-gradient style)
 * - Auto-updates at midnight in the chosen timezone
 */
export default function DynamicFavicon(props: {
  timeZone?: string;
  sizes?: number[];
  baseSize?: number;
  // Brand colors (defaults tuned to your screenshots)
  bgTop?: string;       // light blue top
  bgBottom?: string;    // light blue bottom
  topBar?: string;      // white bar
  ring?: string;        // blue binder rings
  text?: string;        // fallback solid text color
  textGradient?: [string, string]; // gradient for the day number
  className?: string;
}) {
  useEffect(() => {
    if (typeof document === "undefined") return;

    const cfg = {
      timeZone: props.timeZone ?? "",
      sizes: props.sizes ?? [48, 32, 16],
      baseSize: props.baseSize ?? 128,
      // --- Brand-blue defaults (edit if needed) ---
      bgTop: props.bgTop ?? "#EEF4FF",
      bgBottom: props.bgBottom ?? "#DAE6FF",
      topBar: props.topBar ?? "#FFFFFF",
      ring: props.ring ?? "#3B82F6",          // tailwind blue-500-ish
      text: props.text ?? "#1E40AF",          // blue-800-ish (fallback)
      textGradient: props.textGradient ?? ["#4F7BFF", "#6DB6FF"], // like your heading
      className: props.className ?? "dynamic-favicon",
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
        .reduce<Record<string, string>>((acc, p) => {
          acc[p.type] = p.value;
          return acc;
        }, {});
      return new Date(
        `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`
      );
    };

    const msUntilNextMidnight = (tz: string): number => {
      const d = inTzDate(tz);
      const next = new Date(d);
      next.setHours(24, 0, 0, 0);
      return next.getTime() - d.getTime();
    };

    const roundedRect = (
      ctx: CanvasRenderingContext2D,
      x: number,
      y: number,
      w: number,
      h: number,
      r: number
    ) => {
      const rr = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + rr, y);
      ctx.arcTo(x + w, y, x + w, y + h, rr);
      ctx.arcTo(x + w, y + h, x, y + h, rr);
      ctx.arcTo(x, y + h, x, y, rr);
      ctx.arcTo(x, y, x + w, y, rr);
      ctx.closePath();
    };

    const makeIconPng = (day: number): string => {
      const S = cfg.baseSize;
      const c = document.createElement("canvas");
      c.width = c.height = S;
      const ctx = c.getContext("2d")!;

      // Soft brand-blue card
      const g = ctx.createLinearGradient(0, 0, 0, S);
      g.addColorStop(0, cfg.bgTop);
      g.addColorStop(1, cfg.bgBottom);
      ctx.fillStyle = g;
      roundedRect(ctx, 8, 8, S - 16, S - 16, 22);
      ctx.fill();

      // White top bar (like your header glyph)
      ctx.fillStyle = cfg.topBar;
      roundedRect(ctx, 20, 20, S - 40, Math.round(S * 0.26), 12);
      ctx.fill();

      // Binder rings in blue
      ctx.fillStyle = cfg.ring;
      ctx.beginPath(); ctx.arc(S * 0.38, 20, 6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(S * 0.62, 20, 6, 0, Math.PI * 2); ctx.fill();

      // Day number with gradient like your text-gradient
      const fontSize = Math.round(S * 0.48);
      ctx.font = `800 ${fontSize}px ${cfg.fontFamily}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const tg = ctx.createLinearGradient(S * 0.3, S * 0.5, S * 0.7, S * 0.85);
      tg.addColorStop(0, cfg.textGradient[0]);
      tg.addColorStop(1, cfg.textGradient[1]);
      ctx.fillStyle = tg;
      // Stroke for crisp edges when downscaled
      ctx.strokeStyle = "rgba(0,0,0,0.08)";
      ctx.lineWidth = Math.max(1, S * 0.02);
      const textY = S * 0.66;
      ctx.strokeText(String(day), S / 2, textY);
      ctx.fillText(String(day), S / 2, textY);

      return c.toDataURL("image/png");
    };

    const scaleDataUrl = (dataUrl: string, size: number): Promise<string> =>
      new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement("canvas");
          c.width = c.height = size;
          const ctx = c.getContext("2d")!;
          ctx.drawImage(img, 0, 0, size, size);
          resolve(c.toDataURL("image/png"));
        };
        img.src = dataUrl;
      });

    const setFavicons = (bySize: Map<number, string>) => {
      document
        .querySelectorAll(`link[rel~="icon"].${cfg.className}`)
        .forEach((n) => n.parentElement?.removeChild(n));
      for (const [sz, url] of bySize) {
        const link = document.createElement("link");
        link.setAttribute("rel", "icon");
        link.setAttribute("sizes", `${sz}x${sz}`);
        link.className = cfg.className;
        link.href = url;
        document.head.appendChild(link);
      }
    };

    let timer: number | undefined;
    let cancelled = false;

    const renderAndApply = async () => {
      const d = inTzDate(cfg.timeZone);
      const day = d.getDate();
      const hi = makeIconPng(day);
      const urls = await Promise.all(cfg.sizes.map((s) => scaleDataUrl(hi, s)));
      if (!cancelled) setFavicons(new Map(urls.map((u, i) => [cfg.sizes[i], u])));
    };

    const schedule = () => {
      const delay = msUntilNextMidnight(cfg.timeZone);
      timer = window.setTimeout(function tick() {
        renderAndApply().catch(console.error);
        timer = window.setTimeout(tick, 24 * 60 * 60 * 1000);
      }, delay);
    };

    renderAndApply().catch(console.error);
    schedule();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      document
        .querySelectorAll(`link[rel~="icon"].${cfg.className}`)
        .forEach((n) => n.parentElement?.removeChild(n));
    };
  }, [
    props.timeZone,
    props.sizes?.join(","),
    props.baseSize,
    props.bgTop,
    props.bgBottom,
    props.topBar,
    props.ring,
    props.text,
    props.textGradient?.join(","),
    props.className,
  ]);

  return null;
}
