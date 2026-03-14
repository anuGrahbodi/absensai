import React, { useRef, useState, useEffect } from 'react';
import { Camera, RefreshCw, CheckCircle, AlertTriangle, ArrowRight, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { loadFaceModels, extractFaceDescriptorAndAngle, saveUserFaceToDB } from '../utils/face';

export default function RegisterFace() {
  const videoRef = useRef(null);
  const navigate = useNavigate();
  
  const [nim, setNim] = useState('');
  const [step, setStep] = useState(0); // 0: Input NIM, 1: Face Center, 2: Face Turn
  const [status, setStatus] = useState('idle'); // idle, loading_models, waiting, scanning, success, error
  const [errorMsg, setErrorMsg] = useState('');
  
  const [centerDescriptor, setCenterDescriptor] = useState(null);

  useEffect(() => {
    let stream = null;

    const initCam = async () => {
      if (step === 0) return; // Only init camera after NIM is entered
      
      setStatus('loading_models');
      try {
        await loadFaceModels();
        setStatus('waiting');
        
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        setStatus('error');
        setErrorMsg(err.message || 'Gagal mengakses kamera atau memuat model API.');
      }
    };

    initCam();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [step]);

  const handleStartRegistration = () => {
    if (!nim || nim.trim().length < 5) {
      setErrorMsg("NIM tidak valid. Masukkan minimal 5 karakter.");
      return;
    }
    setErrorMsg('');
    setStep(1); // Move to Face Center capture
  };

  const handleCaptureFace = async () => {
    if (status !== 'waiting') return;
    setStatus('scanning');
    setErrorMsg('');

    try {
      const { descriptor, angle } = await extractFaceDescriptorAndAngle(videoRef.current);
      
      if (step === 1) {
        // Step 1: Face Center
        // Ideally ratio is close to 1 (e.g. 0.8 to 1.2)
        if (angle < 0.7 || angle > 1.3) {
          throw new Error("Wajah tidak menghadap lurus ke depan. Posisikan wajah ke tengah (Angle ratio: " + angle.toFixed(2) + ").");
        }
        setCenterDescriptor(descriptor);
        setStep(2);
        setStatus('waiting');
      } else if (step === 2) {
        // Step 2: Liveness Check (Turn Face)
        // Ratio either significantly < 1 (turn left) or > 1 (turn right)
        if (angle > 0.85 && angle < 1.15) {
          throw new Error("Tolong putar wajah Anda sedikit ke kiri atau ke kanan untuk verifikasi (Angle ratio: " + angle.toFixed(2) + ").");
        }
        
        // Save using the straight-facing descriptor (more reliable for matching later)
        await saveUserFaceToDB(centerDescriptor, nim);
        setStatus('success');
        setTimeout(() => {
          navigate('/');
        }, 2000);
      }
    } catch (err) {
      setStatus('error');
      setErrorMsg(err.message);
      // Revert back to waiting after short delay
      setTimeout(() => setStatus('waiting'), 3000);
    }
  };

  return (
    <div className="animate-fade-in flex-col items-center max-w-3xl mx-auto gap-6 w-full">
      <div className="text-center w-full">
        <h1 className="text-3xl font-bold mb-2">Registrasi Wajah & Identitas</h1>
        <p className="text-secondary">Daftarkan NIM dan profil wajah Anda untuk absensi.</p>
      </div>

      <div className="glass-panel p-6 w-full flex-col items-center gap-4">
        
        {step === 0 && (
          <div className="w-full max-w-md flex-col gap-4 py-8">
            <div className="input-group">
              <label className="input-label">Nomor Induk Mahasiswa (NIM)</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-text-tertiary" size={18} />
                <input 
                  type="text" 
                  className="input-field pl-10" 
                  placeholder="Masukkan NIM Anda"
                  value={nim}
                  onChange={(e) => setNim(e.target.value)}
                />
              </div>
            </div>
            {errorMsg && <div className="text-sm text-error">{errorMsg}</div>}
            <button className="btn btn-primary w-full mt-4" onClick={handleStartRegistration}>
              Lanjut ke Verifikasi Wajah <ArrowRight size={18} />
            </button>
          </div>
        )}

        {step > 0 && (
          <>
            <div className="flex justify-between w-full max-w-md mb-2 text-sm font-semibold text-secondary">
              <span className={step === 1 ? 'text-primary' : 'text-success'}>1. Hadap Depan</span>
              <span className={step === 2 ? 'text-primary' : (status === 'success' ? 'text-success' : '')}>2. Putar Wajah (Liveness)</span>
            </div>
            
            {/* Camera Container */}
            <div style={{
              width: '100%',
              maxWidth: '480px',
              aspectRatio: '4/3',
              background: '#1e293b',
              borderRadius: 'var(--radius-lg)',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.5)',
              margin: '0 auto'
            }}>
              {status === 'loading_models' && (
                <div className="flex-col items-center text-white gap-3 z-20">
                  <RefreshCw className="animate-pulse" size={32} />
                  <span>Memuat Model AI...</span>
                </div>
              )}
              <video 
                ref={videoRef}
                autoPlay 
                muted 
                playsInline
                style={{ 
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%', 
                  height: '100%', 
                  objectFit: 'cover',
                  display: status === 'loading_models' ? 'none' : 'block',
                  transform: 'scaleX(-1)' // mirror for webcam
                }}
              />

              {/* Head Outline Guide Overlay - Black Outline with White Border */}
              {status !== 'loading_models' && (
                <div style={{
                  position: 'absolute',
                  top: 0, left: 0, right: 0, bottom: 0,
                  pointerEvents: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '2rem',
                  zIndex: 10
                }}>
                  <svg 
                    viewBox="0 0 200 250" 
                    style={{ width: '100%', height: '100%', transition: 'opacity 0.3s', opacity: status === 'scanning' ? 0.5 : 1 }}
                  >
                    {/* Outer White Border */}
                    <g 
                      fill="none" 
                      stroke={status === 'scanning' ? 'var(--primary)' : 'rgba(255, 255, 255, 0.9)'} 
                      strokeWidth="5" 
                      strokeDasharray="8 6"
                    >
                      <ellipse cx="100" cy="100" rx="60" ry="80" />
                      <path d="M 30 250 Q 30 200 100 200 Q 170 200 170 250" />
                    </g>
                    
                    {/* Inner Black Stroke */}
                    <g 
                      fill="none" 
                      stroke={status === 'scanning' ? 'rgba(0,0,0,0.3)' : 'rgba(0, 0, 0, 0.7)'} 
                      strokeWidth="3" 
                      strokeDasharray="8 6"
                    >
                      <ellipse cx="100" cy="100" rx="60" ry="80" />
                      <path d="M 30 250 Q 30 200 100 200 Q 170 200 170 250" />
                    </g>

                    {/* Center crosshair small indicator */}
                    {step === 1 && (
                      <g strokeWidth="2" style={{ stroke: 'rgba(255, 255, 255, 0.8)' }}>
                        <line x1="100" y1="90" x2="100" y2="110" />
                        <line x1="90" y1="100" x2="110" y2="100" />
                      </g>
                    )}
                  </svg>
                </div>
              )}
              
              {/* Guidance Overlays based on Step */}
              {step === 1 && status !== 'loading_models' && (
                 <div style={{ position: 'absolute', left: 0, right: 0, bottom: '1rem', textAlign: 'center', pointerEvents: 'none', zIndex: 10 }}>
                    <span style={{ background: 'rgba(0,0,0,0.6)', color: 'white', padding: '0.5rem 1rem', borderRadius: '9999px', fontSize: '0.875rem', fontWeight: 500, backdropFilter: 'blur(4px)', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
                      Posisikan Wajah Lurus ke Tengah
                    </span>
                 </div>
              )}
              {step === 2 && status !== 'loading_models' && (
                 <div style={{ position: 'absolute', left: 0, right: 0, bottom: '1rem', textAlign: 'center', pointerEvents: 'none', zIndex: 10 }}>
                    <span style={{ background: 'rgba(0,0,0,0.6)', color: 'white', padding: '0.5rem 1rem', borderRadius: '9999px', fontSize: '0.875rem', fontWeight: 500, backdropFilter: 'blur(4px)', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
                      Silakan Menoleh Sedikit (Kiri/Kanan)
                    </span>
                 </div>
              )}
            </div>

            {/* Status indicator */}
            <div className="flex items-center gap-2 p-3 mt-4 w-full justify-center rounded-md" style={{ background: 'var(--surface-hover)' }}>
              {status === 'loading_models' && <><RefreshCw size={18} className="animate-pulse text-info" /><span className="text-info font-medium">Persiapan AI System</span></>}
              {status === 'waiting' && <span className="status-badge info">Menunggu Ambil Gambar</span>}
              {status === 'scanning' && <><RefreshCw size={18} className="animate-pulse text-warning" /><span className="text-warning font-medium">Memindai Wajah...</span></>}
              {status === 'success' && <><CheckCircle size={18} className="text-success" /><span className="text-success font-medium">Registrasi Selesai!</span></>}
              {status === 'error' && <><AlertTriangle size={18} className="text-error" /><span className="text-error font-medium">{errorMsg}</span></>}
            </div>

            {/* Controls */}
            <div className="flex gap-4 w-full mt-4 max-w-md">
              <button 
                className="btn btn-primary flex-1" 
                onClick={handleCaptureFace}
                disabled={status !== 'waiting'}
              >
                <Camera size={18} />
                {step === 1 ? 'Rekam Wajah Hadap Depan' : 'Rekam Liveness (Menoleh)'}
              </button>
            </div>

            <div className="mt-6 text-sm text-center text-text-tertiary max-w-md">
              Notes: Sistem menggunakan deteksi profil sudut wajah <i>(yaw ratio)</i> untuk mendeteksi *liveness* dan mencegah foto diam.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
