import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import {
  db, AppConfig, Animal, NovedadIA, NovedadIATF, Sesion,
  SavedMangaRoutine, MangaStepConfig, MangaSesion, MangaHistoryEntry, MangaWorkflowConfig
} from '../db';
import { soundSystem } from '../sounds';
import {
  ScanLine, RotateCcw, Sliders, Play, ShieldAlert,
  Clock, Plus, Trash2, Bookmark, BookmarkCheck, FileText,
  Calendar, ChevronDown, ChevronRight, Layers, Eye
} from 'lucide-react';

interface MangaCombinadaViewProps {
  config: AppConfig;
  setConfig?: (config: AppConfig) => void;
}

export type StepType = 'Sanidad' | 'Tacto' | 'IA' | 'IATF' | 'Rodeo';
export type ConditionMode = 'ALL' | 'SPECIFIC_RODEO' | 'SIN_RODEO' | 'MULTI_RODEO';
export type MangaStep = MangaStepConfig;

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {
      // fallback
    }
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

interface ActiveMangaStorage {
  isLiveMode: boolean;
  activeSessionId: string;
  flowConfig: MangaWorkflowConfig;
  stepSessions: Record<string, Sesion>;
  totalAnimalsPassed: number;
  stepCounts: Record<string, number>;
  tactoStats: {
    preniadaIA: number;
    preniadaRepaso: number;
    vacia: number;
    rechazo: number;
    total: number;
  };
  history: MangaHistoryEntry[];
}

export function MangaCombinadaView({ config, setConfig }: MangaCombinadaViewProps) {
  const getSavedLiveState = (): ActiveMangaStorage | null => {
    try {
      const raw = localStorage.getItem('senasa_active_manga_state');
      if (raw) {
        return JSON.parse(raw) as ActiveMangaStorage;
      }
    } catch (e) {
      console.error('Error loading saved manga state', e);
    }
    return null;
  };

  const savedLiveState = getSavedLiveState();

  // ── ESTADO DEL MODO (Configuración vs En Operación) ────────────────────────
  const [isLiveMode, setIsLiveMode] = useState<boolean>(() => savedLiveState?.isLiveMode ?? false);
  const [activeSessionId, setActiveSessionId] = useState<string>(() => savedLiveState?.activeSessionId || generateUUID());
  const [mainTab, setMainTab] = useState<'sessions' | 'config' | 'routines'>('sessions');

  // ── HISTORIAL DE SESIONES DE MANGA Y RUTINAS GUARDADAS ────────────────────
  const [mangaSessions, setMangaSessions] = useState<MangaSesion[]>([]);
  const [expandedMangaSession, setExpandedMangaSession] = useState<string | null>(null);

  const [savedRoutines, setSavedRoutines] = useState<SavedMangaRoutine[]>(() => {
    return config.savedMangaRoutines || [];
  });
  const [saveRoutineModalOpen, setSaveRoutineModalOpen] = useState(false);
  const [routineNameToSave, setRoutineNameToSave] = useState('');

  // ── CONFIGURACIÓN DEL FLUJO MODULAR ───────────────────────────────────────
  const [flowConfig, setFlowConfig] = useState<MangaWorkflowConfig>(() => {
    if (savedLiveState?.flowConfig) return savedLiveState.flowConfig;

    const today = new Date().toISOString().split('T')[0];
    const defaultRodeo = config.rodeos[0] || 'General';
    const defaultBull = config.bulls[0] || 'Toro 1';

    return {
      name: `Manga Combinada ${formatDate(today)}`,
      date: today,
      steps: [
        {
          id: generateUUID(),
          name: 'Paso 1',
          enabled: true,
          type: 'Sanidad',
          conditionMode: 'ALL',
          specificRodeo: defaultRodeo,
          multiRodeos: [],
          sanidadTargetRodeo: '',
          iaBull: defaultBull,
          iaTargetRodeo: '',
          iatfProtocol: '',
          iatfTargetRodeo: '',
          tactoTargetPreniadaIA: '',
          tactoTargetPreniadaRepaso: '',
          tactoTargetVacia: '',
          tactoTargetRechazo: '',
          rodeoTarget: defaultRodeo,
        },
        {
          id: generateUUID(),
          name: 'Paso 2',
          enabled: true,
          type: 'Tacto',
          conditionMode: 'ALL',
          specificRodeo: defaultRodeo,
          multiRodeos: [],
          sanidadTargetRodeo: '',
          iaBull: defaultBull,
          iaTargetRodeo: '',
          iatfProtocol: '',
          iatfTargetRodeo: '',
          tactoTargetPreniadaIA: '',
          tactoTargetPreniadaRepaso: '',
          tactoTargetVacia: '',
          tactoTargetRechazo: '',
          rodeoTarget: defaultRodeo,
        }
      ]
    };
  });

  // ── SESIONES VINCULADAS POR PASO ──────────────────────────────────────────
  const [stepSessions, setStepSessions] = useState<Record<string, Sesion>>(() => savedLiveState?.stepSessions ?? {});

  // ── CONTADORES EN VIVO ────────────────────────────────────────────────────
  const [totalAnimalsPassed, setTotalAnimalsPassed] = useState<number>(() => savedLiveState?.totalAnimalsPassed ?? 0);
  const [stepCounts, setStepCounts] = useState<Record<string, number>>(() => savedLiveState?.stepCounts ?? {});
  const [tactoStats, setTactoStats] = useState(() => savedLiveState?.tactoStats ?? {
    preniadaIA: 0,
    preniadaRepaso: 0,
    vacia: 0,
    rechazo: 0,
    total: 0
  });

  // ── HISTORIAL DE LA JORNADA EN VIVO ───────────────────────────────────────
  const [history, setHistory] = useState<MangaHistoryEntry[]>(() => savedLiveState?.history ?? []);

  // ── CARGAR SESIONES DE MANGA AL MONTAR ─────────────────────────────────────
  const loadMangaSessions = async () => {
    try {
      const all = await db.getAllMangaSesiones();
      setMangaSessions(all);
    } catch (e) {
      console.error('Error loading manga sessions:', e);
    }
  };

  useEffect(() => {
    loadMangaSessions();
  }, []);

  // ── PERSISTENCIA AUTOMÁTICA EN LOCALSTORAGE Y BASE DE DATOS ────────────────
  useEffect(() => {
    if (isLiveMode) {
      const stateToSave: ActiveMangaStorage = {
        isLiveMode: true,
        activeSessionId,
        flowConfig,
        stepSessions,
        totalAnimalsPassed,
        stepCounts,
        tactoStats,
        history,
      };
      localStorage.setItem('senasa_active_manga_state', JSON.stringify(stateToSave));

      // Guardar también en base de datos como MangaSesion activa
      const mangaSes: MangaSesion = {
        id: activeSessionId,
        name: flowConfig.name,
        date: flowConfig.date,
        startedAt: savedLiveState?.activeSessionId === activeSessionId ? (mangaSessions.find(s => s.id === activeSessionId)?.startedAt || Date.now()) : Date.now(),
        totalAnimals: totalAnimalsPassed,
        flowConfig,
        stepSessions,
        stepCounts,
        tactoStats,
        history,
        status: 'active',
      };
      db.saveMangaSesion(mangaSes).then(() => loadMangaSessions()).catch(console.error);
    } else {
      localStorage.removeItem('senasa_active_manga_state');
    }
  }, [isLiveMode, activeSessionId, flowConfig, stepSessions, totalAnimalsPassed, stepCounts, tactoStats, history]);

  // Sincronizar rutinas con config cuando cambia
  useEffect(() => {
    if (config.savedMangaRoutines) {
      setSavedRoutines(config.savedMangaRoutines);
    }
  }, [config.savedMangaRoutines]);

  // ── ESTADO DEL ANIMAL EN CURSO EN LA MANGA ────────────────────────────────
  const [rfid, setRfid] = useState('');
  const [pendingTacto, setPendingTacto] = useState<{
    animal: Animal;
    stepIndex: number;
    completedSummaries: string[];
    currentRodeoVal: string;
    prevRodeoVal: string;
  } | null>(null);

  const [lastIAData, setLastIAData] = useState<{ date: string; bull: string; type: string } | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [tactoObs, setTactoObs] = useState('');

  // ── MODAL ANIMAL NUEVO ────────────────────────────────────────────────────
  const [showNewAnimalModal, setShowNewAnimalModal] = useState(false);
  const [pendingNewCode, setPendingNewCode] = useState('');
  const [newSex, setNewSex] = useState('H');
  const [newBreed, setNewBreed] = useState('AA');
  const [newColor, setNewColor] = useState(config.colors[0] || 'Negro');
  const [newRenspa, setNewRenspa] = useState(config.renspas[0] || '');
  const [newBirthDate, setNewBirthDate] = useState('');

  const scannerRef = useRef<HTMLInputElement>(null);

  // Focus scanner en modo live
  useEffect(() => {
    if (!isLiveMode) return;
    const interval = setInterval(() => {
      if (
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'SELECT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        scannerRef.current?.focus();
      }
    }, 800);
    return () => clearInterval(interval);
  }, [isLiveMode]);

  // ── AGREGAR / ELIMINAR PASOS ──────────────────────────────────────────────
  const handleAddStep = () => {
    if (flowConfig.steps.length >= 4) {
      alert('Se permite un máximo de 4 pasos por rutina de manga.');
      return;
    }
    const stepNum = flowConfig.steps.length + 1;
    const defaultRodeo = config.rodeos[0] || 'General';
    const defaultBull = config.bulls[0] || 'Toro 1';

    const newStep: MangaStep = {
      id: generateUUID(),
      name: `Paso ${stepNum}`,
      enabled: true,
      type: 'IATF',
      conditionMode: 'ALL',
      specificRodeo: defaultRodeo,
      multiRodeos: [],
      sanidadTargetRodeo: '',
      iaBull: defaultBull,
      iaTargetRodeo: '',
      iatfProtocol: '',
      iatfTargetRodeo: '',
      tactoTargetPreniadaIA: '',
      tactoTargetPreniadaRepaso: '',
      tactoTargetVacia: '',
      tactoTargetRechazo: '',
      rodeoTarget: defaultRodeo,
    };

    setFlowConfig({
      ...flowConfig,
      steps: [...flowConfig.steps, newStep]
    });
  };

  const handleRemoveStep = (index: number) => {
    if (flowConfig.steps.length <= 1) {
      alert('La rutina debe tener al menos 1 paso.');
      return;
    }
    const updated = flowConfig.steps.filter((_, i) => i !== index).map((s, i) => ({
      ...s,
      name: `Paso ${i + 1}`
    }));
    setFlowConfig({ ...flowConfig, steps: updated });
  };

  const handleUpdateStep = (index: number, updates: Partial<MangaStep>) => {
    const updated = [...flowConfig.steps];
    updated[index] = { ...updated[index], ...updates };
    setFlowConfig({ ...flowConfig, steps: updated });
  };

  // ── GESTIÓN DE PLANTILLAS / RUTINAS GUARDADAS ─────────────────────────────
  const openSaveRoutineModal = () => {
    setRoutineNameToSave(flowConfig.name.trim() || 'Rutina Manga');
    setSaveRoutineModalOpen(true);
  };

  const handleSaveRoutineTemplate = async () => {
    if (!routineNameToSave.trim()) {
      alert('Por favor ingresá un nombre para la rutina.');
      return;
    }

    const newRoutine: SavedMangaRoutine = {
      id: generateUUID(),
      name: routineNameToSave.trim(),
      createdAt: Date.now(),
      steps: flowConfig.steps.map((s, idx) => ({ ...s, name: `Paso ${idx + 1}` }))
    };

    const updatedRoutines = [newRoutine, ...savedRoutines.filter(r => r.name !== newRoutine.name)];
    setSavedRoutines(updatedRoutines);

    try {
      const conf = await db.getConfig();
      const updatedConf = { ...conf, savedMangaRoutines: updatedRoutines };
      await db.saveConfig(updatedConf);
      setConfig?.(updatedConf);
      setSaveRoutineModalOpen(false);
      soundSystem.playSuccess();
      alert(`¡Rutina "${newRoutine.name}" guardada con éxito! Podrás cargarla cuando gustes.`);
    } catch (e) {
      console.error(e);
      alert('Error guardando la rutina en la base de datos.');
    }
  };

  const handleDeleteRoutineTemplate = async (routineId: string) => {
    if (!window.confirm('¿Deseas eliminar esta rutina guardada?')) return;
    const updatedRoutines = savedRoutines.filter(r => r.id !== routineId);
    setSavedRoutines(updatedRoutines);

    try {
      const conf = await db.getConfig();
      const updatedConf = { ...conf, savedMangaRoutines: updatedRoutines };
      await db.saveConfig(updatedConf);
      setConfig?.(updatedConf);
      soundSystem.playSuccess();
    } catch (e) {
      console.error(e);
    }
  };

  const handleLoadRoutine = (routine: SavedMangaRoutine, startImmediately = false) => {
    const today = new Date().toISOString().split('T')[0];
    const loadedConfig: MangaWorkflowConfig = {
      name: `${routine.name} (${formatDate(today)})`,
      date: today,
      steps: routine.steps.map(s => ({ ...s, id: generateUUID() }))
    };

    setFlowConfig(loadedConfig);
    setMainTab('config');

    if (startImmediately) {
      setTimeout(() => {
        handleStartMangaWithConfig(loadedConfig);
      }, 50);
    } else {
      soundSystem.playSuccess();
      alert(`Rutina "${routine.name}" cargada en el configurador. Podés revisarla o iniciarla cuando gustes.`);
    }
  };

  // ── INICIAR JORNADA DE MANGA ──────────────────────────────────────────────
  const handleStartManga = () => {
    handleStartMangaWithConfig(flowConfig);
  };

  const handleStartMangaWithConfig = async (configToStart: MangaWorkflowConfig) => {
    if (!configToStart.name.trim()) {
      alert('Por favor asigná un nombre a la jornada de manga.');
      return;
    }

    const activeSteps = configToStart.steps.filter(s => s.enabled);
    if (activeSteps.length === 0) {
      alert('Debes tener al menos un paso habilitado en la rutina.');
      return;
    }

    try {
      const newSessionId = generateUUID();
      const createdSessions: Record<string, Sesion> = {};
      const initialCounts: Record<string, number> = {};

      for (let i = 0; i < activeSteps.length; i++) {
        const step = activeSteps[i];
        if (step.type !== 'Rodeo') {
          const sesType = step.type as 'Sanidad' | 'Tacto' | 'IA' | 'IATF';
          const ses: Sesion = {
            id: generateUUID(),
            type: sesType,
            date: configToStart.date,
            startedAt: Date.now() + i * 2,
            count: 0,
            label: `${configToStart.name} (${step.name}: ${step.type})`,
          };
          const targetRodeoVal = (
            step.type === 'Sanidad' ? step.sanidadTargetRodeo :
            step.type === 'IA' ? step.iaTargetRodeo :
            step.type === 'IATF' ? step.iatfTargetRodeo :
            ''
          )?.trim();
          if (targetRodeoVal) {
            ses.targetRodeo = targetRodeoVal;
          }
          await db.saveSesion(ses);
          createdSessions[step.id] = ses;
          initialCounts[step.id] = 0;
        } else {
          initialCounts[step.id] = 0;
        }
      }

      const initialTactoStats = { preniadaIA: 0, preniadaRepaso: 0, vacia: 0, rechazo: 0, total: 0 };
      const mangaSes: MangaSesion = {
        id: newSessionId,
        name: configToStart.name,
        date: configToStart.date,
        startedAt: Date.now(),
        totalAnimals: 0,
        flowConfig: configToStart,
        stepSessions: createdSessions,
        stepCounts: initialCounts,
        tactoStats: initialTactoStats,
        history: [],
        status: 'active',
      };
      await db.saveMangaSesion(mangaSes);
      await loadMangaSessions();

      setActiveSessionId(newSessionId);
      setStepSessions(createdSessions);
      setStepCounts(initialCounts);
      setTotalAnimalsPassed(0);
      setTactoStats(initialTactoStats);
      setHistory([]);
      setPendingTacto(null);
      setRfid('');
      setIsLiveMode(true);
      soundSystem.playSuccess();
      setTimeout(() => scannerRef.current?.focus(), 150);
    } catch (err: any) {
      console.error('Error al iniciar jornada de manga:', err);
      soundSystem.playError();
      const errMsg = err?.message || err?.toString() || JSON.stringify(err);
      alert(`Error al iniciar la jornada de manga:\n${errMsg}`);
    }
  };

  // ── REANUDAR SESIÓN DE MANGA EXISTENTE ────────────────────────────────────
  const handleResumeMangaSession = async (ses: MangaSesion) => {
    setActiveSessionId(ses.id);
    setFlowConfig(ses.flowConfig);
    setStepSessions(ses.stepSessions || {});
    setStepCounts(ses.stepCounts || {});
    setTotalAnimalsPassed(ses.totalAnimals || 0);
    setTactoStats(ses.tactoStats || { preniadaIA: 0, preniadaRepaso: 0, vacia: 0, rechazo: 0, total: 0 });
    setHistory(ses.history || []);
    setPendingTacto(null);
    setRfid('');
    setIsLiveMode(true);
    soundSystem.playSuccess();
    setTimeout(() => scannerRef.current?.focus(), 150);
  };

  // ── ELIMINAR SESIÓN DE MANGA ──────────────────────────────────────────────
  const handleDeleteMangaSession = async (sesId: string) => {
    if (!window.confirm('¿Seguro que deseas eliminar esta sesión de manga combinada y sus registros asociados?')) return;
    try {
      await db.deleteMangaSesion(sesId);
      await loadMangaSessions();
      soundSystem.playSuccess();
    } catch (e) {
      console.error(e);
      alert('Error eliminando la sesión de manga.');
    }
  };

  // ── DETENER / FINALIZAR MANGA ─────────────────────────────────────────────
  const handleStopManga = async () => {
    if (window.confirm('¿Deseas finalizar la jornada de manga actual y volver al historial?')) {
      try {
        const ses = await db.getMangaSesion(activeSessionId);
        if (ses) {
          ses.status = 'finished';
          ses.finishedAt = Date.now();
          await db.saveMangaSesion(ses);
        }
      } catch (e) {
        console.error(e);
      }
      localStorage.removeItem('senasa_active_manga_state');
      setIsLiveMode(false);
      setPendingTacto(null);
      setRfid('');
      setHistory([]);
      setTotalAnimalsPassed(0);
      setStepCounts({});
      setTactoStats({ preniadaIA: 0, preniadaRepaso: 0, vacia: 0, rechazo: 0, total: 0 });
      await loadMangaSessions();
      setMainTab('sessions');
    }
  };

  // ── EVALUAR SI EL ANIMAL CUMPLE LA CONDICIÓN DEL PASO ─────────────────────
  const checkStepCondition = (step: MangaStep, currentRodeo: string): boolean => {
    if (!step.enabled) return false;
    const rodeo = currentRodeo.trim();

    switch (step.conditionMode) {
      case 'ALL':
        return true;
      case 'SIN_RODEO':
        return rodeo === '' || rodeo === 'Sin Asignar' || rodeo === 'General';
      case 'SPECIFIC_RODEO':
        return rodeo === step.specificRodeo;
      case 'MULTI_RODEO':
        return step.multiRodeos.includes(rodeo);
      default:
        return false;
    }
  };

  // ── ESCANEO RFID ──────────────────────────────────────────────────────────
  const handleScan = async (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      if (pendingTacto) {
        handleSkipTacto();
        return;
      }
    }

    // Teclas rápidas numéricas para Tacto si está en espera
    if (pendingTacto) {
      if (e.key === '1') {
        e.preventDefault();
        await handleSaveTactoResult('Preñada IA');
        return;
      }
      if (e.key === '2') {
        e.preventDefault();
        await handleSaveTactoResult('Preñada Repaso');
        return;
      }
      if (e.key === '3') {
        e.preventDefault();
        await handleSaveTactoResult('Vacía');
        return;
      }
      if (e.key === '4') {
        e.preventDefault();
        await handleSaveTactoResult('Rechazo');
        return;
      }
    }

    if (e.key !== 'Enter') return;

    const code = rfid.trim();
    setRfid('');

    if (code.length !== 15 || !/^\d+$/.test(code)) {
      soundSystem.playError();
      return;
    }

    let animal = await db.getAnimal(code);
    if (!animal) {
      soundSystem.playNewAnimal();
      setPendingNewCode(code);
      setShowNewAnimalModal(true);
      return;
    }

    await executePipeline(animal, 0, [], animal.rodeo || 'Sin Asignar', animal.rodeo || 'Sin Asignar');
  };

  const submitNewAnimal = async () => {
    const animal: Animal = {
      id: pendingNewCode,
      sex: newSex,
      breed: newBreed,
      color: newColor,
      renspa: newRenspa,
      birthDate: newBirthDate,
      createdAt: Date.now(),
      reportedToSenasa: false,
    };
    await db.saveAnimal(animal);
    setShowNewAnimalModal(false);
    await executePipeline(animal, 0, [], 'Sin Asignar', 'Sin Asignar');
  };

  // ── MOTOR DE PIPELINE DE PASOS CONSECUTIVOS ───────────────────────────────
  const executePipeline = async (
    animal: Animal,
    startIndex: number,
    accumulatedSummaries: string[],
    currentRodeoVal: string,
    prevRodeoVal: string
  ) => {
    const activeSteps = flowConfig.steps.filter(s => s.enabled);

    // Verificar duplicados al iniciar el animal
    if (startIndex === 0) {
      const alreadyProcessed = history.some(h => h.animalId === animal.id);
      if (alreadyProcessed) {
        soundSystem.playError();
        setDuplicateWarning(`⚠️ ¡El animal ${animal.id} ya pasó por la manga en esta jornada!`);
        setTimeout(() => setDuplicateWarning(null), 4000);
        return;
      }
      setDuplicateWarning(null);
    }

    let runningRodeo = currentRodeoVal;
    const summaries = [...accumulatedSummaries];

    for (let i = startIndex; i < activeSteps.length; i++) {
      const step = activeSteps[i];
      const applies = checkStepCondition(step, runningRodeo);

      if (!applies) {
        summaries.push(`${step.name}: — (No aplicaba)`);
        continue;
      }

      // ── PASO: SANIDAD ───────────────────────────────────────────────────
      if (step.type === 'Sanidad') {
        const ses = stepSessions[step.id];
        if (ses) {
          const newCount = (stepCounts[step.id] || 0) + 1;
          const conf = await db.getConfig();
          let currentTube = conf.lastTubeNumber;
          if (conf.lastTubeDate !== flowConfig.date) {
            currentTube = 1;
          } else {
            currentTube++;
          }
          await db.saveConfig({ ...conf, lastTubeNumber: currentTube, lastTubeDate: flowConfig.date });

          await db.saveNovedad({
            id: generateUUID(),
            animalId: animal.id,
            date: flowConfig.date,
            timestamp: Date.now(),
            sessionId: ses.id,
            type: 'Sanidad',
            tubeNumber: newCount,
            rodeo: step.sanidadTargetRodeo.trim() || runningRodeo,
            prevRodeo: prevRodeoVal !== 'Sin Asignar' ? prevRodeoVal : undefined,
          });

          if (step.sanidadTargetRodeo.trim() && step.sanidadTargetRodeo.trim() !== runningRodeo) {
            runningRodeo = step.sanidadTargetRodeo.trim();
            animal.rodeo = runningRodeo;
            await db.saveAnimal(animal);
          }

          const updatedSes = { ...ses, count: newCount };
          await db.saveSesion(updatedSes);
          setStepSessions(prev => ({ ...prev, [step.id]: updatedSes }));
          setStepCounts(prev => ({ ...prev, [step.id]: newCount }));
          summaries.push(`${step.name}: Sanidad (Tubo #${newCount})`);
        }
      }

      // ── PASO: IA ────────────────────────────────────────────────────────
      else if (step.type === 'IA') {
        const ses = stepSessions[step.id];
        if (ses) {
          const newCount = (stepCounts[step.id] || 0) + 1;
          if (step.iaTargetRodeo.trim() && step.iaTargetRodeo.trim() !== runningRodeo) {
            runningRodeo = step.iaTargetRodeo.trim();
            animal.rodeo = runningRodeo;
            await db.saveAnimal(animal);
          }

          await db.saveNovedad({
            id: generateUUID(),
            animalId: animal.id,
            date: flowConfig.date,
            timestamp: Date.now(),
            sessionId: ses.id,
            type: 'IA',
            bull: step.iaBull,
            rodeo: step.iaTargetRodeo.trim() || runningRodeo,
            prevRodeo: prevRodeoVal !== 'Sin Asignar' ? prevRodeoVal : undefined,
          });

          const updatedSes = { ...ses, count: newCount };
          await db.saveSesion(updatedSes);
          setStepSessions(prev => ({ ...prev, [step.id]: updatedSes }));
          setStepCounts(prev => ({ ...prev, [step.id]: newCount }));
          summaries.push(`${step.name}: IA (${step.iaBull})`);
        }
      }

      // ── PASO: IATF (PROTOCOLO IATF) ─────────────────────────────────────
      else if (step.type === 'IATF') {
        const ses = stepSessions[step.id];
        if (ses) {
          const newCount = (stepCounts[step.id] || 0) + 1;
          if (step.iatfTargetRodeo.trim() && step.iatfTargetRodeo.trim() !== runningRodeo) {
            runningRodeo = step.iatfTargetRodeo.trim();
            animal.rodeo = runningRodeo;
            await db.saveAnimal(animal);
          }

          await db.saveNovedad({
            id: generateUUID(),
            animalId: animal.id,
            date: flowConfig.date,
            timestamp: Date.now(),
            sessionId: ses.id,
            type: 'IATF',
            protocol: step.iatfProtocol.trim() || undefined,
            rodeo: step.iatfTargetRodeo.trim() || runningRodeo,
            prevRodeo: prevRodeoVal !== 'Sin Asignar' ? prevRodeoVal : undefined,
          });

          const updatedSes = { ...ses, count: newCount };
          await db.saveSesion(updatedSes);
          setStepSessions(prev => ({ ...prev, [step.id]: updatedSes }));
          setStepCounts(prev => ({ ...prev, [step.id]: newCount }));
          summaries.push(`${step.name}: Protocolo IATF`);
        }
      }

      // ── PASO: REASIGNAR RODEO ───────────────────────────────────────────
      else if (step.type === 'Rodeo') {
        if (step.rodeoTarget.trim() && step.rodeoTarget.trim() !== runningRodeo) {
          runningRodeo = step.rodeoTarget.trim();
          animal.rodeo = runningRodeo;
          await db.saveAnimal(animal);
        }
        summaries.push(`${step.name}: Rodeo → ${runningRodeo}`);
      }

      // ── PASO: TACTO (INTERACTIVO - PAUSA EL PIPELINE) ───────────────────
      else if (step.type === 'Tacto') {
        const novs = await db.getNovedadesByAnimal(animal.id);
        const insems = novs.filter(n => n.type === 'IA' || n.type === 'IATF') as (NovedadIA | NovedadIATF)[];
        if (insems.length > 0) {
          insems.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          const lastInsem = insems[0];
          setLastIAData({ date: lastInsem.date, bull: (lastInsem as NovedadIA).bull || 'S/D', type: lastInsem.type });
        } else {
          setLastIAData(null);
        }

        soundSystem.playNegativeMatch();
        setPendingTacto({
          animal,
          stepIndex: i,
          completedSummaries: summaries,
          currentRodeoVal: runningRodeo,
          prevRodeoVal,
        });
        return;
      }
    }

    finishAnimalInManga(animal.id, prevRodeoVal, runningRodeo, summaries);
  };

  // ── GUARDAR RESULTADO DE TACTO Y CONTINUAR ────────────────────────────────
  const handleSaveTactoResult = async (result: 'Preñada IA' | 'Preñada Repaso' | 'Vacía' | 'Rechazo') => {
    if (!pendingTacto) return;
    const { animal, stepIndex, completedSummaries, currentRodeoVal, prevRodeoVal } = pendingTacto;
    const activeSteps = flowConfig.steps.filter(s => s.enabled);
    const currentStep = activeSteps[stepIndex];
    const ses = stepSessions[currentStep.id];

    let newRodeoVal = currentRodeoVal;

    let targetRule = '';
    if (result === 'Preñada IA' && currentStep.tactoTargetPreniadaIA.trim()) {
      targetRule = currentStep.tactoTargetPreniadaIA.trim();
    } else if (result === 'Preñada Repaso' && currentStep.tactoTargetPreniadaRepaso.trim()) {
      targetRule = currentStep.tactoTargetPreniadaRepaso.trim();
    } else if (result === 'Vacía' && currentStep.tactoTargetVacia.trim()) {
      targetRule = currentStep.tactoTargetVacia.trim();
    } else if (result === 'Rechazo' && currentStep.tactoTargetRechazo.trim()) {
      targetRule = currentStep.tactoTargetRechazo.trim();
    }

    if (targetRule && targetRule !== newRodeoVal) {
      newRodeoVal = targetRule;
      animal.rodeo = newRodeoVal;
      await db.saveAnimal(animal);
    }

    if (ses) {
      const newCount = (stepCounts[currentStep.id] || 0) + 1;
      await db.saveNovedad({
        id: generateUUID(),
        animalId: animal.id,
        date: flowConfig.date,
        type: 'Tacto',
        timestamp: Date.now(),
        sessionId: ses.id,
        result,
        observation: tactoObs.trim(),
        rodeo: newRodeoVal !== 'Sin Asignar' ? newRodeoVal : undefined,
        prevRodeo: prevRodeoVal !== 'Sin Asignar' ? prevRodeoVal : undefined,
      });

      const updatedSes = { ...ses, count: newCount };
      await db.saveSesion(updatedSes);
      setStepSessions(prev => ({ ...prev, [currentStep.id]: updatedSes }));
      setStepCounts(prev => ({ ...prev, [currentStep.id]: newCount }));
    }

    setTactoStats(prev => ({
      ...prev,
      total: prev.total + 1,
      preniadaIA: result === 'Preñada IA' ? prev.preniadaIA + 1 : prev.preniadaIA,
      preniadaRepaso: result === 'Preñada Repaso' ? prev.preniadaRepaso + 1 : prev.preniadaRepaso,
      vacia: result === 'Vacía' ? prev.vacia + 1 : prev.vacia,
      rechazo: result === 'Rechazo' ? prev.rechazo + 1 : prev.rechazo,
    }));

    const tactoSummary = `${currentStep.name}: Tacto (${result})${tactoObs.trim() ? ` [${tactoObs}]` : ''}`;
    const nextSummaries = [...completedSummaries, tactoSummary];

    setPendingTacto(null);
    setTactoObs('');
    setLastIAData(null);

    await executePipeline(animal, stepIndex + 1, nextSummaries, newRodeoVal, prevRodeoVal);
  };

  const handleSkipTacto = async () => {
    if (!pendingTacto) return;
    const { animal, stepIndex, completedSummaries, currentRodeoVal, prevRodeoVal } = pendingTacto;
    const activeSteps = flowConfig.steps.filter(s => s.enabled);
    const currentStep = activeSteps[stepIndex];

    const nextSummaries = [...completedSummaries, `${currentStep.name}: Tacto (Omitido)`];
    setPendingTacto(null);
    setTactoObs('');
    setLastIAData(null);

    await executePipeline(animal, stepIndex + 1, nextSummaries, currentRodeoVal, prevRodeoVal);
  };

  const finishAnimalInManga = (animalId: string, prevRodeo: string, newRodeo: string, stepSummaries: string[]) => {
    soundSystem.playSuccess();
    setTotalAnimalsPassed(prev => prev + 1);
    setHistory(prev => [
      {
        id: generateUUID(),
        timestamp: Date.now(),
        animalId,
        prevRodeo,
        newRodeo,
        stepSummaries,
      },
      ...prev
    ]);
    scannerRef.current?.focus();
  };

  // ──────────────────────────────────────────────────────────────────────────
  // ── VISTA 1: GESTOR DE SESIONES Y CONFIGURADOR DE MANGA
  // ──────────────────────────────────────────────────────────────────────────
  if (!isLiveMode) {
    return (
      <div className="view-container">
        <header className="view-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1>Manga Combinada</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.2rem' }}>
              Historial de sesiones, planificación anticipada y ejecución de mangas múltiples.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => setMainTab('config')}
              className="btn btn-primary"
              style={{ padding: '0.75rem 1.4rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              <Plus size={18} /> Nueva Sesión de Manga
            </button>
          </div>
        </header>

        {/* SUBPESTAÑAS PRINCIPALES: SESIONES vs CONFIGURAR vs RUTINAS */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => setMainTab('sessions')}
            className={`tab-btn ${mainTab === 'sessions' ? 'active' : ''}`}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700 }}
          >
            <Layers size={16} /> Sesiones de Manga ({mangaSessions.length})
          </button>
          <button
            onClick={() => setMainTab('config')}
            className={`tab-btn ${mainTab === 'config' ? 'active' : ''}`}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700 }}
          >
            <Sliders size={16} /> Configurar Nueva Sesión
          </button>
          <button
            onClick={() => setMainTab('routines')}
            className={`tab-btn ${mainTab === 'routines' ? 'active' : ''}`}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700 }}
          >
            <BookmarkCheck size={16} /> Rutinas Guardadas ({savedRoutines.length})
          </button>
        </div>

        {/* ── PESTAÑA 1: HISTORIAL DE SESIONES DE MANGA ─────────────────────── */}
        {mainTab === 'sessions' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {mangaSessions.length === 0 ? (
              <div className="glass-panel p-8 text-center" style={{ opacity: 0.85 }}>
                <Layers size={44} style={{ color: 'var(--accent)', margin: '0 auto 0.75rem', opacity: 0.5 }} />
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700 }}>No hay sesiones de manga registradas todavía</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.3rem', maxWidth: '480px', margin: '0.3rem auto 1.25rem' }}>
                  Podés armar una nueva sesión con los pasos y rodeos que necesites, o usar una rutina preconfigurada.
                </p>
                <button onClick={() => setMainTab('config')} className="btn btn-primary">
                  <Plus size={16} style={{ display: 'inline', marginRight: '0.3rem' }} /> Iniciar Primera Sesión
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                {mangaSessions.map((ses) => {
                  const isExpanded = expandedMangaSession === ses.id;
                  const activeStepsList = ses.flowConfig?.steps?.filter(s => s.enabled) || [];

                  return (
                    <div
                      key={ses.id}
                      className="glass-panel p-5"
                      style={{
                        borderLeft: `5px solid ${ses.status === 'active' ? '#10b981' : '#3b82f6'}`,
                        transition: 'box-shadow 0.2s',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                            {ses.status === 'active' && (
                              <span style={{ fontSize: '0.68rem', fontWeight: 800, background: '#10b981', color: '#fff', padding: '0.1rem 0.5rem', borderRadius: '99px' }}>
                                EN CURSO
                              </span>
                            )}
                            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                              {ses.name}
                            </h3>
                          </div>

                          <div style={{ display: 'flex', gap: '1rem', fontSize: '0.78rem', color: 'var(--text-secondary)', flexWrap: 'wrap', marginTop: '0.2rem' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                              <Calendar size={13} /> {formatDate(ses.date)}
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                              <Clock size={13} /> Iniciada: {formatTime(ses.startedAt)}
                            </span>
                            {ses.finishedAt && (
                              <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                Finalizada: {formatTime(ses.finishedAt)}
                              </span>
                            )}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                          <div style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: '10px', padding: '0.3rem 0.8rem', textAlign: 'center' }}>
                            <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#3b82f6', lineHeight: 1 }}>
                              {ses.totalAnimals || 0}
                            </div>
                            <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', fontWeight: 600 }}>animales</div>
                          </div>

                          <button
                            onClick={() => handleResumeMangaSession(ses)}
                            className="btn btn-primary"
                            style={{ padding: '0.55rem 1rem', fontSize: '0.85rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                            title="Reanudar o seguir pasando animales en esta sesión"
                          >
                            <Play size={15} /> Reanudar
                          </button>

                          <button
                            onClick={() => setExpandedMangaSession(isExpanded ? null : ses.id)}
                            className="btn"
                            style={{ padding: '0.55rem 0.8rem', fontSize: '0.85rem', fontWeight: 600, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                          >
                            <Eye size={15} /> {isExpanded ? 'Ocultar' : 'Detalle'}
                            {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                          </button>

                          <button
                            onClick={() => handleDeleteMangaSession(ses.id)}
                            className="btn-icon text-muted hover:text-danger"
                            style={{ color: '#ef4444' }}
                            title="Eliminar sesión de manga"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>

                      {/* Resumen de Pasos y Resultados */}
                      <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Pasos:</span>
                        {activeStepsList.map((step, idx) => (
                          <span key={step.id || idx} style={{ background: 'rgba(0,0,0,0.05)', padding: '0.15rem 0.55rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600 }}>
                            {idx + 1}. {step.name} ({step.type})
                          </span>
                        ))}

                        {ses.tactoStats && ses.tactoStats.total > 0 && (
                          <div style={{ display: 'flex', gap: '0.3rem', marginLeft: 'auto', flexWrap: 'wrap' }}>
                            <span style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981', padding: '0.15rem 0.45rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700 }}>
                              Preñadas IA: {ses.tactoStats.preniadaIA}
                            </span>
                            <span style={{ background: 'rgba(59,130,246,0.15)', color: '#3b82f6', padding: '0.15rem 0.45rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700 }}>
                              Preñadas Repaso: {ses.tactoStats.preniadaRepaso}
                            </span>
                            <span style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', padding: '0.15rem 0.45rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700 }}>
                              Vacías: {ses.tactoStats.vacia}
                            </span>
                            <span style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', padding: '0.15rem 0.45rem', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700 }}>
                              Rechazos: {ses.tactoStats.rechazo}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* DETALLE EXPANDIDO DE ANIMALES QUE PASARON */}
                      {isExpanded && (
                        <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
                          <h4 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                            Pasadas registradas ({ses.history?.length || 0})
                          </h4>

                          {(!ses.history || ses.history.length === 0) ? (
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>No se registraron pasadas en esta sesión.</p>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '250px', overflowY: 'auto' }}>
                              {ses.history.map((h) => (
                                <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.03)', padding: '0.4rem 0.75rem', borderRadius: '8px', fontSize: '0.78rem', flexWrap: 'wrap', gap: '0.4rem' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                    <span style={{ fontFamily: 'monospace', fontWeight: 800, color: 'var(--accent)' }}>{h.animalId}</span>
                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{formatTime(h.timestamp)}</span>
                                  </div>
                                  <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                                    {h.stepSummaries.map((sum, sIdx) => (
                                      <span key={sIdx} style={{ background: sum.includes('No aplicaba') ? 'rgba(0,0,0,0.05)' : 'rgba(16,185,129,0.12)', color: sum.includes('No aplicaba') ? 'var(--text-secondary)' : '#10b981', padding: '0.1rem 0.35rem', borderRadius: '4px', fontSize: '0.68rem', fontWeight: 700 }}>
                                        {sum}
                                      </span>
                                    ))}
                                  </div>
                                  {h.newRodeo !== h.prevRodeo && (
                                    <span style={{ fontSize: '0.7rem', color: '#10b981', fontWeight: 600 }}>
                                      {h.prevRodeo} → {h.newRodeo}
                                    </span>
                                  )}
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
            )}
          </div>
        )}

        {/* ── PESTAÑA 2: RUTINAS GUARDADAS ─────────────────────────────────── */}
        {mainTab === 'routines' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {savedRoutines.length === 0 ? (
              <div className="glass-panel p-8 text-center" style={{ opacity: 0.8 }}>
                <Bookmark size={40} style={{ color: 'var(--accent)', margin: '0 auto 0.75rem', opacity: 0.5 }} />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>No tenés rutinas guardadas todavía</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.3rem', maxWidth: '480px', margin: '0.3rem auto 1rem' }}>
                  Podés configurar los pasos la noche anterior y hacer clic en <strong>&quot;Guardar Rutina&quot;</strong>. Quedarán almacenadas aquí para iniciar la manga con 1 solo toque.
                </p>
                <button onClick={() => setMainTab('config')} className="btn btn-primary">
                  Ir al Configurador
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {savedRoutines.map((routine) => (
                  <div key={routine.id} className="glass-panel p-5" style={{ borderTop: '4px solid #8b5cf6', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '1rem' }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                        <div>
                          <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>{routine.name}</h3>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                            Creada: {new Date(routine.createdAt).toLocaleDateString('es-AR')}
                          </span>
                        </div>
                        <button
                          onClick={() => handleDeleteRoutineTemplate(routine.id)}
                          className="btn-icon text-muted hover:text-danger"
                          title="Eliminar rutina guardada"
                          style={{ color: '#ef4444' }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.75rem' }}>
                        {routine.steps.map((s, sIdx) => (
                          <div key={s.id || sIdx} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', background: 'rgba(0,0,0,0.03)', padding: '0.3rem 0.6rem', borderRadius: '6px' }}>
                            <span style={{ fontWeight: 800, color: '#8b5cf6' }}>{sIdx + 1}.</span>
                            <span style={{ fontWeight: 700 }}>{s.type}</span>
                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.74rem' }}>
                              ({s.conditionMode === 'ALL' ? 'Todos' : s.conditionMode === 'SPECIFIC_RODEO' ? s.specificRodeo : s.conditionMode === 'SIN_RODEO' ? 'Sin Rodeo' : 'Varios Rodeos'})
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                      <button
                        onClick={() => handleLoadRoutine(routine, true)}
                        className="btn btn-primary"
                        style={{ flex: 1, padding: '0.6rem', fontSize: '0.85rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}
                      >
                        <Play size={16} /> Iniciar Ahora
                      </button>
                      <button
                        onClick={() => handleLoadRoutine(routine, false)}
                        className="btn"
                        style={{ padding: '0.6rem 0.9rem', fontSize: '0.82rem', fontWeight: 700, border: '1px solid var(--border)' }}
                      >
                        <FileText size={16} /> Editar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── PESTAÑA 3: CONFIGURADOR / NUEVA SESIÓN ───────────────────────── */}
        {mainTab === 'config' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* PANEL GENERAL */}
            <div className="glass-panel p-6" style={{ borderTop: '4px solid #3b82f6' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <h2 className="text-lg font-semibold" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Sliders size={20} className="text-accent" /> Datos de la Nueva Sesión
                </h2>

                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  {savedRoutines.length > 0 && (
                    <select
                      className="input-field"
                      style={{ fontSize: '0.8rem', padding: '0.25rem 0.6rem', width: 'auto', fontWeight: 600 }}
                      onChange={e => {
                        const r = savedRoutines.find(x => x.id === e.target.value);
                        if (r) handleLoadRoutine(r, false);
                      }}
                      defaultValue=""
                    >
                      <option value="" disabled>Cargar desde plantilla guardada...</option>
                      {savedRoutines.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  )}
                  <button
                    onClick={openSaveRoutineModal}
                    className="btn"
                    style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)', color: '#8b5cf6', fontWeight: 700, fontSize: '0.82rem', padding: '0.35rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                  >
                    <Bookmark size={15} /> Guardar como Rutina
                  </button>
                  <button
                    onClick={handleAddStep}
                    className="btn"
                    style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', color: '#3b82f6', fontWeight: 700, fontSize: '0.82rem', padding: '0.35rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                  >
                    <Plus size={15} /> Agregar Paso
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="form-group">
                  <label>Nombre / Identificador de la Sesión</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Ej. Manga 25/08: Sanidad General + Tacto Rodeo 1"
                    value={flowConfig.name}
                    onChange={e => setFlowConfig({ ...flowConfig, name: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label>Fecha de los Trabajos</label>
                  <input
                    type="date"
                    className="input-field"
                    value={flowConfig.date}
                    onChange={e => setFlowConfig({ ...flowConfig, date: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {/* LISTA DE PASOS MODULARES */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {flowConfig.steps.map((step, idx) => {
                const borderColors = ['#10b981', '#8b5cf6', '#3b82f6', '#f59e0b'];
                const borderColor = borderColors[idx % borderColors.length];

                return (
                  <div
                    key={step.id}
                    className="glass-panel p-6"
                    style={{ borderTop: `4px solid ${borderColor}`, position: 'relative' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span style={{
                          width: '28px', height: '28px', borderRadius: '50%',
                          background: `${borderColor}25`, border: `1.5px solid ${borderColor}`,
                          color: borderColor, fontWeight: 900, fontSize: '0.9rem',
                          display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                          {idx + 1}
                        </span>
                        <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                          {step.name}
                        </h2>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>
                          <input
                            type="checkbox"
                            checked={step.enabled}
                            onChange={e => handleUpdateStep(idx, { enabled: e.target.checked })}
                            style={{ width: '16px', height: '16px' }}
                          />
                          Habilitado
                        </label>
                        {flowConfig.steps.length > 1 && (
                          <button
                            onClick={() => handleRemoveStep(idx)}
                            className="btn-icon text-muted hover:text-danger"
                            title="Eliminar este paso"
                            style={{ color: '#ef4444' }}
                          >
                            <Trash2 size={18} />
                          </button>
                        )}
                      </div>
                    </div>

                    {step.enabled ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Tarea y Condición de Activación */}
                        <div>
                          <div className="form-group mb-4">
                            <label>Tipo de Tarea</label>
                            <select
                              className="input-field"
                              value={step.type}
                              onChange={e => handleUpdateStep(idx, { type: e.target.value as StepType })}
                              style={{ fontWeight: 700 }}
                            >
                              <option value="Sanidad">🧪 Sanidad (Asignación automática de Tubo)</option>
                              <option value="Tacto">🤚 Tacto</option>
                              <option value="IA">🐂 Inseminación Artificial (IA)</option>
                              <option value="IATF">🧬 Inicio de Protocolo IATF</option>
                              <option value="Rodeo">🏷️ Reasignar Rodeo Solamente</option>
                            </select>
                          </div>

                          <div className="form-group mb-4">
                            <label>¿A qué animales se les aplica este paso?</label>
                            <select
                              className="input-field"
                              value={step.conditionMode}
                              onChange={e => handleUpdateStep(idx, { conditionMode: e.target.value as ConditionMode })}
                              style={{ fontWeight: 600 }}
                            >
                              <option value="ALL">👉 A TODOS los animales que pasen</option>
                              <option value="SPECIFIC_RODEO">🎯 Solo a los animales de un Rodeo específico</option>
                              <option value="SIN_RODEO">⚠️ Solo a animales SIN RODEO asignado</option>
                              <option value="MULTI_RODEO">📋 A cualquiera de varios Rodeos seleccionados</option>
                            </select>
                          </div>

                          {step.conditionMode === 'SPECIFIC_RODEO' && (
                            <div className="form-group mb-4">
                              <label>Rodeo que activa este paso:</label>
                              <select
                                className="input-field"
                                value={step.specificRodeo}
                                onChange={e => handleUpdateStep(idx, { specificRodeo: e.target.value })}
                              >
                                {(config.rodeos || []).map(r => <option key={r} value={r}>{r}</option>)}
                              </select>
                            </div>
                          )}

                          {step.conditionMode === 'MULTI_RODEO' && (
                            <div className="form-group mb-4">
                              <label>Rodeos habilitados:</label>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', maxHeight: '130px', overflowY: 'auto', padding: '0.5rem', background: 'rgba(0,0,0,0.05)', borderRadius: '8px' }}>
                                {(config.rodeos || []).map(r => (
                                  <label key={r} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', cursor: 'pointer' }}>
                                    <input
                                      type="checkbox"
                                      checked={step.multiRodeos.includes(r)}
                                      onChange={e => {
                                        if (e.target.checked) {
                                          handleUpdateStep(idx, { multiRodeos: [...step.multiRodeos, r] });
                                        } else {
                                          handleUpdateStep(idx, { multiRodeos: step.multiRodeos.filter(x => x !== r) });
                                        }
                                      }}
                                    />
                                    {r}
                                  </label>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Configuración específica según el Tipo de Tarea */}
                        <div>
                          {step.type === 'Sanidad' && (
                            <div className="form-group">
                              <label>Rodeo de Destino tras Sanidad (Opcional)</label>
                              <input
                                type="text"
                                list="rodeos-list-manga"
                                className="input-field"
                                placeholder="Dejar vacío para conservar el rodeo actual"
                                value={step.sanidadTargetRodeo}
                                onChange={e => handleUpdateStep(idx, { sanidadTargetRodeo: e.target.value })}
                              />
                            </div>
                          )}

                          {step.type === 'IA' && (
                            <>
                              <div className="form-group mb-3">
                                <label>Toro a Utilizar</label>
                                <select
                                  className="input-field"
                                  value={step.iaBull}
                                  onChange={e => handleUpdateStep(idx, { iaBull: e.target.value })}
                                >
                                  {config.bulls.map(b => <option key={b} value={b}>{b}</option>)}
                                </select>
                              </div>
                              <div className="form-group">
                                <label>Rodeo de Destino tras IA (Opcional)</label>
                                <input
                                  type="text"
                                  list="rodeos-list-manga"
                                  className="input-field"
                                  placeholder="Dejar vacío para conservar el rodeo actual"
                                  value={step.iaTargetRodeo}
                                  onChange={e => handleUpdateStep(idx, { iaTargetRodeo: e.target.value })}
                                />
                              </div>
                            </>
                          )}

                          {step.type === 'IATF' && (
                            <>
                              <div className="form-group mb-3">
                                <label>Nombre / Identificador de Protocolo IATF (Opcional)</label>
                                <input
                                  type="text"
                                  className="input-field"
                                  placeholder="Ej. Colocación D0, Retiro D8..."
                                  value={step.iatfProtocol}
                                  onChange={e => handleUpdateStep(idx, { iatfProtocol: e.target.value })}
                                />
                              </div>
                              <div className="form-group">
                                <label>Rodeo de Destino tras IATF (Opcional)</label>
                                <input
                                  type="text"
                                  list="rodeos-list-manga"
                                  className="input-field"
                                  placeholder="Ej. 1° IATF 2026..."
                                  value={step.iatfTargetRodeo}
                                  onChange={e => handleUpdateStep(idx, { iatfTargetRodeo: e.target.value })}
                                />
                              </div>
                            </>
                          )}

                          {step.type === 'Rodeo' && (
                            <div className="form-group">
                              <label>Rodeo de Destino Inmediato</label>
                              <input
                                type="text"
                                list="rodeos-list-manga"
                                className="input-field"
                                placeholder="Ej. Rodeo 1, Vaquillonas, Venta..."
                                value={step.rodeoTarget}
                                onChange={e => handleUpdateStep(idx, { rodeoTarget: e.target.value })}
                              />
                            </div>
                          )}

                          {step.type === 'Tacto' && (
                            <div style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.25)', borderRadius: '12px', padding: '0.9rem' }}>
                              <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#a855f7', marginBottom: '0.6rem', textTransform: 'uppercase' }}>
                                Derivación de Rodeo según Resultado de Tacto
                              </h3>

                              <div className="form-group mb-2">
                                <label style={{ fontSize: '0.74rem', color: '#10b981', fontWeight: 700 }}>✅ Si está Preñada IA → Mover a:</label>
                                <input
                                  type="text"
                                  list="rodeos-list-manga"
                                  className="input-field"
                                  placeholder="Ej. Preñadas IA (Opcional)"
                                  value={step.tactoTargetPreniadaIA}
                                  onChange={e => handleUpdateStep(idx, { tactoTargetPreniadaIA: e.target.value })}
                                  style={{ fontSize: '0.82rem', padding: '0.35rem 0.6rem' }}
                                />
                              </div>

                              <div className="form-group mb-2">
                                <label style={{ fontSize: '0.74rem', color: '#3b82f6', fontWeight: 700 }}>🔄 Si está Preñada Repaso → Mover a:</label>
                                <input
                                  type="text"
                                  list="rodeos-list-manga"
                                  className="input-field"
                                  placeholder="Ej. Preñadas Repaso (Opcional)"
                                  value={step.tactoTargetPreniadaRepaso}
                                  onChange={e => handleUpdateStep(idx, { tactoTargetPreniadaRepaso: e.target.value })}
                                  style={{ fontSize: '0.82rem', padding: '0.35rem 0.6rem' }}
                                />
                              </div>

                              <div className="form-group mb-2">
                                <label style={{ fontSize: '0.74rem', color: '#ef4444', fontWeight: 700 }}>❌ Si está Vacía → Mover a:</label>
                                <input
                                  type="text"
                                  list="rodeos-list-manga"
                                  className="input-field"
                                  placeholder="Ej. Vacías Servicio (Opcional)"
                                  value={step.tactoTargetVacia}
                                  onChange={e => handleUpdateStep(idx, { tactoTargetVacia: e.target.value })}
                                  style={{ fontSize: '0.82rem', padding: '0.35rem 0.6rem' }}
                                />
                              </div>

                              <div className="form-group mb-0">
                                <label style={{ fontSize: '0.74rem', color: '#f59e0b', fontWeight: 700 }}>⚠️ Si es Rechazo → Mover a:</label>
                                <input
                                  type="text"
                                  list="rodeos-list-manga"
                                  className="input-field"
                                  placeholder="Ej. Rechazo / Descarte (Opcional)"
                                  value={step.tactoTargetRechazo}
                                  onChange={e => handleUpdateStep(idx, { tactoTargetRechazo: e.target.value })}
                                  style={{ fontSize: '0.82rem', padding: '0.35rem 0.6rem' }}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontStyle: 'italic' }}>
                        Este paso está desactivado.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button
                onClick={handleStartManga}
                className="btn btn-primary"
                style={{ padding: '0.9rem 2.2rem', fontSize: '1.05rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.6rem', boxShadow: '0 4px 16px rgba(37,99,235,0.4)' }}
              >
                <Play size={22} /> Iniciar Manga en Vivo
              </button>
            </div>

            <datalist id="rodeos-list-manga">
              {(config.rodeos || []).map(r => <option key={r} value={r} />)}
            </datalist>
          </div>
        )}

        {/* MODAL GUARDAR PLANTILLA DE RUTINA */}
        {saveRoutineModalOpen && (
          <div className="modal-overlay" style={{ zIndex: 1000 }}>
            <div className="glass-panel p-6" style={{ maxWidth: '420px', width: '100%' }}>
              <h2 className="text-lg font-bold mb-2 text-accent" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <BookmarkCheck size={22} /> Guardar Rutina Previa
              </h2>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                Guardá el orden de pasos y condiciones configurados para tenerlos listos y cargarlos cuando quieras.
              </p>

              <div className="form-group mb-4">
                <label>Nombre de la Rutina / Protocolo</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Ej. Sanidad General + Tacto Vaquillonas"
                  value={routineNameToSave}
                  onChange={e => setRoutineNameToSave(e.target.value)}
                  autoFocus
                />
              </div>

              <div style={{ display: 'flex', gap: '0.6rem' }}>
                <button onClick={handleSaveRoutineTemplate} className="btn btn-primary" style={{ flex: 1 }}>
                  Guardar Rutina
                </button>
                <button onClick={() => setSaveRoutineModalOpen(false)} className="btn" style={{ border: '1px solid var(--border)' }}>
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // ── VISTA 2: PANTALLA DE OPERACIÓN EN MANGA (MODO CAMPO / ALTA VELOCIDAD)
  // ──────────────────────────────────────────────────────────────────────────
  const activeSteps = flowConfig.steps.filter(s => s.enabled);
  const hasTactoStep = activeSteps.some(s => s.type === 'Tacto');

  return (
    <div className="view-container">
      {/* CABECERA EN OPERACIÓN */}
      <header className="view-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10b981', display: 'inline-block', boxShadow: '0 0 10px #10b981' }} />
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Manga en Vivo: {flowConfig.name}</h1>
          </div>
          <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.3rem', flexWrap: 'wrap' }}>
            {activeSteps.map(s => (
              <span key={s.id} style={{ fontSize: '0.75rem', background: 'rgba(0,0,0,0.06)', padding: '0.15rem 0.5rem', borderRadius: '6px', fontWeight: 600 }}>
                {s.name}: <strong>{s.type}</strong>
              </span>
            ))}
          </div>
        </div>

        <button
          onClick={handleStopManga}
          className="btn"
          style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid #ef4444', color: '#dc2626', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem' }}
        >
          <RotateCcw size={16} /> Detener / Salir
        </button>
      </header>

      {/* CONTADORES EN VIVO */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <div className="glass-panel p-3 text-center" style={{ borderTop: '3px solid #3b82f6' }}>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#3b82f6', lineHeight: 1 }}>{totalAnimalsPassed}</div>
          <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginTop: '0.2rem' }}>Total Manga</div>
        </div>

        {activeSteps.map(s => {
          if (s.type === 'Tacto') {
            return (
              <div key={s.id} className="glass-panel p-3 text-center" style={{ borderTop: '3px solid #8b5cf6' }}>
                <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#8b5cf6', lineHeight: 1 }}>{tactoStats.total}</div>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginTop: '0.2rem' }}>{s.name} ({s.type})</div>
              </div>
            );
          }
          return (
            <div key={s.id} className="glass-panel p-3 text-center" style={{ borderTop: '3px solid #10b981' }}>
              <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#10b981', lineHeight: 1 }}>{stepCounts[s.id] || 0}</div>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginTop: '0.2rem' }}>{s.name} ({s.type})</div>
            </div>
          );
        })}

        {hasTactoStep && (
          <>
            <div className="glass-panel p-3 text-center" style={{ borderTop: '3px solid #10b981' }}>
              <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#10b981', lineHeight: 1 }}>{tactoStats.preniadaIA}</div>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginTop: '0.2rem' }}>Preñadas IA</div>
            </div>
            <div className="glass-panel p-3 text-center" style={{ borderTop: '3px solid #60a5fa' }}>
              <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#60a5fa', lineHeight: 1 }}>{tactoStats.preniadaRepaso}</div>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginTop: '0.2rem' }}>Preñadas Repaso</div>
            </div>
            <div className="glass-panel p-3 text-center" style={{ borderTop: '3px solid #ef4444' }}>
              <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#ef4444', lineHeight: 1 }}>{tactoStats.vacia}</div>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginTop: '0.2rem' }}>Vacías</div>
            </div>
            <div className="glass-panel p-3 text-center" style={{ borderTop: '3px solid #f59e0b' }}>
              <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#f59e0b', lineHeight: 1 }}>{tactoStats.rechazo}</div>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginTop: '0.2rem' }}>Rechazos</div>
            </div>
          </>
        )}
      </div>

      <div className="grid-layout" style={{ gridTemplateColumns: 'var(--grid-cols, 1fr 380px)', gap: '1.5rem' }}>
        {/* PANEL PRINCIPAL DE ESCANEO / ACCIÓN TÁCTIL */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* INPUT DE BASTÓN */}
          <div className="glass-panel p-5" style={{ background: 'rgba(37,99,235,0.06)', border: '2px solid rgba(37,99,235,0.4)' }}>
            <label style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <ScanLine size={24} /> LECTURA DE BASTÓN (RFID)
            </label>
            <input
              ref={scannerRef}
              type="text"
              className="input-field font-mono text-xl"
              placeholder="Esperando lectura del bastón..."
              value={rfid}
              onChange={e => setRfid(e.target.value)}
              onKeyDown={handleScan}
              style={{ height: '3.2rem', fontSize: '1.4rem', fontWeight: 800, letterSpacing: '0.08em', backgroundColor: 'var(--card-bg)' }}
              autoFocus
            />

            {duplicateWarning && (
              <div style={{ marginTop: '0.75rem', padding: '0.6rem 0.9rem', background: 'rgba(239,68,68,0.15)', border: '1.5px solid #ef4444', borderRadius: '8px', color: '#dc2626', fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ShieldAlert size={18} /> {duplicateWarning}
              </div>
            )}
          </div>

          {/* TARJETA DE ACCIÓN TÁCTIL DE TACTO (SI ESTÁ EN ESPERA) */}
          {pendingTacto && (
            <div className="glass-panel p-6" style={{ background: 'rgba(139,92,246,0.08)', border: '2.5px solid #8b5cf6', borderRadius: '16px', animation: 'pulse 0.4s ease' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid rgba(139,92,246,0.2)', paddingBottom: '0.75rem' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Acción Requerida · Tacto
                  </span>
                  <div style={{ fontFamily: 'monospace', fontSize: '1.5rem', fontWeight: 900, color: 'var(--text-primary)' }}>
                    {pendingTacto.animal.id}
                  </div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    Rodeo actual: <strong style={{ color: '#f59e0b' }}>{pendingTacto.currentRodeoVal || 'Sin Asignar'}</strong>
                  </div>
                  {pendingTacto.completedSummaries.length > 0 && (
                    <div style={{ display: 'flex', gap: '0.3rem', marginTop: '0.3rem', flexWrap: 'wrap' }}>
                      {pendingTacto.completedSummaries.map((s, i) => (
                        <span key={i} style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981', padding: '0.1rem 0.4rem', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700 }}>
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {lastIAData ? (
                  <div style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid #3b82f6', borderRadius: '10px', padding: '0.4rem 0.8rem', textAlign: 'right' }}>
                    <div style={{ fontSize: '0.7rem', color: '#60a5fa', fontWeight: 700 }}>ÚLTIMA {lastIAData.type}</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#3b82f6' }}>Toro: {lastIAData.bull}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Fecha: {formatDate(lastIAData.date)}</div>
                  </div>
                ) : (
                  <div style={{ background: 'rgba(0,0,0,0.05)', borderRadius: '10px', padding: '0.4rem 0.8rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Sin IA reciente registrada
                  </div>
                )}
              </div>

              {/* BOTONES GIGANTES TÁCTILES */}
              {(() => {
                const currentStep = activeSteps[pendingTacto.stepIndex];
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                    <button
                      onClick={() => handleSaveTactoResult('Preñada IA')}
                      style={{
                        background: 'linear-gradient(135deg, rgba(16,185,129,0.2) 0%, rgba(16,185,129,0.1) 100%)',
                        border: '2px solid #10b981',
                        borderRadius: '12px',
                        padding: '1.1rem 0.75rem',
                        color: '#10b981',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.3rem',
                      }}
                    >
                      <div style={{ fontSize: '1.15rem', fontWeight: 900 }}>✅ Preñada IA</div>
                      <span style={{ fontSize: '0.72rem', opacity: 0.8 }}>[Tecla 1]</span>
                      {currentStep?.tactoTargetPreniadaIA && (
                        <span style={{ fontSize: '0.68rem', background: 'rgba(16,185,129,0.2)', padding: '0.1rem 0.4rem', borderRadius: '4px', marginTop: '0.2rem' }}>
                          → {currentStep.tactoTargetPreniadaIA}
                        </span>
                      )}
                    </button>

                    <button
                      onClick={() => handleSaveTactoResult('Preñada Repaso')}
                      style={{
                        background: 'linear-gradient(135deg, rgba(59,130,246,0.2) 0%, rgba(59,130,246,0.1) 100%)',
                        border: '2px solid #3b82f6',
                        borderRadius: '12px',
                        padding: '1.1rem 0.75rem',
                        color: '#3b82f6',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.3rem',
                      }}
                    >
                      <div style={{ fontSize: '1.15rem', fontWeight: 900 }}>🔄 Preñada Repaso</div>
                      <span style={{ fontSize: '0.72rem', opacity: 0.8 }}>[Tecla 2]</span>
                      {currentStep?.tactoTargetPreniadaRepaso && (
                        <span style={{ fontSize: '0.68rem', background: 'rgba(59,130,246,0.2)', padding: '0.1rem 0.4rem', borderRadius: '4px', marginTop: '0.2rem' }}>
                          → {currentStep.tactoTargetPreniadaRepaso}
                        </span>
                      )}
                    </button>

                    <button
                      onClick={() => handleSaveTactoResult('Vacía')}
                      style={{
                        background: 'linear-gradient(135deg, rgba(239,68,68,0.2) 0%, rgba(239,68,68,0.1) 100%)',
                        border: '2px solid #ef4444',
                        borderRadius: '12px',
                        padding: '1.1rem 0.75rem',
                        color: '#dc2626',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.3rem',
                      }}
                    >
                      <div style={{ fontSize: '1.15rem', fontWeight: 900 }}>❌ Vacía</div>
                      <span style={{ fontSize: '0.72rem', opacity: 0.8 }}>[Tecla 3]</span>
                      {currentStep?.tactoTargetVacia && (
                        <span style={{ fontSize: '0.68rem', background: 'rgba(239,68,68,0.2)', padding: '0.1rem 0.4rem', borderRadius: '4px', marginTop: '0.2rem' }}>
                          → {currentStep.tactoTargetVacia}
                        </span>
                      )}
                    </button>

                    <button
                      onClick={() => handleSaveTactoResult('Rechazo')}
                      style={{
                        background: 'linear-gradient(135deg, rgba(245,158,11,0.2) 0%, rgba(245,158,11,0.1) 100%)',
                        border: '2px solid #f59e0b',
                        borderRadius: '12px',
                        padding: '1.1rem 0.75rem',
                        color: '#d97706',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.3rem',
                      }}
                    >
                      <div style={{ fontSize: '1.15rem', fontWeight: 900 }}>⚠️ Rechazo</div>
                      <span style={{ fontSize: '0.72rem', opacity: 0.8 }}>[Tecla 4]</span>
                      {currentStep?.tactoTargetRechazo && (
                        <span style={{ fontSize: '0.68rem', background: 'rgba(245,158,11,0.2)', padding: '0.1rem 0.4rem', borderRadius: '4px', marginTop: '0.2rem' }}>
                          → {currentStep.tactoTargetRechazo}
                        </span>
                      )}
                    </button>
                  </div>
                );
              })()}

              {/* Observación y Omitir */}
              <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                <input
                  type="text"
                  className="input-field flex-1"
                  placeholder="Observación opcional de tacto..."
                  value={tactoObs}
                  onChange={e => setTactoObs(e.target.value)}
                  style={{ fontSize: '0.85rem' }}
                />
                <button
                  onClick={handleSkipTacto}
                  className="btn"
                  style={{ background: 'transparent', border: '1px solid rgba(0,0,0,0.2)', color: 'var(--text-secondary)', fontSize: '0.82rem', padding: '0.5rem 0.8rem' }}
                  title="Saltear tacto para este animal"
                >
                  [Esc] Omitir
                </button>
              </div>
            </div>
          )}

          {!pendingTacto && (
            <div className="glass-panel p-8 text-center" style={{ opacity: 0.8 }}>
              <ScanLine size={48} style={{ color: 'var(--accent)', margin: '0 auto 0.75rem', opacity: 0.5 }} />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Listo para la siguiente pasada
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>
                Al leer la caravana con el bastón se procesarán los pasos configurados en secuencia automática o interactiva.
              </p>
            </div>
          )}
        </div>

        {/* PANEL LATERAL: HISTORIAL EN VIVO DE ANIMALES PROCESADOS */}
        <div className="glass-panel p-5" style={{ display: 'flex', flexDirection: 'column', height: '620px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Clock size={16} /> Pasadas Recientes
            </h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{history.length} en manga</span>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {history.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', textAlign: 'center', margin: 'auto' }}>
                Aún no han pasado animales por la manga.
              </p>
            ) : (
              history.map((h, i) => (
                <div
                  key={h.id}
                  style={{
                    background: i === 0 ? 'rgba(37,99,235,0.08)' : 'rgba(0,0,0,0.03)',
                    border: i === 0 ? '1px solid rgba(37,99,235,0.3)' : '1px solid rgba(0,0,0,0.08)',
                    borderRadius: '10px',
                    padding: '0.6rem 0.75rem',
                    fontSize: '0.8rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 800, color: 'var(--accent)', fontSize: '0.9rem' }}>
                      {h.animalId}
                    </span>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                      {formatTime(h.timestamp)}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.25rem' }}>
                    {h.stepSummaries.map((sum, sIdx) => (
                      <span
                        key={sIdx}
                        style={{
                          background: sum.includes('No aplicaba') ? 'rgba(0,0,0,0.06)' : 'rgba(16,185,129,0.15)',
                          color: sum.includes('No aplicaba') ? 'var(--text-secondary)' : '#10b981',
                          padding: '0.1rem 0.4rem',
                          borderRadius: '4px',
                          fontSize: '0.7rem',
                          fontWeight: 700
                        }}
                      >
                        {sum}
                      </span>
                    ))}
                  </div>

                  {h.newRodeo !== h.prevRodeo && (
                    <div style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 600, marginTop: '0.3rem' }}>
                      Rodeo: {h.prevRodeo} → <strong>{h.newRodeo}</strong>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* MODAL ALTA RÁPIDA DE ANIMAL NUEVO */}
      {showNewAnimalModal && (
        <div className="modal-overlay" style={{ zIndex: 1000 }}>
          <div className="glass-panel p-6" style={{ maxWidth: '420px', width: '100%' }}>
            <h2 className="text-lg font-bold mb-2 text-accent">¡Animal No Registrado!</h2>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              La caravana <strong style={{ fontFamily: 'monospace', color: 'var(--text-primary)' }}>{pendingNewCode}</strong> no existe en el padrón. Completá los datos básicos para continuar en la manga.
            </p>

            <div className="form-group mb-3">
              <label>Sexo</label>
              <select className="input-field" value={newSex} onChange={e => setNewSex(e.target.value)}>
                <option value="H">Hembra (H)</option>
                <option value="M">Macho (M)</option>
              </select>
            </div>

            <div className="form-group mb-3">
              <label>Raza</label>
              <select className="input-field" value={newBreed} onChange={e => setNewBreed(e.target.value)}>
                <option value="AA">Aberdeen Angus (AA)</option>
                <option value="H">Hereford (H)</option>
                <option value="GC">Ganado Cruza (GC)</option>
              </select>
            </div>

            <div className="form-group mb-3">
              <label>Color</label>
              <select className="input-field" value={newColor} onChange={e => setNewColor(e.target.value)}>
                {config.colors.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div className="form-group mb-3">
              <label>RENSPA</label>
              <select className="input-field" value={newRenspa} onChange={e => setNewRenspa(e.target.value)}>
                {config.renspas.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>

            <div className="form-group mb-4">
              <label>Fecha de Nacimiento (Opcional MM/YYYY)</label>
              <input
                type="text"
                className="input-field"
                placeholder="Ej. 10/2022"
                value={newBirthDate}
                onChange={e => setNewBirthDate(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.6rem' }}>
              <button onClick={submitNewAnimal} className="btn btn-primary" style={{ flex: 1 }}>
                Guardar y Procesar
              </button>
              <button onClick={() => setShowNewAnimalModal(false)} className="btn" style={{ border: '1px solid var(--border)' }}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
