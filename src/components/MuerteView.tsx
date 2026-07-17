import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { db, Animal } from '../db';
import { soundSystem } from '../sounds';
import { ScanLine, Skull, AlertTriangle, CheckCircle2, X } from 'lucide-react';

export function MuerteView() {
  const [rfid, setRfid] = useState('');
  const [lastDeleted, setLastDeleted] = useState<Animal | null>(null);
  const [pendingAnimal, setPendingAnimal] = useState<Animal | null>(null); // animal esperando confirmación
  const scannerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const focusScanner = () => {
      if (
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'SELECT' &&
        document.activeElement?.tagName !== 'TEXTAREA' &&
        document.activeElement?.tagName !== 'BUTTON'
      ) {
        scannerRef.current?.focus();
      }
    };
    const interval = setInterval(focusScanner, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleScan = async (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const code = rfid.trim();
      setRfid('');
      if (code.length !== 15 || !/^\d+$/.test(code)) {
        soundSystem.playError();
        return;
      }

      const existing = await db.getAnimal(code);
      if (existing) {
        // No borrar todavía — mostrar panel de confirmación
        setPendingAnimal(existing);
        setLastDeleted(null);
        soundSystem.playNewAnimal(); // sonido neutro de alerta
      } else {
        soundSystem.playError();
        alert('El animal no existe en la base de datos.');
      }
    }
  };

  const confirmDelete = async () => {
    if (!pendingAnimal) return;
    await db.deleteAnimal(pendingAnimal.id);
    setLastDeleted(pendingAnimal);
    setPendingAnimal(null);
    soundSystem.playSuccess();
    setTimeout(() => scannerRef.current?.focus(), 100);
  };

  const cancelDelete = () => {
    setPendingAnimal(null);
    setTimeout(() => scannerRef.current?.focus(), 100);
  };

  return (
    <div className="view-container">
      <header className="view-header">
        <h1>Baja por Muerte / Descarte</h1>
      </header>

      <div className="glass-panel p-6 flex-col items-center text-center max-w-xl mx-auto mt-10">
        <Skull size={48} className="text-danger mb-4" />
        <h2 className="text-xl mb-2">Dar de Baja Animal</h2>
        <p className="text-sm text-muted mb-6">
          Escanee la caravana del animal. Se pedirá <strong>confirmación</strong> antes de eliminar.
        </p>

        <div className="form-group relative w-full mb-6">
          <div className="flex items-center gap-2">
            <ScanLine size={20} className="text-accent" />
            <input
              ref={scannerRef}
              type="text"
              className="input-field flex-1 font-mono text-lg bg-red-900/10 border-danger/50 focus:bg-red-900/30"
              placeholder="Escanee la caravana"
              value={rfid}
              onChange={(e) => setRfid(e.target.value)}
              onKeyDown={handleScan}
            />
          </div>
        </div>

        {/* ── Panel de confirmación ──────────────────────────────────────── */}
        {pendingAnimal && (
          <div style={{
            width: '100%',
            background: 'rgba(239,68,68,0.1)',
            border: '2px solid rgba(239,68,68,0.6)',
            borderRadius: '14px',
            padding: '1.25rem',
            marginBottom: '1rem',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center', marginBottom: '0.75rem' }}>
              <AlertTriangle size={22} style={{ color: '#f87171' }} />
              <span style={{ color: '#f87171', fontWeight: 700, fontSize: '1rem' }}>¿Confirmar baja?</span>
            </div>

            <p className="font-mono text-white text-2xl font-bold mb-3">{pendingAnimal.id}</p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '1.25rem' }}>
              <span>Sexo: <strong className="text-white">{pendingAnimal.sex}</strong></span>
              <span>Raza: <strong className="text-white">{pendingAnimal.breed}</strong></span>
              <span>Color: <strong className="text-white">{pendingAnimal.color}</strong></span>
              {pendingAnimal.renspa && <span>RENSPA: <strong className="text-white">{pendingAnimal.renspa}</strong></span>}
            </div>

            <p style={{ fontSize: '0.8rem', color: '#f87171', marginBottom: '1rem' }}>
              ⚠️ Esta acción es irreversible. El animal será eliminado del padrón de Cría.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <button
                onClick={cancelDelete}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: '10px',
                  padding: '0.7rem',
                  color: '#94a3b8',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
              >
                <X size={18} /> Cancelar
              </button>
              <button
                onClick={confirmDelete}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                  background: 'rgba(239,68,68,0.2)',
                  border: '1.5px solid rgba(239,68,68,0.7)',
                  borderRadius: '10px',
                  padding: '0.7rem',
                  color: '#f87171',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.35)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.2)')}
              >
                <Skull size={18} /> Confirmar Baja
              </button>
            </div>
          </div>
        )}

        {/* ── Animal eliminado con éxito ─────────────────────────────────── */}
        {lastDeleted && !pendingAnimal && (
          <div style={{
            width: '100%',
            background: 'rgba(52,211,153,0.08)',
            border: '1px solid rgba(52,211,153,0.3)',
            borderRadius: '12px',
            padding: '1rem',
            textAlign: 'left',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <CheckCircle2 size={18} style={{ color: '#34d399' }} />
              <span style={{ color: '#34d399', fontWeight: 700 }}>Animal dado de baja correctamente</span>
            </div>
            <p className="font-mono text-white text-xl mb-2">{lastDeleted.id}</p>
            <div className="flex gap-4 text-sm text-muted">
              <span>Sexo: {lastDeleted.sex}</span>
              <span>Raza: {lastDeleted.breed}</span>
              <span>Color: {lastDeleted.color}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
