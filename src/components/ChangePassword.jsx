import { useState } from 'react'
import { changePassword } from '../utils/api'

export default function ChangePassword({ onClose }) {
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
      await changePassword(currentPw, newPw)
      setSuccess(true)
    } catch (err) {
      setError(err.message || 'Failed to change password')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Change Password</h2>
        {success ? (
          <>
            <p style={{ color: '#22c55e', textAlign: 'center', marginBottom: 20 }}>
              Password updated successfully
            </p>
            <button className="btn-primary" onClick={onClose}>Done</button>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Current Password</label>
              <input
                type="password"
                value={currentPw}
                onChange={e => setCurrentPw(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            <div className="form-group">
              <label>New Password</label>
              <input
                type="password"
                value={newPw}
                onChange={e => setNewPw(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
            <div className="form-group">
              <label>Confirm New Password</label>
              <input
                type="password"
                value={confirmPw}
                onChange={e => setConfirmPw(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
            {error && (
              <p style={{ color: '#ef4444', marginBottom: 12, fontSize: 14 }}>{error}</p>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={onClose}
                style={{ flex: 1 }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={submitting}
                style={{ flex: 1 }}
              >
                {submitting ? 'Saving...' : 'Save Password'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
