import { Suspense, lazy } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { StoreProvider } from './lib/store'
import { Shell } from './components/Shell'

// Home and Crisis stay in the initial chunk. Crisis especially: it is the one
// screen that must open instantly on a bad connection, so it never waits on a
// lazy chunk fetch.
import Home from './screens/Home'
import Crisis from './screens/Crisis'

// Everything else is split. Shop Queer alone pulls in Leaflet, which has no
// business loading before someone opens the map.
const ResourceList = lazy(() => import('./screens/ResourceList'))
const ResourceDetail = lazy(() => import('./screens/ResourceDetail'))
const Events = lazy(() => import('./screens/Events'))
const EventDetail = lazy(() => import('./screens/EventDetail'))
const HostProfile = lazy(() => import('./screens/HostProfile'))
const ShopQueer = lazy(() => import('./screens/ShopQueer'))
const BusinessDetail = lazy(() => import('./screens/BusinessDetail'))
const Profile = lazy(() => import('./screens/Profile'))
const SignIn = lazy(() => import('./screens/SignIn'))
const BecomeHost = lazy(() => import('./screens/BecomeHost'))
const UserProfile = lazy(() => import('./screens/UserProfile'))
const EditProfile = lazy(() => import('./screens/UserProfile').then((m) => ({ default: m.EditProfile })))
const Upload = lazy(() => import('./screens/Upload'))
const Feed = lazy(() => import('./screens/Feed'))

export default function App() {
  return (
    <StoreProvider>
      <BrowserRouter>
        <Shell>
          {/* Screens render their own headers, so the fallback is deliberately
              blank rather than a spinner that would flash on every navigation. */}
          <Suspense fallback={<div style={{ minHeight: '60vh' }} />}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/crisis" element={<Crisis />} />
              <Route path="/feed" element={<Feed />} />
              <Route path="/list/:mode" element={<ResourceList />} />
              <Route path="/list/:mode/:selection" element={<ResourceList />} />
              <Route path="/resource/:id" element={<ResourceDetail />} />

              <Route path="/events" element={<Events />} />
              <Route path="/event/:id" element={<EventDetail />} />
              <Route path="/host/:id" element={<HostProfile />} />

              <Route path="/shop" element={<ShopQueer />} />
              <Route path="/business/:id" element={<BusinessDetail />} />

              <Route path="/profile" element={<Profile />} />
              <Route path="/profile/edit" element={<EditProfile />} />
              <Route path="/signin" element={<SignIn />} />
              <Route path="/apply" element={<BecomeHost />} />
              <Route path="/u/:name" element={<UserProfile />} />
              <Route path="/upload" element={<Upload />} />

              <Route path="*" element={<Home />} />
            </Routes>
          </Suspense>
        </Shell>
      </BrowserRouter>
    </StoreProvider>
  )
}
