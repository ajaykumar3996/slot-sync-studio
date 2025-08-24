import { useEffect } from "react";

/**
 * Renders a calendar-style favicon that shows today's date and
 * auto-updates at midnight in the specified IANA timezone.
 *
 * Drop this component once in your app (e.g., Layout).
 */
export default function DynamicFavicon(props: {
  timeZone?: string;           // e.g., "America/Chicago"; empty/undefined => user's local tz
  sizes?: number[];            // favicon sizes to generate
  baseSize?: number;           // internal canvas render size before downscaling
  bgTop?: string;              // gradient top color
  bgBottom?: string;           // gradient bottom color
  topBar?: string;             // header strip color
  ring?: string;               // binder ring color
  text?: string;               // day number color
  className?: string;          // class placed on generated <link> tags
}) {
  useEffect(() => {
    if (typeof document === "undefined") return; // SSR guard

    const cfg = {
      timeZone: props.timeZone ?? "",
      sizes: props.sizes ?? [48, 32, 16],
      baseSize: props.baseSize ?? 128,
      bgTop: props.bgTop ?? "#E9D7FE",
      bgBottom: props.bgBottom ?? "#C7A4FF",
      topBar: props.topBar ?? "#FFFFFF",
      ring: props.ring ?? "#6C47CE",
      text: props.text ?? "#1D2266",
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
      // Construct a local Date from the parts representing the tz time
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

      // Background gradient
      const g = ctx.createLinearGradient(0, 0, 0, S);
      g.addColorStop(0, cfg.bgTop);
      g.addColorStop(1, cfg.bgBottom);
      ctx.fillStyle = g;
      roundedRect(ctx, 8, 8, S - 16, S - 16, 24);
      ctx.fill();

      // Top bar
      ctx.fillStyle = cfg.topBar;
      roundedRect(ctx, 20, 20, S - 40, Math.round(S * 0.26), 12);
      ctx.fill();

      // Binder rings
      ctx.fillStyle = cfg.ring;
      ctx.beginPath();
      ctx.arc(S * 0.38, 20, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(S * 0.62, 20, 6, 0, Math.PI * 2);
      ctx.fill();

      // Day number
      ctx.fillStyle = cfg.text;
      const fontSize = Math.round(S * 0.48);
      ctx.font = `bold ${fontSize}px ${cfg.fontFamily}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(day), S / 2, S * 0.66);

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
      // Remove previous icons created by this component
      document
        .querySelectorAll(`link[rel~="icon"].${cfg.className}`)
        .forEach((n) => n.parentElement?.removeChild(n));

      // Add new icons
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
      if (cancelled) return;
      setFavicons(new Map(urls.map((u, i) => [cfg.sizes[i], u])));
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
    // Re-render if any styling/timezone props change
  }, [
    props.timeZone,
    props.sizes?.join(","),
    props.baseSize,
    props.bgTop,
    props.bgBottom,
    props.topBar,
    props.ring,
    props.text,
    props.className,
  ]);

  return null; // purely side-effect component
}
