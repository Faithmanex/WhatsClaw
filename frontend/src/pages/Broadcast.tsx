import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';

const Broadcast = () => {
  const [contacts, setContacts] = useState<Record<string, string>>({});
  const [selectedJids, setSelectedJids] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [results, setResults] = useState<any>(null);

  useEffect(() => {
    fetchContacts();
  }, []);

  const fetchContacts = async () => {
    try {
      const data = await fetch('/api/contacts').then(r => r.json());
      setContacts(data);
    } catch (e) {
      toast.error('Failed to load contacts');
    }
  };

  const toggleContact = (jid: string) => {
    const next = new Set(selectedJids);
    if (next.has(jid)) {
      next.delete(jid);
    } else {
      next.add(jid);
    }
    setSelectedJids(next);
  };

  const toggleAll = () => {
    if (selectedJids.size === Object.keys(contacts).length) {
      setSelectedJids(new Set());
    } else {
      setSelectedJids(new Set(Object.keys(contacts)));
    }
  };

  const sendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedJids.size === 0) return toast.error('Select at least one recipient');
    if (!message.trim()) return toast.error('Message cannot be empty');

    if (!confirm(`Send this message to ${selectedJids.size} contacts?`)) return;

    setIsSending(true);
    setResults(null);
    try {
      const res = await fetch('/api/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jids: Array.from(selectedJids),
          message: message
        })
      });

      const data = await res.json();

      if (res.ok) {
        toast.success(`Sent to ${data.successCount} of ${data.total} recipients`);
        setResults(data);
        setMessage('');
        setSelectedJids(new Set());
      } else {
        toast.error(data.error || 'Broadcast failed');
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsSending(false);
    }
  };

  const contactList = Object.entries(contacts);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold tracking-tight">Campaigns & Broadcasts</h2>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Recipient Selection */}
        <div className="lg:col-span-1 bg-surface border border-border rounded-xl flex flex-col h-[600px]">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h3 className="font-semibold">Recipients</h3>
            <span className="text-xs text-muted font-medium bg-bg px-2 py-1 rounded-full">
              {selectedJids.size} selected
            </span>
          </div>

          <div className="p-2 border-b border-border bg-bg/50">
            <button
              onClick={toggleAll}
              className="w-full text-xs font-medium text-accent hover:text-accent/80 transition-colors py-1"
            >
              {selectedJids.size === contactList.length && contactList.length > 0 ? 'Deselect All' : 'Select All'}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {contactList.length === 0 ? (
              <div className="p-4 text-center text-muted text-sm">No contacts available. Save contacts first.</div>
            ) : (
              <div className="space-y-1">
                {contactList.map(([jid, name]) => (
                  <label
                    key={jid}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-bg/50 cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedJids.has(jid)}
                      onChange={() => toggleContact(jid)}
                      className="w-4 h-4 text-accent bg-bg border-border rounded focus:ring-accent accent-accent"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{name}</p>
                      <p className="text-xs text-muted truncate">{jid}</p>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Message Composition */}
        <div className="lg:col-span-2 space-y-6">
          <form onSubmit={sendBroadcast} className="bg-surface border border-border rounded-xl p-6 space-y-4">
            <h3 className="font-semibold border-b border-border pb-4">Compose Broadcast</h3>

            <div>
              <label className="block text-xs font-medium text-muted uppercase mb-2">Message</label>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Type your message here..."
                rows={8}
                className="w-full bg-bg border border-border rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-accent resize-none"
              />
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={isSending || selectedJids.size === 0 || !message.trim()}
                className="px-6 py-2.5 bg-accent hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
              >
                {isSending ? 'Sending...' : `Send to ${selectedJids.size} recipients`}
              </button>
            </div>
          </form>

          {/* Results Area */}
          {results && (
            <div className="bg-surface border border-border rounded-xl p-6">
              <h3 className="font-semibold mb-4">Latest Campaign Results</h3>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="bg-bg/50 border border-border rounded-lg p-4">
                  <div className="text-xs text-muted uppercase mb-1">Success</div>
                  <div className="text-2xl font-bold text-green">{results.successCount}</div>
                </div>
                <div className="bg-bg/50 border border-border rounded-lg p-4">
                  <div className="text-xs text-muted uppercase mb-1">Failed</div>
                  <div className="text-2xl font-bold text-red">{results.errors?.length || 0}</div>
                </div>
              </div>

              {results.errors?.length > 0 && (
                <div className="mt-4 border-t border-border pt-4">
                  <h4 className="text-sm font-medium text-red mb-2">Errors:</h4>
                  <ul className="text-xs text-muted space-y-1 max-h-32 overflow-y-auto">
                    {results.errors.map((err: any, i: number) => (
                      <li key={i}>{err.jid}: {err.error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default Broadcast;
