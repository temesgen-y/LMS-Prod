'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

type GradingScale = Record<string, { min: number; max: number }>;
type Features = Record<string, boolean>;
type TermDefaults = { terms_per_year: number; default_term_type: string };

type Settings = {
  id: string;
  institution_name: string;
  logo_url: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  grading_scale: GradingScale;
  features: Features;
  term_defaults: TermDefaults;
  updated_at: string;
};

const DEFAULT_GRADING: GradingScale = {
  A: { min: 90, max: 100 },
  B: { min: 80, max: 89 },
  C: { min: 70, max: 79 },
  D: { min: 60, max: 69 },
  F: { min: 0, max: 59 },
};

const DEFAULT_FEATURES: Features = {
  forums: true,
  certificates: true,
  live_sessions: true,
  announcements: true,
  attendance: true,
};

const DEFAULT_TERM_DEFAULTS: TermDefaults = {
  terms_per_year: 2,
  default_term_type: 'semester',
};

export default function InstitutionSettingsPage() {
  const supabase = createClient();

  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentUserId, setCurrentUserId] = useState('');

  // Form state
  const [institutionName, setInstitutionName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [gradingScale, setGradingScale] = useState<GradingScale>(DEFAULT_GRADING);
  const [features, setFeatures] = useState<Features>(DEFAULT_FEATURES);
  const [termDefaults, setTermDefaults] = useState<TermDefaults>(DEFAULT_TERM_DEFAULTS);

  useEffect(() => {
    const init = async () => {
      const { data: authData } = await supabase.auth.getUser();
      if (authData.user) {
        const { data: u } = await supabase.from('users').select('id').eq('auth_user_id', authData.user.id).single();
        if (u) setCurrentUserId(u.id);
      }
      const { data, error } = await supabase.from('institution_settings').select('*').limit(1).single();
      if (error && error.code !== 'PGRST116') { toast.error(error.message); setLoading(false); return; }
      if (data) {
        setSettings(data);
        setInstitutionName(data.institution_name ?? '');
        setLogoUrl(data.logo_url ?? '');
        setAddress(data.address ?? '');
        setPhone(data.phone ?? '');
        setEmail(data.email ?? '');
        setWebsite(data.website ?? '');
        setGradingScale(data.grading_scale ?? DEFAULT_GRADING);
        setFeatures(data.features ?? DEFAULT_FEATURES);
        setTermDefaults(data.term_defaults ?? DEFAULT_TERM_DEFAULTS);
      }
      setLoading(false);
    };
    init();
  }, []);

  const handleSave = async () => {
    if (!institutionName.trim()) { toast.error('Institution name is required'); return; }
    setSaving(true);

    const payload = {
      institution_name: institutionName.trim(),
      logo_url: logoUrl.trim() || null,
      address: address.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      website: website.trim() || null,
      grading_scale: gradingScale,
      features,
      term_defaults: termDefaults,
      updated_by: currentUserId || null,
    };

    if (settings) {
      const { error } = await supabase.from('institution_settings').update(payload).eq('id', settings.id);
      if (error) { toast.error(error.message); setSaving(false); return; }
    } else {
      const { data: newData, error } = await supabase.from('institution_settings').insert(payload).select().single();
      if (error) { toast.error(error.message); setSaving(false); return; }
      setSettings(newData);
    }
    toast.success('Settings saved');
    setSaving(false);
  };

  const updateGradeRow = (letter: string, field: 'min' | 'max', value: number) => {
    setGradingScale(g => ({ ...g, [letter]: { ...g[letter], [field]: value } }));
  };

  if (loading) return <div className="text-center py-16 text-gray-500">Loading…</div>;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Institution Settings</h1>
          <p className="text-sm text-gray-500 mt-0.5">Configure institution-wide settings</p>
        </div>
        <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium disabled:opacity-60 hover:bg-primary/90">
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>

      <div className="space-y-6">
        {/* Basic Info */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Basic Information</h2>
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Institution Name <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={institutionName}
                onChange={e => setInstitutionName(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="e.g. Mule University"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Logo URL</label>
              <input
                type="text"
                value={logoUrl}
                onChange={e => setLogoUrl(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="https://…"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
              <textarea
                rows={2}
                value={address}
                onChange={e => setAddress(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input type="text" value={phone} onChange={e => setPhone(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
              <input type="text" value={website} onChange={e => setWebsite(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="https://…" />
            </div>
          </div>
        </section>

        {/* Grading Scale */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-1">Grading Scale</h2>
          <p className="text-xs text-gray-500 mb-4">Define the score range for each letter grade.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th className="pb-2 pr-4 text-xs text-gray-500 font-semibold">Grade</th>
                  <th className="pb-2 pr-4 text-xs text-gray-500 font-semibold">Min Score</th>
                  <th className="pb-2 text-xs text-gray-500 font-semibold">Max Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {Object.entries(gradingScale).map(([letter, range]) => (
                  <tr key={letter}>
                    <td className="py-2 pr-4">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 font-bold text-sm">{letter}</span>
                    </td>
                    <td className="py-2 pr-4">
                      <input
                        type="number" min={0} max={100}
                        value={range.min}
                        onChange={e => updateGradeRow(letter, 'min', Number(e.target.value))}
                        className="w-20 border border-gray-300 rounded px-2 py-1 text-sm"
                      />
                    </td>
                    <td className="py-2">
                      <input
                        type="number" min={0} max={100}
                        value={range.max}
                        onChange={e => updateGradeRow(letter, 'max', Number(e.target.value))}
                        className="w-20 border border-gray-300 rounded px-2 py-1 text-sm"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Features */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-1">Feature Toggles</h2>
          <p className="text-xs text-gray-500 mb-4">Enable or disable platform-wide features.</p>
          <div className="space-y-3">
            {Object.entries(features).map(([key, enabled]) => (
              <div key={key} className="flex items-center justify-between py-1">
                <div>
                  <div className="text-sm font-medium text-gray-800 capitalize">{key.replace(/_/g, ' ')}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setFeatures(f => ({ ...f, [key]: !enabled }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${enabled ? 'bg-primary' : 'bg-gray-300'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Term Defaults */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Term Defaults</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Terms per Year</label>
              <input
                type="number" min={1} max={4}
                value={termDefaults.terms_per_year}
                onChange={e => setTermDefaults(t => ({ ...t, terms_per_year: Number(e.target.value) }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Default Term Type</label>
              <select
                value={termDefaults.default_term_type}
                onChange={e => setTermDefaults(t => ({ ...t, default_term_type: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="semester">Semester</option>
                <option value="quarter">Quarter</option>
                <option value="trimester">Trimester</option>
              </select>
            </div>
          </div>
        </section>

        {settings && (
          <p className="text-xs text-gray-400 text-right">Last updated: {new Date(settings.updated_at).toLocaleString()}</p>
        )}
      </div>
    </div>
  );
}
