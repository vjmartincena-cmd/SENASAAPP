import { useState, useEffect, useRef, KeyboardEvent } from 'react';
import { db, Animal, AppConfig } from '../db';
import { soundSystem } from '../sounds';
import { 
  Layers, 
  Plus, 
  Search, 
  Edit3, 
  Trash2, 
  ArrowRightLeft, 
  Download, 
  ScanLine, 
  CheckSquare, 
  Square, 
  ChevronRight
} from 'lucide-react';
import * as XLSX from 'xlsx';

interface RodeosViewProps {
  config: AppConfig;
  setConfig: (config: AppConfig) => void;
}

export function RodeosView({ config, setConfig }: RodeosViewProps) {
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [selectedRodeo, setSelectedRodeo] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  
  // Modales
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRodeoName, setNewRodeoName] = useState('');
  
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [rodeoToRename, setRodeoToRename] = useState('');
  const [renamedTitle, setRenamedTitle] = useState('');

  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferTargetRodeo, setTransferTargetRodeo] = useState('');

  // Selección múltiple
  const [selectedAnimalIds, setSelectedAnimalIds] = useState<string[]>([]);

  // Escáner en el rodeo activo
  const [scannerRfid, setScannerRfid] = useState('');
  const [scanFeedback, setScanFeedback] = useState<{ msg: string; type: 'success' | 'warn' | 'error' } | null>(null);
  const scannerInputRef = useRef<HTMLInputElement>(null);

  const loadData = async () => {
    const list = await db.getAllAnimals();
    setAnimals(list);
  };

  useEffect(() => {
    loadData();
  }, []);

  // Foco en escáner si hay un rodeo seleccionado
  useEffect(() => {
    if (!selectedRodeo) return;
    const focusScanner = () => {
      if (
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'SELECT' &&
        document.activeElement?.tagName !== 'TEXTAREA' &&
        document.activeElement?.tagName !== 'BUTTON'
      ) {
        scannerInputRef.current?.focus();
      }
    };
    const interval = setInterval(focusScanner, 1000);
    return () => clearInterval(interval);
  }, [selectedRodeo]);

  // Lista de todos los rodeos: configurados + cualquier rodeo existente en los animales
  const allRodeos = Array.from(
    new Set([
      ...(config.rodeos || []),
      ...animals.map(a => a.rodeo).filter((r): r is string => Boolean(r && r.trim()))
    ])
  ).sort((a, b) => a.localeCompare(b));

  // Conteo por rodeo
  const rodeoCounts: Record<string, number> = {};
  let unassignedCount = 0;

  animals.forEach(a => {
    if (!a.rodeo || a.rodeo.trim() === '') {
      unassignedCount++;
    } else {
      rodeoCounts[a.rodeo] = (rodeoCounts[a.rodeo] || 0) + 1;
    }
  });

  // Animales del rodeo seleccionado
  const currentRodeoAnimals = animals.filter(a => {
    if (selectedRodeo === '__SIN_RODEO__') {
      return !a.rodeo || a.rodeo.trim() === '';
    }
    return a.rodeo === selectedRodeo;
  });

  const filteredAnimals = currentRodeoAnimals.filter(a => 
    a.id.includes(searchFilter.trim()) ||
    a.breed.toLowerCase().includes(searchFilter.toLowerCase()) ||
    a.color.toLowerCase().includes(searchFilter.toLowerCase()) ||
    (a.renspa && a.renspa.toLowerCase().includes(searchFilter.toLowerCase()))
  );

  // ── Crear nuevo rodeo ──────────────────────────────────────────────────────
  const handleCreateRodeo = async () => {
    const name = newRodeoName.trim();
    if (!name) return;
    if (allRodeos.includes(name)) {
      alert('Ya existe un rodeo con ese nombre.');
      return;
    }
    const updated = { ...config, rodeos: [...(config.rodeos || []), name] };
    await db.saveConfig(updated);
    setConfig(updated);
    setNewRodeoName('');
    setShowCreateModal(false);
    setSelectedRodeo(name);
  };

  // ── Renombrar rodeo ────────────────────────────────────────────────────────
  const handleRenameRodeo = async () => {
    const newName = renamedTitle.trim();
    if (!newName || newName === rodeoToRename) {
      setShowRenameModal(false);
      return;
    }
    await db.renameRodeo(rodeoToRename, newName);
    const updatedConfig = await db.getConfig();
    setConfig(updatedConfig);
    await loadData();
    if (selectedRodeo === rodeoToRename) {
      setSelectedRodeo(newName);
    }
    setShowRenameModal(false);
  };

  // ── Eliminar rodeo ─────────────────────────────────────────────────────────
  const handleDeleteRodeo = async (rodeoName: string) => {
    const count = rodeoCounts[rodeoName] || 0;
    const msg = count > 0
      ? `El rodeo "${rodeoName}" tiene ${count} animales asignados. ¿Deseas eliminarlo y dejar estos animales como "Sin Asignar"?`
      : `¿Seguro que deseas eliminar el rodeo "${rodeoName}"?`;

    if (!window.confirm(msg)) return;

    // Si tiene animales, ponerlos sin rodeo
    if (count > 0) {
      const ids = animals.filter(a => a.rodeo === rodeoName).map(a => a.id);
      await db.moveAnimalsToRodeo(ids, '');
    }

    const updatedRodeos = (config.rodeos || []).filter(r => r !== rodeoName);
    const updatedConfig = { ...config, rodeos: updatedRodeos };
    await db.saveConfig(updatedConfig);
    setConfig(updatedConfig);
    if (selectedRodeo === rodeoName) {
      setSelectedRodeo(null);
    }
    await loadData();
  };

  // ── Escáner dentro del rodeo seleccionado ─────────────────────────────────
  const handleScanInRodeo = async (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || !selectedRodeo) return;
    const code = scannerRfid.trim();
    setScannerRfid('');

    if (code.length !== 15 || !/^\d+$/.test(code)) {
      soundSystem.playError();
      setScanFeedback({ msg: 'Caravana inválida (debe tener 15 dígitos)', type: 'error' });
      return;
    }

    const targetRodeoName = selectedRodeo === '__SIN_RODEO__' ? '' : selectedRodeo;
    const animal = await db.getAnimal(code);

    if (!animal) {
      soundSystem.playError();
      setScanFeedback({ msg: `El animal ${code} no está registrado en Fichas.`, type: 'error' });
      return;
    }

    const prevRodeo = animal.rodeo || 'Sin Asignar';
    if (animal.rodeo === targetRodeoName || (!animal.rodeo && targetRodeoName === '')) {
      soundSystem.playSuccess();
      setScanFeedback({ msg: `El animal ${code} ya pertenecía a este rodeo.`, type: 'warn' });
      return;
    }

    // Actualizar rodeo
    animal.rodeo = targetRodeoName;
    await db.saveAnimal(animal);
    soundSystem.playSuccess();
    setScanFeedback({ 
      msg: `✅ Animal ${code} asignado al rodeo "${targetRodeoName || 'Sin Asignar'}" (Rodeo anterior: "${prevRodeo}")`, 
      type: 'success' 
    });
    await loadData();
  };

  // ── Transferencia masiva ──────────────────────────────────────────────────
  const handleBulkTransfer = async () => {
    if (selectedAnimalIds.length === 0) return;
    const target = transferTargetRodeo === '__SIN_RODEO__' ? '' : transferTargetRodeo;
    await db.moveAnimalsToRodeo(selectedAnimalIds, target);
    soundSystem.playSuccess();
    setShowTransferModal(false);
    setSelectedAnimalIds([]);
    await loadData();
  };

  // ── Selección múltiple ────────────────────────────────────────────────────
  const toggleSelectAll = () => {
    if (selectedAnimalIds.length === filteredAnimals.length) {
      setSelectedAnimalIds([]);
    } else {
      setSelectedAnimalIds(filteredAnimals.map(a => a.id));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedAnimalIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // ── Exportar a Excel ──────────────────────────────────────────────────────
  const exportRodeoToExcel = () => {
    const rodeoLabel = selectedRodeo === '__SIN_RODEO__' ? 'Sin_Rodeo' : (selectedRodeo || 'Todos_Los_Rodeos');
    const dataToExport = selectedRodeo ? currentRodeoAnimals : animals;
    
    const rows = [
      ['Caravana', 'Rodeo', 'Sexo', 'Raza', 'Pelaje', 'RENSPA', 'F. Nacimiento'],
      ...dataToExport.map(a => [
        a.id,
        a.rodeo || 'Sin Asignar',
        a.sex === 'H' ? 'Hembra' : 'Macho',
        a.breed,
        a.color,
        a.renspa,
        a.birthDate || ''
      ])
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Rodeo');
    XLSX.writeFile(wb, `Rodeo_${rodeoLabel}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="view-container">
      {/* ── Header ── */}
      <header className="view-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Layers size={28} style={{ color: 'var(--accent)' }} />
            Gestión de Rodeos
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.2rem' }}>
            Organización, separación de lotes y trazabilidad de rodeos en el establecimiento
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.6rem' }}>
          <button 
            className="btn btn-primary"
            onClick={() => setShowCreateModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <Plus size={18} />
            Nuevo Rodeo
          </button>
          <button 
            className="btn"
            onClick={exportRodeoToExcel}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
            title="Exportar inventario por rodeo a Excel"
          >
            <Download size={18} />
            Exportar Excel
          </button>
        </div>
      </header>

      {/* ── Tarjetas de Resumen Global ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="glass-panel" style={{ padding: '1rem', textAlign: 'center', borderLeft: '4px solid var(--accent)' }}>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--accent)' }}>{allRodeos.length}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Rodeos Activos</div>
        </div>

        <div className="glass-panel" style={{ padding: '1rem', textAlign: 'center', borderLeft: '4px solid #10b981' }}>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#10b981' }}>{animals.length - unassignedCount}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Cabezas en Rodeos</div>
        </div>

        <div className="glass-panel" style={{ padding: '1rem', textAlign: 'center', borderLeft: '4px solid #f59e0b' }}>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#f59e0b' }}>{unassignedCount}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Sin Asignar</div>
        </div>

        <div className="glass-panel" style={{ padding: '1rem', textAlign: 'center', borderLeft: '4px solid #6366f1' }}>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#6366f1' }}>{animals.length}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Total Animales</div>
        </div>
      </div>

      {/* ── Si no hay rodeo seleccionado: Mostrar el Panel Principal de Rodeos ── */}
      {!selectedRodeo && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.2rem' }}>
            {/* Tarjeta especial Sin Asignar */}
            <div 
              className="glass-panel" 
              style={{ 
                padding: '1.25rem', 
                borderRadius: '14px', 
                border: '1px solid var(--border)', 
                background: unassignedCount > 0 ? 'rgba(245, 158, 11, 0.05)' : undefined,
                display: 'flex', 
                flexDirection: 'column', 
                justifyContent: 'space-between',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onClick={() => setSelectedRodeo('__SIN_RODEO__')}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#f59e0b' }}>⚠️ Sin Rodeo Asignado</span>
                  <span style={{ 
                    background: 'rgba(245, 158, 11, 0.2)', 
                    color: '#f59e0b', 
                    padding: '0.2rem 0.6rem', 
                    borderRadius: '20px', 
                    fontSize: '0.85rem', 
                    fontWeight: 'bold' 
                  }}>
                    {unassignedCount} cab.
                  </span>
                </div>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0.5rem 0' }}>
                  Animales registrados que aún no tienen un lote o rodeo asignado.
                </p>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                <span style={{ color: 'var(--accent)', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                  Gestionar Lote <ChevronRight size={16} />
                </span>
              </div>
            </div>

            {/* Tarjetas de Rodeos */}
            {allRodeos.map(rodeo => {
              const count = rodeoCounts[rodeo] || 0;
              const rodeoAnimals = animals.filter(a => a.rodeo === rodeo);
              const females = rodeoAnimals.filter(a => a.sex === 'H').length;
              const males = rodeoAnimals.filter(a => a.sex === 'M').length;

              return (
                <div 
                  key={rodeo}
                  className="glass-panel" 
                  style={{ 
                    padding: '1.25rem', 
                    borderRadius: '14px', 
                    border: '1px solid var(--border)', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    justifyContent: 'space-between',
                    transition: 'all 0.2s'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                      <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                        {rodeo}
                      </h3>
                      <span style={{ 
                        background: 'rgba(37, 99, 235, 0.15)', 
                        color: 'var(--accent)', 
                        padding: '0.2rem 0.6rem', 
                        borderRadius: '20px', 
                        fontSize: '0.85rem', 
                        fontWeight: 'bold' 
                      }}>
                        {count} {count === 1 ? 'cabeza' : 'cabezas'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.8rem 0' }}>
                      <span>♀ Hembras: <strong style={{ color: 'var(--text-primary)' }}>{females}</strong></span>
                      <span>♂ Machos: <strong style={{ color: 'var(--text-primary)' }}>{males}</strong></span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: '0.75rem', marginTop: '0.5rem' }}>
                    <div style={{ display: 'flex', gap: '0.3rem' }}>
                      <button 
                        className="btn-icon" 
                        title="Renombrar rodeo"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRodeoToRename(rodeo);
                          setRenamedTitle(rodeo);
                          setShowRenameModal(true);
                        }}
                        style={{ padding: '0.4rem' }}
                      >
                        <Edit3 size={15} />
                      </button>
                      <button 
                        className="btn-icon text-danger" 
                        title="Eliminar rodeo"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteRodeo(rodeo);
                        }}
                        style={{ padding: '0.4rem' }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>

                    <button 
                      className="btn btn-primary"
                      style={{ padding: '0.4rem 0.8rem', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                      onClick={() => setSelectedRodeo(rodeo)}
                    >
                      Ver Animales <ChevronRight size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Si hay un rodeo seleccionado: Detalle y Manga de Escaneo ── */}
      {selectedRodeo && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
          {/* Barra superior de navegación del rodeo */}
          <div className="glass-panel" style={{ padding: '1rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
              <button 
                className="btn" 
                onClick={() => { setSelectedRodeo(null); setSelectedAnimalIds([]); setScanFeedback(null); }}
                style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
              >
                ← Volver a Todos los Rodeos
              </button>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.3rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {selectedRodeo === '__SIN_RODEO__' ? '⚠️ Animales Sin Asignar' : selectedRodeo}
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 'normal' }}>
                    ({currentRodeoAnimals.length} cabezas)
                  </span>
                </h2>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {selectedAnimalIds.length > 0 && (
                <button 
                  className="btn btn-primary"
                  onClick={() => setShowTransferModal(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', backgroundColor: '#8b5cf6' }}
                >
                  <ArrowRightLeft size={16} />
                  Mover {selectedAnimalIds.length} seleccionados
                </button>
              )}
              <button 
                className="btn"
                onClick={exportRodeoToExcel}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
              >
                <Download size={16} />
                Excel de este Rodeo
              </button>
            </div>
          </div>

          {/* ── Escáner de Manga para el Rodeo ── */}
          <div className="glass-panel" style={{ padding: '1.25rem', border: '2px solid var(--accent)', background: 'rgba(37,99,235,0.03)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.6rem' }}>
              <ScanLine size={22} style={{ color: 'var(--accent)' }} />
              <h3 style={{ margin: 0, fontSize: '1.1rem' }}>
                Asignación Rápida por Escaneo RFID
              </h3>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 0.8rem 0' }}>
              Escanee una caravana con el bastón para agregar o mover al animal inmediatamente a <strong>{selectedRodeo === '__SIN_RODEO__' ? 'Sin Asignar' : selectedRodeo}</strong>.
            </p>

            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <input
                ref={scannerInputRef}
                type="text"
                className="input-field"
                placeholder="Escanee la caravana (15 dígitos) y presione Enter..."
                value={scannerRfid}
                onChange={(e) => setScannerRfid(e.target.value)}
                onKeyDown={handleScanInRodeo}
                style={{ flex: 1, fontSize: '1.1rem', fontFamily: 'monospace', fontWeight: 'bold' }}
              />
            </div>

            {scanFeedback && (
              <div style={{
                marginTop: '0.75rem',
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                fontSize: '0.9rem',
                fontWeight: 600,
                background: scanFeedback.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : scanFeedback.type === 'warn' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                color: scanFeedback.type === 'success' ? '#10b981' : scanFeedback.type === 'warn' ? '#f59e0b' : '#ef4444',
                border: `1px solid ${scanFeedback.type === 'success' ? '#10b981' : scanFeedback.type === 'warn' ? '#f59e0b' : '#ef4444'}`
              }}>
                {scanFeedback.msg}
              </div>
            )}
          </div>

          {/* ── Tabla de Animales del Rodeo ── */}
          <div className="glass-panel" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div style={{ position: 'relative', width: '100%', maxWidth: '350px' }}>
                <Search size={18} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                <input
                  type="text"
                  className="input-field"
                  placeholder="Buscar por caravana, raza, color..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  style={{ paddingLeft: '2.2rem', width: '100%' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button 
                  className="btn" 
                  onClick={toggleSelectAll}
                  style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  {selectedAnimalIds.length === filteredAnimals.length && filteredAnimals.length > 0 ? (
                    <><CheckSquare size={16} /> Deseleccionar Todo</>
                  ) : (
                    <><Square size={16} /> Seleccionar Todo</>
                  )}
                </button>
              </div>
            </div>

            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: '40px', textAlign: 'center' }}></th>
                    <th>Caravana</th>
                    <th>Sexo</th>
                    <th>Raza</th>
                    <th>Color</th>
                    <th>RENSPA</th>
                    <th>F. Nacimiento</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAnimals.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                        No hay animales en este rodeo que coincidan con la búsqueda.
                      </td>
                    </tr>
                  ) : (
                    filteredAnimals.map(animal => {
                      const isSelected = selectedAnimalIds.includes(animal.id);
                      return (
                        <tr key={animal.id} style={{ backgroundColor: isSelected ? 'rgba(37, 99, 235, 0.08)' : undefined }}>
                          <td style={{ textAlign: 'center' }}>
                            <input 
                              type="checkbox" 
                              checked={isSelected}
                              onChange={() => toggleSelectOne(animal.id)}
                              style={{ cursor: 'pointer' }}
                            />
                          </td>
                          <td style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>{animal.id}</td>
                          <td>
                            <span className={`badge ${animal.sex === 'H' ? 'badge-hembra' : 'badge-macho'}`}>
                              {animal.sex === 'H' ? 'Hembra' : 'Macho'}
                            </span>
                          </td>
                          <td>{animal.breed}</td>
                          <td>{animal.color}</td>
                          <td>{animal.renspa}</td>
                          <td>{animal.birthDate || '-'}</td>
                          <td>
                            <button
                              className="btn btn-sm"
                              style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', padding: '0.2rem 0.5rem', fontSize: '0.78rem' }}
                              onClick={() => {
                                setSelectedAnimalIds([animal.id]);
                                setShowTransferModal(true);
                              }}
                            >
                              Mover a...
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Crear Rodeo ── */}
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="glass-panel modal-content" style={{ maxWidth: '420px', width: '90%' }}>
            <h3 style={{ margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Plus size={20} style={{ color: 'var(--accent)' }} />
              Crear Nuevo Rodeo
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              Ingresa el nombre del lote o rodeo (ej. "1° IA de 2026", "Toros Padrillos", "Lote Campo Norte"):
            </p>
            <input
              type="text"
              className="input-field"
              placeholder="Nombre del Rodeo"
              value={newRodeoName}
              onChange={(e) => setNewRodeoName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateRodeo()}
              autoFocus
              style={{ marginBottom: '1.5rem', width: '100%' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
              <button className="btn" onClick={() => setShowCreateModal(false)}>
                Cancelar
              </button>
              <button className="btn btn-primary" onClick={handleCreateRodeo}>
                Guardar Rodeo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Renombrar Rodeo ── */}
      {showRenameModal && (
        <div className="modal-overlay">
          <div className="glass-panel modal-content" style={{ maxWidth: '420px', width: '90%' }}>
            <h3 style={{ margin: '0 0 1rem 0' }}>Renombrar Rodeo</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              Modificar el nombre de <strong>"{rodeoToRename}"</strong> (se actualizarán automáticamente todos los animales asignados a este rodeo):
            </p>
            <input
              type="text"
              className="input-field"
              value={renamedTitle}
              onChange={(e) => setRenamedTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleRenameRodeo()}
              autoFocus
              style={{ marginBottom: '1.5rem', width: '100%' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
              <button className="btn" onClick={() => setShowRenameModal(false)}>
                Cancelar
              </button>
              <button className="btn btn-primary" onClick={handleRenameRodeo}>
                Actualizar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Transferencia Masiva a Otro Rodeo ── */}
      {showTransferModal && (
        <div className="modal-overlay">
          <div className="glass-panel modal-content" style={{ maxWidth: '440px', width: '90%' }}>
            <h3 style={{ margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ArrowRightLeft size={20} style={{ color: 'var(--accent)' }} />
              Mover {selectedAnimalIds.length} animal(es)
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              Selecciona el rodeo de destino para los animales seleccionados:
            </p>

            <select
              className="input-field"
              value={transferTargetRodeo}
              onChange={(e) => setTransferTargetRodeo(e.target.value)}
              style={{ marginBottom: '1.5rem', width: '100%' }}
            >
              <option value="">-- Seleccionar Rodeo Destino --</option>
              <option value="__SIN_RODEO__">⚠️ Dejar Sin Rodeo Asignado</option>
              {allRodeos.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
              <button className="btn" onClick={() => setShowTransferModal(false)}>
                Cancelar
              </button>
              <button 
                className="btn btn-primary" 
                onClick={handleBulkTransfer}
                disabled={transferTargetRodeo === ''}
              >
                Confirmar Transferencia
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
