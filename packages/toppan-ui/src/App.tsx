import React from 'react'
import { Routes, Route } from 'react-router-dom'
import { FamilyTreeView } from './views/FamilyTree/FamilyTreeView'

function App() {
  return (
    <Routes>
      <Route path="/familyTree/:personId" element={<FamilyTreeView />} />
      <Route path="/" element={<div>Toppan UI Home</div>} />
    </Routes>
  )
}

export default App