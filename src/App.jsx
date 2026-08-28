import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import './styles/App.css';

const DebateTimer = lazy(() => import('./DebateTimer'));
const SettingsPage = lazy(() => import('./DebateSetting'));
const LoginPage = lazy(() => import('./LoginPage'));
const AdminPage = lazy(() => import('./AdminPage'));
const DisplayTimer = lazy(() => import('./DisplayTimer'));

function App() {
    return (
        <AuthProvider>
            <Router>
                <div className="App">
                    <Suspense fallback={null}>
                        <Routes>
                            <Route path="/login" element={<LoginPage />} />
                            <Route path="/display/:token" element={<DisplayTimer />} />
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
                                path="/admin"
                                element={(
                                    <ProtectedRoute adminOnly>
                                        <AdminPage />
                                    </ProtectedRoute>
                                )}
                            />
                        </Routes>
                    </Suspense>
                </div>
            </Router>
        </AuthProvider>
    );
}

export default App;
