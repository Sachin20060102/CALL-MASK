import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  Activity,
  BarChart3,
  History,
  LayoutDashboard,
  LogOut,
  Phone,
  PhoneCall,
  Settings,
  ShieldAlert,
} from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import type { HealthResponse } from '../types/api';

export function Layout() {
  const { user, logout } = useAuth();
  const [health, setHealth] = useState<HealthResponse | null>(null);

  useEffect(() => {
    api.health().then(setHealth).catch(() => {});
  }, []);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <PhoneCall size={18} />
          </div>
          <span>MocoCall</span>
        </div>

        <nav className="nav-list">
          <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <LayoutDashboard size={17} /> Dashboard
          </NavLink>
          <NavLink to="/dialer" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <Phone size={17} /> Dialer &amp; Active Call
          </NavLink>
          <NavLink to="/calls" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <History size={17} /> Call History
          </NavLink>
          <NavLink to="/usage" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <BarChart3 size={17} /> Usage Statistics
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <Settings size={17} /> Account Settings
          </NavLink>
          {user?.role === 'ADMIN' && (
            <NavLink to="/admin" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <ShieldAlert size={17} /> Admin Console
            </NavLink>
          )}
        </nav>

        <div style={{ marginTop: 'auto', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <Activity size={14} />
            <span>
              Telephony:{' '}
              {health?.telephony.enabled
                ? health.telephony.mode.toUpperCase()
                : 'MOCK (Disabled by default)'}
            </span>
          </div>
          <div>Operational calling mode</div>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="badge badge-info">
              {health?.telephony.enabled ? `LIVE (${health.telephony.mode})` : 'MOCK MODE'}
            </span>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {user?.role === 'ADMIN' ? 'Administrator' : 'Authorized Operator'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{user?.fullName}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{user?.email}</div>
            </div>
            <button type="button" className="btn btn-secondary" onClick={() => void logout()}>
              <LogOut size={15} /> Sign Out
            </button>
          </div>
        </header>

        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
