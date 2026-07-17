import { 
  ClipboardList, 
  Stethoscope, 
  Search, 
  FileSpreadsheet, 
  Settings, 
  Download,
  Skull,
  LogOut
} from 'lucide-react';
import { auth } from '../firebaseConfig';
import { signOut } from 'firebase/auth';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({ activeTab, setActiveTab, isOpen, onClose }: SidebarProps) {
  const navItems = [
    { id: 'senasa', label: 'Venta / SENASA', icon: <Download size={20} /> },
    { id: 'fichas', label: 'Fichas de Cría', icon: <ClipboardList size={20} /> },
    { id: 'novedades', label: 'Novedades', icon: <Stethoscope size={20} /> },
    { id: 'buscar', label: 'Buscar Vaca', icon: <Search size={20} /> },
    { id: 'muerte', label: 'Baja / Muerte', icon: <Skull size={20} /> },
    { id: 'informes', label: 'Informes', icon: <FileSpreadsheet size={20} /> },
    { id: 'config', label: 'Configuración', icon: <Settings size={20} /> },
  ];

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error al cerrar sesión", error);
    }
  };

  return (
    <aside className={`sidebar glass-panel ${isOpen ? 'open' : ''}`} style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="sidebar-header">
        <h2>Gestión Ganadera</h2>
      </div>
      <nav className="sidebar-nav" style={{ flex: 1 }}>
        {navItems.map((item) => (
          <button
            key={item.id}
            className={`nav-btn ${activeTab === item.id ? 'active' : ''}`}
            onClick={() => {
              setActiveTab(item.id);
              onClose?.();
            }}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      
      <div style={{ padding: '1rem', borderTop: '1px solid var(--border)' }}>
        <button
          className="nav-btn"
          style={{ width: '100%', color: 'var(--danger)' }}
          onClick={handleLogout}
        >
          <LogOut size={20} />
          <span>Cerrar Sesión</span>
        </button>
      </div>
    </aside>
  );
}
