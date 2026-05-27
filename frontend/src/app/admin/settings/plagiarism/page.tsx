'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

type Provider = 'native' | 'turnitin';

type PlagiarismSettings = {
  default_provider: Provider;
  native_threshold_low: number;
  native_threshold_high: number;
};

const DEFAULTS: PlagiarismSettings = {
  default_provider: 'native',
  native_threshold_low: 20,
  native_threshold_high: 40,
};

export default function PlagiarismSettingsPage() {
  const [settings, setSettings] = useState<PlagiarismSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [turnitinStatus, setTurnitinStatus] = useState<'unknown' | 'ok' | 'unconfigured' | 'error'>('unknown');
  const [testing, setTesting] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('institution_settings')
      .select('id, features')
      .single();
    if (data) {
      setSettingsId(data.id);
      const f = (data.features ?? {}) as Record<string, unknown>;
      setSettings({
        default_provider: (f.plagiarism_default_provider as Provider) ?? 'native',
        native_threshold_low: (f.plagiarism_threshold_low as number) ?? 20,
        native_threshold_high: (f.plagiarism_threshold_high as number) ?? 40,
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!settingsId) return;
    setSaving(true);
    const supabase = createClient();
    const { data: current } = await supabase
      .from('institution_settings')
      .select('features')
      .eq('id', settingsId)
      .single();
    const merged = {
      ...(current?.features ?? {}),
      plagiarism_default_provider: settings.default_provider,
      plagiarism_threshold_low: settings.native_threshold_low,
      plagiarism_threshold_high: settings.native_threshold_high,
    };
    const { error } = await supabase
      .from('institution_settings')
      .update({ features: merged })
      .eq('id', settingsId);
    setSaving(false);
    if (error) { toast.error('Failed to save: ' + error.message); return; }
    toast.success('Plagiarism settings saved');
  };

  const testTurnitin = async () => {
    setTesting(true);
    try {
      const res = await fetch('/api/plagiarism/turnitin/status');
      const data = await res.json();
      setTurnitinStatus(data.configured ? 'ok' : 'unconfigured');
    } catch {
      setTurnitinStatus('error');
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-[#4c1d95] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Plagiarism Detection Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Configure the default plagiarism provider and detection thresholds.</p>
      </div>

      {/* Default provider */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Default Provider</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(['native', 'turnitin'] as const).map(p => (
            <button
              key={p}
              type="button"
              onClick={() => setSettings(s => ({ ...s, default_provider: p }))}
              className={`flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all ${
                settings.default_provider === p
                  ? 'border-[#4c1d95] bg-purple-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className={`w-4 h-4 rounded-full border-2 mt-0.5 flex items-center justify-center shrink-0 ${settings.default_provider === p ? 'border-[#4c1d95]' : 'border-gray-300'}`}>
                {settings.default_provider === p && <div className="w-2 h-2 rounded-full bg-[#4c1d95]" />}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900 capitalize">{p === 'native' ? 'Native (n-gram)' : 'Turnitin TCA'}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {p === 'native'
                    ? 'Built-in Jaccard similarity — no external service required. Compares submissions within the same assignment.'
                    : 'Turnitin Content Analysis (TCA) API — checks against academic databases, internet, and prior submissions. Requires API credentials.'}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Native thresholds */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Native Similarity Thresholds</h2>
        <p className="text-xs text-gray-500">These thresholds control the colour-coded similarity badges shown to instructors.</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Low threshold (%) — green below this
            </label>
            <input
              type="number"
              min={1}
              max={100}
              value={settings.native_threshold_low}
              onChange={e => setSettings(s => ({ ...s, native_threshold_low: Number(e.target.value) }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4c1d95]/20"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              High threshold (%) — red at or above this
            </label>
            <input
              type="number"
              min={1}
              max={100}
              value={settings.native_threshold_high}
              onChange={e => setSettings(s => ({ ...s, native_threshold_high: Number(e.target.value) }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#4c1d95]/20"
            />
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">0–{settings.native_threshold_low - 1}% Low</span>
          <span className="px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-medium">{settings.native_threshold_low}–{settings.native_threshold_high - 1}% Medium</span>
          <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">{settings.native_threshold_high}%+ High</span>
        </div>
      </div>

      {/* Turnitin connection */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Turnitin Connection</h2>
          <button
            type="button"
            onClick={testTurnitin}
            disabled={testing}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            {testing ? (
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v8H4Z" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            )}
            Test Connection
          </button>
        </div>

        {turnitinStatus !== 'unknown' && (
          <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${
            turnitinStatus === 'ok' ? 'bg-green-50 text-green-700' :
            turnitinStatus === 'unconfigured' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'
          }`}>
            {turnitinStatus === 'ok' && '✓ Turnitin is configured and reachable.'}
            {turnitinStatus === 'unconfigured' && '⚠ Turnitin API credentials are not set on the server.'}
            {turnitinStatus === 'error' && '✕ Could not reach the Turnitin status endpoint.'}
          </div>
        )}

        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-xs text-gray-600 space-y-1">
          <p className="font-semibold text-gray-700 mb-2">Required environment variables (set on the server):</p>
          <code className="block font-mono bg-white border border-gray-200 rounded px-2 py-1">TURNITIN_API_KEY=your-api-key</code>
          <code className="block font-mono bg-white border border-gray-200 rounded px-2 py-1">TURNITIN_BASE_URL=https://your-tenant.turnitin.com</code>
          <code className="block font-mono bg-white border border-gray-200 rounded px-2 py-1">TURNITIN_INTEGRATION_NAME=MuleLMS</code>
          <p className="mt-2 text-gray-500">These are read by the server at runtime and are never exposed to the browser.</p>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2 bg-[#4c1d95] text-white text-sm font-semibold rounded-lg hover:bg-[#3b0764] disabled:opacity-60 transition-colors"
        >
          {saving && (
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v8H4Z" />
            </svg>
          )}
          Save Settings
        </button>
      </div>
    </div>
  );
}
