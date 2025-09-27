import React from 'react';
import { HashRouter as Router, Routes, Route, Link } from 'react-router-dom';
import './styles/App.css';
import DebateTimer from './DebateTimer';
import SettingsPage from './DebateSetting'; // 新增的设置页面组件

function App() {
    return (
        <Router>
            <div className="App">

                {/* 路由配置 */}
                <Routes>
                    <Route path="/" element={<DebateTimer />} />
                    <Route path="/settings" element={<SettingsPage />} />
                </Routes>
            </div>
        </Router>
    );
}

export default App;
