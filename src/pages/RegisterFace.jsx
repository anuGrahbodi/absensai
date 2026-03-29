import React, { useRef, useState, useEffect } from 'react';
import { Camera, RefreshCw, CheckCircle, AlertTriangle, ArrowRight, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { loadFaceModels, extractFaceDescriptorAndAngle, saveUserFaceToDB } from '../utils/face';

const STEPS = [
  { id: 1, label: 'Hadap Lurus', desc: 'Posisikan wajah lurus ke tengah kamera' },
  { id: 2, label: 'Liveness Check', desc: 'Tolehkan wajah sedikit ke kiri atau kanan' },
];

export default function RegisterFace() {
  const videoRef = useRef(null);
  const navigate = useNavigate();

  const [nim, setNim] = useState('');
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [centerDescriptor, setCenterDescriptor] = useState(null);

  // ─── RADAR PENANGKAP NIM DARI URL ───
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nimDariUrl = params.get("nim");
    
    if (nimDariUrl) {
      setNim(nimDariUrl); // Otomatis mengisi kotak input NIM
      // setStep(1); // (Opsional) Hapus tanda // di awal baris ini jika Anda ingin langsung melompati halaman input dan otomatis menyalakan kamera
    }
  }, []);

  // ─── INISIALISASI KAMERA & MODEL AI ───
  useEffect(() => {
    let stream = null;
    const initCam = async () => {
      if (step === 0) return;
      setStatus('loading_models');
      try {
        await loadFaceModels();
        setStatus('waiting');
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch (err) {
        setStatus('error');
        setErrorMsg(err.message || 'Gagal mengakses kamera atau memuat model AI.');
      }
    };
    initCam();
    return () => { if (stream) stream.getTracks().forEach(t => t.stop()); };
  }, [step]);

  const handleStart = () => {
    if (!nim || nim.trim().length < 5) {
      setErrorMsg('NIM tidak valid. Masukkan minimal 5 karakter.');
      return;
    }
    setErrorMsg('');
    setStep(1);
  };

  const handleCapture = async () => {
    if (status !== 'waiting') return;
    setStatus('scanning');
    setErrorMsg('');
    try {
      const { descriptor, angle } = await extractFaceDescriptorAndAngle(videoRef.current);
      
      if (step === 1) {
        if (angle < 0.7 || angle > 1.3) throw new Error(`Wajah belum lurus ke depan (ratio: ${angle.toFixed(2)}). Coba lagi.`);
        setCenterDescriptor(descriptor);
        setStep(2);
        setStatus('waiting');
      } else if (step === 2) {
        if (angle > 0.85 && angle < 1.15) throw new Error(`Tolehkan wajah lebih jauh ke kiri atau kanan (ratio: ${angle.toFixed(2)}).`);
        
        // Simpan ke Database
        await saveUserFaceToDB(centerDescriptor, nim);
        
        // Sinkronisasi dengan Local Storage untuk Dashboard
        localStorage.setItem('user_nim', nim);
        localStorage.setItem('face_registered', 'true');
        
        setStatus('success');
        setTimeout(() => navigate(`/?nim=${nim}`), 2500);
      }
    } catch (err) {
      setStatus('error');
      setErrorMsg(err.message);
      setTimeout(() => setStatus('waiting'), 3000);
    }
  };

  const currentStepData = STEPS[step - 1];

  return (
    <div className="animate-fade-in" style={{ maxWidth: '560px', margin: '0 auto' }}>

      {/* Page Header */}
      <div className="text-center mb-8">
        <div style={{
          width: '64px', height: '64px',
          background: 'linear-gradient(135deg, var(--primary-subtle), var(--success-bg))',
          borderRadius: 'var(--radius-2xl)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto var(--space-4)',
          border: '1px solid rgba(5,150,105,0.15)',
        }}>
          <User size={28} style={{ color: 'var(--primary)' }} />
        </div>
        <h1 style={{ fontSize: 'var(--fs-3xl)', fontWeight: 800, marginBottom: 'var(--space-2)' }}>
          Registrasi Wajah
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--fs-sm)', maxWidth: '380px', margin: '0 auto', lineHeight: 1.7 }}>
          Daftarkan NIM dan pindai wajah untuk digunakan pada sistem presensi biometrik.
        </p>
      </div>

      <div className="card-elevated" style={{ overflow: 'hidden' }}>

        {/* Progress Bar Header (step > 0) */}
        {step > 0 && (
          <div style={{
            padding: 'var(--space-4) var(--space-6)',
            borderBottom: '1px solid var(--border-color)',
            background: 'var(--surface-2)',
          }}>
            <div className="flex items-center gap-3">
              {STEPS.map((s, idx) => {
                const isActive = step === s.id;
                const isDone = step > s.id || status === 'success';
                return (
                  <React.Fragment key={s.id}>
                    <div className="flex items-center gap-2">
                      <div style={{
                        width: '28px', height: '28px',
                        borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 'var(--fs-xs)', fontWeight: 700,
                        flexShrink: 0,
                        background: isDone ? 'var(--success)' : isActive ? 'var(--primary)' : 'var(--surface)',
                        color: isDone || isActive ? 'white' : 'var(--text-tertiary)',
                        border: isDone ? 'none' : isActive ? 'none' : '2px solid var(--border-color)',
                        transition: 'all 0.2s ease',
                      }}>
                        {isDone ? <CheckCircle size={14} /> : s.id}
                      </div>
                      <span style={{
                        fontSize: 'var(--fs-xs)', fontWeight: 600,
                        color: isDone ? 'var(--success)' : isActive ? 'var(--primary)' : 'var(--text-tertiary)',
                        whiteSpace: 'nowrap',
                      }}>
                        {s.label}
                      </span>
                    </div>
                    {idx < STEPS.length - 1 && (
                      <div style={{
                        flex: 1, height: '2px',
                        background: step > s.id ? 'var(--success)' : 'var(--border-color)',
                        borderRadius: '1px', transition: 'background 0.3s',
                      }} />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ padding: 'var(--space-6)' }}>

          {/* ── Step 0: Input NIM ── */}
          {step === 0 && (
            <div>
              <div className="input-group mb-5">
                <label className="input-label">Nomor Induk Mahasiswa (NIM)</label>
                <div className="input-wrapper">
                  <span className="input-icon"><User size={17} /></span>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Contoh: 123456789"
                    value={nim}
                    onChange={e => setNim(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleStart()}
                    autoFocus
                  />
                </div>
              </div>

              {errorMsg && (
                <div className="alert alert-error mb-4">
                  <AlertTriangle size={16} className="alert-icon" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <button className="btn btn-primary w-full btn-lg" onClick={handleStart}>
                Lanjut ke Scan Wajah
                <ArrowRight size={18} />
              </button>

              <div style={{
                marginTop: 'var(--space-5)',
                padding: 'var(--space-4)',
                background: 'var(--primary-subtle)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid rgba(5,150,105,0.15)',
              }}>
                <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--primary-dark)', fontWeight: 600, marginBottom: 'var(--space-2)' }}>
                  ℹ️ Petunjuk Registrasi
                </p>
                <ul style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', lineHeight: 1.8, paddingLeft: 'var(--space-4)' }}>
                  <li>Pastikan ruangan cukup terang</li>
                  <li>Lepaskan kacamata jika memungkinkan</li>
                  <li>Hadap lurus ke kamera saat pemotretan pertama</li>
                  <li>Tolehkan wajah ke kiri/kanan untuk verifikasi liveness</li>
                </ul>
              </div>
            </div>
          )}

          {/* ── Step 1 & 2: Camera ── */}
          {step > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>

              {/* Current step info */}
              <div style={{
                padding: 'var(--space-3) var(--space-4)',
                background: 'var(--surface-2)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-color)',
                display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
              }}>
                <div style={{
                  width: '8px', height: '8px',
                  borderRadius: '50%',
                  background: 'var(--primary)',
                  flexShrink: 0,
                  animation: 'pulse 2s ease-in-out infinite',
                  boxShadow: '0 0 0 3px var(--primary-glow)',
                }} />
                <div>
                  <p style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Langkah {step} dari 2
                  </p>
                  <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>
                    {currentStepData?.desc}
                  </p>
                </div>
              </div>

              {/* Camera */}
              <div className="camera-viewport">
                {status === 'loading_models' && (
                  <div style={{ color: 'rgba(255,255,255,0.7)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-3)', zIndex: 20 }}>
                    <RefreshCw size={28} style={{ animation: 'spin 1s linear infinite' }} />
                    <span style={{ fontSize: 'var(--fs-sm)' }}>Memuat Model AI...</span>
                  </div>
                )}

                <video ref={videoRef} autoPlay muted playsInline className="camera-video"
                  style={{ display: status === 'loading_models' ? 'none' : 'block' }}
                />

                {/* Head guide overlay */}
                {status !== 'loading_models' && (
                  <div className="camera-overlay">
                    <svg viewBox="0 0 200 250" style={{ width: '100%', height: '100%', opacity: status === 'scanning' ? 0.5 : 1, transition: 'opacity 0.3s' }}>
                      <g fill="none" stroke={status === 'scanning' ? 'var(--primary)' : 'rgba(255,255,255,0.85)'} strokeWidth="4" strokeDasharray="10 7">
                        <ellipse cx="100" cy="100" rx="60" ry="78" />
                        <path d="M 32 250 Q 32 200 100 200 Q 168 200 168 250" />
                      </g>
                      <g fill="none" stroke="rgba(0,0,0,0.5)" strokeWidth="2" strokeDasharray="10 7">
                        <ellipse cx="100" cy="100" rx="60" ry="78" />
                        <path d="M 32 250 Q 32 200 100 200 Q 168 200 168 250" />
                      </g>
                      {step === 1 && (
                        <g stroke="rgba(255,255,255,0.7)" strokeWidth="2">
                          <line x1="100" y1="92" x2="100" y2="108" />
                          <line x1="92" y1="100" x2="108" y2="100" />
                        </g>
                      )}
                    </svg>
                  </div>
                )}

                {/* Scanning border */}
                {status === 'scanning' && <div className="camera-scanning-border" />}

                {/* Toast */}
                {status !== 'loading_models' && (
                  <div className="camera-toast">
                    {status === 'scanning'
                      ? <><RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Memindai wajah...</>
                      : step === 1
                        ? '👤 Posisikan wajah lurus ke tengah'
                        : '↔ Tolehkan ke kiri atau kanan'
                    }
                  </div>
                )}
              </div>

              {/* Status & Error */}
              {errorMsg && status === 'error' && (
                <div className="alert alert-error">
                  <AlertTriangle size={16} className="alert-icon" />
                  <span>{errorMsg}</span>
                </div>
              )}
              {status === 'success' && (
                <div className="alert alert-success">
                  <CheckCircle size={16} className="alert-icon" />
                  <div>
                    <p className="alert-title">Registrasi Berhasil!</p>
                    <p className="alert-body">Mengalihkan ke halaman dashboard...</p>
                  </div>
                </div>
              )}

              {/* Capture Button */}
              <button
                className="btn btn-primary w-full btn-lg"
                onClick={handleCapture}
                disabled={status !== 'waiting'}
              >
                <Camera size={18} />
                {step === 1 ? 'Rekam Wajah Hadap Depan' : 'Rekam Liveness (Menoleh)'}
              </button>

              <p style={{ textAlign: 'center', fontSize: 'var(--fs-xs)', color: 'var(--text-tertiary)' }}>
                NIM: <strong style={{ color: 'var(--text-secondary)' }}>{nim}</strong>
                {' '}—{' '}
                <button onClick={() => { setStep(0); setStatus('idle'); setErrorMsg(''); }}
                  style={{ color: 'var(--primary)', fontSize: 'var(--fs-xs)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}>
                  Ganti NIM
                </button>
              </p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}