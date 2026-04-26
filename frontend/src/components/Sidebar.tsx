import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Users, MessageSquare, Send, Settings, Activity, Menu, X } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import clsx from 'clsx';

const Sidebar = () => {
  const { status } = useAppContext();
  const [isOpen, setIsOpen] = useState(false);

  const links = [
    { to: '/', icon: Home, label: 'Overview', end: true },
    { to: '/chat', icon: MessageSquare, label: 'Chat' },
    { to: '/contacts', icon: Users, label: 'Contacts' },
    { to: '/broadcast', icon: Send, label: 'Broadcasts' },
    { to: '/settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <>
      {/* Mobile header / toggle */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-surface border-b border-border z-20 flex items-center justify-between px-4">
        <h1 className="text-lg font-semibold tracking-tight text-white flex items-center gap-2">
          <Activity className="w-5 h-5 text-accent" />
          Antigravity
        </h1>
        <button onClick={() => setIsOpen(!isOpen)} className="p-2 text-muted hover:text-white transition-colors">
          {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Backdrop for mobile */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-30"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={clsx(
        "w-64 bg-surface border-r border-border flex flex-col h-screen fixed z-40 transition-transform duration-300",
        isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        <div className="p-6 border-b border-border flex items-center justify-between">
          <h1 className="text-lg font-semibold tracking-tight text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-accent" />
            Antigravity
          </h1>
          <button onClick={() => setIsOpen(false)} className="lg:hidden p-1 text-muted hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 border-b border-border" role="status" aria-live="polite">
          <div className="flex items-center gap-2 text-sm font-medium">
            <div aria-hidden="true" className={clsx("w-2.5 h-2.5 rounded-full", {
              "bg-green": status === 'connected',
              "bg-yellow": status === 'qr',
              "bg-red": status === 'disconnected'
            })} />
            <span className="capitalize">{status}</span>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {links.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setIsOpen(false)}
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
    </>
  );
};

export default Sidebar;
