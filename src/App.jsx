import React from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { UserSquare2, LayoutDashboard, Camera, MapPin } from 'lucide-react';

import Dashboard from './pages/Dashboard';
import RegisterFace from './pages/RegisterFace';
import Attendance from './pages/Attendance';

function NavLink({ to, icon: Icon, label }) {
  const location = useLocation();
  const isActive = location.pathname === to;
  return (
    <Link
      to={to}
      className={`nav-link${isActive ? ' nav-link-active' : ''}`}
    >
      <Icon size={15} />
      {label}
    </Link>
  );
}

function App() {
  return (
    <div className="page-wrapper">
      <header className="app-header">
        <div className="container">
          <Link to="/" className="brand-logo">
            <div className="brand-icon">
              <UserSquare2 size={20} strokeWidth={2} />
            </div>
            <div className="brand-text">
              <span className="brand-name">BPJS Absensi</span>
            </div>
          </Link>

          <nav className="nav-links">
            <NavLink to="/" icon={LayoutDashboard} label="Dashboard" />
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

      <footer style={{
        borderTop: '1px solid var(--border-color)',
        padding: 'var(--space-4) 0',
        textAlign: 'center',
        fontSize: 'var(--fs-xs)',
        color: 'var(--text-tertiary)',
      }}>
      </footer>
    </div>
  );
}

export default App;