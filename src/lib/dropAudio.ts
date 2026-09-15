// ==============================================================================
// YA DELIVERY - MOTOR DE AUDIO SINTÉTICO NATIVO PARA DROPS (Web Audio API)
// Archivo: src/lib/dropAudio.ts
// Sin dependencias externas. 100% nativo y seguro.
// ==============================================================================

class DropAudioEngine {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;

  constructor() {
    // Inicialización perezosa (lazy) tras la primera interacción del usuario
    const savedMute = typeof localStorage !== 'undefined' ? localStorage.getItem('ya_drops_muted') : null;
    this.isMuted = savedMute === 'true';
  }

  private getContext(): AudioContext | null {
    if (this.isMuted) return null;
    try {
      if (!this.ctx && typeof window !== 'undefined') {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          this.ctx = new AudioContextClass();
        }
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    } catch {
      return null;
    }
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('ya_drops_muted', String(this.isMuted));
    }
    return this.isMuted;
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  // 1. Sonido corto al iniciar el giro (whoosh mecánico)
  public playSpinStart(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(420, now + 0.12);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.18, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.2);
    } catch {
      // Ignorar de forma segura si no se permite audio
    }
  }

  // 2. Ticks mecánicos sutiles durante el giro rápido ("ti-ti-ti-ti...")
  public playTick(pitchMultiplier: number = 1): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      const baseFreq = 750 * pitchMultiplier;
      osc.frequency.setValueAtTime(baseFreq, now);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.5, now + 0.02);

      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.03);
    } catch {
      // Silencioso ante errores
    }
  }

  // 3. Sonido seco/click metálico al detener cada carrete
  public playReelStop(reelIndex: number): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      
      // Tono principal con pitch creciente según el carrete (1 -> 280Hz, 2 -> 370Hz, 3 -> 490Hz)
      const pitches = [280, 370, 490];
      const freq = pitches[reelIndex] || 320;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.4, now + 0.09);

      // Envolvente percusiva contundente
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      // Filtro paso bajo para darle cuerpo mecánico
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1200, now);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.14);
    } catch {
      // Silencioso
    }
  }

  // 4. Celebración especial 3 IGUALES (Jackpot mayor: Pedido Gratis hasta 20€)
  public playJackpotCelebration(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      // Arpegio brillante en notas pentatónicas mayores: C5, E5, G5, C6, E6
      const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51];

      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const noteStart = now + i * 0.09;

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, noteStart);

        gain.gain.setValueAtTime(0.001, noteStart);
        gain.gain.linearRampToValueAtTime(0.22, noteStart + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, noteStart + 0.45);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(noteStart);
        osc.stop(noteStart + 0.5);
      });
    } catch {
      // Silencioso
    }
  }

  // 5. Celebración 2 IGUALES (25% Dto)
  public playMatchCelebration(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      // Dos acordes limpios
      const chords = [
        [440, 554.37], // A4, C#5
        [587.33, 739.99], // D5, F#5
      ];

      chords.forEach((chord, step) => {
        const chordStart = now + step * 0.14;
        chord.forEach((freq) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();

          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, chordStart);

          gain.gain.setValueAtTime(0.001, chordStart);
          gain.gain.linearRampToValueAtTime(0.18, chordStart + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, chordStart + 0.35);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start(chordStart);
          osc.stop(chordStart + 0.4);
        });
      });
    } catch {
      // Silencioso
    }
  }

  // 6. Sonido de participación / consolación (+1 Sorteo Mensual)
  public playConsolationSound(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.18);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.15, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.35);
    } catch {
      // Silencioso
    }
  }
}

export const dropAudio = new DropAudioEngine();
