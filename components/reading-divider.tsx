import type { PointerEvent } from 'react';
export default function ReadingDivider({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  function move(e: PointerEvent<HTMLHRElement>) {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const box = e.currentTarget.parentElement!.getBoundingClientRect();
    onChange(
      Math.max(
        40,
        Math.min(70, Math.round(((e.clientX - box.left) / box.width) * 100)),
      ),
    );
  }
  return (
    /* The focusable separator is adjustable with arrow keys, Home and End. */
    /* oxlint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */
    <hr
      className="reading-divider"
      tabIndex={0}
      aria-label="调整原文与笔记宽度"
      aria-orientation="vertical"
      aria-valuemin={40}
      aria-valuemax={70}
      aria-valuenow={value}
      title="左右拖动，或用方向键调整宽度"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={move}
      onPointerUp={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId))
          e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onKeyDown={(e) => {
        if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
          e.preventDefault();
          onChange(
            e.key === 'Home'
              ? 40
              : e.key === 'End'
                ? 70
                : Math.max(
                    40,
                    Math.min(70, value + (e.key === 'ArrowLeft' ? -2 : 2)),
                  ),
          );
        }
      }}
    />
  );
}
