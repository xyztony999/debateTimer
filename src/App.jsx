import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import './styles/App.css';
import { OfflineBanner } from './components/PwaBits';

const TimerControlPage = lazy(() => import('./TimerControlPage'));
const SettingsPage = lazy(() => import('./DebateSetting'));
const LoginPage = lazy(() => import('./LoginPage'));
// Post-login steps (privacy notice, mandatory two-step setup). Its own guard:
// no session → /login, nothing owed → the original destination.
const GatePage = lazy(() => import('./GatePage'));
const AdminPage = lazy(() => import('./AdminPage'));
const TimerDisplayPage = lazy(() => import('./TimerDisplayPage'));
const RecordsPage = lazy(() => import('./RecordsPage'));
const RecordDetailPage = lazy(() => import('./RecordDetailPage'));
const GalleryPage = lazy(() => import('./GalleryPage'));
const StatusPage = lazy(() => import('./components/StatusPage'));

function App() {
    return (
        <AuthProvider>
            <Router basename={import.meta.env.BASE_URL}>
                <div className="App">
                    <OfflineBanner />
                    <Suspense fallback={null}>
                        <Routes>
                            <Route path="/login" element={<LoginPage />} />
                            <Route path="/gate" element={<GatePage />} />
                            <Route path="/display/:token" element={<TimerDisplayPage />} />
                            <Route path="/gallery" element={<GalleryPage />} />
                            <Route path="/gallery/:id" element={<GalleryPage />} />
                            <Route
                                path="/"
                                element={(
                                    <ProtectedRoute>
                                        <TimerControlPage />
                                    </ProtectedRoute>
                                )}
                            />
                            <Route
                                path="/settings"
                                element={(
                                    <ProtectedRoute>
                                        <SettingsPage />
                                    </ProtectedRoute>
                                )}
                            />
                            <Route
                                path="/records"
                                element={(
                                    <ProtectedRoute>
                                        <RecordsPage />
                                    </ProtectedRoute>
                                )}
                            />
                            <Route
                                path="/records/:id"
                                element={(
                                    <ProtectedRoute>
                                        <RecordDetailPage />
                                    </ProtectedRoute>
                                )}
                            />
                            <Route
                                path="/admin"
                                element={(
                                    <ProtectedRoute adminOnly>
                                        <AdminPage />
                                    </ProtectedRoute>
                                )}
                            />
                            <Route path="*" element={<StatusPage variant="notFound" />} />
                        </Routes>
                    </Suspense>
                </div>
            </Router>
        </AuthProvider>
    );
}

export default App;
