import { useState, useEffect } from 'react';
import { Download } from 'lucide-react';

export function InstallPrompt() {
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
      // Prevenir que Chrome muestre el prompt automáticamente al inicio
      e.preventDefault();
      // Guardar el evento para poder dispararlo luego
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    window.addEventListener('appinstalled', () => {
      // Limpiar luego de la instalación
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
    
    // Mostrar el prompt nativo
    deferredPrompt.prompt();
    
    // Esperar la respuesta del usuario
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      console.log('El usuario aceptó la instalación');
    } else {
      console.log('El usuario rechazó la instalación');
    }
    
    setDeferredPrompt(null);
    setIsInstallable(false);
  };

  // Si ya está instalada o no se puede instalar, no mostrar nada
  if (!isInstallable || isStandalone) {
    return null;
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
        marginRight: '1rem',
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
