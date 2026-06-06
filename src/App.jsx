import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import './styles/App.css';

const DebateTimer = lazy(() => import('./DebateTimer'));
const SettingsPage = lazy(() => import('./DebateSetting'));

function App() {
    return (
        <Router>
            <div className="App">
                <Suspense fallback={null}>
                    <Routes>
                        <Route path="/" element={<DebateTimer />} />
                        <Route path="/settings" element={<SettingsPage />} />
                    </Routes>
                </Suspense>
            </div>
        </Router>
    );
}

export default App;
