import React, { useState, useEffect, useRef } from 'react';
import {
  MapPin, Camera, CheckCircle2, XCircle, Loader2,
  User, Search, LogOut, LogIn, History, Monitor, Building2
} from 'lucide-react';
import { getCurrentLocation, validateLocationDistance, TARGET_COORDINATE } from '../utils/location';
import { MockApi } from '../utils/api';
import { loadFaceModels, extractFaceDescriptorAndAngle, matchFace1toN } from '../utils/face';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix leaflet default icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const userIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
});

function MapUpdater({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.setView([center.latitude, center.longitude], 17, { animate: true });
  }, [center, map]);
  return null;
}

export default function Attendance() {
  const videoRef = useRef(null);
  const [viewState, setViewState] = useState('active');

  // Location
  const [locStatus, setLocStatus] = useState('locating');
  const [locError, setLocError] = useState('');
  const [userCoords, setUserCoords] = useState(null);

  // Face
  const [faceStatus, setFaceStatus] = useState('paused');
  const [faceError, setFaceError] = useState('');
  const [mediaStream, setMediaStream] = useState(null);
  const [allProfiles, setAllProfiles] = useState([]);

  // Attendance
  const [attendanceMode, setAttendanceMode] = useState('reguler');
  const [searchNim, setSearchNim] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [attendanceHistory, setAttendanceHistory] = useState([]);
  const [attendanceType, setAttendanceType] = useState('in');
  const [isDoneForToday, setIsDoneForToday] = useState(false);
  const [matchedNim, setMatchedNim] = useState('');

  useEffect(() => {
    let stream = null;
    let isMounted = true;

    const init = async () => {
      try {
        const profiles = await MockApi.getAllUsers();
        if (profiles.length === 0) {
          if (isMounted) { setFaceStatus('error'); setFaceError('Belum ada data pendaftar. Registrasi wajah diperlukan.'); setLocStatus('error'); }
          return;
        }
        if (isMounted) setAllProfiles(profiles);

        // Tangkap NIM dari URL
        const params = new URLSearchParams(window.location.search);
        const urlNim = params.get('nim');
        const savedNim = localStorage.getItem('user_nim');
        
        const targetNim = urlNim || savedNim;

        if (urlNim && urlNim !== savedNim) {
           localStorage.setItem('user_nim', urlNim);
        }

        if (targetNim) {
          setSearchNim(targetNim);
          handleSearchNimInternal(targetNim, profiles);
        }
      } catch (err) {
        if (isMounted) { setFaceStatus('error'); setFaceError(err.message); }
        return;
      }

      try {
        await loadFaceModels();
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (isMounted) {
          setMediaStream(stream);
          if (videoRef.current) videoRef.current.srcObject = stream;
        }
      } catch (err) {
        if (isMounted) { setFaceStatus('error'); setFaceError('Gagal mengakses kamera: ' + err.message); }
      }

      try {
        const coords = await getCurrentLocation();
        const validation = validateLocationDistance(coords.latitude, coords.longitude);
        if (isMounted) {
          setUserCoords(coords);
          setLocStatus(validation.isValid ? 'success' : 'warning');
        }
      } catch (err) {
        if (isMounted) { setLocStatus('error'); setLocError(err.message); }
      }
    };

    init();
    return () => { isMounted = false; if (stream) stream.getTracks().forEach(t => t.stop()); };
  }, []);

  const handleSearchNimInternal = async (nim, profiles) => {
    setIsSearching(true); setFaceError(''); setIsDoneForToday(false);
    try {
      const profileInfo = profiles.find(p => p.nim === nim);
      if (!profileInfo) throw new Error(`NIM ${nim} belum terdaftar. Silakan Registrasi Wajah terlebih dahulu.`);
      setCurrentUser(profileInfo);
      const history = await MockApi.getTodayAttendance(nim);
      setAttendanceHistory(history);
      determineAttendanceState(history, attendanceMode);
      setFaceStatus('active');
    } catch (err) {
      setFaceError(err.message); setCurrentUser(null); setFaceStatus('paused');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearchNim = async (e) => {
    e.preventDefault();
    if (!searchNim.trim()) return;
    handleSearchNimInternal(searchNim, allProfiles);
  };

  const determineAttendanceState = (history, mode) => {
    let modeRecords = [];
    if (mode === 'reguler') modeRecords = history.filter(h => h.type === 'in' || h.type === 'out');
    else modeRecords = history.filter(h => h.type === 'meet-in' || h.type === 'meet-out');
    modeRecords.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    if (modeRecords.length === 0) {
      setAttendanceType(mode === 'reguler' ? 'in' : 'meet-in');
      setIsDoneForToday(false);
    } else {
      const last = modeRecords[0];
      if (last.type === 'in' || last.type === 'meet-in') {
        setAttendanceType(mode === 'reguler' ? 'out' : 'meet-out');
        setIsDoneForToday(false);
      } else {
        setAttendanceType('');
        setIsDoneForToday(true);
      }
    }
  };

  useEffect(() => {
    if (currentUser) determineAttendanceState(attendanceHistory, attendanceMode);
  }, [attendanceMode]);

  const handleRefreshLocation = async () => {
    setLocStatus('locating');
    try {
      const coords = await getCurrentLocation();
      const validation = validateLocationDistance(coords.latitude, coords.longitude);
      setUserCoords(coords);
      setLocStatus(validation.isValid ? 'success' : 'warning');
    } catch (err) {
      setLocStatus('error'); setLocError(err.message);
    }
  };

  const captureSnapshot = () => {
    if (!videoRef.current) return null;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.translate(canvas.width, 0); ctx.scale(-1, 1);
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.8);
  };

  const handleSubmit = async () => {
    if (faceStatus !== 'active') return;
    setFaceStatus('scanning'); setFaceError('');
    try {
      if (attendanceMode === 'reguler') {
        const { descriptor, angle } = await extractFaceDescriptorAndAngle(videoRef.current);
        if (angle < 0.6 || angle > 1.4) throw new Error('Tolong hadap lurus ke kamera saat menekan tombol.');
        const result = matchFace1toN(descriptor, [currentUser]);
        if (!result.isMatch) throw new Error('Wajah tidak cocok dengan profil NIM yang terdaftar.');
      }
      const photoBase64 = captureSnapshot();
      const lat = userCoords?.latitude || 0;
      const lng = userCoords?.longitude || 0;

      await MockApi.saveAttendance({ nim: currentUser.nim, type: attendanceType, latitude: lat, longitude: lng, photo_base64: photoBase64 });

      const newHistory = [...attendanceHistory, {
        id: Date.now(), nim: currentUser.nim, type: attendanceType,
        timestamp: new Date().toISOString(), photo_base64: photoBase64, latitude: lat, longitude: lng,
      }];
      setAttendanceHistory(newHistory);
      setMatchedNim(currentUser.nim);
      setViewState('success');
      if (mediaStream) mediaStream.getTracks().forEach(t => t.stop());
    } catch (err) {
      setFaceStatus('error'); setFaceError(err.message);
      setTimeout(() => setFaceStatus('active'), 3000);
    }
  };

  const isReadyToSubmit = faceStatus === 'active' && !isDoneForToday;

  const getButtonLabel = () => {
    if (faceStatus === 'scanning') return null;
    const map = { 'in': 'Check-In', 'out': 'Check-Out', 'meet-in': 'Meet-In', 'meet-out': 'Meet-Out' };
    return map[attendanceType] || '';
  };

  const typeLabel = getButtonLabel();
  const isZoom = attendanceMode === 'zoom';

  const locInfo = () => {
    if (locStatus === 'locating') return { text: 'Mencari lokasi GPS...', color: 'var(--info)', bg: 'var(--info-bg)' };
    if (locStatus === 'success') return { text: 'Lokasi berhasil ditemukan', color: 'var(--success)', bg: 'var(--success-bg)' };
    return { text: 'GPS ditandai', color: 'var(--text-secondary)', bg: 'var(--surface-2)' };
  };

  return (
    <div className="animate-fade-in" style={{ maxWidth: '900px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>

      {/* ── Page Title ── */}
      {viewState === 'active' && (
        <>
          {/* ── Header & Mode Selector ── */}
          <div className="card" style={{ padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
            <div>
              <h1 style={{ fontSize: 'var(--fs-3xl)', fontWeight: 800, marginBottom: 'var(--space-1)' }}>
                Presensi Wajah
              </h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--fs-sm)' }}>
                Pilih mode, pastikan wajah terlihat, dan verifikasi untuk mencatat kehadiran.
              </p>
            </div>

            {/* Mode Toggle */}
            <div style={{ 
              padding: 'var(--space-2)', display: 'flex', gap: 'var(--space-2)', 
              background: 'var(--surface-2)', border: '1px solid var(--border-color)', 
              borderRadius: 'var(--radius-lg)' 
            }}>
              {/* Opsi 1 */}
              <label style={{ flex: 1, position: 'relative', cursor: 'pointer' }}>
                <input 
                  type="radio" 
                  name="mode" 
                  value="reguler"
                  checked={attendanceMode === 'reguler'}
                  onChange={() => setAttendanceMode('reguler')} 
                  style={{ position: 'absolute', opacity: 0 }}
                />
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                  padding: 'var(--space-3) var(--space-4)',
                  borderRadius: 'var(--radius-md)',
                  transition: 'all 0.2s ease',
                  background: attendanceMode === 'reguler' ? 'white' : 'transparent',
                  boxShadow: attendanceMode === 'reguler' ? '0 2px 8px rgba(0,0,0,0.05)' : 'none',
                  border: attendanceMode === 'reguler' ? '1px solid var(--primary)' : '1px solid transparent',
                }}>
                  <div style={{
                    width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0,
                    border: attendanceMode === 'reguler' ? '6px solid var(--primary)' : '2px solid var(--border-color)',
                    background: 'white', transition: 'all 0.2s ease'
                  }} />
                  <div style={{ 
                    width: '36px', height: '36px', borderRadius: 'var(--radius-sm)', 
                    background: attendanceMode === 'reguler' ? 'var(--primary-subtle)' : 'var(--surface-3)', 
                    display: 'flex', alignItems: 'center', justifyContent: 'center' 
                  }}>
                    <Building2 size={18} style={{ color: attendanceMode === 'reguler' ? 'var(--primary)' : 'var(--text-tertiary)' }} />
                  </div>
                  <div>
                    <p style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, color: attendanceMode === 'reguler' ? 'var(--primary)' : 'var(--text-primary)' }}>Absen Lokasi</p>
                    <p style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Dari kantor / radius GPS</p>
                  </div>
                </div>
              </label>

              {/* Opsi 2 */}
              <label style={{ flex: 1, position: 'relative', cursor: 'pointer' }}>
                <input 
                  type="radio" 
                  name="mode" 
                  value="zoom"
                  checked={attendanceMode === 'zoom'}
                  onChange={() => setAttendanceMode('zoom')} 
                  style={{ position: 'absolute', opacity: 0 }}
                />
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                  padding: 'var(--space-3) var(--space-4)',
                  borderRadius: 'var(--radius-md)',
                  transition: 'all 0.2s ease',
                  background: attendanceMode === 'zoom' ? 'white' : 'transparent',
                  boxShadow: attendanceMode === 'zoom' ? '0 2px 8px rgba(0,0,0,0.05)' : 'none',
                  border: attendanceMode === 'zoom' ? '1px solid var(--info)' : '1px solid transparent',
                }}>
                  <div style={{
                    width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0,
                    border: attendanceMode === 'zoom' ? '6px solid var(--info)' : '2px solid var(--border-color)',
                    background: 'white', transition: 'all 0.2s ease'
                  }} />
                  <div style={{ 
                    width: '36px', height: '36px', borderRadius: 'var(--radius-sm)', 
                    background: attendanceMode === 'zoom' ? 'var(--info-bg)' : 'var(--surface-3)', 
                    display: 'flex', alignItems: 'center', justifyContent: 'center' 
                  }}>
                    <Monitor size={18} style={{ color: attendanceMode === 'zoom' ? 'var(--info)' : 'var(--text-tertiary)' }} />
                  </div>
                  <div>
                    <p style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, color: attendanceMode === 'zoom' ? 'var(--info)' : 'var(--text-primary)' }}>Absen Meeting</p>
                    <p style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Zoom / dinas luar</p>
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* ── Data Pengguna (NIM Otomatis) ── */}
          <div className="card" style={{ padding: 'var(--space-5)' }}>
            {isSearching && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', color: 'var(--text-secondary)' }}>
                <Loader2 size={18} style={{ animation: 'spin 0.7s linear infinite' }} />
                <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600 }}>Menyiapkan data pengguna...</span>
              </div>
            )}

            {!localStorage.getItem('user_nim') && !currentUser && !isSearching && (
              <form onSubmit={handleSearchNim}>
                <div className="search-row">
                  <div className="input-group">
                    <label className="input-label">Nomor Induk Mahasiswa (NIM)</label>
                    <div className="input-wrapper">
                      <span className="input-icon"><Search size={16} /></span>
                      <input
                        type="text"
                        className="input-field"
                        placeholder="Masukkan NIM Anda..."
                        value={searchNim}
                        onChange={e => setSearchNim(e.target.value)}
                        disabled={isSearching}
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    className={`btn ${isZoom ? 'btn-info' : 'btn-primary'}`}
                    style={{ height: '44px', alignSelf: 'flex-end', flexShrink: 0 }}
                    disabled={isSearching || !searchNim.trim()}
                  >
                    <Search size={16} /> Cari
                  </button>
                </div>
              </form>
            )}

            {currentUser && !isSearching && (
              <div style={{
                padding: 'var(--space-3) var(--space-4)',
                background: 'var(--surface-2)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-color)',
                display: 'flex', alignItems: 'center', gap: 'var(--space-4)',
                flexWrap: 'wrap',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flex: 1, minWidth: '160px' }}>
                  <div style={{
                    width: '32px', height: '32px', borderRadius: '50%',
                    background: isZoom ? 'var(--info-bg)' : 'var(--primary-subtle)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <User size={16} style={{ color: isZoom ? 'var(--info)' : 'var(--primary)' }} />
                  </div>
                  <div>
                    <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-tertiary)' }}>
                      Mode <strong style={{ textTransform: 'uppercase' }}>{attendanceMode}</strong>
                    </p>
                    <p style={{ fontSize: 'var(--fs-sm)', fontWeight: 700 }}>{currentUser.nim}</p>
                  </div>
                </div>

                <div>
                  {isDoneForToday ? (
                    <span className="badge badge-success">
                      <CheckCircle2 size={12} />
                      Selesai Hari Ini
                    </span>
                  ) : (
                    <span className={`badge ${isZoom ? 'badge-info' : 'badge-warning'}`}>
                      {(attendanceType === 'in' || attendanceType === 'meet-in')
                        ? <LogIn size={12} /> : <LogOut size={12} />}
                      Menunggu {typeLabel}
                    </span>
                  )}
                </div>
              </div>
            )}

            {!currentUser && !isSearching && localStorage.getItem('user_nim') && (
              <div style={{
                padding: 'var(--space-3) var(--space-4)',
                background: 'var(--surface-2)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-color)',
                display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
              }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <User size={16} style={{ color: 'var(--text-tertiary)' }} />
                </div>
                <div>
                  <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-tertiary)' }}>NIM Terdaftar di Perangkat Ini</p>
                  <p style={{ fontSize: 'var(--fs-sm)', fontWeight: 700 }}>{localStorage.getItem('user_nim')}</p>
                </div>
              </div>
            )}

            {faceError && (
              <div className="alert alert-error" style={{ marginTop: (currentUser || localStorage.getItem('user_nim')) ? 'var(--space-3)' : 0 }}>
                <XCircle size={15} className="alert-icon" />
                <span style={{ fontSize: 'var(--fs-sm)' }}>{faceError}</span>
              </div>
            )}
          </div>

          {/* ── Camera + Map (Dengan Order HP Terbalik) ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }} className="attendance-grid">
            
            {/* CSS INLINE UNTUK MENGATUR URUTAN HP */}
            <style>
              {`
                @media(max-width: 640px) {
                  .attendance-grid {
                    display: flex !important;
                    flex-direction: column;
                  }
                  .camera-panel { order: 2; }
                  .map-panel { order: 1; }
                }
              `}
            </style>

            {/* Camera Panel */}
            <div className="card camera-panel" style={{ padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div className="panel-header" style={{ paddingBottom: 'var(--space-3)', marginBottom: 0 }}>
                <div className="panel-icon panel-icon-primary"><Camera size={16} /></div>
                <div>
                  <p className="panel-title">Kamera Absensi</p>
                  <p className="panel-subtitle">Verifikasi wajah real-time</p>
                </div>
              </div>

              <div className="camera-viewport">
                {faceStatus === 'loading_models' && (
                  <div style={{ color: 'rgba(255,255,255,0.7)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-3)', zIndex: 20 }}>
                    <Loader2 size={28} style={{ animation: 'spin 0.7s linear infinite' }} />
                    <span style={{ fontSize: 'var(--fs-sm)' }}>Memuat model AI...</span>
                  </div>
                )}

                <video ref={videoRef} autoPlay muted playsInline className="camera-video"
                  style={{ display: (faceStatus === 'active' || faceStatus === 'scanning' || faceStatus === 'error') && mediaStream ? 'block' : 'none' }}
                />

                {faceStatus !== 'loading_models' && (
                  <div className="camera-overlay">
                    <svg viewBox="0 0 200 250" style={{ width: '100%', height: '100%', opacity: faceStatus === 'scanning' ? 0.5 : 1, transition: 'opacity 0.3s' }}>
                      <g fill="none" stroke={faceStatus === 'scanning' ? 'var(--primary)' : 'rgba(255,255,255,0.85)'} strokeWidth="4" strokeDasharray="10 7">
                        <ellipse cx="100" cy="100" rx="60" ry="78" />
                        <path d="M 32 250 Q 32 200 100 200 Q 168 200 168 250" />
                      </g>
                      <g fill="none" stroke="rgba(0,0,0,0.5)" strokeWidth="2" strokeDasharray="10 7">
                        <ellipse cx="100" cy="100" rx="60" ry="78" />
                        <path d="M 32 250 Q 32 200 100 200 Q 168 200 168 250" />
                      </g>
                      <g stroke="rgba(255,255,255,0.7)" strokeWidth="1.5">
                        <line x1="100" y1="93" x2="100" y2="107" />
                        <line x1="93" y1="100" x2="107" y2="100" />
                      </g>
                    </svg>
                  </div>
                )}

                {faceStatus === 'scanning' && <div className="camera-scanning-border" />}

                {faceStatus === 'scanning' && (
                  <div className="camera-toast">
                    <Loader2 size={13} style={{ animation: 'spin 0.7s linear infinite' }} />
                    Memverifikasi wajah...
                  </div>
                )}

                {faceStatus === 'paused' && (
                  <div className="camera-placeholder">
                    <Search size={40} style={{ opacity: 0.4 }} />
                    <p>{isDoneForToday ? 'Presensi hari ini sudah selesai.' : 'Menunggu NIM untuk mengaktifkan kamera.'}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Map Panel */}
            <div className="card map-panel" style={{ padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div className="panel-header" style={{ paddingBottom: 'var(--space-3)', marginBottom: 0 }}>
                <div className="panel-icon panel-icon-info"><MapPin size={16} /></div>
                <div>
                  <p className="panel-title">Lokasi GPS</p>
                  <p className="panel-subtitle">Peta posisi real-time</p>
                </div>
              </div>

              <div style={{ borderRadius: 'var(--radius-xl)', overflow: 'hidden', height: '200px', border: '1px solid var(--border-color)' }}>
                <MapContainer
                  center={[TARGET_COORDINATE.latitude, TARGET_COORDINATE.longitude]}
                  zoom={17}
                  style={{ height: '100%', width: '100%' }}
                  zoomControl={false}
                  dragging={false}
                >
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='© OpenStreetMap' />
                  {userCoords && <MapUpdater center={userCoords} />}
                  {userCoords && (
                    <Marker position={[userCoords.latitude, userCoords.longitude]} icon={userIcon} zIndexOffset={100}>
                      <Popup>Lokasi Anda</Popup>
                    </Marker>
                  )}
                </MapContainer>
              </div>

              {isZoom ? (
                <div className="alert alert-info" style={{ fontSize: 'var(--fs-xs)' }}>
                  <Monitor size={14} className="alert-icon" />
                  <div>
                    <p className="alert-title">Mode Meeting Aktif</p>
                    <p className="alert-body">Lokasi Anda dicatat sebagai metadata. Tidak ada validasi radius.</p>
                  </div>
                </div>
              ) : (
                <div className={`alert ${locStatus === 'success' ? 'alert-success' : locStatus === 'locating' ? 'alert-info' : 'alert-neutral'}`} style={{ fontSize: 'var(--fs-xs)' }}>
                  {locStatus === 'locating'
                    ? <Loader2 size={14} className="alert-icon" style={{ animation: 'spin 0.7s linear infinite' }} />
                    : locStatus === 'success'
                      ? <CheckCircle2 size={14} className="alert-icon" />
                      : <MapPin size={14} className="alert-icon" />
                  }
                  <div>
                    <p className="alert-title">{locInfo().text}</p>
                    {userCoords && (
                      <p className="alert-body" style={{ fontFamily: 'monospace', marginTop: '2px' }}>
                        {userCoords.latitude.toFixed(5)}, {userCoords.longitude.toFixed(5)}
                      </p>
                    )}
                    {locStatus !== 'locating' && (
                      <button onClick={handleRefreshLocation} style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', marginTop: '4px', padding: 0 }}>
                        ↻ Refresh GPS
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Submit Button ── */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-3)' }}>
            <button
              className={`btn w-full btn-lg ${isZoom ? 'btn-info' : 'btn-primary'}`}
              style={{ maxWidth: '480px' }}
              onClick={handleSubmit}
              disabled={!isReadyToSubmit || faceStatus === 'scanning'}
            >
              {faceStatus === 'scanning' ? (
                <><Loader2 size={18} style={{ animation: 'spin 0.7s linear infinite' }} /> Memproses...</>
              ) : isDoneForToday ? (
                <><CheckCircle2 size={18} /> Presensi Selesai Hari Ini</>
              ) : (
                <>{(attendanceType === 'in' || attendanceType === 'meet-in') ? <LogIn size={18} /> : <LogOut size={18} />}
                  Catat Kehadiran — {typeLabel || '...'}</>
              )}
            </button>

            {!isReadyToSubmit && !isDoneForToday && faceStatus !== 'loading_models' && (
              <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-tertiary)', textAlign: 'center' }}>
                {!currentUser
                  ? '⓵ Masukkan NIM terlebih dahulu lalu tekan Cari'
                  : faceStatus === 'paused'
                    ? '⓶ Kamera belum aktif. Cari NIM terlebih dahulu.'
                    : 'Kamera sedang memuat...'}
              </p>
            )}
          </div>

          {/* ── Attendance History ── */}
          {currentUser && attendanceHistory.length > 0 && (
            <div className="card" style={{ padding: 'var(--space-5)' }}>
              <div className="flex items-center gap-2 mb-4">
                <History size={18} style={{ color: 'var(--primary)' }} />
                <h3 style={{ fontWeight: 700, fontSize: 'var(--fs-base)' }}>Riwayat Kehadiran Hari Ini</h3>
                <span className="badge badge-primary" style={{ marginLeft: 'auto' }}>{attendanceHistory.length} Catatan</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {attendanceHistory.map(record => {
                  const timeStr = new Date(record.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace(':', '.');
                  const isMeet = record.type.includes('meet');
                  const isIn = record.type.includes('in');
                  const badgeText = isIn ? 'IN' : 'OUT';
                  const typeDisplay = { in: 'Check-In', out: 'Check-Out', 'meet-in': 'Check-In', 'meet-out': 'Check-Out' };

                  return (
                    <div key={record.id} className="record-card">
                      <div className="record-photo">
                        { record.photo_base64 || record.photo_url ? (
                          <img src={record.photo_url || record.photo_base64} alt="Snapshot" />
                        ) : (
                          <User size={20} />
                        )}
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
          )}
        </>
      )}

      {/* ── Success View ── */}
      {viewState === 'success' && (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div className="success-view animate-fade-in" style={{ borderColor: isZoom ? 'var(--info-border)' : 'var(--success-border)' }}>
            <div className="success-icon-ring"
              style={{ background: isZoom ? 'var(--info-bg)' : 'var(--success-bg)', borderColor: isZoom ? 'var(--info-border)' : 'var(--success-border)' }}>
              <CheckCircle2 size={48} style={{ color: isZoom ? 'var(--info)' : 'var(--success)' }} />
            </div>

            <div>
              <h2 style={{ fontSize: 'var(--fs-2xl)', fontWeight: 800, marginBottom: 'var(--space-2)' }}>
                Presensi Berhasil!
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--fs-sm)', lineHeight: 1.7 }}>
                {isZoom
                  ? 'Kehadiran Zoom Anda telah dicatat dengan snapshot foto.'
                  : 'Kehadiran Anda telah dicatat dengan verifikasi lokasi dan biometrik.'}
              </p>
            </div>

            {/* Photo */}
            {attendanceHistory.length > 0 && attendanceHistory[attendanceHistory.length - 1].photo_base64 && (
              <div style={{
                width: '88px', height: '88px',
                borderRadius: '50%',
                overflow: 'hidden',
                border: `3px solid ${isZoom ? 'var(--info)' : 'var(--success)'}`,
                boxShadow: `0 0 0 4px ${isZoom ? 'var(--info-bg)' : 'var(--success-bg)'}`,
              }}>
                <img src={attendanceHistory[attendanceHistory.length - 1].photo_base64} alt="Captured" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            )}

            {/* NIM Info */}
            <div style={{
              width: '100%', padding: 'var(--space-3) var(--space-4)',
              background: 'var(--surface-2)', borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-color)', textAlign: 'left',
              display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
            }}>
              <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-md)', background: 'var(--primary-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <User size={18} style={{ color: 'var(--primary)' }} />
              </div>
              <div>
                <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-tertiary)' }}>NIM Terdaftar</p>
                <p style={{ fontSize: 'var(--fs-lg)', fontWeight: 800, fontFamily: 'monospace', letterSpacing: '0.04em' }}>{matchedNim}</p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-3)', width: '100%' }}>
              <button className={`btn flex-1 ${isZoom ? 'btn-info' : 'btn-primary'}`} onClick={() => window.location.href = '/'}>
                Kembali ke Home
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}