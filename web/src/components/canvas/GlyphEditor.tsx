import { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark } from '@fortawesome/free-solid-svg-icons';

export function GlyphEditor({ initial, onSave, onClose }: { initial: string | null; onSave: (dataUrl: string) => void; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [brush, setBrush] = useState(4);
  const [erasing, setErasing] = useState(false);
  const drawing = useRef(false);

  useEffect(() => {
    const c = canvasRef.current!;
    const ctx = c.getContext('2d')!;
    // white bg
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    if (initial) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, c.width, c.height);
      img.src = initial;
    }
  }, [initial]);

  const pos = (e: React.PointerEvent) => {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    const scaleX = c.width / rect.width;
    const scaleY = c.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  const down = (e: React.PointerEvent) => {
    drawing.current = true;
    (e.target as Element).setPointerCapture(e.pointerId);
    draw(e);
  };
  const up = () => (drawing.current = false);
  const draw = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const c = canvasRef.current!;
    const ctx = c.getContext('2d')!;
    const { x, y } = pos(e);
    ctx.fillStyle = erasing ? '#fff' : '#0f172a';
    ctx.beginPath();
    ctx.arc(x, y, brush, 0, Math.PI * 2);
    ctx.fill();
    // connect for smooth
    ctx.strokeStyle = erasing ? '#fff' : '#0f172a';
    ctx.lineWidth = brush * 2;
    ctx.lineCap = 'round';
    // we store last point
  };

  const clear = () => {
    const c = canvasRef.current!;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
  };

  const save = () => {
    const c = canvasRef.current!;
    onSave(c.toDataURL('image/png'));
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 16, width: 420, maxWidth: '100%', boxShadow: '0 20px 60px rgba(0,0,0,.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <strong>绘制字形 · 黑白位图</strong>
          <button className="ghost" onClick={onClose}><FontAwesomeIcon icon={faXmark} /></button>
        </div>
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
          <canvas
            ref={canvasRef}
            width={256}
            height={256}
            style={{ width: '100%', height: 'auto', display: 'block', touchAction: 'none', cursor: 'crosshair' }}
            onPointerDown={down}
            onPointerUp={up}
            onPointerMove={draw}
            onPointerLeave={up}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
            笔刷 <input type="range" min={2} max={14} value={brush} onChange={e => setBrush(Number(e.target.value))} />
          </label>
          <button className={`pill ${erasing ? '' : 'active'}`} onClick={() => setErasing(false)}>画笔</button>
          <button className={`pill ${erasing ? 'active' : ''}`} onClick={() => setErasing(true)}>橡皮</button>
          <button className="pill" onClick={clear}>清空</button>
          <span style={{ flex: 1 }} />
          <button className="pill active" onClick={save}>保存</button>
        </div>
      </div>
    </div>
  );
}
