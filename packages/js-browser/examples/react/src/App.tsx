import { createBrowserRouter, RouterProvider } from 'react-router';
import { HomePage } from './components/home/home-page';
import {
  EventDisplayWrapper,
  ProfileWrapper,
  SearchFeedWrapper,
  TopicWrapper,
} from './pages/pages';

function App() {
  const router = createBrowserRouter([
    {
      path: '/',
      element: <HomePage></HomePage>,
    },
    {
      path: '/search',
      element: <SearchFeedWrapper></SearchFeedWrapper>,
    },
    {
      path: '/profile/:profile',
      element: <ProfileWrapper></ProfileWrapper>,
    },
    {
      path: '/topic/:topic',
      element: <TopicWrapper></TopicWrapper>,
    },
    {
      path: '/event/:eventEncoded',
      element: <EventDisplayWrapper></EventDisplayWrapper>,
    },
  ]);

  return <RouterProvider router={router}></RouterProvider>;
}

export default App;
