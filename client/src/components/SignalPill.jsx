export default function SignalPill({ status }) {
  const labels = { live: 'Live', stale: 'Stale', lost: 'Signal lost', waiting: 'Waiting' };
  return <span className={`signal-pill signal-${status}`}><i />{labels[status] || status}</span>;
}
