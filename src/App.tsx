import { Route, Routes } from 'react-router-dom';
import { Navbar } from './components/layout/Navbar';
import { Footer } from './components/layout/Footer';
import { Hero } from './components/sections/Hero';
import { Problem } from './components/sections/Problem';
import { HowItWorks } from './components/sections/HowItWorks';
import { Categories } from './components/sections/Categories';
import { Waitlist } from './components/sections/Waitlist';
import { Local } from './components/sections/Local';
import { CustomerRoutes } from './app/CustomerRoutes';
import { AdminRoutes } from './app/AdminPages';
import { AuthProvider } from './lib/auth';

function Landing() { return <div className="min-h-screen flex flex-col font-sans"><Navbar/><main className="flex-grow"><Hero/><Problem/><HowItWorks/><Categories/><Waitlist/><Local/></main><Footer/></div>; }
function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/admin/*" element={<AdminRoutes />} />
      </Routes>
      <CustomerRoutes />
    </AuthProvider>
  );
}
export default App;