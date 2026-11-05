import { NavLink, Route, Routes } from 'react-router-dom';
import DriverPage from './pages/DriverPage.jsx';
import StudentPage from './pages/StudentPage.jsx';
import AdminPage from './pages/AdminPage.jsx';

export default function App() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <NavLink className="brand" to="/">
          <span className="brand-mark">B</span>
          <span>Buggy<span className="brand-accent">Live</span></span>
        </NavLink>
        <nav aria-label="Main navigation">
          <NavLink to="/" end>Live map</NavLink>
          <NavLink to="/driver">Driver mode</NavLink>
          <NavLink to="/admin">Admin</NavLink>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<StudentPage />} />
          <Route path="/driver" element={<DriverPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </main>
    </div>
  );
}
