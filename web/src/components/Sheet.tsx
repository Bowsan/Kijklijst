import { useRef, useState, type ReactNode, type TouchEvent } from 'react';

export default function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const [dragY, setDragY] = useState(0);
  const startY = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const onTouchStart = (e: TouchEvent) => {
    // Alleen slepen als je bovenaan de inhoud staat — anders gewoon scrollen.
    if ((scrollRef.current?.scrollTop ?? 0) <= 0) startY.current = e.touches[0].clientY;
    else startY.current = null;
  };
  const onTouchMove = (e: TouchEvent) => {
    if (startY.current == null) return;
    const dy = e.touches[0].clientY - startY.current;
    setDragY(dy > 0 ? dy : 0);
  };
  const onTouchEnd = () => {
    if (dragY > 110) onClose();
    setDragY(0);
    startY.current = null;
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        onClick={(e) => e.stopPropagation()}
        ref={scrollRef}
        style={dragY ? { transform: `translateY(${dragY}px)`, transition: 'none' } : undefined}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div className="sheet-handle" onClick={onClose} />
        <button className="sheet-close" aria-label="Sluiten" onClick={onClose}>✕</button>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}
