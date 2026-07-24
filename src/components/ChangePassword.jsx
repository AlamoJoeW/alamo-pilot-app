import { useState } from 'react'
import { changePassword } from '../utils/api'

// `forced` = the pilot is still on their initial/temporary password and must
// set a new one before using the app: no Cancel button, no dismissing the
// overlay by clicking outside, and the Current Password field is hidden —
// `initialCurrentPassword` (the password they just typed on the login screen,
// kept in memory only) is submitted automatically instead of asking again.
export default function ChangePassword({ onClose, onDone, forced = false, initialCurrentPassword = '' }) {
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (newPw !== confirmPw) { setError('New passwords do not match'); return }
    if (newPw.trim().length < 6) { setError('New password must be at least 6 characters'); return }
    setSubmitting(true)
    try {
      await changePassword(forced ? initialCurrentPassword : currentPw, newPw)
      setSuccess(true)
      if (forced) onDone?.()
    } catch (err) {
      setError(err.message || 'Failed to change password')
    } finally {
      setSubmitting(false)
    }
  }

  function handleDone() {
    if (forced) onDone?.()
    else onClose?.()
  }

  return (
    <div className="modal-overlay" onClick={forced ? undefined : onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>{forced ? 'Set a New Password' : 'Change Password'}</h2>
        {forced && !success && (
          <p style={{ color: '#94a3b8', fontSize: 14, marginBottom: 16 }}>
            You're signing in with a temporary password. Set your own password to continue.
          </p>
        )}
        {success ? (
          <>
            <p style={{ color: '#22c55e', textAlign: 'center', marginBottom: 20 }}>
              Password updated successfully
            </p>
            {!forced && <button className="btn-primary" onClick={handleDone}>Done</button>}
          </>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {!forced && (
              <div className="field-group">
                <label>Current Password</label>
                <input
                  type="password"
                  value={currentPw}
                  onChange={e => setCurrentPw(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>
            )}
            <div className="field-group">
              <label>New Password</label>
              <input
                type="password"
                value={newPw}
                onChange={e => setNewPw(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
            <div className="field-group">
              <label>Confirm New Password</label>
              <input
                type="password"
                value={confirmPw}
                onChange={e => setConfirmPw(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
            {error && <p style={{ color: '#ef4444', marginBottom: 12, fontSize: 14 }}>{error}</p>}
            <div style={{ display: 'flex', gap: 10 }}>
              {!forced && (
                <button type="button" className="btn-secondary" onClick={onClose} style={{ flex: 1 }}>
                  Cancel
                </button>
              )}
              <button type="submit" className="btn-primary" disabled={submitting} style={{ flex: 1 }}>
                {submitting ? 'Saving...' : 'Save Password'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
