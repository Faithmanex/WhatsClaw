import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AppProvider } from './context/AppContext';
import Sidebar from './components/Sidebar';
import Overview from './pages/Overview';
import Settings from './pages/Settings';
import Contacts from './pages/Contacts';
import Chat from './pages/Chat';
import Broadcast from './pages/Broadcast';

function App() {
  return (
    <AppProvider>
      <Router>
        <div className="flex h-screen overflow-hidden bg-bg text-text selection:bg-accent/30 selection:text-accent-foreground">
          <Sidebar />
          <main className="flex-1 ml-64 overflow-y-auto p-8">
            <Routes>
              <Route path="/" element={<Overview />} />
              <Route path="/chat" element={<Chat />} />
              <Route path="/contacts" element={<Contacts />} />
              <Route path="/broadcast" element={<Broadcast />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </main>
        </div>
        <Toaster position="bottom-right" toastOptions={{
          style: {
            background: '#111',
            color: '#e5e5e5',
            border: '1px solid #1a1a1a',
          }
        }} />
      </Router>
    </AppProvider>
  );
}

export default App;
