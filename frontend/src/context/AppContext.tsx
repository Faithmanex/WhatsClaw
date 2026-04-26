import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';

interface AppContextType {
  socket: Socket | null;
  status: 'connected' | 'qr' | 'disconnected';
  qrCode: string | null;
  modelsRegistry: any;
  personasRegistry: any;
  config: any;
  refreshConfig: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [status, setStatus] = useState<'connected' | 'qr' | 'disconnected'>('disconnected');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [modelsRegistry, setModelsRegistry] = useState({});
  const [personasRegistry, setPersonasRegistry] = useState([]);
  const [config, setConfig] = useState({});

  useEffect(() => {
    const newSocket = io('/');
    setSocket(newSocket);

    newSocket.on('status', (s) => setStatus(s));
    newSocket.on('qr', (qr) => {
      setQrCode(qr);
      setStatus('qr');
    });

    return () => {
      newSocket.close();
    };
  }, []);

  const fetchInitialData = async () => {
    try {
      const [statusRes, configRes, modelsRes, personasRes] = await Promise.allSettled([
        fetch('/api/status').then(r => r.json()),
        fetch('/api/config').then(r => r.json()),
        fetch('/api/models').then(r => r.json()),
        fetch('/api/personas').then(r => r.json())
      ]);

      if (statusRes.status === 'fulfilled') {
        setStatus(statusRes.value.connection);
        setQrCode(statusRes.value.qr ?? null);
      }
      if (configRes.status === 'fulfilled') setConfig(configRes.value);
      if (modelsRes.status === 'fulfilled') setModelsRegistry(modelsRes.value);
      if (personasRes.status === 'fulfilled') setPersonasRegistry(personasRes.value);
    } catch (e) {
      console.error('Failed to fetch initial data', e);
    }
  };

  useEffect(() => {
    fetchInitialData();
  }, []);

  const refreshConfig = async () => {
    const configRes = await fetch('/api/config').then(r => r.json());
    setConfig(configRes);
  };

  return (
    <AppContext.Provider value={{ socket, status, qrCode, modelsRegistry, personasRegistry, config, refreshConfig }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within AppProvider');
  return context;
};
