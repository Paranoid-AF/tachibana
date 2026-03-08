import { Switch, Route } from 'wouter'

import { HomePage } from './pages/HomePage'
import { SignInPage } from './pages/SignInPage'

export default function App() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/signin" component={SignInPage} />
    </Switch>
  )
}
