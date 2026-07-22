import { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { HomeView } from './components/HomeView';
import { SenasaExportView } from './components/SenasaExportView';
import { FichasView } from './components/FichasView';
import { NovedadesView } from './components/NovedadesView';
import { InformesView } from './components/InformesView';
import { BuscarVacaView } from './components/BuscarVacaView';
import { ConfigView } from './components/ConfigView';
import { MuerteView } from './components/MuerteView';
import { LoginView } from './components/LoginView';
import { db, AppConfig } from './db';
import { auth } from './firebaseConfig';
import { onAuthStateChanged, User } from 'firebase/auth';
import { Menu } from 'lucide-react';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState('inicio');
  const [isDbReady, setIsDbReady] = useState(false);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (user === undefined) return; // Todavía cargando el estado de autenticación

    const initApp = async () => {
      try {
        db.setCurrentUser(user);
        await db.init();
        const conf = await db.getConfig();
        setConfig(conf);
        setIsDbReady(true);
        
        // Opcional: si el usuario se acaba de loguear y hay datos locales, podríamos preguntar si desea migrarlos.
        // Por ahora, se puede hacer la migración manualmente desde Configuración.
      } catch (err: any) {
        console.error("Failed to init DB", err);
        alert("Error al inicializar la base de datos: " + (err.message || err.toString()));
      }
    };

    if (user) {
      initApp();
    } else {
      setIsDbReady(false);
    }
  }, [user]);

  if (user === undefined) {
    return <div className="loading-screen" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'var(--bg-primary)' }}>Verificando sesión...</div>;
  }

  if (user === null) {
    return <LoginView />;
  }

  if (!isDbReady || !config) {
    return <div className="loading-screen" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'var(--bg-primary)' }}>Cargando base de datos segura...</div>;
  }

  const renderView = () => {
    switch (activeTab) {
      case 'inicio': return <HomeView setActiveTab={setActiveTab} />;
      case 'senasa': return <SenasaExportView />;
      case 'fichas': return <FichasView config={config} />;
      case 'novedades': return <NovedadesView config={config} />;
      case 'buscar': return <BuscarVacaView />;
      case 'muerte': return <MuerteView />;
      case 'informes': return <InformesView />;
      case 'config': return <ConfigView config={config} setConfig={setConfig} />;
      default: return <HomeView setActiveTab={setActiveTab} />;
    }
  };

  return (
    <div className={`app-layout ${isMobileMenuOpen ? 'menu-open' : ''}`}>
      {/* Cabecera Móvil */}
      <header className="mobile-header">
        <button className="menu-toggle-btn" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} aria-label="Abrir menú">
          <Menu size={24} />
        </button>
        <h1>Gestión Ganadera</h1>
      </header>

      {/* Overlay de menú móvil */}
      {isMobileMenuOpen && (
        <div className="menu-overlay" onClick={() => setIsMobileMenuOpen(false)} />
      )}

      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={(tab) => {
          setActiveTab(tab);
          setIsMobileMenuOpen(false);
        }} 
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
      />
      
      <main className="main-area">
        {renderView()}
      </main>
    </div>
  );
}

export default App;

