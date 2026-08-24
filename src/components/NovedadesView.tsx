import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { db, AppConfig, Animal, NovedadIA, NovedadIATF, Sesion, Novedad, NovedadType } from '../db';
import { soundSystem } from '../sounds';
import {
  ScanLine, Save, AlertTriangle, Hash, Plus, ChevronDown, ChevronRight,
  Clock, Calendar, Layers, ArrowRight, Trash2, Check, X
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
  IATF: 'IATF',
};

const TAB_COLOR: Record<TabType, string> = {
  Sanidad: '#15803d',
  IA: '#1d4ed8',
  Tacto: '#8a1a49',
  IATF: '#7c3aed',
};

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {}
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

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

  // ── Escaneo y Modo de Confirmación ─────────────────────────────────────────
  const [rfid, setRfid] = useState('');
  const [currentAnimal, setCurrentAnimal] = useState<Animal | null>(null);
  const [pendingManualAnimal, setPendingManualAnimal] = useState<Animal | null>(null);
  const [animalPrevRodeo, setAnimalPrevRodeo] = useState<string | null>(null);
  const [lastScanFeedback, setLastScanFeedback] = useState<{ id: string; prevRodeo: string; targetRodeo?: string } | null>(null);
  const [autoSaveScan, setAutoSaveScan] = useState<boolean>(() =>
    localStorage.getItem('senasa_autosave_scan') !== 'false'
  );
  const [filterRodeo, setFilterRodeo] = useState<string>(() =>
    localStorage.getItem('senasa_filter_rodeo') || ''
  );
  const [date, setDate] = useState(() =>
    localStorage.getItem('senasa_novedades_date') || new Date().toISOString().split('T')[0]
  );

  useEffect(() => {
    localStorage.setItem('senasa_autosave_scan', String(autoSaveScan));
  }, [autoSaveScan]);

  useEffect(() => {
    localStorage.setItem('senasa_filter_rodeo', filterRodeo);
  }, [filterRodeo]);

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

  const loadAllSessions = async () => {
    const all = await db.getAllSesiones();
    all.sort((a, b) => b.startedAt - a.startedAt);
    setAllSessions(all);
  };

  // ── Cambiar a Tab sin crear sesión automáticamente ───────────────────────
  const switchTabDirectly = async (tab: TabType) => {
    setActiveTab(tab);
    setCurrentSession(null);
    setSessionCount(0);
    setRfid('');
    setCurrentAnimal(null);
    setPendingManualAnimal(null);
    setAnimalPrevRodeo(null);
    setLastScanFeedback(null);
    setIaWarning('');
    setTactoObs('');
    await loadAllSessions();
  };

  // ── Cargar historial al montar ────────────────────────────────────────────
  useEffect(() => {
    loadAllSessions();
  }, []);

  // ── Click en tab ──────────────────────────────────────────────────────────
  const handleTabClick = (tab: TabType) => {
    if (tab === activeTab) return;
    switchTabDirectly(tab);
  };

  // ── Cambio de fecha del evento ────────────────────────────────────────────
  const handleDateChange = async (newDate: string) => {
    setDate(newDate);
    if (currentSession) {
      const updated = { ...currentSession, date: newDate };
      await db.saveSesion(updated);
      setCurrentSession(updated);
      await loadAllSessions();
    }
  };

  // ── Cambio de rodeo de destino ────────────────────────────────────────────
  const handleTargetRodeoChange = async (newRodeo: string) => {
    setCurrentRodeo(newRodeo);
    if (currentSession) {
      const updated = { ...currentSession, targetRodeo: newRodeo.trim() || undefined };
      await db.saveSesion(updated);
      setCurrentSession(updated);
    }
  };

  // ── Iniciar NUEVA sesión explícita ────────────────────────────────────────
  const handleCreateExplicitNewSession = async () => {
    const defaultLabel = `Sesión ${formatDate(date)}`;
    const label = window.prompt('Nombre o etiqueta para la nueva sesión (opcional):', defaultLabel);
    if (label === null) return;

    const newSes: Sesion = {
      id: generateUUID(),
      type: activeTab,
      date,
      startedAt: Date.now(),
      count: 0,
      label: label.trim() || undefined,
      targetRodeo: currentRodeo.trim() || undefined,
    };
    await db.saveSesion(newSes);
    setCurrentSession(newSes);
    setSessionCount(0);
    setRfid('');
    await loadAllSessions();
    soundSystem.playSuccess();
    setTimeout(() => scannerRef.current?.focus(), 100);
  };

  // ── Continuar sesión existente desde el panel ─────────────────────────────
  const continueSession = async (ses: Sesion) => {
    setDate(ses.date);
    setActiveTab(ses.type);
    setCurrentSession(ses);
    setCurrentRodeo(ses.targetRodeo || '');
    setSessionCount(ses.count);
    setRfid('');
    setCurrentAnimal(null);
    setPendingManualAnimal(null);
    setAnimalPrevRodeo(null);
    setLastScanFeedback(null);
    setIaWarning('');
    setTactoObs('');
    await loadAllSessions();
    setTimeout(() => scannerRef.current?.focus(), 100);
  };

  // ── Escaneo ────────────────────────────────────────────────────────────────
  const handleScan = async (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      if (pendingManualAnimal) {
        handleCancelManualScan();
        return;
      }
    }

    if (e.key !== 'Enter') return;

    // Si ya hay un animal en espera de confirmación y presionan Enter con el input vacío, confirmar
    if (pendingManualAnimal && rfid.trim() === '') {
      await handleConfirmManualSave();
      return;
    }

    if (!currentSession) {
      soundSystem.playError();
      alert('Por favor seleccioná una sesión de la derecha o creá una nueva con el botón "+ Nueva sesión" antes de escanear.');
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
      rodeo: currentRodeo.trim() || undefined,
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
    setAnimalPrevRodeo(animal.rodeo || 'Sin Asignar');

    // Cargar antecedentes de IA/IATF para mostrar info en Tacto, IA o IATF
    if (activeTab === 'Tacto' || activeTab === 'IA' || activeTab === 'IATF') {
      const novedades = await db.getNovedadesByAnimal(animal.id);
      const ias = novedades.filter(n => n.type === 'IA' || n.type === 'IATF') as (NovedadIA | NovedadIATF)[];
      if (ias.length > 0) {
        ias.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const lastIA = ias[0];
        const iaDate = new Date(lastIA.date);
        const today = new Date(date);
        const months =
          (today.getFullYear() - iaDate.getFullYear()) * 12 +
          (today.getMonth() - iaDate.getMonth());
        if (months <= 9 && months >= 0) {
          const bullInfo = lastIA.bull || (lastIA.type === 'IATF' ? 'Protocolo IATF' : 'S/D');
          setLastIAData({ date: lastIA.date, bull: bullInfo });
          setIaWarning(
            `Tiene una ${lastIA.type} hace ${months} mes${months !== 1 ? 'es' : ''} ${lastIA.bull ? `— Toro: ${lastIA.bull}` : ''} (${formatDate(lastIA.date)})`
          );
        } else {
          setLastIAData(null);
          setIaWarning('');
        }
      } else {
        setLastIAData(null);
        setIaWarning('');
      }
    }

    if (activeTab === 'Tacto') {
      soundSystem.playSuccess();
      return;
    }

    // Para IA, IATF y Sanidad: verificar si corresponde guardado automático o confirmación manual
    const matchesFilter = !filterRodeo || (animal.rodeo || '') === filterRodeo;
    const shouldAutoSave = autoSaveScan && matchesFilter;

    if (shouldAutoSave) {
      soundSystem.playSuccess();
      setPendingManualAnimal(null);
      await executeSaveNovedad(animal);
    } else {
      // Modo confirmación manual o advertencia de rodeo no coincidente
      if (!matchesFilter) {
        soundSystem.playAlarm();
      } else {
        soundSystem.playSuccess();
      }
      setPendingManualAnimal(animal);
    }
  };

  const handleConfirmManualSave = async () => {
    if (!pendingManualAnimal) return;
    const animal = pendingManualAnimal;
    setPendingManualAnimal(null);
    await executeSaveNovedad(animal);
    setTimeout(() => scannerRef.current?.focus(), 80);
  };

  const handleCancelManualScan = () => {
    setPendingManualAnimal(null);
    setCurrentAnimal(null);
    setAnimalPrevRodeo(null);
    setIaWarning('');
    setDuplicateWarning(null);
    setRfid('');
    setTimeout(() => scannerRef.current?.focus(), 80);
  };

  // executeSaveNovedad acepta result explícito para el caso Tacto (IA/Repaso)
  const executeSaveNovedad = async (animal: Animal, tactoResultOverride?: 'Preñada IA' | 'Preñada Repaso' | 'Vacía' | 'Rechazo') => {
    if (!currentSession) return;

    const newCount = sessionCount + 1;
    const targetRodeoVal = currentRodeo.trim();
    const prevRodeoVal = animal.rodeo || 'Sin Asignar';

    // Si hay un rodeo destino asignado en la sesión, transferir el animal si es distinto
    if (targetRodeoVal && animal.rodeo !== targetRodeoVal) {
      animal.rodeo = targetRodeoVal;
      await db.saveAnimal(animal);
    }

    const baseNovedad = {
      id: crypto.randomUUID(),
      animalId: animal.id,
      date,
      timestamp: Date.now(),
      sessionId: currentSession.id,
      rodeo: targetRodeoVal || animal.rodeo || undefined,
      prevRodeo: prevRodeoVal !== 'Sin Asignar' ? prevRodeoVal : undefined,
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
      } else if (activeTab === 'IATF') {
        await db.saveNovedad({ ...baseNovedad, type: 'IATF' });
      } else if (activeTab === 'Tacto') {
        const finalResult = tactoResultOverride ?? tactoResult;
        await db.saveNovedad({
          ...baseNovedad,
          type: 'Tacto',
          result: finalResult,
          observation: tactoObs,
        });
      }

      // Actualizar contador y targetRodeo en la sesión
      const updatedSession: Sesion = { ...currentSession, count: newCount, targetRodeo: targetRodeoVal || undefined };
      await db.saveSesion(updatedSession);
      setCurrentSession(updatedSession);
      setSessionCount(newCount);
      setLastScanFeedback({
        id: animal.id,
        prevRodeo: prevRodeoVal,
        targetRodeo: targetRodeoVal || undefined
      });

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
      setAnimalPrevRodeo(null);
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
          {(['Sanidad', 'Tacto', 'IA', 'IATF'] as TabType[]).map(tab => (
            <button
              key={tab}
              className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
              onClick={() => handleTabClick(tab)}
            >
              {TAB_LABEL[tab]}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
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
            onClick={handleCreateExplicitNewSession}
            title="Iniciar nueva sesión con etiqueta"
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

            {!currentSession ? (
              <div style={{
                textAlign: 'center', padding: '2.5rem 1.5rem',
                background: 'rgba(0,0,0,0.03)', borderRadius: '14px',
                border: '1.5px dashed rgba(0,0,0,0.15)',
                margin: '1rem 0',
              }}>
                <Layers size={40} style={{ color: TAB_COLOR[activeTab], margin: '0 auto 0.75rem', opacity: 0.6 }} />
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-color)', marginBottom: '0.4rem' }}>
                  Sin sesión activa
                </h3>
                <p style={{ color: 'var(--text-color)', marginBottom: '1.25rem', fontSize: '0.85rem', opacity: 0.8 }}>
                  Hacé clic en una sesión de la derecha para continuarla, o creá una nueva con el botón de abajo.
                </p>
                <button
                  className="btn btn-primary"
                  onClick={handleCreateExplicitNewSession}
                  style={{ fontSize: '0.92rem', padding: '0.65rem 1.25rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  <Plus size={18} /> Iniciar Nueva Sesión
                </button>
              </div>
            ) : (
              <>
                <div className="form-group mb-4">
                  <label>Fecha del Evento</label>
                  <input
                    type="date"
                    className="input-field"
                    value={date}
                    onChange={e => handleDateChange(e.target.value)}
                  />
                </div>

            <div className="form-group mb-4">
              <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Rodeo de Destino (Opcional)</span>
                {currentRodeo.trim() && (
                  <span style={{ fontSize: '0.72rem', color: 'var(--accent)', fontWeight: 600 }}>
                    Asignación automática activa
                  </span>
                )}
              </label>
              <input
                type="text"
                list="active-rodeos-list"
                className="input-field"
                placeholder="Ej. 1° IA de 2026, Rodeo 1, Vaquillonas..."
                value={currentRodeo}
                onChange={e => handleTargetRodeoChange(e.target.value)}
              />
              <datalist id="active-rodeos-list">
                {(config.rodeos || []).map(r => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </div>

                {/* Selector de toro: solo visible en IA, antes de escanear */}
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

                {/* Selector de Modo de Escaneo y Filtro de Rodeo */}
                <div style={{
                  background: 'rgba(0,0,0,0.03)',
                  border: '1px solid rgba(0,0,0,0.1)',
                  borderRadius: '12px',
                  padding: '0.8rem',
                  marginBottom: '1rem'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <label htmlFor="toggle-autosave" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700, margin: 0 }}>
                      <input
                        type="checkbox"
                        id="toggle-autosave"
                        checked={autoSaveScan}
                        onChange={e => {
                          setAutoSaveScan(e.target.checked);
                          if (e.target.checked && pendingManualAnimal) {
                            handleCancelManualScan();
                          }
                        }}
                        style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                      />
                      <span>Guardado Automático al Escanear</span>
                    </label>
                    <span style={{
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      padding: '0.15rem 0.5rem',
                      borderRadius: '99px',
                      background: autoSaveScan ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                      color: autoSaveScan ? '#10b981' : '#f59e0b'
                    }}>
                      {autoSaveScan ? '⚡ Modo Rápido' : '👁️ Modo Confirmación'}
                    </span>
                  </div>

                  <div style={{ marginTop: '0.4rem' }}>
                    <label style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.2rem' }}>
                      Rodeo Esperado en Manga (Opcional - Alerta si es de otro rodeo)
                    </label>
                    <select
                      className="input-field"
                      value={filterRodeo}
                      onChange={e => setFilterRodeo(e.target.value)}
                      style={{ fontSize: '0.82rem', padding: '0.35rem 0.6rem' }}
                    >
                      <option value="">— Procesar cualquier rodeo —</option>
                      {(config.rodeos || []).map(r => (
                        <option key={r} value={r}>Solo rodeo: {r}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-group relative mb-4">
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

                {/* Feedback del último animal escaneado */}
                {lastScanFeedback && (
                  <div style={{
                    background: 'rgba(37,99,235,0.08)',
                    border: '1px solid rgba(37,99,235,0.3)',
                    borderRadius: '10px',
                    padding: '0.65rem 0.9rem',
                    marginBottom: '1rem',
                    fontSize: '0.84rem',
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: '0.5rem',
                    color: 'var(--text-primary)'
                  }}>
                    <span>✅ Registrado: <strong style={{ fontFamily: 'monospace' }}>{lastScanFeedback.id}</strong></span>
                    <span style={{ color: 'var(--text-secondary)' }}>• Rodeo anterior: <strong style={{ color: '#f59e0b' }}>{lastScanFeedback.prevRodeo}</strong></span>
                    {lastScanFeedback.targetRodeo && lastScanFeedback.targetRodeo !== lastScanFeedback.prevRodeo && (
                      <span style={{ color: '#10b981', fontWeight: 600 }}>→ Pasó a: <strong>{lastScanFeedback.targetRodeo}</strong></span>
                    )}
                  </div>
                )}

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
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div>
                        <p className="text-sm text-muted mb-1">Animal Seleccionado:</p>
                        <p className="font-mono text-lg font-bold text-accent">{currentAnimal.id}</p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Rodeo Anterior:</span>
                        <div style={{ fontWeight: 700, color: '#f59e0b', fontSize: '0.9rem' }}>
                          {animalPrevRodeo || 'Sin Asignar'}
                        </div>
                        {currentRodeo.trim() && currentRodeo.trim() !== animalPrevRodeo && (
                          <div style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 600 }}>
                            Pasará a: {currentRodeo.trim()}
                          </div>
                        )}
                      </div>
                    </div>
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


                {/* ── Confirmación Manual para IA y Sanidad ── */}
                {activeTab !== 'Tacto' && pendingManualAnimal && (
                  <div style={{
                    background: 'rgba(37,99,235,0.06)',
                    border: '2px solid rgba(37,99,235,0.35)',
                    borderRadius: '14px',
                    padding: '1.1rem',
                    marginTop: '0.5rem',
                    boxShadow: '0 4px 20px rgba(37,99,235,0.12)',
                  }}>
                    {/* Alerta si no coincide con el rodeo esperado */}
                    {filterRodeo && (pendingManualAnimal.rodeo || '') !== filterRodeo && (
                      <div style={{
                        background: 'rgba(239,68,68,0.15)',
                        border: '1.5px solid #ef4444',
                        borderRadius: '8px',
                        padding: '0.65rem 0.8rem',
                        marginBottom: '0.9rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        color: '#dc2626',
                        fontWeight: 700,
                        fontSize: '0.84rem'
                      }}>
                        <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                        <span>⚠️ ¡Atención! Esta vaca pertenece a &quot;{pendingManualAnimal.rodeo || 'Sin Rodeo'}&quot; (Esperado: &quot;{filterRodeo}&quot;)</span>
                      </div>
                    )}

                    {/* Info específica de IA */}
                    {activeTab === 'IA' && (
                      <>
                        {iaWarning && (
                          <div style={{
                            background: 'rgba(251,191,36,0.15)',
                            border: '1px solid #f59e0b',
                            borderRadius: '8px',
                            padding: '0.55rem 0.75rem',
                            marginBottom: '0.8rem',
                            color: '#92400e',
                            fontSize: '0.82rem',
                            fontWeight: 600
                          }}>
                            ℹ️ {iaWarning}
                          </div>
                        )}
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-color)', marginBottom: '0.8rem' }}>
                          <span>Toro a utilizar: <strong style={{ color: 'var(--accent)' }}>{bull}</strong></span>
                          {currentRodeo.trim() && (
                            <span style={{ display: 'block', marginTop: '0.2rem', color: '#10b981', fontWeight: 600 }}>
                              Pasará al rodeo: &quot;{currentRodeo.trim()}&quot;
                            </span>
                          )}
                        </div>
                      </>
                    )}

                    {/* Info específica de IATF */}
                    {activeTab === 'IATF' && (
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-color)', marginBottom: '0.8rem' }}>
                        <span>Registro: <strong style={{ color: '#a855f7' }}>Inicio de Protocolo IATF</strong></span>
                        {currentRodeo.trim() && (
                          <span style={{ display: 'block', marginTop: '0.2rem', color: '#10b981', fontWeight: 600 }}>
                            Pasará al rodeo: &quot;{currentRodeo.trim()}&quot;
                          </span>
                        )}
                      </div>
                    )}

                    {/* Info específica de Sanidad */}
                    {activeTab === 'Sanidad' && (
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-color)', marginBottom: '0.8rem' }}>
                        <span>Se asignará: <strong style={{ color: '#34d399', fontSize: '1rem' }}>Tubo #{sessionCount + 1}</strong></span>
                      </div>
                    )}

                    {/* Botones de acción */}
                    <div style={{ display: 'flex', gap: '0.6rem' }}>
                      <button
                        onClick={handleConfirmManualSave}
                        className="btn btn-primary"
                        style={{ flex: 2, padding: '0.75rem', fontSize: '0.92rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                      >
                        <Check size={18} /> Confirmar {activeTab === 'IA' ? 'Inseminación' : activeTab === 'IATF' ? 'IATF' : 'Sanidad'}
                      </button>
                      <button
                        onClick={handleCancelManualScan}
                        className="btn btn-danger"
                        style={{ flex: 1, padding: '0.75rem', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}
                      >
                        <X size={16} /> Saltear Vaca
                      </button>
                    </div>
                    <p style={{ textAlign: 'center', fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                      [Enter] Confirmar · [Esc] Saltear y limpiar
                    </p>
                  </div>
                )}

                {activeTab !== 'Tacto' && !pendingManualAnimal && (
                  <p className="text-sm text-center text-muted mt-4">
                    {autoSaveScan
                      ? '⚡ Guardado automático al escanear activo.'
                      : '👁️ Escaneá una caravana para inspeccionar su rodeo antes de confirmar.'}
                  </p>
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
              Sesiones de {TAB_LABEL[activeTab]}
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
                              <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--accent)', background: 'rgba(37,99,235,0.08)', padding: '0.15rem 0.5rem', borderRadius: '4px', border: '1px solid rgba(37,99,235,0.2)' }}>
                                {nov.rodeo}
                                {nov.prevRodeo && nov.prevRodeo !== nov.rodeo && (
                                  <span style={{ color: '#f59e0b', marginLeft: '0.35rem', fontSize: '0.68rem', fontWeight: 500 }}>
                                    (ant: {nov.prevRodeo})
                                  </span>
                                )}
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
                            {(nov.type === 'IA' || nov.type === 'IATF') && (
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
    </div>
  );
}
