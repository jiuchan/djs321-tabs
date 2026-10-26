import React from 'react'
import ReactDOM from 'react-dom/client'
import Options from './Options'
import './Options.css'
import { brandName } from '../lib/brand'

document.title = brandName()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><Options /></React.StrictMode>
)
