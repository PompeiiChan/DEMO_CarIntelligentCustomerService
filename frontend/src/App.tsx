import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Chat from './pages/Chat';
import Agent from './pages/Agent';
import Queue from './pages/Queue';
import Knowledge from './pages/Knowledge';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/chat" replace />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/agent" element={<Agent />} />
        <Route path="/queue" element={<Queue />} />
        <Route path="/knowledge" element={<Knowledge />} />
      </Routes>
    </BrowserRouter>
  );
}
