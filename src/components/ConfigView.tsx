import { useState, useEffect } from 'react';
import { AppConfig, db, UserProfile } from '../db';
import { Trash2, Plus, Download, Upload, AlertTriangle, Users, Check, X, LogOut } from 'lucide-react';
import { auth } from '../firebaseConfig';
import { signOut } from 'firebase/auth';

interface ConfigViewProps {
  config: AppConfig;
  setConfig: (config: AppConfig) => void;
  userProfile: UserProfile | null;
}

export function ConfigView({ config, setConfig, userProfile }: ConfigViewProps) {
  const [newColor, setNewColor] = useState('');
  const [newBull, setNewBull] = useState('');
  const [newRenspa, setNewRenspa] = useState('');
  const [oldAnimalId, setOldAnimalId] = useState('');
  const [newAnimalId, setNewAnimalId] = useState('');
  const [users, setUsers] = useState<UserProfile[]>([]);

  useEffect(() => {
    if (userProfile?.role === 'admin') {
      loadUsers();
    }
  }, [userProfile]);

  const loadUsers = async () => {
    const list = await db.getAllUserProfiles();
    setUsers(list);
  };

  const handleToggleApprove = async (u: UserProfile) => {
    if (u.uid === userProfile?.uid) {
      alert("No puedes modificar tu propio estado de aprobación.");
      return;
    }
    const updated = { ...u, approved: !u.approved };
    await db.saveUserProfile(updated);
    await loadUsers();
  };

  const handleDeleteUser = async (u: UserProfile) => {
    if (u.uid === userProfile?.uid) {
      alert("No puedes eliminarte a ti mismo.");
      return;
    }
    if (window.confirm(`¿Seguro que deseas eliminar el perfil del usuario ${u.email}?`)) {
      await db.deleteUserProfile(u.uid);
      await loadUsers();
    }
  };

  const addColor = async () => {
    if (!newColor.trim() || config.colors.includes(newColor.trim())) return;
    const updated = { ...config, colors: [...config.colors, newColor.trim()] };
    await db.saveConfig(updated);
    setConfig(updated);
    setNewColor('');
  };

  const removeColor = async (color: string) => {
    const updated = { ...config, colors: config.colors.filter(c => c !== color) };
    await db.saveConfig(updated);
    setConfig(updated);
  };

  const addBull = async () => {
    if (!newBull.trim() || config.bulls.includes(newBull.trim())) return;
    const updated = { ...config, bulls: [...config.bulls, newBull.trim()] };
    await db.saveConfig(updated);
    setConfig(updated);
    setNewBull('');
  };

  const removeBull = async (bull: string) => {
    const updated = { ...config, bulls: config.bulls.filter(b => b !== bull) };
    await db.saveConfig(updated);
    setConfig(updated);
  };

  const addRenspa = async () => {
    if (!newRenspa.trim() || config.renspas.includes(newRenspa.trim())) return;
    const updated = { ...config, renspas: [...config.renspas, newRenspa.trim()] };
    await db.saveConfig(updated);
    setConfig(updated);
    setNewRenspa('');
  };

  const removeRenspa = async (r: string) => {
    const updated = { ...config, renspas: config.renspas.filter(x => x !== r) };
    await db.saveConfig(updated);
    setConfig(updated);
  };

  const handleExport = async () => {
    const data = await db.exportData();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `backup_ganaderia_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (confirm('Importar sobrescribirá o fusionará datos existentes. ¿Continuar?')) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const content = event.target?.result as string;
          await db.importData(content);
          const newConfig = await db.getConfig();
          setConfig(newConfig);
          alert('Datos importados correctamente.');
        } catch (err) {
          alert('Error al importar el archivo.');
          console.error(err);
        }
      };
      reader.readAsText(file);
    }
  };

  const handleClearAll = async () => {
    const first = confirm('⚠️ ATENCIÓN: Vas a BORRAR TODOS los animales, novedades y configuraciones.\n¿Estás seguro?');
    if (!first) return;
    const second = confirm('¿CONFIRMÁS que querés borrar TODA la memoria? Esta acción NO se puede deshacer.');
    if (!second) return;
    await db.clearAllData();
    const newConfig = await db.getConfig();
    setConfig(newConfig);
    alert('Memoria limpiada. La aplicación arranca desde cero.');
  };

  const handleReplaceId = async () => {
    if (!oldAnimalId.trim() || !newAnimalId.trim()) return;
    if (oldAnimalId.trim() === newAnimalId.trim()) {
      alert('El nuevo ID debe ser diferente al actual.');
      return;
    }
    
    if (confirm(`¿Estás seguro de que deseas reemplazar el ID "${oldAnimalId.trim()}" por "${newAnimalId.trim()}" en toda la aplicación?`)) {
      try {
        await db.replaceAnimalId(oldAnimalId.trim(), newAnimalId.trim());
        alert('ID reemplazado exitosamente.');
        setOldAnimalId('');
        setNewAnimalId('');
      } catch (err: any) {
        alert(err.message || 'Error al reemplazar el ID.');
      }
    }
  };

  const handleMigrateToCloud = async () => {
    const user = db.getCurrentUser();
    if (!user) {
      alert("Debes iniciar sesión para subir datos a la nube.");
      return;
    }
    if (confirm("¿Seguro que deseas subir todos los datos locales de este dispositivo a tu cuenta en la nube?")) {
      try {
        await db.migrateLocalToCloud(user.uid);
        alert("Datos subidos correctamente a la nube.");
      } catch (err) {
        console.error(err);
        alert("Error al subir los datos.");
      }
    }
  };

  return (
    <div className="view-container">
      <header className="view-header">
        <h1>Configuración</h1>
      </header>

      <div className="grid-2-col">
        {/* Colores */}
        <div className="glass-panel p-6">
          <h2 className="text-lg font-semibold mb-4">Colores (Pelaje)</h2>
          <div className="flex gap-2 mb-4">
            <input 
              type="text" 
              className="input-field flex-1" 
              placeholder="Nuevo color..."
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addColor()}
            />
            <button className="btn btn-primary" onClick={addColor}><Plus size={18}/></button>
          </div>
          <ul className="list-group">
            {config.colors.map(color => (
              <li key={color} className="list-item">
                <span>{color}</span>
                <button className="btn-icon text-danger" onClick={() => removeColor(color)}><Trash2 size={16}/></button>
              </li>
            ))}
          </ul>
        </div>

        {/* Toros */}
        <div className="glass-panel p-6">
          <h2 className="text-lg font-semibold mb-4">Toros Activos</h2>
          <div className="flex gap-2 mb-4">
            <input 
              type="text" 
              className="input-field flex-1" 
              placeholder="Nuevo toro..."
              value={newBull}
              onChange={(e) => setNewBull(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addBull()}
            />
            <button className="btn btn-primary" onClick={addBull}><Plus size={18}/></button>
          </div>
          <ul className="list-group">
            {config.bulls.map(bull => (
              <li key={bull} className="list-item">
                <span>{bull}</span>
                <button className="btn-icon text-danger" onClick={() => removeBull(bull)}><Trash2 size={16}/></button>
              </li>
            ))}
          </ul>
        </div>

        {/* Renspas */}
        <div className="glass-panel p-6 grid-span-2">
          <h2 className="text-lg font-semibold mb-4">RENSPA Registrados</h2>
          <div className="flex gap-2 mb-4">
            <input 
              type="text" 
              className="input-field flex-1" 
              placeholder="Ej: Cena Pablo..."
              value={newRenspa}
              onChange={(e) => setNewRenspa(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addRenspa()}
            />
            <button className="btn btn-primary" onClick={addRenspa}><Plus size={18}/></button>
          </div>
          <div className="flex flex-wrap gap-2">
            {config.renspas.map(r => (
              <div key={r} className="badge bg-darker text-white px-3 py-2 rounded-lg flex items-center gap-2 border border-accent/20">
                {r}
                <button className="btn-icon text-danger p-0 h-auto" onClick={() => removeRenspa(r)} title="Eliminar"><Trash2 size={16}/></button>
              </div>
            ))}
          </div>
        </div>

        {/* Reemplazar ID */}
        <div className="glass-panel p-6 grid-span-2">
          <h2 className="text-lg font-semibold mb-4">Reemplazar ID de Animal</h2>
          <p className="text-sm text-muted mb-4">Cambia el ID de un animal y actualiza automáticamente todos sus registros y novedades en la aplicación.</p>
          <div className="flex gap-4 items-end flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <label className="text-sm text-muted block mb-1">ID Actual (Viejo)</label>
              <input 
                type="text" 
                className="input-field w-full" 
                placeholder="ID existente..."
                value={oldAnimalId}
                onChange={(e) => setOldAnimalId(e.target.value)}
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="text-sm text-muted block mb-1">ID Nuevo</label>
              <input 
                type="text" 
                className="input-field w-full" 
                placeholder="Nuevo ID..."
                value={newAnimalId}
                onChange={(e) => setNewAnimalId(e.target.value)}
              />
            </div>
            <button className="btn btn-primary h-[42px]" onClick={handleReplaceId}>
              Reemplazar ID
            </button>
          </div>
        </div>

        {/* Gestión de Usuarios (Sólo Admin) */}
        {userProfile?.role === 'admin' && (
          <div className="glass-panel p-6 grid-span-2">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Users size={20} className="text-accent" /> Gestión de Usuarios
            </h2>
            <div className="overflow-x-auto">
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '0.75rem', color: 'var(--text-secondary)' }}>Correo Electrónico</th>
                    <th style={{ padding: '0.75rem', color: 'var(--text-secondary)' }}>Rol</th>
                    <th style={{ padding: '0.75rem', color: 'var(--text-secondary)' }}>Estado</th>
                    <th style={{ padding: '0.75rem', color: 'var(--text-secondary)', textAlign: 'right' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.uid} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '0.75rem', fontWeight: 600 }}>{u.email}</td>
                      <td style={{ padding: '0.75rem' }}>
                        <span style={{ 
                          background: u.role === 'admin' ? 'rgba(37,99,235,0.1)' : 'rgba(0,0,0,0.05)', 
                          color: u.role === 'admin' ? '#2563eb' : 'var(--text-secondary)',
                          padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 700 
                        }}>
                          {u.role.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem' }}>
                        <span style={{ 
                          background: u.approved ? 'rgba(21,128,61,0.1)' : 'rgba(239,68,68,0.1)', 
                          color: u.approved ? '#15803d' : '#dc2626',
                          padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 700 
                        }}>
                          {u.approved ? 'Aprobado' : 'Pendiente'}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        <button 
                          className={`btn ${u.approved ? 'btn-danger' : 'btn-success'}`}
                          style={{ padding: '0.4rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}
                          onClick={() => handleToggleApprove(u)}
                          disabled={u.uid === userProfile.uid}
                        >
                          {u.approved ? <><X size={14} /> Revocar</> : <><Check size={14} /> Aprobar</>}
                        </button>
                        <button 
                          className="btn btn-danger"
                          style={{ padding: '0.4rem 0.5rem' }}
                          onClick={() => handleDeleteUser(u)}
                          disabled={u.uid === userProfile.uid}
                          title="Eliminar usuario"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>No hay usuarios registrados.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Base de Datos */}
        <div className="glass-panel p-6 grid-span-2">
          <h2 className="text-lg font-semibold mb-4">Base de Datos</h2>
          <div className="flex gap-4 flex-wrap">
            <button className="btn btn-success" onClick={handleExport}>
              <Download size={18} /> Exportar Copia de Seguridad
            </button>
            <label className="btn btn-primary cursor-pointer">
              <Upload size={18} /> Importar Datos
              <input type="file" accept=".json" style={{display: 'none'}} onChange={handleImport} />
            </label>
          </div>

          <div className="mt-6 p-4 border rounded-lg" style={{ borderColor: 'var(--accent)', backgroundColor: 'var(--bg-tertiary)' }}>
            <div className="flex items-center gap-2 mb-3">
              <Upload size={20} style={{ color: 'var(--accent)' }} />
              <h3 style={{ color: 'var(--accent)' }} className="font-semibold">Sincronización en la Nube</h3>
            </div>
            <p className="text-sm text-muted mb-3">Si tienes datos locales en este dispositivo que aún no están en la nube, puedes subirlos ahora. Esto fusionará tus datos locales con los de tu cuenta.</p>
            <button className="btn btn-primary" onClick={handleMigrateToCloud}>
              <Upload size={18} /> Subir Datos Locales a la Nube
            </button>
          </div>

          <div className="mt-6 p-4 border border-danger/40 rounded-lg bg-red-900/10">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={20} className="text-danger" />
              <h3 className="text-danger font-semibold">Zona de Peligro</h3>
            </div>
            <p className="text-sm text-muted mb-3">Borra todos los animales, novedades y configuraciones. Usá solo para reiniciar durante pruebas.</p>
            <button className="btn btn-danger" onClick={handleClearAll}>
              <Trash2 size={18} /> Limpiar Toda la Memoria
            </button>
          </div>
        </div>

        {/* Cerrar Sesión */}
        <div className="glass-panel p-6 grid-span-2 flex justify-between items-center bg-gray-50/5">
          <div>
            <h2 className="text-lg font-semibold">Sesión Actual</h2>
            <p className="text-sm text-muted">Estás conectado como: {userProfile?.email}</p>
          </div>
          <button 
            className="btn btn-danger"
            style={{ padding: '0.75rem 1.5rem', fontWeight: 'bold' }}
            onClick={async () => {
              if (confirm('¿Seguro que deseas cerrar la sesión actual?')) {
                await signOut(auth);
              }
            }}
          >
            <LogOut size={20} /> Cerrar Sesión
          </button>
        </div>
      </div>
    </div>
  );
}
