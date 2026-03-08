import { Switch, Route } from 'wouter'

import { HomePage } from './pages/HomePage'
import { SignInPage } from './pages/SignInPage'
import { DevicePage } from './pages/DevicePage'

export default function App() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/signin" component={SignInPage} />
      <Route path="/device/:udid" component={DevicePage} />
    </Switch>
  )
}
