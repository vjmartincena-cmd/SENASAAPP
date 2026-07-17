import React, { useState } from 'react';
import { auth } from '../firebaseConfig';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { db } from '../db';
import { X, Mail, Lock, ShieldAlert, Sparkles, Loader2, ArrowRight, CheckCircle2 } from 'lucide-react';
import './AuthModal.css';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [shouldMigrate, setShouldMigrate] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [migrationStatus, setMigrationStatus] = useState<'idle' | 'migrating' | 'done'>('idle');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setIsLoading(true);
    setMigrationStatus('idle');

    if (!email || !password) {
      setError('Por favor, completa todos los campos.');
      setIsLoading(false);
      return;
    }

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      setIsLoading(false);
      return;
    }

    try {
      if (isSignUp) {
        // Register
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        if (shouldMigrate) {
          setMigrationStatus('migrating');
          await db.migrateLocalToCloud(user.uid);
          setMigrationStatus('done');
        }
        
        setSuccessMsg('¡Cuenta creada y sincronizada con éxito!');
        setTimeout(() => {
          onClose();
          resetForm();
        }, 2000);
      } else {
        // Login
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        if (shouldMigrate) {
          setMigrationStatus('migrating');
          await db.migrateLocalToCloud(user.uid);
          setMigrationStatus('done');
        }

        setSuccessMsg('Sesión iniciada correctamente.');
        setTimeout(() => {
          onClose();
          resetForm();
        }, 1500);
      }
    } catch (err: any) {
      console.error(err);
      let localizedError = 'Ocurrió un error inesperado. Inténtalo de nuevo.';
      if (err.code === 'auth/email-already-in-use') {
        localizedError = 'Este correo electrónico ya está registrado.';
      } else if (err.code === 'auth/invalid-email') {
        localizedError = 'El formato del correo electrónico no es válido.';
      } else if (err.code === 'auth/weak-password') {
        localizedError = 'La contraseña es muy débil. Mínimo 6 caracteres.';
      } else if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        localizedError = 'Correo electrónico o contraseña incorrectos.';
      } else if (err.code === 'auth/network-request-failed') {
        localizedError = 'Error de red. Verifica tu conexión a internet.';
      }
      setError(localizedError);
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setError(null);
    setSuccessMsg(null);
    setIsSignUp(false);
    setMigrationStatus('idle');
  };

  return (
    <div className="auth-modal-overlay">
      <div className="auth-modal-container glass-panel">
        <button className="auth-modal-close" onClick={onClose} aria-label="Cerrar">
          <X size={20} />
        </button>

        <div className="auth-modal-header">
          <div className="auth-logo-icon">
            {isSignUp ? <Sparkles className="icon-pulse" /> : <Lock />}
          </div>
          <h2>{isSignUp ? 'Crear Cuenta Segura' : 'Iniciar Sesión en la Nube'}</h2>
          <p className="auth-subtitle">
            {isSignUp 
              ? 'Regístrate para respaldar tu ganado y acceder desde cualquier dispositivo.' 
              : 'Accede a tus datos sincronizados de SENASA en cualquier lugar.'}
          </p>
        </div>

        {error && (
          <div className="auth-error-alert flex items-center gap-2">
            <ShieldAlert size={20} className="flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="auth-success-alert flex items-center gap-2">
            <CheckCircle2 size={20} className="flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {migrationStatus === 'migrating' && (
          <div className="auth-migration-loading flex items-center gap-2 mb-4">
            <Loader2 size={18} className="animate-spin text-accent" />
            <span>Migrando base de datos local a la nube...</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form mt-2">
          <div className="auth-form-group">
            <label htmlFor="auth-email">Correo Electrónico</label>
            <div className="auth-input-wrapper">
              <Mail size={18} className="auth-input-icon" />
              <input
                id="auth-email"
                type="email"
                placeholder="ejemplo@correo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                disabled={isLoading}
                autoComplete="email"
              />
            </div>
          </div>

          <div className="auth-form-group mt-4">
            <label htmlFor="auth-password">Contraseña</label>
            <div className="auth-input-wrapper">
              <Lock size={18} className="auth-input-icon" />
              <input
                id="auth-password"
                type="password"
                placeholder="Mínimo 6 caracteres"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field"
                disabled={isLoading}
                autoComplete={isSignUp ? "new-password" : "current-password"}
              />
            </div>
          </div>

          <div className="auth-migration-checkbox flex items-center mt-4 gap-2">
            <input
              id="migrate-checkbox"
              type="checkbox"
              checked={shouldMigrate}
              onChange={(e) => setShouldMigrate(e.target.checked)}
              disabled={isLoading}
            />
            <label htmlFor="migrate-checkbox" className="text-sm text-muted cursor-pointer select-none">
              Migrar mis datos locales de este dispositivo a la nube
            </label>
          </div>

          <button
            type="submit"
            className="btn btn-primary w-full mt-6 auth-submit-btn flex items-center justify-center gap-2"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span>Procesando...</span>
              </>
            ) : (
              <>
                <span>{isSignUp ? 'Crear Cuenta' : 'Ingresar'}</span>
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>

        <div className="auth-modal-footer text-center mt-6">
          <button
            className="auth-toggle-mode-btn text-sm text-accent"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError(null);
            }}
            disabled={isLoading}
          >
            {isSignUp 
              ? '¿Ya tienes una cuenta? Inicia sesión' 
              : '¿No tienes cuenta? Regístrate gratis'}
          </button>
        </div>
      </div>
    </div>
  );
};
