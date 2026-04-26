import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useAppContext } from '../context/AppContext';
import toast from 'react-hot-toast';

const Overview = () => {
  const { status, qrCode } = useAppContext();
  const [pairNumber, setPairNumber] = useState('');
  const [pairingCode, setPairingCode] = useState<string | null>(null);

  const requestPairingCode = async () => {
    if (!pairNumber) return toast.error('Enter a phone number');
    try {
      const res = await fetch('/api/pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: pairNumber })
      }).then(r => r.json());

      if (res.ok) {
        setPairingCode(res.code);
        toast.success('Pairing code generated');
      } else {
        toast.error(res.error || 'Failed to generate code');
      }
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const logout = async () => {
    if (!confirm('Disconnect WhatsApp?')) return;
    await fetch('/api/logout', { method: 'POST' });
    toast.success('Disconnected');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold tracking-tight">Overview</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-surface border border-border rounded-xl p-6">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted mb-6">WhatsApp Connection</h3>

          <div className="flex flex-col items-center justify-center min-h-[280px] bg-bg/50 rounded-lg border border-border p-6">
            {status === 'connected' ? (
              <div className="text-center space-y-4">
                <div className="w-16 h-16 bg-green/20 text-green rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div className="text-green font-medium">WhatsApp Linked Successfully</div>
                <button onClick={logout} className="px-4 py-2 bg-red/10 text-red hover:bg-red/20 rounded-lg text-sm font-medium transition-colors">
                  Disconnect
                </button>
              </div>
            ) : status === 'qr' && qrCode ? (
              <div className="space-y-6 w-full max-w-sm">
                <div className="bg-white p-4 rounded-xl shadow-sm w-max mx-auto">
                  <QRCodeSVG value={qrCode} size={200} />
                </div>
                <div className="text-sm text-center text-muted">Scan with WhatsApp → Linked Devices</div>

                <div className="pt-4 border-t border-border">
                  <label className="block text-xs font-medium text-muted uppercase mb-2">Or Pair with Number</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="2348123456789"
                      value={pairNumber}
                      onChange={e => setPairNumber(e.target.value)}
                      className="flex-1 bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
                    />
                    <button
                      onClick={requestPairingCode}
                      className="px-4 py-2 bg-accent hover:bg-accent/90 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      Code
                    </button>
                  </div>
                  {pairingCode && (
                    <div className="mt-4 text-center">
                      <div className="text-xs text-muted mb-1">Your pairing code:</div>
                      <div className="text-2xl font-bold tracking-[0.25em] text-accent">{pairingCode}</div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-muted animate-pulse flex flex-col items-center">
                <svg className="w-8 h-8 mb-4 animate-spin opacity-50" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Waiting for gateway...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Overview;
