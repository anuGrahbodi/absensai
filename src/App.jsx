import React from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import { MapPin, UserSquare2 } from 'lucide-react';

// Placeholder imports for pages. Will be created next.
import Dashboard from './pages/Dashboard';
import RegisterFace from './pages/RegisterFace';
import Attendance from './pages/Attendance';

function App() {
  return (
    <div className="page-wrapper">
      <header className="app-header">
        <div className="container">
          <Link to="/" className="brand-logo">
            <UserSquare2 size={28} />
            <span>BPJS Absensi</span>
          </Link>
          <nav className="flex items-center gap-4">
            <Link to="/register-face" className="text-secondary font-medium">Registrasi Wajah</Link>
            <Link to="/attendance" className="btn btn-primary" style={{ padding: '0.5rem 1rem' }}>
              <MapPin size={18} />
              Check In
            </Link>
          </nav>
        </div>
      </header>
      
      <main className="main-content">
        <div className="container">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/register-face" element={<RegisterFace />} />
            <Route path="/attendance" element={<Attendance />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

export default App;
