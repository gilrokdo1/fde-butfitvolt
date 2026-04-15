import { Routes, Route } from 'react-router-dom';
import MemberTable from './MemberTable';
import Contracts from './Contracts';

export default function ParkMingyu() {
  return (
    <Routes>
      <Route index element={<MemberTable />} />
      <Route path="contracts" element={<Contracts />} />
    </Routes>
  );
}
