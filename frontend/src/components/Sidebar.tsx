import { NavLink } from 'react-router-dom';
import { Home, Users, MessageSquare, Send, Settings, Activity } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import clsx from 'clsx';

const Sidebar = () => {
  const { status } = useAppContext();

  const links = [
    { to: '/', icon: Home, label: 'Overview' },
    { to: '/chat', icon: MessageSquare, label: 'Chat' },
    { to: '/contacts', icon: Users, label: 'Contacts' },
    { to: '/broadcast', icon: Send, label: 'Broadcasts' },
    { to: '/settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <aside className="w-64 bg-surface border-r border-border flex flex-col h-screen fixed">
      <div className="p-6 border-b border-border flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight text-white flex items-center gap-2">
          <Activity className="w-5 h-5 text-accent" />
          Antigravity
        </h1>
      </div>

      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2 text-sm font-medium">
          <div className={clsx("w-2.5 h-2.5 rounded-full", {
            "bg-green": status === 'connected',
            "bg-yellow": status === 'qr',
            "bg-red": status === 'disconnected'
          })} />
          <span className="capitalize">{status}</span>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {links.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => clsx(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              isActive ? "bg-accent/10 text-accent" : "text-muted hover:text-text hover:bg-border/50"
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-border text-xs text-muted text-center uppercase tracking-wider">
        Autonomous Platform
      </div>
    </aside>
  );
};

export default Sidebar;
