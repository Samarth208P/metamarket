import type { CSSProperties, PointerEvent, ReactNode } from "react";
import "./MagicBento.css";

export type MagicBentoItem = {
  id: string;
  content: ReactNode;
  colSpan?: number;
  accent?: string;
};

function positionSpotlight(event: PointerEvent<HTMLDivElement>) {
  if (
    event.pointerType !== "mouse" ||
    !window.matchMedia(
      "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)",
    ).matches
  )
    return;
  const tile = event.currentTarget;
  const light = tile.querySelector<HTMLElement>(".magic-bento__light");
  if (!light) return;
  const rect = tile.getBoundingClientRect();
  light.style.transform = `translate(${event.clientX - rect.left}px, ${event.clientY - rect.top}px)`;
}

export function MagicBento({ items }: { items: MagicBentoItem[] }) {
  return (
    <div className="magic-bento">
      {items.map(({ id, content, colSpan = 4, accent }) => (
        <div
          key={id}
          className="magic-bento__tile"
          onPointerMove={positionSpotlight}
          style={
            {
              "--bento-span": colSpan,
              "--bento-accent": accent,
            } as CSSProperties
          }
        >
          <div aria-hidden="true" className="magic-bento__effects">
            <span className="magic-bento__light" />
          </div>
          <div className="magic-bento__content">{content}</div>
        </div>
      ))}
    </div>
  );
}
