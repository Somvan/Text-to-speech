
export enum ThemeMode {
  LIGHT = 'light',
  DARK = 'dark',
  SYSTEM = 'system'
}

export type VoiceName = 'Kore' | 'Puck' | 'Charon' | 'Fenrir' | 'Zephyr';

export interface TTSConfig {
  voiceName: VoiceName;
  speechRate: number;
  playbackSpeed: number;
  pitch: number;
  theme: ThemeMode;
}

export interface FileEntry {
  id: string;
  name: string;
  content: string;
  updatedAt: number;
}
