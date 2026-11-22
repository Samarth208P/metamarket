import {
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from "react";
import "./MagicBento.css";

export type MagicBentoItem = {
  id: string;
  content: ReactNode;
  colSpan?: number;
  accent?: string;
};

const spotlightRadius = 240;
const rippleRadius = 310;

function tilesNearPoint(
  grid: HTMLDivElement,
  clientX: number,
  clientY: number,
  radius: number,
) {
  return Array.from(grid.children, (tile: HTMLElement) => {
    const rect = tile.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const distance = Math.hypot(
      Math.max(-x, x - rect.width, 0),
      Math.max(-y, y - rect.height, 0),
    );
    return { tile, x, y, distance };
  }).filter(({ distance }) => distance < radius);
}

export function MagicBento({ items }: { items: MagicBentoItem[] }) {
  const frame = useRef<number>();
  const litTiles = useRef(new Set<HTMLElement>());

  const clearSpotlight = useCallback(() => {
    cancelAnimationFrame(frame.current);
    for (const tile of litTiles.current) delete tile.dataset.lit;
    litTiles.current.clear();
  }, []);

  useEffect(() => {
    window.addEventListener("resize", clearSpotlight);
    window.addEventListener("scroll", clearSpotlight, {
      capture: true,
      passive: true,
    });
    return () => {
      clearSpotlight();
      window.removeEventListener("resize", clearSpotlight);
      window.removeEventListener("scroll", clearSpotlight, true);
    };
  }, [clearSpotlight]);

  function moveSpotlight(event: PointerEvent<HTMLDivElement>) {
    const {
      clientX,
      clientY,
      currentTarget: grid,
      pointerType,
      target,
    } = event;
    if (pointerType === "touch" || !grid.contains(target as Node)) return;

    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const next = new Set<HTMLElement>();
      for (const { tile, x, y } of tilesNearPoint(
        grid,
        clientX,
        clientY,
        spotlightRadius,
      )) {
        tile.style.setProperty("--bento-x", `${x}px`);
        tile.style.setProperty("--bento-y", `${y}px`);
        tile.dataset.lit = "";
        next.add(tile);
      }
      for (const tile of litTiles.current) {
        if (!next.has(tile)) delete tile.dataset.lit;
      }
      litTiles.current = next;
    });
  }

  function playRipple(event: PointerEvent<HTMLDivElement>) {
    const { clientX, clientY, currentTarget: grid, button, target } = event;
    if (
      button !== 0 ||
      !(target instanceof Element) ||
      !grid.contains(target) ||
      target === grid ||
      target.closest("[data-bento-no-ripple]") ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;

    for (const { tile, x, y } of tilesNearPoint(
      grid,
      clientX,
      clientY,
      rippleRadius,
    )) {
      const ripple = tile.querySelector<HTMLElement>(".magic-bento__ripple");
      if (!ripple?.animate) continue;

      ripple.getAnimations().forEach((animation) => animation.cancel());
      ripple.style.left = `${x}px`;
      ripple.style.top = `${y}px`;
      ripple.animate(
        [
          { transform: "translate(-50%, -50%) scale(0.04)", opacity: 0.58 },
          { transform: "translate(-50%, -50%) scale(1)", opacity: 0 },
        ],
        { duration: 540, easing: "cubic-bezier(0.2, 0.65, 0.35, 1)" },
      );
    }
  }

  return (
    <div
      className="magic-bento"
      style={
        { "--bento-spotlight-radius": `${spotlightRadius}px` } as CSSProperties
      }
      onPointerMove={moveSpotlight}
      onPointerLeave={clearSpotlight}
      onPointerCancel={clearSpotlight}
      onPointerDown={playRipple}
    >
      {items.map(({ id, content, colSpan = 4, accent }) => (
        <div
          key={id}
          className="magic-bento__tile"
          style={
            {
              "--bento-span": colSpan,
              "--bento-accent": accent,
            } as CSSProperties
          }
        >
          <div className="magic-bento__effects" aria-hidden="true">
            <span
              className="magic-bento__ripple"
              style={{ width: rippleRadius * 2 }}
            />
          </div>
          <div className="magic-bento__content">{content}</div>
        </div>
      ))}
    </div>
  );
}
