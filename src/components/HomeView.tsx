import { useEffect, useState } from 'react';
import { db } from '../db';
import { auth } from '../firebaseConfig';
import { ClipboardList, Stethoscope, Search, ShieldCheck } from 'lucide-react';

interface HomeViewProps {
  setActiveTab?: (tab: string) => void;
}

export function HomeView({ setActiveTab }: HomeViewProps) {
  const [animalCount, setAnimalCount] = useState<number | null>(null);

  useEffect(() => {
    db.getAllAnimals().then(animals => setAnimalCount(animals.length));
  }, []);

  const userEmail = auth.currentUser?.email || 'Usuario';

  return (
    <div className="view-container">
      <header className="view-header">
        <h1>Inicio</h1>
      </header>

      <div className="glass-panel p-8" style={{ marginBottom: '1.5rem', textAlign: 'center', background: 'linear-gradient(135deg, rgba(29,78,216,0.05) 0%, rgba(29,78,216,0.01) 100%)', border: '1px solid rgba(29,78,216,0.1)' }}>
        <h2 style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-color)', marginBottom: '0.5rem' }}>
          ¡Bienvenido, {userEmail}!
        </h2>
        <p style={{ color: 'var(--text-color)', fontSize: '1.1rem', opacity: 0.8 }}>
          Panel de Control - Sistema de Gestión de Ganado
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="glass-panel p-6 text-center" style={{ borderTop: '4px solid #1d4ed8' }}>
          <div style={{ fontSize: '2.5rem', fontWeight: 900, color: '#1d4ed8', marginBottom: '0.5rem' }}>
            {animalCount === null ? '...' : animalCount}
          </div>
          <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-color)', textTransform: 'uppercase' }}>
            Cabezas de Ganado
          </div>
        </div>
        
        <div className="glass-panel p-6 text-center" style={{ borderTop: '4px solid #15803d' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.8rem', color: '#15803d' }}>
            <ShieldCheck size={36} />
          </div>
          <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-color)', textTransform: 'uppercase' }}>
            Estado de Nube OK
          </div>
        </div>
      </div>

      <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-color)', marginBottom: '1rem' }}>Accesos Rápidos</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-panel p-6 text-center" style={{ cursor: 'pointer', transition: 'all 0.2s' }} onClick={() => setActiveTab?.('novedades')}>
          <Stethoscope size={32} style={{ color: '#1d4ed8', margin: '0 auto 1rem' }} />
          <h4 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-color)' }}>Registrar Sanidad</h4>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-color)', opacity: 0.7, marginTop: '0.5rem' }}>Abrir módulo de novedades y eventos.</p>
        </div>

        <div className="glass-panel p-6 text-center" style={{ cursor: 'pointer', transition: 'all 0.2s' }} onClick={() => setActiveTab?.('buscar')}>
          <Search size={32} style={{ color: '#b45309', margin: '0 auto 1rem' }} />
          <h4 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-color)' }}>Buscar Animal</h4>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-color)', opacity: 0.7, marginTop: '0.5rem' }}>Escanear para encontrar positivos.</p>
        </div>

        <div className="glass-panel p-6 text-center" style={{ cursor: 'pointer', transition: 'all 0.2s' }} onClick={() => setActiveTab?.('fichas')}>
          <ClipboardList size={32} style={{ color: '#15803d', margin: '0 auto 1rem' }} />
          <h4 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-color)' }}>Ver Padrón</h4>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-color)', opacity: 0.7, marginTop: '0.5rem' }}>Listado general de hacienda.</p>
        </div>
      </div>

    </div>
  );
}
