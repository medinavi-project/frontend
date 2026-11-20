import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Chat from './pages/Chat';
import Hospitals from './pages/Hospitals';
import Medication from './pages/Medication';
import NotFound from './pages/NotFound';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="chat" element={<Chat />} />
        <Route path="hospitals" element={<Hospitals />} />
        <Route path="medication" element={<Medication />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
