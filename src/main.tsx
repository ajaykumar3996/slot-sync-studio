import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

console.log("hello world");

createRoot(document.getElementById("root")!).render(<App />);
