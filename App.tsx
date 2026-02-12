import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  MenuIcon, 
  SettingsIcon, 
  PlayIcon, 
  PauseIcon, 
  StopIcon, 
  SkipBack10Icon,
  SkipForward10Icon,
  CheckIcon, 
  UndoIcon, 
  RedoIcon,
  DownloadIcon,
  SunIcon,
  MoonIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  VoiceIcon,
  SlidersIcon,
  PaletteIcon
} from './components/Icons';
import { generateSpeech } from './services/geminiTTS';
import { ThemeMode, TTSConfig, VoiceName } from './types';
import { audioBufferToWav } from './utils/audioExport';

const App: React.FC = () => {
  // State
  const [text, setText] = useState<string>('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  // Playback state
  const [playbackPosition, setPlaybackPosition] = useState(0); // in seconds
  const playbackStartedAtRef = useRef<number>(0); // context time
  const playbackOffsetAtStartRef = useRef<number>(0); // buffer offset
  const lastGeneratedTextRef = useRef<string>('');
  const lastGeneratedVoiceRef = useRef<VoiceName | null>(null);

  // Settings Sections State
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    voice: true,
    audio: true,
    appearance: false
  });

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const [config, setConfig] = useState<TTSConfig>({
    voiceName: 'Kore',
    speechRate: 1.0,
    playbackSpeed: 1.0,
    pitch: 1.0,
    theme: ThemeMode.LIGHT
  });

  // Audio Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);

  // Stats
  const wordCount = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
  const charCount = text.length;

  // Persistence
  useEffect(() => {
    const savedText = localStorage.getItem('t2s_current_text');
    if (savedText) setText(savedText);
    const savedConfig = localStorage.getItem('t2s_config');
    if (savedConfig) {
      try {
        const parsed = JSON.parse(savedConfig);
        if (parsed.playbackSpeed === undefined) {
          parsed.playbackSpeed = parsed.speechRate || 1.0;
        }
        setConfig(parsed);
      } catch (e) {
        console.error("Failed to parse config", e);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('t2s_current_text', text);
  }, [text]);

  useEffect(() => {
    localStorage.setItem('t2s_config', JSON.stringify(config));
  }, [config]);

  // Audio Logic
  const getCurrentOffset = useCallback(() => {
    if (!isPlaying || !audioContextRef.current) return playbackPosition;
    const elapsed = (audioContextRef.current.currentTime - playbackStartedAtRef.current) * config.playbackSpeed;
    return Math.min(playbackOffsetAtStartRef.current + elapsed, audioBufferRef.current?.duration || 0);
  }, [isPlaying, playbackPosition, config.playbackSpeed]);

  const stopAudio = useCallback((resetPosition = false) => {
    if (sourceRef.current) {
      if (!resetPosition) {
        setPlaybackPosition(getCurrentOffset());
      }
      try {
        sourceRef.current.stop();
      } catch (e) {}
      sourceRef.current = null;
    }
    if (resetPosition) setPlaybackPosition(0);
    setIsPlaying(false);
  }, [getCurrentOffset]);

  const startPlayback = useCallback((offset: number) => {
    if (!audioBufferRef.current) return;
    
    stopAudio(false);

    const ctx = audioContextRef.current || new (window.AudioContext || (window as any).webkitAudioContext)();
    audioContextRef.current = ctx;

    const source = ctx.createBufferSource();
    source.buffer = audioBufferRef.current;
    source.playbackRate.value = config.playbackSpeed;
    source.connect(ctx.destination);
    
    const activeSource = source;
    source.onended = () => {
      if (sourceRef.current === activeSource) {
        setIsPlaying(false);
        setPlaybackPosition(0);
      }
    };

    sourceRef.current = source;
    const startOffset = Math.max(0, Math.min(offset, audioBufferRef.current.duration));
    source.start(0, startOffset);
    
    playbackStartedAtRef.current = ctx.currentTime;
    playbackOffsetAtStartRef.current = startOffset;
    setIsPlaying(true);
  }, [config.playbackSpeed, stopAudio]);

  const playAudio = async () => {
    if (!text.trim()) return;

    if (isPlaying) {
      stopAudio(false);
      return;
    }

    if (text !== lastGeneratedTextRef.current || config.voiceName !== lastGeneratedVoiceRef.current || !audioBufferRef.current) {
      setIsLoading(true);
      const buffer = await generateSpeech(text, config.voiceName);
      setIsLoading(false);

      if (buffer) {
        audioBufferRef.current = buffer;
        lastGeneratedTextRef.current = text;
        lastGeneratedVoiceRef.current = config.voiceName;
        startPlayback(0);
      }
    } else {
      startPlayback(playbackPosition);
    }
  };

  const handleSkip = (seconds: number) => {
    if (!audioBufferRef.current) return;
    const current = getCurrentOffset();
    const newPos = Math.max(0, Math.min(current + seconds, audioBufferRef.current.duration));
    setPlaybackPosition(newPos);
    if (isPlaying) {
      startPlayback(newPos);
    }
  };

  const handleExport = async (format: 'wav' | 'mp3') => {
    let buffer = audioBufferRef.current;
    if (text !== lastGeneratedTextRef.current || !buffer) {
      setIsLoading(true);
      buffer = await generateSpeech(text, config.voiceName);
      audioBufferRef.current = buffer;
      lastGeneratedTextRef.current = text;
      lastGeneratedVoiceRef.current = config.voiceName;
      setIsLoading(false);
    }

    if (!buffer) return;

    const blob = audioBufferToWav(buffer);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `t2s_audio_${Date.now()}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setIsExportMenuOpen(false);
  };

  const toggleTheme = () => {
    setConfig(prev => ({
      ...prev,
      theme: prev.theme === ThemeMode.LIGHT ? ThemeMode.DARK : ThemeMode.LIGHT
    }));
  };

  const isDarkMode = config.theme === ThemeMode.DARK;

  useEffect(() => {
    let frameId: number;
    const update = () => {
      if (isPlaying) {
        setPlaybackPosition(getCurrentOffset());
      }
      frameId = requestAnimationFrame(update);
    };
    frameId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frameId);
  }, [isPlaying, getCurrentOffset]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`h-screen flex flex-col transition-colors duration-200 ${isDarkMode ? 'bg-zinc-900 text-gray-100' : 'bg-white text-gray-900'}`}>
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 transition-opacity" onClick={() => setIsSidebarOpen(false)} />
      )}

      <aside className={`fixed top-0 left-0 h-full w-72 z-50 transform transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} ${isDarkMode ? 'bg-zinc-800' : 'bg-white'} shadow-xl`}>
        <div className={`p-4 border-b ${isDarkMode ? 'border-zinc-700' : 'border-gray-100'}`}>
          <h2 className="text-xl font-bold text-green-600">T2S Pro</h2>
        </div>
        <nav className="p-4 space-y-2">
          {[
            { label: 'New File', icon: '📄', action: () => { setText(''); stopAudio(true); } },
            { label: 'Settings', icon: '⚙️', action: () => { setIsSettingsOpen(true); setIsSidebarOpen(false); } },
            { label: 'Help & About', icon: 'ℹ️' },
          ].map((item, i) => (
            <button key={i} onClick={() => item.action && item.action()} className={`w-full text-left px-4 py-3 rounded-lg flex items-center space-x-4 transition-colors ${isDarkMode ? 'hover:bg-zinc-700 text-gray-200' : 'hover:bg-gray-100 text-gray-700'}`}>
              <span className="text-xl">{item.icon}</span>
              <span className="font-medium">{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <header className={`px-4 py-3 flex items-center justify-between border-b ${isDarkMode ? 'bg-zinc-800 border-zinc-700' : 'bg-emerald-50 border-gray-100'}`}>
        <div className="flex items-center space-x-4">
          <button onClick={() => setIsSidebarOpen(true)} className="p-2 hover:bg-black/5 rounded-full transition-colors"><MenuIcon /></button>
          <span className="font-bold text-green-700 dark:text-green-500 hidden sm:inline">T2S Editor</span>
        </div>
        <div className="flex items-center space-x-2">
          <button onClick={toggleTheme} className={`p-2 rounded-full transition-all ${isDarkMode ? 'text-yellow-400 hover:bg-zinc-700' : 'text-zinc-600 hover:bg-emerald-100'}`} title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}>
            {isDarkMode ? <SunIcon /> : <MoonIcon />}
          </button>
          <div className="w-px h-6 bg-gray-300 dark:bg-zinc-700 mx-1"></div>
          <button className="p-2 hover:bg-black/5 rounded-full" title="Check Grammar"><CheckIcon /></button>
          <button className="p-2 hover:bg-black/5 rounded-full" title="Undo"><UndoIcon /></button>
          <button className="p-2 hover:bg-black/5 rounded-full" title="Redo"><RedoIcon /></button>
        </div>
      </header>

      <main className="flex-1 overflow-auto relative p-6">
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Type or paste your text here..." className={`w-full h-full resize-none outline-none text-xl leading-relaxed bg-transparent ${isDarkMode ? 'placeholder-zinc-600' : 'placeholder-gray-400'}`} />
        {isLoading && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
            <div className="flex flex-col items-center space-y-3 bg-white/90 dark:bg-zinc-800/90 p-6 rounded-2xl shadow-2xl backdrop-blur-sm">
              <div className="w-12 h-12 border-4 border-green-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="font-medium text-green-600">Processing Audio...</p>
            </div>
          </div>
        )}
      </main>

      <footer className={`px-4 py-3 border-t flex flex-col md:flex-row items-center justify-between ${isDarkMode ? 'bg-zinc-800 border-zinc-700' : 'bg-emerald-50 border-gray-100'}`}>
        <div className="text-sm font-medium text-gray-500 flex items-center space-x-4 mb-4 md:mb-0">
          <div className="flex flex-col">
            <div className="flex items-center space-x-2">
              <span>{charCount} chars</span>
              <span className="w-px h-3 bg-gray-300"></span>
              <span>{wordCount} words</span>
            </div>
            {audioBufferRef.current && (
              <span className="text-xs text-green-600 font-mono mt-1">{formatTime(playbackPosition)} / {formatTime(audioBufferRef.current.duration)}</span>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-4 md:space-x-6 relative">
          <button className="p-2 text-gray-500 hover:text-green-600 transition-colors" onClick={() => handleSkip(-10)} title="Skip back 10 seconds"><SkipBack10Icon /></button>
          <button className="p-2 text-gray-500 hover:text-red-600 transition-colors" onClick={() => stopAudio(true)} title="Stop playback"><StopIcon /></button>
          <button onClick={playAudio} disabled={isLoading} className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg transform active:scale-95 transition-all ${isLoading ? 'bg-gray-300 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 text-white'}`}>
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button className="p-2 text-gray-500 hover:text-green-600 transition-colors" onClick={() => handleSkip(10)} title="Skip forward 10 seconds"><SkipForward10Icon /></button>
          <div className="w-px h-8 bg-gray-300 dark:bg-zinc-700 mx-2 hidden sm:block"></div>
          <div className="relative">
            <button onClick={() => setIsExportMenuOpen(!isExportMenuOpen)} className="p-2 text-gray-500 hover:text-green-600 transition-colors" title="Export Audio"><DownloadIcon /></button>
            {isExportMenuOpen && (
              <div className={`absolute bottom-full mb-2 right-0 w-44 rounded-xl shadow-2xl border overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200 z-50 ${isDarkMode ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-gray-100'}`}>
                <button onClick={() => handleExport('wav')} className={`w-full text-left px-4 py-3 text-sm font-medium hover:bg-green-600 hover:text-white transition-colors flex items-center justify-between ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}><span>Export as WAV</span><span className="text-[10px] opacity-60">High Qual</span></button>
                <button onClick={() => handleExport('mp3')} className={`w-full text-left px-4 py-3 text-sm font-medium hover:bg-green-600 hover:text-white transition-colors flex items-center justify-between ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}><span>Export as MP3</span><span className="text-[10px] opacity-60">Standard</span></button>
              </div>
            )}
          </div>
          <button onClick={() => setIsSettingsOpen(true)} className="p-2 text-gray-500 hover:text-green-600" title="Settings"><SettingsIcon /></button>
        </div>
        <div className="hidden md:block w-32" />
      </footer>

      {isSettingsOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsSettingsOpen(false)} />
          <div className={`relative w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 ${isDarkMode ? 'bg-zinc-800' : 'bg-white'}`}>
            <div className={`px-6 py-4 border-b flex items-center justify-between ${isDarkMode ? 'border-zinc-700' : 'border-gray-100'}`}>
              <h3 className="text-lg font-bold">Settings</h3>
              <button onClick={() => setIsSettingsOpen(false)} className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-700">✕</button>
            </div>
            
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="border rounded-xl overflow-hidden border-gray-100 dark:border-zinc-700">
                <button onClick={() => toggleSection('voice')} className={`w-full flex items-center justify-between px-4 py-3 font-semibold text-sm transition-colors ${isDarkMode ? 'bg-zinc-700/50 hover:bg-zinc-700' : 'bg-gray-50 hover:bg-gray-100'}`}>
                  <div className="flex items-center space-x-3"><VoiceIcon /><span className="text-green-600">Voice Options</span></div>
                  {expandedSections.voice ? <ChevronUpIcon /> : <ChevronDownIcon />}
                </button>
                {expandedSections.voice && (
                  <div className="p-4 space-y-4 animate-in slide-in-from-top-2 duration-200">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Speech voice</label>
                      <select value={config.voiceName} onChange={(e) => setConfig(prev => ({ ...prev, voiceName: e.target.value as VoiceName }))} className={`w-full p-3 rounded-lg border appearance-none text-sm ${isDarkMode ? 'bg-zinc-700 border-zinc-600' : 'bg-white border-gray-200'}`}>
                        <option value="Kore">Kore (Standard)</option>
                        <option value="Puck">Puck (Fast/Young)</option>
                        <option value="Charon">Charon (Deep/Gravelly)</option>
                        <option value="Fenrir">Fenrir (Professional)</option>
                        <option value="Zephyr">Zephyr (Soft/Friendly)</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              <div className="border rounded-xl overflow-hidden border-gray-100 dark:border-zinc-700">
                <button onClick={() => toggleSection('audio')} className={`w-full flex items-center justify-between px-4 py-3 font-semibold text-sm transition-colors ${isDarkMode ? 'bg-zinc-700/50 hover:bg-zinc-700' : 'bg-gray-50 hover:bg-gray-100'}`}>
                  <div className="flex items-center space-x-3"><SlidersIcon /><span className="text-green-600">Audio Controls</span></div>
                  {expandedSections.audio ? <ChevronUpIcon /> : <ChevronDownIcon />}
                </button>
                {expandedSections.audio && (
                  <div className="p-4 space-y-6 animate-in slide-in-from-top-2 duration-200">
                    <div>
                      <div className="flex justify-between items-center mb-2"><label className="block text-xs font-bold uppercase tracking-wider text-gray-400">Generation speed</label><span className="text-sm font-medium">{config.speechRate}x</span></div>
                      <input type="range" min="0.5" max="3.0" step="0.1" value={config.speechRate} onChange={(e) => setConfig(prev => ({ ...prev, speechRate: parseFloat(e.target.value) }))} className="w-full accent-green-600" />
                    </div>
                    <div>
                      <div className="flex justify-between items-center mb-2"><label className="block text-xs font-bold uppercase tracking-wider text-gray-400">Playback speed (Live)</label><span className="text-sm font-medium">{config.playbackSpeed}x</span></div>
                      <input type="range" min="0.5" max="3.0" step="0.1" value={config.playbackSpeed} onChange={(e) => { const newVal = parseFloat(e.target.value); setConfig(prev => ({ ...prev, playbackSpeed: newVal })); if (sourceRef.current) sourceRef.current.playbackRate.value = newVal; }} className="w-full accent-green-600" />
                    </div>
                    <div>
                      <div className="flex justify-between items-center mb-2"><label className="block text-xs font-bold uppercase tracking-wider text-gray-400">Pitch</label><span className="text-sm font-medium">{config.pitch}</span></div>
                      <input type="range" min="0.5" max="2.0" step="0.1" value={config.pitch} onChange={(e) => setConfig(prev => ({ ...prev, pitch: parseFloat(e.target.value) }))} className="w-full accent-green-600" />
                    </div>
                  </div>
                )}
              </div>

              <div className="border rounded-xl overflow-hidden border-gray-100 dark:border-zinc-700">
                <button onClick={() => toggleSection('appearance')} className={`w-full flex items-center justify-between px-4 py-3 font-semibold text-sm transition-colors ${isDarkMode ? 'bg-zinc-700/50 hover:bg-zinc-700' : 'bg-gray-50 hover:bg-gray-100'}`}>
                  <div className="flex items-center space-x-3"><PaletteIcon /><span className="text-green-600">Appearance</span></div>
                  {expandedSections.appearance ? <ChevronUpIcon /> : <ChevronDownIcon />}
                </button>
                {expandedSections.appearance && (
                  <div className="p-4 space-y-4 animate-in slide-in-from-top-2 duration-200">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Theme mode</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => setConfig(prev => ({ ...prev, theme: ThemeMode.LIGHT }))} className={`p-3 rounded-lg border text-sm font-medium transition-all ${config.theme === ThemeMode.LIGHT ? 'bg-green-600 text-white border-green-600 shadow-md' : 'bg-gray-50 border-gray-200 text-gray-700'}`}>Light</button>
                        <button onClick={() => setConfig(prev => ({ ...prev, theme: ThemeMode.DARK }))} className={`p-3 rounded-lg border text-sm font-medium transition-all ${config.theme === ThemeMode.DARK ? 'bg-green-600 text-white border-green-600 shadow-md' : 'bg-zinc-700 border-zinc-600 text-gray-200'}`}>Dark</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className={`p-4 border-t text-center ${isDarkMode ? 'bg-zinc-900 border-zinc-700' : 'bg-gray-50 border-gray-100'}`}>
              <button onClick={() => setIsSettingsOpen(false)} className="w-full py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-colors shadow-lg">Close Settings</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;