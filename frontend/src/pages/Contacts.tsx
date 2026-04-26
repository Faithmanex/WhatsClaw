import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';

const Contacts = () => {
  const [contacts, setContacts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [newJid, setNewJid] = useState('');
  const [newName, setNewName] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupParticipants, setGroupParticipants] = useState('');

  const fetchContacts = async () => {
    try {
      const data = await fetch('/api/contacts').then(r => r.json());
      setContacts(data);
    } catch (e) {
      toast.error('Failed to fetch contacts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContacts();
  }, []);

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newJid || !newName) return toast.error('Both fields are required');

    try {
      const response = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jid: newJid, name: newName })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(data.error || 'Failed to add contact');
        return;
      }
      toast.success('Contact added');
      setNewJid('');
      setNewName('');
      setIsAdding(false);
      fetchContacts();
    } catch (e) {
      toast.error('Failed to add contact');
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName) return toast.error('Group name required');

    const participants = (groupParticipants || '').split(',').map(n => n.trim()).filter(Boolean);

    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: groupName, participants })
      }).then(r => r.json());

      if (res.ok) {
        toast.success('Group created');
        setGroupName('');
        setGroupParticipants('');
        setIsCreatingGroup(false);
      } else {
        toast.error(res.error || 'Failed to create group');
      }
    } catch (e) {
      toast.error('Failed to create group');
    }
  };

  const handleDelete = async (jid: string) => {
    if (!confirm('Are you sure you want to remove this contact?')) return;
    try {
      const response = await fetch(`/api/contacts/${encodeURIComponent(jid)}`, { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(data.error || 'Failed to remove contact');
        return;
      }
      toast.success('Contact removed');
      fetchContacts();
    } catch (e) {
      toast.error('Failed to remove contact');
    }
  };

  const contactList = Object.entries(contacts);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">Contacts & Groups</h2>
        <div className="flex gap-2">
          <button
            onClick={() => { setIsCreatingGroup(!isCreatingGroup); setIsAdding(false); }}
            className="px-4 py-2 bg-surface border border-border hover:bg-bg/50 rounded-lg text-sm font-medium transition-colors"
          >
            {isCreatingGroup ? 'Cancel' : '+ Create Group'}
          </button>
          <button
            onClick={() => { setIsAdding(!isAdding); setIsCreatingGroup(false); }}
            className="px-4 py-2 bg-accent hover:bg-accent/90 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {isAdding ? 'Cancel' : '+ Add Contact'}
          </button>
        </div>
      </div>

      {isAdding && (
        <form onSubmit={handleAddContact} className="bg-surface border border-border rounded-xl p-6 space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">New Contact</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted uppercase mb-1">Phone Number (JID)</label>
              <input
                type="text"
                value={newJid}
                onChange={e => setNewJid(e.target.value)}
                placeholder="2348123456789@s.whatsapp.net"
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted uppercase mb-1">Display Name</label>
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="John Doe"
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button type="submit" className="px-4 py-2 bg-accent hover:bg-accent/90 text-white rounded-lg text-sm font-medium transition-colors">
              Save Contact
            </button>
          </div>
        </form>
      )}

      {isCreatingGroup && (
        <form onSubmit={handleCreateGroup} className="bg-surface border border-border rounded-xl p-6 space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">Create Group</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted uppercase mb-1">Group Name</label>
              <input
                type="text"
                value={groupName}
                onChange={e => setGroupName(e.target.value)}
                placeholder="My Group"
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted uppercase mb-1">Participants (comma separated)</label>
              <input
                type="text"
                value={groupParticipants}
                onChange={e => setGroupParticipants(e.target.value)}
                placeholder="2348123456789,..."
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button type="submit" className="px-4 py-2 bg-accent hover:bg-accent/90 text-white rounded-lg text-sm font-medium transition-colors">
              Create Group
            </button>
          </div>
        </form>
      )}

      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted">Loading contacts...</div>
        ) : contactList.length === 0 ? (
          <div className="p-8 text-center text-muted italic">No contacts synced yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted uppercase bg-bg/50 border-b border-border">
                <tr>
                  <th className="px-6 py-3 font-medium">Name</th>
                  <th className="px-6 py-3 font-medium">JID / Phone</th>
                  <th className="px-6 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {contactList.map(([jid, name]) => (
                  <tr key={jid} className="border-b border-border/50 hover:bg-bg/50">
                    <td className="px-6 py-4 font-medium">{name}</td>
                    <td className="px-6 py-4 text-muted">{jid}</td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleDelete(jid)}
                        className="text-red hover:text-red/80 font-medium"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Contacts;
