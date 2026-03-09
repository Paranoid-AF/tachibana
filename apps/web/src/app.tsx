import { Switch, Route } from 'wouter'

import { HomePage } from './pages/home'
import { SignInPage } from './pages/sign-in'
import { DevicePage } from './pages/device'
import { LinkDevicePage } from './pages/link-device'

export default function App() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/device" component={HomePage} />
      <Route path="/signin" component={SignInPage} />
      <Route path="/link" component={LinkDevicePage} />
      <Route path="/device/:udid" component={DevicePage} />
    </Switch>
  )
}
