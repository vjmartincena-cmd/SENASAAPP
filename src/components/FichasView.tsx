import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { db, Animal, AppConfig, Novedad, NovedadSanidad, NovedadIA, NovedadTacto } from '../db';
import { soundSystem } from '../sounds';
import { ScanLine, Search, X, ClipboardList, Download } from 'lucide-react';
import * as XLSX from 'xlsx';

interface FichasViewProps {
  config: AppConfig;
}

export function FichasView({ config }: FichasViewProps) {
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRenspa, setFilterRenspa] = useState('__ALL__');
  
  // Ficha Form State
  const [id, setId] = useState('');
  const [sex, setSex] = useState('H');
  const [breed, setBreed] = useState('AA');
  const [color, setColor] = useState(config.colors[0] || '');
  const [renspa, setRenspa] = useState(config.renspas[0] || '');
  const [birthDate, setBirthDate] = useState('');
  
  // Modal de historial
  const [selectedAnimal, setSelectedAnimal] = useState<Animal | null>(null);
  const [animalHistory, setAnimalHistory] = useState<Novedad[]>([]);
  
  // Edit State
  const [isEditing, setIsEditing] = useState(false);
  const [originalId, setOriginalId] = useState('');
  
  const scannerRef = useRef<HTMLInputElement>(null);

  const loadAnimals = async () => {
    const list = await db.getAllAnimals();
    setAnimals(list.sort((a, b) => b.createdAt - a.createdAt));
  };

  useEffect(() => {
    loadAnimals();
    const focusScanner = () => {
      if (document.activeElement?.tagName !== 'INPUT' && 
          document.activeElement?.tagName !== 'SELECT' && 
          document.activeElement?.tagName !== 'BUTTON') {
        scannerRef.current?.focus();
      }
    };
    const interval = setInterval(focusScanner, 1000);
    return () => clearInterval(interval);
  }, []);

  // Refocus scanner ONLY when dropdowns (not text inputs) change
  useEffect(() => {
    scannerRef.current?.focus();
  }, [sex, breed, color, renspa]);

  const handleScan = async (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (isEditing) {
        handleSaveEdit();
        return;
      }

      const code = id.trim();
      if (code.length !== 15 || !/^\d+$/.test(code)) {
        soundSystem.playError();
        return;
      }
      
      const existing = await db.getAnimal(code);
      if (existing) {
        soundSystem.playSuccess();
        setSex(existing.sex);
        setBreed(existing.breed);
        setColor(existing.color);
        setRenspa(existing.renspa || config.renspas[0]);
        setBirthDate(existing.birthDate);
      } else {
        const animal: Animal = {
          id: code,
          sex,
          breed,
          color,
          renspa,
          birthDate,
          createdAt: Date.now(),
          reportedToSenasa: false
        };
        await db.saveAnimal(animal);
        soundSystem.playNewAnimal();
        loadAnimals();
      }
      setId('');
    }
  };

  const handleEdit = (animal: Animal) => {
    setId(animal.id);
    setSex(animal.sex);
    setBreed(animal.breed);
    setColor(animal.color);
    setRenspa(animal.renspa || config.renspas[0]);
    setBirthDate(animal.birthDate || '');
    setIsEditing(true);
    setOriginalId(animal.id);
    scannerRef.current?.focus();
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setOriginalId('');
    setId('');
    setBirthDate('');
  };

  const handleSaveEdit = async () => {
    const code = id.trim();
    if (code.length !== 15 || !/^\d+$/.test(code)) {
      soundSystem.playError();
      alert('La caravana debe tener 15 dígitos numéricos.');
      return;
    }
    
    try {
      if (code !== originalId) {
        await db.replaceAnimalId(originalId, code);
      }
      
      const existing = await db.getAnimal(code);
      const animal: Animal = {
        id: code,
        sex,
        breed,
        color,
        renspa,
        birthDate,
        createdAt: existing ? existing.createdAt : Date.now(),
        reportedToSenasa: existing ? existing.reportedToSenasa : false
      };
      
      await db.saveAnimal(animal);
      soundSystem.playSuccess();
      loadAnimals();
      cancelEdit();
    } catch (e: any) {
      soundSystem.playError();
      alert(e.message || 'Error al guardar los cambios.');
    }
  };

  const openHistory = async (animal: Animal) => {
    setSelectedAnimal(animal);
    const novedades = await db.getNovedadesByAnimal(animal.id);
    novedades.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setAnimalHistory(novedades);
  };

  const closeHistory = () => {
    setSelectedAnimal(null);
    setAnimalHistory([]);
  };

  const renderNovedadRow = (n: Novedad) => {
    if (n.type === 'Sanidad') {
      const s = n as NovedadSanidad;
      return <span>🧪 <strong>Sanidad</strong> — Tubo #{s.tubeNumber}</span>;
    }
    if (n.type === 'IA') {
      const ia = n as NovedadIA;
      return <span>🐂 <strong>IA</strong> — Toro: {ia.bull}</span>;
    }
    if (n.type === 'Tacto') {
      const t = n as NovedadTacto;
      return <span>🤚 <strong>Tacto</strong> — {t.result}{t.observation ? ` (${t.observation})` : ''}</span>;
    }
    return <span>{(n as { type: string }).type}</span>;
  };

  const filteredAnimals = animals.filter(a =>
    a.id.includes(searchTerm) &&
    (filterRenspa === '__ALL__' || a.renspa === filterRenspa)
  );

  const exportToExcel = () => {
    if (filteredAnimals.length === 0) return alert('No hay animales para exportar.');
    const rows: (string | number)[][] = [
      ['Caravana', 'Sexo', 'Raza', 'Color', 'RENSPA', 'Nacimiento'],
      ...filteredAnimals.map(a => [a.id, a.sex, a.breed, a.color, a.renspa || '', a.birthDate || '']),
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Padrón');
    XLSX.writeFile(wb, `Padron_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="view-container">
      <header className="view-header">
        <h1>FICHAS</h1>
      </header>

      <div className="grid-layout">
        <div className="left-panel flex-col gap-6">
          <section className="glass-panel p-6">
            <h2 className="text-lg font-semibold mb-4">{isEditing ? 'Editar Ficha' : 'Nueva Ficha / Escanear'}</h2>
            <div className="form-grid">
              
              <div className="grid grid-cols-2 gap-4">
                <div className="form-group">
                  <label>Sexo</label>
                  <select className="input-field" value={sex} onChange={(e) => setSex(e.target.value)}>
                    <option value="H">Hembra (H)</option>
                    <option value="M">Macho (M)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Raza</label>
                  <select className="input-field" value={breed} onChange={(e) => setBreed(e.target.value)}>
                    <option value="GC">Ganado Cruza (GC)</option>
                    <option value="H">Hereford (H)</option>
                    <option value="AA">Aberdeen Angus (AA)</option>
                    <option value="BG">Brangus (BG)</option>
                    <option value="BF">Braford (BF)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="form-group">
                  <label>Color (Pelaje)</label>
                  <select className="input-field" value={color} onChange={(e) => setColor(e.target.value)}>
                    <option value="">Seleccione...</option>
                    {config.colors.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>RENSPA</label>
                  <select className="input-field" value={renspa} onChange={(e) => setRenspa(e.target.value)}>
                    {config.renspas.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              </div>

              <div className="form-group mb-4">
                <label>Nacimiento (MM/YYYY)</label>
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder="MM/YYYY"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  onFocus={(e) => e.stopPropagation()}
                />
              </div>

              <div className="form-group relative">
                <label>Caravana (RFID)</label>
                <div className="flex items-center gap-2">
                  <ScanLine size={20} className="text-accent" />
                  <input
                    ref={scannerRef}
                    type="text"
                    className="input-field flex-1 font-mono text-lg bg-blue-900/20 border-accent/50 focus:bg-blue-900/40"
                    placeholder="Escanee o escriba"
                    value={id}
                    onChange={(e) => setId(e.target.value)}
                    onKeyDown={handleScan}
                  />
                </div>
                {!isEditing && (
                  <p className="text-xs text-muted mt-2 text-center">Presione Enter para cargar/guardar automáticamente.</p>
                )}
              </div>

              {isEditing && (
                <div className="flex gap-4 mt-2">
                  <button 
                    className="flex-1 py-2 rounded-md bg-accent text-white font-bold hover:bg-accent/80 transition-colors" 
                    onClick={handleSaveEdit}
                  >
                    Guardar Cambios
                  </button>
                  <button 
                    className="flex-1 py-2 rounded-md bg-darker text-white font-bold hover:bg-darker/80 transition-colors border border-accent/20" 
                    onClick={cancelEdit}
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="right-panel glass-panel flex-col">
          <div className="panel-header p-4 border-b" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 className="text-lg font-semibold">
              Padrón de Animales
              <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 400, marginLeft: '0.5rem' }}>
                ({filteredAnimals.length}{filteredAnimals.length !== animals.length ? ` de ${animals.length}` : ''})
              </span>
            </h2>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              {/* Filtro RENSPA */}
              <select
                className="input-field"
                value={filterRenspa}
                onChange={e => setFilterRenspa(e.target.value)}
                style={{ fontSize: '0.82rem', padding: '0.3rem 0.6rem', minWidth: '140px' }}
              >
                <option value="__ALL__">Todas las RENSPA</option>
                {config.renspas.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              {/* Buscador caravana */}
              <div className="search-bar flex items-center bg-darker px-3 py-2 rounded-md">
                <Search size={16} className="text-muted mr-2" />
                <input
                  type="text"
                  placeholder="Buscar caravana..."
                  className="bg-transparent border-none text-sm outline-none w-36 text-white"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              {/* Botón exportar */}
              <button
                onClick={exportToExcel}
                title="Exportar padrón filtrado a Excel"
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.35rem',
                  background: 'rgba(52,211,153,0.1)',
                  border: '1px solid rgba(52,211,153,0.35)',
                  borderRadius: '8px',
                  padding: '0.35rem 0.75rem',
                  color: '#34d399',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  transition: 'background 0.2s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(52,211,153,0.2)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(52,211,153,0.1)')}
              >
                <Download size={15} /> Excel
              </button>
            </div>
          </div>
          
          <div className="table-container">
            <table className="animals-table">
              <thead>
                <tr>
                  <th>Caravana</th>
                  <th>Sexo</th>
                  <th>Raza</th>
                  <th>Color</th>
                  <th>RENSPA</th>
                  <th>Nacimiento</th>
                  <th>Historial</th>
                </tr>
              </thead>
              <tbody>
                {filteredAnimals.map(a => (
                  <tr key={a.id}>
                    <td>
                      <button
                        className="font-mono text-accent underline decoration-dotted bg-transparent border-none cursor-pointer hover:text-white transition-colors"
                        onClick={() => handleEdit(a)}
                        title="Editar ficha"
                      >
                        {a.id}
                      </button>
                    </td>
                    <td>{a.sex}</td>
                    <td>{a.breed}</td>
                    <td>{a.color}</td>
                    <td>{a.renspa}</td>
                    <td>{a.birthDate}</td>
                    <td>
                      <button
                        className="btn-icon text-accent"
                        onClick={() => openHistory(a)}
                        title="Ver historial"
                      >
                        <ClipboardList size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal de Historial */}
      {selectedAnimal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50" onClick={closeHistory}>
          <div
            className="glass-panel p-6 w-full max-w-2xl max-h-[80vh] flex flex-col border-2 border-accent"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-xl font-bold text-accent">Historial del Animal</h2>
                <p className="font-mono text-white text-lg">{selectedAnimal.id}</p>
                <p className="text-sm text-muted">
                  {selectedAnimal.sex} · {selectedAnimal.breed} · {selectedAnimal.color} · {selectedAnimal.renspa} · Nac: {selectedAnimal.birthDate || 'S/D'}
                </p>
              </div>
              <button className="btn-icon text-muted hover:text-white" onClick={closeHistory}>
                <X size={24} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1">
              {animalHistory.length === 0 ? (
                <p className="text-center text-muted py-10">Este animal no tiene novedades registradas.</p>
              ) : (
                <table className="animals-table w-full">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Tipo</th>
                      <th>Detalle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {animalHistory.map(n => (
                      <tr key={n.id}>
                        <td className="text-muted">{n.date}</td>
                        <td>
                          <span className={`px-2 py-1 rounded text-xs font-bold border ${
                            n.type === 'Sanidad' ? 'bg-white text-blue-800 border-blue-800' :
                            n.type === 'IA' ? 'bg-white text-orange-900 border-orange-900' :
                            'bg-white text-red-800 border-red-800'
                          }`}>
                            {n.type}
                          </span>
                        </td>
                        <td>{renderNovedadRow(n)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
