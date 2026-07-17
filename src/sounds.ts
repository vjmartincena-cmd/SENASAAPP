// Sistema de sonido sintetizado para la aplicación

const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();

function playTone(frequency: number, type: OscillatorType, duration: number, volume: number = 0.5) {
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  
  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  
  // Fade out para evitar "clicks" al final del sonido
  gainNode.gain.setValueAtTime(volume, audioCtx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
  
  oscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  
  oscillator.start();
  oscillator.stop(audioCtx.currentTime + duration);
}

export const soundSystem = {
  // Pitido normal: Lectura correcta, animal existente
  playSuccess: () => {
    playTone(880, 'sine', 0.15, 0.5); // A5 note
  },
  
  // Pitido doble: Lectura de un animal nuevo que se registra automáticamente
  playNewAnimal: () => {
    playTone(1046.50, 'square', 0.1, 0.4); // C6
    setTimeout(() => {
      playTone(1318.51, 'square', 0.15, 0.4); // E6
    }, 150);
  },
  
  // Animal negativo encontrado correctamente
  playNegativeMatch: () => {
    playTone(523.25, 'sine', 0.1, 0.5); // C5
    setTimeout(() => {
      playTone(659.25, 'sine', 0.15, 0.5); // E5
    }, 120);
  },
  
  // Alarma/Sirena: Encontró la vaca que se estaba buscando (Ej. positiva en Brucelosis)
  playAlarm: () => {
    const playSirenOscillation = (freq1: number, freq2: number, timeOffset: number) => {
      setTimeout(() => playTone(freq1, 'sawtooth', 0.3, 0.6), timeOffset);
      setTimeout(() => playTone(freq2, 'sawtooth', 0.3, 0.6), timeOffset + 300);
    };
    
    // Repite la sirena un par de veces
    playSirenOscillation(600, 800, 0);
    playSirenOscillation(600, 800, 600);
    playSirenOscillation(600, 800, 1200);
  },
  
  // Error genérico
  playError: () => {
    playTone(200, 'sawtooth', 0.3, 0.5);
  }
};
