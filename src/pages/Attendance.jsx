import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Camera, CheckCircle2, XCircle, Loader2, User } from 'lucide-react';
import { getCurrentLocation, validateLocationDistance, TARGET_COORDINATE, MAX_RADIUS_METERS } from '../utils/location';
import { loadFaceModels, extractFaceDescriptorAndAngle, getAllUserProfilesFromDB, matchFace1toN } from '../utils/face';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix leaflet default icon issue in React
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom Icon for User's Location
const userIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

export default function Attendance() {
  const videoRef = useRef(null);
  
  // Overall State: 'active' (showing map & cam), 'success'
  const [viewState, setViewState] = useState('active');

  // Location States
  const [locStatus, setLocStatus] = useState('locating'); // locating, success, error
  const [locError, setLocError] = useState('');
  const [distance, setDistance] = useState(null);
  const [userCoords, setUserCoords] = useState(null);

  // Face/Camera States
  const [faceStatus, setFaceStatus] = useState('loading_models'); // loading_models, active, scanning, error
  const [faceError, setFaceError] = useState('');
  const [mediaStream, setMediaStream] = useState(null);
  const [allProfiles, setAllProfiles] = useState([]);
  const [matchedNim, setMatchedNim] = useState('');

  // Initialize Camera & Location on Mount
  useEffect(() => {
    let stream = null;
    let isMounted = true;

    const initAttendance = async () => {
      // 1. Fetch all registered users for 1:N checking
      try {
        const profiles = await getAllUserProfilesFromDB();
        if (profiles.length === 0) {
          if (isMounted) {
            setFaceStatus('error');
            setFaceError("Belum ada data pendaftar di server. Silakan ke halaman Registrasi Wajah terlebih dahulu.");
            setLocStatus('error');
            setLocError("Registrasi wajah diperlukan sebelum absen.");
          }
          return;
        }
        if (isMounted) setAllProfiles(profiles);
      } catch (err) {
        if (isMounted) {
             setFaceStatus('error');
             setFaceError(err.message);
        }
        return;
      }

      // 2. Init Camera
      try {
        await loadFaceModels();
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (isMounted) {
          setMediaStream(stream);
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
          setFaceStatus('active');
        }
      } catch (err) {
        if (isMounted) {
          setFaceStatus('error');
          setFaceError("Gagal mengakses kamera: " + err.message);
        }
      }

      // 3. Init Location (can also be done concurrently)
      try {
        const coords = await getCurrentLocation();
        const validation = validateLocationDistance(coords.latitude, coords.longitude);
        if (isMounted) {
          setUserCoords(coords);
          setDistance(validation.distance);
          if (validation.isValid) {
            setLocStatus('success');
          } else {
            setLocStatus('error');
            setLocError(`Di luar radius absensi (Jarak Anda: ${Math.round(validation.distance)}m, Maks: 30m).`);
          }
        }
      } catch (err) {
        if (isMounted) {
          setLocStatus('error');
          setLocError(err.message);
        }
      }
    };

    initAttendance();

    return () => {
      isMounted = false;
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const handleRefreshLocation = async () => {
    setLocStatus('locating');
    setLocError('');
    try {
      const coords = await getCurrentLocation();
      const validation = validateLocationDistance(coords.latitude, coords.longitude);
      setUserCoords(coords);
      setDistance(validation.distance);
      if (validation.isValid) {
        setLocStatus('success');
      } else {
        setLocStatus('error');
        setLocError(`Di luar radius absensi (Jarak Anda: ${Math.round(validation.distance)}m, Maks: 30m).`);
      }
    } catch (err) {
      setLocStatus('error');
      setLocError(err.message);
    }
  };

  const handleSubmitAttendance = async () => {
    if (faceStatus !== 'active' || locStatus !== 'success') return;
    
    setFaceStatus('scanning');
    setFaceError('');

    try {
      // Extract profile and angle
      const { descriptor, angle } = await extractFaceDescriptorAndAngle(videoRef.current);
      
      if (angle < 0.6 || angle > 1.4) {
        throw new Error("Tolong hadap lurus ke kamera saat menekan tombol.");
      }

      // 1:N broad search against database
      const result = matchFace1toN(descriptor, allProfiles);

      if (result.isMatch) {
        setMatchedNim(result.nim);
        setViewState('success');
        if (mediaStream) {
          mediaStream.getTracks().forEach(track => track.stop());
        }
      } else {
        throw new Error("Wajah ini tidak dikenali di database.");
      }
    } catch (err) {
      setFaceStatus('error');
      setFaceError(err.message);
      setTimeout(() => setFaceStatus('active'), 3000);
    }
  };

  // Check if both location (success) and camera (active) are ready
  const isReadyToSubmit = locStatus === 'success' && faceStatus === 'active';

  return (
    <div className="animate-fade-in flex-col items-center max-w-5xl mx-auto gap-6 w-full pb-8">
      <div className="text-center w-full mb-2">
        <h1 className="text-3xl font-bold mb-2">Check-In Absensi</h1>
        <p className="text-secondary">Pastikan Anda berada di lokasi dan wajah terlihat jelas.</p>
      </div>

      {viewState === 'active' && (
        <div className="w-full flex-col gap-6">
          <div className="flex flex-col md:flex-row gap-6 w-full">
            
            {/* Left Panel: Camera Stream */}
            <div className="glass-panel p-6 flex-col flex-1 gap-4 shadow-sm border border-color">
              <div className="flex items-center gap-3 border-b pb-3 border-color">
                <div className="bg-blue-100 text-info p-2 rounded-full" style={{ background: 'var(--info-bg)' }}>
                  <Camera size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-bold">Kamera Absensi</h2>
                </div>
              </div>
              
              <div style={{
                width: '100%',
                aspectRatio: '4/3',
                background: '#1e293b',
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                margin: '0 auto'
              }}>
                {faceStatus === 'loading_models' && (
                  <div className="flex-col items-center gap-2 text-white z-20">
                    <Loader2 className="animate-spin" size={24} />
                    <span className="text-sm">Menyiapkan model wajah...</span>
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
                    display: (faceStatus === 'active' || faceStatus === 'scanning' || faceStatus === 'error') && mediaStream ? 'block' : 'none',
                    transform: 'scaleX(-1)' // mirror for webcam
                  }}
                />

                {/* Head Outline Guide Overlay - Black Outline with White Border */}
                {faceStatus !== 'loading_models' && (
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
                      style={{ width: '100%', height: '100%', transition: 'opacity 0.3s', opacity: faceStatus === 'scanning' ? 0.5 : 1 }}
                    >
                      {/* Outer White Border */}
                      <g 
                        fill="none" 
                        stroke={faceStatus === 'scanning' ? 'var(--primary)' : 'rgba(255, 255, 255, 0.9)'} 
                        strokeWidth="5" 
                        strokeDasharray="8 6"
                      >
                        <ellipse cx="100" cy="100" rx="60" ry="80" />
                        <path d="M 30 250 Q 30 200 100 200 Q 170 200 170 250" />
                      </g>
                      
                      {/* Inner Black Stroke */}
                      <g 
                        fill="none" 
                        stroke={faceStatus === 'scanning' ? 'rgba(0,0,0,0.3)' : 'rgba(0, 0, 0, 0.7)'} 
                        strokeWidth="3" 
                        strokeDasharray="8 6"
                      >
                        <ellipse cx="100" cy="100" rx="60" ry="80" />
                        <path d="M 30 250 Q 30 200 100 200 Q 170 200 170 250" />
                      </g>

                      {/* Center crosshair small indicator */}
                      <g strokeWidth="2" style={{ stroke: 'rgba(255, 255, 255, 0.8)' }}>
                        <line x1="100" y1="90" x2="100" y2="110" />
                        <line x1="90" y1="100" x2="110" y2="100" />
                      </g>
                    </svg>
                  </div>
                )}
                
                {faceStatus === 'scanning' && (
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, border: '4px solid var(--primary)', pointerEvents: 'none', animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }}></div>
                )}
                {faceStatus === 'scanning' && (
                  <div style={{ position: 'absolute', left: 0, right: 0, bottom: '1rem', textAlign: 'center', pointerEvents: 'none', zIndex: 10 }}>
                    <span style={{ background: 'rgba(0,0,0,0.6)', color: 'white', padding: '0.5rem 1rem', borderRadius: '9999px', fontSize: '0.875rem', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: '0.5rem', backdropFilter: 'blur(4px)', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
                      <Loader2 className="animate-spin" size={16} /> Memverifikasi...
                    </span>
                  </div>
                )}
              </div>

              {faceStatus === 'error' && (
                <div className="p-3 mt-2 rounded-md flex items-start gap-2 text-sm" style={{ background: 'var(--error-bg)', color: 'var(--error)' }}>
                  <XCircle size={18} className="shrink-0 mt-0.5" />
                  <span>{faceError}</span>
                </div>
              )}
            </div>

            {/* Right Panel: Location Details */}
            <div className="glass-panel p-6 flex-col flex-1 gap-4 shadow-sm border border-color">
              <div className="flex items-center gap-3 border-b pb-3 border-color">
                <div className="bg-blue-100 text-info p-2 rounded-full" style={{ background: 'var(--info-bg)' }}>
                  <MapPin size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-bold">Lokasi GPS</h2>
                </div>
              </div>
              
              <div style={{ width: '100%', height: '240px', borderRadius: 'var(--radius-md)', overflow: 'hidden', zIndex: 0 }}>
                {/* Always mount map around target coordinate and add a Circle */}
                <MapContainer 
                  center={[TARGET_COORDINATE.latitude, TARGET_COORDINATE.longitude]} 
                  zoom={17} 
                  style={{ height: '100%', width: '100%' }}
                  zoomControl={false}
                  dragging={false}
                >
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; OpenStreetMap contributors'
                  />
                  {/* BPJS Target Circle Overlay */}
                  <Circle 
                    center={[TARGET_COORDINATE.latitude, TARGET_COORDINATE.longitude]}
                    radius={MAX_RADIUS_METERS}
                    pathOptions={{ color: 'var(--primary)', fillColor: 'var(--primary)', fillOpacity: 0.2 }}
                  />
                  {/* Office Marker */}
                  <Marker position={[TARGET_COORDINATE.latitude, TARGET_COORDINATE.longitude]}>
                    <Popup>Kantor BPJS Ketenagakerjaan</Popup>
                  </Marker>
                  
                  {/* User Pin, only generated if we have coordinates */}
                  {userCoords && (
                    <Marker 
                      position={[userCoords.latitude, userCoords.longitude]}
                      icon={userIcon}
                      zIndexOffset={100}
                    >
                      <Popup>Lokasi Anda Sekarang</Popup>
                    </Marker>
                  )}
                </MapContainer>
              </div>

              <div className="flex-1 flex-col justify-end">
                {locStatus === 'locating' && (
                  <div className="flex items-center gap-2 text-secondary p-3 rounded-md bg-slate-50 border">
                    <Loader2 className="animate-spin" size={18} />
                    <span className="text-sm font-medium">Mencari lokasi akurat...</span>
                  </div>
                )}
                
                {locStatus === 'success' && (
                  <div className="flex items-start gap-3 p-3 rounded-md" style={{ background: 'var(--success-bg)', border: '1px solid var(--success)' }}>
                    <CheckCircle2 size={24} className="text-success shrink-0" />
                    <div>
                      <p className="font-bold text-success">Lokasi Valid</p>
                      <p className="text-sm text-secondary">Jarak Anda: {Math.round(distance)} meter dari titik target.</p>
                    </div>
                  </div>
                )}

                {locStatus === 'error' && (
                  <div className="flex items-start gap-3 p-3 rounded-md" style={{ background: 'var(--error-bg)', border: '1px solid var(--error)' }}>
                    <XCircle size={24} className="text-error shrink-0" />
                    <div>
                      <p className="font-bold text-error">Lokasi Tidak Valid</p>
                      <p className="text-sm text-error">{locError}</p>
                      <button 
                        onClick={handleRefreshLocation}
                        className="text-xs font-bold underline mt-1 text-primary hover:text-black flex items-center gap-1"
                      >
                       <MapPin size={12}/> Coba Muat Ulang Peta
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
          </div>

          {/* Action Button at the bottom */}
          <div className="w-full flex justify-center mt-4">
            <button 
              className={`btn ${isReadyToSubmit ? 'btn-primary' : ''} px-12 py-4 text-lg w-full max-w-md shadow-lg transition-transform`} 
              onClick={handleSubmitAttendance}
              disabled={!isReadyToSubmit || faceStatus === 'scanning'}
              style={{
                opacity: isReadyToSubmit ? 1 : 0.6,
                transform: isReadyToSubmit && faceStatus !== 'scanning' ? 'scale(1.05)' : 'none',
                background: !isReadyToSubmit ? 'var(--button-disabled)' : undefined
              }}
            >
              {faceStatus === 'scanning' ? (
                <><Loader2 className="animate-spin mr-2" size={20} inline="true" /> Memproses...</>
              ) : (
                'Absen Sekarang'
              )}
            </button>
          </div>
          
          {!isReadyToSubmit && locStatus !== 'locating' && faceStatus !== 'loading_models' && (
             <p className="text-center text-sm text-error mt-2">
               * Tombol absen akan aktif jika lokasi valid dan kamera siap.
             </p>
          )}
        </div>
      )}

      {/* Success View */}
      {viewState === 'success' && (
        <div className="glass-panel p-10 flex-col items-center gap-6 w-full max-w-lg text-center animate-fade-in mt-4 border-2 shadow-xl" style={{ borderColor: 'var(--success)' }}>
           <div className="p-6 rounded-full" style={{ background: 'var(--success-bg)' }}>
             <CheckCircle2 size={80} className="text-success" />
           </div>
           
           <div className="w-full bg-slate-50 border p-4 rounded-lg text-left shadow-sm mb-2" style={{ background: 'var(--surface)' }}>
             <p className="text-sm text-secondary font-medium uppercase tracking-wider mb-1">Identitas Absen</p>
             <div className="flex items-center gap-3">
               <div className="p-2 bg-blue-50 text-primary rounded-full" style={{ background: 'var(--info-bg)' }}>
                 <User size={24} />
               </div>
               <div>
                  <p className="text-xs text-secondary">NIM Terdaftar</p>
                  <p className="text-xl font-bold font-mono">{matchedNim}</p>
               </div>
             </div>
           </div>

           <div>
             <h2 className="text-3xl font-bold mb-2">Check-in Berhasil!</h2>
             <p className="text-lg text-secondary">
               Kehadiran Anda telah dicatat dalam sistem BPJS dengan validasi lokasi (Jarak: {Math.round(distance)}m) dan verifikasi biometrik.
             </p>
           </div>
           
           <div className="w-full flex gap-4 mt-4">
             <button className="btn btn-primary flex-1 py-3" onClick={() => window.location.href = '/'}>
               Kembali ke Dashboard
             </button>
           </div>
        </div>
      )}

    </div>
  );
}
