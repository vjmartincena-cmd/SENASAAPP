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
import { db, AppConfig, UserProfile } from './db';
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
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

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

        // Check user profile
        let profile = await db.getUserProfile(user!.uid);
        if (!profile) {
          const isAdmin = user!.email === 'vjmartincena@gmail.com';
          profile = {
            uid: user!.uid,
            email: user!.email || '',
            approved: isAdmin,
            role: isAdmin ? 'admin' : 'user',
            createdAt: Date.now()
          };
          await db.saveUserProfile(profile);
        }
        setUserProfile(profile);

        if (!profile.approved) {
          setIsDbReady(true);
          return; // Stop initialization if not approved
        }

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

  if (!isDbReady) {
    return <div className="loading-screen" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'var(--bg-primary)' }}>Cargando datos...</div>;
  }

  if (userProfile && !userProfile.approved) {
    return (
      <div style={{ display: 'flex', height: '100vh', width: '100vw', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-primary)' }}>
        <div className="glass-panel" style={{ padding: '2.5rem', width: '100%', maxWidth: '400px', textAlign: 'center' }}>
          <h2 style={{ color: 'var(--accent)', marginBottom: '1rem', fontSize: '1.5rem', fontWeight: 'bold' }}>Cuenta Pendiente</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>Tu cuenta ha sido registrada exitosamente, pero está pendiente de aprobación por el administrador del sistema.</p>
          <button 
            onClick={() => auth.signOut()} 
            className="btn" 
            style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)', padding: '0.75rem 1.5rem', fontWeight: 'bold', width: '100%' }}
          >
            Cerrar Sesión
          </button>
        </div>
      </div>
    );
  }

  if (!config) {
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
      case 'config': return <ConfigView config={config} setConfig={setConfig} userProfile={userProfile} />;
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

