import { useState, useEffect, createContext, useContext, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useParams, useNavigate, useLocation } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import { auth, contacts, interactions, introductions, analytics } from './services/api';
import type { Contact, Interaction, Introduction, AnalyticsDashboard, AuthState, InteractionType, Sentiment, Idea, IdeaStage, EquityAction, EquityActionType, ContentItem, ContentType, PersonalNote, NoteType, NetworkEvent, EventType, ContactGroup } from './types';
import { getEquityStatus } from './types';
import './App.css';

// Web Speech API type declarations
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

// Relationship Strength Decay Helper
// Strength decays by 1 point per 30 days without contact, minimum of 1
function getEffectiveStrength(contact: Contact): { current: number; original: number; decayed: boolean } {
  const original = contact.relationshipStrength || 1;
  if (!contact.lastContactedAt) {
    return { current: Math.max(1, original - 3), original, decayed: true }; // Assume 90+ days if never contacted
  }
  const lastContact = new Date(contact.lastContactedAt);
  const daysSinceContact = Math.floor((Date.now() - lastContact.getTime()) / (1000 * 60 * 60 * 24));
  const decayAmount = Math.floor(daysSinceContact / 30); // 1 point per 30 days
  const current = Math.max(1, original - decayAmount);
  return { current, original, decayed: current < original };
}

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

// Theme Context
type Theme = 'light' | 'dark';
const ThemeContext = createContext<{
  theme: Theme;
  toggleTheme: () => void;
}>({
  theme: 'light',
  toggleTheme: () => {},
});

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem('obani_theme');
    if (stored === 'dark' || stored === 'light') return stored;
    // Check system preference
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('obani_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

function useTheme() {
  return useContext(ThemeContext);
}

// Skeleton Loader Components
function ContactCardSkeleton() {
  return (
    <div className="skeleton-card">
      <div className="skeleton-row">
        <div className="skeleton skeleton-avatar" />
        <div className="skeleton-content">
          <div className="skeleton skeleton-text medium" />
          <div className="skeleton skeleton-text short" />
        </div>
      </div>
    </div>
  );
}

function ContactsListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="contacts-skeleton">
      {Array.from({ length: count }).map((_, i) => (
        <ContactCardSkeleton key={i} />
      ))}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="dashboard-skeleton">
      <div className="skeleton skeleton-title" style={{ width: '180px', marginBottom: '24px' }} />
      <div className="stats-row" style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="skeleton skeleton-stat" style={{ flex: 1 }} />
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div className="skeleton" style={{ height: '200px', borderRadius: '16px' }} />
        <div className="skeleton" style={{ height: '200px', borderRadius: '16px' }} />
      </div>
    </div>
  );
}

// Recently Viewed Contacts Helper
type RecentlyViewedEntry = {
  contactId: string;
  viewedAt: string;
};

const RECENTLY_VIEWED_KEY = 'obani_recently_viewed';
const MAX_RECENTLY_VIEWED = 10;

function trackRecentlyViewed(contactId: string) {
  const stored = localStorage.getItem(RECENTLY_VIEWED_KEY);
  let entries: RecentlyViewedEntry[] = stored ? JSON.parse(stored) : [];

  // Remove existing entry for this contact if present
  entries = entries.filter(e => e.contactId !== contactId);

  // Add new entry at the beginning
  entries.unshift({ contactId, viewedAt: new Date().toISOString() });

  // Keep only the most recent entries
  entries = entries.slice(0, MAX_RECENTLY_VIEWED);

  localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(entries));
}

function getRecentlyViewed(): RecentlyViewedEntry[] {
  const stored = localStorage.getItem(RECENTLY_VIEWED_KEY);
  return stored ? JSON.parse(stored) : [];
}

// Global Search Component
function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{
    contacts: Contact[];
    interactions: Interaction[];
    events: NetworkEvent[];
    ideas: Idea[];
    notes: PersonalNote[];
  }>({ contacts: [], interactions: [], events: [], ideas: [], notes: [] });
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const searchTimeout = setTimeout(() => {
      if (query.length >= 2) {
        performSearch(query.toLowerCase());
      } else {
        setResults({ contacts: [], interactions: [], events: [], ideas: [], notes: [] });
      }
    }, 300);

    return () => clearTimeout(searchTimeout);
  }, [query]);

  const performSearch = async (searchQuery: string) => {
    setLoading(true);

    // Search contacts from API
    const contactRes = await contacts.getAll();
    const allContacts = contactRes.success && contactRes.data ? contactRes.data : [];
    const matchedContacts = allContacts.filter(c =>
      c.firstName.toLowerCase().includes(searchQuery) ||
      (c.lastName?.toLowerCase().includes(searchQuery)) ||
      (c.email?.toLowerCase().includes(searchQuery)) ||
      (c.company?.toLowerCase().includes(searchQuery)) ||
      (c.notes?.toLowerCase().includes(searchQuery))
    ).slice(0, 5);

    // Search interactions from API
    const intRes = await interactions.list(1, 500);
    const allInteractions = intRes.success && intRes.data ? intRes.data.items || [] : [];
    const matchedInteractions = allInteractions.filter(i =>
      i.notes?.toLowerCase().includes(searchQuery) ||
      i.keyTopics?.some(t => t.toLowerCase().includes(searchQuery))
    ).slice(0, 5);

    // Search events from localStorage
    const storedEvents = localStorage.getItem('obani_events');
    const allEvents: NetworkEvent[] = storedEvents ? JSON.parse(storedEvents) : [];
    const matchedEvents = allEvents.filter(e =>
      e.name.toLowerCase().includes(searchQuery) ||
      (e.location?.toLowerCase().includes(searchQuery)) ||
      (e.description?.toLowerCase().includes(searchQuery))
    ).slice(0, 5);

    // Search ideas from localStorage
    const storedIdeas = localStorage.getItem('obani_ideas');
    const allIdeas: Idea[] = storedIdeas ? JSON.parse(storedIdeas) : [];
    const matchedIdeas = allIdeas.filter(i =>
      i.title.toLowerCase().includes(searchQuery) ||
      (i.description?.toLowerCase().includes(searchQuery)) ||
      (i.notes?.toLowerCase().includes(searchQuery))
    ).slice(0, 5);

    // Search notes from localStorage
    const storedNotes = localStorage.getItem('obani_notes');
    const allNotes: PersonalNote[] = storedNotes ? JSON.parse(storedNotes) : [];
    const matchedNotes = allNotes.filter(n =>
      n.content.toLowerCase().includes(searchQuery) ||
      (n.title?.toLowerCase().includes(searchQuery))
    ).slice(0, 5);

    setResults({
      contacts: matchedContacts,
      interactions: matchedInteractions,
      events: matchedEvents,
      ideas: matchedIdeas,
      notes: matchedNotes
    });
    setLoading(false);
  };

  const totalResults =
    results.contacts.length +
    results.interactions.length +
    results.events.length +
    results.ideas.length +
    results.notes.length;

  const handleSelect = (type: string, id: string) => {
    setQuery('');
    setIsOpen(false);
    switch (type) {
      case 'contact':
        navigate(`/contacts/${id}`);
        break;
      case 'interaction':
        navigate('/interactions');
        break;
      case 'event':
        navigate('/events');
        break;
      case 'idea':
        navigate('/ideas');
        break;
      case 'note':
        navigate('/notes');
        break;
    }
  };

  return (
    <div className="global-search">
      <div className="search-input-wrapper">
        <span className="search-icon">🔍</span>
        <input
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setIsOpen(true); }}
          onFocus={() => setIsOpen(true)}
          placeholder="Search everything..."
          className="global-search-input"
        />
        {query && (
          <button className="clear-search" onClick={() => { setQuery(''); setResults({ contacts: [], interactions: [], events: [], ideas: [], notes: [] }); }}>
            ×
          </button>
        )}
      </div>

      {isOpen && query.length >= 2 && (
        <div className="search-results-dropdown">
          {loading ? (
            <div className="search-loading">Searching...</div>
          ) : totalResults === 0 ? (
            <div className="search-no-results">No results found for "{query}"</div>
          ) : (
            <>
              {results.contacts.length > 0 && (
                <div className="search-section">
                  <div className="search-section-header">👥 Contacts</div>
                  {results.contacts.map(c => (
                    <button key={c.id} className="search-result-item" onClick={() => handleSelect('contact', c.id)}>
                      <span className="result-icon">{c.firstName[0]}</span>
                      <div className="result-info">
                        <span className="result-title">{c.firstName} {c.lastName || ''}</span>
                        <span className="result-meta">{c.company || c.email}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {results.interactions.length > 0 && (
                <div className="search-section">
                  <div className="search-section-header">💬 Interactions</div>
                  {results.interactions.map(i => (
                    <button key={i.id} className="search-result-item" onClick={() => handleSelect('interaction', i.id)}>
                      <span className="result-icon type">{i.type === 'MEETING' ? '🤝' : i.type === 'CALL' ? '📞' : '✉️'}</span>
                      <div className="result-info">
                        <span className="result-title">{i.notes?.substring(0, 50) || 'Interaction'}{i.notes && i.notes.length > 50 ? '...' : ''}</span>
                        <span className="result-meta">{new Date(i.date).toLocaleDateString()}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {results.events.length > 0 && (
                <div className="search-section">
                  <div className="search-section-header">📅 Events</div>
                  {results.events.map(e => (
                    <button key={e.id} className="search-result-item" onClick={() => handleSelect('event', e.id)}>
                      <span className="result-icon type">🎤</span>
                      <div className="result-info">
                        <span className="result-title">{e.name}</span>
                        <span className="result-meta">{e.location || new Date(e.date).toLocaleDateString()}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {results.ideas.length > 0 && (
                <div className="search-section">
                  <div className="search-section-header">💡 Ideas</div>
                  {results.ideas.map(i => (
                    <button key={i.id} className="search-result-item" onClick={() => handleSelect('idea', i.id)}>
                      <span className="result-icon type">💡</span>
                      <div className="result-info">
                        <span className="result-title">{i.title}</span>
                        <span className="result-meta">{i.stage}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {results.notes.length > 0 && (
                <div className="search-section">
                  <div className="search-section-header">📝 Notes</div>
                  {results.notes.map(n => (
                    <button key={n.id} className="search-result-item" onClick={() => handleSelect('note', n.id)}>
                      <span className="result-icon type">📝</span>
                      <div className="result-info">
                        <span className="result-title">{n.title || n.content.substring(0, 40)}</span>
                        <span className="result-meta">{n.noteType}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {isOpen && <div className="search-backdrop" onClick={() => setIsOpen(false)} />}
    </div>
  );
}

// Voice Input Component - Reusable voice-to-text for all note fields
function VoiceTextArea({
  value,
  onChange,
  placeholder,
  rows = 3,
  className = '',
  label
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  label?: string;
}) {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    // Check for browser support
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    setIsSupported(!!SpeechRecognition);

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            final += transcript;
          } else {
            interim += transcript;
          }
        }

        setInterimTranscript(interim);
        if (final) {
          onChange(value + (value ? ' ' : '') + final);
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
        setInterimTranscript('');
      };

      recognition.onend = () => {
        setIsListening(false);
        setInterimTranscript('');
      };

      recognitionRef.current = recognition;
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  // Update the onresult handler when value changes
  useEffect(() => {
    if (recognitionRef.current) {
      recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            final += transcript;
          } else {
            interim += transcript;
          }
        }

        setInterimTranscript(interim);
        if (final) {
          onChange(value + (value ? ' ' : '') + final);
        }
      };
    }
  }, [value, onChange]);

  const toggleListening = () => {
    if (!recognitionRef.current) return;

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
      setInterimTranscript('');
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (err) {
        console.error('Failed to start recognition:', err);
      }
    }
  };

  return (
    <div className={`voice-textarea-wrapper ${className}`}>
      {label && <label className="voice-textarea-label">{label}</label>}
      <div className={`voice-textarea-container ${isListening ? 'listening' : ''}`}>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={isListening ? 'Listening...' : placeholder}
          rows={rows}
          className="voice-textarea"
        />
        {interimTranscript && (
          <div className="interim-transcript">{interimTranscript}</div>
        )}
        {isSupported && (
          <button
            type="button"
            className={`voice-btn ${isListening ? 'active' : ''}`}
            onClick={toggleListening}
            title={isListening ? 'Stop recording' : 'Start voice input'}
          >
            {isListening ? (
              <span className="voice-icon recording">
                <span className="pulse-ring"></span>
                🎙️
              </span>
            ) : (
              <span className="voice-icon">🎤</span>
            )}
          </button>
        )}
      </div>
      {isListening && (
        <div className="voice-status">
          <span className="voice-dot"></span>
          Listening... Speak now
        </div>
      )}
    </div>
  );
}

// Quick Log Modal
function QuickLogModal({ onClose }: { onClose: () => void }) {
  const [contactList, setContactList] = useState<Contact[]>([]);
  const [selectedContactId, setSelectedContactId] = useState('');
  const [contactSearch, setContactSearch] = useState('');
  const [type, setType] = useState<InteractionType>('MEETING');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [sentiment, setSentiment] = useState<Sentiment>('POSITIVE');
  const [keyTopicsInput, setKeyTopicsInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async () => {
    const res = await contacts.getAll();
    if (res.success && res.data) {
      setContactList(res.data.filter(c => !c.isArchived));
    }
  };

  const filteredContacts = contactSearch
    ? contactList.filter(c =>
        `${c.firstName} ${c.lastName || ''}`.toLowerCase().includes(contactSearch.toLowerCase()) ||
        c.company?.toLowerCase().includes(contactSearch.toLowerCase())
      ).slice(0, 5)
    : [];

  const selectedContact = contactList.find(c => c.id === selectedContactId);

  const handleSave = async () => {
    if (!selectedContactId || !notes.trim()) return;
    setSaving(true);

    // Parse key topics from comma-separated input
    const keyTopics = keyTopicsInput
      .split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0);

    const res = await interactions.create({
      contactId: selectedContactId,
      type,
      date,
      notes,
      sentiment,
      keyTopics,
    });

    if (res.success) {
      // Update contact's lastContactedAt
      await contacts.update(selectedContactId, {
        lastContactedAt: new Date().toISOString()
      });
      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1500);
    }
    setSaving(false);
  };

  if (success) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal quick-log-modal" onClick={e => e.stopPropagation()}>
          <div className="quick-log-success">
            <div className="success-check">✓</div>
            <h3>Interaction Logged!</h3>
            <p>with {selectedContact?.firstName} {selectedContact?.lastName || ''}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal quick-log-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Quick Log</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {/* Contact Selection */}
          <div className="form-group">
            <label>Who did you interact with? *</label>
            {selectedContact ? (
              <div className="selected-contact-display">
                <div className="contact-avatar-small">{selectedContact.firstName[0]}</div>
                <span>{selectedContact.firstName} {selectedContact.lastName || ''}</span>
                <button className="change-btn" onClick={() => { setSelectedContactId(''); setContactSearch(''); }}>
                  Change
                </button>
              </div>
            ) : (
              <>
                <input
                  type="text"
                  value={contactSearch}
                  onChange={e => setContactSearch(e.target.value)}
                  placeholder="Search contacts..."
                  autoFocus
                />
                {filteredContacts.length > 0 && (
                  <div className="contact-suggestions quick-log">
                    {filteredContacts.map(c => (
                      <button
                        key={c.id}
                        className="contact-suggestion"
                        onClick={() => { setSelectedContactId(c.id); setContactSearch(''); }}
                      >
                        <span className="avatar">{c.firstName[0]}</span>
                        {c.firstName} {c.lastName || ''} {c.company && <small>({c.company})</small>}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Type Selection */}
          <div className="form-group">
            <label>Type</label>
            <div className="type-buttons">
              {(['MEETING', 'CALL', 'EMAIL', 'MESSAGE', 'EVENT'] as InteractionType[]).map(t => (
                <button
                  key={t}
                  type="button"
                  className={`type-btn ${type === t ? 'active' : ''}`}
                  onClick={() => setType(t)}
                >
                  {t === 'MEETING' ? '🤝' : t === 'CALL' ? '📞' : t === 'EMAIL' ? '✉️' : t === 'MESSAGE' ? '💬' : '🎉'}
                  <span>{t.charAt(0) + t.slice(1).toLowerCase()}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Date */}
          <div className="form-group">
            <label>Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>

          {/* Notes */}
          <div className="form-group">
            <VoiceTextArea
              label="Quick notes *"
              value={notes}
              onChange={setNotes}
              placeholder="What did you discuss? Tap mic to speak..."
              rows={3}
            />
          </div>

          {/* Key Topics */}
          <div className="form-group">
            <label>Key Topics <small>(comma-separated)</small></label>
            <input
              type="text"
              value={keyTopicsInput}
              onChange={e => setKeyTopicsInput(e.target.value)}
              placeholder="e.g., Series A, AI strategy, hiring"
            />
          </div>

          {/* Sentiment */}
          <div className="form-group">
            <label>How did it go?</label>
            <div className="sentiment-buttons">
              <button
                type="button"
                className={`sentiment-btn positive ${sentiment === 'POSITIVE' ? 'active' : ''}`}
                onClick={() => setSentiment('POSITIVE')}
              >
                😊 Great
              </button>
              <button
                type="button"
                className={`sentiment-btn neutral ${sentiment === 'NEUTRAL' ? 'active' : ''}`}
                onClick={() => setSentiment('NEUTRAL')}
              >
                😐 Okay
              </button>
              <button
                type="button"
                className={`sentiment-btn negative ${sentiment === 'NEGATIVE' ? 'active' : ''}`}
                onClick={() => setSentiment('NEGATIVE')}
              >
                😟 Rough
              </button>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn primary"
            onClick={handleSave}
            disabled={!selectedContactId || !notes.trim() || saving}
          >
            {saving ? 'Saving...' : 'Log Interaction'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Keyboard Shortcuts Modal
function KeyboardShortcutsModal({ onClose }: { onClose: () => void }) {
  const shortcuts = [
    { category: 'Navigation', items: [
      { keys: ['g', 'd'], desc: 'Go to Dashboard' },
      { keys: ['g', 'c'], desc: 'Go to Contacts' },
      { keys: ['g', 'a'], desc: 'Go to Analytics' },
      { keys: ['g', 'i'], desc: 'Go to Ideas' },
      { keys: ['g', 'n'], desc: 'Go to Notes' },
      { keys: ['g', 'e'], desc: 'Go to Events' },
    ]},
    { category: 'Actions', items: [
      { keys: ['/'], desc: 'Open search' },
      { keys: ['n'], desc: 'New contact' },
      { keys: ['l'], desc: 'Quick log interaction' },
    ]},
    { category: 'General', items: [
      { keys: ['?'], desc: 'Show keyboard shortcuts' },
      { keys: ['Esc'], desc: 'Close modal / cancel' },
    ]},
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal shortcuts-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Keyboard Shortcuts</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        <div className="shortcuts-content">
          {shortcuts.map(group => (
            <div key={group.category} className="shortcut-group">
              <h3>{group.category}</h3>
              <div className="shortcut-list">
                {group.items.map((item, idx) => (
                  <div key={idx} className="shortcut-item">
                    <div className="shortcut-keys">
                      {item.keys.map((key, i) => (
                        <span key={i}>
                          <kbd>{key}</kbd>
                          {i < item.keys.length - 1 && <span className="key-sep">then</span>}
                        </span>
                      ))}
                    </div>
                    <span className="shortcut-desc">{item.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Layout with Navigation
function AppLayout({ children }: { children: React.ReactNode }) {
  const { auth: authState, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [showQuickLog, setShowQuickLog] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(false);
  const navigate = useNavigate();
  const lastKeyRef = useRef<{ key: string; time: number } | null>(null);

  // Keyboard shortcuts handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input or textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        if (e.key === 'Escape') {
          target.blur();
        }
        return;
      }

      // Check for two-key sequences (g + something)
      const now = Date.now();
      const lastKey = lastKeyRef.current;

      if (lastKey && lastKey.key === 'g' && now - lastKey.time < 500) {
        lastKeyRef.current = null;
        switch (e.key.toLowerCase()) {
          case 'd': navigate('/'); return;
          case 'c': navigate('/contacts'); return;
          case 'a': navigate('/analytics'); return;
          case 'i': navigate('/ideas'); return;
          case 'n': navigate('/notes'); return;
          case 'e': navigate('/events'); return;
        }
      }

      // Record 'g' key for sequences
      if (e.key.toLowerCase() === 'g') {
        lastKeyRef.current = { key: 'g', time: now };
        return;
      }

      // Single key shortcuts
      switch (e.key) {
        case '/':
          e.preventDefault();
          document.querySelector<HTMLInputElement>('.global-search input')?.focus();
          break;
        case 'n':
          navigate('/contacts/new');
          break;
        case 'l':
          setShowQuickLog(true);
          break;
        case '?':
          setShowShortcuts(true);
          break;
        case 'Escape':
          setShowQuickLog(false);
          setShowShortcuts(false);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="app-layout">
      {/* Desktop & Tablet Top Nav */}
      <nav className="navbar">
        <div className="nav-brand">
          <div className="nav-logo"></div>
          <span className="nav-title">obani</span>
        </div>

        {/* Desktop Nav Links */}
        <div className="nav-links desktop-only">
          <Link to="/" className={`nav-link ${location.pathname === '/' ? 'active' : ''}`}>Dashboard</Link>
          <Link to="/followups" className={`nav-link ${location.pathname === '/followups' ? 'active' : ''}`}>Follow-ups</Link>
          <Link to="/contacts" className={`nav-link ${location.pathname.startsWith('/contacts') ? 'active' : ''}`}>Contacts</Link>
          <Link to="/interactions" className={`nav-link ${location.pathname === '/interactions' ? 'active' : ''}`}>Interactions</Link>
          <Link to="/activity" className={`nav-link ${location.pathname === '/activity' ? 'active' : ''}`}>Feed</Link>
          <Link to="/introductions" className={`nav-link ${location.pathname === '/introductions' ? 'active' : ''}`}>Intros</Link>
          <Link to="/ideas" className={`nav-link ${location.pathname === '/ideas' ? 'active' : ''}`}>Ideas</Link>
          <Link to="/notes" className={`nav-link ${location.pathname === '/notes' ? 'active' : ''}`}>Notes</Link>
          <Link to="/content" className={`nav-link ${location.pathname === '/content' ? 'active' : ''}`}>Library</Link>
          <Link to="/events" className={`nav-link ${location.pathname === '/events' ? 'active' : ''}`}>Events</Link>
          <Link to="/groups" className={`nav-link ${location.pathname === '/groups' ? 'active' : ''}`}>Groups</Link>
          <Link to="/analytics" className={`nav-link ${location.pathname === '/analytics' ? 'active' : ''}`}>Analytics</Link>
          <Link to="/settings" className={`nav-link ${location.pathname === '/settings' ? 'active' : ''}`}>Settings</Link>
        </div>

        {/* Mobile Menu Toggle */}
        <button
          className="mobile-menu-toggle mobile-only"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle menu"
        >
          <span className={`hamburger ${mobileMenuOpen ? 'open' : ''}`}>
            <span></span>
            <span></span>
            <span></span>
          </span>
        </button>

        <GlobalSearch />
        <div className="nav-user desktop-only">
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          >
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
          <span className="user-name">{authState.user?.name}</span>
          <button className="btn-logout" onClick={logout}>Logout</button>
        </div>
      </nav>

      {/* Mobile Slide-out Menu */}
      <div className={`mobile-menu-overlay ${mobileMenuOpen ? 'open' : ''}`} onClick={() => setMobileMenuOpen(false)} />
      <div className={`mobile-slide-menu ${mobileMenuOpen ? 'open' : ''}`}>
        <div className="mobile-menu-header">
          <div className="mobile-user-info">
            <div className="mobile-user-avatar">{authState.user?.name?.[0] || 'U'}</div>
            <div className="mobile-user-details">
              <span className="mobile-user-name">{authState.user?.name}</span>
              <span className="mobile-user-email">{authState.user?.email}</span>
            </div>
          </div>
          <button className="theme-toggle-mobile" onClick={toggleTheme}>
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
        </div>
        <nav className="mobile-menu-nav">
          <Link to="/" className={`mobile-nav-link ${location.pathname === '/' ? 'active' : ''}`}>
            <span className="nav-icon">🏠</span> Dashboard
          </Link>
          <Link to="/followups" className={`mobile-nav-link ${location.pathname === '/followups' ? 'active' : ''}`}>
            <span className="nav-icon">🔔</span> Follow-ups
          </Link>
          <Link to="/contacts" className={`mobile-nav-link ${location.pathname.startsWith('/contacts') ? 'active' : ''}`}>
            <span className="nav-icon">👥</span> Contacts
          </Link>
          <Link to="/interactions" className={`mobile-nav-link ${location.pathname === '/interactions' ? 'active' : ''}`}>
            <span className="nav-icon">💬</span> Interactions
          </Link>
          <Link to="/introductions" className={`mobile-nav-link ${location.pathname === '/introductions' ? 'active' : ''}`}>
            <span className="nav-icon">🔗</span> Intros
          </Link>
          <div className="mobile-menu-divider"></div>
          <Link to="/ideas" className={`mobile-nav-link ${location.pathname === '/ideas' ? 'active' : ''}`}>
            <span className="nav-icon">💡</span> Ideas
          </Link>
          <Link to="/notes" className={`mobile-nav-link ${location.pathname === '/notes' ? 'active' : ''}`}>
            <span className="nav-icon">📝</span> Notes
          </Link>
          <Link to="/events" className={`mobile-nav-link ${location.pathname === '/events' ? 'active' : ''}`}>
            <span className="nav-icon">📅</span> Events
          </Link>
          <Link to="/content" className={`mobile-nav-link ${location.pathname === '/content' ? 'active' : ''}`}>
            <span className="nav-icon">📚</span> Library
          </Link>
          <div className="mobile-menu-divider"></div>
          <Link to="/analytics" className={`mobile-nav-link ${location.pathname === '/analytics' ? 'active' : ''}`}>
            <span className="nav-icon">📊</span> Analytics
          </Link>
          <Link to="/settings" className={`mobile-nav-link ${location.pathname === '/settings' ? 'active' : ''}`}>
            <span className="nav-icon">⚙️</span> Settings
          </Link>
        </nav>
        <div className="mobile-menu-footer">
          <button className="btn-logout-mobile" onClick={logout}>
            <span className="nav-icon">🚪</span> Log out
          </button>
        </div>
      </div>

      <main className="main-content">{children}</main>

      {/* Mobile Bottom Navigation */}
      <nav className="mobile-bottom-nav mobile-only">
        <Link to="/" className={`bottom-nav-item ${location.pathname === '/' ? 'active' : ''}`}>
          <span className="bottom-nav-icon">🏠</span>
          <span className="bottom-nav-label">Home</span>
        </Link>
        <Link to="/contacts" className={`bottom-nav-item ${location.pathname.startsWith('/contacts') ? 'active' : ''}`}>
          <span className="bottom-nav-icon">👥</span>
          <span className="bottom-nav-label">Contacts</span>
        </Link>
        <button
          className="bottom-nav-item bottom-nav-add"
          onClick={() => setShowQuickActions(!showQuickActions)}
        >
          <span className="bottom-nav-icon add-icon">+</span>
        </button>
        <Link to="/followups" className={`bottom-nav-item ${location.pathname === '/followups' ? 'active' : ''}`}>
          <span className="bottom-nav-icon">🔔</span>
          <span className="bottom-nav-label">Tasks</span>
        </Link>
        <button
          className="bottom-nav-item"
          onClick={() => setMobileMenuOpen(true)}
        >
          <span className="bottom-nav-icon">☰</span>
          <span className="bottom-nav-label">More</span>
        </button>
      </nav>

      {/* Quick Actions FAB */}
      <div className={`quick-actions-container ${showQuickActions ? 'expanded' : ''}`}>
        {showQuickActions && (
          <div className="quick-actions-menu">
            <button
              className="quick-action-item"
              onClick={() => { setShowQuickActions(false); setShowQuickLog(true); }}
              title="Log Interaction"
            >
              <span className="action-icon">💬</span>
              <span className="action-label">Log Interaction</span>
            </button>
            <button
              className="quick-action-item"
              onClick={() => { setShowQuickActions(false); navigate('/contacts/new'); }}
              title="Add Contact"
            >
              <span className="action-icon">👤</span>
              <span className="action-label">Add Contact</span>
            </button>
            <button
              className="quick-action-item"
              onClick={() => { setShowQuickActions(false); navigate('/events'); }}
              title="Add Event"
            >
              <span className="action-icon">📅</span>
              <span className="action-label">Add Event</span>
            </button>
            <button
              className="quick-action-item"
              onClick={() => { setShowQuickActions(false); navigate('/notes'); }}
              title="Add Note"
            >
              <span className="action-icon">📝</span>
              <span className="action-label">Add Note</span>
            </button>
            <button
              className="quick-action-item"
              onClick={() => { setShowQuickActions(false); navigate('/ideas'); }}
              title="Add Idea"
            >
              <span className="action-icon">💡</span>
              <span className="action-label">Add Idea</span>
            </button>
          </div>
        )}
        <button
          className={`quick-actions-fab ${showQuickActions ? 'active' : ''}`}
          onClick={() => setShowQuickActions(!showQuickActions)}
          title="Quick Actions"
        >
          <span className="fab-icon">{showQuickActions ? '×' : '+'}</span>
        </button>
      </div>

      {/* Backdrop for quick actions */}
      {showQuickActions && (
        <div className="quick-actions-backdrop" onClick={() => setShowQuickActions(false)} />
      )}

      {/* Quick Log Modal */}
      {showQuickLog && <QuickLogModal onClose={() => setShowQuickLog(false)} />}

      {/* Keyboard Shortcuts Modal */}
      {showShortcuts && <KeyboardShortcutsModal onClose={() => setShowShortcuts(false)} />}

      {/* Keyboard shortcut hint */}
      <div className="keyboard-hint" title="Press ? for shortcuts">
        <kbd>?</kbd>
      </div>
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
interface FilterPreset {
  name: string;
  minStrength: number;
  sectorFilter: string;
  lastContactFilter: '' | '30' | '60' | '90' | '90+';
}

function ContactsPage() {
  const [contactList, setContactList] = useState<Contact[]>([]);
  const [allInteractions, setAllInteractions] = useState<Interaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [searchInNotes, setSearchInNotes] = useState(true);
  const [sortBy, setSortBy] = useState<'name' | 'recent' | 'strength'>('name');
  const [showFilters, setShowFilters] = useState(false);
  const [minStrength, setMinStrength] = useState(0);
  const [sectorFilter, setSectorFilter] = useState('');
  const [lastContactFilter, setLastContactFilter] = useState<'' | '30' | '60' | '90' | '90+'>('');
  const [savedPresets, setSavedPresets] = useState<FilterPreset[]>([]);
  const [newPresetName, setNewPresetName] = useState('');
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkTagModal, setShowBulkTagModal] = useState(false);
  const [equityFilter, setEquityFilter] = useState<'' | 'giver' | 'healthy' | 'balanced' | 'overdrawn' | 'toxic'>('');
  const [allEquityActions, setAllEquityActions] = useState<EquityAction[]>([]);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showBulkFollowUpModal, setShowBulkFollowUpModal] = useState(false);
  const [bulkFollowUpDate, setBulkFollowUpDate] = useState('');
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [tagFilter, setTagFilter] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [hasEmailFilter, setHasEmailFilter] = useState<'' | 'yes' | 'no'>('');
  const [hasPhoneFilter, setHasPhoneFilter] = useState<'' | 'yes' | 'no'>('');
  const [investmentMinFilter, setInvestmentMinFilter] = useState('');
  const [investmentMaxFilter, setInvestmentMaxFilter] = useState('');
  const [previewContact, setPreviewContact] = useState<Contact | null>(null);

  useEffect(() => {
    loadData();
    // Load equity actions for filtering
    const storedEquity = localStorage.getItem('obani_equity_actions');
    if (storedEquity) {
      setAllEquityActions(JSON.parse(storedEquity));
    }
    // Load saved presets from localStorage
    const stored = localStorage.getItem('obani_filter_presets');
    if (stored) {
      setSavedPresets(JSON.parse(stored));
    }
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [contactRes, intRes] = await Promise.all([
      contacts.list(1, 200),
      interactions.list(1, 500)
    ]);
    if (contactRes.success && contactRes.data) {
      setContactList(contactRes.data.items || []);
    } else {
      setError(contactRes.error || 'Failed to load contacts');
    }
    if (intRes.success && intRes.data) {
      setAllInteractions(intRes.data.items || []);
    }
    setLoading(false);
  };

  const savePreset = () => {
    if (!newPresetName.trim()) return;
    const preset: FilterPreset = {
      name: newPresetName.trim(),
      minStrength,
      sectorFilter,
      lastContactFilter
    };
    const updated = [...savedPresets, preset];
    setSavedPresets(updated);
    localStorage.setItem('obani_filter_presets', JSON.stringify(updated));
    setNewPresetName('');
    setShowSavePreset(false);
  };

  const loadPreset = (preset: FilterPreset) => {
    setMinStrength(preset.minStrength);
    setSectorFilter(preset.sectorFilter);
    setLastContactFilter(preset.lastContactFilter);
  };

  const deletePreset = (index: number) => {
    const updated = savedPresets.filter((_, i) => i !== index);
    setSavedPresets(updated);
    localStorage.setItem('obani_filter_presets', JSON.stringify(updated));
  };

  // Get interaction matches for a contact
  const getInteractionMatches = (contactId: string, query: string): string[] => {
    if (!searchInNotes) return [];
    const matches: string[] = [];
    allInteractions
      .filter(int => int.contactId === contactId)
      .forEach(int => {
        if (int.notes?.toLowerCase().includes(query)) {
          matches.push(int.notes.substring(0, 80) + (int.notes.length > 80 ? '...' : ''));
        }
        if (int.keyTopics?.some(t => t.toLowerCase().includes(query))) {
          matches.push(`Topics: ${int.keyTopics.join(', ')}`);
        }
      });
    return matches.slice(0, 2); // Limit to 2 matches
  };

  // Get unique sectors from contacts
  const allSectors = [...new Set(contactList.flatMap(c => c.sectors || []))].sort();

  // Get all unique tags from contacts
  const allTags = [...new Set(contactList.flatMap(c => c.tags || []))].sort();

  // Get all unique companies from contacts
  const allCompanies = [...new Set(contactList.map(c => c.company).filter(Boolean) as string[])].sort();

  // Get equity score for a contact
  const getContactEquityScore = (contactId: string): number => {
    return allEquityActions.filter(a => a.contactId === contactId).reduce((sum, a) => sum + a.points, 0);
  };

  // Toggle contact selection
  const toggleSelection = (contactId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const newSet = new Set(selectedIds);
    if (newSet.has(contactId)) {
      newSet.delete(contactId);
    } else {
      newSet.add(contactId);
    }
    setSelectedIds(newSet);
  };

  // Select/deselect all visible contacts
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredContacts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredContacts.map(c => c.id)));
    }
  };

  // Apply bulk tags
  const applyBulkTags = async (tagsToAdd: string[], tagsToRemove: string[]) => {
    for (const contactId of selectedIds) {
      const contact = contactList.find(c => c.id === contactId);
      if (contact) {
        const currentTags = contact.tags || [];
        const newTags = [
          ...currentTags.filter(t => !tagsToRemove.includes(t)),
          ...tagsToAdd.filter(t => !currentTags.includes(t))
        ];
        await contacts.update(contactId, { tags: newTags });
      }
    }
    await loadData();
    setSelectedIds(new Set());
    setSelectMode(false);
    setShowBulkTagModal(false);
  };

  // Delete selected contacts
  const deleteSelectedContacts = async () => {
    if (!confirm(`Delete ${selectedIds.size} contacts? This cannot be undone.`)) return;
    setBulkProcessing(true);
    for (const contactId of selectedIds) {
      await contacts.delete(contactId);
    }
    await loadData();
    setSelectedIds(new Set());
    setSelectMode(false);
    setBulkProcessing(false);
  };

  // Export selected contacts as CSV
  const exportSelectedCSV = () => {
    const selected = contactList.filter(c => selectedIds.has(c.id));
    const headers = ['First Name', 'Last Name', 'Email', 'Phone', 'Company', 'Title', 'Location', 'Tags', 'Sectors', 'Relationship Strength', 'Last Contacted', 'Notes'];
    const rows = selected.map(c => [
      c.firstName,
      c.lastName || '',
      c.email || '',
      c.phone || '',
      c.company || '',
      c.title || '',
      c.location || '',
      (c.tags || []).join('; '),
      (c.sectors || []).join('; '),
      c.relationshipStrength || 0,
      c.lastContactedAt || '',
      (c.notes || '').replace(/"/g, '""')
    ]);
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contacts-export-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Set follow-up date for selected contacts
  const applyBulkFollowUp = async () => {
    if (!bulkFollowUpDate) return;
    setBulkProcessing(true);
    for (const contactId of selectedIds) {
      await contacts.update(contactId, { nextFollowUpAt: bulkFollowUpDate });
    }
    await loadData();
    setSelectedIds(new Set());
    setSelectMode(false);
    setShowBulkFollowUpModal(false);
    setBulkFollowUpDate('');
    setBulkProcessing(false);
  };

  const filteredContacts = contactList
    .filter(c => {
      // Text search
      if (search) {
        const q = search.toLowerCase();
        const matchesContact = c.firstName.toLowerCase().includes(q) ||
          c.lastName?.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q) ||
          c.company?.toLowerCase().includes(q) ||
          c.tags?.some(t => t.toLowerCase().includes(q)) ||
          c.notes?.toLowerCase().includes(q) ||
          c.needs?.some(n => n.toLowerCase().includes(q)) ||
          c.offers?.some(o => o.toLowerCase().includes(q)) ||
          c.howWeMet?.toLowerCase().includes(q);

        // Also search interactions if enabled
        const matchesInteractions = searchInNotes && allInteractions.some(int =>
          int.contactId === c.id && (
            int.notes?.toLowerCase().includes(q) ||
            int.keyTopics?.some(t => t.toLowerCase().includes(q))
          )
        );

        if (!matchesContact && !matchesInteractions) return false;
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

      // Equity filter
      if (equityFilter) {
        const score = getContactEquityScore(c.id);
        const status = getEquityStatus(score);
        if (equityFilter === 'giver' && status !== 'SUPER_GIVER') return false;
        if (equityFilter === 'healthy' && status !== 'HEALTHY') return false;
        if (equityFilter === 'balanced' && status !== 'BALANCED') return false;
        if (equityFilter === 'overdrawn' && status !== 'OVERDRAWN') return false;
        if (equityFilter === 'toxic' && status !== 'TOXIC') return false;
      }

      // Tag filter
      if (tagFilter && !c.tags?.includes(tagFilter)) {
        return false;
      }

      // Company filter
      if (companyFilter && c.company?.toLowerCase() !== companyFilter.toLowerCase()) {
        return false;
      }

      // Has email filter
      if (hasEmailFilter === 'yes' && !c.email) return false;
      if (hasEmailFilter === 'no' && c.email) return false;

      // Has phone filter
      if (hasPhoneFilter === 'yes' && !c.phone) return false;
      if (hasPhoneFilter === 'no' && c.phone) return false;

      // Investment range filter (for VCs)
      if (investmentMinFilter || investmentMaxFilter) {
        const minFilter = investmentMinFilter ? parseFloat(investmentMinFilter) * 1000000 : 0;
        const maxFilter = investmentMaxFilter ? parseFloat(investmentMaxFilter) * 1000000 : Infinity;
        const contactMin = c.investmentTicketMin || 0;
        const contactMax = c.investmentTicketMax || Infinity;

        // Check if the contact's range overlaps with the filter range
        // A contact matches if their range has any overlap with the filter range
        if (contactMax < minFilter || contactMin > maxFilter) {
          return false;
        }
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

  const activeFilterCount = [minStrength > 0, sectorFilter, lastContactFilter, equityFilter, tagFilter, companyFilter, hasEmailFilter, hasPhoneFilter, investmentMinFilter, investmentMaxFilter].filter(Boolean).length;

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
    return (
      <div className="contacts-page">
        <div className="page-header">
          <div className="skeleton skeleton-title" style={{ width: '120px', height: '32px' }} />
          <div style={{ display: 'flex', gap: '8px' }}>
            <div className="skeleton" style={{ width: '80px', height: '40px', borderRadius: '10px' }} />
            <div className="skeleton" style={{ width: '100px', height: '40px', borderRadius: '10px' }} />
          </div>
        </div>
        <ContactsListSkeleton count={6} />
      </div>
    );
  }

  return (
    <div className="contacts-page">
      <div className="page-header">
        <h1>Contacts</h1>
        <div className="header-actions">
          <button
            className={`btn ${selectMode ? 'primary' : 'secondary'}`}
            onClick={() => {
              setSelectMode(!selectMode);
              if (selectMode) setSelectedIds(new Set());
            }}
          >
            {selectMode ? 'Cancel' : 'Select'}
          </button>
          <button className="btn secondary" onClick={() => setShowImportModal(true)}>Import</button>
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

      {selectMode && (
        <div className="bulk-actions-bar">
          <label className="select-all-label">
            <input
              type="checkbox"
              checked={selectedIds.size === filteredContacts.length && filteredContacts.length > 0}
              onChange={toggleSelectAll}
            />
            <span>Select all ({filteredContacts.length})</span>
          </label>
          <span className="selected-count">{selectedIds.size} selected</span>
          {selectedIds.size > 0 && (
            <div className="bulk-actions-buttons">
              <button className="btn secondary" onClick={() => setShowBulkTagModal(true)} disabled={bulkProcessing}>
                Tags
              </button>
              <button className="btn secondary" onClick={() => setShowBulkFollowUpModal(true)} disabled={bulkProcessing}>
                Follow-up
              </button>
              <button className="btn secondary" onClick={exportSelectedCSV} disabled={bulkProcessing}>
                Export
              </button>
              <button className="btn danger" onClick={deleteSelectedContacts} disabled={bulkProcessing}>
                {bulkProcessing ? 'Processing...' : 'Delete'}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="filters-bar">
        <div className="search-wrapper">
          <input
            type="text"
            className="search-input"
            placeholder={searchInNotes ? "Search contacts, notes & interactions..." : "Search contacts..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <label className="search-notes-toggle">
            <input
              type="checkbox"
              checked={searchInNotes}
              onChange={(e) => setSearchInNotes(e.target.checked)}
            />
            <span>Include notes</span>
          </label>
        </div>
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

          {allTags.length > 0 && (
            <div className="filter-group">
              <label>Tag</label>
              <select
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
              >
                <option value="">All Tags</option>
                {allTags.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          )}

          {allCompanies.length > 0 && (
            <div className="filter-group">
              <label>Company</label>
              <select
                value={companyFilter}
                onChange={(e) => setCompanyFilter(e.target.value)}
              >
                <option value="">All Companies</option>
                {allCompanies.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          )}

          <div className="filter-group">
            <label>Contact Info</label>
            <div className="contact-info-filters">
              <div className="mini-filter">
                <span>Email:</span>
                <select value={hasEmailFilter} onChange={(e) => setHasEmailFilter(e.target.value as '' | 'yes' | 'no')}>
                  <option value="">Any</option>
                  <option value="yes">Has Email</option>
                  <option value="no">No Email</option>
                </select>
              </div>
              <div className="mini-filter">
                <span>Phone:</span>
                <select value={hasPhoneFilter} onChange={(e) => setHasPhoneFilter(e.target.value as '' | 'yes' | 'no')}>
                  <option value="">Any</option>
                  <option value="yes">Has Phone</option>
                  <option value="no">No Phone</option>
                </select>
              </div>
            </div>
          </div>

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

          <div className="filter-group">
            <label>Equity Status</label>
            <div className="equity-filter">
              {[
                { val: '', label: 'Any' },
                { val: 'giver', label: 'Super Giver' },
                { val: 'healthy', label: 'Healthy' },
                { val: 'balanced', label: 'Balanced' },
                { val: 'overdrawn', label: 'Overdrawn' },
                { val: 'toxic', label: 'Toxic' },
              ].map(opt => (
                <button
                  key={opt.val}
                  className={`equity-filter-btn ${equityFilter === opt.val ? 'active' : ''} ${opt.val ? `equity-${opt.val}` : ''}`}
                  onClick={() => setEquityFilter(opt.val as typeof equityFilter)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="filter-group">
            <label>Investment Ticket <small>(for VCs/Investors)</small></label>
            <div className="investment-range-filter">
              <div className="range-input">
                <span>Min:</span>
                <input
                  type="number"
                  placeholder="0"
                  value={investmentMinFilter}
                  onChange={(e) => setInvestmentMinFilter(e.target.value)}
                  min="0"
                  step="0.1"
                />
                <span className="unit">M</span>
              </div>
              <span className="range-separator">to</span>
              <div className="range-input">
                <span>Max:</span>
                <input
                  type="number"
                  placeholder="∞"
                  value={investmentMaxFilter}
                  onChange={(e) => setInvestmentMaxFilter(e.target.value)}
                  min="0"
                  step="0.1"
                />
                <span className="unit">M</span>
              </div>
              {(investmentMinFilter || investmentMaxFilter) && (
                <button
                  className="clear-range-btn"
                  onClick={() => { setInvestmentMinFilter(''); setInvestmentMaxFilter(''); }}
                >
                  Clear
                </button>
              )}
            </div>
            <small className="filter-hint">
              Shows contacts whose investment range overlaps with your filter
            </small>
          </div>

          <div className="filter-group presets-group">
            <label>Saved Presets</label>
            {savedPresets.length > 0 && (
              <div className="preset-chips">
                {savedPresets.map((preset, idx) => (
                  <div key={idx} className="preset-chip">
                    <button className="preset-load" onClick={() => loadPreset(preset)}>
                      {preset.name}
                    </button>
                    <button className="preset-delete" onClick={() => deletePreset(idx)}>×</button>
                  </div>
                ))}
              </div>
            )}
            {activeFilterCount > 0 && !showSavePreset && (
              <button className="save-preset-btn" onClick={() => setShowSavePreset(true)}>
                + Save Current Filter
              </button>
            )}
            {showSavePreset && (
              <div className="save-preset-form">
                <input
                  type="text"
                  value={newPresetName}
                  onChange={(e) => setNewPresetName(e.target.value)}
                  placeholder="Preset name..."
                  onKeyDown={(e) => { if (e.key === 'Enter') savePreset(); }}
                />
                <button className="btn-save-preset" onClick={savePreset}>Save</button>
                <button className="btn-cancel-preset" onClick={() => { setShowSavePreset(false); setNewPresetName(''); }}>Cancel</button>
              </div>
            )}
          </div>

          {activeFilterCount > 0 && (
            <button
              className="clear-filters-btn"
              onClick={() => {
                setMinStrength(0);
                setSectorFilter('');
                setLastContactFilter('');
                setEquityFilter('');
                setTagFilter('');
                setCompanyFilter('');
                setHasEmailFilter('');
                setHasPhoneFilter('');
              }}
            >
              Clear All ({activeFilterCount})
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
          {filteredContacts.map(contact => {
            const interactionMatches = search ? getInteractionMatches(contact.id, search.toLowerCase()) : [];
            return selectMode ? (
              <div
                key={contact.id}
                className={`contact-card selectable ${selectedIds.has(contact.id) ? 'selected' : ''}`}
                onClick={(e) => toggleSelection(contact.id, e)}
              >
                <input
                  type="checkbox"
                  className="contact-checkbox"
                  checked={selectedIds.has(contact.id)}
                  onChange={() => {}}
                />
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
                </div>
                <div className="contact-meta">
                  {contact.tags?.slice(0, 2).map(tag => (
                    <span key={tag} className="tag">{tag}</span>
                  ))}
                </div>
              </div>
            ) : (
              <div key={contact.id} className="contact-card-wrapper">
                <Link to={`/contacts/${contact.id}`} className="contact-card">
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
                    {interactionMatches.length > 0 && (
                      <div className="search-matches">
                        {interactionMatches.map((match, idx) => (
                          <div key={idx} className="search-match">
                            <span className="match-icon">📝</span> "{match}"
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="contact-meta">
                    {(() => {
                      const strength = getEffectiveStrength(contact);
                      return (
                        <div className={`strength-stars ${strength.decayed ? 'decayed' : ''}`} title={strength.decayed ? `Was ${strength.original}, now ${strength.current} (decay)` : ''}>
                          {'★'.repeat(strength.current)}
                          {'☆'.repeat(5 - strength.current)}
                          {strength.decayed && <span className="decay-indicator">↓</span>}
                        </div>
                      );
                    })()}
                    {contact.tags?.slice(0, 2).map(tag => (
                      <span key={tag} className="tag">{tag}</span>
                    ))}
                  </div>
                </Link>
                <button
                  className="contact-preview-btn"
                  onClick={(e) => { e.preventDefault(); setPreviewContact(contact); }}
                  title="Quick Preview"
                >
                  👁️
                </button>
              </div>
            );
          })}
        </div>
      )}

      {showBulkTagModal && (
        <BulkTagModal
          selectedCount={selectedIds.size}
          allTags={allTags}
          onClose={() => setShowBulkTagModal(false)}
          onApply={applyBulkTags}
        />
      )}

      {showImportModal && (
        <ImportContactsModal
          onClose={() => setShowImportModal(false)}
          onImportComplete={() => {
            setShowImportModal(false);
            loadData();
          }}
        />
      )}

      {showBulkFollowUpModal && (
        <div className="modal-overlay" onClick={() => setShowBulkFollowUpModal(false)}>
          <div className="modal bulk-followup-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Set Follow-up for {selectedIds.size} Contacts</h2>
              <button className="close-btn" onClick={() => setShowBulkFollowUpModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <p>Set a follow-up reminder date for all selected contacts.</p>
              <div className="form-group">
                <label>Follow-up Date</label>
                <input
                  type="date"
                  value={bulkFollowUpDate}
                  onChange={e => setBulkFollowUpDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
              <div className="quick-date-buttons">
                <button
                  className="btn-quick-date"
                  onClick={() => {
                    const d = new Date();
                    d.setDate(d.getDate() + 7);
                    setBulkFollowUpDate(d.toISOString().split('T')[0]);
                  }}
                >
                  +1 week
                </button>
                <button
                  className="btn-quick-date"
                  onClick={() => {
                    const d = new Date();
                    d.setDate(d.getDate() + 14);
                    setBulkFollowUpDate(d.toISOString().split('T')[0]);
                  }}
                >
                  +2 weeks
                </button>
                <button
                  className="btn-quick-date"
                  onClick={() => {
                    const d = new Date();
                    d.setMonth(d.getMonth() + 1);
                    setBulkFollowUpDate(d.toISOString().split('T')[0]);
                  }}
                >
                  +1 month
                </button>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn secondary" onClick={() => setShowBulkFollowUpModal(false)}>Cancel</button>
              <button
                className="btn primary"
                onClick={applyBulkFollowUp}
                disabled={!bulkFollowUpDate || bulkProcessing}
              >
                {bulkProcessing ? 'Setting...' : 'Set Follow-up'}
              </button>
            </div>
          </div>
        </div>
      )}

      {previewContact && (
        <ContactQuickPreview
          contact={previewContact}
          interactions={allInteractions}
          equityActions={allEquityActions}
          onClose={() => setPreviewContact(null)}
          onNavigate={() => {
            setPreviewContact(null);
            window.location.href = `/contacts/${previewContact.id}`;
          }}
        />
      )}
    </div>
  );
}

// Contact Quick Preview Modal
function ContactQuickPreview({
  contact,
  interactions,
  equityActions,
  onClose,
  onNavigate
}: {
  contact: Contact;
  interactions: Interaction[];
  equityActions: EquityAction[];
  onClose: () => void;
  onNavigate: () => void;
}) {
  const contactInteractions = interactions
    .filter(i => i.contactId === contact.id)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 3);

  const contactEquity = equityActions
    .filter(a => a.contactId === contact.id)
    .reduce((sum, a) => sum + a.points, 0);

  const equityStatus = getEquityStatus(contactEquity);
  const strength = getEffectiveStrength(contact);

  const daysSinceContact = contact.lastContactedAt
    ? Math.floor((Date.now() - new Date(contact.lastContactedAt).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal quick-preview-modal" onClick={e => e.stopPropagation()}>
        <div className="quick-preview-header">
          <div className="preview-avatar">
            {contact.firstName[0]}{contact.lastName?.[0] || ''}
          </div>
          <div className="preview-title">
            <h2>{contact.firstName} {contact.lastName || ''}</h2>
            {contact.company && (
              <p className="preview-subtitle">
                {contact.title ? `${contact.title} at ` : ''}{contact.company}
              </p>
            )}
          </div>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="quick-preview-body">
          {/* Quick Stats Row */}
          <div className="preview-stats-row">
            <div className="preview-stat">
              <span className="stat-label">Strength</span>
              <span className={`stat-value ${strength.decayed ? 'decayed' : ''}`}>
                {'★'.repeat(strength.current)}{'☆'.repeat(5 - strength.current)}
                {strength.decayed && <small> (was {strength.original})</small>}
              </span>
            </div>
            <div className="preview-stat">
              <span className="stat-label">Equity</span>
              <span className={`stat-value equity-${equityStatus.toLowerCase().replace('_', '-')}`}>
                {contactEquity > 0 ? '+' : ''}{contactEquity} pts
              </span>
            </div>
            <div className="preview-stat">
              <span className="stat-label">Last Contact</span>
              <span className="stat-value">
                {daysSinceContact !== null ? `${daysSinceContact}d ago` : 'Never'}
              </span>
            </div>
          </div>

          {/* Contact Info */}
          <div className="preview-section">
            <h4>Contact Info</h4>
            <div className="preview-contact-info">
              {contact.email && (
                <a href={`mailto:${contact.email}`} className="preview-info-item">
                  <span className="info-icon">✉️</span>
                  <span>{contact.email}</span>
                </a>
              )}
              {contact.phone && (
                <a href={`tel:${contact.phone}`} className="preview-info-item">
                  <span className="info-icon">📞</span>
                  <span>{contact.phone}</span>
                </a>
              )}
              {contact.location && (
                <div className="preview-info-item">
                  <span className="info-icon">📍</span>
                  <span>{contact.location}</span>
                </div>
              )}
              {contact.linkedinUrl && (
                <a href={contact.linkedinUrl} target="_blank" rel="noopener noreferrer" className="preview-info-item">
                  <span className="info-icon">💼</span>
                  <span>LinkedIn</span>
                </a>
              )}
            </div>
          </div>

          {/* Tags */}
          {contact.tags && contact.tags.length > 0 && (
            <div className="preview-section">
              <h4>Tags</h4>
              <div className="preview-tags">
                {contact.tags.map(tag => (
                  <span key={tag} className="tag">{tag}</span>
                ))}
              </div>
            </div>
          )}

          {/* Recent Interactions */}
          {contactInteractions.length > 0 && (
            <div className="preview-section">
              <h4>Recent Interactions</h4>
              <div className="preview-interactions">
                {contactInteractions.map(int => (
                  <div key={int.id} className="preview-interaction">
                    <span className="int-type">
                      {int.type === 'MEETING' ? '🤝' : int.type === 'CALL' ? '📞' : int.type === 'EMAIL' ? '✉️' : '💬'}
                    </span>
                    <span className={`int-sentiment-mini sentiment-${int.sentiment.toLowerCase()}`}>
                      {int.sentiment === 'POSITIVE' ? '😊' : int.sentiment === 'NEGATIVE' ? '😔' : '😐'}
                    </span>
                    <span className="int-date">
                      {new Date(int.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    <span className="int-notes">{int.notes?.substring(0, 50)}{int.notes && int.notes.length > 50 ? '...' : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {contact.notes && (
            <div className="preview-section">
              <h4>Notes</h4>
              <p className="preview-notes">{contact.notes.substring(0, 200)}{contact.notes.length > 200 ? '...' : ''}</p>
            </div>
          )}
        </div>

        <div className="quick-preview-footer">
          <button className="btn secondary" onClick={onClose}>Close</button>
          <button className="btn primary" onClick={onNavigate}>View Full Profile →</button>
        </div>
      </div>
    </div>
  );
}

// Import Contacts Modal
function ImportContactsModal({
  onClose,
  onImportComplete
}: {
  onClose: () => void;
  onImportComplete: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [parsedContacts, setParsedContacts] = useState<Partial<Contact>[]>([]);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importError, setImportError] = useState('');
  const [step, setStep] = useState<'source' | 'upload' | 'preview' | 'complete'>('source');
  const [importedCount, setImportedCount] = useState(0);
  const [importSource, setImportSource] = useState<'csv' | 'phone' | null>(null);

  // Check if Contact Picker API is available
  const contactPickerSupported = 'contacts' in navigator && 'ContactsManager' in window;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setImportError('');
      parseCSV(selectedFile);
    }
  };

  // Import from phone contacts using Contact Picker API
  const handlePhoneImport = async () => {
    setImportError('');

    try {
      const props = ['name', 'email', 'tel'];
      const opts = { multiple: true };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const selectedContacts = await (navigator as any).contacts.select(props, opts);

      if (selectedContacts && selectedContacts.length > 0) {
        const contactData: Partial<Contact>[] = selectedContacts.map((contact: {
          name?: string[];
          email?: string[];
          tel?: string[];
        }) => {
          const fullName = contact.name?.[0] || '';
          const nameParts = fullName.split(' ');
          const firstName = nameParts[0] || 'Unknown';
          const lastName = nameParts.slice(1).join(' ') || undefined;

          return {
            firstName,
            lastName,
            email: contact.email?.[0],
            phone: contact.tel?.[0],
          };
        }).filter((c: Partial<Contact>) => c.firstName);

        if (contactData.length > 0) {
          setParsedContacts(contactData);
          setStep('preview');
        } else {
          setImportError('No valid contacts selected');
        }
      }
    } catch (err) {
      if ((err as Error).name === 'InvalidStateError') {
        setImportError('Contact picker is not available on this device');
      } else if ((err as Error).name === 'SecurityError') {
        setImportError('Permission denied. Please allow access to contacts.');
      } else if ((err as Error).name === 'NotAllowedError') {
        setImportError('Contact selection was cancelled');
      } else {
        setImportError('Failed to access contacts. Try CSV import instead.');
      }
    }
  };

  const parseCSV = (csvFile: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split('\n').filter(line => line.trim());
        if (lines.length < 2) {
          setImportError('CSV file must have a header row and at least one data row');
          return;
        }

        // Parse header
        const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());

        // Map common header names
        const headerMap: Record<string, keyof Contact> = {
          'first name': 'firstName',
          'firstname': 'firstName',
          'first': 'firstName',
          'last name': 'lastName',
          'lastname': 'lastName',
          'last': 'lastName',
          'email': 'email',
          'e-mail': 'email',
          'phone': 'phone',
          'telephone': 'phone',
          'mobile': 'phone',
          'company': 'company',
          'organization': 'company',
          'title': 'title',
          'job title': 'title',
          'position': 'title',
          'location': 'location',
          'city': 'location',
          'linkedin': 'linkedinUrl',
          'linkedin url': 'linkedinUrl',
          'notes': 'notes',
          'tags': 'tags',
          'sectors': 'sectors',
        };

        // Parse data rows
        const contactData: Partial<Contact>[] = [];
        for (let i = 1; i < lines.length; i++) {
          const values = parseCSVLine(lines[i]);
          const contactObj: Partial<Contact> = {};

          headers.forEach((header, idx) => {
            const mappedField = headerMap[header];
            const value = values[idx]?.trim();
            if (mappedField && value) {
              if (mappedField === 'tags' || mappedField === 'sectors') {
                (contactObj as Record<string, string[]>)[mappedField] = value.split(';').map(t => t.trim()).filter(Boolean);
              } else {
                (contactObj as Record<string, string>)[mappedField] = value;
              }
            }
          });

          // Only add if we have at least a first name
          if (contactObj.firstName) {
            contactData.push(contactObj);
          }
        }

        if (contactData.length === 0) {
          setImportError('No valid contacts found. Make sure you have a "First Name" column.');
          return;
        }

        setParsedContacts(contactData);
        setStep('preview');
      } catch {
        setImportError('Failed to parse CSV file');
      }
    };
    reader.readAsText(csvFile);
  };

  // Helper to parse CSV line handling quoted values
  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const handleImport = async () => {
    setImporting(true);
    setImportProgress(0);

    let imported = 0;
    for (let i = 0; i < parsedContacts.length; i++) {
      const contactData = parsedContacts[i];
      const res = await contacts.create({
        firstName: contactData.firstName || 'Unknown',
        lastName: contactData.lastName,
        email: contactData.email,
        phone: contactData.phone,
        company: contactData.company,
        title: contactData.title,
        location: contactData.location,
        linkedinUrl: contactData.linkedinUrl,
        notes: contactData.notes,
        tags: contactData.tags || [],
        sectors: contactData.sectors || [],
        needs: [],
        offers: [],
        relationshipStrength: 3,
        isArchived: false,
      });

      if (res.success) {
        imported++;
      }
      setImportProgress(Math.round(((i + 1) / parsedContacts.length) * 100));
    }

    setImportedCount(imported);
    setImporting(false);
    setStep('complete');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal import-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Import Contacts</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        {step === 'source' && (
          <div className="modal-body">
            <p className="import-source-intro">Choose how you'd like to import contacts:</p>

            <div className="import-source-options">
              <button
                className="import-source-btn"
                onClick={() => { setImportSource('csv'); setStep('upload'); }}
              >
                <span className="source-icon">📄</span>
                <span className="source-title">CSV File</span>
                <span className="source-desc">Import from Google Contacts, Outlook, LinkedIn, or any CSV</span>
              </button>

              <button
                className={`import-source-btn ${!contactPickerSupported ? 'disabled' : ''}`}
                onClick={() => {
                  if (contactPickerSupported) {
                    setImportSource('phone');
                    handlePhoneImport();
                  }
                }}
                disabled={!contactPickerSupported}
              >
                <span className="source-icon">📱</span>
                <span className="source-title">Phone Contacts</span>
                <span className="source-desc">
                  {contactPickerSupported
                    ? 'Select contacts directly from your phone'
                    : 'Only available on mobile devices'}
                </span>
              </button>
            </div>

            {importError && <div className="import-error">{importError}</div>}
          </div>
        )}

        {step === 'upload' && (
          <div className="modal-body">
            <div className="import-instructions">
              <p>Upload a CSV file with your contacts. The file should have columns like:</p>
              <ul>
                <li><strong>First Name</strong> (required)</li>
                <li>Last Name, Email, Phone, Company, Title, Location</li>
                <li>LinkedIn URL, Notes, Tags (semicolon-separated)</li>
              </ul>
            </div>

            <div className="file-upload-area">
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                id="csv-file-input"
              />
              <label htmlFor="csv-file-input" className="file-upload-label">
                {file ? file.name : 'Choose CSV file or drag and drop'}
              </label>
            </div>

            {importError && <div className="import-error">{importError}</div>}

            <div className="import-tip">
              <strong>Tip:</strong> Export from Google Contacts, Outlook, or LinkedIn for best results.
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div className="modal-body">
            <div className="import-preview-header">
              <h3>Preview: {parsedContacts.length} contacts found</h3>
            </div>

            <div className="import-preview-list">
              {parsedContacts.slice(0, 10).map((contact, idx) => (
                <div key={idx} className="preview-contact">
                  <span className="preview-name">
                    {contact.firstName} {contact.lastName || ''}
                  </span>
                  {contact.email && <span className="preview-email">{contact.email}</span>}
                  {contact.company && <span className="preview-company">{contact.company}</span>}
                </div>
              ))}
              {parsedContacts.length > 10 && (
                <div className="preview-more">...and {parsedContacts.length - 10} more</div>
              )}
            </div>

            {importing && (
              <div className="import-progress">
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${importProgress}%` }} />
                </div>
                <span className="progress-text">{importProgress}% complete</span>
              </div>
            )}
          </div>
        )}

        {step === 'complete' && (
          <div className="modal-body">
            <div className="import-success">
              <div className="success-icon">✓</div>
              <h3>Import Complete!</h3>
              <p>Successfully imported {importedCount} contact{importedCount !== 1 ? 's' : ''}.</p>
            </div>
          </div>
        )}

        <div className="modal-footer">
          {step === 'source' && (
            <button className="btn secondary" onClick={onClose}>Cancel</button>
          )}
          {step === 'upload' && (
            <>
              <button className="btn secondary" onClick={() => { setStep('source'); setFile(null); setImportError(''); }}>
                Back
              </button>
            </>
          )}
          {step === 'preview' && (
            <>
              <button
                className="btn secondary"
                onClick={() => {
                  if (importSource === 'phone') {
                    setStep('source');
                  } else {
                    setStep('upload');
                  }
                  setFile(null);
                  setParsedContacts([]);
                }}
              >
                Back
              </button>
              <button className="btn primary" onClick={handleImport} disabled={importing}>
                {importing ? 'Importing...' : `Import ${parsedContacts.length} Contacts`}
              </button>
            </>
          )}
          {step === 'complete' && (
            <button className="btn primary" onClick={onImportComplete}>Done</button>
          )}
        </div>
      </div>
    </div>
  );
}

// Bulk Tag Modal
function BulkTagModal({
  selectedCount,
  allTags,
  onClose,
  onApply
}: {
  selectedCount: number;
  allTags: string[];
  onClose: () => void;
  onApply: (tagsToAdd: string[], tagsToRemove: string[]) => void;
}) {
  const [tagsToAdd, setTagsToAdd] = useState<string[]>([]);
  const [tagsToRemove, setTagsToRemove] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [applying, setApplying] = useState(false);

  const handleAddTag = (tag: string) => {
    if (tag && !tagsToAdd.includes(tag)) {
      setTagsToAdd([...tagsToAdd, tag]);
      setTagsToRemove(tagsToRemove.filter(t => t !== tag));
    }
  };

  const handleRemoveTag = (tag: string) => {
    if (tag && !tagsToRemove.includes(tag)) {
      setTagsToRemove([...tagsToRemove, tag]);
      setTagsToAdd(tagsToAdd.filter(t => t !== tag));
    }
  };

  const handleApply = async () => {
    setApplying(true);
    await onApply(tagsToAdd, tagsToRemove);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal bulk-tag-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Manage Tags for {selectedCount} Contacts</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="bulk-tag-section">
            <h3>Add Tags</h3>
            <p className="section-hint">These tags will be added to all selected contacts</p>
            <div className="tag-input-row">
              <input
                type="text"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                placeholder="Type new tag..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newTag.trim()) {
                    handleAddTag(newTag.trim());
                    setNewTag('');
                  }
                }}
              />
              <button
                className="btn secondary"
                onClick={() => {
                  if (newTag.trim()) {
                    handleAddTag(newTag.trim());
                    setNewTag('');
                  }
                }}
              >
                Add
              </button>
            </div>
            {allTags.length > 0 && (
              <div className="existing-tags">
                <span className="tags-label">Existing tags:</span>
                {allTags.filter(t => !tagsToAdd.includes(t) && !tagsToRemove.includes(t)).map(tag => (
                  <button
                    key={tag}
                    className="tag-suggestion"
                    onClick={() => handleAddTag(tag)}
                  >
                    + {tag}
                  </button>
                ))}
              </div>
            )}
            {tagsToAdd.length > 0 && (
              <div className="selected-tags add-tags">
                {tagsToAdd.map(tag => (
                  <span key={tag} className="tag add-tag">
                    + {tag}
                    <button onClick={() => setTagsToAdd(tagsToAdd.filter(t => t !== tag))}>×</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="bulk-tag-section">
            <h3>Remove Tags</h3>
            <p className="section-hint">These tags will be removed from all selected contacts</p>
            {allTags.length > 0 && (
              <div className="existing-tags">
                {allTags.filter(t => !tagsToAdd.includes(t) && !tagsToRemove.includes(t)).map(tag => (
                  <button
                    key={tag}
                    className="tag-suggestion remove"
                    onClick={() => handleRemoveTag(tag)}
                  >
                    - {tag}
                  </button>
                ))}
              </div>
            )}
            {tagsToRemove.length > 0 && (
              <div className="selected-tags remove-tags">
                {tagsToRemove.map(tag => (
                  <span key={tag} className="tag remove-tag">
                    - {tag}
                    <button onClick={() => setTagsToRemove(tagsToRemove.filter(t => t !== tag))}>×</button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn primary"
            onClick={handleApply}
            disabled={applying || (tagsToAdd.length === 0 && tagsToRemove.length === 0)}
          >
            {applying ? 'Applying...' : `Apply to ${selectedCount} Contacts`}
          </button>
        </div>
      </div>
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
  const [showReminderEdit, setShowReminderEdit] = useState(false);
  const [reminderDate, setReminderDate] = useState('');
  const [reminderTime, setReminderTime] = useState('09:00');
  const [reminderSaving, setReminderSaving] = useState(false);
  const [showEquityModal, setShowEquityModal] = useState(false);
  const [equityActions, setEquityActions] = useState<EquityAction[]>([]);
  const [showIntroModal, setShowIntroModal] = useState(false);
  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  const [timelineView, setTimelineView] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareFormat, setShareFormat] = useState<'brief' | 'detailed'>('brief');
  const [shareCopied, setShareCopied] = useState(false);

  // Load equity actions from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('obani_equity_actions');
    if (stored) {
      setEquityActions(JSON.parse(stored));
    }
  }, []);

  const getContactEquity = (contactId: string): { score: number; actions: EquityAction[] } => {
    const contactActions = equityActions.filter(a => a.contactId === contactId);
    const score = contactActions.reduce((sum, a) => sum + a.points, 0);
    return { score, actions: contactActions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) };
  };

  const logEquityAction = (action: Omit<EquityAction, 'id' | 'createdAt'>) => {
    const newAction: EquityAction = {
      ...action,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    const newActions = [...equityActions, newAction];
    setEquityActions(newActions);
    localStorage.setItem('obani_equity_actions', JSON.stringify(newActions));
  };

  useEffect(() => {
    if (id) loadContact(id);
    loadAllContacts();
  }, [id]);

  const loadAllContacts = async () => {
    const res = await contacts.getAll();
    if (res.success && res.data) {
      setAllContacts(res.data);
    }
  };

  // Local storage helpers for reminders (fallback when API fails)
  const getLocalReminders = (): Record<string, string> => {
    const stored = localStorage.getItem('obani_reminders');
    return stored ? JSON.parse(stored) : {};
  };

  const saveLocalReminder = (contactId: string, dateTime: string) => {
    const reminders = getLocalReminders();
    reminders[contactId] = dateTime;
    localStorage.setItem('obani_reminders', JSON.stringify(reminders));
  };

  const clearLocalReminder = (contactId: string) => {
    const reminders = getLocalReminders();
    delete reminders[contactId];
    localStorage.setItem('obani_reminders', JSON.stringify(reminders));
  };

  const loadContact = async (contactId: string) => {
    setLoading(true);
    const [contactRes, intRes] = await Promise.all([
      contacts.get(contactId),
      interactions.getByContact(contactId)
    ]);
    if (contactRes.success && contactRes.data) {
      // Check for local reminder if API doesn't have one
      const localReminders = getLocalReminders();
      const localReminder = localReminders[contactId];
      if (localReminder && !contactRes.data.nextFollowUpAt) {
        contactRes.data.nextFollowUpAt = localReminder;
      }
      setContact(contactRes.data);
      // Track recently viewed
      trackRecentlyViewed(contactId);
    }
    if (intRes.success && intRes.data) {
      setContactInteractions(intRes.data.items || []);
    }
    setLoading(false);
  };

  const saveReminder = async () => {
    if (!contact || !id || !reminderDate) return;
    setReminderSaving(true);

    // Combine date and time into ISO string
    const dateTimeString = `${reminderDate}T${reminderTime}:00`;

    try {
      const res = await contacts.update(id, {
        nextFollowUpAt: dateTimeString
      });

      if (res.success && res.data) {
        setContact(res.data);
        setShowReminderEdit(false);
        clearLocalReminder(id); // Clear local if API succeeds
      } else {
        // API failed - save locally as fallback
        saveLocalReminder(id, dateTimeString);
        setContact({ ...contact, nextFollowUpAt: dateTimeString });
        setShowReminderEdit(false);
      }
    } catch {
      // Network error - save locally as fallback
      saveLocalReminder(id, dateTimeString);
      setContact({ ...contact, nextFollowUpAt: dateTimeString });
      setShowReminderEdit(false);
    }

    setReminderSaving(false);
  };

  const clearReminder = async () => {
    if (!contact || !id) return;
    setReminderSaving(true);

    try {
      const res = await contacts.update(id, {
        nextFollowUpAt: undefined
      });

      if (res.success && res.data) {
        setContact(res.data);
      } else {
        // API failed - clear locally
        clearLocalReminder(id);
        setContact({ ...contact, nextFollowUpAt: undefined });
      }
    } catch {
      // Network error - clear locally
      clearLocalReminder(id);
      setContact({ ...contact, nextFollowUpAt: undefined });
    }

    setReminderDate('');
    setReminderSaving(false);
  };

  const generateShareProfile = (): string => {
    if (!contact) return '';

    const name = `${contact.firstName} ${contact.lastName || ''}`.trim();

    if (shareFormat === 'brief') {
      // Brief format - one-liner for quick shares
      let brief = name;
      if (contact.title && contact.company) {
        brief += ` - ${contact.title} at ${contact.company}`;
      } else if (contact.company) {
        brief += ` at ${contact.company}`;
      } else if (contact.title) {
        brief += ` - ${contact.title}`;
      }
      if (contact.location) {
        brief += ` (${contact.location})`;
      }
      if (contact.sectors && contact.sectors.length > 0) {
        brief += `\nFocus: ${contact.sectors.join(', ')}`;
      }
      if (contact.email) {
        brief += `\n📧 ${contact.email}`;
      }
      if (contact.linkedinUrl) {
        brief += `\n🔗 ${contact.linkedinUrl}`;
      }
      return brief;
    } else {
      // Detailed format - comprehensive profile
      let detailed = `📋 ${name}\n`;
      detailed += '─'.repeat(30) + '\n\n';

      if (contact.title || contact.company) {
        detailed += `💼 ${contact.title || 'Professional'}${contact.company ? ` at ${contact.company}` : ''}\n`;
      }
      if (contact.location) {
        detailed += `📍 ${contact.location}\n`;
      }
      detailed += '\n';

      if (contact.email) {
        detailed += `📧 Email: ${contact.email}\n`;
      }
      if (contact.phone) {
        detailed += `📞 Phone: ${contact.phone}\n`;
      }
      if (contact.linkedinUrl) {
        detailed += `🔗 LinkedIn: ${contact.linkedinUrl}\n`;
      }
      if (contact.twitterUrl) {
        detailed += `🐦 Twitter: ${contact.twitterUrl}\n`;
      }
      if (contact.websiteUrl) {
        detailed += `🌐 Website: ${contact.websiteUrl}\n`;
      }

      if (contact.sectors && contact.sectors.length > 0) {
        detailed += `\n🎯 Sectors: ${contact.sectors.join(', ')}\n`;
      }

      if (contact.offers && contact.offers.length > 0) {
        detailed += `\n✨ Expertise/Offers:\n${contact.offers.map(o => `  • ${o}`).join('\n')}\n`;
      }

      if (contact.needs && contact.needs.length > 0) {
        detailed += `\n🔍 Looking for:\n${contact.needs.map(n => `  • ${n}`).join('\n')}\n`;
      }

      if (contact.howWeMet) {
        detailed += `\n📝 Context: ${contact.howWeMet}\n`;
      }

      return detailed.trim();
    }
  };

  const copyShareProfile = () => {
    const profile = generateShareProfile();
    navigator.clipboard.writeText(profile);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  };

  const exportToPDF = () => {
    if (!contact) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    let y = 20;

    // Helper to add text with word wrap
    const addText = (text: string, x: number, yPos: number, maxWidth: number, fontSize = 10) => {
      doc.setFontSize(fontSize);
      const lines = doc.splitTextToSize(text, maxWidth);
      doc.text(lines, x, yPos);
      return yPos + (lines.length * fontSize * 0.4);
    };

    // Title
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text(`${contact.firstName} ${contact.lastName || ''}`, 20, y);
    y += 10;

    // Subtitle
    if (contact.title && contact.company) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.text(`${contact.title} at ${contact.company}`, 20, y);
      y += 8;
    } else if (contact.company) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.text(contact.company, 20, y);
      y += 8;
    }

    // Relationship Strength
    const strength = getEffectiveStrength(contact);
    doc.setFontSize(10);
    doc.text(`Relationship Strength: ${'★'.repeat(strength.current)}${'☆'.repeat(5 - strength.current)}`, 20, y);
    y += 12;

    // Divider
    doc.setDrawColor(200);
    doc.line(20, y, pageWidth - 20, y);
    y += 10;

    // Contact Information Section
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Contact Information', 20, y);
    y += 8;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    if (contact.email) { doc.text(`Email: ${contact.email}`, 20, y); y += 6; }
    if (contact.phone) { doc.text(`Phone: ${contact.phone}`, 20, y); y += 6; }
    if (contact.location) { doc.text(`Location: ${contact.location}`, 20, y); y += 6; }
    if (contact.linkedinUrl) { doc.text(`LinkedIn: ${contact.linkedinUrl}`, 20, y); y += 6; }
    y += 6;

    // Tags & Sectors
    if (contact.tags?.length || contact.sectors?.length) {
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Tags & Sectors', 20, y);
      y += 8;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      if (contact.tags?.length) { doc.text(`Tags: ${contact.tags.join(', ')}`, 20, y); y += 6; }
      if (contact.sectors?.length) { doc.text(`Sectors: ${contact.sectors.join(', ')}`, 20, y); y += 6; }
      y += 6;
    }

    // Needs & Offers
    if (contact.needs?.length || contact.offers?.length) {
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Value Exchange', 20, y);
      y += 8;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      if (contact.needs?.length) { y = addText(`Their Needs: ${contact.needs.join(', ')}`, 20, y, pageWidth - 40); y += 4; }
      if (contact.offers?.length) { y = addText(`They Offer: ${contact.offers.join(', ')}`, 20, y, pageWidth - 40); y += 4; }
      y += 6;
    }

    // How We Met
    if (contact.howWeMet) {
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('How We Met', 20, y);
      y += 8;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      y = addText(contact.howWeMet, 20, y, pageWidth - 40);
      y += 10;
    }

    // Notes
    if (contact.notes) {
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Notes', 20, y);
      y += 8;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      y = addText(contact.notes, 20, y, pageWidth - 40);
      y += 10;
    }

    // Recent Interactions
    if (contactInteractions.length > 0) {
      // Check if we need a new page
      if (y > 240) {
        doc.addPage();
        y = 20;
      }

      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Recent Interactions', 20, y);
      y += 10;

      contactInteractions.slice(0, 5).forEach(int => {
        if (y > 270) {
          doc.addPage();
          y = 20;
        }

        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        const dateStr = new Date(int.date).toLocaleDateString();
        doc.text(`${int.type} - ${dateStr}`, 20, y);
        y += 6;

        if (int.notes) {
          doc.setFont('helvetica', 'normal');
          y = addText(int.notes, 20, y, pageWidth - 40, 9);
          y += 4;
        }
        y += 4;
      });
    }

    // Footer
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.text(`Generated from Obani on ${new Date().toLocaleDateString()}`, 20, 285);

    // Save the PDF
    doc.save(`${contact.firstName}_${contact.lastName || 'Contact'}_Profile.pdf`);
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

  const getDaysSince = (dateStr?: string): number | null => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    const now = new Date();
    return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  };

  const getLastTopic = (): string | null => {
    if (contactInteractions.length === 0) return null;
    const lastInt = contactInteractions[0];
    if (lastInt.keyTopics && lastInt.keyTopics.length > 0) {
      return lastInt.keyTopics.join(', ');
    }
    return null;
  };

  const getPendingActions = () => {
    const pending: { text: string; owner: string; contactName: string }[] = [];
    contactInteractions.forEach(int => {
      if (int.actionItems) {
        int.actionItems.forEach(action => {
          if (!action.completed) {
            pending.push({ text: action.text, owner: action.owner, contactName: contact?.firstName || '' });
          }
        });
      }
    });
    return pending;
  };

  const getLastInsight = (): string | null => {
    if (contactInteractions.length === 0) return null;
    const lastInt = contactInteractions[0];
    if (lastInt.notes) {
      return lastInt.notes.length > 100 ? lastInt.notes.substring(0, 100) + '...' : lastInt.notes;
    }
    return null;
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
          <button className="btn pdf-export" onClick={exportToPDF}>📄 Export PDF</button>
          <Link to={`/contacts/${contact.id}/edit`} className="btn secondary">Edit</Link>
          <button className="btn-text-subtle delete-link" onClick={handleDelete}>Delete</button>
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
        {(() => {
          const strength = getEffectiveStrength(contact);
          return (
            <div className="strength-display">
              <span className="strength-label">Relationship Strength</span>
              <div className={`strength-stars large ${strength.decayed ? 'decayed' : ''}`}>
                {'★'.repeat(strength.current)}
                {'☆'.repeat(5 - strength.current)}
                {strength.decayed && <span className="decay-indicator">↓</span>}
              </div>
              {strength.decayed && (
                <div className="decay-warning">
                  <span className="decay-text">
                    Was {strength.original}★ — reach out to restore!
                  </span>
                </div>
              )}
            </div>
          );
        })()}
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
        <button className="action-btn intro" onClick={() => setShowIntroModal(true)}>
          <span className="action-icon">🔗</span>
          <span>Intro</span>
        </button>
        <button className="action-btn share" onClick={() => setShowShareModal(true)}>
          <span className="action-icon">📤</span>
          <span>Share</span>
        </button>
      </div>

      <div className="reminder-card">
        <div className="reminder-header">
          <span className="reminder-icon">🔔</span>
          <h3>Follow-up Reminder</h3>
        </div>
        {contact.nextFollowUpAt && !showReminderEdit ? (
          <div className="reminder-set">
            <div className={`reminder-date ${new Date(contact.nextFollowUpAt) < new Date() ? 'overdue' : ''}`}>
              {new Date(contact.nextFollowUpAt) < new Date() ? '⚠️ Overdue: ' : '📅 '}
              {new Date(contact.nextFollowUpAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
              {' at '}
              {new Date(contact.nextFollowUpAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </div>
            <div className="reminder-actions">
              <button className="btn-reminder-edit" onClick={() => {
                setReminderDate(contact.nextFollowUpAt?.split('T')[0] || '');
                const timeStr = contact.nextFollowUpAt ? new Date(contact.nextFollowUpAt).toTimeString().slice(0, 5) : '09:00';
                setReminderTime(timeStr);
                setShowReminderEdit(true);
              }}>Change</button>
              <button className="btn-reminder-clear" onClick={clearReminder}>Clear</button>
            </div>
          </div>
        ) : showReminderEdit ? (
          <div className="reminder-edit">
            <div className="reminder-inputs">
              <input
                type="date"
                value={reminderDate}
                onChange={(e) => setReminderDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
              />
              <input
                type="time"
                value={reminderTime}
                onChange={(e) => setReminderTime(e.target.value)}
              />
            </div>
            <div className="reminder-edit-actions">
              <button className="btn-reminder-save" onClick={saveReminder} disabled={!reminderDate || reminderSaving}>
                {reminderSaving ? 'Saving...' : 'Save'}
              </button>
              <button className="btn-reminder-cancel" onClick={() => setShowReminderEdit(false)} disabled={reminderSaving}>Cancel</button>
            </div>
          </div>
        ) : (
          <button className="btn-set-reminder" onClick={() => setShowReminderEdit(true)}>
            + Set Reminder
          </button>
        )}
      </div>

      <div className="quick-context-card">
        <div className="context-header">
          <span className="context-icon">📋</span>
          <h3>Quick Context</h3>
        </div>
        <div className="context-grid">
          <div className="context-item">
            <span className="context-label">Last Spoke</span>
            <span className="context-value">
              {contact.lastContactedAt
                ? `${getDaysSince(contact.lastContactedAt)} days ago`
                : 'Never'}
            </span>
          </div>
          {getLastTopic() && (
            <div className="context-item">
              <span className="context-label">Last Topic</span>
              <span className="context-value">{getLastTopic()}</span>
            </div>
          )}
        </div>

        {getPendingActions().length > 0 && (
          <div className="context-section">
            <span className="context-section-label">⚡ Pending Actions</span>
            <ul className="pending-actions-list">
              {getPendingActions().slice(0, 3).map((action, idx) => (
                <li key={idx}>
                  <span className="action-owner-icon">
                    {action.owner === 'me' ? '👤 You:' : action.owner === 'them' ? `👥 ${contact.firstName}:` : '🤝 Both:'}
                  </span>
                  {action.text}
                </li>
              ))}
            </ul>
          </div>
        )}

        {contact.needs && contact.needs.length > 0 && (
          <div className="context-section">
            <span className="context-section-label">🎯 Their Current Needs</span>
            <div className="context-tags">
              {contact.needs.map((need, idx) => (
                <span key={idx} className="tag need">{need}</span>
              ))}
            </div>
          </div>
        )}

        {getLastInsight() && (
          <div className="context-section">
            <span className="context-section-label">💡 Last Insight</span>
            <p className="last-insight">"{getLastInsight()}"</p>
          </div>
        )}
      </div>

      {/* Relationship Equity Card */}
      {(() => {
        const equity = getContactEquity(contact.id);
        const status = getEquityStatus(equity.score);
        const statusColors: Record<string, { bg: string; text: string; emoji: string }> = {
          SUPER_GIVER: { bg: '#DCFCE7', text: '#166534', emoji: '💚' },
          HEALTHY: { bg: '#D1FAE5', text: '#047857', emoji: '💚' },
          BALANCED: { bg: '#FEF3C7', text: '#92400E', emoji: '💛' },
          OVERDRAWN: { bg: '#FEE2E2', text: '#991B1B', emoji: '❤️' },
          TOXIC: { bg: '#FEE2E2', text: '#7F1D1D', emoji: '💔' },
        };
        const statusLabels: Record<string, string> = {
          SUPER_GIVER: "Super Giver - You've been very generous!",
          HEALTHY: "Healthy - Strong positive balance",
          BALANCED: "Balanced - Equal exchange",
          OVERDRAWN: "Overdrawn - Give value before asking",
          TOXIC: "At Risk - Consider rebuilding trust",
        };
        const colors = statusColors[status];

        return (
          <div className="equity-card" style={{ backgroundColor: colors.bg }}>
            <div className="equity-header">
              <span className="equity-icon">{colors.emoji}</span>
              <h3>Relationship Equity</h3>
              <span className="equity-score" style={{ color: colors.text }}>
                {equity.score >= 0 ? '+' : ''}{equity.score}
              </span>
            </div>
            <div className="equity-status" style={{ color: colors.text }}>
              {statusLabels[status]}
            </div>
            {equity.score >= 3 && (
              <div className="equity-safe-badge">✅ Safe to ask for favor</div>
            )}
            {equity.score < 0 && (
              <div className="equity-warning-badge">⚠️ Consider giving value first</div>
            )}

            {equity.actions.length > 0 && (
              <div className="equity-recent">
                <span className="equity-section-label">Recent Exchanges</span>
                <div className="equity-actions-list">
                  {equity.actions.slice(0, 4).map(action => (
                    <div key={action.id} className={`equity-action-item ${action.points >= 0 ? 'gave' : 'asked'}`}>
                      <span className="action-emoji">{action.points >= 0 ? '✅' : '❌'}</span>
                      <span className="action-desc">
                        {action.type.replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase())}
                      </span>
                      <span className="action-points" style={{ color: action.points >= 0 ? '#059669' : '#DC2626' }}>
                        {action.points >= 0 ? '+' : ''}{action.points}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button className="btn-log-equity" onClick={() => setShowEquityModal(true)}>
              + Log Exchange
            </button>
          </div>
        );
      })()}

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

        <section className="detail-section interactions-section">
          <div className="section-header">
            <h2>Relationship Timeline</h2>
            <div className="section-actions">
              <div className="view-toggle">
                <button
                  className={`toggle-btn ${!timelineView ? 'active' : ''}`}
                  onClick={() => setTimelineView(false)}
                  title="List view"
                >
                  List
                </button>
                <button
                  className={`toggle-btn ${timelineView ? 'active' : ''}`}
                  onClick={() => setTimelineView(true)}
                  title="Timeline view"
                >
                  Timeline
                </button>
              </div>
              <button className="link" onClick={() => setShowLogModal(true)}>+ Add</button>
            </div>
          </div>
          {contactInteractions.length === 0 ? (
            <div className="empty-interactions">
              <p>No interactions logged yet</p>
              <button className="btn secondary" onClick={() => setShowLogModal(true)}>
                Log your first interaction
              </button>
            </div>
          ) : timelineView ? (
            <div className="timeline-view">
              {(() => {
                // Group interactions by month
                const grouped: Record<string, Interaction[]> = {};
                contactInteractions.forEach(int => {
                  const monthKey = new Date(int.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
                  if (!grouped[monthKey]) grouped[monthKey] = [];
                  grouped[monthKey].push(int);
                });
                return Object.entries(grouped).map(([month, ints]) => (
                  <div key={month} className="timeline-month">
                    <div className="timeline-month-label">{month}</div>
                    <div className="timeline-events">
                      {ints.map(int => {
                        const typeIcons: Record<string, string> = {
                          MEETING: '🤝',
                          CALL: '📞',
                          EMAIL: '✉️',
                          MESSAGE: '💬',
                          SOCIAL: '📱',
                          EVENT: '🎉',
                          OTHER: '📋',
                        };
                        const sentimentColors: Record<string, string> = {
                          POSITIVE: '#10B981',
                          NEUTRAL: '#6B7280',
                          NEGATIVE: '#EF4444',
                        };
                        return (
                          <div key={int.id} className="timeline-event">
                            <div className="timeline-connector">
                              <div
                                className="timeline-dot"
                                style={{ borderColor: sentimentColors[int.sentiment] }}
                              >
                                {typeIcons[int.type] || '📋'}
                              </div>
                              <div className="timeline-line" />
                            </div>
                            <div className="timeline-content">
                              <div className="timeline-header">
                                <span className="timeline-type">{int.type}</span>
                                <span className="timeline-date">
                                  {new Date(int.date).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })}
                                </span>
                              </div>
                              {int.notes && <p className="timeline-notes">{int.notes}</p>}
                              {int.keyTopics && int.keyTopics.length > 0 && (
                                <div className="timeline-topics">
                                  {int.keyTopics.map((topic, idx) => (
                                    <span key={idx} className="topic-tag">{topic}</span>
                                  ))}
                                </div>
                              )}
                              {int.actionItems && int.actionItems.length > 0 && (
                                <div className="timeline-actions">
                                  {int.actionItems.map(action => (
                                    <div key={action.id} className={`timeline-action ${action.completed ? 'completed' : ''}`}>
                                      {action.completed ? '✓' : '○'} {action.text}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ));
              })()}
            </div>
          ) : (
            <div className="interactions-list">
              {contactInteractions.slice(0, 5).map(int => (
                <div key={int.id} className="interaction-item">
                  <div className="int-header">
                    <span className="int-type">{int.type}</span>
                    <span className={`int-sentiment sentiment-${int.sentiment.toLowerCase()}`}>
                      {int.sentiment === 'POSITIVE' ? '😊' : int.sentiment === 'NEGATIVE' ? '😔' : '😐'}
                    </span>
                    <span className="int-date">{formatDate(int.date)}</span>
                  </div>
                  {int.notes && <p className="int-notes">{int.notes}</p>}
                  {int.keyTopics && int.keyTopics.length > 0 && (
                    <div className="int-topics">
                      {int.keyTopics.map((topic, idx) => (
                        <span key={idx} className="topic-chip">{topic}</span>
                      ))}
                    </div>
                  )}
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
              {contactInteractions.length > 5 && (
                <button className="btn-show-more" onClick={() => setTimelineView(true)}>
                  Show all {contactInteractions.length} interactions
                </button>
              )}
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

      {showEquityModal && (
        <EquityLogModal
          contactId={contact.id}
          contactName={`${contact.firstName} ${contact.lastName || ''}`}
          currentEquity={getContactEquity(contact.id).score}
          onClose={() => setShowEquityModal(false)}
          onLog={(action) => {
            logEquityAction(action);
            setShowEquityModal(false);
          }}
        />
      )}

      {showIntroModal && (
        <IntroEmailModal
          sourceContact={contact}
          allContacts={allContacts.filter(c => c.id !== contact.id)}
          onClose={() => setShowIntroModal(false)}
          onIntroMade={() => {
            logEquityAction({
              contactId: contact.id,
              type: 'INTRO_MADE',
              points: 3,
              date: new Date().toISOString(),
            });
            setShowIntroModal(false);
          }}
        />
      )}

      {/* Share Contact Profile Modal */}
      {showShareModal && (
        <div className="modal-overlay" onClick={() => setShowShareModal(false)}>
          <div className="modal-content share-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Share Contact Profile</h2>
              <button className="btn-close" onClick={() => setShowShareModal(false)}>×</button>
            </div>

            <div className="share-modal-content">
              <div className="share-format-toggle">
                <button
                  className={`format-btn ${shareFormat === 'brief' ? 'active' : ''}`}
                  onClick={() => setShareFormat('brief')}
                >
                  Brief
                </button>
                <button
                  className={`format-btn ${shareFormat === 'detailed' ? 'active' : ''}`}
                  onClick={() => setShareFormat('detailed')}
                >
                  Detailed
                </button>
              </div>

              <div className="share-preview">
                <pre className="share-text">{generateShareProfile()}</pre>
              </div>

              <div className="share-actions">
                <button
                  className={`btn primary ${shareCopied ? 'copied' : ''}`}
                  onClick={copyShareProfile}
                >
                  {shareCopied ? '✓ Copied!' : '📋 Copy to Clipboard'}
                </button>
                {contact.email && (
                  <a
                    href={`mailto:?subject=${encodeURIComponent(`Contact: ${contact.firstName} ${contact.lastName || ''}`)}&body=${encodeURIComponent(generateShareProfile())}`}
                    className="btn secondary"
                  >
                    ✉️ Share via Email
                  </a>
                )}
              </div>

              <p className="share-hint">
                Use this to quickly share {contact.firstName}'s profile with others
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Intro Email Modal
function IntroEmailModal({
  sourceContact,
  allContacts,
  onClose,
  onIntroMade,
}: {
  sourceContact: Contact;
  allContacts: Contact[];
  onClose: () => void;
  onIntroMade: () => void;
}) {
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [search, setSearch] = useState('');
  const [context, setContext] = useState('');
  const [emailGenerated, setEmailGenerated] = useState(false);

  const filteredContacts = allContacts.filter(c =>
    !search ||
    c.firstName.toLowerCase().includes(search.toLowerCase()) ||
    c.lastName?.toLowerCase().includes(search.toLowerCase()) ||
    c.company?.toLowerCase().includes(search.toLowerCase())
  );

  // Find overlapping interests/sectors
  const getMatchReasons = (target: Contact): string[] => {
    const reasons: string[] = [];
    const sourceSectors = sourceContact.sectors || [];
    const targetSectors = target.sectors || [];
    const overlappingSectors = sourceSectors.filter(s => targetSectors.includes(s));
    if (overlappingSectors.length > 0) {
      reasons.push(`Both in ${overlappingSectors.join(', ')}`);
    }

    // Check if source's offers match target's needs
    const sourceOffers = sourceContact.offers || [];
    const targetNeeds = target.needs || [];
    const matchingOffers = sourceOffers.filter(o =>
      targetNeeds.some(n => n.toLowerCase().includes(o.toLowerCase()) || o.toLowerCase().includes(n.toLowerCase()))
    );
    if (matchingOffers.length > 0) {
      reasons.push(`${sourceContact.firstName} offers: ${matchingOffers.join(', ')}`);
    }

    // Check if target's offers match source's needs
    const sourceNeeds = sourceContact.needs || [];
    const targetOffers = target.offers || [];
    const matchingNeeds = targetOffers.filter(o =>
      sourceNeeds.some(n => n.toLowerCase().includes(o.toLowerCase()) || o.toLowerCase().includes(n.toLowerCase()))
    );
    if (matchingNeeds.length > 0) {
      reasons.push(`${target.firstName} offers: ${matchingNeeds.join(', ')}`);
    }

    return reasons;
  };

  const generateEmailSubject = (): string => {
    if (!selectedContact) return '';
    return `Intro: ${sourceContact.firstName} <> ${selectedContact.firstName}`;
  };

  const generateEmailBody = (): string => {
    if (!selectedContact) return '';

    const sourceName = `${sourceContact.firstName} ${sourceContact.lastName || ''}`.trim();
    const targetName = `${selectedContact.firstName} ${selectedContact.lastName || ''}`.trim();

    const matchReasons = getMatchReasons(selectedContact);
    const reasonsText = matchReasons.length > 0
      ? `\n\nWhy I thought you should meet:\n${matchReasons.map(r => `• ${r}`).join('\n')}`
      : '';

    const contextText = context ? `\n\n${context}` : '';

    return `Hi ${sourceContact.firstName} and ${selectedContact.firstName},

I wanted to connect the two of you as I think you'd benefit from knowing each other.

${sourceName}${sourceContact.title ? ` is ${sourceContact.title}` : ''}${sourceContact.company ? ` at ${sourceContact.company}` : ''}.

${targetName}${selectedContact.title ? ` is ${selectedContact.title}` : ''}${selectedContact.company ? ` at ${selectedContact.company}` : ''}.${reasonsText}${contextText}

I'll leave you both to take it from here!

Best,
[Your name]`;
  };

  const openMailClient = () => {
    if (!selectedContact) return;
    const subject = encodeURIComponent(generateEmailSubject());
    const body = encodeURIComponent(generateEmailBody());
    const to = [sourceContact.email, selectedContact.email].filter(Boolean).join(',');
    window.open(`mailto:${to}?subject=${subject}&body=${body}`, '_blank');
    setEmailGenerated(true);
  };

  const copyToClipboard = () => {
    if (!selectedContact) return;
    const text = `Subject: ${generateEmailSubject()}\n\n${generateEmailBody()}`;
    navigator.clipboard.writeText(text);
    setEmailGenerated(true);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content intro-email-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Make an Introduction</h2>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>

        <div className="intro-modal-content">
          <div className="intro-source">
            <span className="intro-label">Introducing</span>
            <div className="intro-contact-card">
              <div className="contact-avatar small">{sourceContact.firstName[0]}{sourceContact.lastName?.[0] || ''}</div>
              <div>
                <strong>{sourceContact.firstName} {sourceContact.lastName || ''}</strong>
                {sourceContact.company && <span className="contact-company"> at {sourceContact.company}</span>}
              </div>
            </div>
          </div>

          <div className="intro-arrow">🔗</div>

          <div className="intro-target">
            <span className="intro-label">To...</span>
            {!selectedContact ? (
              <>
                <input
                  type="text"
                  className="intro-search"
                  placeholder="Search contacts..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  autoFocus
                />
                <div className="intro-contact-list">
                  {filteredContacts.slice(0, 10).map(contact => {
                    const matchReasons = getMatchReasons(contact);
                    return (
                      <div
                        key={contact.id}
                        className="intro-contact-option"
                        onClick={() => setSelectedContact(contact)}
                      >
                        <div className="contact-avatar small">{contact.firstName[0]}{contact.lastName?.[0] || ''}</div>
                        <div className="intro-contact-info">
                          <strong>{contact.firstName} {contact.lastName || ''}</strong>
                          {contact.company && <span className="contact-company"> at {contact.company}</span>}
                          {matchReasons.length > 0 && (
                            <div className="match-reasons">
                              {matchReasons.slice(0, 2).map((reason, i) => (
                                <span key={i} className="match-reason">✨ {reason}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="intro-selected">
                <div className="intro-contact-card selected">
                  <div className="contact-avatar small">{selectedContact.firstName[0]}{selectedContact.lastName?.[0] || ''}</div>
                  <div>
                    <strong>{selectedContact.firstName} {selectedContact.lastName || ''}</strong>
                    {selectedContact.company && <span className="contact-company"> at {selectedContact.company}</span>}
                  </div>
                  <button className="btn-change" onClick={() => setSelectedContact(null)}>Change</button>
                </div>
              </div>
            )}
          </div>

          {selectedContact && (
            <>
              <div className="intro-context">
                <label>Add context (optional)</label>
                <textarea
                  value={context}
                  onChange={e => setContext(e.target.value)}
                  placeholder="Why you're connecting them, what to discuss..."
                  rows={3}
                />
              </div>

              <div className="intro-preview">
                <label>Email Preview</label>
                <div className="email-preview">
                  <div className="email-subject">Subject: {generateEmailSubject()}</div>
                  <pre className="email-body">{generateEmailBody()}</pre>
                </div>
              </div>

              <div className="intro-actions">
                <button className="btn-secondary" onClick={copyToClipboard}>
                  📋 Copy Email
                </button>
                <button className="btn-primary" onClick={openMailClient}>
                  ✉️ Open in Mail App
                </button>
              </div>

              {emailGenerated && (
                <div className="intro-confirm">
                  <p>Did you send the intro?</p>
                  <button className="btn-success" onClick={onIntroMade}>
                    ✅ Yes, Log as Intro Made (+3 equity)
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Equity Log Modal
function EquityLogModal({
  contactId,
  contactName,
  currentEquity = 0,
  onClose,
  onLog,
}: {
  contactId: string;
  contactName: string;
  currentEquity?: number;
  onClose: () => void;
  onLog: (action: Omit<EquityAction, 'id' | 'createdAt'>) => void;
}) {
  const [notes, setNotes] = useState('');
  const [pendingAsk, setPendingAsk] = useState<{ type: EquityActionType; points: number } | null>(null);

  const equityStatus = getEquityStatus(currentEquity);
  const isLowEquity = currentEquity <= 0;
  const isVeryLowEquity = currentEquity <= -3;

  const gaveActions: { type: EquityActionType; label: string; points: number }[] = [
    { type: 'INTRO_MADE', label: 'Made an introduction', points: 3 },
    { type: 'INTRO_SUCCESS', label: 'Intro led to business', points: 5 },
    { type: 'CONTENT_SHARED', label: 'Shared valuable content', points: 1 },
    { type: 'ADVICE_GIVEN', label: 'Gave advice or help', points: 2 },
    { type: 'REFERRAL_MADE', label: 'Referred them business', points: 5 },
    { type: 'ENDORSED', label: 'Endorsed publicly', points: 2 },
    { type: 'FAVOR_DONE', label: 'Did a favor', points: 2 },
  ];

  const askedActions: { type: EquityActionType; label: string; points: number }[] = [
    { type: 'ASKED_INTRO', label: 'Asked for introduction', points: -2 },
    { type: 'ASKED_ADVICE', label: 'Asked for advice', points: -1 },
    { type: 'PITCHED_SERVICE', label: 'Pitched my service', points: -3 },
    { type: 'ASKED_INVESTMENT', label: 'Asked for investment', points: -4 },
    { type: 'ASKED_FAVOR', label: 'Asked for favor', points: -2 },
  ];

  const negativeActions: { type: EquityActionType; label: string; points: number }[] = [
    { type: 'CANCELED_MEETING', label: 'Canceled meeting last minute', points: -1 },
    { type: 'NO_SHOW', label: 'No-showed', points: -3 },
    { type: 'NO_RESPONSE', label: "Didn't respond to their request", points: -1 },
  ];

  const isAskAction = (type: EquityActionType) =>
    ['ASKED_INTRO', 'ASKED_ADVICE', 'PITCHED_SERVICE', 'ASKED_INVESTMENT', 'ASKED_FAVOR'].includes(type);

  const handleSelect = (type: EquityActionType, points: number) => {
    // If this is an "ask" action and equity is low, show warning first
    if (isAskAction(type) && isLowEquity) {
      setPendingAsk({ type, points });
      return;
    }
    confirmAction(type, points);
  };

  const confirmAction = (type: EquityActionType, points: number) => {
    onLog({
      contactId,
      type,
      points,
      notes: notes || undefined,
      date: new Date().toISOString(),
    });
    setPendingAsk(null);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content equity-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Log Exchange with {contactName}</h2>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>

        {/* Current Equity Status Banner */}
        <div className={`equity-status-banner equity-${equityStatus.toLowerCase().replace('_', '-')}`}>
          <span className="equity-score-display">
            Current Balance: <strong>{currentEquity >= 0 ? '+' : ''}{currentEquity}</strong>
          </span>
          <span className={`equity-status-badge ${equityStatus.toLowerCase().replace('_', '-')}`}>
            {equityStatus === 'SUPER_GIVER' && '🌟 Super Giver'}
            {equityStatus === 'HEALTHY' && '💚 Healthy'}
            {equityStatus === 'BALANCED' && '⚖️ Balanced'}
            {equityStatus === 'OVERDRAWN' && '⚠️ Overdrawn'}
            {equityStatus === 'TOXIC' && '🚨 At Risk'}
          </span>
          {isLowEquity && (
            <span className="equity-warning-hint">
              Consider giving value before asking
            </span>
          )}
        </div>

        <div className="equity-modal-content">
          <div className="equity-section gave">
            <h3>💚 Gave Value</h3>
            <div className="equity-actions-grid">
              {gaveActions.map(action => (
                <button
                  key={action.type}
                  className="equity-action-btn gave"
                  onClick={() => handleSelect(action.type, action.points)}
                >
                  <span className="action-label">{action.label}</span>
                  <span className="action-points">+{action.points}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="equity-section asked">
            <h3>❤️ Asked for Value</h3>
            <div className="equity-actions-grid">
              {askedActions.map(action => (
                <button
                  key={action.type}
                  className="equity-action-btn asked"
                  onClick={() => handleSelect(action.type, action.points)}
                >
                  <span className="action-label">{action.label}</span>
                  <span className="action-points">{action.points}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="equity-section negative">
            <h3>⚠️ Negative Actions</h3>
            <div className="equity-actions-grid">
              {negativeActions.map(action => (
                <button
                  key={action.type}
                  className="equity-action-btn negative"
                  onClick={() => handleSelect(action.type, action.points)}
                >
                  <span className="action-label">{action.label}</span>
                  <span className="action-points">{action.points}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="equity-notes">
            <label>Notes (optional)</label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Add context..."
            />
          </div>
        </div>

        {/* Warning Dialog for Low Equity Asks */}
        {pendingAsk && (
          <div className="equity-warning-overlay">
            <div className="equity-warning-dialog">
              <div className="warning-icon">
                {isVeryLowEquity ? '🚨' : '⚠️'}
              </div>
              <h3>
                {isVeryLowEquity
                  ? 'Relationship at Risk!'
                  : 'Consider Building More Equity First'}
              </h3>
              <p>
                Your relationship equity with {contactName} is{' '}
                <strong className={isVeryLowEquity ? 'text-danger' : 'text-warning'}>
                  {currentEquity >= 0 ? '+' : ''}{currentEquity}
                </strong>
                {isVeryLowEquity
                  ? '. Making another ask could seriously damage this relationship.'
                  : '. You may want to give some value first.'}
              </p>
              <div className="warning-suggestions">
                <p><strong>Consider first:</strong></p>
                <ul>
                  <li>Making an introduction for them</li>
                  <li>Sharing valuable content or insights</li>
                  <li>Offering advice or help with something</li>
                </ul>
              </div>
              <div className="warning-actions">
                <button
                  className="btn secondary"
                  onClick={() => setPendingAsk(null)}
                >
                  Go Back
                </button>
                <button
                  className={`btn ${isVeryLowEquity ? 'danger' : 'warning'}`}
                  onClick={() => confirmAction(pendingAsk.type, pendingAsk.points)}
                >
                  Log It Anyway
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
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
  const [allTags, setAllTags] = useState<string[]>([]);
  const [allSectors, setAllSectors] = useState<string[]>([]);
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const [sectorSuggestions, setSectorSuggestions] = useState<string[]>([]);
  const [showTagSuggestions, setShowTagSuggestions] = useState(false);
  const [showSectorSuggestions, setShowSectorSuggestions] = useState(false);
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

  // Fetch all tags and sectors from existing contacts
  useEffect(() => {
    contacts.getAll().then(res => {
      if (res.success && res.data) {
        const tags = new Set<string>();
        const sectors = new Set<string>();
        res.data.forEach(c => {
          c.tags?.forEach(t => tags.add(t));
          c.sectors?.forEach(s => sectors.add(s));
        });
        setAllTags([...tags].sort());
        setAllSectors([...sectors].sort());
      }
    });
  }, []);

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

  const handleTagsChange = (value: string) => {
    setForm({ ...form, tags: value });
    // Get the last tag being typed (after the last comma)
    const parts = value.split(',');
    const lastPart = parts[parts.length - 1].trim().toLowerCase();
    if (lastPart.length > 0) {
      const currentTags = parts.slice(0, -1).map(t => t.trim().toLowerCase());
      const suggestions = allTags.filter(t =>
        t.toLowerCase().includes(lastPart) && !currentTags.includes(t.toLowerCase())
      ).slice(0, 5);
      setTagSuggestions(suggestions);
      setShowTagSuggestions(suggestions.length > 0);
    } else {
      setShowTagSuggestions(false);
    }
  };

  const addTagSuggestion = (tag: string) => {
    const parts = form.tags.split(',').map(t => t.trim()).filter(Boolean);
    parts.pop(); // Remove the partial tag
    parts.push(tag);
    setForm({ ...form, tags: parts.join(', ') + ', ' });
    setShowTagSuggestions(false);
  };

  const handleSectorsChange = (value: string) => {
    setForm({ ...form, sectors: value });
    const parts = value.split(',');
    const lastPart = parts[parts.length - 1].trim().toLowerCase();
    if (lastPart.length > 0) {
      const currentSectors = parts.slice(0, -1).map(t => t.trim().toLowerCase());
      const suggestions = allSectors.filter(s =>
        s.toLowerCase().includes(lastPart) && !currentSectors.includes(s.toLowerCase())
      ).slice(0, 5);
      setSectorSuggestions(suggestions);
      setShowSectorSuggestions(suggestions.length > 0);
    } else {
      setShowSectorSuggestions(false);
    }
  };

  const addSectorSuggestion = (sector: string) => {
    const parts = form.sectors.split(',').map(t => t.trim()).filter(Boolean);
    parts.pop();
    parts.push(sector);
    setForm({ ...form, sectors: parts.join(', ') + ', ' });
    setShowSectorSuggestions(false);
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
          <VoiceTextArea
            label="How We Met"
            value={form.howWeMet}
            onChange={(val) => setForm({...form, howWeMet: val})}
            placeholder="Conference, mutual friend, cold outreach... Tap mic to speak"
            rows={2}
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

        <div className="form-group autocomplete-group">
          <label>Sector (comma separated)</label>
          <div className="autocomplete-wrapper">
            <input
              type="text"
              value={form.sectors}
              onChange={e => handleSectorsChange(e.target.value)}
              onBlur={() => setTimeout(() => setShowSectorSuggestions(false), 200)}
              onFocus={() => { if (sectorSuggestions.length > 0) setShowSectorSuggestions(true); }}
              placeholder="VC, Fintech, AI, SaaS"
            />
            {showSectorSuggestions && (
              <div className="autocomplete-dropdown">
                {sectorSuggestions.map((sector, idx) => (
                  <button key={idx} type="button" className="autocomplete-item" onClick={() => addSectorSuggestion(sector)}>
                    {sector}
                  </button>
                ))}
              </div>
            )}
          </div>
          {allSectors.length > 0 && (
            <div className="existing-tags-hint">
              Existing: {allSectors.slice(0, 5).join(', ')}{allSectors.length > 5 ? ` +${allSectors.length - 5} more` : ''}
            </div>
          )}
        </div>

        <div className="form-group autocomplete-group">
          <label>Tags (comma separated)</label>
          <div className="autocomplete-wrapper">
            <input
              type="text"
              value={form.tags}
              onChange={e => handleTagsChange(e.target.value)}
              onBlur={() => setTimeout(() => setShowTagSuggestions(false), 200)}
              onFocus={() => { if (tagSuggestions.length > 0) setShowTagSuggestions(true); }}
              placeholder="investor, advisor, NYC"
            />
            {showTagSuggestions && (
              <div className="autocomplete-dropdown">
                {tagSuggestions.map((tag, idx) => (
                  <button key={idx} type="button" className="autocomplete-item" onClick={() => addTagSuggestion(tag)}>
                    {tag}
                  </button>
                ))}
              </div>
            )}
          </div>
          {allTags.length > 0 && (
            <div className="existing-tags-hint">
              Existing: {allTags.slice(0, 5).join(', ')}{allTags.length > 5 ? ` +${allTags.length - 5} more` : ''}
            </div>
          )}
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
          <VoiceTextArea
            label="Notes"
            value={form.notes}
            onChange={(val) => setForm({...form, notes: val})}
            rows={4}
            placeholder="Add any notes about this contact... Tap mic to speak"
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
  const [actionItems, setActionItems] = useState<{text: string; owner: 'me' | 'them' | 'both'; dueDate?: string}[]>([]);
  const [newAction, setNewAction] = useState('');
  const [newActionOwner, setNewActionOwner] = useState<'me' | 'them' | 'both'>('me');
  const [newActionDue, setNewActionDue] = useState('');

  const addActionItem = () => {
    if (newAction.trim()) {
      setActionItems([...actionItems, { text: newAction.trim(), owner: newActionOwner, dueDate: newActionDue || undefined }]);
      setNewAction('');
      setNewActionDue('');
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
        dueDate: a.dueDate,
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
            <VoiceTextArea
              label="Notes"
              value={notes}
              onChange={setNotes}
              rows={3}
              placeholder="What did you discuss? Tap mic to speak..."
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
                    {item.dueDate && <span className="action-due">Due: {new Date(item.dueDate).toLocaleDateString()}</span>}
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
              <input
                type="date"
                value={newActionDue}
                onChange={e => setNewActionDue(e.target.value)}
                className="action-due-input"
              />
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
  const [showOutcomeModal, setShowOutcomeModal] = useState<Introduction | null>(null);

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

  const updateIntroStatus = async (id: string, status: 'MADE' | 'COMPLETED' | 'DECLINED', outcome?: string) => {
    const updates: Partial<Introduction> = { status };
    if (outcome) updates.outcome = outcome;
    if (status === 'COMPLETED') updates.completedAt = new Date().toISOString();
    if (status === 'MADE') updates.introducedAt = new Date().toISOString();

    const res = await introductions.update(id, updates);
    if (res.success) {
      loadIntroductions();
    }
  };

  const handleRecordOutcome = (intro: Introduction) => {
    setShowOutcomeModal(intro);
  };

  // Calculate intro stats
  const stats = {
    total: introList.length,
    made: introList.filter(i => i.status === 'MADE' || i.status === 'COMPLETED').length,
    completed: introList.filter(i => i.status === 'COMPLETED').length,
    successRate: introList.length > 0
      ? Math.round((introList.filter(i => i.status === 'COMPLETED').length / introList.filter(i => ['MADE', 'COMPLETED', 'DECLINED'].includes(i.status)).length) * 100) || 0
      : 0
  };

  if (loading) {
    return <div className="page-loading">Loading introductions...</div>;
  }

  return (
    <div className="introductions-page">
      <div className="page-header">
        <h1>Introductions</h1>
      </div>

      {/* Stats Banner */}
      <div className="intro-stats-banner">
        <div className="intro-stat">
          <span className="intro-stat-value">{stats.total}</span>
          <span className="intro-stat-label">Total Intros</span>
        </div>
        <div className="intro-stat">
          <span className="intro-stat-value">{stats.made}</span>
          <span className="intro-stat-label">Made</span>
        </div>
        <div className="intro-stat">
          <span className="intro-stat-value">{stats.completed}</span>
          <span className="intro-stat-label">Successful</span>
        </div>
        <div className="intro-stat highlight">
          <span className="intro-stat-value">{stats.successRate}%</span>
          <span className="intro-stat-label">Success Rate</span>
        </div>
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
                  <button
                    className="btn secondary small"
                    onClick={() => updateIntroStatus(intro.id, 'DECLINED')}
                  >Dismiss</button>
                  <button
                    className="btn primary small"
                    onClick={() => updateIntroStatus(intro.id, 'MADE')}
                  >Make Intro</button>
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
                    {intro.status === 'COMPLETED' ? '✅ ' : intro.status === 'MADE' ? '🔗 ' : intro.status === 'DECLINED' ? '❌ ' : ''}
                    {intro.status}
                  </span>
                </div>
                <div className="intro-details">
                  <span className="intro-names">{intro.sourceContact?.firstName} ↔ {intro.targetContact?.firstName}</span>
                  {intro.context && <p className="intro-context-text">{intro.context}</p>}
                  {intro.outcome && (
                    <p className="intro-outcome">
                      <strong>Outcome:</strong> {intro.outcome}
                    </p>
                  )}
                  {intro.introducedAt && (
                    <span className="intro-date">Made {new Date(intro.introducedAt).toLocaleDateString()}</span>
                  )}
                </div>
                <div className="intro-item-actions">
                  {intro.status === 'MADE' && (
                    <button
                      className="btn-record-outcome"
                      onClick={() => handleRecordOutcome(intro)}
                    >
                      Record Outcome
                    </button>
                  )}
                  {intro.status === 'PENDING' && (
                    <>
                      <button
                        className="btn-text"
                        onClick={() => updateIntroStatus(intro.id, 'DECLINED')}
                      >Dismiss</button>
                      <button
                        className="btn-primary small"
                        onClick={() => updateIntroStatus(intro.id, 'MADE')}
                      >Mark Made</button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {showOutcomeModal && (
        <IntroOutcomeModal
          intro={showOutcomeModal}
          onClose={() => setShowOutcomeModal(null)}
          onSave={(outcome, successful) => {
            updateIntroStatus(showOutcomeModal.id, successful ? 'COMPLETED' : 'MADE', outcome);
            setShowOutcomeModal(null);
          }}
        />
      )}
    </div>
  );
}

// Intro Outcome Modal
function IntroOutcomeModal({
  intro,
  onClose,
  onSave,
}: {
  intro: Introduction;
  onClose: () => void;
  onSave: (outcome: string, successful: boolean) => void;
}) {
  const [outcome, setOutcome] = useState(intro.outcome || '');
  const [successful, setSuccessful] = useState(false);

  const quickOutcomes = [
    { label: 'Met and connected', success: true },
    { label: 'Started working together', success: true },
    { label: 'Deal closed', success: true },
    { label: 'Ongoing conversation', success: false },
    { label: "Didn't connect", success: false },
    { label: 'Not a good fit', success: false },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content outcome-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Record Outcome</h2>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>

        <div className="outcome-intro-info">
          <span>{intro.sourceContact?.firstName} ↔ {intro.targetContact?.firstName}</span>
        </div>

        <div className="quick-outcomes">
          <label>Quick select:</label>
          <div className="quick-outcome-grid">
            {quickOutcomes.map(q => (
              <button
                key={q.label}
                className={`quick-outcome-btn ${outcome === q.label ? 'selected' : ''} ${q.success ? 'success' : ''}`}
                onClick={() => { setOutcome(q.label); setSuccessful(q.success); }}
              >
                {q.success ? '✅' : '⏳'} {q.label}
              </button>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label>Outcome details</label>
          <textarea
            value={outcome}
            onChange={e => setOutcome(e.target.value)}
            placeholder="What happened? Any business generated?"
            rows={3}
          />
        </div>

        <div className="form-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={successful}
              onChange={e => setSuccessful(e.target.checked)}
            />
            <span>Mark as successful introduction</span>
          </label>
        </div>

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            onClick={() => onSave(outcome, successful)}
            disabled={!outcome.trim()}
          >
            Save Outcome
          </button>
        </div>
      </div>
    </div>
  );
}

// Analytics Page
function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [equityActions, setEquityActions] = useState<EquityAction[]>([]);
  const [contactList, setContactList] = useState<Contact[]>([]);

  useEffect(() => {
    loadAnalytics();
    loadEquityData();
    loadContactList();
  }, []);

  const loadEquityData = () => {
    const stored = localStorage.getItem('obani_equity_actions');
    if (stored) {
      setEquityActions(JSON.parse(stored));
    }
  };

  const loadContactList = async () => {
    const res = await contacts.list(1, 200);
    if (res.success && res.data) {
      setContactList(res.data.items || []);
    }
  };

  // Calculate equity metrics for network
  const getNetworkEquityMetrics = () => {
    if (contactList.length === 0) return null;

    const contactEquities = contactList.map(c => {
      const contactActions = equityActions.filter(a => a.contactId === c.id);
      const score = contactActions.reduce((sum, a) => sum + a.points, 0);
      return { contact: c, score, status: getEquityStatus(score) };
    });

    const statusCounts = {
      SUPER_GIVER: contactEquities.filter(ce => ce.status === 'SUPER_GIVER').length,
      HEALTHY: contactEquities.filter(ce => ce.status === 'HEALTHY').length,
      BALANCED: contactEquities.filter(ce => ce.status === 'BALANCED').length,
      OVERDRAWN: contactEquities.filter(ce => ce.status === 'OVERDRAWN').length,
      TOXIC: contactEquities.filter(ce => ce.status === 'TOXIC').length,
    };

    const totalGiven = equityActions.filter(a => a.points > 0).reduce((sum, a) => sum + a.points, 0);
    const totalTaken = Math.abs(equityActions.filter(a => a.points < 0).reduce((sum, a) => sum + a.points, 0));
    const netEquity = totalGiven - totalTaken;
    const avgEquity = contactList.length > 0
      ? contactEquities.reduce((sum, ce) => sum + ce.score, 0) / contactList.length
      : 0;

    // Top givers and those overdrawn
    const topGivers = contactEquities.filter(ce => ce.score > 0).sort((a, b) => b.score - a.score).slice(0, 5);
    const overdrawn = contactEquities.filter(ce => ce.status === 'OVERDRAWN' || ce.status === 'TOXIC').sort((a, b) => a.score - b.score).slice(0, 5);

    return { statusCounts, totalGiven, totalTaken, netEquity, avgEquity, topGivers, overdrawn };
  };

  const loadAnalytics = async () => {
    const res = await analytics.getDashboard();
    if (res.success && res.data) {
      setData(res.data);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="analytics-page">
        <div className="page-header">
          <div className="skeleton skeleton-title" style={{ width: '120px', height: '32px' }} />
        </div>
        <DashboardSkeleton />
      </div>
    );
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

        {(() => {
          const equityMetrics = getNetworkEquityMetrics();
          if (!equityMetrics) return null;
          return (
            <section className="analytics-section equity-dashboard">
              <h2>Network Equity</h2>
              <p className="section-desc">Your give/take balance across relationships</p>

              <div className="equity-summary-stats">
                <div className="equity-stat">
                  <span className="equity-stat-value positive">+{equityMetrics.totalGiven}</span>
                  <span className="equity-stat-label">Total Given</span>
                </div>
                <div className="equity-stat">
                  <span className="equity-stat-value negative">-{equityMetrics.totalTaken}</span>
                  <span className="equity-stat-label">Total Taken</span>
                </div>
                <div className="equity-stat">
                  <span className={`equity-stat-value ${equityMetrics.netEquity >= 0 ? 'positive' : 'negative'}`}>
                    {equityMetrics.netEquity >= 0 ? '+' : ''}{equityMetrics.netEquity}
                  </span>
                  <span className="equity-stat-label">Net Equity</span>
                </div>
                <div className="equity-stat">
                  <span className="equity-stat-value">{equityMetrics.avgEquity.toFixed(1)}</span>
                  <span className="equity-stat-label">Avg per Contact</span>
                </div>
              </div>

              <div className="equity-distribution">
                <h3>Relationship Status Distribution</h3>
                <div className="equity-bar-chart">
                  {Object.entries(equityMetrics.statusCounts).map(([status, count]) => (
                    <div key={status} className={`equity-bar-item status-${status.toLowerCase()}`}>
                      <div className="bar-label">
                        {status === 'SUPER_GIVER' ? 'Super Givers' :
                         status === 'HEALTHY' ? 'Healthy' :
                         status === 'BALANCED' ? 'Balanced' :
                         status === 'OVERDRAWN' ? 'Overdrawn' : 'Toxic'}
                      </div>
                      <div className="bar-track">
                        <div
                          className="bar-fill"
                          style={{ width: `${contactList.length > 0 ? (count / contactList.length) * 100 : 0}%` }}
                        />
                      </div>
                      <div className="bar-count">{count}</div>
                    </div>
                  ))}
                </div>
              </div>

              {equityMetrics.topGivers.length > 0 && (
                <div className="equity-list-section">
                  <h3>Top Givers (You're in their debt)</h3>
                  <div className="equity-contact-list">
                    {equityMetrics.topGivers.map(({ contact, score }) => (
                      <Link key={contact.id} to={`/contacts/${contact.id}`} className="equity-contact-item positive">
                        <div className="eq-avatar">{contact.firstName[0]}</div>
                        <div className="eq-name">{contact.firstName} {contact.lastName || ''}</div>
                        <div className="eq-score">+{score}</div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {equityMetrics.overdrawn.length > 0 && (
                <div className="equity-list-section">
                  <h3>Overdrawn Relationships (Need to give back)</h3>
                  <div className="equity-contact-list">
                    {equityMetrics.overdrawn.map(({ contact, score }) => (
                      <Link key={contact.id} to={`/contacts/${contact.id}`} className="equity-contact-item negative">
                        <div className="eq-avatar">{contact.firstName[0]}</div>
                        <div className="eq-name">{contact.firstName} {contact.lastName || ''}</div>
                        <div className="eq-score">{score}</div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </section>
          );
        })()}
      </div>
    </div>
  );
}

// Content Library Page
function ContentLibraryPage() {
  const [contentItems, setContentItems] = useState<ContentItem[]>([]);
  const [contactList, setContactList] = useState<Contact[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingContent, setEditingContent] = useState<ContentItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<ContentType | 'ALL'>('ALL');

  useEffect(() => {
    const stored = localStorage.getItem('obani_content_library');
    if (stored) {
      setContentItems(JSON.parse(stored));
    }
    loadContacts();
  }, []);

  const loadContacts = async () => {
    const res = await contacts.getAll();
    if (res.success && res.data) {
      setContactList(res.data);
    }
  };

  const saveContentItems = (items: ContentItem[]) => {
    setContentItems(items);
    localStorage.setItem('obani_content_library', JSON.stringify(items));
  };

  const handleSaveContent = (data: Partial<ContentItem>) => {
    if (editingContent) {
      const updated = contentItems.map(item =>
        item.id === editingContent.id
          ? { ...item, ...data, updatedAt: new Date().toISOString() }
          : item
      );
      saveContentItems(updated);
    } else {
      const newItem: ContentItem = {
        id: crypto.randomUUID(),
        title: data.title || 'Untitled',
        url: data.url,
        contentType: data.contentType || 'ARTICLE',
        author: data.author,
        publication: data.publication,
        publishedDate: data.publishedDate,
        myNotes: data.myNotes,
        keyTakeaways: data.keyTakeaways || [],
        tags: data.tags || [],
        relevantContactIds: data.relevantContactIds || [],
        sharedWithContactIds: [],
        savedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      saveContentItems([newItem, ...contentItems]);
    }
    setShowModal(false);
    setEditingContent(null);
  };

  const handleDeleteContent = (id: string) => {
    if (confirm('Delete this content?')) {
      saveContentItems(contentItems.filter(c => c.id !== id));
    }
  };

  const filteredContent = contentItems.filter(item => {
    const matchesSearch = !searchQuery ||
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.myNotes?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.author?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesType = filterType === 'ALL' || item.contentType === filterType;
    return matchesSearch && matchesType;
  });

  const contentTypeIcons: Record<ContentType, string> = {
    ARTICLE: '📰',
    PODCAST: '🎧',
    VIDEO: '📹',
    BOOK: '📚',
    REPORT: '📊',
    OTHER: '📎',
  };

  return (
    <div className="content-library-page">
      <div className="page-header">
        <div>
          <h1>Content Library</h1>
          <p className="page-subtitle">Save articles, podcasts, and videos for future reference</p>
        </div>
        <button className="btn-primary" onClick={() => { setEditingContent(null); setShowModal(true); }}>
          + Add Content
        </button>
      </div>

      <div className="content-filters">
        <div className="search-box">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            placeholder="Search title, notes, author, tags..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="type-filters">
          <button
            className={`type-filter ${filterType === 'ALL' ? 'active' : ''}`}
            onClick={() => setFilterType('ALL')}
          >All</button>
          {(['ARTICLE', 'PODCAST', 'VIDEO', 'BOOK', 'REPORT'] as ContentType[]).map(type => (
            <button
              key={type}
              className={`type-filter ${filterType === type ? 'active' : ''}`}
              onClick={() => setFilterType(type)}
            >
              {contentTypeIcons[type]} {type.charAt(0) + type.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="content-stats">
        <span>{filteredContent.length} items</span>
        {searchQuery && <span className="filtered-label">filtered from {contentItems.length}</span>}
      </div>

      {filteredContent.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📚</div>
          <h3>No content saved yet</h3>
          <p>Start building your knowledge library by saving articles, podcasts, and videos.</p>
          <button className="btn-primary" onClick={() => setShowModal(true)}>Add Your First Content</button>
        </div>
      ) : (
        <div className="content-grid">
          {filteredContent.map(item => (
            <div key={item.id} className="content-card" onClick={() => { setEditingContent(item); setShowModal(true); }}>
              <div className="content-card-header">
                <span className="content-type-icon">{contentTypeIcons[item.contentType]}</span>
                <span className="content-type-label">{item.contentType}</span>
                <button
                  className="btn-delete-content"
                  onClick={e => { e.stopPropagation(); handleDeleteContent(item.id); }}
                >🗑️</button>
              </div>
              <h3 className="content-title">{item.title}</h3>
              {item.author && <p className="content-author">by {item.author}</p>}
              {item.myNotes && (
                <p className="content-notes">
                  {item.myNotes.length > 100 ? item.myNotes.slice(0, 100) + '...' : item.myNotes}
                </p>
              )}
              {item.tags.length > 0 && (
                <div className="content-tags">
                  {item.tags.slice(0, 3).map(tag => (
                    <span key={tag} className="content-tag">{tag}</span>
                  ))}
                  {item.tags.length > 3 && <span className="more-tags">+{item.tags.length - 3}</span>}
                </div>
              )}
              {item.relevantContactIds.length > 0 && (
                <div className="content-contacts">
                  <span className="contacts-icon">👥</span>
                  <span>Relevant to {item.relevantContactIds.length} contact{item.relevantContactIds.length > 1 ? 's' : ''}</span>
                </div>
              )}
              <div className="content-footer">
                <span className="content-date">Saved {new Date(item.savedAt).toLocaleDateString()}</span>
                {item.url && (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="content-link"
                    onClick={e => e.stopPropagation()}
                  >Open →</a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <ContentModal
          content={editingContent}
          contacts={contactList}
          onSave={handleSaveContent}
          onClose={() => { setShowModal(false); setEditingContent(null); }}
        />
      )}
    </div>
  );
}

// Personal Notes Page
function PersonalNotesPage() {
  const [notes, setNotes] = useState<PersonalNote[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingNote, setEditingNote] = useState<PersonalNote | null>(null);
  const [filterType, setFilterType] = useState<NoteType | 'ALL'>('ALL');
  const [filterStatus, setFilterStatus] = useState<'active' | 'done' | 'all'>('active');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const stored = localStorage.getItem('obani_personal_notes');
    if (stored) {
      setNotes(JSON.parse(stored));
    }
  }, []);

  const saveNotes = (newNotes: PersonalNote[]) => {
    setNotes(newNotes);
    localStorage.setItem('obani_personal_notes', JSON.stringify(newNotes));
  };

  const handleSaveNote = (data: Partial<PersonalNote>) => {
    if (editingNote) {
      const updated = notes.map(n =>
        n.id === editingNote.id
          ? { ...n, ...data, updatedAt: new Date().toISOString() }
          : n
      );
      saveNotes(updated);
    } else {
      const newNote: PersonalNote = {
        id: crypto.randomUUID(),
        content: data.content || '',
        title: data.title,
        noteType: data.noteType || 'TODO',
        tags: data.tags || [],
        priority: data.priority || 3,
        dueDate: data.dueDate,
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      saveNotes([newNote, ...notes]);
    }
    setShowModal(false);
    setEditingNote(null);
  };

  const toggleNoteStatus = (noteId: string) => {
    const updated = notes.map(n =>
      n.id === noteId
        ? {
            ...n,
            status: n.status === 'done' ? 'active' as const : 'done' as const,
            completedAt: n.status === 'active' ? new Date().toISOString() : undefined,
            updatedAt: new Date().toISOString()
          }
        : n
    );
    saveNotes(updated);
  };

  const deleteNote = (noteId: string) => {
    if (confirm('Delete this note?')) {
      saveNotes(notes.filter(n => n.id !== noteId));
    }
  };

  const filteredNotes = notes.filter(n => {
    if (filterType !== 'ALL' && n.noteType !== filterType) return false;
    if (filterStatus === 'active' && n.status !== 'active') return false;
    if (filterStatus === 'done' && n.status !== 'done') return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!n.content.toLowerCase().includes(q) &&
          !n.title?.toLowerCase().includes(q) &&
          !n.tags.some(t => t.toLowerCase().includes(q))) {
        return false;
      }
    }
    return true;
  }).sort((a, b) => {
    // Sort by priority first (for active), then by date
    if (filterStatus === 'active') {
      if (a.priority !== b.priority) return a.priority - b.priority;
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const getTypeIcon = (type: NoteType) => {
    switch (type) {
      case 'TODO': return '☐';
      case 'IDEA': return '💡';
      case 'INSIGHT': return '🎯';
      case 'JOURNAL': return '📓';
      default: return '📝';
    }
  };

  const getPriorityLabel = (p: number) => {
    switch (p) {
      case 1: return 'Urgent';
      case 2: return 'High';
      case 3: return 'Medium';
      case 4: return 'Low';
      case 5: return 'Someday';
      default: return '';
    }
  };

  const stats = {
    todos: notes.filter(n => n.noteType === 'TODO' && n.status === 'active').length,
    ideas: notes.filter(n => n.noteType === 'IDEA').length,
    insights: notes.filter(n => n.noteType === 'INSIGHT').length,
    done: notes.filter(n => n.status === 'done').length,
  };

  return (
    <div className="personal-notes-page">
      <div className="page-header">
        <h1>Notes</h1>
        <button className="btn primary" onClick={() => { setEditingNote(null); setShowModal(true); }}>
          + Quick Capture
        </button>
      </div>

      <div className="notes-stats">
        <div className="note-stat">
          <span className="stat-icon">☐</span>
          <span className="stat-count">{stats.todos}</span>
          <span className="stat-label">To-Do</span>
        </div>
        <div className="note-stat">
          <span className="stat-icon">💡</span>
          <span className="stat-count">{stats.ideas}</span>
          <span className="stat-label">Ideas</span>
        </div>
        <div className="note-stat">
          <span className="stat-icon">🎯</span>
          <span className="stat-count">{stats.insights}</span>
          <span className="stat-label">Insights</span>
        </div>
        <div className="note-stat done">
          <span className="stat-icon">✓</span>
          <span className="stat-count">{stats.done}</span>
          <span className="stat-label">Done</span>
        </div>
      </div>

      <div className="notes-filters">
        <input
          type="text"
          className="search-input"
          placeholder="Search notes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <div className="filter-row">
          <div className="type-filters">
            {(['ALL', 'TODO', 'IDEA', 'INSIGHT', 'JOURNAL', 'OTHER'] as const).map(type => (
              <button
                key={type}
                className={`type-filter-btn ${filterType === type ? 'active' : ''}`}
                onClick={() => setFilterType(type)}
              >
                {type === 'ALL' ? 'All' : type.charAt(0) + type.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
          <div className="status-filters">
            {(['active', 'done', 'all'] as const).map(status => (
              <button
                key={status}
                className={`status-filter-btn ${filterStatus === status ? 'active' : ''}`}
                onClick={() => setFilterStatus(status)}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {filteredNotes.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📝</div>
          <h3>No notes yet</h3>
          <p>Capture ideas, to-dos, and insights as they come to you.</p>
          <button className="btn primary" onClick={() => setShowModal(true)}>
            Add Your First Note
          </button>
        </div>
      ) : (
        <div className="notes-list">
          {filteredNotes.map(note => (
            <div key={note.id} className={`note-card ${note.status === 'done' ? 'done' : ''}`}>
              <div className="note-header">
                <span className="note-type-icon">{getTypeIcon(note.noteType)}</span>
                {note.noteType === 'TODO' && (
                  <button
                    className={`todo-checkbox ${note.status === 'done' ? 'checked' : ''}`}
                    onClick={() => toggleNoteStatus(note.id)}
                  >
                    {note.status === 'done' ? '✓' : ''}
                  </button>
                )}
                <div className="note-content-preview">
                  {note.title && <span className="note-title">{note.title}</span>}
                  <span className={`note-text ${note.title ? 'has-title' : ''}`}>{note.content}</span>
                </div>
              </div>
              <div className="note-meta">
                {note.noteType === 'TODO' && note.status === 'active' && (
                  <span className={`priority-badge priority-${note.priority}`}>
                    {getPriorityLabel(note.priority)}
                  </span>
                )}
                {note.dueDate && note.status === 'active' && (
                  <span className={`due-date ${new Date(note.dueDate) < new Date() ? 'overdue' : ''}`}>
                    Due: {new Date(note.dueDate).toLocaleDateString()}
                  </span>
                )}
                {note.tags.length > 0 && (
                  <div className="note-tags">
                    {note.tags.slice(0, 2).map(tag => (
                      <span key={tag} className="tag">{tag}</span>
                    ))}
                  </div>
                )}
                <span className="note-date">
                  {note.status === 'done' && note.completedAt
                    ? `Done ${new Date(note.completedAt).toLocaleDateString()}`
                    : new Date(note.createdAt).toLocaleDateString()}
                </span>
              </div>
              <div className="note-actions">
                <button className="btn-icon" onClick={() => { setEditingNote(note); setShowModal(true); }}>Edit</button>
                {note.noteType !== 'TODO' && (
                  <button className="btn-icon" onClick={() => toggleNoteStatus(note.id)}>
                    {note.status === 'done' ? 'Restore' : 'Archive'}
                  </button>
                )}
                <button className="btn-icon delete" onClick={() => deleteNote(note.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <NoteModal
          note={editingNote}
          onSave={handleSaveNote}
          onClose={() => { setShowModal(false); setEditingNote(null); }}
        />
      )}
    </div>
  );
}

// Note Modal
function NoteModal({
  note,
  onSave,
  onClose,
}: {
  note: PersonalNote | null;
  onSave: (data: Partial<PersonalNote>) => void;
  onClose: () => void;
}) {
  const [content, setContent] = useState(note?.content || '');
  const [title, setTitle] = useState(note?.title || '');
  const [noteType, setNoteType] = useState<NoteType>(note?.noteType || 'TODO');
  const [priority, setPriority] = useState<1 | 2 | 3 | 4 | 5>(note?.priority || 3);
  const [dueDate, setDueDate] = useState(note?.dueDate || '');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>(note?.tags || []);

  const handleAddTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput('');
    }
  };

  const handleSave = () => {
    if (!content.trim()) return;
    onSave({
      content,
      title: title || undefined,
      noteType,
      priority,
      dueDate: dueDate || undefined,
      tags,
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal note-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{note ? 'Edit Note' : 'Quick Capture'}</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label>Type</label>
            <div className="note-type-selector">
              {(['TODO', 'IDEA', 'INSIGHT', 'JOURNAL', 'OTHER'] as const).map(type => (
                <button
                  key={type}
                  type="button"
                  className={`type-btn ${noteType === type ? 'active' : ''}`}
                  onClick={() => setNoteType(type)}
                >
                  {type === 'TODO' && '☐'}
                  {type === 'IDEA' && '💡'}
                  {type === 'INSIGHT' && '🎯'}
                  {type === 'JOURNAL' && '📓'}
                  {type === 'OTHER' && '📝'}
                  <span>{type.charAt(0) + type.slice(1).toLowerCase()}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>Title (optional)</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Give it a title..."
            />
          </div>

          <div className="form-group">
            <VoiceTextArea
              label="Content *"
              value={content}
              onChange={setContent}
              placeholder="What's on your mind? Tap mic to speak"
              rows={4}
            />
          </div>

          {noteType === 'TODO' && (
            <>
              <div className="form-group">
                <label>Priority</label>
                <div className="priority-selector">
                  {([1, 2, 3, 4, 5] as const).map(p => (
                    <button
                      key={p}
                      type="button"
                      className={`priority-btn priority-${p} ${priority === p ? 'active' : ''}`}
                      onClick={() => setPriority(p)}
                    >
                      {p === 1 ? 'Urgent' : p === 2 ? 'High' : p === 3 ? 'Medium' : p === 4 ? 'Low' : 'Someday'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label>Due Date</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                />
              </div>
            </>
          )}

          <div className="form-group">
            <label>Tags</label>
            <div className="tag-input-row">
              <input
                type="text"
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                placeholder="Add tag..."
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddTag(); }}}
              />
              <button type="button" className="btn secondary" onClick={handleAddTag}>Add</button>
            </div>
            {tags.length > 0 && (
              <div className="tags-list">
                {tags.map(tag => (
                  <span key={tag} className="tag">
                    {tag}
                    <button onClick={() => setTags(tags.filter(t => t !== tag))}>×</button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn secondary" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={handleSave} disabled={!content.trim()}>
            {note ? 'Save Changes' : 'Save Note'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Tag Management Page
function TagManagementPage() {
  const [contactList, setContactList] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [newTagName, setNewTagName] = useState('');
  const [mergeTarget, setMergeTarget] = useState<string | null>(null);
  const [mergeInto, setMergeInto] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async () => {
    setLoading(true);
    const res = await contacts.list(1, 500);
    if (res.success && res.data) {
      setContactList(res.data.items || []);
    }
    setLoading(false);
  };

  // Get all tags with usage counts
  const getTagsWithCounts = (): { tag: string; count: number; contacts: Contact[] }[] => {
    const tagMap = new Map<string, Contact[]>();

    contactList.forEach(contact => {
      (contact.tags || []).forEach(tag => {
        if (!tagMap.has(tag)) {
          tagMap.set(tag, []);
        }
        tagMap.get(tag)!.push(contact);
      });
    });

    return Array.from(tagMap.entries())
      .map(([tag, tagContacts]) => ({ tag, count: tagContacts.length, contacts: tagContacts }))
      .sort((a, b) => b.count - a.count);
  };

  const allTags = getTagsWithCounts();
  const filteredTags = searchQuery
    ? allTags.filter(t => t.tag.toLowerCase().includes(searchQuery.toLowerCase()))
    : allTags;

  // Rename a tag across all contacts
  const handleRenameTag = async (oldTag: string, newTag: string) => {
    if (!newTag.trim() || oldTag === newTag.trim()) {
      setEditingTag(null);
      setNewTagName('');
      return;
    }

    const contactsWithTag = contactList.filter(c => c.tags?.includes(oldTag));

    for (const contact of contactsWithTag) {
      const updatedTags = contact.tags
        .filter(t => t !== oldTag)
        .concat(newTag.trim());
      // Remove duplicates
      const uniqueTags = [...new Set(updatedTags)];
      await contacts.update(contact.id, { tags: uniqueTags });
    }

    await loadContacts();
    setEditingTag(null);
    setNewTagName('');
  };

  // Merge one tag into another
  const handleMergeTag = async (sourceTag: string, targetTag: string) => {
    if (!targetTag.trim() || sourceTag === targetTag.trim()) {
      setMergeTarget(null);
      setMergeInto('');
      return;
    }

    const contactsWithSource = contactList.filter(c => c.tags?.includes(sourceTag));

    for (const contact of contactsWithSource) {
      const updatedTags = contact.tags
        .filter(t => t !== sourceTag)
        .concat(targetTag.trim());
      // Remove duplicates
      const uniqueTags = [...new Set(updatedTags)];
      await contacts.update(contact.id, { tags: uniqueTags });
    }

    await loadContacts();
    setMergeTarget(null);
    setMergeInto('');
  };

  // Delete a tag from all contacts
  const handleDeleteTag = async (tag: string, contactCount: number) => {
    if (!confirm(`Delete tag "${tag}" from ${contactCount} contact${contactCount !== 1 ? 's' : ''}? This cannot be undone.`)) {
      return;
    }

    const contactsWithTag = contactList.filter(c => c.tags?.includes(tag));

    for (const contact of contactsWithTag) {
      const updatedTags = contact.tags.filter(t => t !== tag);
      await contacts.update(contact.id, { tags: updatedTags });
    }

    await loadContacts();
  };

  if (loading) {
    return <div className="page-loading">Loading tags...</div>;
  }

  return (
    <div className="tag-management-page">
      <div className="page-header">
        <h1>Tag Management</h1>
        <span className="tag-count">{allTags.length} tags</span>
      </div>

      <div className="tag-search">
        <input
          type="text"
          className="search-input"
          placeholder="Search tags..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {filteredTags.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🏷️</div>
          <h3>{searchQuery ? 'No matching tags' : 'No tags yet'}</h3>
          <p>Tags will appear here when you add them to contacts.</p>
        </div>
      ) : (
        <div className="tags-management-list">
          {filteredTags.map(({ tag, count, contacts: tagContacts }) => (
            <div key={tag} className="tag-management-item">
              {editingTag === tag ? (
                <div className="tag-edit-form">
                  <input
                    type="text"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    placeholder="New tag name..."
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRenameTag(tag, newTagName);
                      if (e.key === 'Escape') { setEditingTag(null); setNewTagName(''); }
                    }}
                  />
                  <button className="btn primary small" onClick={() => handleRenameTag(tag, newTagName)}>
                    Save
                  </button>
                  <button className="btn secondary small" onClick={() => { setEditingTag(null); setNewTagName(''); }}>
                    Cancel
                  </button>
                </div>
              ) : mergeTarget === tag ? (
                <div className="tag-merge-form">
                  <span className="merge-label">Merge "{tag}" into:</span>
                  <select
                    value={mergeInto}
                    onChange={(e) => setMergeInto(e.target.value)}
                    autoFocus
                  >
                    <option value="">Select target tag...</option>
                    {allTags.filter(t => t.tag !== tag).map(t => (
                      <option key={t.tag} value={t.tag}>{t.tag} ({t.count})</option>
                    ))}
                  </select>
                  <button
                    className="btn primary small"
                    onClick={() => handleMergeTag(tag, mergeInto)}
                    disabled={!mergeInto}
                  >
                    Merge
                  </button>
                  <button className="btn secondary small" onClick={() => { setMergeTarget(null); setMergeInto(''); }}>
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <div className="tag-info">
                    <span className="tag-name">{tag}</span>
                    <span className="tag-usage">{count} contact{count !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="tag-contacts-preview">
                    {tagContacts.slice(0, 3).map(c => (
                      <Link key={c.id} to={`/contacts/${c.id}`} className="contact-chip">
                        {c.firstName} {c.lastName?.[0] || ''}
                      </Link>
                    ))}
                    {count > 3 && <span className="more-count">+{count - 3} more</span>}
                  </div>
                  <div className="tag-actions">
                    <button
                      className="btn-icon"
                      onClick={() => { setEditingTag(tag); setNewTagName(tag); }}
                      title="Rename"
                    >
                      ✏️
                    </button>
                    <button
                      className="btn-icon"
                      onClick={() => { setMergeTarget(tag); setMergeInto(''); }}
                      title="Merge into another tag"
                    >
                      🔗
                    </button>
                    <button
                      className="btn-icon delete"
                      onClick={() => handleDeleteTag(tag, count)}
                      title="Delete"
                    >
                      🗑️
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Settings Page with Backup/Restore
function SettingsPage() {
  const [importing, setImporting] = useState(false);
  const [importSuccess, setImportSuccess] = useState(false);
  const [importError, setImportError] = useState('');
  const [generatingPdf, setGeneratingPdf] = useState(false);

  // Tag Management State
  const [allTags, setAllTags] = useState<{ tag: string; count: number }[]>([]);
  const [loadingTags, setLoadingTags] = useState(true);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [tagAction, setTagAction] = useState<'rename' | 'merge' | 'delete' | null>(null);
  const [newTagName, setNewTagName] = useState('');
  const [mergeTargetTag, setMergeTargetTag] = useState('');
  const [tagProcessing, setTagProcessing] = useState(false);
  const [tagMessage, setTagMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load all tags from contacts
  useEffect(() => {
    loadTags();
  }, []);

  const loadTags = async () => {
    setLoadingTags(true);
    const res = await contacts.getAll();
    if (res.success && res.data) {
      const tagCounts: Record<string, number> = {};
      res.data.forEach(c => {
        (c.tags || []).forEach(tag => {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
      });
      const sortedTags = Object.entries(tagCounts)
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count);
      setAllTags(sortedTags);
    }
    setLoadingTags(false);
  };

  const handleRenameTag = async () => {
    if (!selectedTag || !newTagName.trim()) return;
    if (newTagName.trim() === selectedTag) {
      setTagMessage({ type: 'error', text: 'New name must be different' });
      return;
    }

    setTagProcessing(true);
    try {
      const res = await contacts.getAll();
      if (res.success && res.data) {
        const contactsWithTag = res.data.filter(c => c.tags?.includes(selectedTag!));
        for (const contact of contactsWithTag) {
          const newTags = contact.tags.map(t => t === selectedTag ? newTagName.trim() : t);
          await contacts.update(contact.id, { tags: newTags });
        }
        setTagMessage({ type: 'success', text: `Renamed "${selectedTag}" to "${newTagName.trim()}" on ${contactsWithTag.length} contacts` });
        loadTags();
        setSelectedTag(null);
        setTagAction(null);
        setNewTagName('');
      }
    } catch (err) {
      setTagMessage({ type: 'error', text: 'Failed to rename tag' });
    }
    setTagProcessing(false);
    setTimeout(() => setTagMessage(null), 5000);
  };

  const handleMergeTags = async () => {
    if (!selectedTag || !mergeTargetTag) return;
    if (mergeTargetTag === selectedTag) {
      setTagMessage({ type: 'error', text: 'Cannot merge a tag with itself' });
      return;
    }

    setTagProcessing(true);
    try {
      const res = await contacts.getAll();
      if (res.success && res.data) {
        const contactsWithSourceTag = res.data.filter(c => c.tags?.includes(selectedTag!));
        let updatedCount = 0;
        for (const contact of contactsWithSourceTag) {
          const newTags = contact.tags.filter(t => t !== selectedTag);
          if (!newTags.includes(mergeTargetTag)) {
            newTags.push(mergeTargetTag);
          }
          await contacts.update(contact.id, { tags: newTags });
          updatedCount++;
        }
        setTagMessage({ type: 'success', text: `Merged "${selectedTag}" into "${mergeTargetTag}" on ${updatedCount} contacts` });
        loadTags();
        setSelectedTag(null);
        setTagAction(null);
        setMergeTargetTag('');
      }
    } catch (err) {
      setTagMessage({ type: 'error', text: 'Failed to merge tags' });
    }
    setTagProcessing(false);
    setTimeout(() => setTagMessage(null), 5000);
  };

  const handleDeleteTag = async () => {
    if (!selectedTag) return;

    setTagProcessing(true);
    try {
      const res = await contacts.getAll();
      if (res.success && res.data) {
        const contactsWithTag = res.data.filter(c => c.tags?.includes(selectedTag!));
        for (const contact of contactsWithTag) {
          const newTags = contact.tags.filter(t => t !== selectedTag);
          await contacts.update(contact.id, { tags: newTags });
        }
        setTagMessage({ type: 'success', text: `Removed "${selectedTag}" from ${contactsWithTag.length} contacts` });
        loadTags();
        setSelectedTag(null);
        setTagAction(null);
      }
    } catch (err) {
      setTagMessage({ type: 'error', text: 'Failed to delete tag' });
    }
    setTagProcessing(false);
    setTimeout(() => setTagMessage(null), 5000);
  };

  const handleExport = async () => {
    // Collect all data from localStorage and API
    const contactRes = await contacts.getAll();
    const intRes = await interactions.list(1, 1000);

    const backup = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      contacts: contactRes.success && contactRes.data ? contactRes.data : [],
      interactions: intRes.success && intRes.data ? intRes.data.items || [] : [],
      events: JSON.parse(localStorage.getItem('obani_events') || '[]'),
      ideas: JSON.parse(localStorage.getItem('obani_ideas') || '[]'),
      notes: JSON.parse(localStorage.getItem('obani_notes') || '[]'),
      groups: JSON.parse(localStorage.getItem('obani_groups') || '[]'),
      equityActions: JSON.parse(localStorage.getItem('obani_equity_actions') || '[]'),
      content: JSON.parse(localStorage.getItem('obani_content') || '[]'),
      filterPresets: JSON.parse(localStorage.getItem('obani_filter_presets') || '[]'),
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `obani-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportClick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) handleImport(file);
    };
    input.click();
  };

  const handleImport = async (file: File) => {
    setImporting(true);
    setImportError('');
    setImportSuccess(false);

    try {
      const text = await file.text();
      const backup = JSON.parse(text);

      if (!backup.version || !backup.exportedAt) {
        throw new Error('Invalid backup file format');
      }

      // Restore localStorage data
      if (backup.events) localStorage.setItem('obani_events', JSON.stringify(backup.events));
      if (backup.ideas) localStorage.setItem('obani_ideas', JSON.stringify(backup.ideas));
      if (backup.notes) localStorage.setItem('obani_notes', JSON.stringify(backup.notes));
      if (backup.groups) localStorage.setItem('obani_groups', JSON.stringify(backup.groups));
      if (backup.equityActions) localStorage.setItem('obani_equity_actions', JSON.stringify(backup.equityActions));
      if (backup.content) localStorage.setItem('obani_content', JSON.stringify(backup.content));
      if (backup.filterPresets) localStorage.setItem('obani_filter_presets', JSON.stringify(backup.filterPresets));

      setImportSuccess(true);
      setTimeout(() => setImportSuccess(false), 5000);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Failed to import backup');
    }
    setImporting(false);
  };

  const clearLocalData = () => {
    if (confirm('Are you sure you want to clear all local data? This will remove events, ideas, notes, groups, and other locally stored data. Contact and interaction data stored on the server will not be affected.')) {
      localStorage.removeItem('obani_events');
      localStorage.removeItem('obani_ideas');
      localStorage.removeItem('obani_notes');
      localStorage.removeItem('obani_groups');
      localStorage.removeItem('obani_equity_actions');
      localStorage.removeItem('obani_content');
      localStorage.removeItem('obani_filter_presets');
      alert('Local data cleared. Refresh the page to see changes.');
    }
  };

  const generatePdfReport = async () => {
    setGeneratingPdf(true);
    try {
      // Fetch data
      const contactRes = await contacts.getAll();
      const intRes = await interactions.list(1, 1000);
      const introRes = await introductions.list(undefined, 1, 100);

      const allContacts: Contact[] = contactRes.success && contactRes.data ? contactRes.data : [];
      const allInteractions: Interaction[] = intRes.success && intRes.data ? intRes.data.items || [] : [];
      const allIntros: Introduction[] = introRes.success && introRes.data ? introRes.data.items || [] : [];
      const equityActions: EquityAction[] = JSON.parse(localStorage.getItem('obani_equity_actions') || '[]');

      // Calculate metrics
      const activeContacts = allContacts.filter(c => !c.isArchived);
      const avgStrength = activeContacts.length > 0
        ? (activeContacts.reduce((sum, c) => sum + c.relationshipStrength, 0) / activeContacts.length).toFixed(1)
        : '0';

      // Strength distribution
      const strengthDist = [0, 0, 0, 0, 0];
      activeContacts.forEach(c => {
        const s = Math.min(5, Math.max(1, c.relationshipStrength || 1));
        strengthDist[s - 1]++;
      });

      // Sector distribution
      const sectorCounts: Record<string, number> = {};
      activeContacts.forEach(c => {
        (c.sectors || []).forEach(s => {
          sectorCounts[s] = (sectorCounts[s] || 0) + 1;
        });
      });
      const topSectors = Object.entries(sectorCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

      // Equity metrics
      const contactEquities = activeContacts.map(c => {
        const score = equityActions.filter(a => a.contactId === c.id).reduce((sum, a) => sum + a.points, 0);
        return { contact: c, score };
      });
      const avgEquity = contactEquities.length > 0
        ? (contactEquities.reduce((sum, ce) => sum + ce.score, 0) / contactEquities.length).toFixed(1)
        : '0';
      const topRelationships = contactEquities.sort((a, b) => b.score - a.score).slice(0, 10);

      // Intro stats
      const introsMade = allIntros.filter(i => i.status === 'MADE' || i.status === 'COMPLETED').length;
      const introsSuccessful = allIntros.filter(i => i.status === 'COMPLETED').length;
      const successRate = introsMade > 0 ? Math.round((introsSuccessful / introsMade) * 100) : 0;

      // Monthly interaction trend (last 6 months)
      const monthlyTrend: { month: string; count: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const monthStr = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
        const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        const count = allInteractions.filter(int => {
          const intDate = new Date(int.date);
          return intDate >= monthStart && intDate <= monthEnd;
        }).length;
        monthlyTrend.push({ month: monthStr, count });
      }

      // Generate HTML for PDF
      const reportHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; background: white;">
          <div style="text-align: center; margin-bottom: 40px;">
            <h1 style="color: #6366F1; margin: 0; font-size: 28px;">Network Analytics Report</h1>
            <p style="color: #6B7280; margin: 8px 0 0;">Generated on ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>

          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 32px;">
            <div style="background: #F3F4F6; padding: 20px; border-radius: 12px; text-align: center;">
              <div style="font-size: 32px; font-weight: 700; color: #6366F1;">${activeContacts.length}</div>
              <div style="font-size: 12px; color: #6B7280; text-transform: uppercase;">Total Contacts</div>
            </div>
            <div style="background: #F3F4F6; padding: 20px; border-radius: 12px; text-align: center;">
              <div style="font-size: 32px; font-weight: 700; color: #6366F1;">${avgStrength}</div>
              <div style="font-size: 12px; color: #6B7280; text-transform: uppercase;">Avg Strength</div>
            </div>
            <div style="background: #F3F4F6; padding: 20px; border-radius: 12px; text-align: center;">
              <div style="font-size: 32px; font-weight: 700; color: #6366F1;">${allInteractions.length}</div>
              <div style="font-size: 12px; color: #6B7280; text-transform: uppercase;">Interactions</div>
            </div>
            <div style="background: #F3F4F6; padding: 20px; border-radius: 12px; text-align: center;">
              <div style="font-size: 32px; font-weight: 700; color: #6366F1;">${avgEquity}</div>
              <div style="font-size: 12px; color: #6B7280; text-transform: uppercase;">Avg Equity</div>
            </div>
          </div>

          <div style="margin-bottom: 32px;">
            <h2 style="font-size: 18px; color: #111827; margin-bottom: 16px;">Relationship Strength Distribution</h2>
            <div style="display: flex; gap: 8px; align-items: flex-end; height: 100px;">
              ${strengthDist.map((count, i) => `
                <div style="flex: 1; text-align: center;">
                  <div style="background: ${['#EF4444', '#F97316', '#EAB308', '#84CC16', '#22C55E'][i]}; height: ${Math.max(10, (count / Math.max(...strengthDist, 1)) * 80)}px; border-radius: 4px 4px 0 0;"></div>
                  <div style="font-size: 11px; color: #6B7280; margin-top: 4px;">★${i + 1}</div>
                  <div style="font-size: 12px; font-weight: 600;">${count}</div>
                </div>
              `).join('')}
            </div>
          </div>

          <div style="margin-bottom: 32px;">
            <h2 style="font-size: 18px; color: #111827; margin-bottom: 16px;">Monthly Interaction Trend</h2>
            <div style="display: flex; gap: 8px; align-items: flex-end; height: 100px;">
              ${monthlyTrend.map(({ month, count }) => `
                <div style="flex: 1; text-align: center;">
                  <div style="background: linear-gradient(180deg, #6366F1 0%, #8B5CF6 100%); height: ${Math.max(10, (count / Math.max(...monthlyTrend.map(m => m.count), 1)) * 80)}px; border-radius: 4px 4px 0 0;"></div>
                  <div style="font-size: 10px; color: #6B7280; margin-top: 4px;">${month}</div>
                  <div style="font-size: 12px; font-weight: 600;">${count}</div>
                </div>
              `).join('')}
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 32px;">
            <div>
              <h2 style="font-size: 18px; color: #111827; margin-bottom: 16px;">Top Sectors</h2>
              ${topSectors.length > 0 ? topSectors.map(([sector, count]) => `
                <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #E5E7EB;">
                  <span style="color: #374151;">${sector}</span>
                  <span style="font-weight: 600; color: #6366F1;">${count}</span>
                </div>
              `).join('') : '<p style="color: #9CA3AF;">No sectors recorded</p>'}
            </div>
            <div>
              <h2 style="font-size: 18px; color: #111827; margin-bottom: 16px;">Introduction Stats</h2>
              <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #E5E7EB;">
                <span style="color: #374151;">Intros Made</span>
                <span style="font-weight: 600;">${introsMade}</span>
              </div>
              <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #E5E7EB;">
                <span style="color: #374151;">Successful</span>
                <span style="font-weight: 600; color: #22C55E;">${introsSuccessful}</span>
              </div>
              <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #E5E7EB;">
                <span style="color: #374151;">Success Rate</span>
                <span style="font-weight: 600; color: #6366F1;">${successRate}%</span>
              </div>
            </div>
          </div>

          <div style="margin-bottom: 32px;">
            <h2 style="font-size: 18px; color: #111827; margin-bottom: 16px;">Top 10 Relationships by Equity</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="background: #F3F4F6;">
                  <th style="padding: 12px; text-align: left; font-size: 12px; color: #6B7280;">#</th>
                  <th style="padding: 12px; text-align: left; font-size: 12px; color: #6B7280;">Name</th>
                  <th style="padding: 12px; text-align: left; font-size: 12px; color: #6B7280;">Company</th>
                  <th style="padding: 12px; text-align: center; font-size: 12px; color: #6B7280;">Strength</th>
                  <th style="padding: 12px; text-align: center; font-size: 12px; color: #6B7280;">Equity</th>
                </tr>
              </thead>
              <tbody>
                ${topRelationships.map(({ contact, score }, i) => `
                  <tr style="border-bottom: 1px solid #E5E7EB;">
                    <td style="padding: 12px; color: #9CA3AF;">${i + 1}</td>
                    <td style="padding: 12px; font-weight: 500;">${contact.firstName} ${contact.lastName || ''}</td>
                    <td style="padding: 12px; color: #6B7280;">${contact.company || '-'}</td>
                    <td style="padding: 12px; text-align: center;">${'★'.repeat(contact.relationshipStrength)}${'☆'.repeat(5 - contact.relationshipStrength)}</td>
                    <td style="padding: 12px; text-align: center; font-weight: 600; color: ${score >= 0 ? '#22C55E' : '#EF4444'};">${score > 0 ? '+' : ''}${score}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

          <div style="text-align: center; padding-top: 24px; border-top: 1px solid #E5E7EB; color: #9CA3AF; font-size: 12px;">
            Generated by Obani Personal CRM
          </div>
        </div>
      `;

      // Create a temporary container
      const container = document.createElement('div');
      container.innerHTML = reportHtml;
      container.style.position = 'absolute';
      container.style.left = '-9999px';
      container.style.width = '800px';
      document.body.appendChild(container);

      // Use html2canvas to capture
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff'
      });

      document.body.removeChild(container);

      // Convert to PDF-like image download (simpler than full PDF lib)
      const link = document.createElement('a');
      link.download = `obani-analytics-report-${new Date().toISOString().split('T')[0]}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();

    } catch (err) {
      console.error('PDF generation failed:', err);
      alert('Failed to generate report. Please try again.');
    }
    setGeneratingPdf(false);
  };

  return (
    <div className="settings-page">
      <div className="page-header">
        <h1>Settings</h1>
      </div>

      {/* Backup & Restore Section */}
      <div className="settings-section">
        <div className="section-header-simple">
          <h2>Backup & Restore</h2>
          <p>Export your data to a backup file or restore from a previous backup</p>
        </div>

        {importSuccess && (
          <div className="alert success">
            Data imported successfully! Refresh the page to see your restored data.
          </div>
        )}

        {importError && (
          <div className="alert error">
            {importError}
          </div>
        )}

        <div className="settings-cards">
          <div className="settings-card">
            <div className="card-icon">📤</div>
            <h3>Export Data</h3>
            <p>Download all your data including events, ideas, notes, groups, and more as a JSON file.</p>
            <button className="btn primary" onClick={handleExport}>
              Export Backup
            </button>
          </div>

          <div className="settings-card">
            <div className="card-icon">📥</div>
            <h3>Import Data</h3>
            <p>Restore data from a previously exported backup file.</p>
            <button className="btn secondary" onClick={handleImportClick} disabled={importing}>
              {importing ? 'Importing...' : 'Import Backup'}
            </button>
          </div>

          <div className="settings-card">
            <div className="card-icon">📊</div>
            <h3>Analytics Report</h3>
            <p>Generate a visual report with charts showing your network health, trends, and top relationships.</p>
            <button className="btn primary" onClick={generatePdfReport} disabled={generatingPdf}>
              {generatingPdf ? 'Generating...' : 'Generate Report'}
            </button>
          </div>
        </div>
      </div>

      {/* Data Management Section */}
      <div className="settings-section">
        <div className="section-header-simple">
          <h2>Data Management</h2>
          <p>Manage your locally stored data</p>
        </div>

        <div className="settings-cards">
          <div className="settings-card warning">
            <div className="card-icon">🗑️</div>
            <h3>Clear Local Data</h3>
            <p>Remove all locally stored data (events, ideas, notes, groups). Server data is not affected.</p>
            <button className="btn danger" onClick={clearLocalData}>
              Clear Local Data
            </button>
          </div>
        </div>
      </div>

      {/* Tag Management Section */}
      <div className="settings-section">
        <div className="section-header-simple">
          <h2>Tag Management</h2>
          <p>Rename, merge, or delete tags across all your contacts</p>
        </div>

        {tagMessage && (
          <div className={`alert ${tagMessage.type}`}>
            {tagMessage.text}
          </div>
        )}

        <div className="tag-management-content">
          {loadingTags ? (
            <p className="loading-text">Loading tags...</p>
          ) : allTags.length === 0 ? (
            <p className="empty-text">No tags found. Add tags to your contacts to see them here.</p>
          ) : (
            <>
              <div className="tag-list">
                <h3>All Tags ({allTags.length})</h3>
                <div className="tag-chips-grid">
                  {allTags.map(({ tag, count }) => (
                    <button
                      key={tag}
                      className={`tag-chip-btn ${selectedTag === tag ? 'selected' : ''}`}
                      onClick={() => {
                        setSelectedTag(selectedTag === tag ? null : tag);
                        setTagAction(null);
                        setNewTagName('');
                        setMergeTargetTag('');
                      }}
                    >
                      <span className="tag-name">{tag}</span>
                      <span className="tag-count">{count}</span>
                    </button>
                  ))}
                </div>
              </div>

              {selectedTag && (
                <div className="tag-actions-panel">
                  <h4>Selected: <span className="selected-tag-name">{selectedTag}</span></h4>

                  <div className="tag-action-buttons">
                    <button
                      className={`tag-action-btn ${tagAction === 'rename' ? 'active' : ''}`}
                      onClick={() => { setTagAction('rename'); setNewTagName(selectedTag); }}
                    >
                      ✏️ Rename
                    </button>
                    <button
                      className={`tag-action-btn ${tagAction === 'merge' ? 'active' : ''}`}
                      onClick={() => setTagAction('merge')}
                    >
                      🔗 Merge Into
                    </button>
                    <button
                      className={`tag-action-btn danger ${tagAction === 'delete' ? 'active' : ''}`}
                      onClick={() => setTagAction('delete')}
                    >
                      🗑️ Delete
                    </button>
                  </div>

                  {tagAction === 'rename' && (
                    <div className="tag-action-form">
                      <label>New Tag Name:</label>
                      <input
                        type="text"
                        value={newTagName}
                        onChange={(e) => setNewTagName(e.target.value)}
                        placeholder="Enter new name"
                      />
                      <div className="form-actions">
                        <button className="btn secondary" onClick={() => setTagAction(null)}>
                          Cancel
                        </button>
                        <button
                          className="btn primary"
                          onClick={handleRenameTag}
                          disabled={tagProcessing || !newTagName.trim()}
                        >
                          {tagProcessing ? 'Renaming...' : 'Rename Tag'}
                        </button>
                      </div>
                    </div>
                  )}

                  {tagAction === 'merge' && (
                    <div className="tag-action-form">
                      <label>Merge "{selectedTag}" into:</label>
                      <select
                        value={mergeTargetTag}
                        onChange={(e) => setMergeTargetTag(e.target.value)}
                      >
                        <option value="">Select target tag...</option>
                        {allTags.filter(t => t.tag !== selectedTag).map(({ tag }) => (
                          <option key={tag} value={tag}>{tag}</option>
                        ))}
                      </select>
                      <small className="form-hint">
                        "{selectedTag}" will be removed and all contacts with it will receive the target tag instead.
                      </small>
                      <div className="form-actions">
                        <button className="btn secondary" onClick={() => setTagAction(null)}>
                          Cancel
                        </button>
                        <button
                          className="btn primary"
                          onClick={handleMergeTags}
                          disabled={tagProcessing || !mergeTargetTag}
                        >
                          {tagProcessing ? 'Merging...' : 'Merge Tags'}
                        </button>
                      </div>
                    </div>
                  )}

                  {tagAction === 'delete' && (
                    <div className="tag-action-form delete-confirm">
                      <p className="warning-text">
                        Are you sure you want to delete "{selectedTag}"? This will remove it from{' '}
                        <strong>{allTags.find(t => t.tag === selectedTag)?.count || 0}</strong> contacts.
                      </p>
                      <div className="form-actions">
                        <button className="btn secondary" onClick={() => setTagAction(null)}>
                          Cancel
                        </button>
                        <button
                          className="btn danger"
                          onClick={handleDeleteTag}
                          disabled={tagProcessing}
                        >
                          {tagProcessing ? 'Deleting...' : 'Yes, Delete Tag'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* About Section */}
      <div className="settings-section">
        <div className="section-header-simple">
          <h2>About Obani</h2>
        </div>
        <div className="about-info">
          <p><strong>Version:</strong> 1.0.0</p>
          <p><strong>Purpose:</strong> Personal CRM for managing your professional network</p>
          <p>Obani helps you maintain meaningful relationships by tracking interactions, scheduling follow-ups, and providing insights into your network health.</p>
        </div>
      </div>
    </div>
  );
}

// Events Page
function EventsPage() {
  const [events, setEvents] = useState<NetworkEvent[]>([]);
  const [contactList, setContactList] = useState<Contact[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<NetworkEvent | null>(null);
  const [filterType, setFilterType] = useState<EventType | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'upcoming' | 'past' | 'all'>('all');

  useEffect(() => {
    const stored = localStorage.getItem('obani_events');
    if (stored) {
      setEvents(JSON.parse(stored));
    }
    loadContacts();
  }, []);

  const loadContacts = async () => {
    const res = await contacts.list(1, 500);
    if (res.success && res.data) {
      setContactList(res.data.items || []);
    }
  };

  const saveEvents = (newEvents: NetworkEvent[]) => {
    setEvents(newEvents);
    localStorage.setItem('obani_events', JSON.stringify(newEvents));
  };

  const handleSaveEvent = (data: Partial<NetworkEvent>) => {
    if (editingEvent) {
      const updated = events.map(e =>
        e.id === editingEvent.id
          ? { ...e, ...data, updatedAt: new Date().toISOString() }
          : e
      );
      saveEvents(updated);
    } else {
      const newEvent: NetworkEvent = {
        id: crypto.randomUUID(),
        name: data.name || 'Untitled Event',
        eventType: data.eventType || 'OTHER',
        date: data.date || new Date().toISOString().split('T')[0],
        endDate: data.endDate,
        location: data.location,
        description: data.description,
        url: data.url,
        contactIds: data.contactIds || [],
        tags: data.tags || [],
        notes: data.notes,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      saveEvents([newEvent, ...events]);
    }
    setShowModal(false);
    setEditingEvent(null);
  };

  const handleDeleteEvent = (eventId: string) => {
    if (confirm('Delete this event?')) {
      saveEvents(events.filter(e => e.id !== eventId));
    }
  };

  const getContactName = (contactId: string) => {
    const contact = contactList.find(c => c.id === contactId);
    return contact ? `${contact.firstName} ${contact.lastName || ''}`.trim() : 'Unknown';
  };

  const getEventTypeIcon = (type: EventType) => {
    switch (type) {
      case 'CONFERENCE': return '🎤';
      case 'MEETUP': return '👥';
      case 'DINNER': return '🍽️';
      case 'WORKSHOP': return '🛠️';
      case 'WEBINAR': return '💻';
      case 'NETWORKING': return '🤝';
      default: return '📅';
    }
  };

  const today = new Date().toISOString().split('T')[0];

  const filteredEvents = events.filter(e => {
    if (filterType !== 'ALL' && e.eventType !== filterType) return false;
    if (viewMode === 'upcoming' && e.date < today) return false;
    if (viewMode === 'past' && e.date >= today) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!e.name.toLowerCase().includes(q) &&
          !e.location?.toLowerCase().includes(q) &&
          !e.tags.some(t => t.toLowerCase().includes(q))) {
        return false;
      }
    }
    return true;
  }).sort((a, b) => {
    // Sort upcoming by date asc, past by date desc
    if (viewMode === 'upcoming') {
      return a.date.localeCompare(b.date);
    }
    return b.date.localeCompare(a.date);
  });

  const stats = {
    total: events.length,
    upcoming: events.filter(e => e.date >= today).length,
    past: events.filter(e => e.date < today).length,
    totalContacts: [...new Set(events.flatMap(e => e.contactIds))].length,
  };

  return (
    <div className="events-page">
      <div className="page-header">
        <h1>Events</h1>
        <button className="btn primary" onClick={() => { setEditingEvent(null); setShowModal(true); }}>
          + Add Event
        </button>
      </div>

      <div className="events-stats">
        <div className="event-stat">
          <span className="stat-value">{stats.total}</span>
          <span className="stat-label">Total Events</span>
        </div>
        <div className="event-stat">
          <span className="stat-value">{stats.upcoming}</span>
          <span className="stat-label">Upcoming</span>
        </div>
        <div className="event-stat">
          <span className="stat-value">{stats.past}</span>
          <span className="stat-label">Past</span>
        </div>
        <div className="event-stat">
          <span className="stat-value">{stats.totalContacts}</span>
          <span className="stat-label">People Met</span>
        </div>
      </div>

      <div className="events-filters">
        <input
          type="text"
          className="search-input"
          placeholder="Search events..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <div className="filter-row">
          <div className="view-filters">
            {(['all', 'upcoming', 'past'] as const).map(view => (
              <button
                key={view}
                className={`view-filter-btn ${viewMode === view ? 'active' : ''}`}
                onClick={() => setViewMode(view)}
              >
                {view.charAt(0).toUpperCase() + view.slice(1)}
              </button>
            ))}
          </div>
          <div className="type-filters">
            {(['ALL', 'CONFERENCE', 'MEETUP', 'DINNER', 'NETWORKING', 'WORKSHOP', 'WEBINAR'] as const).map(type => (
              <button
                key={type}
                className={`type-filter-btn ${filterType === type ? 'active' : ''}`}
                onClick={() => setFilterType(type)}
              >
                {type === 'ALL' ? 'All' : getEventTypeIcon(type as EventType)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {filteredEvents.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📅</div>
          <h3>{searchQuery || viewMode !== 'all' ? 'No matching events' : 'No events yet'}</h3>
          <p>Track conferences, meetups, and dinners where you meet people.</p>
          <button className="btn primary" onClick={() => setShowModal(true)}>
            Add Your First Event
          </button>
        </div>
      ) : (
        <div className="events-list">
          {filteredEvents.map(event => {
            const isPast = event.date < today;
            return (
              <div key={event.id} className={`event-card ${isPast ? 'past' : ''}`}>
                <div className="event-date-badge">
                  <span className="event-month">
                    {new Date(event.date).toLocaleDateString('en-US', { month: 'short' })}
                  </span>
                  <span className="event-day">
                    {new Date(event.date).getDate()}
                  </span>
                </div>
                <div className="event-main">
                  <div className="event-header">
                    <span className="event-type-icon">{getEventTypeIcon(event.eventType)}</span>
                    <h3 className="event-name">{event.name}</h3>
                    {isPast && <span className="past-badge">Past</span>}
                  </div>
                  {event.location && (
                    <div className="event-location">📍 {event.location}</div>
                  )}
                  {event.contactIds.length > 0 && (
                    <div className="event-contacts">
                      <span className="contacts-label">Met:</span>
                      {event.contactIds.slice(0, 5).map(cId => (
                        <Link key={cId} to={`/contacts/${cId}`} className="contact-chip">
                          {getContactName(cId)}
                        </Link>
                      ))}
                      {event.contactIds.length > 5 && (
                        <span className="more-contacts">+{event.contactIds.length - 5} more</span>
                      )}
                    </div>
                  )}
                  {event.tags.length > 0 && (
                    <div className="event-tags">
                      {event.tags.map(tag => (
                        <span key={tag} className="tag">{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="event-actions">
                  <button className="btn-icon" onClick={() => { setEditingEvent(event); setShowModal(true); }}>
                    Edit
                  </button>
                  <button className="btn-icon delete" onClick={() => handleDeleteEvent(event.id)}>
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <EventModal
          event={editingEvent}
          contacts={contactList}
          onSave={handleSaveEvent}
          onClose={() => { setShowModal(false); setEditingEvent(null); }}
        />
      )}
    </div>
  );
}

// Event Modal
function EventModal({
  event,
  contacts: contactList,
  onSave,
  onClose,
}: {
  event: NetworkEvent | null;
  contacts: Contact[];
  onSave: (data: Partial<NetworkEvent>) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(event?.name || '');
  const [eventType, setEventType] = useState<EventType>(event?.eventType || 'CONFERENCE');
  const [date, setDate] = useState(event?.date || new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(event?.endDate || '');
  const [location, setLocation] = useState(event?.location || '');
  const [description, setDescription] = useState(event?.description || '');
  const [url, setUrl] = useState(event?.url || '');
  const [contactIds, setContactIds] = useState<string[]>(event?.contactIds || []);
  const [tags, setTags] = useState<string[]>(event?.tags || []);
  const [tagInput, setTagInput] = useState('');
  const [notes, setNotes] = useState(event?.notes || '');
  const [contactSearch, setContactSearch] = useState('');

  const filteredContacts = contactList.filter(c =>
    !contactIds.includes(c.id) &&
    (`${c.firstName} ${c.lastName || ''}`).toLowerCase().includes(contactSearch.toLowerCase())
  );

  const handleAddTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput('');
    }
  };

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      name,
      eventType,
      date,
      endDate: endDate || undefined,
      location: location || undefined,
      description: description || undefined,
      url: url || undefined,
      contactIds,
      tags,
      notes: notes || undefined,
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal event-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{event ? 'Edit Event' : 'Add Event'}</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="form-row">
            <div className="form-group flex-2">
              <label>Event Name *</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g., Web Summit 2024"
                autoFocus
              />
            </div>
            <div className="form-group">
              <label>Type</label>
              <select value={eventType} onChange={e => setEventType(e.target.value as EventType)}>
                <option value="CONFERENCE">🎤 Conference</option>
                <option value="MEETUP">👥 Meetup</option>
                <option value="DINNER">🍽️ Dinner</option>
                <option value="NETWORKING">🤝 Networking</option>
                <option value="WORKSHOP">🛠️ Workshop</option>
                <option value="WEBINAR">💻 Webinar</option>
                <option value="OTHER">📅 Other</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Start Date *</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className="form-group">
              <label>End Date</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>

          <div className="form-group">
            <label>Location</label>
            <input
              type="text"
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="e.g., London, UK or Virtual"
            />
          </div>

          <div className="form-group">
            <label>Event URL</label>
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>

          <div className="form-group">
            <label>Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Brief description of the event..."
              rows={2}
            />
          </div>

          <div className="form-group">
            <label>People Met at Event</label>
            <input
              type="text"
              value={contactSearch}
              onChange={e => setContactSearch(e.target.value)}
              placeholder="Search contacts to add..."
            />
            {contactSearch && filteredContacts.length > 0 && (
              <div className="contact-suggestions">
                {filteredContacts.slice(0, 5).map(c => (
                  <button
                    key={c.id}
                    className="contact-suggestion"
                    onClick={() => {
                      setContactIds([...contactIds, c.id]);
                      setContactSearch('');
                    }}
                  >
                    {c.firstName} {c.lastName || ''} {c.company && `(${c.company})`}
                  </button>
                ))}
              </div>
            )}
            {contactIds.length > 0 && (
              <div className="selected-contacts">
                {contactIds.map(cId => {
                  const contact = contactList.find(c => c.id === cId);
                  return (
                    <span key={cId} className="contact-chip selected">
                      {contact ? `${contact.firstName} ${contact.lastName || ''}` : 'Unknown'}
                      <button onClick={() => setContactIds(contactIds.filter(id => id !== cId))}>×</button>
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          <div className="form-group">
            <label>Tags</label>
            <div className="tag-input-row">
              <input
                type="text"
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                placeholder="Add tag..."
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddTag(); }}}
              />
              <button type="button" className="btn secondary" onClick={handleAddTag}>Add</button>
            </div>
            {tags.length > 0 && (
              <div className="tags-list">
                {tags.map(tag => (
                  <span key={tag} className="tag">
                    {tag}
                    <button onClick={() => setTags(tags.filter(t => t !== tag))}>×</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="form-group">
            <label>Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Key takeaways, highlights..."
              rows={3}
            />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn secondary" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={handleSave} disabled={!name.trim()}>
            {event ? 'Save Changes' : 'Create Event'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Groups Page
function GroupsPage() {
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [contactList, setContactList] = useState<Contact[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ContactGroup | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<ContactGroup | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    // Load contacts from API
    const contactRes = await contacts.getAll();
    if (contactRes.success && contactRes.data) {
      setContactList(contactRes.data);
    }

    // Load groups from localStorage
    const storedGroups = localStorage.getItem('obani_groups');
    if (storedGroups) {
      setGroups(JSON.parse(storedGroups));
    }
    setLoading(false);
  };

  const saveGroups = (updatedGroups: ContactGroup[]) => {
    setGroups(updatedGroups);
    localStorage.setItem('obani_groups', JSON.stringify(updatedGroups));
  };

  const handleSaveGroup = (data: Partial<ContactGroup>) => {
    const now = new Date().toISOString();
    if (editingGroup) {
      const updated = groups.map(g =>
        g.id === editingGroup.id
          ? { ...g, ...data, updatedAt: now }
          : g
      );
      saveGroups(updated);
    } else {
      const newGroup: ContactGroup = {
        id: crypto.randomUUID(),
        name: data.name || 'Untitled Group',
        description: data.description,
        color: data.color || '#6366F1',
        icon: data.icon || '👥',
        contactIds: data.contactIds || [],
        createdAt: now,
        updatedAt: now,
      };
      saveGroups([...groups, newGroup]);
    }
    setShowModal(false);
    setEditingGroup(null);
  };

  const handleDeleteGroup = (groupId: string) => {
    if (confirm('Delete this group? Contacts will not be deleted.')) {
      saveGroups(groups.filter(g => g.id !== groupId));
      if (selectedGroup?.id === groupId) {
        setSelectedGroup(null);
      }
    }
  };

  const toggleContactInGroup = (contactId: string) => {
    if (!selectedGroup) return;
    const updated = groups.map(g => {
      if (g.id === selectedGroup.id) {
        const newContactIds = g.contactIds.includes(contactId)
          ? g.contactIds.filter(id => id !== contactId)
          : [...g.contactIds, contactId];
        return { ...g, contactIds: newContactIds, updatedAt: new Date().toISOString() };
      }
      return g;
    });
    saveGroups(updated);
    setSelectedGroup(updated.find(g => g.id === selectedGroup.id) || null);
  };

  const getGroupContacts = (group: ContactGroup) => {
    return contactList.filter(c => group.contactIds.includes(c.id));
  };

  if (loading) {
    return <div className="page-loading">Loading groups...</div>;
  }

  return (
    <div className="groups-page">
      <div className="page-header">
        <h1>Contact Groups</h1>
        <button className="btn primary" onClick={() => { setEditingGroup(null); setShowModal(true); }}>
          + New Group
        </button>
      </div>

      <div className="groups-layout">
        {/* Groups List */}
        <div className="groups-sidebar">
          <h3>Your Groups</h3>
          {groups.length === 0 ? (
            <p className="no-groups">No groups yet. Create one to organize your contacts.</p>
          ) : (
            <div className="groups-list">
              {groups.map(group => (
                <div
                  key={group.id}
                  className={`group-item ${selectedGroup?.id === group.id ? 'active' : ''}`}
                  onClick={() => setSelectedGroup(group)}
                >
                  <span className="group-icon" style={{ background: group.color }}>{group.icon}</span>
                  <div className="group-info">
                    <span className="group-name">{group.name}</span>
                    <span className="group-count">{group.contactIds.length} contacts</span>
                  </div>
                  <div className="group-actions">
                    <button
                      className="action-btn"
                      onClick={(e) => { e.stopPropagation(); setEditingGroup(group); setShowModal(true); }}
                      title="Edit"
                    >✏️</button>
                    <button
                      className="action-btn"
                      onClick={(e) => { e.stopPropagation(); handleDeleteGroup(group.id); }}
                      title="Delete"
                    >🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Group Details */}
        <div className="group-details">
          {selectedGroup ? (
            <>
              <div className="group-header" style={{ borderColor: selectedGroup.color }}>
                <span className="group-icon large" style={{ background: selectedGroup.color }}>
                  {selectedGroup.icon}
                </span>
                <div>
                  <h2>{selectedGroup.name}</h2>
                  {selectedGroup.description && <p>{selectedGroup.description}</p>}
                </div>
              </div>

              <div className="group-contacts-section">
                <h3>Members ({selectedGroup.contactIds.length})</h3>
                <div className="group-contacts-grid">
                  {getGroupContacts(selectedGroup).map(contact => (
                    <div key={contact.id} className="group-contact-card">
                      <div className="contact-avatar">{contact.firstName[0]}</div>
                      <div className="contact-info">
                        <Link to={`/contacts/${contact.id}`} className="contact-name">
                          {contact.firstName} {contact.lastName || ''}
                        </Link>
                        <span className="contact-company">{contact.company || contact.email}</span>
                      </div>
                      <button
                        className="remove-btn"
                        onClick={() => toggleContactInGroup(contact.id)}
                        title="Remove from group"
                      >×</button>
                    </div>
                  ))}
                </div>

                <div className="add-contacts-section">
                  <h4>Add Contacts</h4>
                  <div className="available-contacts">
                    {contactList
                      .filter(c => !selectedGroup.contactIds.includes(c.id) && !c.isArchived)
                      .slice(0, 10)
                      .map(contact => (
                        <button
                          key={contact.id}
                          className="add-contact-btn"
                          onClick={() => toggleContactInGroup(contact.id)}
                        >
                          <span className="avatar">{contact.firstName[0]}</span>
                          <span>{contact.firstName} {contact.lastName || ''}</span>
                          <span className="add-icon">+</span>
                        </button>
                      ))}
                    {contactList.filter(c => !selectedGroup.contactIds.includes(c.id) && !c.isArchived).length > 10 && (
                      <p className="more-available">
                        +{contactList.filter(c => !selectedGroup.contactIds.includes(c.id) && !c.isArchived).length - 10} more available
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="no-group-selected">
              <div className="empty-icon">👥</div>
              <h3>Select a group</h3>
              <p>Choose a group from the sidebar to view and manage its members</p>
            </div>
          )}
        </div>
      </div>

      {/* Group Modal */}
      {showModal && (
        <GroupModal
          group={editingGroup}
          onSave={handleSaveGroup}
          onClose={() => { setShowModal(false); setEditingGroup(null); }}
        />
      )}
    </div>
  );
}

// Group Modal
function GroupModal({
  group,
  onSave,
  onClose,
}: {
  group: ContactGroup | null;
  onSave: (data: Partial<ContactGroup>) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(group?.name || '');
  const [description, setDescription] = useState(group?.description || '');
  const [color, setColor] = useState(group?.color || '#6366F1');
  const [icon, setIcon] = useState(group?.icon || '👥');

  const colors = ['#6366F1', '#8B5CF6', '#EC4899', '#EF4444', '#F59E0B', '#10B981', '#14B8A6', '#3B82F6', '#1A365D', '#2F4538'];
  const icons = ['👥', '💼', '🌟', '🎯', '💡', '🏢', '🌍', '🎓', '🤝', '💰', '🚀', '📊'];

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({ name, description: description || undefined, color, icon });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal group-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{group ? 'Edit Group' : 'New Group'}</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label>Group Name *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g., Advisory Board, NYC Contacts"
              autoFocus
            />
          </div>

          <div className="form-group">
            <label>Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What is this group for?"
              rows={2}
            />
          </div>

          <div className="form-group">
            <label>Icon</label>
            <div className="icon-picker">
              {icons.map(i => (
                <button
                  key={i}
                  type="button"
                  className={`icon-option ${icon === i ? 'selected' : ''}`}
                  onClick={() => setIcon(i)}
                >
                  {i}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>Color</label>
            <div className="color-picker">
              {colors.map(c => (
                <button
                  key={c}
                  type="button"
                  className={`color-option ${color === c ? 'selected' : ''}`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>

          <div className="group-preview">
            <span className="preview-label">Preview:</span>
            <div className="preview-group">
              <span className="group-icon" style={{ background: color }}>{icon}</span>
              <span>{name || 'Group Name'}</span>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn secondary" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={handleSave} disabled={!name.trim()}>
            {group ? 'Save Changes' : 'Create Group'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Content Modal
function ContentModal({
  content,
  contacts: contactList,
  onSave,
  onClose,
}: {
  content: ContentItem | null;
  contacts: Contact[];
  onSave: (data: Partial<ContentItem>) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(content?.title || '');
  const [url, setUrl] = useState(content?.url || '');
  const [contentType, setContentType] = useState<ContentType>(content?.contentType || 'ARTICLE');
  const [author, setAuthor] = useState(content?.author || '');
  const [publication, setPublication] = useState(content?.publication || '');
  const [publishedDate, setPublishedDate] = useState(content?.publishedDate || '');
  const [myNotes, setMyNotes] = useState(content?.myNotes || '');
  const [keyTakeaways, setKeyTakeaways] = useState<string[]>(content?.keyTakeaways || []);
  const [takeawayInput, setTakeawayInput] = useState('');
  const [tags, setTags] = useState<string[]>(content?.tags || []);
  const [tagInput, setTagInput] = useState('');
  const [relevantContactIds, setRelevantContactIds] = useState<string[]>(content?.relevantContactIds || []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({
      title: title.trim(),
      url: url.trim() || undefined,
      contentType,
      author: author.trim() || undefined,
      publication: publication.trim() || undefined,
      publishedDate: publishedDate || undefined,
      myNotes: myNotes.trim() || undefined,
      keyTakeaways,
      tags,
      relevantContactIds,
    });
  };

  const addTakeaway = () => {
    const takeaway = takeawayInput.trim();
    if (takeaway && !keyTakeaways.includes(takeaway)) {
      setKeyTakeaways([...keyTakeaways, takeaway]);
      setTakeawayInput('');
    }
  };

  const removeTakeaway = (t: string) => setKeyTakeaways(keyTakeaways.filter(x => x !== t));

  const addTag = () => {
    const tag = tagInput.trim();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => setTags(tags.filter(t => t !== tag));

  const toggleContact = (id: string) => {
    setRelevantContactIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content content-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{content ? 'Edit Content' : 'Add Content'}</h2>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Title *</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Article title, book name, podcast episode..."
              autoFocus
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Type</label>
              <select value={contentType} onChange={e => setContentType(e.target.value as ContentType)}>
                <option value="ARTICLE">📰 Article</option>
                <option value="PODCAST">🎧 Podcast</option>
                <option value="VIDEO">📹 Video</option>
                <option value="BOOK">📚 Book</option>
                <option value="REPORT">📊 Report</option>
                <option value="OTHER">📎 Other</option>
              </select>
            </div>
            <div className="form-group">
              <label>Published Date</label>
              <input
                type="date"
                value={publishedDate}
                onChange={e => setPublishedDate(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label>URL</label>
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Author</label>
              <input
                type="text"
                value={author}
                onChange={e => setAuthor(e.target.value)}
                placeholder="Author name"
              />
            </div>
            <div className="form-group">
              <label>Publication</label>
              <input
                type="text"
                value={publication}
                onChange={e => setPublication(e.target.value)}
                placeholder="TechCrunch, HBR, etc."
              />
            </div>
          </div>

          <div className="form-group">
            <label>My Notes</label>
            <textarea
              value={myNotes}
              onChange={e => setMyNotes(e.target.value)}
              placeholder="What stood out? Key insights, quotes..."
              rows={4}
            />
          </div>

          <div className="form-group">
            <label>Key Takeaways</label>
            <div className="tag-input-group">
              <input
                type="text"
                value={takeawayInput}
                onChange={e => setTakeawayInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTakeaway())}
                placeholder="Add a key point..."
              />
              <button type="button" onClick={addTakeaway}>Add</button>
            </div>
            {keyTakeaways.length > 0 && (
              <ul className="takeaways-list">
                {keyTakeaways.map((t, i) => (
                  <li key={i}>
                    <span>• {t}</span>
                    <button type="button" onClick={() => removeTakeaway(t)}>×</button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="form-group">
            <label>Tags</label>
            <div className="tag-input-group">
              <input
                type="text"
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag())}
                placeholder="Add tag..."
              />
              <button type="button" onClick={addTag}>Add</button>
            </div>
            {tags.length > 0 && (
              <div className="tags-list">
                {tags.map(tag => (
                  <span key={tag} className="tag-chip">
                    {tag}
                    <button type="button" onClick={() => removeTag(tag)}>×</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="form-group">
            <label>Relevant To (Contacts)</label>
            <p className="form-help">Who might find this content valuable?</p>
            <div className="contact-selector">
              {contactList.slice(0, 20).map(contact => (
                <label key={contact.id} className="contact-option">
                  <input
                    type="checkbox"
                    checked={relevantContactIds.includes(contact.id)}
                    onChange={() => toggleContact(contact.id)}
                  />
                  <span>{contact.firstName} {contact.lastName || ''}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={!title.trim()}>
              {content ? 'Save Changes' : 'Save Content'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Idea Pipeline Kanban Board
function IdeaPipelinePage() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [contactList, setContactList] = useState<Contact[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingIdea, setEditingIdea] = useState<Idea | null>(null);
  const [draggedIdea, setDraggedIdea] = useState<string | null>(null);

  const stages: { key: IdeaStage; label: string; color: string }[] = [
    { key: 'INCOMING', label: 'Incoming', color: '#6366f1' },
    { key: 'RESEARCHING', label: 'Researching', color: '#8b5cf6' },
    { key: 'IN_DISCUSSION', label: 'In Discussion', color: '#f59e0b' },
    { key: 'COMMITTED', label: 'Committed', color: '#10b981' },
    { key: 'COMPLETED', label: 'Completed', color: '#06b6d4' },
  ];

  useEffect(() => {
    const stored = localStorage.getItem('obani_ideas');
    if (stored) {
      setIdeas(JSON.parse(stored));
    }
    loadContacts();
  }, []);

  const loadContacts = async () => {
    const res = await contacts.getAll();
    if (res.success && res.data) {
      setContactList(res.data);
    }
  };

  const saveIdeas = (newIdeas: Idea[]) => {
    setIdeas(newIdeas);
    localStorage.setItem('obani_ideas', JSON.stringify(newIdeas));
  };

  const handleDragStart = (ideaId: string) => {
    setDraggedIdea(ideaId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (stage: IdeaStage) => {
    if (!draggedIdea) return;
    const newIdeas = ideas.map(idea =>
      idea.id === draggedIdea ? { ...idea, stage, updatedAt: new Date().toISOString() } : idea
    );
    saveIdeas(newIdeas);
    setDraggedIdea(null);
  };

  const handleCreateIdea = () => {
    setEditingIdea(null);
    setShowModal(true);
  };

  const handleEditIdea = (idea: Idea) => {
    setEditingIdea(idea);
    setShowModal(true);
  };

  const handleSaveIdea = (ideaData: Partial<Idea>) => {
    if (editingIdea) {
      const newIdeas = ideas.map(idea =>
        idea.id === editingIdea.id
          ? { ...idea, ...ideaData, updatedAt: new Date().toISOString() }
          : idea
      );
      saveIdeas(newIdeas);
    } else {
      const newIdea: Idea = {
        id: crypto.randomUUID(),
        title: ideaData.title || 'New Idea',
        description: ideaData.description,
        stage: ideaData.stage || 'INCOMING',
        contactIds: ideaData.contactIds || [],
        tags: ideaData.tags || [],
        priority: ideaData.priority || 'MEDIUM',
        dueDate: ideaData.dueDate,
        notes: ideaData.notes,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      saveIdeas([...ideas, newIdea]);
    }
    setShowModal(false);
    setEditingIdea(null);
  };

  const handleDeleteIdea = (ideaId: string) => {
    if (confirm('Delete this idea?')) {
      saveIdeas(ideas.filter(i => i.id !== ideaId));
    }
  };

  const handleArchiveIdea = (ideaId: string) => {
    const newIdeas = ideas.map(idea =>
      idea.id === ideaId ? { ...idea, stage: 'ARCHIVED' as IdeaStage, updatedAt: new Date().toISOString() } : idea
    );
    saveIdeas(newIdeas);
  };

  const getContactNames = (contactIds: string[]) => {
    return contactIds
      .map(id => {
        const contact = contactList.find(c => c.id === id);
        return contact ? `${contact.firstName} ${contact.lastName || ''}`.trim() : null;
      })
      .filter(Boolean)
      .join(', ');
  };

  const getIdeasByStage = (stage: IdeaStage) => ideas.filter(i => i.stage === stage);
  const archivedCount = ideas.filter(i => i.stage === 'ARCHIVED').length;

  return (
    <div className="idea-pipeline-page">
      <div className="page-header">
        <div>
          <h1>Idea Pipeline</h1>
          <p className="page-subtitle">Track opportunities and ideas through your workflow</p>
        </div>
        <button className="btn-primary" onClick={handleCreateIdea}>+ New Idea</button>
      </div>

      <div className="kanban-board">
        {stages.map(stage => (
          <div
            key={stage.key}
            className={`kanban-column ${draggedIdea ? 'drop-target' : ''}`}
            onDragOver={handleDragOver}
            onDrop={() => handleDrop(stage.key)}
          >
            <div className="column-header" style={{ borderTopColor: stage.color }}>
              <span className="column-title">{stage.label}</span>
              <span className="column-count">{getIdeasByStage(stage.key).length}</span>
            </div>
            <div className="column-content">
              {getIdeasByStage(stage.key).map(idea => (
                <div
                  key={idea.id}
                  className={`idea-card priority-${idea.priority.toLowerCase()} ${draggedIdea === idea.id ? 'dragging' : ''}`}
                  draggable
                  onDragStart={() => handleDragStart(idea.id)}
                  onClick={() => handleEditIdea(idea)}
                >
                  <div className="idea-header">
                    <span className={`priority-badge ${idea.priority.toLowerCase()}`}>
                      {idea.priority === 'HIGH' ? '🔴' : idea.priority === 'MEDIUM' ? '🟡' : '🟢'}
                    </span>
                    <div className="idea-actions">
                      {stage.key === 'COMPLETED' && (
                        <button
                          className="btn-icon"
                          onClick={(e) => { e.stopPropagation(); handleArchiveIdea(idea.id); }}
                          title="Archive"
                        >📦</button>
                      )}
                      <button
                        className="btn-icon"
                        onClick={(e) => { e.stopPropagation(); handleDeleteIdea(idea.id); }}
                        title="Delete"
                      >🗑️</button>
                    </div>
                  </div>
                  <h4 className="idea-title">{idea.title}</h4>
                  {idea.description && (
                    <p className="idea-description">{idea.description.slice(0, 80)}{idea.description.length > 80 ? '...' : ''}</p>
                  )}
                  {idea.contactIds.length > 0 && (
                    <div className="idea-contacts">
                      <span className="contact-icon">👥</span>
                      <span>{getContactNames(idea.contactIds)}</span>
                    </div>
                  )}
                  {idea.tags.length > 0 && (
                    <div className="idea-tags">
                      {idea.tags.slice(0, 3).map(tag => (
                        <span key={tag} className="idea-tag">{tag}</span>
                      ))}
                      {idea.tags.length > 3 && <span className="more-tags">+{idea.tags.length - 3}</span>}
                    </div>
                  )}
                  {idea.dueDate && (
                    <div className={`idea-due ${new Date(idea.dueDate) < new Date() ? 'overdue' : ''}`}>
                      📅 {new Date(idea.dueDate).toLocaleDateString()}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {archivedCount > 0 && (
        <div className="archived-section">
          <details>
            <summary>📦 Archived Ideas ({archivedCount})</summary>
            <div className="archived-list">
              {ideas.filter(i => i.stage === 'ARCHIVED').map(idea => (
                <div key={idea.id} className="archived-idea">
                  <span className="archived-title">{idea.title}</span>
                  <span className="archived-date">Completed {new Date(idea.updatedAt).toLocaleDateString()}</span>
                  <button className="btn-text" onClick={() => handleDeleteIdea(idea.id)}>Delete</button>
                </div>
              ))}
            </div>
          </details>
        </div>
      )}

      {showModal && (
        <IdeaModal
          idea={editingIdea}
          contacts={contactList}
          onSave={handleSaveIdea}
          onClose={() => { setShowModal(false); setEditingIdea(null); }}
        />
      )}
    </div>
  );
}

// Idea Modal Component
function IdeaModal({
  idea,
  contacts: contactList,
  onSave,
  onClose,
}: {
  idea: Idea | null;
  contacts: Contact[];
  onSave: (data: Partial<Idea>) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(idea?.title || '');
  const [description, setDescription] = useState(idea?.description || '');
  const [stage, setStage] = useState<IdeaStage>(idea?.stage || 'INCOMING');
  const [priority, setPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH'>(idea?.priority || 'MEDIUM');
  const [selectedContacts, setSelectedContacts] = useState<string[]>(idea?.contactIds || []);
  const [tags, setTags] = useState<string[]>(idea?.tags || []);
  const [tagInput, setTagInput] = useState('');
  const [dueDate, setDueDate] = useState(idea?.dueDate || '');
  const [notes, setNotes] = useState(idea?.notes || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({
      title: title.trim(),
      description: description.trim() || undefined,
      stage,
      priority,
      contactIds: selectedContacts,
      tags,
      dueDate: dueDate || undefined,
      notes: notes.trim() || undefined,
    });
  };

  const addTag = () => {
    const tag = tagInput.trim();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag));
  };

  const toggleContact = (contactId: string) => {
    setSelectedContacts(prev =>
      prev.includes(contactId)
        ? prev.filter(id => id !== contactId)
        : [...prev, contactId]
    );
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content idea-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{idea ? 'Edit Idea' : 'New Idea'}</h2>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Title *</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="What's the idea?"
              autoFocus
            />
          </div>

          <div className="form-group">
            <VoiceTextArea
              label="Description"
              value={description}
              onChange={setDescription}
              placeholder="Add details about this opportunity... Tap mic to speak"
              rows={3}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Stage</label>
              <select value={stage} onChange={e => setStage(e.target.value as IdeaStage)}>
                <option value="INCOMING">Incoming</option>
                <option value="RESEARCHING">Researching</option>
                <option value="IN_DISCUSSION">In Discussion</option>
                <option value="COMMITTED">Committed</option>
                <option value="COMPLETED">Completed</option>
              </select>
            </div>
            <div className="form-group">
              <label>Priority</label>
              <select value={priority} onChange={e => setPriority(e.target.value as 'LOW' | 'MEDIUM' | 'HIGH')}>
                <option value="LOW">🟢 Low</option>
                <option value="MEDIUM">🟡 Medium</option>
                <option value="HIGH">🔴 High</option>
              </select>
            </div>
            <div className="form-group">
              <label>Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label>Tags</label>
            <div className="tag-input-group">
              <input
                type="text"
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag())}
                placeholder="Add tag..."
              />
              <button type="button" onClick={addTag}>Add</button>
            </div>
            {tags.length > 0 && (
              <div className="tags-list">
                {tags.map(tag => (
                  <span key={tag} className="tag-chip">
                    {tag}
                    <button type="button" onClick={() => removeTag(tag)}>×</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="form-group">
            <label>Related Contacts</label>
            <div className="contact-selector">
              {contactList.slice(0, 20).map(contact => (
                <label key={contact.id} className="contact-option">
                  <input
                    type="checkbox"
                    checked={selectedContacts.includes(contact.id)}
                    onChange={() => toggleContact(contact.id)}
                  />
                  <span>{contact.firstName} {contact.lastName || ''}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="form-group">
            <VoiceTextArea
              label="Notes"
              value={notes}
              onChange={setNotes}
              placeholder="Additional notes... Tap mic to speak"
              rows={2}
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={!title.trim()}>
              {idea ? 'Save Changes' : 'Create Idea'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Follow-Up Dashboard
function DashboardPage() {
  const [contactList, setContactList] = useState<Contact[]>([]);
  const [interactionList, setInteractionList] = useState<Interaction[]>([]);
  const [events, setEvents] = useState<NetworkEvent[]>([]);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [equityActions, setEquityActions] = useState<EquityAction[]>([]);
  const [recentlyViewedContacts, setRecentlyViewedContacts] = useState<{ contact: Contact; viewedAt: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [contactRes, intRes] = await Promise.all([
      contacts.getAll(),
      interactions.list(1, 200)
    ]);
    let allContacts: Contact[] = [];
    if (contactRes.success && contactRes.data) {
      allContacts = contactRes.data;
      setContactList(contactRes.data);
    }
    if (intRes.success && intRes.data) {
      setInteractionList(intRes.data.items || []);
    }

    // Load events from localStorage
    const storedEvents = localStorage.getItem('obani_events');
    if (storedEvents) {
      setEvents(JSON.parse(storedEvents));
    }

    // Load ideas from localStorage
    const storedIdeas = localStorage.getItem('obani_ideas');
    if (storedIdeas) {
      setIdeas(JSON.parse(storedIdeas));
    }

    // Load equity actions from localStorage
    const storedEquity = localStorage.getItem('obani_equity_actions');
    if (storedEquity) {
      setEquityActions(JSON.parse(storedEquity));
    }

    // Load recently viewed contacts
    const recentlyViewed = getRecentlyViewed();
    const recentWithContacts = recentlyViewed
      .map(entry => {
        const contact = allContacts.find(c => c.id === entry.contactId);
        return contact ? { contact, viewedAt: entry.viewedAt } : null;
      })
      .filter((item): item is { contact: Contact; viewedAt: string } => item !== null)
      .slice(0, 5);
    setRecentlyViewedContacts(recentWithContacts);

    setLoading(false);
  };

  const getPendingActions = () => {
    const pending: { text: string; owner: string; dueDate?: string; contactId: string; contactName: string }[] = [];
    interactionList.forEach(int => {
      if (int.actionItems) {
        const contact = contactList.find(c => c.id === int.contactId);
        int.actionItems.forEach(action => {
          if (!action.completed) {
            pending.push({
              text: action.text,
              owner: action.owner,
              dueDate: action.dueDate,
              contactId: int.contactId,
              contactName: contact ? `${contact.firstName} ${contact.lastName || ''}` : 'Unknown'
            });
          }
        });
      }
    });
    // Sort by due date (items with due dates first, then by date)
    pending.sort((a, b) => {
      if (a.dueDate && !b.dueDate) return -1;
      if (!a.dueDate && b.dueDate) return 1;
      if (a.dueDate && b.dueDate) return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      return 0;
    });
    return pending;
  };

  const getScheduledReminders = () => {
    return contactList
      .filter(c => c.nextFollowUpAt)
      .map(c => ({
        contact: c,
        date: new Date(c.nextFollowUpAt!),
        isOverdue: new Date(c.nextFollowUpAt!) < new Date()
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  };

  const getDaysSinceContact = (contact: Contact): number => {
    if (!contact.lastContactedAt) return 999;
    const lastContact = new Date(contact.lastContactedAt);
    const now = new Date();
    return Math.floor((now.getTime() - lastContact.getTime()) / (1000 * 60 * 60 * 24));
  };

  const getFollowUpThreshold = (strength: number): number => {
    if (strength >= 5) return 45;
    if (strength >= 4) return 60;
    if (strength >= 3) return 75;
    return 90;
  };

  const categorizeContacts = () => {
    const urgent: Contact[] = [];
    const dueSoon: Contact[] = [];
    const onTrack: Contact[] = [];

    contactList.forEach(contact => {
      if (contact.isArchived) return;
      const days = getDaysSinceContact(contact);
      const threshold = getFollowUpThreshold(contact.relationshipStrength);

      if (days >= 90 || (days >= threshold + 30)) {
        urgent.push(contact);
      } else if (days >= threshold) {
        dueSoon.push(contact);
      } else {
        onTrack.push(contact);
      }
    });

    // Sort by days since contact (most overdue first)
    urgent.sort((a, b) => getDaysSinceContact(b) - getDaysSinceContact(a));
    dueSoon.sort((a, b) => getDaysSinceContact(b) - getDaysSinceContact(a));

    return { urgent, dueSoon, onTrack };
  };

  // Get upcoming events (within next 30 days)
  const getUpcomingEvents = () => {
    const today = new Date();
    const thirtyDaysFromNow = new Date(today);
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    return events
      .filter(e => {
        const eventDate = new Date(e.date);
        return eventDate >= today && eventDate <= thirtyDaysFromNow;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 5);
  };

  // Get ideas in progress
  const getActiveIdeas = () => {
    return ideas
      .filter(i => i.stage === 'RESEARCHING' || i.stage === 'IN_DISCUSSION')
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 5);
  };

  // Get recent interactions
  const getRecentActivity = () => {
    return interactionList
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);
  };

  // Get upcoming birthdays (within next 30 days)
  const getUpcomingBirthdays = () => {
    const today = new Date();
    const currentYear = today.getFullYear();

    return contactList
      .filter(c => c.birthday && !c.isArchived)
      .map(c => {
        const birthday = new Date(c.birthday!);
        // Set birthday to current year
        let nextBirthday = new Date(currentYear, birthday.getMonth(), birthday.getDate());
        // If birthday already passed this year, use next year
        if (nextBirthday < today) {
          nextBirthday = new Date(currentYear + 1, birthday.getMonth(), birthday.getDate());
        }
        const daysUntil = Math.ceil((nextBirthday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        return { contact: c, nextBirthday, daysUntil };
      })
      .filter(b => b.daysUntil <= 30)
      .sort((a, b) => a.daysUntil - b.daysUntil)
      .slice(0, 5);
  };

  // Get network stats
  const getNetworkStats = () => {
    const activeContacts = contactList.filter(c => !c.isArchived);
    const totalInteractions = interactionList.length;
    const avgStrength = activeContacts.length > 0
      ? activeContacts.reduce((sum, c) => sum + c.relationshipStrength, 0) / activeContacts.length
      : 0;

    // Calculate contacts added this month
    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);
    const contactsThisMonth = contactList.filter(c => new Date(c.createdAt) >= thisMonth).length;

    // Calculate equity overview
    const getContactEquityScore = (contactId: string): number => {
      return equityActions
        .filter(a => a.contactId === contactId)
        .reduce((sum, a) => sum + a.points, 0);
    };

    const equityScores = activeContacts.map(c => getContactEquityScore(c.id));
    const healthyCount = equityScores.filter(s => s >= 3).length;
    const overdrawnCount = equityScores.filter(s => s < -1).length;

    return {
      totalContacts: activeContacts.length,
      totalInteractions,
      avgStrength: avgStrength.toFixed(1),
      contactsThisMonth,
      healthyEquity: healthyCount,
      overdrawnEquity: overdrawnCount
    };
  };

  // Get Network Insights
  const getNetworkInsights = () => {
    const activeContacts = contactList.filter(c => !c.isArchived);

    // Sector distribution
    const sectorCounts: Record<string, number> = {};
    activeContacts.forEach(c => {
      (c.sectors || []).forEach(s => {
        sectorCounts[s] = (sectorCounts[s] || 0) + 1;
      });
    });
    const topSectors = Object.entries(sectorCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    // Interaction frequency (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentInteractions = interactionList.filter(i => new Date(i.date) >= thirtyDaysAgo);
    const interactionsByType: Record<string, number> = {};
    recentInteractions.forEach(i => {
      interactionsByType[i.type] = (interactionsByType[i.type] || 0) + 1;
    });

    // Weekly trend (last 4 weeks)
    const weeklyTrend: number[] = [];
    for (let w = 3; w >= 0; w--) {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - (w + 1) * 7);
      const weekEnd = new Date();
      weekEnd.setDate(weekEnd.getDate() - w * 7);
      const count = interactionList.filter(i => {
        const d = new Date(i.date);
        return d >= weekStart && d < weekEnd;
      }).length;
      weeklyTrend.push(count);
    }

    // Relationship strength distribution
    const strengthDist = [0, 0, 0, 0, 0];
    activeContacts.forEach(c => {
      const s = Math.min(5, Math.max(1, c.relationshipStrength || 1));
      strengthDist[s - 1]++;
    });

    // Network diversity score (based on sectors, companies, locations)
    const uniqueSectors = new Set(activeContacts.flatMap(c => c.sectors || [])).size;
    const uniqueCompanies = new Set(activeContacts.map(c => c.company).filter(Boolean)).size;
    const uniqueLocations = new Set(activeContacts.map(c => c.location).filter(Boolean)).size;
    const diversityScore = Math.min(100, Math.round(
      (uniqueSectors * 5 + uniqueCompanies * 2 + uniqueLocations * 3) / Math.max(1, activeContacts.length) * 20
    ));

    // Engagement rate (contacts interacted with in last 30 days)
    const contactsWithRecentInteraction = new Set(recentInteractions.map(i => i.contactId)).size;
    const engagementRate = activeContacts.length > 0
      ? Math.round((contactsWithRecentInteraction / activeContacts.length) * 100)
      : 0;

    return {
      topSectors,
      interactionsByType,
      weeklyTrend,
      strengthDist,
      diversityScore,
      engagementRate,
      recentInteractionCount: recentInteractions.length
    };
  };

  // Get contact recommendations based on various signals
  const getRecommendations = () => {
    const recommendations: {
      contact: Contact;
      reason: string;
      reasonType: 'decay' | 'equity' | 'new' | 'strength';
      score: number;
    }[] = [];

    const getContactEquityScore = (contactId: string): number => {
      return equityActions
        .filter(a => a.contactId === contactId)
        .reduce((sum, a) => sum + a.points, 0);
    };

    // Get recently viewed contact IDs to exclude them
    const recentlyViewedIds = new Set(getRecentlyViewed().map(r => r.contactId));

    contactList.forEach(contact => {
      if (contact.isArchived) return;
      // Skip recently viewed contacts - user already engaged with them
      if (recentlyViewedIds.has(contact.id)) return;

      const strength = getEffectiveStrength(contact);
      const equity = getContactEquityScore(contact.id);
      const daysSince = getDaysSinceContact(contact);

      // High strength contacts with significant decay
      if (strength.decayed && strength.original >= 4 && (strength.original - strength.current) >= 2) {
        recommendations.push({
          contact,
          reason: `Relationship decaying (was ${strength.original}, now ${strength.current})`,
          reasonType: 'decay',
          score: (strength.original - strength.current) * 3 + daysSince / 10
        });
        return;
      }

      // Overdrawn equity - need to give back
      if (equity <= -3) {
        recommendations.push({
          contact,
          reason: `Equity overdrawn (${equity} points)`,
          reasonType: 'equity',
          score: Math.abs(equity) * 2
        });
        return;
      }

      // New contacts (< 30 days) that haven't been followed up
      const createdDaysAgo = Math.floor((Date.now() - new Date(contact.createdAt).getTime()) / (1000 * 60 * 60 * 24));
      if (createdDaysAgo <= 30 && createdDaysAgo >= 7 && daysSince >= 7) {
        recommendations.push({
          contact,
          reason: 'New contact - build momentum',
          reasonType: 'new',
          score: 5 + (7 - createdDaysAgo / 5)
        });
        return;
      }

      // High strength contacts that are due for follow-up
      if (contact.relationshipStrength >= 4 && daysSince >= 45) {
        recommendations.push({
          contact,
          reason: `Key relationship - ${daysSince} days since contact`,
          reasonType: 'strength',
          score: contact.relationshipStrength + daysSince / 15
        });
      }
    });

    // Sort by score and return top 5
    return recommendations
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  };

  if (loading) {
    return (
      <div className="dashboard-page">
        <div className="page-header">
          <div className="skeleton skeleton-title" style={{ width: '140px', height: '32px' }} />
        </div>
        <DashboardSkeleton />
      </div>
    );
  }

  const { urgent, dueSoon, onTrack } = categorizeContacts();
  const upcomingEvents = getUpcomingEvents();
  const activeIdeas = getActiveIdeas();
  const recentActivity = getRecentActivity();
  const networkStats = getNetworkStats();
  const upcomingBirthdays = getUpcomingBirthdays();
  const recommendations = getRecommendations();
  const networkInsights = getNetworkInsights();

  return (
    <div className="dashboard-page">
      <div className="page-header">
        <h1>Follow-Ups</h1>
        <p className="page-subtitle">Keep your relationships warm</p>
      </div>

      <div className="dashboard-summary">
        <div className="summary-stat urgent">
          <span className="summary-count">{urgent.length}</span>
          <span className="summary-label">Urgent</span>
        </div>
        <div className="summary-stat due-soon">
          <span className="summary-count">{dueSoon.length}</span>
          <span className="summary-label">Due Soon</span>
        </div>
        <div className="summary-stat on-track">
          <span className="summary-count">{onTrack.length}</span>
          <span className="summary-label">On Track</span>
        </div>
        <div className="summary-stat actions">
          <span className="summary-count">{getPendingActions().length}</span>
          <span className="summary-label">Actions</span>
        </div>
        <div className="summary-stat reminders">
          <span className="summary-count">{getScheduledReminders().length}</span>
          <span className="summary-label">Reminders</span>
        </div>
      </div>

      {/* Network Stats Bar */}
      <div className="network-stats-bar">
        <div className="network-stat">
          <span className="stat-icon">👥</span>
          <span className="stat-value">{networkStats.totalContacts}</span>
          <span className="stat-label">Contacts</span>
        </div>
        <div className="network-stat">
          <span className="stat-icon">💬</span>
          <span className="stat-value">{networkStats.totalInteractions}</span>
          <span className="stat-label">Interactions</span>
        </div>
        <div className="network-stat">
          <span className="stat-icon">❤️</span>
          <span className="stat-value">{networkStats.avgStrength}</span>
          <span className="stat-label">Avg Strength</span>
        </div>
        <div className="network-stat">
          <span className="stat-icon">📈</span>
          <span className="stat-value">+{networkStats.contactsThisMonth}</span>
          <span className="stat-label">This Month</span>
        </div>
        <div className="network-stat healthy">
          <span className="stat-icon">✅</span>
          <span className="stat-value">{networkStats.healthyEquity}</span>
          <span className="stat-label">Healthy Equity</span>
        </div>
        {networkStats.overdrawnEquity > 0 && (
          <div className="network-stat warning">
            <span className="stat-icon">⚠️</span>
            <span className="stat-value">{networkStats.overdrawnEquity}</span>
            <span className="stat-label">Overdrawn</span>
          </div>
        )}
      </div>

      {/* Dashboard Widgets Grid */}
      <div className="dashboard-widgets-grid">
        {/* Upcoming Events Widget */}
        {upcomingEvents.length > 0 && (
          <div className="dashboard-widget">
            <div className="widget-header">
              <span className="widget-icon">📅</span>
              <h3>Upcoming Events</h3>
              <Link to="/events" className="widget-link">View all</Link>
            </div>
            <div className="widget-content">
              {upcomingEvents.map(event => (
                <div key={event.id} className="widget-event-item">
                  <div className="widget-event-date">
                    <span className="event-day">{new Date(event.date).getDate()}</span>
                    <span className="event-month">{new Date(event.date).toLocaleDateString('en-US', { month: 'short' })}</span>
                  </div>
                  <div className="widget-event-info">
                    <span className="event-name">{event.name}</span>
                    <span className="event-meta">
                      {event.eventType.charAt(0) + event.eventType.slice(1).toLowerCase()}
                      {event.location && ` • ${event.location}`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Active Ideas Widget */}
        {activeIdeas.length > 0 && (
          <div className="dashboard-widget">
            <div className="widget-header">
              <span className="widget-icon">💡</span>
              <h3>Ideas in Progress</h3>
              <Link to="/ideas" className="widget-link">View all</Link>
            </div>
            <div className="widget-content">
              {activeIdeas.map(idea => (
                <div key={idea.id} className="widget-idea-item">
                  <span className={`idea-priority ${idea.priority.toLowerCase()}`}>
                    {idea.priority === 'HIGH' ? '🔥' : idea.priority === 'MEDIUM' ? '⭐' : '📌'}
                  </span>
                  <div className="widget-idea-info">
                    <span className="idea-title">{idea.title}</span>
                    <span className="idea-stage">
                      {idea.stage === 'RESEARCHING' ? '🔍 Researching' : '💬 In Discussion'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Activity Widget */}
        {recentActivity.length > 0 && (
          <div className="dashboard-widget">
            <div className="widget-header">
              <span className="widget-icon">📜</span>
              <h3>Recent Activity</h3>
              <Link to="/interactions" className="widget-link">View all</Link>
            </div>
            <div className="widget-content">
              {recentActivity.map(interaction => {
                const contact = contactList.find(c => c.id === interaction.contactId);
                return (
                  <div key={interaction.id} className="widget-activity-item">
                    <span className="activity-type">
                      {interaction.type === 'MEETING' ? '🤝' :
                       interaction.type === 'CALL' ? '📞' :
                       interaction.type === 'EMAIL' ? '✉️' :
                       interaction.type === 'EVENT' ? '🎉' : '💬'}
                    </span>
                    <div className="widget-activity-info">
                      <span className="activity-contact">
                        {contact ? `${contact.firstName} ${contact.lastName || ''}` : 'Unknown'}
                      </span>
                      <span className="activity-date">
                        {new Date(interaction.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Upcoming Birthdays Widget */}
        {upcomingBirthdays.length > 0 && (
          <div className="dashboard-widget birthday-widget">
            <div className="widget-header">
              <span className="widget-icon">🎂</span>
              <h3>Upcoming Birthdays</h3>
              <Link to="/contacts" className="widget-link">View all</Link>
            </div>
            <div className="widget-content">
              {upcomingBirthdays.map(({ contact, nextBirthday, daysUntil }) => (
                <Link key={contact.id} to={`/contacts/${contact.id}`} className="widget-birthday-item">
                  <div className="birthday-avatar">{contact.firstName[0]}</div>
                  <div className="birthday-info">
                    <span className="birthday-name">{contact.firstName} {contact.lastName || ''}</span>
                    <span className="birthday-date">
                      {nextBirthday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  <span className={`days-badge ${daysUntil === 0 ? 'today' : daysUntil <= 7 ? 'soon' : ''}`}>
                    {daysUntil === 0 ? 'Today!' : daysUntil === 1 ? 'Tomorrow' : `${daysUntil} days`}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Recently Viewed Contacts Widget */}
        {recentlyViewedContacts.length > 0 && (
          <div className="dashboard-widget recently-viewed-widget">
            <div className="widget-header">
              <span className="widget-icon">👁️</span>
              <h3>Recently Viewed</h3>
              <Link to="/contacts" className="widget-link">View all</Link>
            </div>
            <div className="widget-content">
              {recentlyViewedContacts.map(({ contact, viewedAt }) => {
                const viewedDate = new Date(viewedAt);
                const now = new Date();
                const diffMs = now.getTime() - viewedDate.getTime();
                const diffMins = Math.floor(diffMs / 60000);
                const diffHours = Math.floor(diffMs / 3600000);
                const diffDays = Math.floor(diffMs / 86400000);
                let timeAgo = '';
                if (diffMins < 1) timeAgo = 'Just now';
                else if (diffMins < 60) timeAgo = `${diffMins}m ago`;
                else if (diffHours < 24) timeAgo = `${diffHours}h ago`;
                else timeAgo = `${diffDays}d ago`;

                return (
                  <Link key={contact.id} to={`/contacts/${contact.id}`} className="widget-recent-item">
                    <div className="recent-avatar">{contact.firstName[0]}</div>
                    <div className="recent-info">
                      <span className="recent-name">{contact.firstName} {contact.lastName || ''}</span>
                      <span className="recent-company">{contact.company || contact.title || ''}</span>
                    </div>
                    <span className="recent-time">{timeAgo}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Contact Recommendations Widget */}
        {recommendations.length > 0 && (
          <div className="dashboard-widget recommendations-widget">
            <div className="widget-header">
              <span className="widget-icon">💡</span>
              <h3>Recommended Outreach</h3>
            </div>
            <div className="widget-content">
              {recommendations.map(({ contact, reason, reasonType }) => (
                <Link key={contact.id} to={`/contacts/${contact.id}`} className="widget-recommendation-item">
                  <div className={`recommendation-avatar ${reasonType}`}>
                    {contact.firstName[0]}
                  </div>
                  <div className="recommendation-info">
                    <span className="recommendation-name">{contact.firstName} {contact.lastName || ''}</span>
                    <span className="recommendation-reason">{reason}</span>
                  </div>
                  <span className={`recommendation-badge ${reasonType}`}>
                    {reasonType === 'decay' ? '📉' : reasonType === 'equity' ? '⚖️' : reasonType === 'new' ? '🆕' : '⭐'}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Network Insights Widget */}
        <div className="dashboard-widget network-insights-widget">
          <div className="widget-header">
            <span className="widget-icon">📊</span>
            <h3>Network Insights</h3>
            <Link to="/analytics" className="widget-link">Full Analytics</Link>
          </div>
          <div className="widget-content">
            <div className="insights-grid">
              <div className="insight-card">
                <div className="insight-value">{networkInsights.engagementRate}%</div>
                <div className="insight-label">30-Day Engagement</div>
              </div>
              <div className="insight-card">
                <div className="insight-value">{networkInsights.diversityScore}</div>
                <div className="insight-label">Diversity Score</div>
              </div>
              <div className="insight-card">
                <div className="insight-value">{networkInsights.recentInteractionCount}</div>
                <div className="insight-label">Recent Interactions</div>
              </div>
            </div>

            {networkInsights.weeklyTrend.length > 0 && (
              <div className="weekly-trend">
                <div className="trend-label">Weekly Activity</div>
                <div className="trend-bars">
                  {networkInsights.weeklyTrend.map((count, i) => (
                    <div key={i} className="trend-bar-container">
                      <div
                        className="trend-bar"
                        style={{ height: `${Math.max(4, (count / Math.max(...networkInsights.weeklyTrend, 1)) * 40)}px` }}
                      />
                      <span className="trend-week">W{i + 1}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {networkInsights.topSectors.length > 0 && (
              <div className="top-sectors">
                <div className="sectors-label">Top Sectors</div>
                <div className="sector-tags">
                  {networkInsights.topSectors.slice(0, 3).map(([sector, count]) => (
                    <span key={sector} className="sector-tag">
                      {sector} <small>({count})</small>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="strength-distribution">
              <div className="dist-label">Strength Distribution</div>
              <div className="dist-bars">
                {networkInsights.strengthDist.map((count, i) => (
                  <div key={i} className="dist-bar-container" title={`Strength ${i + 1}: ${count} contacts`}>
                    <div
                      className={`dist-bar strength-${i + 1}`}
                      style={{ width: `${Math.max(4, (count / Math.max(...networkInsights.strengthDist, 1)) * 100)}%` }}
                    />
                    <span className="dist-count">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {getScheduledReminders().length > 0 && (
        <section className="followup-section reminders-section">
          <div className="section-header">
            <span className="section-icon">🔔</span>
            <h2>Scheduled Reminders</h2>
            <span className="section-count">{getScheduledReminders().length}</span>
          </div>
          <p className="section-desc">Contacts you set reminders for</p>
          <div className="reminders-list">
            {getScheduledReminders().slice(0, 8).map(({ contact, date, isOverdue }) => (
              <Link key={contact.id} to={`/contacts/${contact.id}`} className={`reminder-item ${isOverdue ? 'overdue' : ''}`}>
                <div className="reminder-item-avatar">{contact.firstName[0]}</div>
                <div className="reminder-item-info">
                  <span className="reminder-item-name">{contact.firstName} {contact.lastName}</span>
                  <span className="reminder-item-date">
                    {isOverdue ? '⚠️ Overdue: ' : ''}
                    {date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {getPendingActions().length > 0 && (
        <section className="followup-section actions-section">
          <div className="section-header">
            <span className="section-icon">⚡</span>
            <h2>Pending Actions</h2>
            <span className="section-count">{getPendingActions().length} items</span>
          </div>
          <p className="section-desc">Action items from your interactions</p>
          <div className="pending-actions-dashboard">
            {getPendingActions().slice(0, 10).map((action, idx) => (
              <div key={idx} className="pending-action-card">
                <span className="action-owner-badge">
                  {action.owner === 'me' ? '👤' : action.owner === 'them' ? '👥' : '🤝'}
                </span>
                <div className="action-details">
                  <span className="action-text-main">{action.text}</span>
                  <Link to={`/contacts/${action.contactId}`} className="action-contact">
                    with {action.contactName}
                  </Link>
                </div>
                {action.dueDate && (
                  <span className={`action-due-badge ${new Date(action.dueDate) < new Date() ? 'overdue' : ''}`}>
                    {new Date(action.dueDate).toLocaleDateString()}
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {urgent.length > 0 && (
        <section className="followup-section urgent">
          <div className="section-header">
            <span className="section-icon">🔴</span>
            <h2>Urgent</h2>
            <span className="section-count">{urgent.length} contacts</span>
          </div>
          <p className="section-desc">90+ days since contact - reach out soon!</p>
          <div className="followup-list">
            {urgent.map(contact => (
              <div key={contact.id} className="followup-card">
                <div className="followup-avatar">{contact.firstName[0]}</div>
                <div className="followup-info">
                  <Link to={`/contacts/${contact.id}`} className="followup-name">
                    {contact.firstName} {contact.lastName}
                  </Link>
                  <span className="followup-company">{contact.company || 'No company'}</span>
                  <span className="followup-days">{getDaysSinceContact(contact)} days ago</span>
                </div>
                {(() => {
                  const strength = getEffectiveStrength(contact);
                  return (
                    <div className={`followup-strength ${strength.decayed ? 'decayed' : ''}`} title={strength.decayed ? `Was ${strength.original}` : ''}>
                      {'❤️'.repeat(strength.current)}
                      {strength.decayed && <span className="strength-decay-badge">↓{strength.original - strength.current}</span>}
                    </div>
                  );
                })()}
                <div className="followup-actions">
                  {contact.email && (
                    <a href={`mailto:${contact.email}`} className="action-btn email" title="Email">✉️</a>
                  )}
                  {contact.phone && (
                    <a href={`tel:${contact.phone}`} className="action-btn call" title="Call">📞</a>
                  )}
                  <Link to={`/contacts/${contact.id}`} className="action-btn view" title="View">👁️</Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {dueSoon.length > 0 && (
        <section className="followup-section due-soon">
          <div className="section-header">
            <span className="section-icon">🟡</span>
            <h2>Due Soon</h2>
            <span className="section-count">{dueSoon.length} contacts</span>
          </div>
          <p className="section-desc">Approaching follow-up threshold</p>
          <div className="followup-list">
            {dueSoon.slice(0, 10).map(contact => (
              <div key={contact.id} className="followup-card">
                <div className="followup-avatar">{contact.firstName[0]}</div>
                <div className="followup-info">
                  <Link to={`/contacts/${contact.id}`} className="followup-name">
                    {contact.firstName} {contact.lastName}
                  </Link>
                  <span className="followup-company">{contact.company || 'No company'}</span>
                  <span className="followup-days">{getDaysSinceContact(contact)} days ago</span>
                </div>
                {(() => {
                  const strength = getEffectiveStrength(contact);
                  return (
                    <div className={`followup-strength ${strength.decayed ? 'decayed' : ''}`} title={strength.decayed ? `Was ${strength.original}` : ''}>
                      {'❤️'.repeat(strength.current)}
                      {strength.decayed && <span className="strength-decay-badge">↓{strength.original - strength.current}</span>}
                    </div>
                  );
                })()}
                <div className="followup-actions">
                  {contact.email && (
                    <a href={`mailto:${contact.email}`} className="action-btn email" title="Email">✉️</a>
                  )}
                  {contact.phone && (
                    <a href={`tel:${contact.phone}`} className="action-btn call" title="Call">📞</a>
                  )}
                  <Link to={`/contacts/${contact.id}`} className="action-btn view" title="View">👁️</Link>
                </div>
              </div>
            ))}
            {dueSoon.length > 10 && (
              <p className="show-more">+{dueSoon.length - 10} more contacts due soon</p>
            )}
          </div>
        </section>
      )}

      <section className="followup-section on-track">
        <div className="section-header">
          <span className="section-icon">🟢</span>
          <h2>On Track</h2>
          <span className="section-count">{onTrack.length} contacts</span>
        </div>
        <p className="section-desc">Recently contacted - no action needed</p>
      </section>

      {urgent.length === 0 && dueSoon.length === 0 && (
        <div className="all-good">
          <div className="all-good-icon">🎉</div>
          <h3>All caught up!</h3>
          <p>Your network is healthy. Keep up the great work!</p>
        </div>
      )}
    </div>
  );
}

// Merge Contacts Page
function MergeContactsPage() {
  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  const [duplicateGroups, setDuplicateGroups] = useState<Contact[][]>([]);
  const [loading, setLoading] = useState(true);
  const [merging, setMerging] = useState(false);
  const [selectedPrimary, setSelectedPrimary] = useState<Record<number, string>>({});
  const [mergeSuccess, setMergeSuccess] = useState('');

  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async () => {
    setLoading(true);
    const res = await contacts.getAll();
    if (res.success && res.data) {
      setAllContacts(res.data);
      findDuplicates(res.data);
    }
    setLoading(false);
  };

  const normalizeString = (str: string) => str.toLowerCase().trim().replace(/\s+/g, ' ');

  const findDuplicates = (contactsList: Contact[]) => {
    const groups: Contact[][] = [];
    const processed = new Set<string>();

    for (let i = 0; i < contactsList.length; i++) {
      if (processed.has(contactsList[i].id)) continue;

      const currentGroup: Contact[] = [contactsList[i]];
      processed.add(contactsList[i].id);

      for (let j = i + 1; j < contactsList.length; j++) {
        if (processed.has(contactsList[j].id)) continue;

        const isDuplicate = checkDuplicate(contactsList[i], contactsList[j]);
        if (isDuplicate) {
          currentGroup.push(contactsList[j]);
          processed.add(contactsList[j].id);
        }
      }

      if (currentGroup.length > 1) {
        groups.push(currentGroup);
      }
    }

    setDuplicateGroups(groups);
    // Default select first contact as primary for each group
    const defaultPrimary: Record<number, string> = {};
    groups.forEach((group, idx) => {
      defaultPrimary[idx] = group[0].id;
    });
    setSelectedPrimary(defaultPrimary);
  };

  const checkDuplicate = (a: Contact, b: Contact): boolean => {
    // Check exact email match
    if (a.email && b.email && normalizeString(a.email) === normalizeString(b.email)) {
      return true;
    }

    // Check exact phone match
    if (a.phone && b.phone) {
      const phoneA = a.phone.replace(/\D/g, '');
      const phoneB = b.phone.replace(/\D/g, '');
      if (phoneA === phoneB && phoneA.length >= 10) {
        return true;
      }
    }

    // Check very similar names (same first and last name)
    const nameA = normalizeString(`${a.firstName} ${a.lastName || ''}`);
    const nameB = normalizeString(`${b.firstName} ${b.lastName || ''}`);
    if (nameA === nameB && nameA.length > 3) {
      return true;
    }

    // Check first name + same company
    if (a.company && b.company &&
        normalizeString(a.firstName) === normalizeString(b.firstName) &&
        normalizeString(a.company) === normalizeString(b.company)) {
      return true;
    }

    return false;
  };

  const handleMerge = async (groupIndex: number) => {
    const group = duplicateGroups[groupIndex];
    const primaryId = selectedPrimary[groupIndex];
    const primary = group.find(c => c.id === primaryId);
    const secondaries = group.filter(c => c.id !== primaryId);

    if (!primary) return;

    setMerging(true);
    try {
      // Merge data from secondaries into primary
      const mergedData: Partial<Contact> = { ...primary };

      // For each secondary, copy any fields that primary doesn't have
      for (const secondary of secondaries) {
        if (!mergedData.email && secondary.email) mergedData.email = secondary.email;
        if (!mergedData.phone && secondary.phone) mergedData.phone = secondary.phone;
        if (!mergedData.company && secondary.company) mergedData.company = secondary.company;
        if (!mergedData.title && secondary.title) mergedData.title = secondary.title;
        if (!mergedData.location && secondary.location) mergedData.location = secondary.location;
        if (!mergedData.linkedinUrl && secondary.linkedinUrl) mergedData.linkedinUrl = secondary.linkedinUrl;
        if (!mergedData.twitterUrl && secondary.twitterUrl) mergedData.twitterUrl = secondary.twitterUrl;
        if (!mergedData.websiteUrl && secondary.websiteUrl) mergedData.websiteUrl = secondary.websiteUrl;
        if (!mergedData.birthday && secondary.birthday) mergedData.birthday = secondary.birthday;
        if (!mergedData.howWeMet && secondary.howWeMet) mergedData.howWeMet = secondary.howWeMet;
        if (!mergedData.notes && secondary.notes) mergedData.notes = secondary.notes;
        else if (secondary.notes && mergedData.notes) {
          mergedData.notes = `${mergedData.notes}\n\n--- Merged from ${secondary.firstName} ---\n${secondary.notes}`;
        }

        // Merge arrays
        mergedData.tags = [...new Set([...(mergedData.tags || []), ...(secondary.tags || [])])];
        mergedData.sectors = [...new Set([...(mergedData.sectors || []), ...(secondary.sectors || [])])];
        mergedData.needs = [...new Set([...(mergedData.needs || []), ...(secondary.needs || [])])];
        mergedData.offers = [...new Set([...(mergedData.offers || []), ...(secondary.offers || [])])];

        // Keep highest relationship strength
        if (secondary.relationshipStrength > (mergedData.relationshipStrength || 0)) {
          mergedData.relationshipStrength = secondary.relationshipStrength;
        }
      }

      // Update the primary contact with merged data
      await contacts.update(primary.id, mergedData);

      // Delete the secondary contacts
      for (const secondary of secondaries) {
        await contacts.delete(secondary.id);
      }

      // Remove the merged group and refresh
      setMergeSuccess(`Merged ${group.length} contacts into ${primary.firstName} ${primary.lastName || ''}`);
      setTimeout(() => setMergeSuccess(''), 3000);

      loadContacts();
    } catch (error) {
      console.error('Merge failed:', error);
    }
    setMerging(false);
  };

  const getDuplicateReason = (a: Contact, b: Contact): string => {
    if (a.email && b.email && normalizeString(a.email) === normalizeString(b.email)) {
      return 'Same email';
    }
    if (a.phone && b.phone) {
      const phoneA = a.phone.replace(/\D/g, '');
      const phoneB = b.phone.replace(/\D/g, '');
      if (phoneA === phoneB) return 'Same phone';
    }
    const nameA = normalizeString(`${a.firstName} ${a.lastName || ''}`);
    const nameB = normalizeString(`${b.firstName} ${b.lastName || ''}`);
    if (nameA === nameB) return 'Same name';
    if (a.company && b.company && normalizeString(a.company) === normalizeString(b.company)) {
      return 'Same first name & company';
    }
    return 'Similar';
  };

  if (loading) {
    return <div className="page-loading">Scanning for duplicates...</div>;
  }

  return (
    <div className="merge-page">
      <div className="page-header">
        <div className="header-content">
          <h1>Merge Duplicates</h1>
          <p className="page-subtitle">
            Found {duplicateGroups.length} potential duplicate groups out of {allContacts.length} contacts
          </p>
        </div>
        <button className="btn secondary" onClick={loadContacts} disabled={merging}>
          Rescan
        </button>
      </div>

      {mergeSuccess && (
        <div className="merge-success-banner">{mergeSuccess}</div>
      )}

      {duplicateGroups.length === 0 ? (
        <div className="no-duplicates">
          <div className="no-duplicates-icon">✨</div>
          <h3>No duplicates found</h3>
          <p>Your contact list looks clean! No potential duplicates were detected.</p>
        </div>
      ) : (
        <div className="duplicate-groups">
          {duplicateGroups.map((group, groupIndex) => (
            <div key={groupIndex} className="duplicate-group">
              <div className="group-header">
                <h3>Potential Duplicates ({group.length} contacts)</h3>
                <span className="duplicate-reason">
                  {getDuplicateReason(group[0], group[1])}
                </span>
              </div>

              <div className="duplicate-contacts">
                {group.map(contact => (
                  <div
                    key={contact.id}
                    className={`duplicate-contact ${selectedPrimary[groupIndex] === contact.id ? 'primary' : ''}`}
                    onClick={() => setSelectedPrimary(prev => ({ ...prev, [groupIndex]: contact.id }))}
                  >
                    <div className="select-primary">
                      <input
                        type="radio"
                        name={`primary-${groupIndex}`}
                        checked={selectedPrimary[groupIndex] === contact.id}
                        onChange={() => setSelectedPrimary(prev => ({ ...prev, [groupIndex]: contact.id }))}
                      />
                      <span className="radio-label">Keep as primary</span>
                    </div>
                    <div className="contact-info">
                      <div className="contact-name">
                        {contact.firstName} {contact.lastName || ''}
                        {contact.title && contact.company && (
                          <span className="contact-role"> - {contact.title} at {contact.company}</span>
                        )}
                      </div>
                      <div className="contact-details">
                        {contact.email && <span className="detail">📧 {contact.email}</span>}
                        {contact.phone && <span className="detail">📱 {contact.phone}</span>}
                        {contact.location && <span className="detail">📍 {contact.location}</span>}
                      </div>
                      <div className="contact-meta">
                        <span>Tags: {contact.tags.length}</span>
                        <span>Strength: {contact.relationshipStrength}/5</span>
                        <span>Created: {new Date(contact.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="group-actions">
                <button
                  className="btn primary"
                  onClick={() => handleMerge(groupIndex)}
                  disabled={merging}
                >
                  {merging ? 'Merging...' : 'Merge Contacts'}
                </button>
                <span className="merge-info">
                  Other contacts will be merged into the selected primary and deleted
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Follow-up Queue Page
function FollowUpQueuePage() {
  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'overdue' | 'today' | 'week' | 'month'>('all');
  const navigate = useNavigate();

  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async () => {
    setLoading(true);
    const res = await contacts.getAll();
    if (res.success && res.data) {
      setAllContacts(res.data);
    }
    setLoading(false);
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endOfDay = new Date(today);
  endOfDay.setHours(23, 59, 59, 999);
  const weekFromNow = new Date(today);
  weekFromNow.setDate(weekFromNow.getDate() + 7);
  const monthFromNow = new Date(today);
  monthFromNow.setMonth(monthFromNow.getMonth() + 1);

  const getFollowUpStatus = (contact: Contact): 'overdue' | 'today' | 'week' | 'month' | 'later' | 'none' => {
    if (!contact.nextFollowUpAt) return 'none';
    const followUp = new Date(contact.nextFollowUpAt);
    if (followUp < today) return 'overdue';
    if (followUp <= endOfDay) return 'today';
    if (followUp <= weekFromNow) return 'week';
    if (followUp <= monthFromNow) return 'month';
    return 'later';
  };

  const contactsWithFollowUp = allContacts
    .filter(c => c.nextFollowUpAt)
    .map(c => ({ ...c, status: getFollowUpStatus(c) }))
    .sort((a, b) => {
      const dateA = new Date(a.nextFollowUpAt!).getTime();
      const dateB = new Date(b.nextFollowUpAt!).getTime();
      return dateA - dateB;
    });

  const filteredContacts = contactsWithFollowUp.filter(c => {
    if (filter === 'all') return true;
    if (filter === 'overdue') return c.status === 'overdue';
    if (filter === 'today') return c.status === 'today';
    if (filter === 'week') return c.status === 'overdue' || c.status === 'today' || c.status === 'week';
    if (filter === 'month') return c.status !== 'later' && c.status !== 'none';
    return true;
  });

  const counts = {
    overdue: contactsWithFollowUp.filter(c => c.status === 'overdue').length,
    today: contactsWithFollowUp.filter(c => c.status === 'today').length,
    week: contactsWithFollowUp.filter(c => c.status === 'week').length,
    month: contactsWithFollowUp.filter(c => c.status === 'month').length,
  };

  const markComplete = async (contactId: string) => {
    const res = await contacts.update(contactId, {
      nextFollowUpAt: undefined,
      lastContactedAt: new Date().toISOString(),
    });
    if (res.success) {
      loadContacts();
    }
  };

  const snooze = async (contactId: string, days: number) => {
    const newDate = new Date();
    newDate.setDate(newDate.getDate() + days);
    const res = await contacts.update(contactId, {
      nextFollowUpAt: newDate.toISOString().split('T')[0],
    });
    if (res.success) {
      loadContacts();
    }
  };

  const statusColors: Record<string, string> = {
    overdue: '#EF4444',
    today: '#F59E0B',
    week: '#3B82F6',
    month: '#10B981',
    later: '#6B7280',
  };

  const statusLabels: Record<string, string> = {
    overdue: 'Overdue',
    today: 'Today',
    week: 'This Week',
    month: 'This Month',
    later: 'Later',
  };

  if (loading) {
    return <div className="page-loading">Loading follow-ups...</div>;
  }

  return (
    <div className="followup-queue-page">
      <div className="page-header">
        <div className="header-content">
          <h1>Follow-up Queue</h1>
          <p className="page-subtitle">
            {contactsWithFollowUp.length} contacts with scheduled follow-ups
          </p>
        </div>
      </div>

      <div className="followup-stats">
        <div className={`stat-card overdue ${filter === 'overdue' ? 'active' : ''}`} onClick={() => setFilter('overdue')}>
          <span className="stat-count">{counts.overdue}</span>
          <span className="stat-label">Overdue</span>
        </div>
        <div className={`stat-card today ${filter === 'today' ? 'active' : ''}`} onClick={() => setFilter('today')}>
          <span className="stat-count">{counts.today}</span>
          <span className="stat-label">Today</span>
        </div>
        <div className={`stat-card week ${filter === 'week' ? 'active' : ''}`} onClick={() => setFilter('week')}>
          <span className="stat-count">{counts.week}</span>
          <span className="stat-label">This Week</span>
        </div>
        <div className={`stat-card month ${filter === 'month' ? 'active' : ''}`} onClick={() => setFilter('month')}>
          <span className="stat-count">{counts.month}</span>
          <span className="stat-label">This Month</span>
        </div>
        <div className={`stat-card all ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
          <span className="stat-count">{contactsWithFollowUp.length}</span>
          <span className="stat-label">All</span>
        </div>
      </div>

      {filteredContacts.length === 0 ? (
        <div className="empty-queue">
          <div className="empty-icon">🎯</div>
          <h3>No follow-ups {filter !== 'all' ? `${filter}` : 'scheduled'}</h3>
          <p>
            {filter === 'all'
              ? 'Set follow-up reminders on your contacts to see them here.'
              : 'Great job! No follow-ups in this time period.'}
          </p>
        </div>
      ) : (
        <div className="followup-list">
          {filteredContacts.map(contact => (
            <div key={contact.id} className="followup-card">
              <div
                className="followup-status-bar"
                style={{ background: statusColors[contact.status] }}
              />
              <div className="followup-content">
                <div className="followup-main" onClick={() => navigate(`/contacts/${contact.id}`)}>
                  <div className="contact-avatar">
                    {contact.firstName[0]}{contact.lastName?.[0] || ''}
                  </div>
                  <div className="contact-info">
                    <div className="contact-name">
                      {contact.firstName} {contact.lastName || ''}
                    </div>
                    {contact.company && (
                      <div className="contact-company">{contact.title ? `${contact.title} at ` : ''}{contact.company}</div>
                    )}
                    <div className="followup-date">
                      <span
                        className="status-badge"
                        style={{ background: `${statusColors[contact.status]}20`, color: statusColors[contact.status] }}
                      >
                        {statusLabels[contact.status]}
                      </span>
                      <span className="date-text">
                        {new Date(contact.nextFollowUpAt!).toLocaleDateString('en-US', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="followup-actions">
                  <div className="quick-actions">
                    {contact.email && (
                      <a href={`mailto:${contact.email}`} className="action-btn" title="Email">✉️</a>
                    )}
                    {contact.phone && (
                      <a href={`tel:${contact.phone}`} className="action-btn" title="Call">📞</a>
                    )}
                  </div>
                  <div className="snooze-actions">
                    <button className="btn-snooze" onClick={() => snooze(contact.id, 1)} title="Snooze 1 day">+1d</button>
                    <button className="btn-snooze" onClick={() => snooze(contact.id, 7)} title="Snooze 1 week">+1w</button>
                    <button className="btn-done" onClick={() => markComplete(contact.id)} title="Mark as done">✓</button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Activity Feed Page
type ActivityItem = {
  id: string;
  type: 'interaction' | 'contact_created' | 'equity_action' | 'note' | 'idea' | 'event';
  title: string;
  description?: string;
  timestamp: string;
  icon: string;
  contactName?: string;
  contactId?: string;
  metadata?: Record<string, string>;
};

function ActivityFeedPage() {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'interactions' | 'contacts' | 'equity' | 'notes'>('all');
  const navigate = useNavigate();

  useEffect(() => {
    loadActivities();
  }, []);

  const loadActivities = async () => {
    setLoading(true);
    const allActivities: ActivityItem[] = [];

    // Load interactions
    const intRes = await interactions.list(1, 100);
    if (intRes.success && intRes.data) {
      const contactRes = await contacts.getAll();
      const contactMap = new Map<string, Contact>();
      if (contactRes.success && contactRes.data) {
        contactRes.data.forEach(c => contactMap.set(c.id, c));
      }

      intRes.data.items?.forEach(int => {
        const contact = contactMap.get(int.contactId);
        allActivities.push({
          id: `int-${int.id}`,
          type: 'interaction',
          title: `${int.type} with ${contact?.firstName || 'Unknown'}`,
          description: int.notes?.substring(0, 100) || undefined,
          timestamp: int.createdAt,
          icon: getInteractionIcon(int.type),
          contactName: contact ? `${contact.firstName} ${contact.lastName || ''}` : undefined,
          contactId: int.contactId,
          metadata: { sentiment: int.sentiment },
        });
      });

      // Recent contacts (created in last 30 days)
      contactRes.data?.forEach(c => {
        const createdDate = new Date(c.createdAt);
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        if (createdDate > thirtyDaysAgo) {
          allActivities.push({
            id: `contact-${c.id}`,
            type: 'contact_created',
            title: `Added ${c.firstName} ${c.lastName || ''}`,
            description: c.company ? `${c.title || ''} at ${c.company}`.trim() : undefined,
            timestamp: c.createdAt,
            icon: '👤',
            contactName: `${c.firstName} ${c.lastName || ''}`,
            contactId: c.id,
          });
        }
      });
    }

    // Load equity actions from localStorage
    const storedEquity = localStorage.getItem('obani_equity_actions');
    if (storedEquity) {
      const equityActions: EquityAction[] = JSON.parse(storedEquity);
      equityActions.forEach(ea => {
        allActivities.push({
          id: `equity-${ea.id}`,
          type: 'equity_action',
          title: formatEquityAction(ea.type),
          description: ea.notes || undefined,
          timestamp: ea.createdAt,
          icon: ea.points > 0 ? '💚' : '❤️',
          metadata: { points: `${ea.points > 0 ? '+' : ''}${ea.points}` },
        });
      });
    }

    // Load notes from localStorage
    const storedNotes = localStorage.getItem('obani_notes');
    if (storedNotes) {
      const notes: PersonalNote[] = JSON.parse(storedNotes);
      notes.slice(0, 20).forEach(note => {
        allActivities.push({
          id: `note-${note.id}`,
          type: 'note',
          title: note.title || `${note.noteType} note`,
          description: note.content.substring(0, 80),
          timestamp: note.createdAt,
          icon: getNoteIcon(note.noteType),
        });
      });
    }

    // Load ideas from localStorage
    const storedIdeas = localStorage.getItem('obani_ideas');
    if (storedIdeas) {
      const ideas: Idea[] = JSON.parse(storedIdeas);
      ideas.slice(0, 10).forEach(idea => {
        allActivities.push({
          id: `idea-${idea.id}`,
          type: 'idea',
          title: idea.title,
          description: idea.description?.substring(0, 80),
          timestamp: idea.createdAt,
          icon: '💡',
          metadata: { stage: idea.stage },
        });
      });
    }

    // Sort by timestamp descending
    allActivities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    setActivities(allActivities);
    setLoading(false);
  };

  const getInteractionIcon = (type: string) => {
    const icons: Record<string, string> = {
      MEETING: '🤝',
      CALL: '📞',
      EMAIL: '✉️',
      MESSAGE: '💬',
      SOCIAL: '📱',
      EVENT: '🎉',
      OTHER: '📋',
    };
    return icons[type] || '📋';
  };

  const getNoteIcon = (type: string) => {
    const icons: Record<string, string> = {
      TODO: '✅',
      IDEA: '💡',
      INSIGHT: '🔍',
      JOURNAL: '📓',
      OTHER: '📝',
    };
    return icons[type] || '📝';
  };

  const formatEquityAction = (type: string) => {
    const labels: Record<string, string> = {
      INTRO_MADE: 'Made an introduction',
      INTRO_SUCCESS: 'Successful introduction',
      CONTENT_SHARED: 'Shared content',
      ADVICE_GIVEN: 'Gave advice',
      REFERRAL_MADE: 'Made a referral',
      ENDORSED: 'Gave endorsement',
      FAVOR_DONE: 'Did a favor',
      ASKED_INTRO: 'Asked for intro',
      ASKED_ADVICE: 'Asked for advice',
      PITCHED_SERVICE: 'Pitched service',
      ASKED_INVESTMENT: 'Asked for investment',
      ASKED_FAVOR: 'Asked for favor',
      CANCELED_MEETING: 'Canceled meeting',
      NO_SHOW: 'No show',
      NO_RESPONSE: 'No response',
    };
    return labels[type] || type;
  };

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date();
    const date = new Date(timestamp);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const filteredActivities = activities.filter(a => {
    if (filter === 'all') return true;
    if (filter === 'interactions') return a.type === 'interaction';
    if (filter === 'contacts') return a.type === 'contact_created';
    if (filter === 'equity') return a.type === 'equity_action';
    if (filter === 'notes') return a.type === 'note' || a.type === 'idea';
    return true;
  });

  if (loading) {
    return <div className="page-loading">Loading activity...</div>;
  }

  return (
    <div className="activity-feed-page">
      <div className="page-header">
        <h1>Activity Feed</h1>
        <p className="page-subtitle">Your recent activity across Obani</p>
      </div>

      <div className="activity-filters">
        {(['all', 'interactions', 'contacts', 'equity', 'notes'] as const).map(f => (
          <button
            key={f}
            className={`filter-btn ${filter === f ? 'active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {filteredActivities.length === 0 ? (
        <div className="empty-feed">
          <div className="empty-icon">📭</div>
          <h3>No activity yet</h3>
          <p>Your recent activity will appear here.</p>
        </div>
      ) : (
        <div className="activity-list">
          {filteredActivities.map(activity => (
            <div
              key={activity.id}
              className={`activity-item ${activity.contactId ? 'clickable' : ''}`}
              onClick={() => activity.contactId && navigate(`/contacts/${activity.contactId}`)}
            >
              <div className="activity-icon">{activity.icon}</div>
              <div className="activity-content">
                <div className="activity-header">
                  <span className="activity-title">{activity.title}</span>
                  <span className="activity-time">{formatTimeAgo(activity.timestamp)}</span>
                </div>
                {activity.description && (
                  <p className="activity-description">{activity.description}</p>
                )}
                {activity.metadata && (
                  <div className="activity-meta">
                    {activity.metadata.points && (
                      <span className={`equity-points ${parseInt(activity.metadata.points) > 0 ? 'positive' : 'negative'}`}>
                        {activity.metadata.points} pts
                      </span>
                    )}
                    {activity.metadata.sentiment && (
                      <span className={`sentiment-badge ${activity.metadata.sentiment.toLowerCase()}`}>
                        {activity.metadata.sentiment}
                      </span>
                    )}
                    {activity.metadata.stage && (
                      <span className="stage-badge">{activity.metadata.stage}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
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
    <ThemeProvider>
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
          <Route path="/ideas" element={<ProtectedRoute><IdeaPipelinePage /></ProtectedRoute>} />
          <Route path="/notes" element={<ProtectedRoute><PersonalNotesPage /></ProtectedRoute>} />
          <Route path="/content" element={<ProtectedRoute><ContentLibraryPage /></ProtectedRoute>} />
          <Route path="/analytics" element={<ProtectedRoute><AnalyticsPage /></ProtectedRoute>} />
          <Route path="/events" element={<ProtectedRoute><EventsPage /></ProtectedRoute>} />
          <Route path="/groups" element={<ProtectedRoute><GroupsPage /></ProtectedRoute>} />
          <Route path="/tags" element={<ProtectedRoute><TagManagementPage /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
          <Route path="/merge" element={<ProtectedRoute><MergeContactsPage /></ProtectedRoute>} />
          <Route path="/followups" element={<ProtectedRoute><FollowUpQueuePage /></ProtectedRoute>} />
          <Route path="/activity" element={<ProtectedRoute><ActivityFeedPage /></ProtectedRoute>} />
          <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
