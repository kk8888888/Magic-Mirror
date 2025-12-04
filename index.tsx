import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI } from "@google/genai";
import { createRoot } from 'react-dom/client';

const MODEL_IMAGE_GEN = 'gemini-2.5-flash-image';
const MODEL_TEXT_GEN = 'gemini-2.5-flash';

// --- Shared Constants ---

// Background Presets (for Live Mode)
const BACKGROUND_PRESETS = [
  "Modern Studio",
  "Luxury Penthouse",
  "Tropical Beach",
  "Cyberpunk City",
  "Vintage Library",
  "Red Carpet Event",
  "Snowy Mountain",
  "Futuristic Space Station",
  "Cozy Coffee Shop",
  "Enchanted Forest"
];

// Aesthetic Presets (for Live Mode)
const AESTHETIC_PRESETS = [
  "Cinematic",
  "Minimalist",
  "Retro Futurism",
  "Steampunk",
  "Art Deco",
  "Tropical Grunge",
  "Vaporwave",
  "High Fashion",
  "Cybernetic",
  "Vintage Film"
];

// Color Palettes (for Photo Mode)
const COLOR_PALETTES = [
  { name: "Earth Tones", colors: ["#A0522D", "#D2B48C", "#556B2F"], prompt: "earthy tones like beige, brown, and olive" },
  { name: "Monochrome", colors: ["#000000", "#808080", "#FFFFFF"], prompt: "a monochrome palette of black, white, and grey" },
  { name: "Pastel Dream", colors: ["#FFB7B2", "#B5EAD7", "#E2F0CB"], prompt: "soft pastel colors like mint, lavender, and blush" },
  { name: "Vibrant Pop", colors: ["#FF0055", "#FFD700", "#0055FF"], prompt: "vibrant, high-contrast colors like neon pink, yellow, and electric blue" },
  { name: "Oceanic", colors: ["#000080", "#4169E1", "#87CEEB"], prompt: "cool ocean tones like navy, teal, and sky blue" }
];

// --- Global Types for Face API ---
declare global {
  interface Window {
    blazeface: any;
    tf: any;
  }
}

// --- Voice Assistant Hook & Component ---

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

const useVoiceAssistant = (onCommand: (text: string) => void) => {
  const [isListening, setIsListening] = useState(false);
  const [lastCommand, setLastCommand] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const onCommandRef = useRef(onCommand);

  useEffect(() => {
    onCommandRef.current = onCommand;
  }, [onCommand]);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.lang = 'en-US';
      recognition.interimResults = false;

      recognition.onstart = () => setIsListening(true);
      
      recognition.onresult = (event: any) => {
        const text = event.results[0][0].transcript;
        setLastCommand(text);
        onCommandRef.current(text);
        setIsListening(false);
      };

      recognition.onerror = (event: any) => {
        console.error("Speech recognition error", event.error);
        setIsListening(false);
      };

      recognition.onend = () => setIsListening(false);

      recognitionRef.current = recognition;
    }
  }, []);

  const toggleListening = useCallback(() => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      setLastCommand(null);
      try {
        recognitionRef.current?.start();
      } catch (e) {
        console.error("Failed to start recognition", e);
      }
    }
  }, [isListening]);

  return { isListening, toggleListening, hasSupport: !!(window.SpeechRecognition || window.webkitSpeechRecognition), lastCommand };
};

const VoiceControl = ({ onCommand, hints }: { onCommand: (text: string) => void, hints?: string[] }) => {
  const { isListening, toggleListening, hasSupport, lastCommand } = useVoiceAssistant(onCommand);

  if (!hasSupport) return null;

  return (
    <div className="fixed bottom-6 left-6 z-50 flex items-end gap-4">
      <div className="flex flex-col items-start gap-2">
        {isListening && (
           <div className="bg-slate-900/90 text-white px-4 py-2 rounded-lg border border-red-500/50 shadow-xl animate-fade-in-up">
              <div className="flex items-center gap-2 text-sm font-medium">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                  </span>
                  Listening...
              </div>
              {hints && (
                  <div className="text-xs text-slate-400 mt-1">Try: "{hints[0]}"</div>
              )}
           </div>
        )}
        {lastCommand && !isListening && (
            <div className="bg-slate-900/90 text-purple-300 px-4 py-2 rounded-lg border border-purple-500/30 shadow-xl animate-fade-in-up delay-75">
                <i className="fa-solid fa-microphone-lines mr-2"></i>
                "{lastCommand}"
            </div>
        )}
      </div>

      <button
        onClick={toggleListening}
        className={`w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-all hover:scale-105 border-2 ${isListening ? 'bg-red-500 border-red-400 animate-pulse text-white' : 'bg-slate-800 border-slate-600 text-slate-300 hover:text-white hover:border-purple-400'}`}
        title="Voice Control"
      >
        <i className={`fa-solid ${isListening ? 'fa-microphone-slash' : 'fa-microphone'} text-xl`}></i>
      </button>
    </div>
  );
};

// --- Live Stylist Component ---

function LiveStylist() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedLook, setGeneratedLook] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  
  // Face Detection State
  const [faceModel, setFaceModel] = useState<any>(null);
  const [isFaceDetected, setIsFaceDetected] = useState(false);
  
  // Background/Scene Controls State
  const [showSceneControls, setShowSceneControls] = useState(false);
  const [customBgPrompt, setCustomBgPrompt] = useState("");
  const [bgInputError, setBgInputError] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [selectedAesthetic, setSelectedAesthetic] = useState<string | null>(null);

  const startCamera = useCallback(async () => {
    try {
      setCameraError(null);
      
      // Stop any existing streams first
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err: any) {
      console.error("Error accessing camera:", err);
      let errorMessage = "Could not access camera.";
      
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          errorMessage = "Camera permission denied. Please allow camera access in your browser address bar.";
      } else if (err.name === 'NotFoundError') {
          errorMessage = "No camera found on this device.";
      } else if (err.name === 'NotReadableError') {
          errorMessage = "Camera is currently in use by another application.";
      }
      
      setCameraError(errorMessage);
    }
  }, []);

  useEffect(() => {
    startCamera();
    
    // Cleanup on unmount
    return () => {
        if (videoRef.current && videoRef.current.srcObject) {
            const stream = videoRef.current.srcObject as MediaStream;
            stream.getTracks().forEach(track => track.stop());
        }
    };
  }, [startCamera]);

  // Load Face Detection Model
  useEffect(() => {
    let intervalId: any;
    const loadModel = async () => {
        if (window.blazeface) {
            try {
                const model = await window.blazeface.load();
                setFaceModel(model);
                clearInterval(intervalId);
            } catch (e) {
                console.error("Error loading blazeface", e);
            }
        }
    };
    
    // Check if script is loaded every 100ms
    intervalId = setInterval(loadModel, 100);
    return () => clearInterval(intervalId);
  }, []);

  // Face Detection Loop
  useEffect(() => {
    let animationId: number;
    
    const detectFaces = async () => {
        if (faceModel && videoRef.current && videoRef.current.readyState === 4 && canvasRef.current && !cameraError) {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            const ctx = canvas.getContext('2d');
            
            // Sync canvas size
            if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
            }

            try {
                const predictions = await faceModel.estimateFaces(video, false);
                
                if (ctx) {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    
                    if (predictions.length > 0) {
                        setIsFaceDetected(true);
                        predictions.forEach((pred: any) => {
                             const start = pred.topLeft as [number, number];
                             const end = pred.bottomRight as [number, number];
                             const size = [end[0] - start[0], end[1] - start[1]];
                             
                             // Draw Bounding Box
                             ctx.strokeStyle = '#a855f7'; // purple-500
                             ctx.lineWidth = 4;
                             
                             // Create corner bracket effect
                             const lineLen = Math.min(size[0], size[1]) * 0.2;
                             
                             ctx.beginPath();
                             // Top Left
                             ctx.moveTo(start[0], start[1] + lineLen);
                             ctx.lineTo(start[0], start[1]);
                             ctx.lineTo(start[0] + lineLen, start[1]);
                             
                             // Top Right
                             ctx.moveTo(end[0] - lineLen, start[1]);
                             ctx.lineTo(end[0], start[1]);
                             ctx.lineTo(end[0], start[1] + lineLen);
                             
                             // Bottom Right
                             ctx.moveTo(end[0], end[1] - lineLen);
                             ctx.lineTo(end[0], end[1]);
                             ctx.lineTo(end[0] - lineLen, end[1]);
                             
                             // Bottom Left
                             ctx.moveTo(start[0] + lineLen, end[1]);
                             ctx.lineTo(start[0], end[1]);
                             ctx.lineTo(start[0], end[1] - lineLen);
                             
                             ctx.stroke();
                             
                             // Label
                             ctx.fillStyle = '#a855f7';
                             ctx.font = 'bold 14px sans-serif';
                             ctx.fillText("Face Identified", start[0], start[1] - 10);
                        });
                    } else {
                        setIsFaceDetected(false);
                    }
                }
            } catch (e) {
                // ignore frame errors
            }
        }
        animationId = requestAnimationFrame(detectFaces);
    };

    if (faceModel) {
        detectFaces();
    }
    return () => cancelAnimationFrame(animationId);
  }, [faceModel, cameraError]);

  const validatePrompt = (text: string) => {
    if (!text) return null;
    if (text.length > 100) return "Keep it short! Max 100 characters.";
    if (/[^a-zA-Z0-9\s,.-]/.test(text)) return "Avoid special characters. Use letters and numbers.";
    const unsafeWords = ["naked", "nude", "sex", "kill", "blood", "weapon", "violence", "porn"];
    if (unsafeWords.some(w => text.toLowerCase().includes(w))) return "Please keep the prompt safe and appropriate.";
    return null;
  };

  const handleBgInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCustomBgPrompt(val);
    setSelectedPreset(null);
    setBgInputError(validatePrompt(val));
  };

  const generateLook = async (type: 'hair' | 'outfit' | 'background', customDetail?: string, aesthetic?: string) => {
    setIsGenerating(true);

    try {
        let base64Data = "";

        // Cumulative Logic: Use existing generated look if available, otherwise capture from camera
        if (generatedLook) {
            base64Data = generatedLook.split(',')[1];
        } else if (videoRef.current) {
            const canvas = document.createElement('canvas');
            canvas.width = videoRef.current.videoWidth;
            canvas.height = videoRef.current.videoHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            
            ctx.drawImage(videoRef.current, 0, 0);
            base64Data = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
        } else {
            return;
        }

        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        let prompt = "";
        
        if (type === 'hair') {
            prompt = "Generate a photorealistic image of this person with a completely new, flattering hairstyle. Keep their face, identity, clothing, and background EXACTLY the same. Only change the hair.";
        } else if (type === 'outfit') {
            prompt = "Generate a photorealistic image of this person wearing a new, fashionable outfit that suits them. Keep their face, hairstyle, pose, and background EXACTLY the same. Only change the clothes.";
        } else if (type === 'background') {
            const location = customDetail || 'modern studio';
            const styleDirective = aesthetic ? `The visual style and art direction must strictly follow a "${aesthetic}" aesthetic.` : "Use a cinematic, high-quality visual style.";
            
            prompt = `
            Role: Expert Visual Director and Stylist.
            Task: Transport the person in the image into a completely new scene ("${location}") with a cohesive look.

            Directives:
            1. **Scene Transformation**: Replace the background entirely with a photorealistic depiction of "${location}".
            2. **Contextual Styling**: CHANGE the person's hairstyle and outfit to be perfectly contextually appropriate for the "${location}". 
               - Example: If the scene is a "Snowy Mountain", they should wear winter gear. If "Red Carpet", a gala gown/suit.
               - ${styleDirective}
            3. **Visual Integration**: Ensure the lighting, shadows, and color temperature on the person match the new environment perfectly.
            4. **Identity Preservation**: CRITICAL. Keep the person's face, facial features, expression, and body pose EXACTLY as they are.
            `;
        }

        const response = await ai.models.generateContent({
            model: MODEL_IMAGE_GEN,
            contents: {
                parts: [
                    { inlineData: { mimeType: 'image/jpeg', data: base64Data } },
                    { text: prompt }
                ]
            }
        });

        if (response.candidates?.[0]?.content?.parts) {
            for (const part of response.candidates[0].content.parts) {
                 if (part.inlineData) {
                    setGeneratedLook(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
                    break;
                 }
            }
        }
    } catch (e) {
        console.error("Gen error", e);
    } finally {
        setIsGenerating(false);
    }
  }

  const handleReset = () => {
      setGeneratedLook(null);
  };

  const handleSceneGenerate = () => {
    if (bgInputError) return;
    const location = customBgPrompt.trim() || selectedPreset || "Modern Studio";
    generateLook('background', location, selectedAesthetic || undefined);
  };

  // Voice Command Handler
  const handleVoiceCommand = (command: string) => {
    const lower = command.toLowerCase();
    
    if (lower.includes('hair') || lower.includes('hairstyle')) {
        generateLook('hair');
    } else if (lower.includes('outfit') || lower.includes('clothes') || lower.includes('dress') || lower.includes('suit')) {
        generateLook('outfit');
    } else if (lower.includes('reset') || lower.includes('clear')) {
        handleReset();
    } else if (lower.includes('background') || lower.includes('scene')) {
        // Attempt to extract the location. E.g. "change background to snowy mountain"
        const keywords = ['background', 'scene', 'to'];
        let location = lower;
        
        // Simple strategy: find the last keyword and take everything after it
        let lastIndex = -1;
        keywords.forEach(k => {
            const idx = lower.lastIndexOf(k);
            if (idx > lastIndex) lastIndex = idx + k.length;
        });

        if (lastIndex > 0 && lastIndex < lower.length) {
            location = lower.substring(lastIndex).trim();
            const error = validatePrompt(location);
            if (!error) {
                setCustomBgPrompt(location);
                generateLook('background', location);
            }
        }
    }
  };

  return (
    <div className="max-w-6xl mx-auto animate-fade-in relative">
        <VoiceControl 
            onCommand={handleVoiceCommand} 
            hints={["Change hairstyle", "New outfit", "Change background to Paris", "Reset"]}
        />

        {/* Viewport Area */}
        <div className="flex flex-col lg:flex-row gap-6 mb-8 justify-center items-start">
            {/* Live Camera Feed */}
            <div className={`relative group w-full max-w-[500px] aspect-square bg-black rounded-2xl overflow-hidden shadow-2xl border border-slate-700 ${generatedLook ? 'hidden lg:block opacity-50' : ''}`}>
                
                {/* Error Overlay */}
                {cameraError ? (
                     <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 text-center p-6 z-20">
                        <i className="fa-solid fa-video-slash text-4xl text-red-500 mb-4"></i>
                        <h3 className="text-xl font-bold text-white mb-2">Camera Access Error</h3>
                        <p className="text-slate-400 mb-6 max-w-xs mx-auto">{cameraError}</p>
                        <button 
                            onClick={startCamera}
                            className="px-6 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg font-semibold transition-colors flex items-center gap-2"
                        >
                            <i className="fa-solid fa-rotate-right"></i>
                            Retry Access
                        </button>
                     </div>
                ) : (
                    <video 
                        ref={videoRef} 
                        autoPlay 
                        playsInline 
                        muted 
                        className="w-full h-full object-cover transform scale-x-[-1]" 
                    />
                )}
                
                {/* Face Detection Overlay - Only show if camera is working */}
                {!cameraError && (
                    <canvas 
                        ref={canvasRef}
                        className="absolute top-0 left-0 w-full h-full pointer-events-none transform scale-x-[-1]"
                    />
                )}
                
                <div className="absolute top-4 left-4 px-3 py-1 bg-red-500/90 rounded-full text-xs font-bold tracking-wider flex items-center gap-2">
                    <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                    LIVE SOURCE
                </div>
                {!isFaceDetected && !generatedLook && !cameraError && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                         <div className="bg-black/60 backdrop-blur-sm text-white px-6 py-4 rounded-xl border border-slate-500/50 flex flex-col items-center gap-2">
                            <i className="fa-solid fa-expand text-2xl animate-pulse"></i>
                            <span className="font-semibold">Position face in frame</span>
                         </div>
                    </div>
                )}
            </div>

            {/* AI Generated Result */}
            {generatedLook && (
                <div className="relative group w-full max-w-[500px] aspect-square bg-black rounded-2xl overflow-hidden shadow-2xl border-2 border-purple-500/50">
                     <img src={generatedLook} alt="Generated Look" className="w-full h-full object-cover" />
                     <div className="absolute top-4 left-4 px-3 py-1 bg-purple-600/90 rounded-full text-xs font-bold tracking-wider flex items-center gap-2">
                        <i className="fa-solid fa-wand-magic-sparkles"></i>
                        AI GENERATED
                    </div>
                    <div className="absolute top-4 right-4 flex gap-2">
                        <button 
                            onClick={handleReset}
                            className="bg-slate-900/80 text-white p-2 rounded-full hover:bg-red-500/80 transition-colors shadow-lg"
                            title="Reset to Camera"
                        >
                            <i className="fa-solid fa-rotate-left"></i>
                        </button>
                    </div>
                    <button 
                        onClick={() => {
                            const link = document.createElement('a');
                            link.href = generatedLook;
                            link.download = `ai-style-live-${Date.now()}.png`;
                            link.click();
                        }}
                        className="absolute bottom-4 right-4 bg-white text-slate-900 p-3 rounded-full hover:bg-slate-200 transition-colors shadow-lg"
                    >
                        <i className="fa-solid fa-download"></i>
                    </button>
                </div>
            )}
        </div>

        {/* Controls Section */}
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-3xl p-6 border border-slate-700 shadow-xl">
            <div className="flex flex-wrap gap-4 mb-8 justify-center">
                <button 
                    onClick={() => { setShowSceneControls(false); generateLook('hair'); }} 
                    disabled={isGenerating || (!isFaceDetected && !generatedLook) || !!cameraError}
                    className="px-6 py-3 rounded-xl font-semibold bg-slate-700 hover:bg-slate-600 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <i className="fa-solid fa-scissors"></i> {generatedLook ? '+ Merge Hairstyle' : 'New Hairstyle'}
                </button>
                <button 
                    onClick={() => { setShowSceneControls(false); generateLook('outfit'); }}
                    disabled={isGenerating || (!isFaceDetected && !generatedLook) || !!cameraError}
                    className="px-6 py-3 rounded-xl font-semibold bg-slate-700 hover:bg-slate-600 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <i className="fa-solid fa-shirt"></i> {generatedLook ? '+ Merge Outfit' : 'New Outfit'}
                </button>
                <button 
                    onClick={() => setShowSceneControls(!showSceneControls)}
                    disabled={(!isFaceDetected && !generatedLook) || !!cameraError}
                    className={`px-6 py-3 rounded-xl font-semibold transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${showSceneControls ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/30' : 'bg-slate-700 hover:bg-slate-600'}`}
                >
                    <i className="fa-solid fa-mountain-sun"></i> Change Scene & Style
                </button>
            </div>

            {/* Scene Controls */}
            {showSceneControls && (
                <div className="animate-fade-in-up space-y-6 max-w-4xl mx-auto bg-slate-900/50 p-6 rounded-2xl border border-slate-700/50">
                    <div className="space-y-3">
                        <label className="text-sm font-medium text-slate-400 uppercase tracking-wider">Step 1: Where do you want to be?</label>
                        <div className="flex flex-col md:flex-row gap-3">
                            <div className="flex-1 relative">
                                <input 
                                    type="text" 
                                    placeholder="Describe a custom place..." 
                                    value={customBgPrompt}
                                    onChange={handleBgInputChange}
                                    className={`w-full bg-slate-800 border ${bgInputError ? 'border-red-500 focus:ring-red-500' : 'border-slate-600 focus:ring-purple-500'} rounded-lg px-4 py-3 outline-none placeholder-slate-500 transition-all`}
                                />
                                {bgInputError && <div className="text-red-400 text-xs mt-1 ml-1 flex items-center gap-1"><i className="fa-solid fa-circle-exclamation"></i> {bgInputError}</div>}
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-2">
                            {BACKGROUND_PRESETS.map(preset => (
                                <button
                                    key={preset}
                                    onClick={() => { setSelectedPreset(preset); setCustomBgPrompt(""); setBgInputError(null); }}
                                    className={`px-3 py-1.5 rounded-full text-sm transition-all ${selectedPreset === preset ? 'bg-blue-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'}`}
                                >
                                    {preset}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="space-y-3">
                        <label className="text-sm font-medium text-slate-400 uppercase tracking-wider">Step 2: Choose an Art Style</label>
                        <div className="flex flex-wrap gap-2">
                             {AESTHETIC_PRESETS.map(style => (
                                <button
                                    key={style}
                                    onClick={() => setSelectedAesthetic(selectedAesthetic === style ? null : style)}
                                    className={`px-3 py-1.5 rounded-full text-sm border transition-all ${selectedAesthetic === style ? 'bg-purple-600 border-purple-500 text-white' : 'bg-transparent border-slate-600 hover:border-slate-400 text-slate-400'}`}
                                >
                                    {style}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="pt-4 border-t border-slate-700">
                        <button 
                            onClick={handleSceneGenerate}
                            disabled={isGenerating || (!customBgPrompt && !selectedPreset) || !!bgInputError}
                            className="w-full py-4 rounded-xl font-bold text-lg bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 transition-all shadow-lg shadow-purple-900/20 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-3"
                        >
                            {isGenerating ? <i className="fa-solid fa-circle-notch fa-spin"></i> : <i className="fa-solid fa-wand-magic-sparkles"></i>}
                            Transform Scene & Style
                        </button>
                    </div>
                </div>
            )}
            {isGenerating && !showSceneControls && (
                <div className="text-center mt-4 animate-pulse text-purple-400">
                    <i className="fa-solid fa-circle-notch fa-spin mr-2"></i> Generating...
                </div>
            )}
        </div>
    </div>
  );
}

// --- Photo Analysis Component ---

interface RatingResult {
    score: number;
    title: string;
    critique: string;
    suggestions: string[];
}

function PhotoAnalysis() {
  const [fileData, setFileData] = useState<string | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activePalette, setActivePalette] = useState<string | null>(null);
  const [rating, setRating] = useState<RatingResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1];
        setFileData(base64);
        setGeneratedImage(null);
        setActivePalette(null);
        setRating(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const transformImage = async (type: 'outfit' | 'hair' | 'refine', options?: { palette?: { name: string, prompt: string }, tips?: string[] }) => {
    if (!fileData) return;
    setIsGenerating(true);
    
    // Reset palette state if not using palette
    if (options?.palette) setActivePalette(options.palette.name);
    else setActivePalette(null);

    // Cumulative Logic: Use generated image if available, else original
    const sourceImage = generatedImage ? generatedImage.split(',')[1] : fileData;
    
    let prompt = "";
    
    if (type === 'refine' && options?.tips) {
         prompt = `
            Role: Expert Personal Stylist.
            Task: Improve the person's appearance based on specific feedback.
            Directives:
            1. Keep the person's face, identity, pose, and background EXACTLY the same. Identity preservation is critical.
            2. Implement the following style adjustments: ${options.tips.join('. ')}.
            3. Ensure the overall styling (outfit and hair) is high-quality and photorealistic.
        `;
    } else if (type === 'outfit') {
        if (options?.palette) {
            prompt = `
            Role: Fashion Colorist.
            Task: Recolor the person's outfit in this image.
            Directives:
            1. Keep the clothing design, style, folds, and texture EXACTLY the same.
            2. Keep the person's identity, pose, hairstyle, and background EXACTLY the same.
            3. Change the COLOR of the outfit to a "${options.palette.name}" palette (${options.palette.prompt}).
            `;
        } else {
            prompt = "Generate a photorealistic image of this person wearing a stylish, high-fashion new outfit. Keep their face, hairstyle, pose, and background EXACTLY the same. Only change the clothes.";
        }
    } else if (type === 'hair') {
        prompt = "Generate a photorealistic image of this person with a completely new, flattering hairstyle that suits their face shape. Keep their face, identity, outfit, and background EXACTLY the same. Only change the hair.";
    }

    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
            model: MODEL_IMAGE_GEN,
            contents: {
                parts: [
                    { inlineData: { mimeType: 'image/jpeg', data: sourceImage } },
                    { text: prompt }
                ]
            }
        });

        if (response.candidates?.[0]?.content?.parts) {
            for (const part of response.candidates[0].content.parts) {
                 if (part.inlineData) {
                    setGeneratedImage(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
                    break;
                 }
            }
        }
    } catch (e) {
        console.error("Gen error", e);
    } finally {
        setIsGenerating(false);
    }
  };

  const rateStyle = async () => {
      if (!fileData) return;
      setIsGenerating(true);
      setRating(null);

      // Analyze the currently visible image (generated or original)
      const sourceImage = generatedImage ? generatedImage.split(',')[1] : fileData;

      try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
            model: MODEL_TEXT_GEN,
            contents: {
                parts: [
                    { inlineData: { mimeType: 'image/jpeg', data: sourceImage } },
                    { text: `
                        You are a strict but helpful fashion stylist. Analyze the person in this image.
                        Return a valid JSON object with the following structure:
                        {
                            "score": number (0-100),
                            "title": string (a catchy 3-word summary of the look),
                            "critique": string (1-2 sentences strictly evaluating the current style),
                            "suggestions": string[] (array of 3 specific, actionable tips to improve hair or outfit)
                        }
                        Do not return markdown formatting, just the JSON string.
                    ` }
                ]
            }
        });

        const text = response.text;
        if (text) {
            // Clean up code blocks if present
            const jsonStr = text.replace(/```json|```/g, '').trim();
            const result = JSON.parse(jsonStr) as RatingResult;
            setRating(result);
        }
      } catch (e) {
          console.error("Rating error", e);
      } finally {
          setIsGenerating(false);
      }
  }

  const handleDismissSuggestion = (index: number) => {
    if (!rating) return;
    const newSuggestions = [...rating.suggestions];
    newSuggestions.splice(index, 1);
    setRating({ ...rating, suggestions: newSuggestions });
  };

  // Voice Command Handler
  const handleVoiceCommand = (command: string) => {
    const lower = command.toLowerCase();

    if (lower.includes('hair')) {
        transformImage('hair');
    } else if (lower.includes('outfit') || lower.includes('clothes')) {
        transformImage('outfit');
    } else if (lower.includes('rate') || lower.includes('score') || lower.includes('critique')) {
        rateStyle();
    } else if (lower.includes('recolor') || lower.includes('color')) {
        // Find matching palette
        const foundPalette = COLOR_PALETTES.find(p => lower.includes(p.name.toLowerCase()));
        if (foundPalette) {
            transformImage('outfit', { palette: foundPalette });
        }
    }
  };

  return (
    <div className="max-w-6xl mx-auto animate-fade-in relative">
        <VoiceControl 
            onCommand={handleVoiceCommand} 
            hints={["Change hair", "Rate my style", "Recolor to Pastel Dream"]}
        />

        <div className="bg-slate-800/50 backdrop-blur-sm rounded-3xl p-8 border border-slate-700 shadow-xl mb-8">
            {!fileData ? (
                <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="border-3 border-dashed border-slate-600 rounded-2xl p-12 text-center cursor-pointer hover:bg-slate-700/50 hover:border-purple-500 transition-all group"
                >
                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                    <div className="w-20 h-20 bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                        <i className="fa-solid fa-cloud-arrow-up text-3xl text-purple-400"></i>
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">Upload your photo</h3>
                    <p className="text-slate-400">Tap to browse or drop an image here</p>
                </div>
            ) : (
                <div className="space-y-8">
                    {/* Viewport */}
                    <div className="flex flex-col lg:flex-row gap-8 justify-center items-start">
                        {/* Image Display */}
                        <div className="relative group w-full max-w-[400px]">
                            <div className={`aspect-[3/4] rounded-2xl overflow-hidden bg-black border-2 ${generatedImage ? 'border-purple-500 shadow-[0_0_30px_rgba(168,85,247,0.2)]' : 'border-slate-700'}`}>
                                <img src={generatedImage ? generatedImage : `data:image/jpeg;base64,${fileData}`} className="w-full h-full object-cover" alt="Subject" />
                            </div>
                            
                            <div className="absolute top-4 left-4 px-3 py-1 bg-slate-900/80 rounded-full text-xs font-bold text-white flex items-center gap-2">
                                {generatedImage ? (
                                    <><i className="fa-solid fa-wand-magic-sparkles text-purple-400"></i> AI EDITED</>
                                ) : (
                                    <><i className="fa-regular fa-image"></i> ORIGINAL</>
                                )}
                            </div>
                            
                            <button 
                                onClick={() => { setFileData(null); setGeneratedImage(null); setRating(null); }}
                                className="absolute top-4 right-4 w-8 h-8 bg-slate-900/80 rounded-full flex items-center justify-center hover:bg-red-500 transition-colors text-white"
                                title="Remove Image"
                            >
                                <i className="fa-solid fa-xmark"></i>
                            </button>

                            {generatedImage && (
                                <button 
                                    onClick={() => setGeneratedImage(null)}
                                    className="absolute top-4 right-14 w-8 h-8 bg-slate-900/80 rounded-full flex items-center justify-center hover:bg-slate-700 transition-colors text-white"
                                    title="Undo Changes"
                                >
                                    <i className="fa-solid fa-rotate-left"></i>
                                </button>
                            )}

                             {generatedImage && (
                                <button 
                                    onClick={() => {
                                        const link = document.createElement('a');
                                        link.href = generatedImage!;
                                        link.download = `ai-style-photo-${Date.now()}.png`;
                                        link.click();
                                    }}
                                    className="absolute bottom-4 right-4 bg-white text-slate-900 p-3 rounded-full hover:bg-slate-200 transition-colors shadow-lg"
                                >
                                    <i className="fa-solid fa-download"></i>
                                </button>
                            )}
                        </div>

                        {/* Controls & Rating Panel */}
                        <div className="flex-1 w-full max-w-lg space-y-6">
                            
                            {/* Actions Toolbar */}
                            <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-700/50">
                                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Style Actions</h3>
                                <div className="grid grid-cols-2 gap-3">
                                    <button 
                                        onClick={() => transformImage('hair')}
                                        disabled={isGenerating}
                                        className="py-3 px-4 bg-slate-800 hover:bg-slate-700 rounded-xl font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                    >
                                        <i className="fa-solid fa-scissors text-blue-400"></i>
                                        {generatedImage ? 'Change Hair again' : 'New Hairstyle'}
                                    </button>
                                    <button 
                                        onClick={() => transformImage('outfit')}
                                        disabled={isGenerating}
                                        className="py-3 px-4 bg-slate-800 hover:bg-slate-700 rounded-xl font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                    >
                                        <i className="fa-solid fa-shirt text-purple-400"></i>
                                        {generatedImage ? 'Change Outfit again' : 'New Outfit'}
                                    </button>
                                    <button 
                                        onClick={rateStyle}
                                        disabled={isGenerating}
                                        className="col-span-2 py-3 px-4 bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-500 hover:to-orange-500 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 shadow-lg disabled:opacity-50"
                                    >
                                        <i className="fa-solid fa-star"></i>
                                        Rate & Critique Style
                                    </button>
                                </div>
                            </div>
                            
                             {/* Rating Results */}
                             {rating && (
                                <div className="animate-fade-in-up bg-slate-900/80 p-6 rounded-2xl border border-yellow-500/30 relative overflow-hidden">
                                    <div className="absolute top-0 right-0 p-4 opacity-10">
                                        <i className="fa-solid fa-quote-right text-6xl"></i>
                                    </div>
                                    <div className="flex items-center gap-4 mb-4">
                                        <div className={`text-4xl font-black ${rating.score > 80 ? 'text-green-400' : rating.score > 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                                            {rating.score}
                                        </div>
                                        <div>
                                            <div className="text-xs text-slate-400 uppercase tracking-wider">Style Score</div>
                                            <div className="text-lg font-bold text-white leading-none">{rating.title}</div>
                                        </div>
                                    </div>
                                    <p className="text-slate-300 italic mb-6">"{rating.critique}"</p>
                                    
                                    <div className="space-y-2">
                                        <div className="text-xs font-bold text-slate-500 uppercase flex justify-between items-center">
                                            <span>Suggestions</span>
                                            <span className="text-[10px] font-normal text-slate-400">Dismiss what you don't like</span>
                                        </div>
                                        {rating.suggestions.map((tip, idx) => (
                                            <div key={idx} className="flex items-start gap-2 text-sm text-slate-200 group">
                                                <i className="fa-solid fa-check text-green-500 mt-1 shrink-0"></i>
                                                <span className="flex-1">{tip}</span>
                                                <button 
                                                    onClick={() => handleDismissSuggestion(idx)}
                                                    className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-opacity px-2"
                                                    title="Dismiss suggestion"
                                                >
                                                    <i className="fa-solid fa-times"></i>
                                                </button>
                                            </div>
                                        ))}
                                        {rating.suggestions.length > 0 && (
                                             <button
                                                onClick={() => transformImage('refine', { tips: rating.suggestions })}
                                                disabled={isGenerating}
                                                className="w-full mt-4 py-2 bg-slate-700 hover:bg-green-600/20 hover:text-green-400 hover:border-green-500/50 border border-transparent rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2"
                                            >
                                                <i className="fa-solid fa-wand-magic-sparkles"></i> Apply These Improvements
                                            </button>
                                        )}
                                        {rating.suggestions.length === 0 && (
                                            <div className="text-xs text-slate-500 italic text-center py-2">No suggestions left to apply.</div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Loading State */}
                            {isGenerating && (
                                <div className="p-6 rounded-2xl bg-slate-800/50 flex items-center justify-center gap-3 text-purple-400 animate-pulse">
                                    <i className="fa-solid fa-circle-notch fa-spin text-xl"></i>
                                    <span className="font-medium">AI Stylist is working...</span>
                                </div>
                            )}

                        </div>
                    </div>

                    {/* Controls & Palette */}
                    {generatedImage && !isGenerating && (
                        <div className="animate-fade-in-up pt-8 border-t border-slate-700">
                            <h3 className="text-lg font-semibold text-slate-300 mb-4 flex items-center gap-2">
                                <i className="fa-solid fa-palette text-purple-400"></i>
                                Recolor Current Outfit
                            </h3>
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                {COLOR_PALETTES.map((palette) => (
                                    <button
                                        key={palette.name}
                                        onClick={() => transformImage('outfit', { palette })}
                                        className={`group relative p-3 rounded-xl border transition-all hover:scale-105 ${activePalette === palette.name ? 'bg-slate-700 border-purple-500 ring-2 ring-purple-500/30' : 'bg-slate-800 border-slate-700 hover:border-slate-500'}`}
                                    >
                                        <div className="flex gap-1 mb-2 justify-center">
                                            {palette.colors.map(c => (
                                                <div key={c} className="w-6 h-6 rounded-full shadow-sm" style={{ backgroundColor: c }}></div>
                                            ))}
                                        </div>
                                        <div className="text-xs font-medium text-center text-slate-300 group-hover:text-white">{palette.name}</div>
                                    </button>
                                ))}
                            </div>
                             <p className="text-center text-xs text-slate-500 mt-4">
                                Select a palette to automatically re-color the generated outfit while keeping the style.
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    </div>
  );
}

// --- Main App Shell ---

function App() {
  const [activeTab, setActiveTab] = useState<'live' | 'photo'>('live');

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans p-6">
      <header className="mb-8 flex flex-col md:flex-row justify-between items-center max-w-6xl mx-auto gap-4">
         <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-pink-500 to-purple-500 bg-clip-text text-transparent">AI Personal Stylist</h1>
            <p className="text-slate-400 text-sm">Your intelligent fashion & grooming assistant</p>
         </div>
         
         {/* Navigation Tabs */}
         <div className="bg-slate-800/80 p-1 rounded-xl flex">
            <button 
                onClick={() => setActiveTab('live')}
                className={`px-6 py-2 rounded-lg font-semibold text-sm transition-all flex items-center gap-2 ${activeTab === 'live' ? 'bg-slate-700 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
            >
                <i className="fa-solid fa-video"></i> Live Mirror
            </button>
            <button 
                onClick={() => setActiveTab('photo')}
                className={`px-6 py-2 rounded-lg font-semibold text-sm transition-all flex items-center gap-2 ${activeTab === 'photo' ? 'bg-slate-700 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
            >
                <i className="fa-solid fa-upload"></i> Photo Advisor
            </button>
         </div>
      </header>

      <main>
          {activeTab === 'live' ? <LiveStylist /> : <PhotoAnalysis />}
      </main>
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<App />);