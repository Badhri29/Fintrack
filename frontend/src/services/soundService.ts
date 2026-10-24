/**
 * Sound Service - Synthesizes clean UI notification chimes using Web Audio API.
 * Requires zero external audio files and works reliably across all modern browsers.
 */

let sharedAudioCtx: AudioContext | null = null;

const getAudioContext = (): AudioContext | null => {
  try {
    if (!sharedAudioCtx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        sharedAudioCtx = new AudioContextClass();
      }
    }
    if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
};

export const playNotificationChime = (): void => {
  try {
    // Check both potential storage keys (default is enabled/true)
    const isMuted =
      localStorage.getItem('fintrack_notif_sound') === 'false' ||
      localStorage.getItem('fintrack_sound_enabled') === 'false';
    if (isMuted) return;

    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // Dual-tone crystal harmonic chime (D5: 587.33Hz -> A5: 880.00Hz -> D6: 1174.66Hz)
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now);
    osc1.frequency.exponentialRampToValueAtTime(880.0, now + 0.12);

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(880.0, now);
    osc2.frequency.exponentialRampToValueAtTime(1174.66, now + 0.15);

    gainNode.gain.setValueAtTime(0.22, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.5);
    osc2.stop(now + 0.5);
  } catch {
    // Gracefully ignore if autoplay policy is restricted
  }
};
