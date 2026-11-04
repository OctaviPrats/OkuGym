import { useUI } from '../store/useUI.js'
export default function Toast() {
  const msg = useUI(s => s.toastMsg)
  const act = useUI(s => s.toastAct)
  return <div id="toast" className={(msg ? 'show' : '') + (act ? ' act' : '')} role="status">
    <span>{msg}</span>
    {act && msg && <button onClick={() => { useUI.getState().dismissToast(); act.run() }}>{act.label}</button>}
  </div>
}
