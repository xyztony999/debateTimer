import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import './styles/App.css';
import { OfflineBanner } from './components/PwaBits';

const DebateTimer = lazy(() => import('./DebateTimer'));
const SettingsPage = lazy(() => import('./DebateSetting'));
const LoginPage = lazy(() => import('./LoginPage'));
const AdminPage = lazy(() => import('./AdminPage'));
const DisplayTimer = lazy(() => import('./DisplayTimer'));
const RecordsPage = lazy(() => import('./RecordsPage'));
const RecordDetailPage = lazy(() => import('./RecordDetailPage'));
const GalleryPage = lazy(() => import('./GalleryPage'));
const StatusPage = lazy(() => import('./components/StatusPage'));

function App() {
    return (
        <AuthProvider>
            <Router>
                <div className="App">
                    <OfflineBanner />
                    <Suspense fallback={null}>
                        <Routes>
                            <Route path="/login" element={<LoginPage />} />
                            <Route path="/display/:token" element={<DisplayTimer />} />
                            <Route path="/gallery" element={<GalleryPage />} />
                            <Route path="/gallery/:id" element={<GalleryPage />} />
                            <Route
                                path="/"
                                element={(
                                    <ProtectedRoute>
                                        <DebateTimer />
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
