import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Camera, CheckCircle2, XCircle, Loader2, User, Search, LogOut, LogIn, History } from 'lucide-react';
import { getCurrentLocation, validateLocationDistance, TARGET_COORDINATE, MAX_RADIUS_METERS } from '../utils/location';
import { MockApi } from '../utils/api';
import { loadFaceModels, extractFaceDescriptorAndAngle, matchFace1toN } from '../utils/face';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
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

// Map Updater to auto-pan when user position changes
function MapUpdater({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView([center.latitude, center.longitude], 17, { animate: true });
    }
  }, [center, map]);
  return null;
}

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
  const [faceStatus, setFaceStatus] = useState('paused'); // paused (waiting for NIM), loading_models, active, scanning, error
  const [faceError, setFaceError] = useState('');
  const [mediaStream, setMediaStream] = useState(null);
  const [allProfiles, setAllProfiles] = useState([]);
  const [matchedNim, setMatchedNim] = useState('');

  // Attendance Modes & Logic
  const [attendanceMode, setAttendanceMode] = useState('reguler'); // 'reguler' or 'zoom'
  const [searchNim, setSearchNim] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [currentUser, setCurrentUser] = useState(null); // The user profile based on NIM
  const [attendanceHistory, setAttendanceHistory] = useState([]);
  const [attendanceType, setAttendanceType] = useState('in'); // 'in' or 'out'
  const [isDoneForToday, setIsDoneForToday] = useState(false);

  // Initialize Camera & Location on Mount
  useEffect(() => {
    let stream = null;
    let isMounted = true;

    const initAttendance = async () => {
      // 1. Fetch all registered users
      try {
        const profiles = await MockApi.getAllUsers();
        if (profiles.length === 0) {
          if (isMounted) {
            setFaceStatus('error');
            setFaceError("Belum ada data pendaftar di server.");
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
          // Note: we stay 'paused' until they search NIM, but models are loaded
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

  const handleSearchNim = async (e) => {
    e.preventDefault();
    if (!searchNim.trim()) return;

    setIsSearching(true);
    setFaceError('');
    setIsDoneForToday(false);

    try {
      // 1. Verify if NIM exists in profiles (Required for both modes to link to a valid user)
      const profileInfo = allProfiles.find(p => p.nim === searchNim);
      
      if (!profileInfo) {
         throw new Error('NIM tidak ditemukan. Silakan Registrasi Wajah terlebih dahulu.');
      }
      
      setCurrentUser(profileInfo);

      // 2. Fetch today's records for this NIM
      const history = await MockApi.getTodayAttendance(searchNim);
      setAttendanceHistory(history);

      determineAttendanceState(history, attendanceMode);

    } catch (err) {
       setFaceError(err.message);
       setCurrentUser(null);
       setFaceStatus('paused');
    } finally {
      setIsSearching(false);
    }
  };

  // Determine state based on history and selected mode
  const determineAttendanceState = (history, mode) => {
    let modeRecords = [];
    if (mode === 'reguler') {
       modeRecords = history.filter(h => h.type === 'in' || h.type === 'out');
    } else {
       modeRecords = history.filter(h => h.type === 'meet-in' || h.type === 'meet-out');
    }

    // Logic: In a single day, if they only did 'in' or 'meet-in', the next action is 'out'/'meet-out'.
    // BUT we must look at the most recent record of that mode to determine state.
    // E.g., if there are 2 records (in, out), they are done. 
    // If they have 1 record (in), they must check out.
    // If they have 0 records, they check in.
    
    // Sort just in case to get the latest
    modeRecords.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // If multiple check-ins/outs happened the same day but they forgot to check out previous day, 
    // the backend API query strictly filters by CURDATE().
    // So if it's a new day, history length is 0 for today.
    
    if (modeRecords.length === 0) {
      setAttendanceType(mode === 'reguler' ? 'in' : 'meet-in');
      setIsDoneForToday(false);
    } else {
      const lastRecord = modeRecords[0]; // The most recent
      
      if (lastRecord.type === 'in' || lastRecord.type === 'meet-in') {
         // Next is out
         setAttendanceType(mode === 'reguler' ? 'out' : 'meet-out');
         setIsDoneForToday(false);
      } else if (lastRecord.type === 'out' || lastRecord.type === 'meet-out') {
         // Next is in again if they want to check in twice in a day, but standard implies they are done.
         // Let's cap it at 1 full cycle per day just in case.
         // Or we can let them check in again. But the prompt says "jika sudah check-in dan check-out maka selesai."
         // So if the last record is "out", they are done for this mode.
         setAttendanceType('');
         setIsDoneForToday(true);
      }
    }

    // Activate camera if ready
    if (!isDoneForToday && currentUser) {
      setFaceStatus('active');
    } else if (isDoneForToday) {
      setFaceStatus('paused'); 
    }
  };

  // Listen to mode changes to recalculate the button state without re-searching
  useEffect(() => {
    if (currentUser) {
      determineAttendanceState(attendanceHistory, attendanceMode);
    }
  }, [attendanceMode]);

  // Helper to capture a snapshot from the video stream
  const captureSnapshot = () => {
    if (!videoRef.current) return null;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    
    // Mirror the drawing context before drawing to fix the webcam reflection
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    // Return base64 JPEG
    return canvas.toDataURL('image/jpeg', 0.8);
  };

  const handleSubmitAttendance = async () => {
    // Both modes just require Face Active now, no location barriers
    if (faceStatus !== 'active') return;
    
    setFaceStatus('scanning');
    setFaceError('');

    try {
      // Extract profile and angle
      let descriptor = null;
      let angle = 0;
      
      if (attendanceMode === 'reguler') {
         const extraction = await extractFaceDescriptorAndAngle(videoRef.current);
         descriptor = extraction.descriptor;
         angle = extraction.angle;

         if (angle < 0.6 || angle > 1.4) {
           throw new Error("Tolong hadap lurus ke kamera saat menekan tombol.");
         }

         // 1:1 Matching against the current user's profile
         const result = matchFace1toN(descriptor, [currentUser]);
         if (!result.isMatch) {
            throw new Error("Wajah tidak cocok dengan profil NIM yang terdaftar.");
         }
      }

      // If ZOOM mode, or if Reguler matched successfully:
      // Snapshot
      const photoBase64 = captureSnapshot();
         
      // Send to Backend
      // Fallback location to 0,0 if location is disabled
      const lat = userCoords?.latitude || 0;
      const lng = userCoords?.longitude || 0;

      await MockApi.saveAttendance({
         nim: currentUser.nim,
         type: attendanceType, // 'in', 'out', 'meet-in', 'meet-out'
         latitude: lat,
         longitude: lng,
         photo_base64: photoBase64
      });

      // Refresh History visually 
      const newHistory = [...attendanceHistory, { 
          id: Date.now(),
          nim: currentUser.nim,
          type: attendanceType, 
          timestamp: new Date().toISOString(),
          photo_base64: photoBase64,
          latitude: lat,
          longitude: lng
      }];
      setAttendanceHistory(newHistory);

      setMatchedNim(currentUser.nim);
      setViewState('success');
      
      // Stop camera feed
      if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
      }
      
    } catch (err) {
      setFaceStatus('error');
      setFaceError(err.message);
      setTimeout(() => setFaceStatus('active'), 3000);
    }
  };

  // Check if camera (active) is ready
  // Location is no longer blocking for any mode!
  const isReadyToSubmit = faceStatus === 'active';

  const getButtonText = () => {
    if (attendanceType === 'in') return 'Check-In';
    if (attendanceType === 'out') return 'Check-Out';
    if (attendanceType === 'meet-in') return 'Meet-In';
    if (attendanceType === 'meet-out') return 'Meet-Out';
    return '';
  };

  return (
    <div className="animate-fade-in flex-col items-center max-w-5xl mx-auto gap-6 w-full pb-8">
      <div className="text-center w-full mb-2">
        <h1 className="text-3xl font-bold mb-2">Presensi Wajah</h1>
        <p className="text-secondary">Masukkan NIM, verifikasi lokasi, dan scan wajah Anda.</p>
      </div>

      {viewState === 'active' && (
        <div className="w-full flex-col gap-6">
          
          {/* Mode Selector - Radio Buttons */}
          <div className="flex flex-col sm:flex-row w-full max-w-lg mx-auto gap-4 mb-4">
            <label 
              className={`flex-1 flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${attendanceMode === 'reguler' ? 'bg-white border-primary shadow-md' : 'bg-slate-50 border-transparent hover:bg-slate-100'}`}
            >
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${attendanceMode === 'reguler' ? 'border-primary' : 'border-slate-300'}`}>
                 {attendanceMode === 'reguler' && <div className="w-2.5 h-2.5 bg-primary rounded-full"></div>}
              </div>
              <input 
                type="radio" 
                name="attendance_mode" 
                value="reguler" 
                className="hidden"
                checked={attendanceMode === 'reguler'} 
                onChange={() => setAttendanceMode('reguler')}
              />
              <div className="flex flex-col">
                <span className={`font-bold ${attendanceMode === 'reguler' ? 'text-primary' : 'text-slate-700'}`}>Absen Lokasi</span>
                <span className="text-xs text-secondary">Dari Kantor Radius GPS</span>
              </div>
            </label>

            <label 
              className={`flex-1 flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${attendanceMode === 'zoom' ? 'bg-white border-info shadow-md' : 'bg-slate-50 border-transparent hover:bg-slate-100'}`}
            >
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${attendanceMode === 'zoom' ? 'border-info' : 'border-slate-300'}`}>
                 {attendanceMode === 'zoom' && <div className="w-2.5 h-2.5 bg-info rounded-full"></div>}
              </div>
              <input 
                type="radio" 
                name="attendance_mode" 
                value="zoom" 
                className="hidden"
                checked={attendanceMode === 'zoom'} 
                onChange={() => setAttendanceMode('zoom')}
              />
              <div className="flex flex-col">
                <span className={`font-bold ${attendanceMode === 'zoom' ? 'text-info' : 'text-slate-700'}`}>Absen Meeting</span>
                <span className="text-xs text-secondary">Zoom/Dinas Luar</span>
              </div>
            </label>
          </div>
          
          {/* Top Panel: NIM Input & Details */}
          <div className="glass-panel p-6 shadow-sm border border-color">
            <form onSubmit={handleSearchNim} className="flex flex-col md:flex-row gap-4 items-end">
               <div className="flex-1 w-full">
                 <label className="block text-sm font-medium mb-1">Nomor Induk Mahasiswa (NIM)</label>
                 <div className="flex bg-slate-50 border rounded-lg focus-within:ring-2 ring-primary overflow-hidden">
                   <div className="p-3 text-secondary">
                     <Search size={20} />
                   </div>
                   <input 
                     type="text" 
                     className="bg-transparent border-none flex-1 focus:outline-none p-3"
                     placeholder="Masukkan NIM Anda..."
                     value={searchNim}
                     onChange={(e) => setSearchNim(e.target.value)}
                     disabled={isSearching}
                   />
                 </div>
               </div>
               <button type="submit" className="btn btn-primary h-[50px] px-8" disabled={isSearching || !searchNim.trim()} style={ attendanceMode === 'zoom' ? {background: 'linear-gradient(135deg, var(--info), #2563eb)'} : {} }>
                 {isSearching ? <Loader2 className="animate-spin" size={20} /> : 'Cek Status'}
               </button>
            </form>

            {/* Attendance Status Warning */}
            {currentUser && !isSearching && (
              <div className="mt-4 p-4 rounded-lg bg-slate-50 border flex flex-col md:flex-row justify-between items-center gap-4">
                 <div className="flex items-center gap-3">
                   <div className="p-2 bg-white rounded-full shadow-sm">
                     <User size={24} className={attendanceMode === 'zoom' ? 'text-info' : 'text-primary'} />
                   </div>
                   <div>
                     <p className="text-sm text-secondary">Identitas Modus <span className="uppercase font-bold">{attendanceMode}</span></p>
                     <p className="font-bold">{currentUser.nim}</p>
                   </div>
                 </div>

                 <div className="flex items-center gap-3">
                    {isDoneForToday ? (
                      <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-success text-white text-sm font-medium shadow-sm">
                        <CheckCircle2 size={16} /> Presensi {attendanceMode.toUpperCase()} Selesai
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-warning text-white text-sm font-medium shadow-sm">
                        {(attendanceType === 'in' || attendanceType === 'meet-in') ? <LogIn size={16} /> : <LogOut size={16} />}
                        Menunggu {getButtonText()}
                      </span>
                    )}
                 </div>
              </div>
            )}
          </div>

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
                
                {faceStatus === 'paused' && (
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 20 }}>
                     <Search size={48} className="text-white opacity-50 mb-3" />
                     <p className="text-white text-sm font-medium px-4 text-center">
                        {isDoneForToday ? "Presensi hari ini sudah selesai." : "Masukkan NIM Anda terlebih dahulu untuk mengaktifkan kamera."}
                     </p>
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
                {/* Always mount map around target coordinate initially but pan to user coords when found */}
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
                  
                  {userCoords && <MapUpdater center={userCoords} />}
                  
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

              {/* Status information varies by Mode */}
              <div className="flex-1 flex-col justify-end">
                {attendanceMode === 'zoom' ? (
                   <div className="flex items-start gap-3 p-3 rounded-md" style={{ background: 'var(--info-bg)', border: '1px solid var(--info)' }}>
                      <MapPin size={24} className="text-info shrink-0" />
                      <div>
                        <p className="font-bold text-info">Mode Absen Meeting</p>
                        <p className="text-sm text-info">Lokasi Anda saat ini dicatat sebagai metadata absen layar/jarak jauh.</p>
                      </div>
                   </div>
                ) : (
                   <>
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
                            <p className="font-bold text-success">Map GPS Tracker Aktif</p>
                            <p className="text-sm text-secondary">Koordinat posisi Anda berhasil ditemukan oleh satelit.</p>
                          </div>
                        </div>
                      )}

                      {locStatus === 'error' && (
                        <div className="flex items-start gap-3 p-3 rounded-md border border-slate-200 shadow-sm bg-white">
                          <MapPin size={24} className="text-secondary shrink-0" />
                          <div>
                            <p className="font-bold text-slate-800">Map GPS Tracker Aktif</p>
                            <p className="text-sm text-secondary">Koordinat posisi Anda telah ditandai pada rekaman absensi.</p>
                            <button 
                              onClick={handleRefreshLocation}
                              className="text-xs font-bold underline mt-1 text-primary hover:text-black flex items-center gap-1"
                            >
                             <MapPin size={12}/> Refresh Titik GPS
                            </button>
                          </div>
                        </div>
                      )}
                   </>
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
              style={Object.assign({
                opacity: isReadyToSubmit ? 1 : 0.6,
                transform: isReadyToSubmit && faceStatus !== 'scanning' ? 'scale(1.05)' : 'none',
                background: !isReadyToSubmit ? 'var(--button-disabled)' : undefined
              }, attendanceMode === 'zoom' && isReadyToSubmit ? {background: 'linear-gradient(135deg, var(--info), #2563eb)'} : {})}
            >
              {faceStatus === 'scanning' ? (
                <><Loader2 className="animate-spin mr-2" size={20} inline="true" /> Memproses...</>
              ) : (
                `Catat Kehadiran (${getButtonText()})`
              )}
            </button>
          </div>
          
          {!isReadyToSubmit && locStatus !== 'locating' && faceStatus !== 'loading_models' && (
             <p className="text-center text-sm text-error mt-2">
               * {isDoneForToday ? "Selesai." : attendanceMode === 'reguler' ? "Tombol presensi akan aktif jika lokasi valid, NIM diisi, dan kamera menyala." : "Tombol presensi Zoom akan aktif jika NIM diisi dan kamera siap."}
             </p>
          )}

          {/* Attendance History Panel */}
          {currentUser && attendanceHistory.length > 0 && (
             <div className="glass-panel p-6 shadow-sm border border-color mt-2 animate-fade-in">
                <div className="flex items-center gap-2 mb-4">
                   <History size={20} className="text-primary" />
                   <h3 className="text-lg font-bold">Riwayat Kehadiran Hari Ini</h3>
                </div>
                <div className="flex flex-col gap-3">
                   {attendanceHistory.map((record) => {
                      const date = new Date(record.timestamp);
                      const timeStr = date.toLocaleTimeString('id-ID', { hour: '2-digit', minute:'2-digit' });
                      return (
                         <div key={record.id} className="flex flex-col sm:flex-row gap-4 p-4 border rounded-lg bg-surface items-center sm:items-start shadow-sm">
                            <div className="w-20 h-20 rounded-lg overflow-hidden shrink-0 border border-color bg-slate-100 relative">
                               {record.photo_url ? (
                                 <img src={record.photo_url} alt="Snapshot" className="w-full h-full object-cover" />
                               ) : (
                                 <div className="w-full h-full flex items-center justify-center text-secondary">
                                   <User size={24} />
                                 </div>
                               )}
                               <div className="absolute top-1 right-1 bg-black bg-opacity-60 text-white text-[10px] uppercase font-bold px-1.5 py-0.5 rounded shadow-sm">
                                 {record.type}
                               </div>
                            </div>
                            <div className="flex-1 w-full text-center sm:text-left">
                               <div className="flex justify-between items-start mb-1">
                                  <h4 className="font-bold">Check-{record.type === 'in' ? 'In' : record.type === 'out' ? 'Out' : record.type === 'meet-in' ? 'Meet (In)' : 'Meet (Out)'}</h4>
                                  <span className="text-sm font-mono font-medium text-secondary">{timeStr}</span>
                               </div>
                               <p className="text-xs text-secondary mb-2 flex items-center sm:justify-start justify-center gap-1">
                                 <MapPin size={10} /> 
                                 Lat: {Number(record.latitude).toFixed(4)}, Lng: {Number(record.longitude).toFixed(4)}
                               </p>
                               {record.type.includes('meet') ? (
                                  <span className="inline-block px-2 py-1 bg-info bg-opacity-10 text-info text-xs rounded-full font-medium">Zoom (No Loc Valid)</span>
                               ) : (
                                  <span className="inline-block px-2 py-1 bg-success bg-opacity-10 text-success text-xs rounded-full font-medium">Valid</span>
                               )}
                            </div>
                         </div>
                      );
                   })}
                </div>
             </div>
          )}

        </div>
      )}

      {/* Success View */}
      {viewState === 'success' && (
         <div className="glass-panel p-10 flex-col items-center gap-6 w-full max-w-lg text-center animate-fade-in mt-4 border-2 shadow-xl" style={{ borderColor: attendanceMode === 'zoom' ? 'var(--info)' : 'var(--success)' }}>
           <div className="p-6 rounded-full" style={{ background: attendanceMode === 'zoom' ? 'var(--info-bg)' : 'var(--success-bg)' }}>
             <CheckCircle2 size={80} className={attendanceMode === 'zoom' ? "text-info" : "text-success"} />
           </div>
           
           <div className="w-full bg-slate-50 border p-4 rounded-lg text-left shadow-sm mb-2" style={{ background: 'var(--surface)' }}>
             <p className="text-sm text-secondary font-medium uppercase tracking-wider mb-1">Identitas Absen {attendanceMode.toUpperCase()}</p>
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
             <h2 className="text-3xl font-bold mb-2">Presensi Berhasil!</h2>
             <p className="text-lg text-secondary mb-4">
               {attendanceMode === 'reguler' ? "Kehadiran Anda telah dicatat dalam sistem BPJS dengan verifikasi lokasi dan biometrik." : "Kehadiran ZOOM Anda telah dicatat dengan foto snapshot."}
             </p>

             {/* Show the latest snapshot */}
             {attendanceHistory.length > 0 && attendanceHistory[attendanceHistory.length - 1].photo_base64 && (
                <div className="mt-4 p-2 mx-auto w-32 h-32 rounded-full border-4 shadow-md overflow-hidden" style={{ borderColor: 'var(--success)' }}>
                  <img src={attendanceHistory[attendanceHistory.length - 1].photo_base64} alt="Captured" className="w-full h-full object-cover" />
                </div>
             )}
           </div>
           
           <div className="w-full flex gap-4 mt-6">
             <button className="btn btn-primary flex-1 py-3 bg-white text-black border shadow-sm hover:bg-slate-50" onClick={() => {
                setViewState('active');
                setSearchNim('');
                setCurrentUser(null);
                setAttendanceHistory([]);
                setFaceStatus('paused'); // Wait for new NIM
                
                // Reboot camera logic if needed, although user can just refresh
                window.location.reload(); 
             }}>
               Absen Orang Lain
             </button>
             <button className="btn btn-primary flex-1 py-3" onClick={() => window.location.href = '/'}>
               Kembali ke Home
             </button>
           </div>
        </div>
      )}

    </div>
  );
}
