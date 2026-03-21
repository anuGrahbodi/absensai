import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Camera, MapPin, Clock, Users, Activity,
  ArrowRight, CheckCircle2, AlertCircle, X,
  History, User
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { MockApi } from '../utils/api';
import { motion, AnimatePresence } from 'motion/react';

export default function Dashboard() {
  const [stats, setStats] = useState({ totalUsers: 0, checkInsToday: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [showWarning, setShowWarning] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const [activeNim, setActiveNim] = useState('');
  
  const [attendanceHistory, setAttendanceHistory] = useState([]); 
  
  const navigate = useNavigate();

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const users = await MockApi.getAllUsers();
        let realCheckIns = 0;
        
        const params = new URLSearchParams(window.location.search);
        const urlNim = params.get('nim');
        const savedNim = localStorage.getItem('user_nim');
        const currentNim = urlNim || savedNim;

        if (urlNim && urlNim !== savedNim) {
          localStorage.setItem('user_nim', urlNim);
        }

        if (currentNim) {
          setActiveNim(currentNim);
        }

        const isUserExistInDb = users.some(u => u.nim === currentNim);
        setIsRegistered(isUserExistInDb);
        localStorage.setItem('face_registered', isUserExistInDb ? 'true' : 'false');
        
        if (currentNim && isUserExistInDb) {
          const myHistory = await MockApi.getTodayAttendance(currentNim);
          realCheckIns = myHistory.length;
          setAttendanceHistory(myHistory); 
        }

        setStats({
          totalUsers: users.length,      
          checkInsToday: realCheckIns, 
        });
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchStats();
    const intervalId = setInterval(fetchStats, 10000); 
    return () => clearInterval(intervalId);
  }, []);

  const handleStartPresence = (e) => {
    if (!isRegistered) {
      e.preventDefault();
      setShowWarning(true);
    } else {
      navigate(`/attendance${activeNim ? `?nim=${activeNim}` : ''}`);
    }
  };

  return (
    <>
      <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>

        {/* ─── Hero Section ─── */}
        <section style={{
          background: 'linear-gradient(135deg, var(--primary) 0%, #10b981 100%)',
          border: 'none',
          borderRadius: 'var(--radius-3xl)',
          padding: 'clamp(2rem, 5vw, 3.5rem)',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: '0 10px 30px -10px rgba(16, 185, 129, 0.5)',
        }}>
          <div style={{
            position: 'absolute', top: '-60px', right: '-60px',
            width: '280px', height: '280px',
            background: 'radial-gradient(circle, rgba(255,255,255,0.15) 0%, transparent 70%)',
            borderRadius: '50%',
            pointerEvents: 'none',
          }} />
          <div style={{
            position: 'absolute', bottom: '-60px', left: '30%',
            width: '200px', height: '200px',
            background: 'radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%)',
            borderRadius: '50%',
            pointerEvents: 'none',
          }} />

          <div style={{ position: 'relative', zIndex: 1, maxWidth: '600px' }}>
            <h1 style={{
              fontSize: 'clamp(1.8rem, 4vw, 2.8rem)',
              fontWeight: 800,
              marginBottom: 'var(--space-3)',
              lineHeight: 1.15,
              letterSpacing: '-0.025em',
              color: 'white',
            }}>
              Sistem Presensi{' '}
              <span style={{ color: '#a7f3d0' }}>Cerdas</span>{' '}
              BPJS Ketenagakerjaan
            </h1>

            <p style={{
              fontSize: 'var(--fs-lg)',
              color: 'rgba(255, 255, 255, 0.9)',
              lineHeight: 1.7,
              marginBottom: 'var(--space-6)',
              maxWidth: '520px',
            }}>
              Platform absensi generasi baru yang menggabungkan pengenalan wajah presisi tinggi
              dengan validasi GPS untuk akurasi dan keamanan maksimal.
            </p>

            <div className="flex flex-wrap gap-3">
              <button 
                onClick={handleStartPresence} 
                className="btn btn-lg" 
                style={{ backgroundColor: 'white', color: 'var(--primary)', border: 'none' }}
              >
                <MapPin size={18} />
                Mulai Presensi
                <ArrowRight size={16} />
              </button>

              {!isRegistered && (
                <Link 
                  to={`/register-face${activeNim ? `?nim=${activeNim}` : ''}`} 
                  className="btn btn-lg" 
                  style={{ backgroundColor: 'transparent', color: 'white', border: '1px solid rgba(255,255,255,0.5)' }}
                >
                  <Camera size={18} />
                  Daftar Wajah
                </Link>
              )}
              {isRegistered && (
                <div 
                  className="badge" 
                  style={{ 
                    backgroundColor: 'rgba(255,255,255,0.2)', color: 'white', 
                    padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius-xl)', 
                    border: '1px solid rgba(255,255,255,0.3)' 
                  }}
                >
                  <CheckCircle2 size={18} /> Terdaftar
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ─── Stats Section ─── */}
        <section>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>

            <div className="stat-card" style={{ padding: '2rem' }}>
              <div className="stat-icon" style={{ background: 'var(--primary-subtle)', padding: '16px', borderRadius: '16px' }}>
                <Users size={32} style={{ color: 'var(--primary)' }} />
              </div>
              <div>
                <p className="stat-label" style={{ fontSize: '1.1rem', marginBottom: '8px' }}>Total Pendaftar</p>
                <p className="stat-value" style={{ fontSize: '2.5rem', fontWeight: 800 }}>
                  {isLoading ? '—' : stats.totalUsers}
                  <span className="stat-unit" style={{ marginLeft: '8px', fontSize: '1.1rem' }}>Orang</span>
                </p>
              </div>
            </div>

            <div className="stat-card" style={{ padding: '2rem' }}>
              <div className="stat-icon" style={{ background: 'var(--info-bg)', padding: '16px', borderRadius: '16px' }}>
                <Clock size={32} style={{ color: 'var(--info)' }} />
              </div>
              <div>
                <p className="stat-label" style={{ fontSize: '1.1rem', marginBottom: '8px' }}>Presensi Hari Ini</p>
                <p className="stat-value" style={{ fontSize: '2.5rem', fontWeight: 800 }}>
                  {isLoading ? '—' : stats.checkInsToday}
                  <span className="stat-unit" style={{ marginLeft: '8px', fontSize: '1.1rem' }}>Aktivitas</span>
                </p>
              </div>
            </div>

            <div className="stat-card" style={{ padding: '2rem', gridColumn: 'auto' }}>
              <div className="stat-icon" style={{ background: 'var(--success-bg)', padding: '16px', borderRadius: '16px' }}>
                <Activity size={32} style={{ color: 'var(--success)' }} />
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <p className="stat-label" style={{ fontSize: '1.1rem', marginBottom: '12px' }}>Status Server</p>
                <div className="flex items-center gap-3">
                  <span style={{
                    width: '14px', height: '14px',
                    borderRadius: '50%',
                    background: 'var(--success)',
                    animation: 'pulse 2s ease-in-out infinite',
                    display: 'inline-block',
                    boxShadow: '0 0 0 4px rgba(5,150,105,0.2)',
                  }} />
                  <span style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                    Backend Aktif
                  </span>
                </div>
              </div>
            </div>

          </div>
        </section>

        {/* ─── Riwayat Kehadiran Hari Ini (Sama Persis Attendance.jsx) ─── */}
        {isRegistered && attendanceHistory.length > 0 && (
          <section className="animate-fade-in pb-10">
            <div className="card" style={{ padding: 'var(--space-5)' }}>
              
              <div className="flex items-center gap-2 mb-4">
                <History size={18} style={{ color: 'var(--primary)' }} />
                <h3 style={{ fontWeight: 700, fontSize: 'var(--fs-base)' }}>Riwayat Kehadiran Hari Ini</h3>
                <span className="badge badge-primary" style={{ marginLeft: 'auto' }}>
                  {attendanceHistory.length} Catatan
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {attendanceHistory.map(record => {
                  // Format Waktu menggunakan Titik (Contoh: 09.55)
                  const timeStr = new Date(record.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace(':', '.');
                  const isMeet = record.type.includes('meet');
                  const isIn = record.type.includes('in');
                  const badgeText = isIn ? 'IN' : 'OUT'; // Badge di foto jadi IN/OUT
                  const typeDisplay = { 'in': 'Check-In', 'out': 'Check-Out', 'meet-in': 'Check-In', 'meet-out': 'Check-Out' };

                  return (
                    <div key={record.id} className="record-card">
                      <div className="record-photo">
                        {/* HANYA MUNCULKAN IKON USER POLOS */}
                        <User size={20} />
                        <span className="record-type-badge">{badgeText}</span>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div className="flex items-center justify-between mb-1">
                          <p style={{ fontWeight: 700, fontSize: 'var(--fs-sm)' }}>{typeDisplay[record.type]}</p>
                          <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-tertiary)', fontFamily: 'monospace', fontWeight: 600 }}>{timeStr}</span>
                        </div>
                        <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-tertiary)', marginBottom: 'var(--space-1)' }}>
                          <MapPin size={10} style={{ display: 'inline', verticalAlign: 'middle' }} />{' '}
                          {Number(record.latitude).toFixed(4)}, {Number(record.longitude).toFixed(4)}
                        </p>
                        <span className={`badge ${isMeet ? 'badge-info' : 'badge-success'}`} style={{ fontSize: '10px' }}>
                          {typeDisplay[record.type]}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>
          </section>
        )}

      </div>

      {/* ─── Warning Modal ─── */}
      {createPortal(
        <AnimatePresence>
          {showWarning && (
            <div style={{
              position: 'fixed',
              inset: 0,
              zIndex: 999999,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 'var(--space-4)',
              backgroundColor: 'rgba(0, 0, 0, 0.6)',
              backdropFilter: 'blur(5px)',
            }}>
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="card"
                style={{
                  maxWidth: '400px', width: '100%',
                  padding: 'var(--space-6)',
                  textAlign: 'center',
                  position: 'relative',
                }}
              >
                <button
                  onClick={() => setShowWarning(false)}
                  style={{ position: 'absolute', top: 'var(--space-4)', right: 'var(--space-4)', color: 'var(--text-tertiary)', background: 'transparent', border: 'none', cursor: 'pointer' }}
                >
                  <X size={20} />
                </button>

                <div style={{
                  width: '64px', height: '64px',
                  background: 'var(--warning-bg)',
                  borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto var(--space-4)',
                  color: 'var(--warning)',
                }}>
                  <AlertCircle size={32} />
                </div>

                <h3 style={{ fontSize: 'var(--fs-xl)', fontWeight: 800, marginBottom: 'var(--space-2)' }}>
                  Registrasi Diperlukan
                </h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--fs-sm)', marginBottom: 'var(--space-6)', lineHeight: 1.6 }}>
                  {activeNim ? `NIM ${activeNim} belum melakukan registrasi wajah.` : 'Anda belum melakukan registrasi wajah.'} Silakan lakukan registrasi terlebih dahulu sebelum melakukan presensi.
                </p>

                <div className="flex flex-col gap-2">
                  <Link to={`/register-face${activeNim ? `?nim=${activeNim}` : ''}`} className="btn btn-primary w-full">
                    <Camera size={18} />
                    Registrasi Sekarang
                  </Link>
                  <button onClick={() => setShowWarning(false)} className="btn btn-ghost w-full">
                    Nanti Saja
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}