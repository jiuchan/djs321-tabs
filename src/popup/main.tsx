import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './App.css'
import { brandName } from '../lib/brand'

document.title = brandName()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
