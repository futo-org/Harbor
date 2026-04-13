import { createBrowserRouter, RouterProvider } from 'react-router';
import { HomePage } from './components/home/home-page';

function App() {
  const router = createBrowserRouter([
    {
      path: '/',
      element: <HomePage></HomePage>,
    },
  ]);

  return <RouterProvider router={router}></RouterProvider>;
}

export default App;
