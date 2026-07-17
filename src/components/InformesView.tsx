import { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { db, NovedadSanidad, NovedadIA, NovedadTacto, Sesion } from '../db';
import { FileText, Download, ChevronDown, Calendar, Layers, BarChart3 } from 'lucide-react';

// ── Helpers ────────────────────────────────────────────────────────────────────
function formatDate(d: string) {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function StatCard({ label, value, color, sub }: { label: string; value: string | number; color: string; sub?: string }) {
  return (
    <div style={{
      background: `${color}10`,
      border: `1px solid ${color}35`,
      borderRadius: '12px',
      padding: '0.9rem 1rem',
      textAlign: 'center',
      minWidth: '90px',
      flex: 1,
    }}>
      <div style={{ fontSize: '1.8rem', fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.25rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      {sub && <div style={{ fontSize: '0.75rem', color, fontWeight: 700, marginTop: '0.1rem' }}>{sub}</div>}
    </div>
  );
}

// ── Componente principal ───────────────────────────────────────────────────────
export function InformesView() {
  const [sesiones, setSesiones] = useState<Sesion[]>([]);
  const [activeTab, setActiveTab] = useState<'Sanidad' | 'IA' | 'Tacto' | 'SENASA'>('Sanidad');

  // Sesiones filtradas por tab
  const [selectedSesionId, setSelectedSesionId] = useState('');
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [animals, setAnimals] = useState<any[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => {
    db.getAllSesiones().then(all => {
      all.sort((a, b) => b.startedAt - a.startedAt);
      setSesiones(all);
    });
    db.getAllAnimals().then(setAnimals);
  }, []);

  // Filtrar sesiones según tab activo
  const tabSesiones = sesiones.filter(s => s.type === (activeTab as any));

  // Cargar preview cuando cambia la sesión seleccionada
  useEffect(() => {
    if (!selectedSesionId) { setPreviewData([]); return; }
    setLoadingPreview(true);
    db.getNovedadesBySession(selectedSesionId).then(novs => {
      novs.sort((a, b) => a.timestamp - b.timestamp);
      setPreviewData(novs);
      setLoadingPreview(false);
    });
  }, [selectedSesionId]);

  // Reset selección al cambiar tab
  useEffect(() => {
    setSelectedSesionId('');
    setPreviewData([]);
  }, [activeTab]);

  const selectedSesion = sesiones.find(s => s.id === selectedSesionId);

  // ── Helpers de exportación ────────────────────────────────────────────────
  const downloadXLS = (worksheets: { name: string; data: (string | number)[][] }[], filename: string) => {
    const wb = XLSX.utils.book_new();
    worksheets.forEach(({ name, data }) => {
      const ws = XLSX.utils.aoa_to_sheet(data);
      XLSX.utils.book_append_sheet(wb, ws, name);
    });
    XLSX.writeFile(wb, filename);
  };

  const getAnimal = (id: string) => animals.find(a => a.id === id);

  // ── Export Sanidad ────────────────────────────────────────────────────────
  const exportSanidad = () => {
    if (!selectedSesionId || previewData.length === 0) return alert('Seleccioná una sesión con datos.');
    const san = previewData as NovedadSanidad[];
    const rows: (string | number)[][] = [
      [`SANIDAD — ${selectedSesion?.label || formatDate(selectedSesion?.date || '')}`],
      [],
      ['Nº Tubo', 'Caravana', 'Raza', 'Color', 'RENSPA', 'Fecha'],
      ...san.map((s, i) => {
        const a = getAnimal(s.animalId);
        return [i + 1, s.animalId, a?.breed || '', a?.color || '', a?.renspa || '', s.date];
      }),
    ];
    downloadXLS([{ name: 'Sanidad', data: rows }], `Sanidad_${selectedSesion?.date || 'sesion'}.xlsx`);
  };

  // ── Export IA ─────────────────────────────────────────────────────────────
  const exportIA = () => {
    if (!selectedSesionId || previewData.length === 0) return alert('Seleccioná una sesión con datos.');
    const ias = previewData as NovedadIA[];
    const rows: (string | number)[][] = [
      [`INSEMINACIÓN IA — ${selectedSesion?.label || formatDate(selectedSesion?.date || '')}`],
      [],
      ['Caravana', 'RENSPA', 'Toro', 'Fecha'],
      ...ias.map(i => {
        const a = getAnimal(i.animalId);
        return [i.animalId, a?.renspa || '', i.bull, i.date];
      }),
    ];
    downloadXLS([{ name: 'Inseminaciones', data: rows }], `IA_${selectedSesion?.date || 'sesion'}.xlsx`);
  };

  // ── Export Tacto ──────────────────────────────────────────────────────────
  const exportTacto = () => {
    if (!selectedSesionId || previewData.length === 0) return alert('Seleccioná una sesión con datos.');
    const tactos = previewData as NovedadTacto[];
    const preniadasIA = tactos.filter(t => t.result === 'Preñada IA');
    const preniadasRepaso = tactos.filter(t => t.result === 'Preñada Repaso' || (t.result as string) === 'Preñada');
    const vacias = tactos.filter(t => t.result === 'Vacía');
    const rechazos = tactos.filter(t => t.result === 'Rechazo');
    const total = tactos.length;
    const pct = (n: number) => total > 0 ? `${((n / total) * 100).toFixed(1)}%` : '0%';

    const resumen: (string | number)[][] = [
      [`TACTO — ${selectedSesion?.label || formatDate(selectedSesion?.date || '')}`],
      [],
      ['Resultado', 'Cantidad', 'Porcentaje'],
      ['Preñadas TOTAL', preniadasIA.length + preniadasRepaso.length, pct(preniadasIA.length + preniadasRepaso.length)],
      ['  — Por IA', preniadasIA.length, pct(preniadasIA.length)],
      ['  — Por Repaso', preniadasRepaso.length, pct(preniadasRepaso.length)],
      ['Vacías', vacias.length, pct(vacias.length)],
      ['Rechazos', rechazos.length, pct(rechazos.length)],
      ['TOTAL', total, '100%'],
    ];

    const buildRows = (list: NovedadTacto[]) => {
      const header: (string | number)[] = ['Caravana', 'RENSPA', 'Resultado', 'Observación', 'Fecha'];
      return [header, ...list.map(t => {
        const a = getAnimal(t.animalId);
        return [t.animalId, a?.renspa || '', t.result, t.observation || '', t.date];
      })];
    };

    downloadXLS([
      { name: 'Resumen', data: resumen },
      { name: 'Preñadas IA', data: buildRows(preniadasIA) },
      { name: 'Preñadas Repaso', data: buildRows(preniadasRepaso) },
      { name: 'Vacías', data: buildRows(vacias) },
      { name: 'Rechazos', data: buildRows(rechazos) },
    ], `Tacto_${selectedSesion?.date || 'sesion'}.xlsx`);
  };

  // ── Export SENASA ─────────────────────────────────────────────────────────
  const exportSenasa = async () => {
    const allAnimals = await db.getAllAnimals();
    const newAnimals = allAnimals.filter(a => !a.reportedToSenasa);
    if (newAnimals.length === 0) { alert('No hay animales nuevos para reportar a SENASA.'); return; }
    const txtContent = newAnimals.map(a => `${a.id}-${a.sex}-${a.breed}-${a.birthDate};`).join('\n');
    const blob = new Blob([txtContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `SENASA_Cria_${new Date().toISOString().split('T')[0]}.txt`;
    link.click();
    if (confirm('¿Marcar estos animales como ya reportados a SENASA?')) {
      for (const a of newAnimals) await db.saveAnimal({ ...a, reportedToSenasa: true });
      alert('Animales marcados como reportados.');
    }
  };

  // ── Estadísticas Tacto ─────────────────────────────────────────────────────
  const tactoStats = (() => {
    if (activeTab !== 'Tacto' || previewData.length === 0) return null;
    const tactos = previewData as NovedadTacto[];
    const total = tactos.length;
    const pIA = tactos.filter(t => t.result === 'Preñada IA').length;
    const pRepaso = tactos.filter(t => t.result === 'Preñada Repaso' || (t.result as string) === 'Preñada').length;
    const vacias = tactos.filter(t => t.result === 'Vacía').length;
    const rechazos = tactos.filter(t => t.result === 'Rechazo').length;
    const pct = (n: number) => total > 0 ? `${((n / total) * 100).toFixed(1)}%` : '0%';
    return { total, pIA, pRepaso, vacias, rechazos, pct };
  })();

  // ── Selector de sesión ────────────────────────────────────────────────────
  const SesionSelector = () => (
    <div style={{ marginBottom: '1.25rem' }}>
      <label style={{ fontSize: '0.82rem', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>
        Seleccionar Sesión
      </label>
      <div style={{ position: 'relative' }}>
        <select
          className="input-field"
          value={selectedSesionId}
          onChange={e => setSelectedSesionId(e.target.value)}
          style={{ paddingRight: '2.5rem', appearance: 'none', fontWeight: selectedSesionId ? 600 : 400 }}
        >
          <option value="">— Elegí una sesión —</option>
          {tabSesiones.map(s => (
            <option key={s.id} value={s.id}>
              {s.label ? `${s.label} — ` : ''}{formatDate(s.date)} · {formatTime(s.startedAt)} · {s.count} animales
            </option>
          ))}
        </select>
        <ChevronDown size={16} style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#64748b', pointerEvents: 'none' }} />
      </div>
      {tabSesiones.length === 0 && (
        <p style={{ fontSize: '0.8rem', color: '#475569', marginTop: '0.5rem' }}>No hay sesiones de {activeTab} registradas.</p>
      )}
    </div>
  );

  // ── Tabs ───────────────────────────────────────────────────────────────────
  const tabs: { key: typeof activeTab; label: string }[] = [
    { key: 'Sanidad', label: '🧪 Sanidad' },
    { key: 'IA', label: '🐂 Inseminación (IA)' },
    { key: 'Tacto', label: '🤚 Tacto' },
    { key: 'SENASA', label: '📄 SENASA' },
  ];

  return (
    <div className="view-container">
      <header className="view-header">
        <h1>Informes por Sesión</h1>
      </header>

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: '1.5rem' }}>
        {tabs.map(t => (
          <button
            key={t.key}
            className={`tab-btn ${activeTab === t.key ? 'active' : ''}`}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── SENASA tab ────────────────────────────────────────────────────── */}
      {activeTab === 'SENASA' && (
        <div className="glass-panel p-6" style={{ maxWidth: '500px' }}>
          <h2 className="text-lg font-semibold mb-3" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FileText size={20} /> Informe de Alta SENASA
          </h2>
          <p className="text-sm text-muted mb-5">
            Genera un archivo .txt con todas las vacas nuevas registradas que aún no han sido exportadas.
          </p>
          <button className="btn btn-success w-full" onClick={exportSenasa}>
            <FileText size={18} className="mr-2" /> Exportar Nuevas a SENASA (.txt)
          </button>
        </div>
      )}

      {/* ── SANIDAD tab ───────────────────────────────────────────────────── */}
      {activeTab === 'Sanidad' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="glass-panel p-6">
            <h2 className="text-lg font-semibold mb-4" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Layers size={18} /> Informe de Sanidad
            </h2>
            <SesionSelector />
            {selectedSesionId && (
              <button
                className="btn btn-primary"
                onClick={exportSanidad}
                disabled={previewData.length === 0}
              >
                <Download size={18} /> Exportar Sanidad (.xlsx)
              </button>
            )}
          </div>

          {/* Preview Sanidad */}
          {selectedSesionId && (
            <div className="glass-panel p-4">
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Calendar size={14} /> Vista previa — {selectedSesion?.label || formatDate(selectedSesion?.date || '')}
                <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: '#64748b' }}>{previewData.length} animales</span>
              </h3>
              {loadingPreview ? (
                <p style={{ color: '#475569', fontSize: '0.85rem' }}>Cargando...</p>
              ) : previewData.length === 0 ? (
                <p style={{ color: '#475569', fontSize: '0.85rem' }}>Sin registros en esta sesión.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="animals-table w-full">
                    <thead>
                      <tr>
                        <th>Nº</th>
                        <th>Caravana</th>
                        <th>Raza</th>
                        <th>Color</th>
                        <th>RENSPA</th>
                        <th>Hora</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(previewData as NovedadSanidad[]).map((s, i) => {
                        const a = getAnimal(s.animalId);
                        return (
                          <tr key={s.id}>
                            <td style={{ color: '#34d399', fontWeight: 700 }}>#{i + 1}</td>
                            <td className="font-mono">{s.animalId}</td>
                            <td>{a?.breed || '—'}</td>
                            <td>{a?.color || '—'}</td>
                            <td>{a?.renspa || '—'}</td>
                            <td style={{ color: '#64748b', fontSize: '0.78rem' }}>{formatTime(s.timestamp)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── IA tab ────────────────────────────────────────────────────────── */}
      {activeTab === 'IA' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="glass-panel p-6">
            <h2 className="text-lg font-semibold mb-4" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Layers size={18} /> Informe de Inseminación (IA)
            </h2>
            <SesionSelector />
            {selectedSesionId && (
              <button
                className="btn btn-primary"
                onClick={exportIA}
                disabled={previewData.length === 0}
              >
                <Download size={18} /> Exportar IA (.xlsx)
              </button>
            )}
          </div>

          {/* Preview IA */}
          {selectedSesionId && (
            <div className="glass-panel p-4">
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Calendar size={14} /> Vista previa — {selectedSesion?.label || formatDate(selectedSesion?.date || '')}
                <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: '#64748b' }}>{previewData.length} animales</span>
              </h3>
              {loadingPreview ? (
                <p style={{ color: '#475569', fontSize: '0.85rem' }}>Cargando...</p>
              ) : previewData.length === 0 ? (
                <p style={{ color: '#475569', fontSize: '0.85rem' }}>Sin registros en esta sesión.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="animals-table w-full">
                    <thead>
                      <tr>
                        <th>Nº</th>
                        <th>Caravana</th>
                        <th>RENSPA</th>
                        <th>Toro</th>
                        <th>Hora</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(previewData as NovedadIA[]).map((ia, i) => {
                        const a = getAnimal(ia.animalId);
                        return (
                          <tr key={ia.id}>
                            <td style={{ color: '#60a5fa', fontWeight: 700 }}>{i + 1}</td>
                            <td className="font-mono">{ia.animalId}</td>
                            <td>{a?.renspa || '—'}</td>
                            <td style={{ color: '#60a5fa' }}>{ia.bull}</td>
                            <td style={{ color: '#64748b', fontSize: '0.78rem' }}>{formatTime(ia.timestamp)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── TACTO tab ─────────────────────────────────────────────────────── */}
      {activeTab === 'Tacto' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="glass-panel p-6">
            <h2 className="text-lg font-semibold mb-4" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <BarChart3 size={18} /> Informe de Tacto
            </h2>
            <SesionSelector />

            {/* Estadísticas */}
            {tactoStats && (
              <div style={{ marginBottom: '1.25rem' }}>
                <p style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, marginBottom: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Estadísticas de la sesión
                </p>
                {/* Fila 1 */}
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                  <StatCard label="Total" value={tactoStats.total} color="#60a5fa" />
                  <StatCard label="Preñadas" value={tactoStats.pIA + tactoStats.pRepaso} color="#34d399" sub={tactoStats.pct(tactoStats.pIA + tactoStats.pRepaso)} />
                  <StatCard label="Vacías" value={tactoStats.vacias} color="#f87171" sub={tactoStats.pct(tactoStats.vacias)} />
                  <StatCard label="Rechazos" value={tactoStats.rechazos} color="#fbbf24" sub={tactoStats.pct(tactoStats.rechazos)} />
                </div>
                {/* Fila 2: desglose preñez */}
                <div style={{ display: 'flex', gap: '0.5rem', padding: '0.75rem', background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: '10px' }}>
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontSize: '0.72rem', color: '#6ee7b7', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.2rem' }}>🐂 Por IA</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#34d399' }}>{tactoStats.pIA}</div>
                    <div style={{ fontSize: '0.78rem', color: '#34d399', fontWeight: 700 }}>{tactoStats.pct(tactoStats.pIA)}</div>
                  </div>
                  <div style={{ width: '1px', background: 'rgba(255,255,255,0.07)' }} />
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontSize: '0.72rem', color: '#93c5fd', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.2rem' }}>🔄 Por Repaso</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#60a5fa' }}>{tactoStats.pRepaso}</div>
                    <div style={{ fontSize: '0.78rem', color: '#60a5fa', fontWeight: 700 }}>{tactoStats.pct(tactoStats.pRepaso)}</div>
                  </div>
                </div>
              </div>
            )}

            {selectedSesionId && (
              <button
                className="btn btn-primary"
                onClick={exportTacto}
                disabled={previewData.length === 0}
              >
                <Download size={18} /> Exportar Tacto (.xlsx)
              </button>
            )}
          </div>

          {/* Preview Tacto */}
          {selectedSesionId && (
            <div className="glass-panel p-4">
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Calendar size={14} /> Vista previa — {selectedSesion?.label || formatDate(selectedSesion?.date || '')}
                <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: '#64748b' }}>{previewData.length} animales</span>
              </h3>
              {loadingPreview ? (
                <p style={{ color: '#475569', fontSize: '0.85rem' }}>Cargando...</p>
              ) : previewData.length === 0 ? (
                <p style={{ color: '#475569', fontSize: '0.85rem' }}>Sin registros en esta sesión.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="animals-table w-full">
                    <thead>
                      <tr>
                        <th>Nº</th>
                        <th>Caravana</th>
                        <th>RENSPA</th>
                        <th>Resultado</th>
                        <th>Observación</th>
                        <th>Hora</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(previewData as NovedadTacto[]).map((t, i) => {
                        const a = getAnimal(t.animalId);
                        const isIA = t.result === 'Preñada IA';
                        const isRepaso = t.result === 'Preñada Repaso' || (t.result as string) === 'Preñada';
                        const isVacia = t.result === 'Vacía';
                        const clr = isIA ? '#34d399' : isRepaso ? '#60a5fa' : isVacia ? '#f87171' : '#fbbf24';
                        const bg = isIA ? '#34d39918' : isRepaso ? '#60a5fa18' : isVacia ? '#f8717118' : '#fbbf2418';
                        return (
                          <tr key={t.id}>
                            <td style={{ fontWeight: 700, color: '#f472b6' }}>{i + 1}</td>
                            <td className="font-mono">{t.animalId}</td>
                            <td>{a?.renspa || '—'}</td>
                            <td>
                              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: clr, background: bg, padding: '0.15rem 0.5rem', borderRadius: '99px' }}>
                                {t.result}
                              </span>
                            </td>
                            <td style={{ color: '#64748b', fontSize: '0.8rem' }}>{t.observation || '—'}</td>
                            <td style={{ color: '#64748b', fontSize: '0.78rem' }}>{formatTime(t.timestamp)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
