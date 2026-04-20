import { Routes, Route } from 'react-router-dom';
import DoGilrokHome from './Home';
import InstaHashtagPage from './InstaHashtag';

export default function DoGilrok() {
  return (
    <Routes>
      <Route index element={<DoGilrokHome />} />
      <Route path="insta-hashtag" element={<InstaHashtagPage />} />
    </Routes>
  );
}
