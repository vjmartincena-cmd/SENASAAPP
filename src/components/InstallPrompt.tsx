import { useState, useEffect } from 'react';
import { Download } from 'lucide-react';

export function InstallPrompt({ isSidebar = false }: { isSidebar?: boolean }) {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Verificar si ya está en modo standalone (instalada)
    const isAppStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                           (window.navigator as any).standalone || 
                           document.referrer.includes('android-app://');
    
    setIsStandalone(isAppStandalone);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    window.addEventListener('appinstalled', () => {
      setDeferredPrompt(null);
      setIsInstallable(false);
      setIsStandalone(true);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setIsInstallable(false);
  };

  if (!isInstallable || isStandalone) {
    return null;
  }

  if (isSidebar) {
    return (
      <button
        className="nav-btn"
        style={{ width: '100%', color: 'var(--accent)', fontWeight: 'bold' }}
        onClick={handleInstallClick}
      >
        <Download size={20} />
        <span>Instalar App</span>
      </button>
    );
  }

  return (
    <button 
      onClick={handleInstallClick} 
      className="btn btn-primary"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.4rem 0.8rem',
        fontSize: '0.85rem',
        borderRadius: '20px',
        background: 'var(--accent)',
        color: 'white',
        border: 'none',
        cursor: 'pointer',
        boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
      }}
      aria-label="Instalar App"
    >
      <Download size={16} />
      <span>Instalar</span>
    </button>
  );
}
