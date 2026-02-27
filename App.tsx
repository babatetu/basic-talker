
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';
import { SessionStatus, TranscriptionEntry } from './types';
import { decode, decodeAudioData, createPcmBlob } from './utils/audioUtils';
import { Visualizer } from './components/Visualizer';
import { Transcript } from './components/Transcript';

const App: React.FC = () => {
  const [status, setStatus] = useState<SessionStatus>(SessionStatus.DISCONNECTED);
  const [isModelTalking, setIsModelTalking] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptionEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Refs for audio processing
  const audioContexts = useRef<{
    input: AudioContext;
    output: AudioContext;
  } | null>(null);
  const nextStartTime = useRef(0);
  const audioSources = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionRef = useRef<any>(null);
  const transcriptionBuffer = useRef<{ user: string; model: string }>({ user: '', model: '' });

  // Initialize Audio Contexts
  const initAudio = async () => {
    if (!audioContexts.current) {
      audioContexts.current = {
        input: new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 }),
        output: new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 }),
      };
    }
    if (audioContexts.current.input.state === 'suspended') {
      await audioContexts.current.input.resume();
    }
    if (audioContexts.current.output.state === 'suspended') {
      await audioContexts.current.output.resume();
    }
  };

  const stopSession = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    audioSources.current.forEach((source) => source.stop());
    audioSources.current.clear();
    setStatus(SessionStatus.DISCONNECTED);
    setIsModelTalking(false);
  }, []);

  const startSession = async () => {
    try {
      setStatus(SessionStatus.CONNECTING);
      setError(null);
      await initAudio();

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            setStatus(SessionStatus.CONNECTED);
            
            // Start streaming microphone
            const inputCtx = audioContexts.current!.input;
            const source = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createPcmBlob(inputData);
              sessionPromise.then((session) => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };

            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
            
            // Store cleanup
            (window as any)._audioCleanup = () => {
              source.disconnect();
              scriptProcessor.disconnect();
              stream.getTracks().forEach(t => t.stop());
            };
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle Audio Output
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio) {
              setIsModelTalking(true);
              const outputCtx = audioContexts.current!.output;
              nextStartTime.current = Math.max(nextStartTime.current, outputCtx.currentTime);
              
              const buffer = await decodeAudioData(decode(base64Audio), outputCtx, 24000, 1);
              const source = outputCtx.createBufferSource();
              source.buffer = buffer;
              source.connect(outputCtx.destination);
              
              source.onended = () => {
                audioSources.current.delete(source);
                if (audioSources.current.size === 0) setIsModelTalking(false);
              };

              source.start(nextStartTime.current);
              nextStartTime.current += buffer.duration;
              audioSources.current.add(source);
            }

            // Handle Interruptions
            if (message.serverContent?.interrupted) {
              audioSources.current.forEach((s) => s.stop());
              audioSources.current.clear();
              nextStartTime.current = 0;
              setIsModelTalking(false);
            }

            // Handle Transcriptions
            if (message.serverContent?.inputTranscription) {
              transcriptionBuffer.current.user += message.serverContent.inputTranscription.text;
            }
            if (message.serverContent?.outputTranscription) {
              transcriptionBuffer.current.model += message.serverContent.outputTranscription.text;
            }

            if (message.serverContent?.turnComplete) {
              const userText = transcriptionBuffer.current.user.trim();
              const modelText = transcriptionBuffer.current.model.trim();
              
              if (userText || modelText) {
                setTranscript(prev => [
                  ...prev,
                  ...(userText ? [{ type: 'user', text: userText, timestamp: Date.now() } as TranscriptionEntry] : []),
                  ...(modelText ? [{ type: 'model', text: modelText, timestamp: Date.now() + 1 } as TranscriptionEntry] : [])
                ]);
              }
              
              transcriptionBuffer.current = { user: '', model: '' };
            }
          },
          onerror: (e) => {
            console.error('Gemini Live Error:', e);
            setError('A connection error occurred. Please try again.');
            stopSession();
          },
          onclose: () => {
            setStatus(SessionStatus.DISCONNECTED);
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
          },
          systemInstruction: 'You are "Talker", a helpful, friendly, and very concise voice assistant. Respond naturally and keep your answers brief (ideally 1-2 sentences) to maintain a fast conversational flow.',
        },
      });

      sessionRef.current = await sessionPromise;
    } catch (err: any) {
      console.error('Failed to start session:', err);
      setError(err.message || 'Could not access microphone or start AI session.');
      setStatus(SessionStatus.DISCONNECTED);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopSession();
      if ((window as any)._audioCleanup) (window as any)._audioCleanup();
    };
  }, [stopSession]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-between p-6 md:p-12 max-w-4xl mx-auto">
      {/* Header */}
      <header className="w-full text-center space-y-2">
        <h1 className="text-4xl font-bold tracking-tight gradient-text">Basic Talker</h1>
        <p className="text-zinc-400 text-sm md:text-base">
          Real-time voice conversation powered by Gemini 2.5
        </p>
      </header>

      {/* Main interaction zone */}
      <main className="flex-1 w-full flex flex-col items-center justify-center space-y-8 py-12">
        <div className="relative w-full max-w-sm aspect-square flex items-center justify-center">
          <div className={`absolute inset-0 rounded-full blur-3xl opacity-20 transition-all duration-1000 ${
            status === SessionStatus.CONNECTED 
              ? isModelTalking ? 'bg-blue-500 scale-110' : 'bg-emerald-500 scale-100'
              : 'bg-zinc-800 scale-90'
          }`} />
          
          <div className="z-10 w-full">
            <Visualizer 
              isActive={status === SessionStatus.CONNECTED} 
              isModelTalking={isModelTalking} 
            />
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-2 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="w-full bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6 backdrop-blur-sm shadow-2xl">
          <Transcript entries={transcript} />
        </div>
      </main>

      {/* Footer / Controls */}
      <footer className="w-full max-w-md flex flex-col items-center gap-6 sticky bottom-6 bg-[#09090b]/80 backdrop-blur-md p-4 rounded-3xl">
        <button
          onClick={status === SessionStatus.CONNECTED ? stopSession : startSession}
          disabled={status === SessionStatus.CONNECTING}
          className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 transform active:scale-95 shadow-xl ${
            status === SessionStatus.CONNECTED
              ? 'bg-zinc-100 text-zinc-900 hover:bg-white'
              : status === SessionStatus.CONNECTING
                ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-500 hover:scale-105 shadow-blue-600/20'
          }`}
        >
          {status === SessionStatus.CONNECTING ? (
            <div className="w-6 h-6 border-2 border-zinc-500 border-t-white rounded-full animate-spin" />
          ) : status === SessionStatus.CONNECTED ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" x2="12" y1="19" y2="22" />
            </svg>
          )}
        </button>
        
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${
            status === SessionStatus.CONNECTED ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-700'
          }`} />
          <span className="text-xs font-medium uppercase tracking-widest text-zinc-500">
            {status === SessionStatus.CONNECTED 
              ? isModelTalking ? 'Gemini is speaking...' : 'Listening to you...'
              : status.replace('_', ' ')}
          </span>
        </div>
      </footer>
    </div>
  );
};

export default App;
