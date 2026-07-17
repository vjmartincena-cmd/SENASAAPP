import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { db, NovedadSanidad, Sesion } from '../db';
import { soundSystem } from '../sounds';
import { ScanLine, AlertCircle, CheckCircle2, Trash2, AlertTriangle, History, Layers, ChevronDown } from 'lucide-react';

const LS_TUBES_KEY    = 'senasa_buscar_tubos';
const LS_SCANNED_KEY  = 'senasa_buscar_escaneados';
const LS_SESSION_KEY  = 'senasa_buscar_sesion';

interface ScannedEntry {
  id: string;
  time: string;
  status: 'positive' | 'negative' | 'duplicate' | 'not_in_session';
}

function loadFromLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

function formatDate(d: string) {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

export function BuscarVacaView() {
  // ── Sesiones de Sanidad ────────────────────────────────────────────────────
  const [sanidadSesiones, setSanidadSesiones] = useState<Sesion[]>([]);
  const [selectedSesionId, setSelectedSesionId] = useState<string>(() =>
    loadFromLS<string>(LS_SESSION_KEY, '')
  );
  // Mapa animalId → tubeNumber para la sesión seleccionada
  const [sesionMap, setSesionMap] = useState<Record<string, number>>({});

  // ── Tubos positivos ────────────────────────────────────────────────────────
  const [tubeInput, setTubeInput] = useState('');
  const [targetTubes, setTargetTubes] = useState<number[]>(() =>
    loadFromLS<number[]>(LS_TUBES_KEY, [])
  );

  // ── Escaneo ────────────────────────────────────────────────────────────────
  const [rfid, setRfid] = useState('');
  const [lastEntry, setLastEntry] = useState<ScannedEntry | null>(null);
  const [scannedLog, setScannedLog] = useState<ScannedEntry[]>(() =>
    loadFromLS<ScannedEntry[]>(LS_SCANNED_KEY, [])
  );

  const scannerRef = useRef<HTMLInputElement>(null);

  // ── Cargar sesiones ────────────────────────────────────────────────────────
  useEffect(() => {
    db.getSesionesByType('Sanidad').then(ses => {
      ses.sort((a, b) => b.startedAt - a.startedAt);
      setSanidadSesiones(ses);
    });
  }, []);

  // ── Cargar mapa de la sesión seleccionada ──────────────────────────────────
  useEffect(() => {
    localStorage.setItem(LS_SESSION_KEY, JSON.stringify(selectedSesionId));
    if (!selectedSesionId) { setSesionMap({}); return; }
    db.getNovedadesBySession(selectedSesionId).then(novs => {
      const map: Record<string, number> = {};
      (novs.filter(n => n.type === 'Sanidad') as NovedadSanidad[]).forEach((s) => {
        map[s.animalId] = s.tubeNumber;
      });
      setSesionMap(map);
    });
  }, [selectedSesionId]);

  // ── Persistencia ───────────────────────────────────────────────────────────
  useEffect(() => { localStorage.setItem(LS_TUBES_KEY, JSON.stringify(targetTubes)); }, [targetTubes]);
  useEffect(() => { localStorage.setItem(LS_SCANNED_KEY, JSON.stringify(scannedLog)); }, [scannedLog]);

  // ── Foco automático en scanner ─────────────────────────────────────────────
  useEffect(() => {
    const focusScanner = () => {
      if (
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'SELECT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) { scannerRef.current?.focus(); }
    };
    const interval = setInterval(focusScanner, 1000);
    return () => clearInterval(interval);
  }, []);

  // ── Gestión de tubos positivos ─────────────────────────────────────────────
  const addTube = () => {
    const num = parseInt(tubeInput.trim());
    if (!isNaN(num) && num > 0 && !targetTubes.includes(num)) {
      setTargetTubes(prev => [...prev, num].sort((a, b) => a - b));
    }
    setTubeInput('');
  };

  const removeTube = (num: number) => setTargetTubes(prev => prev.filter(t => t !== num));

  const clearTubes = () => {
    if (confirm('¿Limpiar la lista de tubos positivos?')) setTargetTubes([]);
  };

  const clearScanned = () => {
    if (confirm('¿Limpiar el historial de escaneos?')) {
      setScannedLog([]);
      setLastEntry(null);
    }
  };

  // ── Escaneo ────────────────────────────────────────────────────────────────
  const handleScan = async (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const code = rfid.trim();
    setRfid('');

    if (code.length !== 15 || !/^\d+$/.test(code)) {
      soundSystem.playError();
      return;
    }

    const time = new Date().toLocaleTimeString('es-AR', {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });

    // 1. Duplicado en esta sesión de búsqueda
    if (scannedLog.some(e => e.id === code)) {
      soundSystem.playError();
      const entry: ScannedEntry = { id: code, time, status: 'duplicate' };
      setLastEntry(entry);
      setScannedLog(prev => [entry, ...prev]);
      return;
    }

    // 2. Debe haber sesión seleccionada
    if (!selectedSesionId) {
      soundSystem.playError();
      alert('Seleccioná una sesión de Sanidad antes de escanear.');
      return;
    }

    // 3. Verificar si el animal está en la sesión
    const tubeNumber = sesionMap[code];
    if (tubeNumber === undefined) {
      // Animal NO está en la sesión seleccionada
      soundSystem.playError();
      const entry: ScannedEntry = { id: code, time, status: 'not_in_session' };
      setLastEntry(entry);
      setScannedLog(prev => [entry, ...prev]);
      return;
    }

    // 4. Está en la sesión → verificar si su tubo es positivo
    if (targetTubes.includes(tubeNumber)) {
      soundSystem.playAlarm();
      const entry: ScannedEntry = { id: code, time, status: 'positive' };
      setLastEntry(entry);
      setScannedLog(prev => [entry, ...prev]);
    } else {
      soundSystem.playNegativeMatch();
      const entry: ScannedEntry = { id: code, time, status: 'negative' };
      setLastEntry(entry);
      setScannedLog(prev => [entry, ...prev]);
    }
  };

  const positiveCount      = scannedLog.filter(e => e.status === 'positive').length;
  const negativeCount      = scannedLog.filter(e => e.status === 'negative').length;
  const duplicateCount     = scannedLog.filter(e => e.status === 'duplicate').length;
  const notInSessionCount  = scannedLog.filter(e => e.status === 'not_in_session').length;

  const selectedSesion = sanidadSesiones.find(s => s.id === selectedSesionId);
  const sesionAnimalCount = Object.keys(sesionMap).length;

  return (
    <div className="view-container">
      <header className="view-header">
        <h1>Buscar Vaca (Positivos Laboratorio)</h1>
      </header>

      <div className="grid-2-col">

        {/* ── Columna izquierda ──────────────────────────────────────────── */}
        <div className="glass-panel p-6 flex-col gap-5">
          <h2 className="text-lg font-semibold text-accent">Configurar Búsqueda</h2>

          {/* Selector de sesión */}
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Layers size={14} style={{ color: '#15803d' }} /> Sesión de Sanidad
            </label>
            <div style={{ position: 'relative' }}>
              <select
                className="input-field"
                value={selectedSesionId}
                onChange={e => setSelectedSesionId(e.target.value)}
                style={{ paddingRight: '2.5rem', appearance: 'none', fontWeight: selectedSesionId ? 600 : 400 }}
              >
                <option value="">— Seleccioná una sesión —</option>
                {sanidadSesiones.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.label ? `${s.label} — ` : ''}{formatDate(s.date)} · {s.count} animales
                  </option>
                ))}
              </select>
              <ChevronDown size={15} style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-color)', pointerEvents: 'none' }} />
            </div>
            {selectedSesionId && (
              <p style={{ fontSize: '0.75rem', color: '#15803d', marginTop: '0.35rem', fontWeight: 600 }}>
                ✓ {sesionAnimalCount} animales cargados de la sesión
              </p>
            )}
            {sanidadSesiones.length === 0 && (
              <p style={{ fontSize: '0.75rem', color: 'var(--text-color)', marginTop: '0.3rem' }}>
                No hay sesiones de Sanidad registradas.
              </p>
            )}
          </div>

          {/* Input de tubos positivos */}
          <div className="form-group">
            <label>Tubos Positivos del Laboratorio</label>
            <div className="flex gap-2">
              <input
                type="number"
                className="input-field flex-1"
                placeholder="Ej. 15"
                value={tubeInput}
                onChange={e => setTubeInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addTube()}
              />
              <button className="btn btn-primary" onClick={addTube}>Agregar</button>
            </div>
          </div>

          {/* Lista de tubos positivos */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <h3 className="text-sm font-semibold">Tubos positivos ({targetTubes.length}):</h3>
              {targetTubes.length > 0 && (
                <button
                  onClick={clearTubes}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.3rem',
                    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                    borderRadius: '6px', padding: '0.25rem 0.6rem',
                    color: '#dc2626', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600,
                  }}
                >
                  <Trash2 size={13} /> Limpiar
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {targetTubes.map(t => (
                <div
                  key={t}
                  onClick={() => removeTube(t)}
                  title="Click para quitar"
                  style={{
                    background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.5)',
                    borderRadius: '99px', padding: '0.2rem 0.7rem',
                    color: '#dc2626', fontWeight: 700, fontSize: '0.82rem',
                    cursor: 'pointer',
                  }}
                >
                  #{t} ×
                </div>
              ))}
              {targetTubes.length === 0 && (
                <span className="text-sm text-muted">Ninguno ingresado aún.</span>
              )}
            </div>
          </div>

          {/* Resumen de sesión de búsqueda */}
          {scannedLog.length > 0 && (
            <div style={{ padding: '0.75rem', background: 'rgba(0,0,0,0.05)', borderRadius: '10px', border: '1px solid rgba(0,0,0,0.15)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-color)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <History size={13} /> Resumen
                </span>
                <button
                  onClick={clearScanned}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'transparent', border: '1px solid rgba(0,0,0,0.15)', borderRadius: '6px', padding: '0.2rem 0.5rem', color: 'var(--text-color)', cursor: 'pointer', fontSize: '0.72rem' }}
                >
                  <Trash2 size={11} /> Limpiar
                </button>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <div style={{ textAlign: 'center', minWidth: '50px' }}>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#dc2626' }}>{positiveCount}</div>
                  <div style={{ fontSize: '0.62rem', color: 'var(--text-color)' }}>POSITIVAS</div>
                </div>
                <div style={{ textAlign: 'center', minWidth: '50px' }}>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#15803d' }}>{negativeCount}</div>
                  <div style={{ fontSize: '0.62rem', color: 'var(--text-color)' }}>NEGATIVAS</div>
                </div>
                {notInSessionCount > 0 && (
                  <div style={{ textAlign: 'center', minWidth: '50px' }}>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#92400e' }}>{notInSessionCount}</div>
                    <div style={{ fontSize: '0.62rem', color: 'var(--text-color)' }}>FUERA SESIÓN</div>
                  </div>
                )}
                {duplicateCount > 0 && (
                  <div style={{ textAlign: 'center', minWidth: '50px' }}>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#b45309' }}>{duplicateCount}</div>
                    <div style={{ fontSize: '0.62rem', color: 'var(--text-color)' }}>DUPLICADAS</div>
                  </div>
                )}
                <div style={{ textAlign: 'center', minWidth: '50px' }}>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1d4ed8' }}>{scannedLog.length}</div>
                  <div style={{ fontSize: '0.62rem', color: 'var(--text-color)' }}>TOTAL</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Columna derecha ────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* Panel de escaneo */}
          <div className="glass-panel p-6 flex-col items-center justify-center text-center relative">
            {lastEntry?.status === 'positive' && (
              <div className="absolute inset-0 bg-red-500/20 rounded-xl pointer-events-none animate-pulse border-4 border-red-500" />
            )}
            {lastEntry?.status === 'not_in_session' && (
              <div className="absolute inset-0 rounded-xl pointer-events-none border-4 border-yellow-500" style={{ background: 'rgba(245,158,11,0.12)' }} />
            )}
            {lastEntry?.status === 'duplicate' && (
              <div className="absolute inset-0 rounded-xl pointer-events-none border-4 border-orange-500" style={{ background: 'rgba(249,115,22,0.12)' }} />
            )}

            <ScanLine size={48} className="text-accent mb-4" />
            <h2 className="text-xl mb-2">Escanear Manga</h2>
            <p className="text-sm text-muted mb-4">
              {selectedSesionId
                ? `Sesión: ${selectedSesion?.label || formatDate(selectedSesion?.date || '')} · ${sesionAnimalCount} animales`
                : <span style={{ color: '#92400e' }}>⚠️ Seleccioná una sesión de Sanidad</span>}
            </p>

            <input
              ref={scannerRef}
              type="text"
              className="scanner-input w-full max-w-sm mb-4"
              placeholder="Esperando lectura..."
              value={rfid}
              onChange={e => setRfid(e.target.value)}
              onKeyDown={handleScan}
            />

            {/* Resultado del último escaneo */}
            {lastEntry && (() => {
              const { id, status } = lastEntry;
              if (status === 'positive') return (
                <div style={{ width: '100%', maxWidth: '24rem', padding: '1rem', borderRadius: '10px', background: 'rgba(239,68,68,0.25)', border: '2px solid #ef4444' }}>
                  <p className="font-mono text-lg font-bold mb-1">{id}</p>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: '#dc2626', fontWeight: 700, fontSize: '1.1rem' }}>
                    <AlertCircle size={22} /> ¡POSITIVA! SEPARAR
                  </div>
                  <p style={{ fontSize: '0.75rem', color: '#fca5a5', marginTop: '0.4rem' }}>
                    Tubo #{sesionMap[id]} — en lista de positivos
                  </p>
                </div>
              );
              if (status === 'negative') return (
                <div style={{ width: '100%', maxWidth: '24rem', padding: '1rem', borderRadius: '10px', background: 'rgba(52,211,153,0.12)', border: '1.5px solid #34d399' }}>
                  <p className="font-mono text-lg font-bold mb-1">{id}</p>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: '#15803d', fontWeight: 700, fontSize: '1.1rem' }}>
                    <CheckCircle2 size={22} /> NEGATIVA — Pasa
                  </div>
                  <p style={{ fontSize: '0.75rem', color: '#6ee7b7', marginTop: '0.4rem' }}>
                    Tubo #{sesionMap[id]}
                  </p>
                </div>
              );
              if (status === 'not_in_session') return (
                <div style={{ width: '100%', maxWidth: '24rem', padding: '1rem', borderRadius: '10px', background: 'rgba(245,158,11,0.15)', border: '2px solid #f59e0b' }}>
                  <p className="font-mono text-lg font-bold mb-1">{id}</p>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: '#92400e', fontWeight: 700, fontSize: '1rem' }}>
                    <AlertTriangle size={22} /> NO ESTÁ EN ESTA SESIÓN
                  </div>
                  <p style={{ fontSize: '0.75rem', color: '#fde68a', marginTop: '0.4rem' }}>
                    Este animal no fue sanidado en la sesión seleccionada.
                  </p>
                </div>
              );
              if (status === 'duplicate') return (
                <div style={{ width: '100%', maxWidth: '24rem', padding: '1rem', borderRadius: '10px', background: 'rgba(249,115,22,0.15)', border: '2px solid #f97316' }}>
                  <p className="font-mono text-lg font-bold mb-1">{id}</p>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: '#fb923c', fontWeight: 700, fontSize: '1rem' }}>
                    <AlertTriangle size={22} /> ¡DUPLICADO — YA ESCANEADO!
                  </div>
                </div>
              );
              return null;
            })()}
          </div>

          {/* Log de escaneos */}
          {scannedLog.length > 0 && (
            <div className="glass-panel p-4" style={{ maxHeight: '320px', overflowY: 'auto' }}>
              <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-color)', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <History size={14} /> Historial ({scannedLog.length})
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                {scannedLog.map((entry, idx) => {
                  const cfg = {
                    positive:       { clr: '#dc2626', bg: 'rgba(248,113,113,0.08)', label: '🔴 POSITIVA' },
                    negative:       { clr: '#15803d', bg: 'rgba(52,211,153,0.06)',  label: '🟢 NEGATIVA' },
                    not_in_session: { clr: '#92400e', bg: 'rgba(245,158,11,0.08)',  label: '🟡 FUERA SESIÓN' },
                    duplicate:      { clr: '#b45309', bg: 'rgba(249,115,22,0.08)',  label: '🟠 DUPLICADO' },
                  }[entry.status];
                  return (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.4rem 0.75rem', background: cfg.bg, borderRadius: '7px', fontSize: '0.8rem', border: `1px solid ${cfg.clr}20` }}>
                      <span style={{ fontFamily: 'monospace', color: 'var(--text-color)', flex: 1, fontWeight: 600 }}>{entry.id}</span>
                      <span style={{ color: cfg.clr, fontWeight: 700, fontSize: '0.72rem', flexShrink: 0 }}>{cfg.label}</span>
                      <span style={{ color: 'var(--text-color)', fontSize: '0.7rem', flexShrink: 0 }}>{entry.time}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
