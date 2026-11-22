import { InfoTip } from '../common/InfoTip'
import { Switch } from '../common/Switch'

const GUIDED_MODE_HELP =
  'Guided Mode gives you a brief walkthrough the first time a new phase, action, or situation comes up.'

export function GuidedSwitch({ enabled, setEnabled }: { enabled: boolean; setEnabled: (enabled: boolean) => void }) {
  return (
    <div className="setup-setting">
      <Switch checked={enabled} onChange={setEnabled}>
        Guided
      </Switch>
      <InfoTip label="What guided mode does" text={GUIDED_MODE_HELP} />
    </div>
  )
}
