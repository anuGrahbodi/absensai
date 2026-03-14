import React from 'react';
import { Link } from 'react-router-dom';
import { Camera, MapPin, ShieldCheck, Clock } from 'lucide-react';

export default function Dashboard() {
  return (
    <div className="animate-fade-in flex-col gap-8">
      
      <section className="text-center mt-8 mb-8">
        <h1 className="text-4xl font-bold mb-4" style={{ color: 'var(--primary-dark)' }}>
          Sistem Absensi Online BPJS
        </h1>
        <p className="text-lg text-secondary max-w-2xl mx-auto">
          Selamat datang di platform absensi generasi baru. Lakukan presensi dengan mudah menggunakan verifikasi wajah dan lokasi.
        </p>
      </section>

      <div className="grid-cards mb-8" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'var(--space-6)' }}>
        
        {/* Check In Card */}
        <div className="glass-panel p-8 text-center flex-col items-center gap-4 transition-transform hover:-translate-y-2">
          <div style={{ background: 'var(--primary-light)', color: 'white', padding: '1rem', borderRadius: '50%' }}>
            <MapPin size={32} />
          </div>
          <h2 className="text-2xl font-bold">Check-In Hari Ini</h2>
          <p className="text-secondary">
            Lakukan absensi dengan memverifikasi lokasi dan wajah Anda secara real-time.
          </p>
          <Link to="/attendance" className="btn btn-primary mt-4" style={{ width: '100%' }}>
            <Clock size={18} />
            Mulai Check-In
          </Link>
        </div>

        {/* Register Face Card */}
        <div className="glass-panel p-8 text-center flex-col items-center gap-4 transition-transform hover:-translate-y-2">
          <div style={{ background: 'var(--secondary)', color: 'white', padding: '1rem', borderRadius: '50%' }}>
            <Camera size={32} />
          </div>
          <h2 className="text-2xl font-bold">Registrasi Wajah</h2>
          <p className="text-secondary">
            Daftarkan wajah Anda kedalam sistem untuk mempercepat proses verifikasi absensi.
          </p>
          <Link to="/register-face" className="btn btn-secondary mt-4" style={{ width: '100%' }}>
            <ShieldCheck size={18} />
            Daftar Sekarang
          </Link>
        </div>

      </div>
    </div>
  );
}
