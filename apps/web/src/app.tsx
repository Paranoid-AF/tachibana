import { Switch, Route } from 'wouter'

import { AuthGate } from './components/biz/auth-gate'
import { HomePage } from './pages/home'
import { SignInPage } from './pages/sign-in'
import { DevicePage } from './pages/device'
import { LinkDevicePage } from './pages/link-device'
import { LoginPage } from './pages/login'
import { SetupPage } from './pages/setup'
import { SettingsPage } from './pages/settings'
import { AgentsPage } from './pages/agents'

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
