import { useState, useEffect, createContext, useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useParams, useNavigate } from 'react-router-dom';
import { auth, contacts, interactions, introductions, analytics } from './services/api';
import type { Contact, Interaction, Introduction, AnalyticsDashboard, AuthState, InteractionType, Sentiment } from './types';
import './App.css';

// Auth Context
const AuthContext = createContext<{
  auth: AuthState;
  login: (email: string, password: string) => Promise<string | null>;
  register: (email: string, password: string, name: string) => Promise<string | null>;
  logout: () => void;
}>({
  auth: { user: null, token: null },
  login: async () => null,
  register: async () => null,
  logout: () => {},
});

function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>({ user: null, token: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('obani_auth');
    if (stored) {
      setAuthState(JSON.parse(stored));
    }
    setLoading(false);
  }, []);

  const login = async (email: string, password: string): Promise<string | null> => {
    try {
      const res = await auth.login(email, password);
      if (res.success && res.data) {
        const newAuth = { user: res.data.user, token: res.data.token };
        setAuthState(newAuth);
        localStorage.setItem('obani_auth', JSON.stringify(newAuth));
        return null;
      }
      return res.error || 'Login failed';
    } catch (err) {
      return 'Connection error';
    }
  };

  const register = async (email: string, password: string, name: string): Promise<string | null> => {
    const res = await auth.register(email, password, name);
    if (res.success && res.data) {
      const newAuth = { user: res.data.user, token: res.data.token };
      setAuthState(newAuth);
      localStorage.setItem('obani_auth', JSON.stringify(newAuth));
      return null;
    }
    return res.error || 'Registration failed';
  };

  const logout = () => {
    setAuthState({ user: null, token: null });
    localStorage.removeItem('obani_auth');
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <AuthContext.Provider value={{ auth: authState, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

function useAuth() {
  return useContext(AuthContext);
}

// Layout with Navigation
function AppLayout({ children }: { children: React.ReactNode }) {
  const { auth: authState, logout } = useAuth();

  return (
    <div className="app-layout">
      <nav className="navbar">
        <div className="nav-brand">
          <div className="nav-logo"></div>
          <span className="nav-title">obani</span>
        </div>
        <div className="nav-links">
          <Link to="/contacts" className="nav-link">Contacts</Link>
          <Link to="/interactions" className="nav-link">Activity</Link>
          <Link to="/introductions" className="nav-link">Intros</Link>
          <Link to="/analytics" className="nav-link">Analytics</Link>
        </div>
        <div className="nav-user">
          <span className="user-name">{authState.user?.name}</span>
          <button className="btn-logout" onClick={logout}>Logout</button>
        </div>
      </nav>
      <main className="main-content">{children}</main>
    </div>
  );
}

// Login Page
function LoginPage() {
  const { auth: authState, login, register } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');

  // Redirect if already logged in
  if (authState.token) {
    return <Navigate to="/contacts" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (!email || !password) {
      setError('Please enter email and password');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const err = isRegister
        ? await register(email, password, name)
        : await login(email, password);
      if (err) {
        setError(err);
      }
    } catch (err) {
      setError('Network error. Please try again.');
    }
    setLoading(false);
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="logo"></div>
        <h1>obani</h1>
        <p className="subtitle">{isRegister ? 'Create Your Account' : 'The Relationship Operating System'}</p>

        {error && <div className="error">{error}</div>}

        <form onSubmit={handleSubmit}>
          {isRegister && (
            <input
              type="text"
              placeholder="Full Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={loading}
            />
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            disabled={loading}
          />
          <button type="submit" className="btn primary" disabled={loading}>
            {loading ? 'Please wait...' : (isRegister ? 'Create Account' : 'Sign In')}
          </button>
        </form>

        <p className="switch-text">
          {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button className="link" onClick={() => { setIsRegister(!isRegister); setError(''); }}>
            {isRegister ? 'Sign in' : 'Sign up'}
          </button>
        </p>
      </div>
    </div>
  );
}

// Contacts Page
function ContactsPage() {
  const [contactList, setContactList] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'recent' | 'strength'>('name');
  const [showFilters, setShowFilters] = useState(false);
  const [minStrength, setMinStrength] = useState(0);
  const [sectorFilter, setSectorFilter] = useState('');
  const [lastContactFilter, setLastContactFilter] = useState<'' | '30' | '60' | '90' | '90+'>('');

  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async () => {
    setLoading(true);
    const res = await contacts.list(1, 200);
    if (res.success && res.data) {
      setContactList(res.data.items || []);
    } else {
      setError(res.error || 'Failed to load contacts');
    }
    setLoading(false);
  };

  // Get unique sectors from contacts
  const allSectors = [...new Set(contactList.flatMap(c => c.sectors || []))].sort();

  const filteredContacts = contactList
    .filter(c => {
      // Text search
      if (search) {
        const q = search.toLowerCase();
        const matchesSearch = c.firstName.toLowerCase().includes(q) ||
          c.lastName?.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q) ||
          c.company?.toLowerCase().includes(q) ||
          c.tags?.some(t => t.toLowerCase().includes(q)) ||
          c.notes?.toLowerCase().includes(q);
        if (!matchesSearch) return false;
      }

      // Strength filter
      if (minStrength > 0 && (c.relationshipStrength || 0) < minStrength) {
        return false;
      }

      // Sector filter
      if (sectorFilter && !c.sectors?.includes(sectorFilter)) {
        return false;
      }

      // Last contact filter
      if (lastContactFilter) {
        const lastContact = c.lastContactedAt ? new Date(c.lastContactedAt) : null;
        const daysSinceContact = lastContact
          ? Math.floor((Date.now() - lastContact.getTime()) / (1000 * 60 * 60 * 24))
          : 999;

        if (lastContactFilter === '30' && daysSinceContact > 30) return false;
        if (lastContactFilter === '60' && daysSinceContact > 60) return false;
        if (lastContactFilter === '90' && daysSinceContact > 90) return false;
        if (lastContactFilter === '90+' && daysSinceContact <= 90) return false;
      }

      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'recent') {
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      }
      if (sortBy === 'strength') {
        return (b.relationshipStrength || 0) - (a.relationshipStrength || 0);
      }
      return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
    });

  const activeFilterCount = [minStrength > 0, sectorFilter, lastContactFilter].filter(Boolean).length;

  const exportToCSV = () => {
    const headers = ['First Name', 'Last Name', 'Email', 'Phone', 'Company', 'Title', 'Location', 'Sectors', 'Tags', 'Needs', 'Offers', 'How We Met', 'Relationship Strength', 'Investment Min', 'Investment Max', 'Notes'];
    const rows = filteredContacts.map(c => [
      c.firstName,
      c.lastName || '',
      c.email || '',
      c.phone || '',
      c.company || '',
      c.title || '',
      c.location || '',
      c.sectors?.join('; ') || '',
      c.tags?.join('; ') || '',
      c.needs?.join('; ') || '',
      c.offers?.join('; ') || '',
      c.howWeMet || '',
      c.relationshipStrength?.toString() || '',
      c.investmentTicketMin?.toString() || '',
      c.investmentTicketMax?.toString() || '',
      c.notes?.replace(/\n/g, ' ') || ''
    ].map(val => `"${val.replace(/"/g, '""')}"`).join(','));

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contacts-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportToJSON = () => {
    const data = filteredContacts.map(c => ({
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      phone: c.phone,
      company: c.company,
      title: c.title,
      location: c.location,
      sectors: c.sectors,
      tags: c.tags,
      needs: c.needs,
      offers: c.offers,
      howWeMet: c.howWeMet,
      relationshipStrength: c.relationshipStrength,
      investmentTicketMin: c.investmentTicketMin,
      investmentTicketMax: c.investmentTicketMax,
      linkedinUrl: c.linkedinUrl,
      notes: c.notes,
      lastContactedAt: c.lastContactedAt,
      createdAt: c.createdAt
    }));

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contacts-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return <div className="page-loading">Loading contacts...</div>;
  }

  return (
    <div className="contacts-page">
      <div className="page-header">
        <h1>Contacts</h1>
        <div className="header-actions">
          <div className="export-dropdown">
            <button className="btn secondary">Export ▾</button>
            <div className="export-menu">
              <button onClick={exportToCSV}>Export as CSV</button>
              <button onClick={exportToJSON}>Export as JSON</button>
            </div>
          </div>
          <Link to="/contacts/new" className="btn primary">+ Add Contact</Link>
        </div>
      </div>

      <div className="filters-bar">
        <input
          type="text"
          className="search-input"
          placeholder="Search contacts, tags, notes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          className={`filter-toggle-btn ${activeFilterCount > 0 ? 'active' : ''}`}
          onClick={() => setShowFilters(!showFilters)}
        >
          Filters {activeFilterCount > 0 && <span className="filter-badge">{activeFilterCount}</span>}
        </button>
        <div className="sort-options">
          <span>Sort:</span>
          {(['name', 'recent', 'strength'] as const).map(opt => (
            <button
              key={opt}
              className={`sort-btn ${sortBy === opt ? 'active' : ''}`}
              onClick={() => setSortBy(opt)}
            >
              {opt.charAt(0).toUpperCase() + opt.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {showFilters && (
        <div className="filter-panel">
          <div className="filter-group">
            <label>Min Strength</label>
            <div className="strength-filter">
              {[0, 1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  className={`strength-filter-btn ${minStrength === n ? 'active' : ''}`}
                  onClick={() => setMinStrength(n)}
                >
                  {n === 0 ? 'Any' : `${n}+`}
                </button>
              ))}
            </div>
          </div>

          {allSectors.length > 0 && (
            <div className="filter-group">
              <label>Sector</label>
              <select
                value={sectorFilter}
                onChange={(e) => setSectorFilter(e.target.value)}
              >
                <option value="">All Sectors</option>
                {allSectors.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          )}

          <div className="filter-group">
            <label>Last Contact</label>
            <div className="contact-filter">
              {[
                { val: '', label: 'Any' },
                { val: '30', label: '< 30 days' },
                { val: '60', label: '< 60 days' },
                { val: '90', label: '< 90 days' },
                { val: '90+', label: '90+ days (At Risk)' },
              ].map(opt => (
                <button
                  key={opt.val}
                  className={`contact-filter-btn ${lastContactFilter === opt.val ? 'active' : ''}`}
                  onClick={() => setLastContactFilter(opt.val as typeof lastContactFilter)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {activeFilterCount > 0 && (
            <button
              className="clear-filters-btn"
              onClick={() => {
                setMinStrength(0);
                setSectorFilter('');
                setLastContactFilter('');
              }}
            >
              Clear All Filters
            </button>
          )}
        </div>
      )}

      <p className="results-count">{filteredContacts.length} contacts</p>

      {error && <div className="error">{error}</div>}

      {filteredContacts.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"></div>
          <h3>No contacts yet</h3>
          <p>Add your first contact to get started building your network.</p>
          <Link to="/contacts/new" className="btn primary">Add Contact</Link>
        </div>
      ) : (
        <div className="contacts-list">
          {filteredContacts.map(contact => (
            <Link key={contact.id} to={`/contacts/${contact.id}`} className="contact-card">
              <div className="contact-avatar">
                {contact.firstName[0]}{contact.lastName?.[0] || ''}
              </div>
              <div className="contact-info">
                <div className="contact-name">{contact.firstName} {contact.lastName || ''}</div>
                {contact.company && (
                  <div className="contact-company">
                    {contact.title ? `${contact.title} at ` : ''}{contact.company}
                  </div>
                )}
                {!contact.company && contact.email && (
                  <div className="contact-email">{contact.email}</div>
                )}
              </div>
              <div className="contact-meta">
                <div className="strength-stars">
                  {'★'.repeat(contact.relationshipStrength || 0)}
                  {'☆'.repeat(5 - (contact.relationshipStrength || 0))}
                </div>
                {contact.tags?.slice(0, 2).map(tag => (
                  <span key={tag} className="tag">{tag}</span>
                ))}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// Contact Detail Page
function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [contact, setContact] = useState<Contact | null>(null);
  const [contactInteractions, setContactInteractions] = useState<Interaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLogModal, setShowLogModal] = useState(false);

  useEffect(() => {
    if (id) loadContact(id);
  }, [id]);

  const loadContact = async (contactId: string) => {
    setLoading(true);
    const [contactRes, intRes] = await Promise.all([
      contacts.get(contactId),
      interactions.getByContact(contactId)
    ]);
    if (contactRes.success && contactRes.data) {
      setContact(contactRes.data);
    }
    if (intRes.success && intRes.data) {
      setContactInteractions(intRes.data.items || []);
    }
    setLoading(false);
  };

  const handleDelete = async () => {
    if (!contact || !confirm(`Delete ${contact.firstName}? This cannot be undone.`)) return;
    const res = await contacts.delete(contact.id);
    if (res.success) {
      navigate('/contacts');
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    });
  };

  if (loading) {
    return <div className="page-loading">Loading contact...</div>;
  }

  if (!contact) {
    return <div className="error-page">Contact not found</div>;
  }

  return (
    <div className="contact-detail-page">
      <div className="detail-header">
        <button className="back-btn" onClick={() => navigate('/contacts')}>← Back</button>
        <div className="detail-actions">
          <Link to={`/contacts/${contact.id}/edit`} className="btn secondary">Edit</Link>
          <button className="btn danger" onClick={handleDelete}>Delete</button>
        </div>
      </div>

      <div className="contact-hero">
        <div className="hero-avatar">
          {contact.firstName[0]}{contact.lastName?.[0] || ''}
        </div>
        <h1>{contact.firstName} {contact.lastName || ''}</h1>
        {contact.title && contact.company && (
          <p className="hero-subtitle">{contact.title} at {contact.company}</p>
        )}
        <div className="strength-display">
          <span className="strength-label">Relationship Strength</span>
          <span className="strength-stars large">
            {'★'.repeat(contact.relationshipStrength || 0)}
            {'☆'.repeat(5 - (contact.relationshipStrength || 0))}
          </span>
        </div>
      </div>

      <div className="quick-actions">
        {contact.phone && (
          <a href={`tel:${contact.phone}`} className="action-btn">
            <span className="action-icon">📞</span>
            <span>Call</span>
          </a>
        )}
        {contact.email && (
          <a href={`mailto:${contact.email}`} className="action-btn">
            <span className="action-icon">✉️</span>
            <span>Email</span>
          </a>
        )}
        <button className="action-btn" onClick={() => setShowLogModal(true)}>
          <span className="action-icon">📝</span>
          <span>Log</span>
        </button>
      </div>

      <div className="detail-sections">
        <section className="detail-section">
          <h2>Contact Info</h2>
          <div className="info-grid">
            {contact.email && <div className="info-row"><span>Email</span><span>{contact.email}</span></div>}
            {contact.phone && <div className="info-row"><span>Phone</span><span>{contact.phone}</span></div>}
            {contact.location && <div className="info-row"><span>Location</span><span>{contact.location}</span></div>}
            {contact.linkedinUrl && (
              <div className="info-row">
                <span>LinkedIn</span>
                <a href={contact.linkedinUrl} target="_blank" rel="noopener">View Profile →</a>
              </div>
            )}
          </div>
        </section>

        {(contact.tags?.length > 0 || contact.sectors?.length > 0) && (
          <section className="detail-section">
            <h2>Tags & Sectors</h2>
            <div className="tags-list">
              {contact.tags?.map(tag => <span key={tag} className="tag">{tag}</span>)}
              {contact.sectors?.map(s => <span key={s} className="tag sector">{s}</span>)}
            </div>
          </section>
        )}

        {contact.howWeMet && (
          <section className="detail-section">
            <h2>How We Met</h2>
            <p className="notes-text">{contact.howWeMet}</p>
          </section>
        )}

        {(contact.needs?.length > 0 || contact.offers?.length > 0) && (
          <section className="detail-section">
            <h2>Value Exchange</h2>
            {contact.needs?.length > 0 && (
              <div className="value-exchange-row">
                <span className="value-label">🎯 What They Need:</span>
                <div className="tags-list">
                  {contact.needs.map(n => <span key={n} className="tag need">{n}</span>)}
                </div>
              </div>
            )}
            {contact.offers?.length > 0 && (
              <div className="value-exchange-row">
                <span className="value-label">💡 What They Offer:</span>
                <div className="tags-list">
                  {contact.offers.map(o => <span key={o} className="tag offer">{o}</span>)}
                </div>
              </div>
            )}
          </section>
        )}

        {(contact.investmentTicketMin || contact.investmentTicketMax) && (
          <section className="detail-section">
            <h2>Investment Criteria</h2>
            <div className="info-grid">
              {contact.investmentTicketMin && (
                <div className="info-row">
                  <span>Min Ticket</span>
                  <span>£{contact.investmentTicketMin.toLocaleString()}</span>
                </div>
              )}
              {contact.investmentTicketMax && (
                <div className="info-row">
                  <span>Max Ticket</span>
                  <span>£{contact.investmentTicketMax.toLocaleString()}</span>
                </div>
              )}
            </div>
          </section>
        )}

        {contact.notes && (
          <section className="detail-section">
            <h2>Notes</h2>
            <p className="notes-text">{contact.notes}</p>
          </section>
        )}

        <section className="detail-section">
          <div className="section-header">
            <h2>Recent Interactions</h2>
            <button className="link" onClick={() => setShowLogModal(true)}>+ Add</button>
          </div>
          {contactInteractions.length === 0 ? (
            <div className="empty-interactions">
              <p>No interactions logged yet</p>
              <button className="btn secondary" onClick={() => setShowLogModal(true)}>
                Log your first interaction
              </button>
            </div>
          ) : (
            <div className="interactions-list">
              {contactInteractions.slice(0, 5).map(int => (
                <div key={int.id} className="interaction-item">
                  <div className="int-header">
                    <span className="int-type">{int.type}</span>
                    <span className="int-date">{formatDate(int.date)}</span>
                  </div>
                  {int.notes && <p className="int-notes">{int.notes}</p>}
                  {int.actionItems && int.actionItems.length > 0 && (
                    <div className="int-action-items">
                      {int.actionItems.map(action => (
                        <div key={action.id} className={`int-action ${action.completed ? 'completed' : ''}`}>
                          <span className="action-icon">{action.owner === 'me' ? '👤' : action.owner === 'them' ? '👥' : '🤝'}</span>
                          <span className="action-label">{action.text}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="meta-info">
          <p>Added {formatDate(contact.createdAt)}</p>
          <p>Updated {formatDate(contact.updatedAt)}</p>
        </div>
      </div>

      {showLogModal && (
        <InteractionModal
          contactId={contact.id}
          contactName={`${contact.firstName} ${contact.lastName || ''}`}
          onClose={() => setShowLogModal(false)}
          onSuccess={(int) => {
            setContactInteractions([int, ...contactInteractions]);
            setShowLogModal(false);
          }}
        />
      )}
    </div>
  );
}

// Contact Form Page
function ContactFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = id && id !== 'new';
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    company: '',
    title: '',
    location: '',
    notes: '',
    tags: '',
    sectors: '',
    needs: '',
    offers: '',
    howWeMet: '',
    investmentTicketMin: '',
    investmentTicketMax: '',
    relationshipStrength: 3,
    linkedinUrl: '',
  });

  useEffect(() => {
    if (isEdit && id) {
      contacts.get(id).then(res => {
        if (res.success && res.data) {
          const c = res.data;
          setForm({
            firstName: c.firstName,
            lastName: c.lastName || '',
            email: c.email || '',
            phone: c.phone || '',
            company: c.company || '',
            title: c.title || '',
            location: c.location || '',
            notes: c.notes || '',
            tags: c.tags?.join(', ') || '',
            sectors: c.sectors?.join(', ') || '',
            needs: c.needs?.join(', ') || '',
            offers: c.offers?.join(', ') || '',
            howWeMet: c.howWeMet || '',
            investmentTicketMin: c.investmentTicketMin?.toString() || '',
            investmentTicketMax: c.investmentTicketMax?.toString() || '',
            relationshipStrength: c.relationshipStrength || 3,
            linkedinUrl: c.linkedinUrl || '',
          });
        }
        setLoading(false);
      });
    }
  }, [isEdit, id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);

    const data = {
      firstName: form.firstName,
      lastName: form.lastName || undefined,
      email: form.email || undefined,
      phone: form.phone || undefined,
      company: form.company || undefined,
      title: form.title || undefined,
      location: form.location || undefined,
      notes: form.notes || undefined,
      tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      sectors: form.sectors ? form.sectors.split(',').map(t => t.trim()).filter(Boolean) : [],
      needs: form.needs ? form.needs.split(',').map(t => t.trim()).filter(Boolean) : [],
      offers: form.offers ? form.offers.split(',').map(t => t.trim()).filter(Boolean) : [],
      howWeMet: form.howWeMet || undefined,
      investmentTicketMin: form.investmentTicketMin ? parseInt(form.investmentTicketMin) : undefined,
      investmentTicketMax: form.investmentTicketMax ? parseInt(form.investmentTicketMax) : undefined,
      relationshipStrength: form.relationshipStrength,
      linkedinUrl: form.linkedinUrl || undefined,
    };

    const res = isEdit && id
      ? await contacts.update(id, data)
      : await contacts.create(data);

    setSaving(false);
    if (res.success && res.data) {
      navigate(`/contacts/${res.data.id}`);
    } else {
      setError(res.error || 'Failed to save contact');
    }
  };

  if (loading) {
    return <div className="page-loading">Loading...</div>;
  }

  return (
    <div className="contact-form-page">
      <div className="form-header">
        <button className="back-btn" onClick={() => navigate(-1)}>← Back</button>
        <h1>{isEdit ? 'Edit Contact' : 'New Contact'}</h1>
      </div>

      {error && <div className="error">{error}</div>}

      <form onSubmit={handleSubmit} className="contact-form">
        <div className="form-row">
          <div className="form-group">
            <label>First Name *</label>
            <input
              type="text"
              value={form.firstName}
              onChange={e => setForm({...form, firstName: e.target.value})}
              required
            />
          </div>
          <div className="form-group">
            <label>Last Name</label>
            <input
              type="text"
              value={form.lastName}
              onChange={e => setForm({...form, lastName: e.target.value})}
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={form.email}
              onChange={e => setForm({...form, email: e.target.value})}
            />
          </div>
          <div className="form-group">
            <label>Phone</label>
            <input
              type="tel"
              value={form.phone}
              onChange={e => setForm({...form, phone: e.target.value})}
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Company</label>
            <input
              type="text"
              value={form.company}
              onChange={e => setForm({...form, company: e.target.value})}
            />
          </div>
          <div className="form-group">
            <label>Title</label>
            <input
              type="text"
              value={form.title}
              onChange={e => setForm({...form, title: e.target.value})}
            />
          </div>
        </div>

        <div className="form-group">
          <label>Location</label>
          <input
            type="text"
            value={form.location}
            onChange={e => setForm({...form, location: e.target.value})}
          />
        </div>

        <div className="form-group">
          <label>How We Met</label>
          <input
            type="text"
            value={form.howWeMet}
            onChange={e => setForm({...form, howWeMet: e.target.value})}
            placeholder="Conference, mutual friend, cold outreach..."
          />
        </div>

        <div className="form-group">
          <label>LinkedIn URL</label>
          <input
            type="url"
            value={form.linkedinUrl}
            onChange={e => setForm({...form, linkedinUrl: e.target.value})}
            placeholder="https://linkedin.com/in/..."
          />
        </div>

        <div className="form-group">
          <label>Sector (comma separated)</label>
          <input
            type="text"
            value={form.sectors}
            onChange={e => setForm({...form, sectors: e.target.value})}
            placeholder="VC, Fintech, AI, SaaS"
          />
        </div>

        <div className="form-group">
          <label>Tags (comma separated)</label>
          <input
            type="text"
            value={form.tags}
            onChange={e => setForm({...form, tags: e.target.value})}
            placeholder="investor, advisor, NYC"
          />
        </div>

        <div className="form-group">
          <label>What They Need (comma separated)</label>
          <input
            type="text"
            value={form.needs}
            onChange={e => setForm({...form, needs: e.target.value})}
            placeholder="funding, introductions, talent"
          />
        </div>

        <div className="form-group">
          <label>What They Offer (comma separated)</label>
          <input
            type="text"
            value={form.offers}
            onChange={e => setForm({...form, offers: e.target.value})}
            placeholder="capital, advice, connections"
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Investment Min (£)</label>
            <input
              type="number"
              value={form.investmentTicketMin}
              onChange={e => setForm({...form, investmentTicketMin: e.target.value})}
              placeholder="100000"
            />
          </div>
          <div className="form-group">
            <label>Investment Max (£)</label>
            <input
              type="number"
              value={form.investmentTicketMax}
              onChange={e => setForm({...form, investmentTicketMax: e.target.value})}
              placeholder="5000000"
            />
          </div>
        </div>

        <div className="form-group">
          <label>Relationship Strength</label>
          <div className="strength-selector">
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                type="button"
                className={`strength-btn ${form.relationshipStrength >= n ? 'active' : ''}`}
                onClick={() => setForm({...form, relationshipStrength: n})}
              >
                ★
              </button>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label>Notes</label>
          <textarea
            value={form.notes}
            onChange={e => setForm({...form, notes: e.target.value})}
            rows={4}
            placeholder="Add any notes about this contact..."
          />
        </div>

        <div className="form-actions">
          <button type="button" className="btn secondary" onClick={() => navigate(-1)}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? 'Saving...' : (isEdit ? 'Save Changes' : 'Create Contact')}
          </button>
        </div>
      </form>
    </div>
  );
}

// Interaction Modal
function InteractionModal({
  contactId,
  contactName,
  onClose,
  onSuccess
}: {
  contactId: string;
  contactName: string;
  onClose: () => void;
  onSuccess: (int: Interaction) => void;
}) {
  const [type, setType] = useState<InteractionType>('MEETING');
  const [notes, setNotes] = useState('');
  const [sentiment, setSentiment] = useState<Sentiment>('NEUTRAL');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [actionItems, setActionItems] = useState<{text: string; owner: 'me' | 'them' | 'both'}[]>([]);
  const [newAction, setNewAction] = useState('');
  const [newActionOwner, setNewActionOwner] = useState<'me' | 'them' | 'both'>('me');

  const addActionItem = () => {
    if (newAction.trim()) {
      setActionItems([...actionItems, { text: newAction.trim(), owner: newActionOwner }]);
      setNewAction('');
    }
  };

  const removeActionItem = (idx: number) => {
    setActionItems(actionItems.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    const res = await interactions.create({
      contactId,
      type,
      date: new Date().toISOString(),
      notes: notes || undefined,
      sentiment,
      keyTopics: [],
      actionItems: actionItems.length > 0 ? actionItems.map((a, i) => ({
        id: `temp-${i}`,
        text: a.text,
        owner: a.owner,
        completed: false
      })) : undefined,
    });
    setSaving(false);
    if (res.success && res.data) {
      onSuccess(res.data);
    } else {
      setError(res.error || 'Failed to save interaction');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Log Interaction</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        <p className="modal-subtitle">with {contactName}</p>

        {error && <div className="error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Type</label>
            <div className="type-options">
              {(['MEETING', 'CALL', 'EMAIL', 'MESSAGE', 'OTHER'] as InteractionType[]).map(t => (
                <button
                  key={t}
                  type="button"
                  className={`type-btn ${type === t ? 'active' : ''}`}
                  onClick={() => setType(t)}
                >
                  {t === 'MEETING' && '☕'}
                  {t === 'CALL' && '📞'}
                  {t === 'EMAIL' && '✉️'}
                  {t === 'MESSAGE' && '💬'}
                  {t === 'OTHER' && '📝'}
                  <span>{t}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>How did it go?</label>
            <div className="sentiment-options">
              {(['POSITIVE', 'NEUTRAL', 'NEGATIVE'] as Sentiment[]).map(s => (
                <button
                  key={s}
                  type="button"
                  className={`sentiment-btn ${sentiment === s ? 'active' : ''} ${s.toLowerCase()}`}
                  onClick={() => setSentiment(s)}
                >
                  {s === 'POSITIVE' && '😊'}
                  {s === 'NEUTRAL' && '😐'}
                  {s === 'NEGATIVE' && '😔'}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="What did you discuss?"
            />
          </div>

          <div className="form-group">
            <label>Action Items</label>
            {actionItems.length > 0 && (
              <ul className="action-items-list">
                {actionItems.map((item, idx) => (
                  <li key={idx} className="action-item">
                    <span className={`action-owner ${item.owner}`}>
                      {item.owner === 'me' ? '👤' : item.owner === 'them' ? '👥' : '🤝'}
                    </span>
                    <span className="action-text">{item.text}</span>
                    <button type="button" className="remove-action" onClick={() => removeActionItem(idx)}>×</button>
                  </li>
                ))}
              </ul>
            )}
            <div className="add-action-row">
              <input
                type="text"
                value={newAction}
                onChange={e => setNewAction(e.target.value)}
                placeholder="Add an action item..."
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addActionItem(); }}}
              />
              <select value={newActionOwner} onChange={e => setNewActionOwner(e.target.value as 'me' | 'them' | 'both')}>
                <option value="me">Me</option>
                <option value="them">Them</option>
                <option value="both">Both</option>
              </select>
              <button type="button" className="btn-add-action" onClick={addActionItem}>+</button>
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn primary" disabled={saving}>
              {saving ? 'Saving...' : 'Log Interaction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Interactions Page
function InteractionsPage() {
  const [interactionList, setInteractionList] = useState<Interaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    loadInteractions();
  }, []);

  const loadInteractions = async () => {
    const res = await interactions.list(1, 100);
    if (res.success && res.data) {
      setInteractionList(res.data.items || []);
    }
    setLoading(false);
  };

  const filtered = filter === 'all'
    ? interactionList
    : interactionList.filter(i => i.type === filter);

  const grouped = filtered.reduce((acc, int) => {
    const date = new Date(int.date).toLocaleDateString('en-US', {
      weekday: 'long', month: 'short', day: 'numeric'
    });
    if (!acc[date]) acc[date] = [];
    acc[date].push(int);
    return acc;
  }, {} as Record<string, Interaction[]>);

  if (loading) {
    return <div className="page-loading">Loading activity...</div>;
  }

  return (
    <div className="interactions-page">
      <div className="page-header">
        <h1>Activity</h1>
      </div>

      <div className="filter-tabs">
        {['all', 'MEETING', 'CALL', 'EMAIL', 'MESSAGE'].map(f => (
          <button
            key={f}
            className={`filter-tab ${filter === f ? 'active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'All' : f === 'MEETING' ? '☕' : f === 'CALL' ? '📞' : f === 'EMAIL' ? '✉️' : '💬'}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon activity"></div>
          <h3>No Activity Yet</h3>
          <p>Log interactions with your contacts to see your activity feed here.</p>
        </div>
      ) : (
        <div className="activity-feed">
          {Object.entries(grouped).map(([date, ints]) => (
            <div key={date} className="activity-group">
              <div className="group-header">{date}</div>
              {ints.map(int => (
                <Link key={int.id} to={`/contacts/${int.contactId}`} className="activity-item">
                  <div className="activity-icon">
                    {int.type === 'MEETING' && '☕'}
                    {int.type === 'CALL' && '📞'}
                    {int.type === 'EMAIL' && '✉️'}
                    {int.type === 'MESSAGE' && '💬'}
                    {int.type === 'OTHER' && '📝'}
                  </div>
                  <div className="activity-content">
                    <div className="activity-header">
                      <span className="activity-type">{int.type}</span>
                      <span className={`sentiment-dot ${int.sentiment.toLowerCase()}`}></span>
                    </div>
                    {int.notes && <p className="activity-notes">{int.notes}</p>}
                    {int.actionItems && int.actionItems.length > 0 && (
                      <div className="activity-actions">
                        {int.actionItems.map(a => (
                          <span key={a.id} className={`activity-action-tag ${a.completed ? 'done' : ''}`}>
                            {a.owner === 'me' ? '👤' : a.owner === 'them' ? '👥' : '🤝'} {a.text}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="activity-time">
                    {new Date(int.date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </span>
                </Link>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Introductions Page
function IntroductionsPage() {
  const [introList, setIntroList] = useState<Introduction[]>([]);
  const [suggested, setSuggested] = useState<Introduction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadIntroductions();
  }, []);

  const loadIntroductions = async () => {
    const [listRes, sugRes] = await Promise.all([
      introductions.list(),
      introductions.getSuggested()
    ]);
    if (listRes.success && listRes.data) {
      setIntroList(listRes.data.items || []);
    }
    if (sugRes.success && sugRes.data) {
      setSuggested(sugRes.data || []);
    }
    setLoading(false);
  };

  if (loading) {
    return <div className="page-loading">Loading introductions...</div>;
  }

  return (
    <div className="introductions-page">
      <div className="page-header">
        <h1>Introductions</h1>
      </div>

      {suggested.length > 0 && (
        <section className="intro-section">
          <h2>Suggested Introductions</h2>
          <div className="intro-grid">
            {suggested.map(intro => (
              <div key={intro.id} className="intro-card suggested">
                <div className="intro-match">
                  <span className="match-score">{intro.matchScore || 85}% match</span>
                </div>
                <div className="intro-contacts">
                  <div className="intro-person">
                    <div className="person-avatar">
                      {intro.sourceContact?.firstName?.[0] || '?'}
                    </div>
                    <span>{intro.sourceContact?.firstName || 'Contact 1'}</span>
                  </div>
                  <span className="intro-arrow">↔</span>
                  <div className="intro-person">
                    <div className="person-avatar">
                      {intro.targetContact?.firstName?.[0] || '?'}
                    </div>
                    <span>{intro.targetContact?.firstName || 'Contact 2'}</span>
                  </div>
                </div>
                {intro.reason && <p className="intro-reason">{intro.reason}</p>}
                <div className="intro-actions">
                  <button className="btn secondary small">Dismiss</button>
                  <button className="btn primary small">Make Intro</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="intro-section">
        <h2>Your Introductions</h2>
        {introList.length === 0 ? (
          <div className="empty-state small">
            <p>No introductions made yet. Start connecting your network!</p>
          </div>
        ) : (
          <div className="intro-list">
            {introList.map(intro => (
              <div key={intro.id} className="intro-item">
                <div className="intro-status">
                  <span className={`status-badge ${intro.status.toLowerCase()}`}>
                    {intro.status}
                  </span>
                </div>
                <div className="intro-details">
                  <span>{intro.sourceContact?.firstName} ↔ {intro.targetContact?.firstName}</span>
                  {intro.context && <p>{intro.context}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// Analytics Page
function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    const res = await analytics.getDashboard();
    if (res.success && res.data) {
      setData(res.data);
    }
    setLoading(false);
  };

  if (loading) {
    return <div className="page-loading">Loading analytics...</div>;
  }

  if (!data) {
    return (
      <div className="analytics-page">
        <div className="page-header">
          <h1>Analytics</h1>
        </div>
        <div className="empty-state">
          <div className="empty-icon analytics"></div>
          <h3>No Data Yet</h3>
          <p>Add contacts and log interactions to see your network analytics.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="analytics-page">
      <div className="page-header">
        <h1>Analytics</h1>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-value">{data.networkHealth.totalContacts}</span>
          <span className="stat-label">Total Contacts</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{data.networkHealth.activeContacts}</span>
          <span className="stat-label">Active</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{data.networkHealth.dormantContacts}</span>
          <span className="stat-label">Need Attention</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{data.networkHealth.averageStrength.toFixed(1)}</span>
          <span className="stat-label">Avg Strength</span>
        </div>
      </div>

      <div className="analytics-sections">
        <section className="analytics-section">
          <h2>Interaction Trends</h2>
          <div className="trend-stats">
            <div className="trend-item">
              <span className="trend-value">{data.interactionTrends.totalInteractions}</span>
              <span className="trend-label">Total Interactions</span>
            </div>
            <div className="trend-item">
              <span className="trend-value">{data.interactionTrends.avgPerContact.toFixed(1)}</span>
              <span className="trend-label">Avg per Contact</span>
            </div>
          </div>
          <div className="type-breakdown">
            {data.interactionTrends.byType.map(t => (
              <div key={t.type} className="type-item">
                <span className="type-icon">
                  {t.type === 'MEETING' && '☕'}
                  {t.type === 'CALL' && '📞'}
                  {t.type === 'EMAIL' && '✉️'}
                  {t.type === 'MESSAGE' && '💬'}
                </span>
                <span className="type-count">{t.count}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="analytics-section">
          <h2>Introductions</h2>
          <div className="intro-stats">
            <div className="intro-stat">
              <span className="stat-value">{data.introductionMetrics.totalMade}</span>
              <span className="stat-label">Made</span>
            </div>
            <div className="intro-stat">
              <span className="stat-value">{data.introductionMetrics.totalCompleted}</span>
              <span className="stat-label">Completed</span>
            </div>
            <div className="intro-stat">
              <span className="stat-value">{(data.introductionMetrics.successRate * 100).toFixed(0)}%</span>
              <span className="stat-label">Success Rate</span>
            </div>
          </div>
        </section>

        {data.atRiskContacts.length > 0 && (
          <section className="analytics-section">
            <h2>At-Risk Contacts</h2>
            <p className="section-desc">These contacts haven't been contacted in a while</p>
            <div className="at-risk-list">
              {data.atRiskContacts.slice(0, 5).map(c => (
                <Link key={c.id} to={`/contacts/${c.id}`} className="at-risk-item">
                  <div className="risk-avatar">{c.firstName[0]}</div>
                  <div className="risk-info">
                    <span className="risk-name">{c.firstName} {c.lastName}</span>
                    <span className="risk-time">
                      Last contacted: {c.lastContactedAt ? new Date(c.lastContactedAt).toLocaleDateString() : 'Never'}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

// Protected Route
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { auth } = useAuth();
  if (!auth.token) {
    return <Navigate to="/login" replace />;
  }
  return <AppLayout>{children}</AppLayout>;
}

// Main App
function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/contacts" element={<ProtectedRoute><ContactsPage /></ProtectedRoute>} />
          <Route path="/contacts/new" element={<ProtectedRoute><ContactFormPage /></ProtectedRoute>} />
          <Route path="/contacts/:id" element={<ProtectedRoute><ContactDetailPage /></ProtectedRoute>} />
          <Route path="/contacts/:id/edit" element={<ProtectedRoute><ContactFormPage /></ProtectedRoute>} />
          <Route path="/interactions" element={<ProtectedRoute><InteractionsPage /></ProtectedRoute>} />
          <Route path="/introductions" element={<ProtectedRoute><IntroductionsPage /></ProtectedRoute>} />
          <Route path="/analytics" element={<ProtectedRoute><AnalyticsPage /></ProtectedRoute>} />
          <Route path="/" element={<Navigate to="/contacts" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
