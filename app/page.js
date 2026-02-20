'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Plus, Search, Tag, Calendar, CheckCircle2, Circle, Edit2, Trash2, X,
  Bold, Italic, Underline, Strikethrough, List, ChevronLeft, ChevronRight,
  Folder, Archive, TrendingUp, Flame, FileText, Zap, Download, Loader2, Clock, StickyNote
} from 'lucide-react';

// ── API helpers ──

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// ── Main App ──

export default function CommandCenter() {
  const [notes, setNotes] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState({ tags: [], priority: null, status: 'active', category: 'all', project: null });
  const [searchQuery, setSearchQuery] = useState('');
  const [editingNote, setEditingNote] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [showWeeklyReport, setShowWeeklyReport] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState({ priority: false, tags: false, projects: false });

  // Calendar state
  const [activeView, setActiveView] = useState('tasks'); // 'tasks' or 'calendar'
  const [googleConnected, setGoogleConnected] = useState(false);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [calendarList, setCalendarList] = useState([]);
  const [selectedCalendars, setSelectedCalendars] = useState([]);
  const [calendarWeekOffset, setCalendarWeekOffset] = useState(0);
  const [showEventForm, setShowEventForm] = useState(false);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [connectedAccounts, setConnectedAccounts] = useState([]);
  const [calendarMode, setCalendarMode] = useState('week'); // 'day', 'week', 'month'

  // ── Load data from API on mount ──
  useEffect(() => {
    async function loadData() {
      try {
        const [notesData, tasksData] = await Promise.all([
          api('/api/notes'),
          api('/api/tasks'),
        ]);
        setNotes(notesData);
        setTasks(tasksData);
      } catch (err) {
        console.error('Failed to load data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // ── Check Google connection & handle auth redirect ──
  useEffect(() => {
    async function checkGoogle() {
      try {
        // Check for auth callback params
        const params = new URLSearchParams(window.location.search);
        if (params.get('auth_success')) {
          window.history.replaceState({}, '', '/');
        }
        if (params.get('auth_error')) {
          console.error('Auth error:', params.get('auth_error'));
          window.history.replaceState({}, '', '/');
        }

        const session = await api('/api/auth/session');
        setGoogleConnected(session.connected);
        setConnectedAccounts(session.accounts || []);

        if (session.connected) {
          // Load calendar list
          const calData = await api('/api/calendar/calendars');
          setCalendarList(calData.calendars || []);
          // Auto-select all calendars
          setSelectedCalendars((calData.calendars || []).map(c => c.id));
        }
      } catch (err) {
        console.error('Google check failed:', err);
      }
    }
    checkGoogle();
  }, []);

  // ── Fetch calendar events when view/week/calendars change ──
  useEffect(() => {
    if (!googleConnected || selectedCalendars.length === 0 || activeView !== 'calendar') return;

    async function fetchEvents() {
      setCalendarLoading(true);
      try {
        const { start, end } = getDateRange(calendarWeekOffset, calendarMode);

        const params = new URLSearchParams({
          timeMin: start.toISOString(),
          timeMax: end.toISOString(),
          calendars: selectedCalendars.join(','),
        });

        const data = await api(`/api/calendar?${params}`);
        setCalendarEvents(data.events || []);
      } catch (err) {
        console.error('Failed to fetch events:', err);
      } finally {
        setCalendarLoading(false);
      }
    }
    fetchEvents();
  }, [googleConnected, selectedCalendars, calendarWeekOffset, activeView, calendarMode]);

  function getWeekStart(offset = 0) {
    const now = new Date();
    const day = now.getDay();
    const start = new Date(now);
    start.setDate(now.getDate() - day + (offset * 7));
    start.setHours(0, 0, 0, 0);
    return start;
  }

  function getDateRange(offset, mode) {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    if (mode === 'day') {
      const start = new Date(now);
      start.setDate(start.getDate() + offset);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      return { start, end };
    } else if (mode === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
      const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1);
      return { start, end };
    } else {
      // week
      const day = now.getDay();
      const start = new Date(now);
      start.setDate(now.getDate() - day + (offset * 7));
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      return { start, end };
    }
  }

  const createCalendarEvent = async (eventData) => {
    setSaving(true);
    try {
      await api('/api/calendar', { method: 'POST', body: eventData });
      const { start, end } = getDateRange(calendarWeekOffset, calendarMode);
      const params = new URLSearchParams({
        timeMin: start.toISOString(),
        timeMax: end.toISOString(),
        calendars: selectedCalendars.join(','),
      });
      const data = await api(`/api/calendar?${params}`);
      setCalendarEvents(data.events || []);
      setShowEventForm(false);
    } catch (err) {
      console.error('Failed to create event:', err);
    } finally {
      setSaving(false);
    }
  };

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handleKey = (e) => {
      if ((e.ctrlKey || e.metaKey)) {
        if (e.key === 'n') { e.preventDefault(); setShowNoteForm(true); }
        if (e.key === 't') { e.preventDefault(); setShowTaskForm(true); }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  // ── Helpers ──

  const parseDate = (text) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const lower = text.toLowerCase();
    if (lower.includes('tomorrow')) {
      const d = new Date(today);
      d.setDate(d.getDate() + 1);
      return d;
    }
    const patterns = [/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/];
    for (const p of patterns) {
      const m = text.match(p);
      if (m) {
        let [_, month, day, year] = m;
        year = year.length === 2 ? '20' + year : year;
        return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      }
    }
    return null;
  };

  const calculatePriority = (dueDate) => {
    if (!dueDate) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);
    const days = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
    if (days <= 3) return 'high';
    if (days <= 7) return 'medium';
    return 'low';
  };

  const parseTags = (content) => {
    const matches = [...content.matchAll(/#(\w+)/g)];
    return [...new Set(matches.map(m => m[1].toLowerCase()))];
  };

  const extractActionItems = (content, noteId, noteTags) => {
    const re = /ACTION ITEM:\s*(.+?)(?=\n|$)/gi;
    const matches = [...content.matchAll(re)];
    return matches.map((m, i) => {
      let txt = m[1].trim().replace(/\bRyan\b,?\s*/gi, '').trim();
      const due = parseDate(txt);
      return {
        id: `${noteId}-action-${i}-${Date.now()}`,
        text: txt,
        completed: false,
        dueDate: due ? due.toISOString() : null,
        priority: calculatePriority(due),
        tags: noteTags,
        parentNoteId: noteId,
        createdAt: new Date().toISOString(),
        category: 'wrapmate',
      };
    });
  };

  const allTags = [...new Set([...notes.flatMap(n => n.tags || []), ...tasks.flatMap(t => t.tags || [])])];

  const getTagColor = (tag) => {
    const colors = [
      'bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-700',
      'bg-rose-100 text-rose-700', 'bg-sky-100 text-sky-700',
      'bg-violet-100 text-violet-700', 'bg-orange-100 text-orange-700',
    ];
    const idx = tag.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    return colors[idx % colors.length];
  };

  // ── CRUD operations (hit API, then update local state) ──

  const saveNote = async (data) => {
    setSaving(true);
    try {
      const tags = parseTags(data.content);
      const notePayload = { ...data, tags };

      if (data.id) {
        const updated = await api(`/api/notes/${data.id}`, { method: 'PUT', body: notePayload });
        setNotes(notes.map(n => n.id === data.id ? { ...n, ...updated } : n));

        // Remove old action-item tasks, create new ones
        const oldActionTasks = tasks.filter(t => t.parentNoteId === data.id);
        for (const t of oldActionTasks) {
          await api(`/api/tasks/${t.id}`, { method: 'DELETE' });
        }
        setTasks(tasks.filter(t => t.parentNoteId !== data.id));

        const actions = extractActionItems(data.content, data.id, tags);
        for (const a of actions) {
          await api('/api/tasks', { method: 'POST', body: a });
        }
        setTasks(prev => [...prev.filter(t => t.parentNoteId !== data.id), ...actions]);
      } else {
        const newId = Date.now().toString();
        const created = await api('/api/notes', { method: 'POST', body: { ...notePayload, id: newId } });
        setNotes(prev => [created, ...prev]);

        const actions = extractActionItems(data.content, newId, tags);
        for (const a of actions) {
          await api('/api/tasks', { method: 'POST', body: a });
        }
        setTasks(prev => [...prev, ...actions]);
      }
    } catch (err) {
      console.error('Save note failed:', err);
    } finally {
      setSaving(false);
      setShowNoteForm(false);
      setEditingNote(null);
    }
  };

  const saveTask = async (data) => {
    setSaving(true);
    try {
      const pri = data.priority || calculatePriority(data.dueDate);
      const payload = { ...data, priority: pri };

      if (data.id) {
        const updated = await api(`/api/tasks/${data.id}`, { method: 'PUT', body: payload });
        setTasks(tasks.map(t => t.id === data.id ? { ...t, ...updated } : t));
      } else {
        const newId = Date.now().toString();
        const created = await api('/api/tasks', { method: 'POST', body: { ...payload, id: newId, completed: false, createdAt: new Date().toISOString() } });
        setTasks(prev => [created, ...prev]);
      }
    } catch (err) {
      console.error('Save task failed:', err);
    } finally {
      setSaving(false);
      setShowTaskForm(false);
      setEditingTask(null);
    }
  };

  const toggleTask = async (id) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    const updated = { ...task, completed: !task.completed };
    setTasks(tasks.map(t => t.id === id ? updated : t));
    try {
      await api(`/api/tasks/${id}`, { method: 'PUT', body: updated });
    } catch (err) {
      // Revert on failure
      setTasks(tasks.map(t => t.id === id ? task : t));
    }
  };

  const deleteNote = async (id) => {
    setNotes(notes.filter(n => n.id !== id));
    try {
      await api(`/api/notes/${id}`, { method: 'DELETE' });
      // Unlink tasks
      setTasks(tasks.map(t => t.parentNoteId === id ? { ...t, parentNoteId: null } : t));
    } catch (err) {
      console.error('Delete note failed:', err);
    }
  };

  const deleteTask = async (id) => {
    setTasks(tasks.filter(t => t.id !== id));
    try {
      await api(`/api/tasks/${id}`, { method: 'DELETE' });
    } catch (err) {
      console.error('Delete task failed:', err);
    }
  };

  const archiveNote = async (id) => {
    const note = notes.find(n => n.id === id);
    if (!note) return;
    const updated = { ...note, archived: true };
    setNotes(notes.map(n => n.id === id ? updated : n));
    try {
      await api(`/api/notes/${id}`, { method: 'PUT', body: updated });
    } catch (err) {
      setNotes(notes.map(n => n.id === id ? note : n));
    }
  };

  const unarchiveNote = async (id) => {
    const note = notes.find(n => n.id === id);
    if (!note) return;
    const updated = { ...note, archived: false };
    setNotes(notes.map(n => n.id === id ? updated : n));
    try {
      await api(`/api/notes/${id}`, { method: 'PUT', body: updated });
    } catch (err) {
      setNotes(notes.map(n => n.id === id ? note : n));
    }
  };

  // ── Filtering & Sorting ──

  const filteredNotes = notes.filter(n => {
    if (n.archived) return false;
    if (filter.category !== 'all' && n.category !== filter.category) return false;
    if (filter.project && n.projectId !== filter.project) return false;
    if (filter.tags.length && !filter.tags.some(tag => (n.tags || []).includes(tag))) return false;
    if (searchQuery && !n.content.toLowerCase().includes(searchQuery.toLowerCase()) && !n.title?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  }).sort((a, b) => {
    // Most recently updated/created first
    const aDate = new Date(a.updatedAt || a.createdAt);
    const bDate = new Date(b.updatedAt || b.createdAt);
    return bDate - aDate;
  });

  const filteredTasks = tasks.filter(t => {
    if (filter.category !== 'all' && t.category !== filter.category) return false;
    if (filter.status === 'active' && t.completed) return false;
    if (filter.status === 'completed' && !t.completed) return false;
    if (filter.priority && t.priority !== filter.priority) return false;
    if (filter.project && t.projectId !== filter.project) return false;
    if (filter.tags.length && !filter.tags.some(tag => (t.tags || []).includes(tag))) return false;
    if (searchQuery && !t.text.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  }).sort((a, b) => {
    // Tasks with due dates first, sorted by earliest due date
    // Then tasks without due dates, sorted by most recently created
    if (a.dueDate && b.dueDate) {
      const dateCompare = new Date(a.dueDate) - new Date(b.dueDate);
      if (dateCompare !== 0) return dateCompare;
      // Same date — sort by time if available
      if (a.dueTime && b.dueTime) return a.dueTime.localeCompare(b.dueTime);
      if (a.dueTime) return -1;
      if (b.dueTime) return 1;
      return 0;
    }
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  // ── Streak ──
  const streak = (() => {
    let s = 0;
    for (let i = 0; i < 30; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const next = new Date(d);
      next.setDate(d.getDate() + 1);
      const completed = tasks.filter(t => {
        if (!t.completed) return false;
        const cd = new Date(t.createdAt);
        return cd >= d && cd < next;
      }).length;
      if (completed > 0) s++;
      else break;
    }
    return s;
  })();

  // ── Loading state ──
  if (loading) {
    return (
      <div className="flex h-screen bg-gradient-to-br from-stone-50 to-amber-50 items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 size={40} className="text-emerald-600 animate-spin" />
          <p className="text-stone-600 font-medium">Loading Command Center...</p>
        </div>
      </div>
    );
  }

  // ── Render ──
  return (
    <div className="flex h-screen bg-gradient-to-br from-stone-50 to-amber-50">
      {/* Sidebar */}
      {!sidebarCollapsed && (
        <div className="w-64 bg-white/80 backdrop-blur-sm border-r border-stone-200 p-4 overflow-y-auto shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Zap size={20} className="text-emerald-600" />
              <h2 className="text-lg font-bold text-stone-800">Filters</h2>
            </div>
            <button onClick={() => setSidebarCollapsed(true)} className="text-stone-400 hover:text-stone-600 p-1 rounded-lg hover:bg-stone-100">
              <ChevronLeft size={18} />
            </button>
          </div>

          <button onClick={() => setShowDashboard(true)} className="w-full mb-4 px-4 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-2xl hover:from-emerald-600 hover:to-teal-600 flex items-center gap-2 shadow-sm font-medium">
            <TrendingUp size={16} />
            Dashboard
          </button>

          <div className="mb-6">
            <button onClick={() => setCollapsedSections({ ...collapsedSections, priority: !collapsedSections.priority })} className="w-full flex items-center justify-between text-sm font-semibold text-stone-700 mb-2 hover:text-emerald-600">
              <span>Priority</span>
              <span className="text-xs">{collapsedSections.priority ? '▶' : '▼'}</span>
            </button>
            {!collapsedSections.priority && (
              <div className="space-y-1">
                {[null, 'high', 'medium', 'low'].map(p => (
                  <button key={p || 'none'} onClick={() => setFilter({ ...filter, priority: p })} className={`w-full text-left px-3 py-2 rounded-xl text-sm ${filter.priority === p ? 'bg-emerald-100 text-emerald-700 font-medium' : 'hover:bg-stone-100 text-stone-600'}`}>
                    {p ? p.charAt(0).toUpperCase() + p.slice(1) : 'All'}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mb-6">
            <button onClick={() => setCollapsedSections({ ...collapsedSections, tags: !collapsedSections.tags })} className="w-full flex items-center justify-between text-sm font-semibold text-stone-700 mb-2 hover:text-emerald-600">
              <span>Tags</span>
              <span className="text-xs">{collapsedSections.tags ? '▶' : '▼'}</span>
            </button>
            {!collapsedSections.tags && (
              <div className="space-y-1">
                {allTags.map(tag => (
                  <button key={tag} onClick={() => setFilter({ ...filter, tags: filter.tags.includes(tag) ? filter.tags.filter(t => t !== tag) : [...filter.tags, tag] })} className={`w-full text-left px-3 py-2 rounded-xl text-sm flex items-center gap-2 ${filter.tags.includes(tag) ? getTagColor(tag) + ' font-medium' : 'hover:bg-stone-100 text-stone-600'}`}>
                    <Tag size={12} />
                    #{tag}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-stone-200 pt-4 space-y-2">
            {/* View Toggle */}
            <div className="flex gap-1 mb-3 bg-stone-100 rounded-xl p-1">
              <button onClick={() => setActiveView('tasks')} className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${activeView === 'tasks' ? 'bg-white text-emerald-700 shadow-sm' : 'text-stone-600 hover:text-stone-800'}`}>
                Tasks
              </button>
              <button onClick={() => setActiveView('calendar')} className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${activeView === 'calendar' ? 'bg-white text-emerald-700 shadow-sm' : 'text-stone-600 hover:text-stone-800'}`}>
                <span className="flex items-center justify-center gap-1"><Calendar size={14} /> Calendar</span>
              </button>
            </div>

            {/* Google Calendar Connection */}
            {!googleConnected ? (
              <a href="/api/auth/login" className="w-full text-left px-3 py-2 rounded-xl text-sm hover:bg-stone-100 flex items-center gap-2 text-sky-600 font-medium">
                <Calendar size={14} />
                Connect Google Calendar
              </a>
            ) : (
              <div className="space-y-1">
                {connectedAccounts.map(acct => (
                  <div key={acct.email} className="text-xs text-emerald-600 px-3 py-1 flex items-center gap-1">
                    <CheckCircle2 size={12} /> {acct.email}
                  </div>
                ))}
                <a href="/api/auth/login" className="text-xs text-sky-600 px-3 py-1 flex items-center gap-1 hover:bg-stone-50 rounded-lg cursor-pointer">
                  <Plus size={12} /> Add another account
                </a>
              </div>
            )}

            {/* Calendar selector */}
            {googleConnected && calendarList.length > 0 && activeView === 'calendar' && (
              <div className="space-y-2 pl-1">
                {connectedAccounts.map(acct => (
                  <div key={acct.email}>
                    <div className="text-xs font-semibold text-stone-500 px-2 py-1 uppercase tracking-wide">{acct.email.split('@')[1]}</div>
                    {calendarList.filter(cal => cal.accountEmail === acct.email).map(cal => (
                      <label key={cal.id} className="flex items-center gap-2 text-xs text-stone-600 cursor-pointer px-2 py-1 rounded-lg hover:bg-stone-50">
                        <input
                          type="checkbox"
                          checked={selectedCalendars.includes(cal.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedCalendars([...selectedCalendars, cal.id]);
                            } else {
                              setSelectedCalendars(selectedCalendars.filter(id => id !== cal.id));
                            }
                          }}
                          className="rounded accent-emerald-600"
                        />
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cal.color }} />
                        <span className="truncate">{cal.name}</span>
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            )}

            <button onClick={() => setShowArchived(true)} className="w-full text-left px-3 py-2 rounded-xl text-sm hover:bg-stone-100 flex items-center gap-2 text-amber-600 font-medium">
              <Archive size={14} />
              Archived ({notes.filter(n => n.archived).length})
            </button>
            <button onClick={() => setShowWeeklyReport(true)} className="w-full text-left px-3 py-2 rounded-xl text-sm hover:bg-stone-100 flex items-center gap-2 text-emerald-600 font-medium">
              <FileText size={14} />
              Weekly Report
            </button>
          </div>
        </div>
      )}

      {sidebarCollapsed && (
        <div className="bg-white/80 backdrop-blur-sm border-r border-stone-200 flex flex-col p-2">
          <button onClick={() => setSidebarCollapsed(false)} className="p-3 hover:bg-stone-100 rounded-xl">
            <ChevronRight size={20} className="text-stone-600" />
          </button>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-white/80 backdrop-blur-sm border-b border-stone-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Zap size={28} className="text-emerald-600" />
              <h1 className="text-2xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">Command Center</h1>
              <div className="flex items-center gap-2 text-sm text-stone-600 bg-stone-100 px-3 py-1 rounded-full">
                <Flame size={14} className="text-orange-500" />
                {streak} day streak
              </div>
              {saving && (
                <div className="flex items-center gap-1 text-sm text-emerald-600">
                  <Loader2 size={14} className="animate-spin" />
                  Saving...
                </div>
              )}
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 border-r border-stone-200 pr-4">
                <span className="text-sm font-medium text-stone-700">Category:</span>
                <div className="flex gap-1">
                  {['all', 'wrapmate', 'personal'].map(c => (
                    <button key={c} onClick={() => setFilter({ ...filter, category: c })} className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-all ${filter.category === c ? 'bg-emerald-600 text-white shadow-sm' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'}`}>
                      {c === 'all' ? 'All' : c === 'wrapmate' ? 'Wrapmate' : 'Personal'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 border-r border-stone-200 pr-4">
                <span className="text-sm font-medium text-stone-700">Status:</span>
                <div className="flex gap-1">
                  {['active', 'completed'].map(s => (
                    <button key={s} onClick={() => setFilter({ ...filter, status: s })} className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-all ${filter.status === s ? 'bg-emerald-600 text-white shadow-sm' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'}`}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="relative">
                <button onClick={() => setShowNewMenu(!showNewMenu)} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-2xl hover:from-emerald-700 hover:to-teal-700 shadow-sm font-medium">
                  <Plus size={20} />
                  New
                </button>
                {showNewMenu && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-xl border border-stone-200 z-10 overflow-hidden">
                    <button onClick={() => { setShowNoteForm(true); setShowNewMenu(false); }} className="w-full text-left px-4 py-3 hover:bg-emerald-50 text-stone-700 font-medium">New Note</button>
                    <button onClick={() => { setShowTaskForm(true); setShowNewMenu(false); }} className="w-full text-left px-4 py-3 hover:bg-emerald-50 text-stone-700 font-medium">New To-Do</button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-stone-400" size={18} />
            <input
              type="text"
              placeholder="Search notes and tasks... (Ctrl+N for note, Ctrl+T for task)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-stone-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white shadow-sm"
            />
          </div>
        </div>

        {/* Content Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeView === 'tasks' ? (
          <div className="grid grid-cols-2 gap-6">
            {/* Tasks Column */}
            <div>
              <h2 className="text-xl font-bold text-stone-800 mb-4">Tasks ({filteredTasks.length})</h2>
              <div className="space-y-3">
                {filteredTasks.map(t => (
                  <div key={t.id} className="bg-white/90 backdrop-blur-sm p-4 rounded-2xl border border-stone-200 hover:shadow-lg transition-all relative shadow-sm">
                    {(t.dueDate || t.dueTime) && (
                      <div className="absolute top-3 right-3 flex items-center gap-2">
                        {t.dueDate && (
                          <span className="flex items-center gap-1 text-xs font-semibold text-stone-700 bg-amber-100 px-3 py-1.5 rounded-full">
                            <Calendar size={12} />
                            {new Date(t.dueDate).toLocaleDateString()}
                          </span>
                        )}
                        {t.dueTime && (
                          <span className="flex items-center gap-1 text-xs font-semibold text-stone-700 bg-sky-100 px-3 py-1.5 rounded-full">
                            <Clock size={12} />
                            {t.dueTime}
                          </span>
                        )}
                      </div>
                    )}
                    <div className="flex items-start gap-3 pr-24 mb-3">
                      <button onClick={() => toggleTask(t.id)} className="mt-1">
                        {t.completed ? <CheckCircle2 size={20} className="text-emerald-600" /> : <Circle size={20} className="text-stone-400 hover:text-emerald-500" />}
                      </button>
                      <div className="flex-1">
                        <p className={`${t.completed ? 'line-through text-stone-500' : 'text-stone-800'} break-words font-medium`}>{t.text}</p>
                        {t.taskNotes && (
                          <p className="text-xs text-stone-500 mt-1.5 whitespace-pre-wrap bg-stone-50 p-2 rounded-xl border border-stone-100">{t.taskNotes}</p>
                        )}
                        {t.parentNoteId && (
                          <button onClick={() => { const n = notes.find(x => x.id === t.parentNoteId); if (n) { setEditingNote(n); setShowNoteForm(true); } }} className="text-xs text-emerald-600 hover:text-emerald-800 mt-1 font-medium">
                            📝 View source note
                          </button>
                        )}
                        {t.priority && (
                          <div className="mt-2">
                            <span className={`text-xs px-2 py-1 rounded-full font-semibold ${t.priority === 'high' ? 'bg-rose-100 text-rose-700' : t.priority === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                              {t.priority.toUpperCase()}
                            </span>
                          </div>
                        )}
                        {t.tags && t.tags.length > 0 && (
                          <div className="flex gap-1.5 mt-2 flex-wrap">
                            {t.tags.map(tag => (
                              <span key={tag} className={`text-xs px-2 py-1 rounded-full font-medium ${getTagColor(tag)}`}>#{tag}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 absolute bottom-3 right-3 bg-white/90 p-1.5 rounded-xl shadow-sm">
                      <button onClick={() => { setEditingTask(t); setShowTaskForm(true); }} className="text-stone-600 hover:text-emerald-600 p-1 hover:bg-stone-50 rounded-lg transition-colors">
                        <Edit2 size={16} />
                      </button>
                      <button onClick={() => deleteTask(t.id)} className="text-stone-600 hover:text-rose-600 p-1 hover:bg-stone-50 rounded-lg transition-colors">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Notes Column */}
            <div>
              <h2 className="text-xl font-bold text-stone-800 mb-4">Notes ({filteredNotes.length})</h2>
              <div className="space-y-4">
                {filteredNotes.map(n => (
                  <div key={n.id} className="bg-white/90 backdrop-blur-sm p-4 rounded-2xl border border-stone-200 hover:shadow-lg transition-all shadow-sm">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        {n.title && <h3 className="text-base font-bold text-stone-800 mb-2">{n.title}</h3>}
                        <div className="text-sm text-stone-600 whitespace-pre-wrap line-clamp-4" dangerouslySetInnerHTML={{ __html: n.content }} />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => { setEditingNote(n); setShowNoteForm(true); }} className="text-stone-400 hover:text-emerald-600 transition-colors"><Edit2 size={16} /></button>
                        <button onClick={() => archiveNote(n.id)} className="text-stone-400 hover:text-amber-600 transition-colors"><Archive size={16} /></button>
                        <button onClick={() => deleteNote(n.id)} className="text-stone-400 hover:text-rose-600 transition-colors"><Trash2 size={16} /></button>
                      </div>
                    </div>
                    <div className="text-xs text-stone-400 mb-2">
                      {n.updatedAt && n.updatedAt !== n.createdAt ? <>Updated: {new Date(n.updatedAt).toLocaleString()}</> : <>Created: {new Date(n.createdAt || n.updatedAt).toLocaleString()}</>}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(n.tags || []).map(tag => (
                        <span key={tag} className={`text-xs px-2 py-1 rounded-full font-medium ${getTagColor(tag)}`}>#{tag}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          ) : (
            /* Calendar View */
            <CalendarView
              events={calendarEvents}
              calendarList={calendarList}
              selectedCalendars={selectedCalendars}
              offset={calendarWeekOffset}
              mode={calendarMode}
              onPrev={() => setCalendarWeekOffset(calendarWeekOffset - 1)}
              onNext={() => setCalendarWeekOffset(calendarWeekOffset + 1)}
              onToday={() => setCalendarWeekOffset(0)}
              onModeChange={setCalendarMode}
              onCreateEvent={() => setShowEventForm(true)}
              loading={calendarLoading}
              connected={googleConnected}
              getDateRange={getDateRange}
              getWeekStart={getWeekStart}
            />
          )}
        </div>
      </div>

      {/* Modals */}
      {showNoteForm && <NoteForm note={editingNote} onSave={saveNote} onCancel={() => { setShowNoteForm(false); setEditingNote(null); }} />}
      {showTaskForm && <TaskForm task={editingTask} onSave={saveTask} onCancel={() => { setShowTaskForm(false); setEditingTask(null); }} />}
      {showDashboard && <Dashboard tasks={tasks} streak={streak} onClose={() => setShowDashboard(false)} />}
      {showWeeklyReport && <WeeklyReport tasks={tasks} notes={notes} onClose={() => setShowWeeklyReport(false)} />}
      {showArchived && <ArchivedItems notes={notes.filter(n => n.archived)} onUnarchive={unarchiveNote} onDelete={deleteNote} onClose={() => setShowArchived(false)} getTagColor={getTagColor} />}
      {showEventForm && <EventForm calendars={calendarList} onSave={createCalendarEvent} onCancel={() => setShowEventForm(false)} />}
    </div>
  );
}

// ── Note Form Modal ──

function NoteForm({ note, onSave, onCancel }) {
  const [content, setContent] = useState(note?.content || '');
  const [title, setTitle] = useState(note?.title || '');
  const [category, setCategory] = useState(note?.category || 'wrapmate');
  const textareaRef = useRef(null);

  const applyFormat = (fmt) => {
    const ta = textareaRef.current;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const sel = content.substring(start, end);
    let formatted = '';
    let offset = 0;
    switch (fmt) {
      case 'bold': formatted = `<strong>${sel}</strong>`; offset = 8; break;
      case 'italic': formatted = `<em>${sel}</em>`; offset = 4; break;
      case 'underline': formatted = `<u>${sel}</u>`; offset = 3; break;
      case 'strikethrough': formatted = `<s>${sel}</s>`; offset = 3; break;
      case 'bullet': formatted = `<ul><li>${sel}</li></ul>`; offset = 8; break;
    }
    const newContent = content.substring(0, start) + formatted + content.substring(end);
    setContent(newContent);
    setTimeout(() => { ta.focus(); ta.setSelectionRange(start + offset, start + offset + sel.length); }, 0);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-3xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-stone-800">{note ? 'Edit Note' : 'New Note'}</h2>
          <button onClick={onCancel} className="text-stone-400 hover:text-stone-600"><X size={24} /></button>
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium text-stone-700 mb-2">Title</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Enter title..." className="w-full p-3 border border-stone-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium text-stone-700 mb-2">Category</label>
          <div className="flex gap-2">
            {['wrapmate', 'personal'].map(c => (
              <button key={c} onClick={() => setCategory(c)} className={`flex-1 px-4 py-2.5 rounded-2xl font-medium transition-all ${category === c ? 'bg-emerald-600 text-white shadow-sm' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'}`}>
                {c.charAt(0).toUpperCase() + c.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2 mb-2 border-b border-stone-200 pb-2">
          <button onClick={() => applyFormat('bold')} className="p-2 hover:bg-stone-100 rounded-xl"><Bold size={18} /></button>
          <button onClick={() => applyFormat('italic')} className="p-2 hover:bg-stone-100 rounded-xl"><Italic size={18} /></button>
          <button onClick={() => applyFormat('underline')} className="p-2 hover:bg-stone-100 rounded-xl"><Underline size={18} /></button>
          <button onClick={() => applyFormat('strikethrough')} className="p-2 hover:bg-stone-100 rounded-xl"><Strikethrough size={18} /></button>
          <button onClick={() => applyFormat('bullet')} className="p-2 hover:bg-stone-100 rounded-xl"><List size={18} /></button>
        </div>
        <textarea ref={textareaRef} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Write your note... Use #tags and 'ACTION ITEM:' to create tasks" className="w-full h-64 p-3 border border-stone-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none font-mono text-sm" />
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onCancel} className="px-4 py-2 text-stone-700 hover:bg-stone-100 rounded-2xl font-medium">Cancel</button>
          <button onClick={() => onSave({ id: note?.id, title: title || 'Untitled', content, category })} className="px-4 py-2 bg-emerald-600 text-white rounded-2xl hover:bg-emerald-700 font-medium shadow-sm">Save</button>
        </div>
      </div>
    </div>
  );
}

// ── Task Form Modal ──

function TaskForm({ task, onSave, onCancel }) {
  const [text, setText] = useState(task?.text || '');
  const [tags, setTags] = useState(task?.tags?.join(' #') ? '#' + task.tags.join(' #') : '');
  const [priority, setPriority] = useState(task?.priority || null);
  const [category, setCategory] = useState(task?.category || 'wrapmate');
  const [dueDate, setDueDate] = useState(task?.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : '');
  const [dueTime, setDueTime] = useState(task?.dueTime || '');
  const [taskNotes, setTaskNotes] = useState(task?.taskNotes || '');

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-stone-800">{task ? 'Edit Task' : 'New Task'}</h2>
          <button onClick={onCancel} className="text-stone-400 hover:text-stone-600"><X size={24} /></button>
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium text-stone-700 mb-2">Task *</label>
          <input type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder="What needs to be done?" className="w-full p-3 border border-stone-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-2">Due Date</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full p-3 border border-stone-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-2">Time</label>
            <input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} className="w-full p-3 border border-stone-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-2">Category</label>
            <div className="flex gap-2">
              {['wrapmate', 'personal'].map(c => (
                <button key={c} onClick={() => setCategory(c)} className={`flex-1 px-4 py-2 rounded-2xl font-medium transition-all ${category === c ? 'bg-emerald-600 text-white' : 'bg-stone-100 text-stone-700'}`}>
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium text-stone-700 mb-2">Notes</label>
          <textarea value={taskNotes} onChange={(e) => setTaskNotes(e.target.value)} placeholder="Add any relevant details, context, or information..." className="w-full h-24 p-3 border border-stone-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none text-sm" />
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium text-stone-700 mb-2">Tags</label>
          <input type="text" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="#work #urgent" className="w-full p-3 border border-stone-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium text-stone-700 mb-2">Priority</label>
          <div className="flex gap-2">
            {[null, 'high', 'medium', 'low'].map(p => (
              <button key={p || 'auto'} onClick={() => setPriority(p)} className={`px-4 py-2 rounded-2xl font-medium transition-all ${priority === p ? (p === 'high' ? 'bg-rose-500 text-white' : p === 'medium' ? 'bg-amber-500 text-white' : p === 'low' ? 'bg-emerald-500 text-white' : 'bg-stone-800 text-white') : 'bg-stone-100 text-stone-700'}`}>
                {p ? p.charAt(0).toUpperCase() + p.slice(1) : 'Auto'}
              </button>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onCancel} className="px-4 py-2 text-stone-700 hover:bg-stone-100 rounded-2xl font-medium">Cancel</button>
          <button onClick={() => onSave({ id: task?.id, text, tags: tags.match(/#(\w+)/g)?.map(t => t.substring(1).toLowerCase()) || [], priority, category, dueDate: dueDate ? new Date(dueDate).toISOString() : null, dueTime: dueTime || null, taskNotes })} disabled={!text.trim()} className={`px-4 py-2 rounded-2xl font-medium ${text.trim() ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm' : 'bg-stone-300 text-stone-500 cursor-not-allowed'}`}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Dashboard Modal ──

function Dashboard({ tasks, streak, onClose }) {
  const total = tasks.length;
  const completed = tasks.filter(t => t.completed).length;
  const overdue = tasks.filter(t => !t.completed && t.dueDate && new Date(t.dueDate) < new Date()).length;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-3xl max-w-4xl w-full p-6 shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-stone-800">Dashboard</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600"><X size={24} /></button>
        </div>
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-gradient-to-br from-emerald-50 to-teal-50 p-6 rounded-3xl border-2 border-emerald-200">
            <div className="text-sm text-stone-600 mb-1 font-medium">Total Tasks</div>
            <div className="text-4xl font-bold text-emerald-600">{total}</div>
          </div>
          <div className="bg-gradient-to-br from-amber-50 to-orange-50 p-6 rounded-3xl border-2 border-amber-200">
            <div className="text-sm text-stone-600 mb-1 font-medium">Completed</div>
            <div className="text-4xl font-bold text-amber-600">{completed}</div>
          </div>
          <div className="bg-gradient-to-br from-rose-50 to-pink-50 p-6 rounded-3xl border-2 border-rose-200">
            <div className="text-sm text-stone-600 mb-1 font-medium">Overdue</div>
            <div className="text-4xl font-bold text-rose-600">{overdue}</div>
          </div>
          <div className="bg-gradient-to-br from-violet-50 to-purple-50 p-6 rounded-3xl border-2 border-violet-200">
            <div className="text-sm text-stone-600 mb-1 font-medium">Streak</div>
            <div className="text-4xl font-bold text-violet-600 flex items-center gap-2"><Flame size={32} />{streak}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Weekly Report Modal ──

function WeeklyReport({ tasks, notes, onClose }) {
  const [salesInput, setSalesInput] = useState({ closed: '', revenue: '', mtd: '' });
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);

  const weekNotes = notes.filter(n => new Date(n.createdAt) >= weekStart && !n.archived);
  const weekTasks = tasks.filter(t => t.completed && new Date(t.createdAt) >= weekStart);
  const nextWeek = tasks.filter(t => {
    if (!t.dueDate || t.completed) return false;
    const due = new Date(t.dueDate);
    const nextSunday = new Date(weekStart);
    nextSunday.setDate(weekStart.getDate() + 14);
    return due >= now && due < nextSunday;
  });
  const overdue = tasks.filter(t => !t.completed && t.dueDate && new Date(t.dueDate) < now);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-3xl max-w-4xl w-full p-6 max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-stone-800">Weekly Wrap Report</h2>
          <div className="flex gap-2">
            <button onClick={() => {
              const txt = document.getElementById('report-content')?.innerText;
              if (txt) {
                const blob = new Blob([txt], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = 'weekly-report.txt'; a.click();
              }
            }} className="px-4 py-2 bg-emerald-600 text-white rounded-2xl hover:bg-emerald-700 flex items-center gap-2 font-medium shadow-sm">
              <Download size={16} /> Export
            </button>
            <button onClick={onClose} className="text-stone-400 hover:text-stone-600"><X size={24} /></button>
          </div>
        </div>

        <div className="mb-6 bg-stone-50 p-4 rounded-2xl">
          <h3 className="font-semibold text-stone-800 mb-3">Sales Snapshot (Optional)</h3>
          <div className="grid grid-cols-3 gap-3">
            <input type="text" placeholder="Deals closed" value={salesInput.closed} onChange={(e) => setSalesInput({ ...salesInput, closed: e.target.value })} className="p-3 border border-stone-300 rounded-xl text-sm" />
            <input type="text" placeholder="This week revenue" value={salesInput.revenue} onChange={(e) => setSalesInput({ ...salesInput, revenue: e.target.value })} className="p-3 border border-stone-300 rounded-xl text-sm" />
            <input type="text" placeholder="Month-to-date" value={salesInput.mtd} onChange={(e) => setSalesInput({ ...salesInput, mtd: e.target.value })} className="p-3 border border-stone-300 rounded-xl text-sm" />
          </div>
        </div>

        <div id="report-content" className="space-y-6">
          {salesInput.closed && (
            <div>
              <h3 className="font-bold text-stone-800 mb-2 text-lg">📊 Sales Pacing</h3>
              <ul className="list-disc list-inside space-y-1 text-stone-700">
                <li>Deals Closed: {salesInput.closed}</li>
                <li>This Week Revenue: {salesInput.revenue}</li>
                <li>Month-to-Date: {salesInput.mtd}</li>
              </ul>
            </div>
          )}
          <div>
            <h3 className="font-bold text-stone-800 mb-2 text-lg">✅ What Got Done This Week</h3>
            {weekTasks.length === 0 ? <p className="text-stone-500 text-sm">No completed tasks this week</p> : (
              <ul className="list-disc list-inside space-y-1 text-stone-700">
                {weekTasks.map(t => <li key={t.id}>{t.text} {t.tags?.length > 0 && `(${t.tags.map(tag => '#' + tag).join(', ')})`}</li>)}
              </ul>
            )}
          </div>
          <div>
            <h3 className="font-bold text-stone-800 mb-2 text-lg">📝 This Week&apos;s Activity</h3>
            {weekNotes.length === 0 ? <p className="text-stone-500 text-sm">No notes created this week</p> : (
              <ul className="list-disc list-inside space-y-1 text-stone-700">
                {weekNotes.map(n => <li key={n.id}>{n.title || 'Note'} {n.tags?.length > 0 && `(${n.tags.map(tag => '#' + tag).join(', ')})`}</li>)}
              </ul>
            )}
          </div>
          {overdue.length > 0 && (
            <div>
              <h3 className="font-bold text-rose-700 mb-2 text-lg">🚨 Blockers & Overdue</h3>
              <ul className="list-disc list-inside space-y-1 text-stone-700">
                {overdue.map(t => <li key={t.id}>{t.text} - Due: {new Date(t.dueDate).toLocaleDateString()}</li>)}
              </ul>
            </div>
          )}
          <div>
            <h3 className="font-bold text-stone-800 mb-2 text-lg">⏭️ Next Week Focus</h3>
            {nextWeek.length === 0 ? <p className="text-stone-500 text-sm">No upcoming tasks</p> : (
              <ul className="list-disc list-inside space-y-1 text-stone-700">
                {nextWeek.map(t => <li key={t.id}>{t.text} {t.dueDate && `- Due: ${new Date(t.dueDate).toLocaleDateString()}`}</li>)}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Archived Items Modal ──

function ArchivedItems({ notes, onUnarchive, onDelete, onClose, getTagColor }) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[80vh] overflow-hidden flex flex-col shadow-2xl">
        <div className="flex justify-between items-center p-6 border-b border-stone-200">
          <h2 className="text-xl font-bold text-stone-800">Archived Notes</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600"><X size={24} /></button>
        </div>
        <div className="p-6 overflow-y-auto flex-1">
          {notes.length === 0 ? (
            <p className="text-stone-500 text-center py-8">No archived notes</p>
          ) : (
            <div className="space-y-3">
              {notes.map(note => (
                <div key={note.id} className="bg-stone-50 p-4 rounded-2xl border border-stone-200">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      {note.title && <h3 className="font-semibold text-stone-800 mb-2">{note.title}</h3>}
                      <div className="text-sm text-stone-600 whitespace-pre-wrap line-clamp-3" dangerouslySetInnerHTML={{ __html: note.content }} />
                      <div className="text-xs text-stone-400 mt-2">Archived: {new Date(note.updatedAt).toLocaleString()}</div>
                      {note.tags?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {note.tags.map(tag => <span key={tag} className={`text-xs px-2 py-1 rounded-full ${getTagColor(tag)}`}>#{tag}</span>)}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 ml-4">
                      <button onClick={() => onUnarchive(note.id)} className="px-3 py-1 bg-emerald-600 text-white text-sm rounded-xl hover:bg-emerald-700 font-medium">Unarchive</button>
                      <button onClick={() => onDelete(note.id)} className="px-3 py-1 bg-rose-600 text-white text-sm rounded-xl hover:bg-rose-700 font-medium">Delete Forever</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Calendar View (Day / Week / Month) ──

function CalendarView({ events, calendarList, selectedCalendars, offset, mode, onPrev, onNext, onToday, onModeChange, onCreateEvent, loading, connected, getDateRange, getWeekStart }) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [rowHeight, setRowHeight] = useState(48); // px per hour slot, default 48
  const [timeColWidth, setTimeColWidth] = useState(50); // px for time column, default 50

  // Update current time every minute
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  const { start: rangeStart } = getDateRange(offset, mode);
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const hours = Array.from({ length: 18 }, (_, i) => i + 5); // 5 AM to 10 PM
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const getCalendarColor = (event) => {
    if (event.color) return event.color;
    const cal = calendarList.find(c => c.id === event.calendarId);
    return cal?.color || '#4285f4';
  };

  const getEventsForDayHour = (day, hour) => {
    return events.filter(event => {
      if (event.allDay) return false;
      const start = new Date(event.start);
      return start.getDate() === day.getDate() &&
        start.getMonth() === day.getMonth() &&
        start.getFullYear() === day.getFullYear() &&
        start.getHours() === hour;
    });
  };

  const getAllDayEvents = (day) => {
    return events.filter(event => {
      if (!event.allDay) return false;
      const eventDate = new Date(event.start);
      return eventDate.getDate() === day.getDate() &&
        eventDate.getMonth() === day.getMonth() &&
        eventDate.getFullYear() === day.getFullYear();
    });
  };

  const getEventsForDay = (day) => {
    return events.filter(event => {
      const eventDate = new Date(event.start);
      return eventDate.getDate() === day.getDate() &&
        eventDate.getMonth() === day.getMonth() &&
        eventDate.getFullYear() === day.getFullYear();
    });
  };

  const isToday = (day) => day.getTime() === today.getTime();

  // Current time line position
  const getCurrentTimePosition = () => {
    const now = currentTime;
    const hour = now.getHours();
    const minutes = now.getMinutes();
    if (hour < 5 || hour > 22) return null;
    const topPx = ((hour - 5) * rowHeight) + ((minutes / 60) * rowHeight);
    return topPx;
  };

  const isTodayVisible = (days) => {
    return days.some(d => isToday(d));
  };

  if (!connected) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Calendar size={48} className="text-stone-300 mb-4" />
        <h3 className="text-lg font-bold text-stone-700 mb-2">Connect Google Calendar</h3>
        <p className="text-stone-500 mb-4">Link your Google account to see your calendars here.</p>
        <a href="/api/auth/login" className="px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-2xl hover:from-emerald-700 hover:to-teal-700 font-medium shadow-sm">
          Connect Google Calendar
        </a>
      </div>
    );
  }

  // Header with title based on mode
  const getHeaderTitle = () => {
    if (mode === 'day') {
      const d = new Date(today);
      d.setDate(d.getDate() + offset);
      return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    } else if (mode === 'month') {
      const d = new Date(today.getFullYear(), today.getMonth() + offset, 1);
      return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    } else {
      return rangeStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
  };

  // ── MONTH VIEW ──
  if (mode === 'month') {
    const monthStart = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + offset + 1, 0);
    const startDay = monthStart.getDay();
    const totalDays = monthEnd.getDate();

    const weeks = [];
    let currentWeek = [];
    // Fill leading empty days
    for (let i = 0; i < startDay; i++) {
      const d = new Date(monthStart);
      d.setDate(d.getDate() - (startDay - i));
      currentWeek.push({ date: d, inMonth: false });
    }
    for (let d = 1; d <= totalDays; d++) {
      currentWeek.push({ date: new Date(monthStart.getFullYear(), monthStart.getMonth(), d), inMonth: true });
      if (currentWeek.length === 7) { weeks.push(currentWeek); currentWeek = []; }
    }
    // Fill trailing days
    if (currentWeek.length > 0) {
      let nextDay = 1;
      while (currentWeek.length < 7) {
        currentWeek.push({ date: new Date(monthEnd.getFullYear(), monthEnd.getMonth() + 1, nextDay++), inMonth: false });
      }
      weeks.push(currentWeek);
    }

    return (
      <div className="flex flex-col h-full">
        <CalendarHeader title={getHeaderTitle()} onPrev={onPrev} onNext={onNext} onToday={onToday} onCreateEvent={onCreateEvent} mode={mode} onModeChange={onModeChange} loading={loading} rowHeight={rowHeight} onRowHeightChange={setRowHeight} timeColWidth={timeColWidth} onTimeColWidthChange={setTimeColWidth} />
        <div className="flex-1 overflow-auto bg-white rounded-2xl border border-stone-200 shadow-sm">
          <div className="grid grid-cols-7">
            {dayNames.map(d => (
              <div key={d} className="text-center text-xs font-medium text-stone-500 py-2 border-b border-stone-200 bg-stone-50">{d}</div>
            ))}
            {weeks.map((week, wi) => (
              week.map((cell, di) => {
                const dayEvents = getEventsForDay(cell.date);
                const isTodayCell = isToday(cell.date);
                return (
                  <div key={`${wi}-${di}`} className={`min-h-24 border-b border-r border-stone-100 p-1 ${!cell.inMonth ? 'bg-stone-50/50' : ''} ${isTodayCell ? 'bg-emerald-50/50' : ''}`}>
                    <div className={`text-xs font-medium mb-1 ${isTodayCell ? 'text-emerald-600 bg-emerald-100 rounded-full w-6 h-6 flex items-center justify-center' : cell.inMonth ? 'text-stone-700' : 'text-stone-400'}`}>
                      {cell.date.getDate()}
                    </div>
                    <div className="space-y-0.5">
                      {dayEvents.slice(0, 3).map(event => (
                        <div key={event.id} className="text-xs px-1 py-0.5 rounded truncate text-white font-medium" style={{ backgroundColor: getCalendarColor(event) }} title={`${event.title} ${event.allDay ? '' : new Date(event.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}>
                          {event.title}
                        </div>
                      ))}
                      {dayEvents.length > 3 && <div className="text-xs text-stone-500 px-1">+{dayEvents.length - 3} more</div>}
                    </div>
                  </div>
                );
              })
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── DAY & WEEK VIEW ──
  const days = mode === 'day'
    ? [(() => { const d = new Date(today); d.setDate(d.getDate() + offset); return d; })()]
    : Array.from({ length: 7 }, (_, i) => { const d = new Date(rangeStart); d.setDate(rangeStart.getDate() + i); return d; });

  const timePos = getCurrentTimePosition();
  const showTimeLine = isTodayVisible(days);

  return (
    <div className="flex flex-col h-full">
      <CalendarHeader title={getHeaderTitle()} onPrev={onPrev} onNext={onNext} onToday={onToday} onCreateEvent={onCreateEvent} mode={mode} onModeChange={onModeChange} loading={loading} rowHeight={rowHeight} onRowHeightChange={setRowHeight} timeColWidth={timeColWidth} onTimeColWidthChange={setTimeColWidth} />
      <div className="flex-1 overflow-auto bg-white rounded-2xl border border-stone-200 shadow-sm">
        <div className="grid" style={{ gridTemplateColumns: `${timeColWidth}px repeat(${days.length}, 1fr)` }}>
          {/* Day Headers */}
          <div className="sticky top-0 bg-stone-50 border-b border-r border-stone-200 p-2 z-10" style={{ width: `${timeColWidth}px`, minWidth: `${timeColWidth}px` }} />
          {days.map((day, i) => {
            const todayDay = isToday(day);
            return (
              <div key={i} className={`sticky top-0 bg-stone-50 border-b border-r border-stone-200 p-2 text-center z-10 ${todayDay ? 'bg-emerald-50' : ''}`}>
                <div className="text-xs text-stone-500 font-medium">{dayNames[day.getDay()]}</div>
                <div className={`text-lg font-bold ${todayDay ? 'text-emerald-600 bg-emerald-100 rounded-full w-8 h-8 flex items-center justify-center mx-auto' : 'text-stone-800'}`}>
                  {day.getDate()}
                </div>
                {getAllDayEvents(day).map(event => (
                  <div key={event.id} className="text-xs px-1 py-0.5 rounded mt-1 truncate text-white font-medium" style={{ backgroundColor: getCalendarColor(event) }}>
                    {event.title}
                  </div>
                ))}
              </div>
            );
          })}

          {/* Time Slots */}
          {hours.map(hour => (
            <React.Fragment key={hour}>
              <div className="border-b border-r border-stone-100 p-1 text-xs text-stone-400 text-right pr-2 flex items-start justify-end pt-1" style={{ height: `${rowHeight}px`, width: `${timeColWidth}px`, minWidth: `${timeColWidth}px` }}>
                {hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}
              </div>
              {days.map((day, dayIdx) => {
                const dayEvents = getEventsForDayHour(day, hour);
                const todayDay = isToday(day);
                return (
                  <div key={dayIdx} className={`border-b border-r border-stone-100 relative ${todayDay ? 'bg-emerald-50/30' : ''}`} style={{ height: `${rowHeight}px` }}>
                    {/* Current time line */}
                    {showTimeLine && todayDay && timePos !== null && hour === currentTime.getHours() && (
                      <div className="absolute left-0 right-0 z-20 flex items-center" style={{ top: `${(currentTime.getMinutes() / 60) * rowHeight}px` }}>
                        <div className="w-2 h-2 rounded-full bg-rose-500 -ml-1" />
                        <div className="flex-1 h-0.5 bg-rose-500" />
                      </div>
                    )}
                    {dayEvents.map(event => {
                      const start = new Date(event.start);
                      const end = new Date(event.end);
                      const durationMin = (end - start) / 60000;
                      const heightPx = Math.max(20, (durationMin / 60) * rowHeight);
                      const topOffset = (start.getMinutes() / 60) * rowHeight;
                      return (
                        <div
                          key={event.id}
                          className="absolute left-0.5 right-0.5 rounded-lg px-1.5 py-0.5 text-xs text-white overflow-hidden cursor-pointer hover:opacity-90 shadow-sm"
                          style={{
                            backgroundColor: getCalendarColor(event),
                            top: `${topOffset}px`,
                            height: `${heightPx}px`,
                            minHeight: '24px',
                          }}
                          title={`${event.title}\n${start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} - ${end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}
                        >
                          <div className="font-medium truncate">{event.title}</div>
                          <div className="opacity-80 truncate">
                            {start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Calendar Header ──
function CalendarHeader({ title, onPrev, onNext, onToday, onCreateEvent, mode, onModeChange, loading, rowHeight, onRowHeightChange, timeColWidth, onTimeColWidthChange }) {
  return (
    <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-bold text-stone-800">{title}</h2>
        {loading && <Loader2 size={16} className="text-emerald-600 animate-spin" />}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={onPrev} className="p-2 hover:bg-stone-100 rounded-xl"><ChevronLeft size={20} /></button>
        <button onClick={onToday} className="px-4 py-2 bg-stone-100 hover:bg-stone-200 rounded-xl text-sm font-medium text-stone-700">Today</button>
        <button onClick={onNext} className="p-2 hover:bg-stone-100 rounded-xl"><ChevronRight size={20} /></button>

        {/* Mode Toggle */}
        <div className="flex gap-0.5 bg-stone-100 rounded-xl p-0.5 ml-2">
          {['day', 'week', 'month'].map(m => (
            <button key={m} onClick={() => onModeChange(m)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${mode === m ? 'bg-white text-emerald-700 shadow-sm' : 'text-stone-600 hover:text-stone-800'}`}>
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>

        {/* Zoom control */}
        {mode !== 'month' && (
          <div className="flex items-center gap-1 ml-2 bg-stone-100 rounded-xl px-2 py-1">
            <span className="text-xs text-stone-500">Zoom</span>
            <button onClick={() => onRowHeightChange(Math.max(24, rowHeight - 8))} className="p-1 hover:bg-stone-200 rounded text-stone-600 text-xs font-bold">−</button>
            <button onClick={() => onRowHeightChange(Math.min(80, rowHeight + 8))} className="p-1 hover:bg-stone-200 rounded text-stone-600 text-xs font-bold">+</button>
          </div>
        )}

        <button onClick={onCreateEvent} className="ml-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-2xl hover:from-emerald-700 hover:to-teal-700 text-sm font-medium flex items-center gap-2">
          <Plus size={16} /> New Event
        </button>
      </div>
    </div>
  );
}

// ── Event Form Modal ──

function EventForm({ calendars, onSave, onCancel }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [allDay, setAllDay] = useState(false);
  const [calendarId, setCalendarId] = useState(calendars[0]?.id || 'primary');
  const [location, setLocation] = useState('');

  const handleSave = () => {
    if (!title.trim()) return;

    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

    if (allDay) {
      onSave({ title, description, location, allDay: true, startDate, calendarId, timeZone: tz });
    } else {
      const start = new Date(`${startDate}T${startTime}:00`).toISOString();
      const end = new Date(`${startDate}T${endTime}:00`).toISOString();
      onSave({ title, description, location, allDay: false, start, end, calendarId, timeZone: tz });
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-stone-800">New Calendar Event</h2>
          <button onClick={onCancel} className="text-stone-400 hover:text-stone-600"><X size={24} /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-2">Title *</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Event name" className="w-full p-3 border border-stone-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          {calendars.length > 1 && (
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-2">Calendar</label>
              <select value={calendarId} onChange={(e) => setCalendarId(e.target.value)} className="w-full p-3 border border-stone-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500">
                {calendars.map(cal => (
                  <option key={cal.id} value={cal.id}>{cal.name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-2">Date</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full p-3 border border-stone-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div className="flex items-center gap-3">
            <input type="checkbox" id="allDay" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="rounded accent-emerald-600" />
            <label htmlFor="allDay" className="text-sm text-stone-700">All day</label>
          </div>
          {!allDay && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">Start Time</label>
                <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-full p-3 border border-stone-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">End Time</label>
                <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="w-full p-3 border border-stone-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-2">Location</label>
            <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Optional" className="w-full p-3 border border-stone-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-2">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" className="w-full h-20 p-3 border border-stone-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none text-sm" />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onCancel} className="px-4 py-2 text-stone-700 hover:bg-stone-100 rounded-2xl font-medium">Cancel</button>
          <button onClick={handleSave} disabled={!title.trim()} className={`px-4 py-2 rounded-2xl font-medium ${title.trim() ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm' : 'bg-stone-300 text-stone-500 cursor-not-allowed'}`}>
            Create Event
          </button>
        </div>
      </div>
    </div>
  );
}
