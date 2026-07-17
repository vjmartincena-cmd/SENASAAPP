import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import * as XLSX from 'xlsx';
import { Download, FileText, Trash2, ScanLine, Settings } from 'lucide-react';
import { soundSystem } from '../sounds';
import { db } from '../db';

type Sex = 'M' | 'H';
type Breed = 'GC' | 'H' | 'AA' | 'BG' | 'BF';

interface AnimalExport {
  id: string; // 15 digits
  sex: Sex;
  breed: Breed;
  birthDate: string; // MM/YYYY
  timestamp: number;
}

export function SenasaExportView() {
  const [animals, setAnimals] = useState<AnimalExport[]>(() => {
    const saved = localStorage.getItem('senasa_venta_animals');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Error al cargar animales", e);
      }
    }
    return [];
  });

  useEffect(() => {
    localStorage.setItem('senasa_venta_animals', JSON.stringify(animals));
  }, [animals]);
  
  const [currentSex, setCurrentSex] = useState<Sex>('M');
  const [currentBreed, setCurrentBreed] = useState<Breed>('AA');
  
  const today = new Date();
  const defaultDate = `${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
  const [currentDate, setCurrentDate] = useState<string>(defaultDate);
  
  const [scanInput, setScanInput] = useState('');
  const [error, setError] = useState('');
  const scannerInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scannerInputRef.current?.focus();
    // Mismo patrón que el resto de la app: setInterval para mantener el foco en el scanner
    const focusScanner = () => {
      if (
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'SELECT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        scannerInputRef.current?.focus();
      }
    };
    const interval = setInterval(focusScanner, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleScan = async (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const code = scanInput.trim();
      
      if (code.length !== 15 || !/^\d+$/.test(code)) {
        soundSystem.playError();
        setError('Error: La caravana debe tener 15 dígitos numéricos.');
        setScanInput('');
        return;
      }
      
      if (animals.some(a => a.id === code)) {
        soundSystem.playError();
        setError('Error: Esta caravana ya fue escaneada en este lote.');
        setScanInput('');
        return;
      }

      // Check if animal exists in Cria DB to pre-fill
      const existing = await db.getAnimal(code);
      let sex = currentSex;
      let breed = currentBreed;
      let birthDate = currentDate;

      if (existing) {
        sex = existing.sex as Sex;
        breed = existing.breed as Breed;
        birthDate = existing.birthDate;
      }

      const newAnimal: AnimalExport = {
        id: code,
        sex,
        breed,
        birthDate,
        timestamp: Date.now()
      };

      soundSystem.playSuccess();
      setAnimals(prev => [newAnimal, ...prev]);
      setScanInput('');
      setError('');
    }
  };

  const removeAnimal = (id: string) => {
    setAnimals(prev => prev.filter(a => a.id !== id));
  };

  const clearList = () => {
    if (confirm('¿Estás seguro de que quieres borrar toda la lista actual?')) {
      setAnimals([]);
    }
  };

  const generateTXT = async () => {
    if (animals.length === 0) return;
    const dateStr = new Date().toISOString().split('T')[0];
    
    // Archivo 1
    const txtContent = animals.map(a => `${a.id}-${a.sex}-${a.breed}-${a.birthDate};`).join('\n');
    const blob1 = new Blob([txtContent], { type: 'text/plain' });
    const url1 = URL.createObjectURL(blob1);
    const link1 = document.createElement('a');
    link1.href = url1;
    link1.download = `SENASA_Venta_${dateStr}.txt`;
    document.body.appendChild(link1);
    link1.click();
    document.body.removeChild(link1);
    URL.revokeObjectURL(url1);

    // Archivo TRI: cada ID en su propia línea, terminada con punto y coma
    const triContent = animals.map(a => `${a.id};`).join('\n');
    const blob2 = new Blob([triContent], { type: 'text/plain' });
    const url2 = URL.createObjectURL(blob2);
    const link2 = document.createElement('a');
    link2.href = url2;
    link2.download = `senasa_tri_${dateStr}.txt`;
    document.body.appendChild(link2);
    link2.click();
    document.body.removeChild(link2);
    URL.revokeObjectURL(url2);

    if (confirm("Exportación exitosa. ¿Deseas dar de baja (eliminar) a estos animales del padrón de Cría automáticamente?")) {
      for (const a of animals) {
        await db.deleteAnimal(a.id);
      }
      alert("Animales eliminados del padrón de cría.");
    }
  };

  const generateExcel = () => {
    if (animals.length === 0) return;
    const data = animals.map(a => ({
      'Caravana': a.id,
      'Sexo': a.sex === 'M' ? 'Macho' : 'Hembra',
      'Raza': a.breed,
      'Fecha Nacimiento': a.birthDate
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ventas");
    XLSX.writeFile(wb, `Registro_Ventas_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="view-container">
      <header className="view-header">
        <h1>Exportación Rápida (Venta)</h1>
        <span className="stat-badge">Total Escaneados: <strong>{animals.length}</strong></span>
      </header>

      <div className="grid-layout">
        <div className="left-panel flex-col gap-6">
          <section className="glass-panel p-6">
            <h2 className="text-lg font-semibold mb-4 flex gap-2"><Settings size={20}/> Datos a asignar</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="form-group">
                <label>Sexo</label>
                <select className="input-field" value={currentSex} onChange={(e) => setCurrentSex(e.target.value as Sex)}>
                  <option value="M">Macho (M)</option>
                  <option value="H">Hembra (H)</option>
                </select>
              </div>
              <div className="form-group">
                <label>Raza</label>
                <select className="input-field" value={currentBreed} onChange={(e) => setCurrentBreed(e.target.value as Breed)}>
                  <option value="GC">Ganado Cruza (GC)</option>
                  <option value="H">Hereford (H)</option>
                  <option value="AA">Aberdeen Angus (AA)</option>
                  <option value="BG">Brangus (BG)</option>
                  <option value="BF">Braford (BF)</option>
                </select>
              </div>
            </div>
            <div className="form-group mt-4">
              <label>Fecha Nacimiento</label>
              <input type="text" className="input-field" placeholder="MM/YYYY" value={currentDate} onChange={(e) => setCurrentDate(e.target.value)} />
            </div>
          </section>

          <section className="glass-panel p-6 text-center">
            <ScanLine size={48} className="text-accent mb-4 mx-auto" />
            <h2 className="text-xl mb-2">Escanear Caravana</h2>
            <input
              ref={scannerInputRef}
              type="text"
              className="scanner-input"
              placeholder="Esperando lectura..."
              value={scanInput}
              onChange={(e) => setScanInput(e.target.value)}
              onKeyDown={handleScan}
            />
            {error && <div className="error-message mt-2">{error}</div>}
          </section>

          <section className="glass-panel p-6">
            <h2 className="text-lg font-semibold mb-4">Exportar Lote</h2>
            <div className="flex-col gap-4">
              <button className="btn btn-primary w-full" onClick={generateTXT} disabled={animals.length === 0}>
                <FileText size={18} /> Generar Archivos TXT
              </button>
              <button className="btn btn-success w-full" onClick={generateExcel} disabled={animals.length === 0}>
                <Download size={18} /> Generar Planilla Excel
              </button>
            </div>
          </section>
        </div>

        <div className="right-panel glass-panel flex-col">
          <div className="panel-header p-4 border-b flex justify-between">
            <h2 className="text-lg font-semibold">Animales Escaneados</h2>
            {animals.length > 0 && (
              <button className="btn btn-danger py-1" onClick={clearList}>Limpiar Lote</button>
            )}
          </div>
          
          <div className="table-container">
            <table className="animals-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Caravana</th>
                  <th>Sexo</th>
                  <th>Raza</th>
                  <th>Fecha</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {animals.map((animal, index) => (
                  <tr key={animal.id}>
                    <td>{animals.length - index}</td>
                    <td className="font-mono text-accent">{animal.id}</td>
                    <td>{animal.sex}</td>
                    <td>{animal.breed}</td>
                    <td>{animal.birthDate}</td>
                    <td>
                      <button className="btn-icon text-danger" onClick={() => removeAnimal(animal.id)}>
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
