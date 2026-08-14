import { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import toast from 'react-hot-toast';

const Settings = () => {
  const { config, modelsRegistry, providersRegistry, personasRegistry, refreshConfig } = useAppContext();

  // Local state for forms to avoid mutating context directly before save
  const [localConfig, setLocalConfig] = useState<any>({});
  const [instructions, setInstructions] = useState<any[]>([]);
  const [skills, setSkills] = useState<any[]>([]);

  const currentProvider = providersRegistry.find((p: any) => p.id === (localConfig.AI_PROVIDER || config.AI_PROVIDER));
  const currentModels = (currentProvider?.models || modelsRegistry[localConfig.AI_PROVIDER]) || [];

  useEffect(() => {
    setLocalConfig(config);
  }, [config]);

  useEffect(() => {
    fetchInstructions();
    fetchSkills();
  }, []);

  const fetchInstructions = async () => {
    try {
      const res = await fetch('/api/instructions').then(r => r.json());
      setInstructions(res);
    } catch (e) {
      toast.error('Failed to load instructions');
    }
  };

  const fetchSkills = async () => {
    try {
      const res = await fetch('/api/skills').then(r => r.json());
      setSkills(res);
    } catch (e) {
      toast.error('Failed to load skills');
    }
  };

  const [showAddRule, setShowAddRule] = useState(false);
  const [newRuleJid, setNewRuleJid] = useState('');
  const [newRuleText, setNewRuleText] = useState('');

  const handleAddInstruction = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newRuleJid || !newRuleText) {
      toast.error('JID and instructions are required');
      return;
    }
    try {
      const res = await fetch('/api/instructions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jid: newRuleJid, text: newRuleText })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Failed to add rule');
        return;
      }
      fetchInstructions();
      toast.success('Rule added');
      setShowAddRule(false);
      setNewRuleJid('');
      setNewRuleText('');
    } catch (e) {
      toast.error('Failed to add rule');
    }
  };

  const handleDeleteInstruction = async (jid: string) => {
    try {
      const res = await fetch(`/api/instructions/${encodeURIComponent(jid)}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Failed to remove rule');
        return;
      }
      fetchInstructions();
      toast.success('Rule removed');
    } catch (e) {
      toast.error('Failed to remove rule');
    }
  };

  const handleChange = (key: string, value: any) => {
    setLocalConfig({ ...localConfig, [key]: value });
  };

  const handleProviderChange = (value: string) => {
    const provider = providersRegistry.find((p: any) => p.id === value);
    const defaultModel = (provider?.models || []).find((m: any) => m.default) || (provider?.models || [])[0];
    setLocalConfig({ ...localConfig, AI_PROVIDER: value, AI_MODEL: defaultModel?.id || '' });
  };

  const handleTestProvider = async () => {
    const provider = currentProvider;
    if (!provider) return toast.error('Select a provider first');
    try {
      const payload: any = { id: provider.id };
      if (localConfig.API_KEY) payload.apiKey = localConfig.API_KEY;
      const res = await fetch('/api/providers/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok) toast.success(`✓ ${provider.name} OK — ${data.latencyMs}ms (${data.model})`);
      else toast.error(`✗ ${provider.name}: ${data.error || 'failed'}${data.status ? ` (HTTP ${data.status})` : ''}`);
    } catch (e: any) {
      toast.error('Test failed: ' + (e.message || e));
    }
  };

  const handleSaveAI = async () => {
    try {
      const provider = providersRegistry.find((p: any) => p.id === localConfig.AI_PROVIDER);
      const payload: any = {
        AI_PROVIDER: localConfig.AI_PROVIDER,
        AI_MODEL: localConfig.AI_MODEL,
      };
      if (localConfig.API_KEY && provider) {
        payload[provider.apiKeyEnvVar] = localConfig.API_KEY;
      }
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Failed to save configuration');
        return;
      }
      toast.success('AI Configuration Saved');
      setLocalConfig((prev: any) => ({ ...prev, API_KEY: '' }));
      refreshConfig();
    } catch (e: any) {
      toast.error('Failed to save configuration');
    }
  };

  const handleSavePolicy = async () => {
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          WHATSAPP_DM_POLICY: localConfig.WHATSAPP_DM_POLICY,
          WHATSAPP_ALLOW_FROM: localConfig.WHATSAPP_ALLOW_FROM,
          WHATSAPP_GROUP_POLICY: localConfig.WHATSAPP_GROUP_POLICY,
          WHATSAPP_READ_RECEIPTS: localConfig.WHATSAPP_READ_RECEIPTS,
          HISTORY_LIMIT: localConfig.HISTORY_LIMIT,
          WHATSAPP_MENTION_TRIGGER: localConfig.WHATSAPP_MENTION_TRIGGER
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Failed to save policy');
        return;
      }
      toast.success('Policy Saved');
      refreshConfig();
    } catch (e: any) {
      toast.error('Failed to save policy');
    }
  };

  const handleSavePersona = async () => {
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          PERSONA_NAME: localConfig.PERSONA_NAME,
          PERSONA_PROFILE: localConfig.PERSONA_PROFILE
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Failed to save persona');
        return;
      }
      toast.success('Persona Saved');
      refreshConfig();
    } catch (e: any) {
      toast.error('Failed to save persona');
    }
  };

  if (!localConfig.AI_PROVIDER) return <div className="p-4 text-muted">Loading settings...</div>;

  const selectedPersona = personasRegistry.find((p: any) => p.id === localConfig.PERSONA_PROFILE);

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <h2 className="text-2xl font-bold tracking-tight">Settings</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* AI Config */}
        <div className="bg-surface border border-border rounded-xl p-6 space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">AI Configuration</h3>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-muted uppercase mb-1">Provider</label>
              <select
                value={localConfig.AI_PROVIDER}
                onChange={e => handleProviderChange(e.target.value)}
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
              >
                {providersRegistry.length === 0 && <option value={localConfig.AI_PROVIDER}>{localConfig.AI_PROVIDER}</option>}
                {providersRegistry.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.name}{p.builtin ? '' : ' (custom)'}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted uppercase mb-1">Model</label>
              <select
                value={localConfig.AI_MODEL || ''}
                onChange={e => handleChange('AI_MODEL', e.target.value)}
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
              >
                {currentModels.map((m: any) => (
                  <option key={m.id} value={m.id}>{m.name}{m.default ? ' (default)' : ''}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted uppercase mb-1">API Key</label>
              <input
                type="password"
                placeholder={currentProvider?.keyPlaceholder || 'Leave blank to keep existing key'}
                onChange={e => handleChange('API_KEY', e.target.value)}
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
              />
              <p className="mt-1 text-[11px] text-muted">{currentProvider?.description}</p>
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={handleSaveAI} className="flex-1 py-2 bg-accent hover:bg-accent/90 text-white rounded-lg text-sm font-medium transition-colors">
              Save AI Config
            </button>
            <button onClick={handleTestProvider} className="px-4 py-2 bg-bg border border-border hover:border-accent rounded-lg text-sm font-medium transition-colors">
              Test
            </button>
          </div>
        </div>

        {/* Persona Config */}
        <div className="bg-surface border border-border rounded-xl p-6 space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">Persona & Identity</h3>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-muted uppercase mb-1">Name</label>
              <input
                type="text"
                value={localConfig.PERSONA_NAME || ''}
                onChange={e => handleChange('PERSONA_NAME', e.target.value)}
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted uppercase mb-1">Personality Profile</label>
              <select
                value={localConfig.PERSONA_PROFILE || ''}
                onChange={e => handleChange('PERSONA_PROFILE', e.target.value)}
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
              >
                {personasRegistry.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
              {selectedPersona && (
                <p className="mt-2 text-xs text-muted leading-relaxed">{selectedPersona.description}</p>
              )}
            </div>
          </div>

          <button onClick={handleSavePersona} className="w-full py-2 bg-accent hover:bg-accent/90 text-white rounded-lg text-sm font-medium transition-colors">
            Save Persona
          </button>

          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted mt-6">Skills</h3>
          <div className="space-y-2">
            {skills.length === 0 ? (
              <div className="text-xs text-muted italic">No skills loaded</div>
            ) : (
              skills.map((s: any) => (
                <div key={s.name} className="py-2 border-b border-border text-sm font-medium">
                  {s.name}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Messaging Policy */}
        <div className="bg-surface border border-border rounded-xl p-6 space-y-4 md:col-span-2">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">Messaging Policy</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-muted uppercase mb-1">DM Policy</label>
                <select
                  value={localConfig.WHATSAPP_DM_POLICY || 'open'}
                  onChange={e => handleChange('WHATSAPP_DM_POLICY', e.target.value)}
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
                >
                  <option value="open">Open — respond to everyone</option>
                  <option value="allowlist">Allowlist — selected numbers only</option>
                  <option value="disabled">Disabled — ignore all DMs</option>
                </select>
              </div>

              {localConfig.WHATSAPP_DM_POLICY === 'allowlist' && (
                <div>
                  <label className="block text-xs font-medium text-muted uppercase mb-1">Allowed Numbers (comma separated)</label>
                  <input
                    type="text"
                    value={localConfig.WHATSAPP_ALLOW_FROM || ''}
                    onChange={e => handleChange('WHATSAPP_ALLOW_FROM', e.target.value)}
                    placeholder="2348123456789,..."
                    className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-muted uppercase mb-1">Group Policy</label>
                <select
                  value={localConfig.WHATSAPP_GROUP_POLICY || 'disabled'}
                  onChange={e => handleChange('WHATSAPP_GROUP_POLICY', e.target.value)}
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
                >
                  <option value="disabled">Disabled — ignore groups</option>
                  <option value="enabled">Enabled — respond in groups</option>
                </select>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between py-2 border-b border-border">
                <span className="text-sm font-medium">Read Receipts</span>
                <input
                  type="checkbox"
                  checked={localConfig.WHATSAPP_READ_RECEIPTS === 'true'}
                  onChange={e => handleChange('WHATSAPP_READ_RECEIPTS', e.target.checked ? 'true' : 'false')}
                  className="w-4 h-4 text-accent bg-bg border-border rounded focus:ring-accent"
                />
              </div>

              <div className="flex items-center justify-between py-2 border-b border-border">
                <span className="text-sm font-medium">History Limit (Messages context)</span>
                <input
                  type="number"
                  min={1}
                  value={localConfig.HISTORY_LIMIT ?? 30}
                  onChange={e => {
                    const val = Number(e.target.value);
                    handleChange('HISTORY_LIMIT', isNaN(val) ? 30 : val);
                  }}
                  className="w-20 bg-bg border border-border rounded-lg px-3 py-1 text-sm text-center focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted uppercase mb-1">Mention Trigger (Leave empty for all)</label>
                <input
                  type="text"
                  value={localConfig.WHATSAPP_MENTION_TRIGGER || ''}
                  onChange={e => handleChange('WHATSAPP_MENTION_TRIGGER', e.target.value)}
                  placeholder="@Antigravity"
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
                />
              </div>
            </div>
          </div>

          <div className="pt-2">
            <button onClick={handleSavePolicy} className="w-full py-2 bg-accent hover:bg-accent/90 text-white rounded-lg text-sm font-medium transition-colors">
              Save Policies
            </button>
          </div>
        </div>

        {/* Chat-Specific Instructions */}
        <div className="bg-surface border border-border rounded-xl p-6 space-y-4 md:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">Chat-Specific Instructions</h3>
            <button onClick={() => setShowAddRule(!showAddRule)} className="px-3 py-1.5 bg-accent/10 text-accent hover:bg-accent/20 rounded-lg text-xs font-medium transition-colors">
              {showAddRule ? 'Cancel' : '+ Add Rule'}
            </button>
          </div>

          {showAddRule && (
            <form onSubmit={handleAddInstruction} className="space-y-3 p-4 bg-bg/50 rounded-lg border border-border">
              <div>
                <label className="block text-xs font-medium text-muted uppercase mb-1">Chat JID</label>
                <input
                  type="text"
                  value={newRuleJid}
                  onChange={e => setNewRuleJid(e.target.value)}
                  placeholder="2348123456789@s.whatsapp.net"
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted uppercase mb-1">Instructions</label>
                <textarea
                  value={newRuleText}
                  onChange={e => setNewRuleText(e.target.value)}
                  placeholder="E.g., Only reply in Spanish..."
                  rows={3}
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent resize-none"
                />
              </div>
              <div className="flex justify-end">
                <button type="submit" className="px-4 py-2 bg-accent hover:bg-accent/90 text-white rounded-lg text-sm font-medium transition-colors">
                  Save Rule
                </button>
              </div>
            </form>
          )}

          <div className="space-y-2">
            {instructions.length === 0 ? (
              <div className="text-sm text-muted italic text-center py-4">No rules defined</div>
            ) : (
              instructions.map((ins: any) => (
                <div key={ins.jid} className="flex items-start justify-between p-3 border-b border-border gap-4">
                  <div>
                    <div className="text-xs font-medium text-accent break-all">{ins.jid}</div>
                    <div className="text-sm text-muted mt-1">{ins.text}</div>
                  </div>
                  <button onClick={() => handleDeleteInstruction(ins.jid)} className="text-red hover:text-red/80 font-medium text-xl leading-none">
                    &times;
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default Settings;
