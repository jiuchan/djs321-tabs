import React from 'react'
import ReactDOM from 'react-dom/client'
import NewTab from './NewTab'
import './NewTab.css'
import { brandName } from '../lib/brand'

document.title = brandName()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <NewTab />
  </React.StrictMode>
)
