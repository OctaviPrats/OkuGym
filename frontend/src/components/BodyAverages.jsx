import { avgOver } from '../lib/history.js'
import { fmtNum } from '../lib/format.js'
import { t } from '../lib/i18n.js'

const WINDOWS = [7, 15, 30]

// The body log averaged over the windows people compare (issue #7). A single weigh-in swings
// a kilo on water and salt alone; the average is the number that moves when the trend does.
// `field` is the log's value key (`w` for weigh-ins, `v` for body fat), `suffix` its unit.
export default function BodyAverages({ log, field, suffix }) {
  return <>
    <h4 className="sec" style={{ marginTop: 12 }}>{t('Average')}</h4>
    <div className="avgs">
      {WINDOWS.map(days => {
        const { avg, n } = avgOver(log, field, days)
        return <div key={days} className="avg">
          <div className="l">{t('{0} days', days)}</div>
          <div className="v">{avg == null ? '—' : fmtNum(avg) + suffix}</div>
          <div className="n">{t(n === 1 ? '{0} entry' : '{0} entries', n)}</div>
        </div>
      })}
    </div>
  </>
}
