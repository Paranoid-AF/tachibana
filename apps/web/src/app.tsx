import { Switch, Route } from 'wouter'

import { AuthGate } from './component/biz/auth-gate'
import { HomePage } from './page/home'
import { SignInPage } from './page/sign-in'
import { DevicePage } from './page/device'
import { LinkDevicePage } from './page/link-device'
import { LoginPage } from './page/login'
import { SetupPage } from './page/setup'
import { SettingsPage } from './page/settings'
import { AgentsPage } from './page/agents'

function ProtectedRoutes() {
  return (
    <AuthGate>
      <Switch>
        <Route path="/" component={HomePage} />
        <Route path="/device" component={HomePage} />
        <Route path="/signin" component={SignInPage} />
        <Route path="/link" component={LinkDevicePage} />
        <Route path="/device/:udid" component={DevicePage} />
        <Route path="/settings" component={SettingsPage} />
        <Route path="/agents" component={AgentsPage} />
      </Switch>
    </AuthGate>
  )
}

export default function App() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/setup" component={SetupPage} />
      <Route component={ProtectedRoutes} />
    </Switch>
  )
}
