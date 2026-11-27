import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Phone, PhoneOff } from 'lucide-react';
import { api } from '../api/client';
import { CallDurationTimer } from '../components/CallDurationTimer';
import { StatusBadge } from '../components/StatusBadge';
import type { AuthorizedCallerId, CallRecord } from '../types/api';
import { isTerminalCallStatus, isValidE164, normalizeE164Input } from '../utils/formatters';

const DIAL_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '+', '0', '#'];

interface ActiveWebRtcSession {
  mute: (shouldMute: boolean) => void;
  disconnect: () => void;
}

export function DialerPage() {
  const [callerIds, setCallerIds] = useState<AuthorizedCallerId[]>([]);
  const [selectedCallerId, setSelectedCallerId] = useState('');
  const [destination, setDestination] = useState('');
  const [activeCall, setActiveCall] = useState<CallRecord | null>(null);
  const [supportsMute, setSupportsMute] = useState(true);
  const [maxDurationSeconds, setMaxDurationSeconds] = useState<number | null>(null);
  const [webrtcEnabled, setWebrtcEnabled] = useState(false);
  const [webrtcToken, setWebrtcToken] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const webrtcCallRef = useRef<ActiveWebRtcSession | null>(null);

  useEffect(() => {
    Promise.all([
      api.callerIds(),
      api.listCalls({ page: 1, limit: 1 }),
      api.twilioToken().catch(() => ({ webrtcEnabled: false as const })),
    ])
      .then(([cidRes, callsRes, twilioRes]) => {
        setCallerIds(cidRes.callerIds);
        const def = cidRes.callerIds.find((c) => c.isDefault) ?? cidRes.callerIds[0];
        if (def) setSelectedCallerId(def.id);

        const latest = callsRes.items[0];
        if (latest && !isTerminalCallStatus(latest.status)) {
          setActiveCall(latest);
        }

        if (twilioRes.webrtcEnabled && twilioRes.token) {
          setWebrtcEnabled(true);
          setWebrtcToken(twilioRes.token);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load dialer data'));
  }, []);

  useEffect(() => {
    const unsubscribe = api.subscribeCallStream((updatedCall) => {
      setActiveCall((prev) => {
        if (!prev || prev.id !== updatedCall.id) return prev;
        return updatedCall;
      });
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!activeCall || isTerminalCallStatus(activeCall.status)) return;
    const poll = setInterval(() => {
      api
        .getCall(activeCall.id)
        .then((res) => setActiveCall(res.call))
        .catch(() => {});
    }, 1500);
    return () => clearInterval(poll);
  }, [activeCall]);

  const selectedProviderProtocol =
    callerIds.find((c) => c.id === selectedCallerId)?.provider.protocol ?? 'MOCK';

  const handlePlaceCall = async () => {
    setError('');
    if (!selectedCallerId) {
      setError('Select an authorized caller ID first');
      return;
    }
    const normalizedDest = normalizeE164Input(destination);
    if (!isValidE164(normalizedDest)) {
      setError('Enter a valid E.164 number with "+" and country code (e.g. +919876543210 or +12025550144)');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.initiateCall({
        callerIdId: selectedCallerId,
        destinationNumber: normalizedDest,
        transport: webrtcEnabled ? 'WEBRTC' : 'AUTO',
      });
      setDestination(normalizedDest);
      setActiveCall(res.call);
      setSupportsMute(res.supportsMute);
      setMaxDurationSeconds(res.maxDurationSeconds);

      if (res.transport === 'WEBRTC' && webrtcToken) {
        const { Device } = await import('@twilio/voice-sdk');
        const device = new Device(webrtcToken, { logLevel: 1 });
        const voiceCall = await device.connect({
          params: {
            To: normalizedDest,
            From: res.call.callerIdNumber,
            mococallRecordId: res.call.id,
          },
        });
        webrtcCallRef.current = voiceCall;
        voiceCall.on('disconnect', () => {
          webrtcCallRef.current = null;
          device.destroy();
          void api.getCall(res.call.id).then((r) => setActiveCall(r.call)).catch(() => {});
        });
        voiceCall.on('error', (sdkErr) => {
          setError(sdkErr?.message || 'Twilio browser audio error');
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initiate call');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleMute = async () => {
    if (!activeCall) return;
    setError('');
    try {
      const nextMuted = !activeCall.muted;
      if (webrtcCallRef.current) {
        webrtcCallRef.current.mute(nextMuted);
        setActiveCall({ ...activeCall, muted: nextMuted });
        return;
      }
      const res = await api.muteCall(activeCall.id, nextMuted);
      setActiveCall(res.call);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle mute');
    }
  };

  const handleEndCall = async () => {
    if (!activeCall) return;
    setError('');
    try {
      if (webrtcCallRef.current) {
        webrtcCallRef.current.disconnect();
        webrtcCallRef.current = null;
      }
      const res = await api.endCall(activeCall.id);
      setActiveCall(res.call);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to end call');
    }
  };

  const isCallActive = Boolean(activeCall && !isTerminalCallStatus(activeCall.status));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Dialer &amp; Live Call Console</h1>
        <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Select an authorized caller ID, enter an E.164 destination number, and manage active calls.
        </p>
      </div>

      <div className="alert alert-info">
        {selectedProviderProtocol === 'VOIP_REST'
          ? webrtcEnabled
            ? 'Live Twilio Voice Ready (Browser WebRTC Microphone + Real PSTN Call).'
            : 'Live Twilio Voice Ready (Server REST Call — rings destination number directly).'
          : 'Mock Telephony Mode — simulated call lifecycle only (does not ring physical phones).'}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="grid-2">
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label className="field-label" htmlFor="caller-id-select">
              Authorized Caller ID
            </label>
            <select
              id="caller-id-select"
              className="select"
              value={selectedCallerId}
              onChange={(e) => setSelectedCallerId(e.target.value)}
              disabled={isCallActive}
            >
              {callerIds.length === 0 && <option value="">No verified caller IDs available</option>}
              {callerIds.map((cid) => (
                <option key={cid.id} value={cid.id}>
                  {cid.phoneNumber} — {cid.label} ({cid.provider.protocol})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="field-label" htmlFor="destination-input">
              Destination Number (E.164)
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                id="destination-input"
                className="input"
                type="tel"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="+919876543210"
                disabled={isCallActive}
              />
              <button
                type="button"
                className="btn btn-secondary"
                disabled={isCallActive || destination.length === 0}
                onClick={() => setDestination((prev) => prev.slice(0, -1))}
              >
                Del
              </button>
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 6 }}>
              Include <code>+</code> and country code (for example <code>+919876543210</code> or{' '}
              <code>+12025550144</code>).
            </div>
          </div>

          <div className="dialpad-grid">
            {DIAL_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                className="dial-key"
                disabled={isCallActive}
                onClick={() => setDestination((prev) => `${prev}${key}`)}
              >
                {key}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="btn"
            disabled={submitting || isCallActive || !destination || !selectedCallerId}
            onClick={() => void handlePlaceCall()}
          >
            <Phone size={16} /> {submitting ? 'Initiating...' : 'Place Call'}
          </button>
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Active Call Status</h2>

          {!activeCall ? (
            <div style={{ color: 'var(--text-muted)', padding: '24px 0' }}>
              No active call. Enter a destination number and click <strong>Place Call</strong>.
              <p style={{ marginTop: 10, fontSize: '0.84rem' }}>
                In Mock Mode, valid E.164 numbers transition through{' '}
                <code>INITIATED → RINGING → IN_PROGRESS</code>. Select a verified live Twilio
                Caller ID to ring real verified numbers.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Destination</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 700 }}>
                    {activeCall.destinationNumber}
                  </div>
                </div>
                <StatusBadge status={activeCall.status} />
              </div>

              <div className="grid-2" style={{ gap: 10 }}>
                <div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Caller ID</div>
                  <div>{activeCall.callerIdNumber}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Provider Call ID</div>
                  <div style={{ fontFamily: 'monospace', fontSize: '0.84rem' }}>
                    {activeCall.providerCallId ?? '—'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Call Duration</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                    <CallDurationTimer
                      answeredAt={activeCall.answeredAt}
                      durationSeconds={activeCall.durationSeconds}
                      status={activeCall.status}
                    />
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Mode / Limit</div>
                  <div>
                    {activeCall.mode} {maxDurationSeconds ? `• Max ${maxDurationSeconds}s` : ''}
                  </div>
                </div>
              </div>

              {activeCall.terminationReason && (
                <div className="alert alert-info">
                  Outcome: {activeCall.terminationReason}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                {supportsMute && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={!isCallActive}
                    onClick={() => void handleToggleMute()}
                  >
                    {activeCall.muted ? <MicOff size={16} /> : <Mic size={16} />}
                    {activeCall.muted ? 'Unmute' : 'Mute'}
                  </button>
                )}

                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={!isCallActive}
                  onClick={() => void handleEndCall()}
                >
                  <PhoneOff size={16} /> End Call
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
