import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { db, AppConfig, Animal, NovedadIA, Sesion, Novedad, NovedadType } from '../db';
import { soundSystem } from '../sounds';
import {
  ScanLine, Save, AlertTriangle, Hash, Plus, ChevronDown, ChevronRight,
  Clock, Calendar, Layers, ArrowRight, Trash2
} from 'lucide-react';

interface NovedadesViewProps {
  config: AppConfig;
}

type TabType = NovedadType; // 'Sanidad' | 'IA' | 'Tacto'

// ── Helpers ──────────────────────────────────────────────────────────────────
const TAB_LABEL: Record<TabType, string> = {
  Sanidad: 'Sanidad',
  IA: 'Inseminación (IA)',
  Tacto: 'Tacto',
};

const TAB_COLOR: Record<TabType, string> = {
  Sanidad: '#15803d',
  IA: '#1d4ed8',
  Tacto: '#8a1a49',
};

function formatDate(d: string) {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

// ── Componente principal ─────────────────────────────────────────────────────
export function NovedadesView({ config }: NovedadesViewProps) {
  const [activeTab, setActiveTab] = useState<TabType>('Sanidad');

  // ── Sesión activa ──────────────────────────────────────────────────────────
  const [currentSession, setCurrentSession] = useState<Sesion | null>(null);
  const [sessionCount, setSessionCount] = useState(0);

  // ── Modal inicio de sesión ─────────────────────────────────────────────────
  const [showStartModal, setShowStartModal] = useState(false);
  const [pendingTab, setPendingTab] = useState<TabType>('Sanidad');
  const [modalDate, setModalDate] = useState('');
  const [modalLabel, setModalLabel] = useState('');
  const [prevSessions, setPrevSessions] = useState<Sesion[]>([]);
  const [loadingPrev, setLoadingPrev] = useState(false);

  // ── Escaneo ────────────────────────────────────────────────────────────────
  const [rfid, setRfid] = useState('');
  const [currentAnimal, setCurrentAnimal] = useState<Animal | null>(null);
  const [date, setDate] = useState(() =>
    localStorage.getItem('senasa_novedades_date') || new Date().toISOString().split('T')[0]
  );

  // ── Campos específicos ─────────────────────────────────────────────────────
  const [bull, setBull] = useState(config.bulls[0] || '');
  const [tactoResult, setTactoResult] = useState<'Vacía' | 'Rechazo'>('Vacía');
  const [tactoObs, setTactoObs] = useState('');
  const [iaWarning, setIaWarning] = useState('');
  const [lastIAData, setLastIAData] = useState<{ date: string; bull: string } | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [currentRodeo, setCurrentRodeo] = useState('');

  // ── Modal animal no registrado ─────────────────────────────────────────────
  const [showAnimalModal, setShowAnimalModal] = useState(false);
  const [pendingCode, setPendingCode] = useState('');
  const [newSex, setNewSex] = useState('H');
  const [newBreed, setNewBreed] = useState('AA');
  const [newColor, setNewColor] = useState(config.colors[0] || '');
  const [newRenspa, setNewRenspa] = useState(config.renspas[0] || '');
  const [newBirthDate, setNewBirthDate] = useState('');

  // ── Panel sesiones previas ─────────────────────────────────────────────────
  const [allSessions, setAllSessions] = useState<Sesion[]>([]);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [sessionNovedades, setSessionNovedades] = useState<Record<string, Novedad[]>>({});

  const scannerRef = useRef<HTMLInputElement>(null);
  const modalDateRef = useRef<HTMLInputElement>(null);

  // ── Persist date ───────────────────────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem('senasa_novedades_date', date);
  }, [date]);

  // ── Focus scanner ──────────────────────────────────────────────────────────
  useEffect(() => {
    const focusScanner = () => {
      if (
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'SELECT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        scannerRef.current?.focus();
      }
    };
    const interval = setInterval(focusScanner, 1000);
    return () => clearInterval(interval);
  }, []);

  // ── Cargar historial de sesiones al montar ─────────────────────────────────
  useEffect(() => {
    loadAllSessions();
  }, []);

  const loadAllSessions = async () => {
    const all = await db.getAllSesiones();
    all.sort((a, b) => b.startedAt - a.startedAt);
    setAllSessions(all);
  };

  // ── Abrir modal de inicio de sesión ───────────────────────────────────────
  const openStartModal = async (tab: TabType) => {
    setPendingTab(tab);
    setModalDate(new Date().toISOString().split('T')[0]);
    setModalLabel('');
    setLoadingPrev(true);
    setShowStartModal(true);

    const sessions = await db.getSesionesByType(tab);
    sessions.sort((a, b) => b.startedAt - a.startedAt);
    setPrevSessions(sessions.slice(0, 5)); // mostrar las últimas 5
    setLoadingPrev(false);

    setTimeout(() => modalDateRef.current?.focus(), 120);
  };

  // ── Click en tab ──────────────────────────────────────────────────────────
  const handleTabClick = (tab: TabType) => {
    // Si es la misma tab y ya hay sesión activa, no hacer nada
    if (tab === activeTab && currentSession) return;
    openStartModal(tab);
  };

  // ── Iniciar NUEVA sesión ──────────────────────────────────────────────────
  const startNewSession = async () => {
    const sesion: Sesion = {
      id: crypto.randomUUID(),
      type: pendingTab,
      date: modalDate,
      startedAt: Date.now(),
      count: 0,
      label: modalLabel.trim() || undefined,
    };
    await db.saveSesion(sesion);

    setDate(modalDate);
    setActiveTab(pendingTab);
    setCurrentSession(sesion);
    setSessionCount(0);
    setRfid('');
    setCurrentAnimal(null);
    setIaWarning('');
    setTactoObs('');
    setShowStartModal(false);
    await loadAllSessions();
    setTimeout(() => scannerRef.current?.focus(), 100);
  };

  // ── Continuar sesión existente ────────────────────────────────────────────
  const continueSession = async (ses: Sesion) => {
    setDate(ses.date);
    setActiveTab(ses.type);
    setCurrentSession(ses);
    setSessionCount(ses.count);
    setRfid('');
    setCurrentAnimal(null);
    setIaWarning('');
    setTactoObs('');
    setShowStartModal(false);
    await loadAllSessions();
    setTimeout(() => scannerRef.current?.focus(), 100);
  };

  // ── Escaneo ────────────────────────────────────────────────────────────────
  const handleScan = async (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    if (!currentSession) {
      // No hay sesión activa, abrir modal
      openStartModal(activeTab);
      return;
    }
    const code = rfid.trim();
    setRfid('');
    if (code.length !== 15 || !/^\d+$/.test(code)) {
      soundSystem.playError();
      return;
    }

    let animal = await db.getAnimal(code);
    if (!animal) {
      soundSystem.playNewAnimal();
      setPendingCode(code);
      setShowAnimalModal(true);
      return;
    } else {
      soundSystem.playSuccess();
      await continueWithAnimal(animal);
    }
  };

  const submitNewAnimal = async () => {
    const animal: Animal = {
      id: pendingCode,
      sex: newSex,
      breed: newBreed,
      color: newColor,
      renspa: newRenspa,
      birthDate: newBirthDate,
      createdAt: Date.now(),
      reportedToSenasa: false,
    };
    await db.saveAnimal(animal);
    setShowAnimalModal(false);
    await continueWithAnimal(animal);
  };

  const continueWithAnimal = async (animal: Animal) => {
    // ── Verificar duplicado en sesión activa ──────────────────────────────
    if (currentSession) {
      const sesNovs = await db.getNovedadesBySession(currentSession.id);
      const alreadyInSession = sesNovs.some(n => n.animalId === animal.id);
      if (alreadyInSession) {
        soundSystem.playError();
        setDuplicateWarning(`⚠️ ¡${animal.id} ya fue registrado en esta sesión!`);
        setTimeout(() => setDuplicateWarning(null), 4000);
        return;
      }
    }
    setDuplicateWarning(null);
    setCurrentAnimal(animal);

    if (activeTab === 'Tacto') {
      const novedades = await db.getNovedadesByAnimal(animal.id);
      const ias = novedades.filter(n => n.type === 'IA') as NovedadIA[];
      if (ias.length > 0) {
        ias.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const lastIA = ias[0];
        const iaDate = new Date(lastIA.date);
        const today = new Date(date);
        const months =
          (today.getFullYear() - iaDate.getFullYear()) * 12 +
          (today.getMonth() - iaDate.getMonth());
        if (months <= 9 && months >= 0) {
          setLastIAData({ date: lastIA.date, bull: lastIA.bull });
          setIaWarning(
            `Tiene una IA hace ${months} mes${months !== 1 ? 'es' : ''} — Toro: ${lastIA.bull} (${formatDate(lastIA.date)})`
          );
        } else {
          setLastIAData(null);
          setIaWarning('');
        }
      } else {
        setLastIAData(null);
        setIaWarning('');
      }
    } else {
      await executeSaveNovedad(animal);
    }
  };

  // executeSaveNovedad acepta result explícito para el caso Tacto (IA/Repaso)
  const executeSaveNovedad = async (animal: Animal, tactoResultOverride?: 'Preñada IA' | 'Preñada Repaso' | 'Vacía' | 'Rechazo') => {
    if (!currentSession) return;

    const newCount = sessionCount + 1;
    const baseNovedad = {
      id: crypto.randomUUID(),
      animalId: animal.id,
      date,
      timestamp: Date.now(),
      sessionId: currentSession.id,
      rodeo: currentRodeo.trim() || undefined,
    };

    try {
      if (activeTab === 'Sanidad') {
        const conf = await db.getConfig();
        let currentTube = conf.lastTubeNumber;
        if (conf.lastTubeDate !== date) {
          currentTube = 1;
        } else {
          currentTube++;
        }
        await db.saveConfig({ ...conf, lastTubeNumber: currentTube, lastTubeDate: date });
        await db.saveNovedad({ ...baseNovedad, type: 'Sanidad', tubeNumber: newCount });
      } else if (activeTab === 'IA') {
        await db.saveNovedad({ ...baseNovedad, type: 'IA', bull });
      } else if (activeTab === 'Tacto') {
        const finalResult = tactoResultOverride ?? tactoResult;
        await db.saveNovedad({
          ...baseNovedad,
          type: 'Tacto',
          result: finalResult,
          observation: tactoObs,
        });
      }

      // Actualizar contador en la sesión
      const updatedSession: Sesion = { ...currentSession, count: newCount };
      await db.saveSesion(updatedSession);
      setCurrentSession(updatedSession);
      setSessionCount(newCount);

      // Actualizar caché de novedades del panel si está expandido
      if (expandedSession === currentSession.id) {
        const sesNovs = await db.getNovedadesBySession(currentSession.id);
        sesNovs.sort((a, b) => a.timestamp - b.timestamp);
        setSessionNovedades(prev => ({ ...prev, [currentSession.id]: sesNovs }));
      }

      // Refrescar lista de sesiones en panel
      await loadAllSessions();

      soundSystem.playSuccess();
      setCurrentAnimal(null);
      setTactoObs('');
      setTactoResult('Vacía');
      setIaWarning('');
      setLastIAData(null);
      scannerRef.current?.focus();
    } catch (err) {
      console.error(err);
      soundSystem.playError();
      alert('Error guardando novedad');
    }
  };

  // Handler para guardar Vacía/Rechazo desde el botón manual
  const handleManualSaveTacto = async (result: 'Vacía' | 'Rechazo') => {
    if (currentAnimal) await executeSaveNovedad(currentAnimal, result);
  };

  // Handlers para botones IA / Repaso
  const handleSavePreniadaIA = async () => {
    if (currentAnimal) await executeSaveNovedad(currentAnimal, 'Preñada IA');
  };
  const handleSavePreniadaRepaso = async () => {
    if (currentAnimal) await executeSaveNovedad(currentAnimal, 'Preñada Repaso');
  };

  // handleManualSave ya no se usa directamente; reemplazado por handleManualSaveTacto y botones IA/Repaso

  // ── Expandir/colapsar sesión en panel ─────────────────────────────────────
  const toggleSession = async (sesId: string) => {
    if (expandedSession === sesId) {
      setExpandedSession(null);
      return;
    }
    setExpandedSession(sesId);
    if (!sessionNovedades[sesId]) {
      const novs = await db.getNovedadesBySession(sesId);
      novs.sort((a, b) => a.timestamp - b.timestamp);
      setSessionNovedades(prev => ({ ...prev, [sesId]: novs }));
    }
  };

  const handleDeleteSession = async (sesId: string) => {
    if (window.confirm("¿Seguro que deseas eliminar esta sesión y todos sus registros asociados? Esta acción no se puede deshacer.")) {
      await db.deleteSesion(sesId);
      if (currentSession?.id === sesId) {
        setCurrentSession(null);
        setSessionCount(0);
      }
      if (expandedSession === sesId) {
        setExpandedSession(null);
      }
      await loadAllSessions();
      soundSystem.playSuccess();
    }
  };

  // ── Filtrar sesiones del panel por tab activo ─────────────────────────────
  const panelSessions = allSessions.filter(s => s.type === activeTab);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="view-container">
      <header className="view-header">
        <h1>Módulo de Novedades</h1>
      </header>

      {/* ── Tabs + Contador de sesión ─────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div className="tabs">
          {(['Sanidad', 'Tacto', 'IA'] as TabType[]).map(tab => (
            <button
              key={tab}
              className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
              onClick={() => handleTabClick(tab)}
            >
              {tab === 'IA' ? 'Inseminación (IA)' : tab}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {/* Sesión activa info */}
          {currentSession ? (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.6rem',
              background: 'rgba(0,0,0,0.05)',
              border: `1px solid ${TAB_COLOR[activeTab]}40`,
              borderRadius: '12px',
              padding: '0.4rem 1rem',
            }}>
              <Layers size={14} style={{ color: TAB_COLOR[activeTab] }} />
              <span style={{ fontSize: '0.78rem', color: 'var(--text-color)' }}>
                {currentSession.label || formatDate(currentSession.date)}
              </span>
            </div>
          ) : null}

          {/* Contador */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            background: 'rgba(59,130,246,0.12)',
            border: '1px solid rgba(59,130,246,0.35)',
            borderRadius: '12px',
            padding: '0.4rem 1rem',
          }}>
            <Hash size={15} style={{ color: '#1d4ed8' }} />
            <span style={{ fontSize: '0.78rem', color: '#1d4ed8', fontWeight: 500 }}>Sesión:</span>
            <span style={{
              fontSize: '1.6rem', fontWeight: 800,
              color: sessionCount === 0 ? '#475569' : '#1d4ed8',
              fontVariantNumeric: 'tabular-nums',
              minWidth: '2.2rem', textAlign: 'center', lineHeight: 1,
            }}>
              {sessionCount}
            </span>
          </div>

          {/* Botón nueva sesión */}
          <button
            onClick={() => openStartModal(activeTab)}
            title="Nueva sesión"
            style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              background: 'rgba(52,211,153,0.08)',
              border: '1px solid rgba(52,211,153,0.3)',
              borderRadius: '10px',
              padding: '0.45rem 0.9rem',
              color: '#15803d',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: 600,
              transition: 'background 0.2s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(52,211,153,0.18)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(52,211,153,0.08)')}
          >
            <Plus size={15} />
            Nueva sesión
          </button>
        </div>
      </div>

      {/* ── Grid principal ────────────────────────────────────────────── */}
      <div className="grid-layout" style={{ gridTemplateColumns: 'var(--grid-cols, 340px 1fr)' }}>

        {/* ── Panel izquierdo: formulario ────────────────────────────── */}
        <div className="left-panel flex-col gap-6">
          <section className="glass-panel p-6">
            <h2 className="text-lg font-semibold mb-4 text-accent">Registrar {activeTab}</h2>

            {/* Sin sesión activa */}
            {!currentSession && (
              <div style={{
                textAlign: 'center', padding: '2rem 1rem',
                background: 'rgba(0,0,0,0.05)', borderRadius: '12px',
                border: '1px dashed rgba(0,0,0,0.15)',
                marginBottom: '1rem',
              }}>
                <Layers size={36} style={{ color: 'var(--text-color)', margin: '0 auto 0.75rem' }} />
                <p style={{ color: 'var(--text-color)', marginBottom: '1rem', fontSize: '0.9rem' }}>
                  No hay sesión activa
                </p>
                <button
                  className="btn btn-primary"
                  onClick={() => openStartModal(activeTab)}
                  style={{ fontSize: '0.9rem' }}
                >
                  <Plus size={16} /> Iniciar sesión
                </button>
              </div>
            )}

            {currentSession && (
              <>
                <div className="form-group mb-4">
                  <label>Fecha del Evento</label>
                  <input
                    type="date"
                    className="input-field"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                  />
                </div>

                <div className="form-group mb-4">
                  <label>Rodeo Activo (Opcional)</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Ej. Vaquillonas, General..."
                    value={currentRodeo}
                    onChange={e => setCurrentRodeo(e.target.value)}
                  />
                </div>

                {/* Selector de toro: siempre visible en IA, antes de escanear */}
                {activeTab === 'IA' && (
                  <div className="form-group mb-5" style={{
                    background: 'rgba(96,165,250,0.07)',
                    border: '1px solid rgba(96,165,250,0.25)',
                    borderRadius: '12px',
                    padding: '0.9rem 1rem',
                  }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <span style={{
                        width: '8px', height: '8px',
                        background: '#1d4ed8',
                        borderRadius: '50%',
                        display: 'inline-block',
                        flexShrink: 0,
                      }} />
                      Toro Utilizado
                      <span style={{
                        marginLeft: 'auto',
                        fontSize: '0.72rem',
                        color: '#1d4ed8',
                        fontWeight: 600,
                        background: 'rgba(96,165,250,0.15)',
                        padding: '0.1rem 0.5rem',
                        borderRadius: '99px',
                      }}>Se aplica a todos los escaneos</span>
                    </label>
                    <select
                      className="input-field"
                      value={bull}
                      onChange={e => setBull(e.target.value)}
                      style={{ fontWeight: 600, fontSize: '1rem' }}
                    >
                      {config.bulls.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                )}

                <div className="form-group relative mb-6">
                  <label>Caravana (RFID)</label>
                  <div className="flex items-center gap-2">
                    <ScanLine size={20} className="text-accent" />
                    <input
                      ref={scannerRef}
                      type="text"
                      className="input-field flex-1 font-mono text-lg"
                      placeholder="Escanee o escriba"
                      value={rfid}
                      onChange={e => setRfid(e.target.value)}
                      onKeyDown={handleScan}
                    />
                  </div>
                </div>

                {/* Banner de duplicado en sesión */}
                {duplicateWarning && (
                  <div style={{
                    background: 'rgba(239,68,68,0.15)',
                    border: '1.5px solid #ef4444',
                    borderRadius: '10px',
                    padding: '0.75rem 1rem',
                    marginBottom: '1rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                    color: '#dc2626',
                    fontWeight: 600,
                    fontSize: '0.88rem',
                    animation: 'pulse 0.5s ease',
                  }}>
                    <AlertTriangle size={18} style={{ color: '#ef4444', flexShrink: 0 }} />
                    {duplicateWarning}
                  </div>
                )}

                {currentAnimal && (

                  <div className="animal-info p-4 bg-white rounded-lg border border-accent/20 mb-6">
                    <p className="text-sm text-muted mb-1">Animal Seleccionado:</p>
                    <p className="font-mono text-lg font-bold text-accent">{currentAnimal.id}</p>
                    <div className="flex gap-4 mt-2 text-sm text-muted">
                      <span>Sexo: {currentAnimal.sex}</span>
                      <span>Raza: {currentAnimal.breed}</span>
                      <span>Color: {currentAnimal.color}</span>
                    </div>
                  </div>
                )}

                {activeTab === 'Tacto' && currentAnimal && (
                  <>
                    {/* Panel IA Warning */}
                    {iaWarning && (
                      <div style={{
                        background: 'rgba(251,191,36,0.12)',
                        border: '1px solid rgba(251,191,36,0.5)',
                        borderRadius: '10px',
                        padding: '0.7rem 0.9rem',
                        marginBottom: '0.75rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.6rem',
                        color: '#92400e',
                        fontSize: '0.82rem',
                      }}>
                        <AlertTriangle size={16} style={{ color: '#92400e', flexShrink: 0 }} />
                        <span>{iaWarning}</span>
                      </div>
                    )}

                    {/* Observación */}
                    <div className="form-group mb-4">
                      <label>Observación (Opcional)</label>
                      <textarea
                        className="input-field"
                        rows={2}
                        value={tactoObs}
                        onChange={e => setTactoObs(e.target.value)}
                      />
                    </div>

                    {/* Sección PREÑADA */}
                    <div style={{
                      background: 'rgba(52,211,153,0.07)',
                      border: '1px solid rgba(52,211,153,0.25)',
                      borderRadius: '12px',
                      padding: '0.9rem',
                      marginBottom: '0.75rem',
                    }}>
                      <p style={{ fontSize: '0.78rem', color: '#15803d', fontWeight: 700, marginBottom: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        🤱 Preñada — ¿Origen?
                      </p>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                        <button
                          onClick={handleSavePreniadaIA}
                          style={{
                            background: 'rgba(52,211,153,0.15)',
                            border: '1.5px solid rgba(52,211,153,0.5)',
                            borderRadius: '10px',
                            padding: '0.7rem 0.5rem',
                            color: '#15803d',
                            fontWeight: 700,
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                            opacity: lastIAData ? 1 : 0.5,
                          }}
                          title={lastIAData ? `IA del ${formatDate(lastIAData.date)} - ${lastIAData.bull}` : 'Sin IA registrada reciente'}
                        >
                          ✅ Por IA
                        </button>
                        <button
                          onClick={handleSavePreniadaRepaso}
                          style={{
                            background: 'rgba(96,165,250,0.12)',
                            border: '1.5px solid rgba(96,165,250,0.4)',
                            borderRadius: '10px',
                            padding: '0.7rem 0.5rem',
                            color: '#1d4ed8',
                            fontWeight: 700,
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                          }}
                        >
                          🔄 Por Repaso
                        </button>
                      </div>
                      {!lastIAData && (
                        <p style={{ fontSize: '0.72rem', color: 'var(--text-color)', marginTop: '0.4rem' }}>
                          Sin IA reciente registrada — si está preñada, será por Repaso.
                        </p>
                      )}
                    </div>

                    {/* Sección VACÍA / RECHAZO */}
                    <div style={{
                      background: 'rgba(239,68,68,0.07)',
                      border: '1px solid rgba(239,68,68,0.2)',
                      borderRadius: '12px',
                      padding: '0.9rem',
                    }}>
                      <p style={{ fontSize: '0.78rem', color: '#dc2626', fontWeight: 700, marginBottom: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        🔴 Resultado Negativo
                      </p>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                        <button
                          onClick={() => handleManualSaveTacto('Vacía')}
                          style={{
                            background: 'rgba(239,68,68,0.12)',
                            border: '1.5px solid rgba(239,68,68,0.4)',
                            borderRadius: '10px',
                            padding: '0.7rem 0.5rem',
                            color: '#dc2626',
                            fontWeight: 700,
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                          }}
                        >
                          ❌ Vacía
                        </button>
                        <button
                          onClick={() => handleManualSaveTacto('Rechazo')}
                          style={{
                            background: 'rgba(251,191,36,0.1)',
                            border: '1.5px solid rgba(251,191,36,0.35)',
                            borderRadius: '10px',
                            padding: '0.7rem 0.5rem',
                            color: '#92400e',
                            fontWeight: 700,
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                          }}
                        >
                          ⚠️ Rechazo
                        </button>
                      </div>
                    </div>
                  </>
                )}


                {activeTab !== 'Tacto' && (
                  <p className="text-sm text-center text-muted mt-4">Guardado automático al escanear.</p>
                )}
              </>
            )}
          </section>
        </div>

        {/* ── Panel derecho: bloques de sesiones ────────────────────── */}
        <div className="right-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto' }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: '0.25rem',
          }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-color)' }}>
              Sesiones de {activeTab === 'IA' ? 'Inseminación (IA)' : activeTab}
            </h2>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-color)' }}>
              {panelSessions.length} sesión{panelSessions.length !== 1 ? 'es' : ''}
            </span>
          </div>

          {panelSessions.length === 0 && (
            <div style={{
              textAlign: 'center', padding: '3rem 1rem',
              background: 'rgba(0,0,0,0.03)',
              border: '1px dashed rgba(0,0,0,0.15)',
              borderRadius: '14px',
              color: 'var(--text-color)',
            }}>
              <Calendar size={36} style={{ margin: '0 auto 0.75rem', opacity: 0.5 }} />
              <p>No hay sesiones registradas todavía.</p>
            </div>
          )}

          {panelSessions.map(ses => {
            const isActive = currentSession?.id === ses.id;
            const isExpanded = expandedSession === ses.id;
            const color = TAB_COLOR[ses.type];
            const novs = sessionNovedades[ses.id] || [];

            return (
              <div
                key={ses.id}
                style={{
                  background: isActive
                    ? `linear-gradient(135deg, rgba(59,130,246,0.1) 0%, rgba(0,0,0,0.05) 100%)`
                    : 'rgba(0,0,0,0.04)',
                  border: isActive
                    ? `1.5px solid ${color}60`
                    : '1px solid rgba(0,0,0,0.15)',
                  borderRadius: '14px',
                  overflow: 'hidden',
                  transition: 'border-color 0.2s',
                }}
              >
                {/* Cabecera de sesión */}
                <button
                  onClick={() => toggleSession(ses.id)}
                  style={{
                    width: '100%', textAlign: 'left',
                    background: 'transparent', border: 'none',
                    padding: '0.9rem 1.1rem',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                  }}
                >
                  {/* Color indicator */}
                  <div style={{
                    width: '4px', height: '40px',
                    background: color,
                    borderRadius: '2px',
                    flexShrink: 0,
                    opacity: isActive ? 1 : 0.5,
                  }} />

                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                      {isActive && (
                        <span style={{
                          fontSize: '0.65rem', fontWeight: 700,
                          background: color,
                          color: '#000',
                          padding: '0.1rem 0.45rem',
                          borderRadius: '99px',
                          letterSpacing: '0.05em',
                        }}>
                          ACTIVA
                        </span>
                      )}
                      <span style={{ fontWeight: 700, fontSize: '0.95rem', color: isActive ? '#e2e8f0' : '#94a3b8' }}>
                        {ses.label || `Sesión del ${formatDate(ses.date)}`}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', fontSize: '0.78rem', color: 'var(--text-color)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <Calendar size={11} /> {formatDate(ses.date)}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <Clock size={11} /> {formatTime(ses.startedAt)}
                      </span>
                    </div>
                  </div>

                  {/* Contador */}
                  <div style={{
                    background: isActive ? `${color}25` : 'rgba(0,0,0,0.05)',
                    border: `1px solid ${isActive ? color + '50' : 'rgba(0,0,0,0.15)'}`,
                    borderRadius: '10px',
                    padding: '0.3rem 0.8rem',
                    textAlign: 'center',
                    flexShrink: 0,
                  }}>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: isActive ? color : '#475569', lineHeight: 1 }}>
                      {isActive ? sessionCount : ses.count}
                    </div>
                    <div style={{ fontSize: '0.6rem', color: 'var(--text-color)', marginTop: '0.1rem' }}>animales</div>
                  </div>

                  {/* Expand icon */}
                  <div style={{ color: 'var(--text-color)', flexShrink: 0 }}>
                    {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                  </div>
                </button>

                {/* Detalle expandido */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid rgba(0,0,0,0.15)', padding: '0.75rem 1.1rem' }}>
                    
                    <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem' }}>
                      {/* Botón continuar si no es la activa */}
                      {!isActive && (
                        <button
                          onClick={() => continueSession(ses)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            background: `${color}15`,
                            border: `1px solid ${color}40`,
                            borderRadius: '8px',
                            padding: '0.45rem 1rem',
                            color: color,
                            cursor: 'pointer',
                            fontSize: '0.82rem',
                            fontWeight: 600,
                            transition: 'background 0.2s',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = `${color}25`)}
                          onMouseLeave={e => (e.currentTarget.style.background = `${color}15`)}
                        >
                          <ArrowRight size={14} /> Continuar esta sesión
                        </button>
                      )}
                      
                      {/* Botón eliminar sesión */}
                      <button
                        onClick={() => handleDeleteSession(ses.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '0.5rem',
                          background: 'rgba(239,68,68,0.1)',
                          border: '1px solid rgba(239,68,68,0.4)',
                          borderRadius: '8px',
                          padding: '0.45rem 1rem',
                          color: '#dc2626',
                          cursor: 'pointer',
                          fontSize: '0.82rem',
                          fontWeight: 600,
                          transition: 'background 0.2s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.15)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.1)')}
                      >
                        <Trash2 size={14} /> Eliminar Sesión
                      </button>
                    </div>

                    {/* Lista de novedades */}
                    {novs.length === 0 ? (
                      <p style={{ color: 'var(--text-color)', fontSize: '0.82rem', padding: '0.5rem 0' }}>
                        Sin registros cargados aún.
                      </p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '280px', overflowY: 'auto' }}>
                        {novs.map((nov, idx) => (
                          <div key={nov.id} style={{
                            display: 'flex', alignItems: 'center', gap: '0.75rem',
                            padding: '0.5rem 0.75rem',
                            background: 'rgba(0,0,0,0.05)',
                            borderRadius: '8px',
                            fontSize: '0.82rem',
                          }}>
                            {/* Número de orden */}
                            <span style={{
                              width: '26px', height: '26px',
                              background: `${color}20`,
                              border: `1px solid ${color}40`,
                              borderRadius: '6px',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: color,
                              fontWeight: 800,
                              fontSize: '0.78rem',
                              flexShrink: 0,
                            }}>
                              {nov.type === 'Sanidad' ? nov.tubeNumber : idx + 1}
                            </span>
                            {/* RFID */}
                            <span style={{ fontFamily: 'monospace', color: 'var(--text-color)', fontWeight: 600, flex: 1 }}>
                              {nov.animalId}
                            </span>
                            {/* Detalle específico */}
                            {nov.rodeo && (
                              <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-color)', background: 'rgba(0,0,0,0.06)', padding: '0.15rem 0.5rem', borderRadius: '4px', border: '1px solid rgba(0,0,0,0.1)' }}>
                                {nov.rodeo}
                              </span>
                            )}
                            {nov.type === 'Tacto' && (() => {
                              const r = nov.result;
                              const isIA = r === 'Preñada IA';
                              const isRepaso = r === 'Preñada Repaso';
                              const isVacia = r === 'Vacía';
                              const clr = isIA ? '#15803d' : isRepaso ? '#1d4ed8' : isVacia ? '#dc2626' : '#92400e';
                              const bg  = isIA ? '#34d39918' : isRepaso ? '#60a5fa18' : isVacia ? '#f8717118' : '#fbbf2418';
                              return (
                                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: clr, background: bg, padding: '0.1rem 0.5rem', borderRadius: '99px' }}>
                                  {r}
                                </span>
                              );
                            })()}
                            {nov.type === 'IA' && (
                              <span style={{ fontSize: '0.72rem', color: 'var(--text-color)' }}>{nov.bull}</span>
                            )}
                            {/* Hora */}
                            <span style={{ color: 'var(--text-color)', fontSize: '0.72rem', flexShrink: 0 }}>
                              {formatTime(nov.timestamp)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ══ MODAL: Animal No Registrado ════════════════════════════════════ */}
      {showAnimalModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="glass-panel p-6 w-full max-w-md border-2 border-accent">
            <h2 className="text-xl font-bold mb-4 text-accent">¡Animal No Registrado!</h2>
            <p className="mb-4">Complete los datos para crear la ficha y continuar.</p>

            <div className="form-group mb-3">
              <label>Caravana</label>
              <input type="text" className="input-field font-mono" value={pendingCode} disabled />
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="form-group">
                <label>Sexo</label>
                <select className="input-field" value={newSex} onChange={e => setNewSex(e.target.value)}>
                  <option value="H">Hembra</option>
                  <option value="M">Macho</option>
                </select>
              </div>
              <div className="form-group">
                <label>Raza</label>
                <select className="input-field" value={newBreed} onChange={e => setNewBreed(e.target.value)}>
                  <option value="GC">Ganado Cruza</option>
                  <option value="H">Hereford</option>
                  <option value="AA">Angus</option>
                  <option value="BG">Brangus</option>
                  <option value="BF">Braford</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="form-group">
                <label>Color</label>
                <select className="input-field" value={newColor} onChange={e => setNewColor(e.target.value)}>
                  {config.colors.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>RENSPA</label>
                <select className="input-field" value={newRenspa} onChange={e => setNewRenspa(e.target.value)}>
                  {config.renspas.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>

            <div className="form-group mb-6">
              <label>Nacimiento (MM/YYYY)</label>
              <input
                type="text"
                className="input-field"
                placeholder="MM/YYYY o YYYY"
                value={newBirthDate}
                onChange={e => setNewBirthDate(e.target.value)}
              />
            </div>

            <div className="flex gap-4">
              <button className="btn btn-danger w-1/3" onClick={() => setShowAnimalModal(false)}>Cancelar</button>
              <button className="btn btn-primary w-2/3" onClick={submitNewAnimal} autoFocus>
                <Save size={18} /> Guardar y Continuar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL: Inicio de Sesión ═════════════════════════════════════════ */}
      {showStartModal && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: 'rgba(0,0,0,0.5)' }}
        >
          <div style={{
            width: '100%', maxWidth: '480px',
            background: '#ffffff',
            border: `2px solid ${TAB_COLOR[pendingTab]}50`,
            borderRadius: '20px',
            boxShadow: `0 0 60px ${TAB_COLOR[pendingTab]}25`,
            overflow: 'hidden',
          }}>
            {/* Header del modal */}
            <div style={{
              padding: '1.5rem 1.75rem 1.2rem',
              borderBottom: '1px solid rgba(0,0,0,0.15)',
              background: `linear-gradient(135deg, ${TAB_COLOR[pendingTab]}10 0%, transparent 100%)`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.3rem' }}>
                <div style={{
                  width: '10px', height: '10px',
                  background: TAB_COLOR[pendingTab],
                  borderRadius: '50%',
                  boxShadow: `0 0 8px ${TAB_COLOR[pendingTab]}`,
                }} />
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-color)' }}>
                  {TAB_LABEL[pendingTab]}
                </h2>
              </div>
              <p style={{ color: 'var(--text-color)', fontSize: '0.85rem', marginLeft: '1.6rem' }}>
                Iniciá una nueva sesión o continuá una anterior
              </p>
            </div>

            <div style={{ padding: '1.5rem 1.75rem' }}>
              {/* ── Nueva Sesión ──────────────────────────────────── */}
              <div style={{
                background: 'rgba(0,0,0,0.05)',
                border: '1px solid rgba(0,0,0,0.15)',
                borderRadius: '14px',
                padding: '1.2rem',
                marginBottom: '1.25rem',
              }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-color)', marginBottom: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Plus size={15} style={{ color: TAB_COLOR[pendingTab] }} /> Nueva sesión
                </h3>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <div className="form-group">
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-color)' }}>Fecha</label>
                    <input
                      ref={modalDateRef}
                      type="date"
                      className="input-field"
                      value={modalDate}
                      onChange={e => setModalDate(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') startNewSession(); }}
                      style={{ fontSize: '0.9rem' }}
                    />
                  </div>
                  <div className="form-group">
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-color)' }}>Etiqueta (opcional)</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="ej: Mañana, Corral 1..."
                      value={modalLabel}
                      onChange={e => setModalLabel(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') startNewSession(); }}
                      style={{ fontSize: '0.9rem' }}
                    />
                  </div>
                </div>

                <button
                  onClick={startNewSession}
                  style={{
                    width: '100%',
                    background: `linear-gradient(135deg, ${TAB_COLOR[pendingTab]}cc, ${TAB_COLOR[pendingTab]}88)`,
                    border: 'none', borderRadius: '10px',
                    padding: '0.65rem',
                    color: '#000', fontWeight: 700, fontSize: '0.95rem',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                    transition: 'opacity 0.2s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = '0.88')}
                  onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                >
                  <Plus size={16} /> Iniciar nueva sesión
                </button>
              </div>

              {/* ── Sesiones anteriores ───────────────────────────── */}
              <div>
                <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-color)', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Clock size={13} /> Sesiones anteriores de {pendingTab === 'IA' ? 'Inseminación (IA)' : pendingTab}
                </h3>

                {loadingPrev && (
                  <p style={{ color: 'var(--text-color)', fontSize: '0.82rem', padding: '0.5rem 0' }}>Cargando...</p>
                )}

                {!loadingPrev && prevSessions.length === 0 && (
                  <p style={{ color: 'var(--text-color)', fontSize: '0.82rem', padding: '0.5rem 0' }}>
                    No hay sesiones anteriores.
                  </p>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', maxHeight: '230px', overflowY: 'auto' }}>
                  {prevSessions.map(ses => (
                    <button
                      key={ses.id}
                      onClick={() => continueSession(ses)}
                      style={{
                        width: '100%', textAlign: 'left',
                        background: 'rgba(0,0,0,0.05)',
                        border: '1px solid rgba(0,0,0,0.15)',
                        borderRadius: '10px',
                        padding: '0.7rem 0.9rem',
                        cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: '0.75rem',
                        transition: 'background 0.18s, border-color 0.18s',
                        color: 'inherit',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = `${TAB_COLOR[pendingTab]}18`;
                        e.currentTarget.style.borderColor = `${TAB_COLOR[pendingTab]}40`;
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = 'rgba(0,0,0,0.05)';
                        e.currentTarget.style.borderColor = 'rgba(0,0,0,0.15)';
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-color)', marginBottom: '0.15rem' }}>
                          {ses.label || `Sesión del ${formatDate(ses.date)}`}
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.75rem', color: 'var(--text-color)' }}>
                          <span><Calendar size={10} style={{ display: 'inline', marginRight: '0.2rem' }} />{formatDate(ses.date)}</span>
                          <span><Clock size={10} style={{ display: 'inline', marginRight: '0.2rem' }} />{formatTime(ses.startedAt)}</span>
                        </div>
                      </div>
                      <div style={{
                        background: `${TAB_COLOR[pendingTab]}18`,
                        border: `1px solid ${TAB_COLOR[pendingTab]}35`,
                        borderRadius: '8px',
                        padding: '0.2rem 0.6rem',
                        color: TAB_COLOR[pendingTab],
                        fontWeight: 800,
                        fontSize: '1rem',
                        minWidth: '2.5rem',
                        textAlign: 'center',
                      }}>
                        {ses.count}
                      </div>
                      <ArrowRight size={14} style={{ color: 'var(--text-color)', flexShrink: 0 }} />
                    </button>
                  ))}
                </div>
              </div>

              {/* Cancelar */}
              <button
                onClick={() => setShowStartModal(false)}
                style={{
                  marginTop: '1rem',
                  width: '100%',
                  background: 'transparent',
                  border: '1px solid rgba(0,0,0,0.15)',
                  borderRadius: '10px',
                  padding: '0.55rem',
                  color: 'var(--text-color)',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
