/**
 * Sound Service - Synthesizes clean UI notification chimes using Web Audio API.
 * Requires zero external audio files and works reliably across all modern browsers.
 */

export interface SoundOption {
  id: string;
  name: string;
  description: string;
}

export const NOTIFICATION_SOUNDS: SoundOption[] = [
  { id: 'crystal', name: 'Crystal Bell (Default)', description: 'Bright dual-tone crystal chime (D5 -> A5 -> D6)' },
  { id: 'success', name: 'Success Melody', description: 'Upbeat 3-note ascending victory chord (C5 -> E5 -> G5)' },
  { id: 'pop', name: 'Subtle Pop', description: 'Modern minimal bubble pop with rapid soft decay' },
  { id: 'ping', name: 'Digital Ping', description: 'Crisp high-frequency glass ping' },
  { id: 'marimba', name: 'Warm Marimba', description: 'Warm wooden marimba chord with harmonic resonance' },
  { id: 'zen', name: 'Zen Singing Bowl', description: 'Deep calming ambient meditation bell with lingering sustain' },
  { id: 'radar', name: 'Radar Pulse', description: 'Futuristic electronic double-blip confirmation' },
];

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

export const getActiveSoundTone = (): string => {
  try {
    return localStorage.getItem('fintrack_notif_sound_tone') || 'crystal';
  } catch {
    return 'crystal';
  }
};

export const setActiveSoundTone = (toneId: string): void => {
  try {
    localStorage.setItem('fintrack_notif_sound_tone', toneId);
  } catch {}
};

export const playNotificationChime = (overrideTone?: string, forcePlay: boolean = false): void => {
  try {
    // Check if muted unless forcePlay is true (used when user tests sound)
    if (!forcePlay) {
      const isMuted =
        localStorage.getItem('fintrack_notif_sound') === 'false' ||
        localStorage.getItem('fintrack_sound_enabled') === 'false';
      if (isMuted) return;
    }

    const ctx = getAudioContext();
    if (!ctx) return;

    const tone = overrideTone || getActiveSoundTone();
    const now = ctx.currentTime;

    switch (tone) {
      case 'success': {
        // Upbeat 3-note ascending chord (C5: 523.25, E5: 659.25, G5: 783.99)
        const notes = [523.25, 659.25, 783.99];
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const start = now + idx * 0.09;
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, start);

          gain.gain.setValueAtTime(0.18, start);
          gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start(start);
          osc.stop(start + 0.35);
        });
        break;
      }

      case 'pop': {
        // Modern subtle bubble pop
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(820, now);
        osc.frequency.exponentialRampToValueAtTime(320, now + 0.08);

        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.12);
        break;
      }

      case 'ping': {
        // High crisp digital ping
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1318.51, now); // E6

        gain.gain.setValueAtTime(0.24, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.4);
        break;
      }

      case 'marimba': {
        // Warm wooden marimba chord
        const freqs = [440, 660, 880];
        freqs.forEach((f, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = i === 0 ? 'triangle' : 'sine';
          osc.frequency.setValueAtTime(f, now);

          gain.gain.setValueAtTime(0.2 / (i + 1), now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start(now);
          osc.stop(now + 0.38);
        });
        break;
      }

      case 'zen': {
        // Ambient soft singing bowl chime
        const base = 432; // Healing A frequency
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(base, now);

        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(base * 1.5, now); // Perfect fifth harmonic

        gain.gain.setValueAtTime(0.22, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.85);
        osc2.stop(now + 0.85);
        break;
      }

      case 'radar': {
        // Electronic double blip pulse
        [0, 0.09].forEach((delay, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const start = now + delay;
          osc.type = 'sine';
          osc.frequency.setValueAtTime(idx === 0 ? 880 : 1760, start);

          gain.gain.setValueAtTime(0.2, start);
          gain.gain.exponentialRampToValueAtTime(0.001, start + 0.08);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start(start);
          osc.stop(start + 0.08);
        });
        break;
      }

      case 'crystal':
      default: {
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
        break;
      }
    }
  } catch {
    // Gracefully ignore if autoplay policy is restricted
  }
};
