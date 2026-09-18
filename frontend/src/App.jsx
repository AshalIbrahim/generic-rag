// import React, { useState } from 'react'
// import { Routes, Route } from 'react-router-dom'
// import Container from '@mui/material/Container'
// import NavBar from './components/NavBar'

// import Listings from './pages/Listings'
// import Locations from './pages/Locations'
// import Predictions from './pages/predictions'
// import ChatBotPage from './pages/ChatBotPage'


// export default function App(){
//   const [filterLocation, setFilterLocation] = useState(null)

//   return (
//     <div>
//       <NavBar />
//       <Container sx={{ mt: 4 }}>
//         <Routes>
//           <Route path="/" element={<Listings filterLocation={filterLocation} />} />
//           <Route path="/locations" element={<Locations onSelectLocation={setFilterLocation} />} />
//           <Route path="/predictions" element={<Predictions />} />
//           <Route path="/chatbot" element={<ChatBotPage />} />
//         </Routes>
//       </Container>
//     </div>
//   )
// }
import React, { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Container from '@mui/material/Container'
import NavBar from './components/NavBar'
import { AuthProvider, useAuth } from './context/AuthContext'

import Dashboard from './pages/Dashboard'
import Listings from './pages/Listings'
import Locations from './pages/Locations'
import ChatBotPage from './pages/ChatBotPage'
//import CompareProperties from './pages/CompareProperties'
import AddListing from './pages/AddListing'
import Login from './pages/Login'
import PropertyDetails from './pages/PropertyDetails'
import Leads from './pages/Leads'
import Sales from './pages/Sales'
import FollowUps from './pages/FollowUps'
import Team from './pages/Team'
import AuditLog from './pages/AuditLog'
import Conversations from './pages/Conversations'


function AppShell(){
  const [filterLocation, setFilterLocation] = useState(null)
  const { user } = useAuth()

  if (!user) {
    return <Login />
  }

  return (
    <div>
      <NavBar />
      <Container sx={{ mt: 4 }}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/listings" element={<Listings filterLocation={filterLocation} />} />
          <Route path="/locations" element={<Locations onSelectLocation={setFilterLocation} />} />
          <Route path="/chatbot" element={<ChatBotPage />} />
          {/* <Route path="/compare" element={<CompareProperties />} /> */}
          <Route path="/add-listing" element={<AddListing />} />
          <Route path="/property/:id" element={<PropertyDetails />} />
          <Route path="/leads" element={<Leads />} />
          <Route path="/sales" element={<Sales />} />
          <Route path="/follow-ups" element={<FollowUps />} />
          <Route path="/team" element={<Team />} />
          <Route path="/audit" element={<AuditLog />} />
          <Route path="/conversations" element={<Conversations />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Container>
    </div>
  )
}

export default function App(){
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  )
}
